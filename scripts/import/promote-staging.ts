import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Promote APPROVED staging rows → live `products` (feature/noon-import).
 *
 * ⚠️  RIGHTS GATE — this publishes to the live storefront.
 * Only rows you have marked status='approved' in staging_products are promoted,
 * and only when CONFIRM_PUBLISH=1. Approve a row ONLY if you have the right to
 * use its images and copy on a commercial store. Prices from noon Saudi are in
 * SAR — set PRICE_CONVERSION_RATE (SAR→BHD ≈ 0.1) or fix prices afterwards.
 * Promoted products start with stock_quantity=0 (out of stock until you set it).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      PRICE_CONVERSION_RATE (default 1), CONFIRM_PUBLISH (required =1)
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
const RATE = Number(env.PRICE_CONVERSION_RATE || 1);
const CONFIRM = env.CONFIRM_PUBLISH === "1";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) ||
  "product";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function findBrandId(sb: SupabaseClient, name: string | null): Promise<string | null> {
  if (!name) return null;
  const slug = slugify(name);
  const { data } = await sb
    .from("brands")
    .upsert({ name, slug }, { onConflict: "slug" })
    .select("id")
    .single();
  return (data as any)?.id ?? null;
}

async function findCategoryId(sb: SupabaseClient, slug: string | null): Promise<string | null> {
  if (!slug || slug === "other") return null;
  const { data } = await sb.from("categories").select("id").eq("slug", slug).maybeSingle();
  return (data as any)?.id ?? null;
}

/**
 * The slug for a promotion, which must be stable across re-promotes.
 *
 * A product already in the catalogue keeps the slug it has. That matters more
 * than it looks: the slug is the public URL, so recomputing it whenever a price
 * changed would break every indexed link and every bookmark. Only a genuinely
 * new product gets a fresh slug, and only then does a collision need suffixing.
 */
async function resolveSlug(
  sb: SupabaseClient,
  name: string,
  stagingId: string,
  existingSlug: string | null,
): Promise<string> {
  if (existingSlug) return existingSlug;
  const base = slugify(name);
  const { data: taken } = await sb.from("products").select("id").eq("slug", base).maybeSingle();
  return taken ? `${base}-${stagingId.slice(0, 6)}` : base;
}

/** The live row for this supplier product, if we already carry it. */
async function findExisting(
  sb: SupabaseClient,
  source: string | null,
  sourceSku: string | null,
): Promise<{ slug: string; is_published: boolean } | null> {
  if (!source || !sourceSku) return null;
  const { data } = await sb
    .from("products")
    .select("slug,is_published")
    .eq("source", source)
    .eq("source_sku", sourceSku)
    .maybeSingle();
  return (data as any) ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  if (!CONFIRM) {
    console.error(
      "Refusing to publish. Set CONFIRM_PUBLISH=1 (and only approve rows you have the right to use).",
    );
    process.exit(2);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (RATE === 1) {
    console.warn(
      "⚠ PRICE_CONVERSION_RATE=1 — prices copied as-is. If source is SAR, set e.g. 0.1 for BHD, or fix prices after.",
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("staging_products")
    .select("*")
    .eq("status", "approved");
  if (error) throw error;
  if (!rows?.length) {
    console.log("No approved rows to promote.");
    return;
  }

  let ok = 0;
  for (const r of rows as Array<Record<string, unknown>>) {
    try {
      const name = String(r.name ?? "").trim();
      if (!name) throw new Error("missing name");
      const brandId = await findBrandId(sb, (r.brand as string) ?? null);
      const categoryId = await findCategoryId(sb, (r.category as string) ?? null);
      const source = (r.source as string) ?? null;
      const sourceSku = (r.source_sku as string) ?? null;
      const existing = await findExisting(sb, source, sourceSku);
      const slug = await resolveSlug(sb, name, String(r.id), existing?.slug ?? null);
      const rawPrice = Number(r.price ?? 0);
      const price = Math.round(rawPrice * RATE * 1000) / 1000;

      /*
        Upsert on (source, source_sku), not insert.

        Two reasons. Re-promoting a product whose price changed should update
        the row rather than fail on the slug or create a second listing of the
        same item. And carrying source/source_sku/source_url across is what
        makes the live row traceable to its supplier at all — without them a
        promoted product arrives anonymous, which is exactly the gap
        backfill-source-url.ts had to be written to repair.
      */
      const identified = Boolean(source && sourceSku);
      const row = {
        name,
        slug,
        description: r.description ?? null,
        short_description: r.short_description ?? null,
        price,
        currency: RATE === 1 ? (r.currency ?? "BHD") : "BHD",
        images: r.images ?? [],
        category_id: categoryId,
        brand_id: brandId,
        rating: r.rating ?? 0,
        review_count: r.review_count ?? 0,
        stock_quantity: 0, // out of stock until you set real inventory
        in_stock: r.in_stock ?? true,
        is_featured: false,
        is_new: true,
        tags: [],
        source,
        source_sku: sourceSku,
        source_url: (r.source_url as string) ?? null,
        supplier_dispatch_note: (r.supplier_dispatch_note as string) ?? null,
        lead_days_min: (r.lead_days_min as number) ?? null,
        lead_days_max: (r.lead_days_max as number) ?? null,
        max_per_order: (r.max_per_order as number) ?? null,
        /*
          New products arrive hidden; an existing one keeps whatever the admin
          set.

          The client curates — some noon lines, some Cult Beauty ones — so
          promoting straight onto the shelf would make curation a matter of
          removing things afterwards, with whatever was briefly visible already
          indexed. Listing is a deliberate second step in the admin.

          Carrying the existing value matters just as much: this upsert also
          runs when a price changes, and sending `false` unconditionally would
          quietly pull a product the admin had chosen to list.
        */
        is_published: existing ? existing.is_published : false,
      };

      const { error: insErr } = identified
        ? await sb.from("products").upsert(row, { onConflict: "source,source_sku" })
        : await sb.from("products").insert(row);
      if (insErr) throw insErr;

      await sb
        .from("staging_products")
        .update({ status: "promoted", promoted_at: new Date().toISOString() })
        .eq("id", r.id as string);
      ok++;
      console.log(`  ✓ ${name} → /product/${slug}`);
    } catch (e) {
      console.log(`  ✗ ${(r.name as string) ?? r.id} — ${(e as Error).message}`);
    }
  }
  console.log(`\nPromoted ${ok}/${rows.length}. Remember: promoted products have stock_quantity=0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
