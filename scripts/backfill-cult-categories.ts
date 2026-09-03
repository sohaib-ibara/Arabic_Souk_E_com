/**
 * Give the Cult Beauty products already in the catalogue a category.
 *
 * 243 of the 246 arrived with none, and it was never a mapping problem. Cult's
 * product pages do not state a category — its breadcrumb is the brand path —
 * so the importer relies on a product-to-shelf map built by walking the
 * category pages. That map is written to scripts/import/.cultbeauty-categories
 * .json, everything matching `scripts/import/.*.json` is gitignored as raw
 * supplier material, and the daily sync runs in GitHub Actions from a fresh
 * checkout. So the cloud run had no map at all and staged every product with a
 * null category, which the sync reported honestly as `no_category_map` on every
 * run since it was switched from refresh-only to adopting new products.
 *
 * The workflow now rebuilds the map before each sync, which fixes everything
 * from tonight onwards. This is the one-off for what has already landed: it
 * reads the same map and writes the category straight onto the products, with
 * no network calls and no re-import.
 *
 *   node --env-file=.env.local scripts/backfill-cult-categories.ts
 *   node --env-file=.env.local scripts/backfill-cult-categories.ts --apply
 *
 * Nothing here changes what a shopper sees on its own. `products.is_listed` is
 * recomputed by trigger, so a product whose category is switched off stays
 * hidden — this only stops it being invisible for want of any category at all.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveCategorySlug } from "../src/lib/category-aliases.ts";

const APPLY = process.argv.includes("--apply");
const MAP_PATH = "scripts/import/.cultbeauty-categories.json";

/**
 * Four products whose shelf is `personal-care`, which spans two of our aisles.
 *
 * The alias table deliberately refuses shelves like this — putting toothpaste
 * and deodorant in one bucket because the supplier does is how a serum ends up
 * in the lipstick aisle. Named individually instead, which is honest about
 * being a hand decision about four products rather than a rule.
 */
const BY_NAME: Array<[RegExp, string]> = [
  [/mouthwash|toothpaste|toothbrush/i, "oral-hygiene"],
  [/deodorant/i, "deodorants-antiperspirants"],
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).");
  process.exitCode = 2;
} else {
  await main(url, key);
}

async function main(url: string, key: string) {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let raw: { products: Record<string, { slug: string; name: string }> };
  try {
    raw = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  } catch {
    console.error(
      `Could not read ${MAP_PATH}.\n` +
        "Build it first:  SITE=cultbeauty node scripts/import/map-categories.mjs",
    );
    process.exitCode = 2;
    return;
  }
  const map = new Map(Object.entries(raw.products));

  const { data: cats, error: catError } = await sb.from("categories").select("id, slug, name, is_enabled");
  if (catError) throw new Error(catError.message);
  const idBySlug = new Map((cats ?? []).map((c) => [c.slug as string, c.id as string]));
  const nameBySlug = new Map((cats ?? []).map((c) => [c.slug as string, c.name as string]));
  const enabled = new Set((cats ?? []).filter((c) => c.is_enabled !== false).map((c) => c.slug as string));
  const known = new Set(idBySlug.keys());

  const { data: products, error } = await sb
    .from("products")
    .select("id, name, source_sku, source_url")
    .eq("source", "cultbeauty")
    .is("category_id", null);
  if (error) throw new Error(error.message);

  console.log(`${products?.length ?? 0} Cult Beauty products have no category.`);
  console.log(`Map holds ${map.size} products, built ${raw ? (JSON.parse(readFileSync(MAP_PATH, "utf8")).builtAt ?? "unknown") : "?"}.\n`);

  const plan = new Map<string, Array<{ id: string; name: string }>>();
  const stuck: Array<{ name: string; shelf: string | null }> = [];

  for (const p of products ?? []) {
    const target = decide(p, map, known);
    if (!target) {
      const entry = lookup(p, map);
      stuck.push({ name: p.name as string, shelf: entry?.slug ?? null });
      continue;
    }
    if (!plan.has(target)) plan.set(target, []);
    plan.get(target)!.push({ id: p.id as string, name: p.name as string });
  }

  const rows = [...plan.entries()].sort((a, b) => b[1].length - a[1].length);
  let willShow = 0;
  let willStayHidden = 0;

  for (const [slug, items] of rows) {
    const on = enabled.has(slug);
    if (on) willShow += items.length;
    else willStayHidden += items.length;
    console.log(
      `${String(items.length).padStart(4)}  ${slug.padEnd(30)} ${(nameBySlug.get(slug) ?? "").padEnd(26)} ${on ? "" : "(category is switched OFF)"}`,
    );
    for (const it of items.slice(0, 2)) console.log(`        e.g. ${it.name.slice(0, 64)}`);
  }

  console.log(`\n${willShow} would sit in a category that is on, ${willStayHidden} in one switched off.`);
  console.log(`${stuck.length} could not be resolved and stay for a human.`);
  const shelves = new Map<string, number>();
  for (const s of stuck) shelves.set(s.shelf ?? "(not in the map)", (shelves.get(s.shelf ?? "(not in the map)") ?? 0) + 1);
  for (const [shelf, n] of [...shelves.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${shelf}`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to write it.");
    return;
  }

  let written = 0;
  for (const [slug, items] of rows) {
    const categoryId = idBySlug.get(slug);
    if (!categoryId) continue;
    const ids = items.map((i) => i.id);
    // In batches: one statement per category, chunked so a very large aisle
    // cannot build a URL longer than PostgREST will accept.
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error: upError } = await sb.from("products").update({ category_id: categoryId }).in("id", chunk);
      if (upError) throw new Error(`${slug}: ${upError.message}`);
      written += chunk.length;
    }
  }
  console.log(`\nWrote a category to ${written} products. is_listed is recomputed by trigger.`);
}

/** The map entry for a product, by the id in its URL first, then its sku. */
function lookup(
  p: { source_sku: unknown; source_url: unknown },
  map: Map<string, { slug: string; name: string }>,
) {
  const ids = String(p.source_url ?? "").match(/(\d{6,})/g);
  const fromUrl = ids ? ids[ids.length - 1] : null;
  return (fromUrl ? map.get(fromUrl) : undefined) ?? map.get(String(p.source_sku)) ?? null;
}

function decide(
  p: { name: unknown; source_sku: unknown; source_url: unknown },
  map: Map<string, { slug: string; name: string }>,
  known: Set<string>,
): string | null {
  const entry = lookup(p, map);

  // The four hand decisions come first: their shelf resolves to nothing, and
  // waiting for the shelf lookup to fail before checking would read as if the
  // name were a fallback rather than the deliberate override it is.
  if (entry?.slug === "personal-care") {
    for (const [pattern, slug] of BY_NAME) {
      if (pattern.test(String(p.name)) && known.has(slug)) return slug;
    }
  }

  if (!entry) return null;
  return resolveCategorySlug("cultbeauty", entry.slug, known);
}
