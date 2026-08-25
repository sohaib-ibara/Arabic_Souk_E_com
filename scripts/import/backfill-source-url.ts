import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Backfill `products.source_url` from the original noon capture.
 *
 * The store sources per order — staff buy the item from the supplier once a
 * customer has paid — so every product needs a link back to where it came
 * from. The capture that built the catalogue already recorded one per product;
 * it simply never made it into the live table. This recovers it, so nobody has
 * to re-scrape.
 *
 * Matching mirrors scripts/import/build-imported-data.mjs exactly — same
 * slugify, same 70-character truncation, same collision suffix, same dedupe
 * order — so the slugs computed here are the slugs that generator produced.
 * Anything that still doesn't line up is reported rather than guessed at.
 *
 * Dry run by default; set CONFIRM_BACKFILL=1 to write.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      CAPTURE (default scripts/import/.noon-capture.json),
 *      CONFIRM_BACKFILL (required =1 to write)
 */

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRM = env.CONFIRM_BACKFILL === "1";
const CAPTURE =
  env.CAPTURE ?? new URL("./.noon-capture.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Identical to the generator's, including the 70-char cut. */
const slugify = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "item";

/** Tracking params make the link long and stale; the bare path is stable. */
const cleanUrl = (u: string) => u.split("?")[0];

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Replays the generator's loop to rebuild slug → supplier URL.
 *
 * Order matters: the generator assigns the plain slug to whichever product it
 * meets first and suffixes later collisions, so walking the capture in the same
 * sequence reproduces the same assignment.
 */
function buildSlugMap(capture: any): Map<string, string> {
  const bySlug = new Map<string, string>();
  const seen = new Set<string>();
  const taken: string[] = [];

  for (const entry of capture.products || []) {
    if (entry.blocked || entry.error) continue;
    const flat = (entry.jsonld || []).flat().filter(Boolean);
    const prod = flat.find(
      (x: any) =>
        x["@type"] === "Product" || (Array.isArray(x["@type"]) && x["@type"].includes("Product")),
    );
    if (!prod || !prod.name) continue;

    const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
    const url = offer?.url || entry.sourceUrl || "";
    if (!url) continue;

    const skuMatch = url.match(/\/([A-Z0-9]+)\/p\//i);
    const sku = (skuMatch ? skuMatch[1] : slugify(prod.name)).toUpperCase();
    if (seen.has(sku)) continue;
    seen.add(sku);

    let slug = slugify(prod.name);
    if (taken.includes(slug)) slug = `${slug}-${sku.toLowerCase().slice(0, 6)}`;
    taken.push(slug);

    bySlug.set(slug, cleanUrl(entry.sourceUrl || url));
  }
  return bySlug;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const capture = JSON.parse(readFileSync(CAPTURE, "utf8"));
  const bySlug = buildSlugMap(capture);
  console.log(`Capture: ${capture.products?.length ?? 0} records → ${bySlug.size} usable URLs`);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("products")
    .select("id,slug,name,source_url")
    .order("slug");
  if (error) {
    console.error(`Could not read products: ${error.message}`);
    process.exit(1);
  }
  const products = (data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    source_url: string | null;
  }>;
  console.log(`Live catalogue: ${products.length} products\n`);

  const updates: Array<{ id: string; slug: string; url: string }> = [];
  const unchanged: string[] = [];
  const unmatched: string[] = [];

  for (const p of products) {
    // Exact first, then the generator's 70-char truncation, then the collision
    // suffix (which is the first 6 characters of the supplier's product code).
    let url = bySlug.get(p.slug);
    if (!url) {
      for (const [slug, u] of bySlug) {
        if (slug.startsWith(p.slug) || p.slug.startsWith(slug)) {
          url = u;
          break;
        }
      }
    }
    if (!url) {
      unmatched.push(p.slug);
      continue;
    }
    if (p.source_url === url) unchanged.push(p.slug);
    else updates.push({ id: p.id, slug: p.slug, url });
  }

  console.log(`Will set      : ${updates.length}`);
  console.log(`Already correct: ${unchanged.length}`);
  console.log(`No URL found  : ${unmatched.length}`);
  if (unmatched.length) {
    console.log("\nUnmatched (need a URL pasted in by hand from the admin):");
    for (const s of unmatched) console.log(`  ${s}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run — set CONFIRM_BACKFILL=1 to write.");
    return;
  }
  if (!updates.length) {
    console.log("\nNothing to write.");
    return;
  }

  let written = 0;
  for (const u of updates) {
    const { error: upErr } = await sb
      .from("products")
      .update({ source_url: u.url })
      .eq("id", u.id);
    if (upErr) console.error(`  ${u.slug}: ${upErr.message}`);
    else written++;
  }
  console.log(`\nWrote ${written} of ${updates.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
