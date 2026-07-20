import { writeFileSync } from "node:fs";
import { sampleBrands, sampleCategories, sampleProducts } from "../src/lib/sample-data.ts";

/**
 * Generates supabase/seed.sql from the bundled sample catalogue so the database
 * seed and the in-app demo data can never drift apart.
 *
 * Run:  node scripts/gen-seed.ts   (Node 22+ strips the TS types natively)
 */

const esc = (s: string | null | undefined) =>
  s == null ? "null" : `'${s.replace(/'/g, "''")}'`;

// Postgres text[] literal, e.g. '{"a","b"}'
const textArray = (a: string[]) =>
  `'{${a.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}'`;

// jsonb literal
const jsonb = (a: string[]) => `'${JSON.stringify(a).replace(/'/g, "''")}'::jsonb`;

let out = "";
out += "-- ============================================================================\n";
out += "-- Seed data for the Arabic Souk beauty store\n";
out += "-- GENERATED from src/lib/sample-data.ts by scripts/gen-seed.ts — do not edit by hand.\n";
out += "-- Safe to re-run: every insert upserts on the unique slug.\n";
out += "-- ============================================================================\n\n";

out += "insert into public.categories (name, slug, description, image_url, sort_order) values\n";
out += sampleCategories
  .map(
    (c) =>
      `  (${esc(c.name)}, ${esc(c.slug)}, ${esc(c.description)}, ${esc(c.image_url)}, ${c.sort_order})`,
  )
  .join(",\n");
out +=
  "\non conflict (slug) do update set\n" +
  "  name = excluded.name, description = excluded.description,\n" +
  "  image_url = excluded.image_url, sort_order = excluded.sort_order;\n\n";

out += "insert into public.brands (name, slug, logo_url) values\n";
out += sampleBrands
  .map((b) => `  (${esc(b.name)}, ${esc(b.slug)}, ${esc(b.logo_url)})`)
  .join(",\n");
out += "\non conflict (slug) do update set name = excluded.name, logo_url = excluded.logo_url;\n\n";

out +=
  "insert into public.products\n" +
  "  (name, slug, description, short_description, price, compare_at_price, currency,\n" +
  "   images, category_id, brand_id, rating, review_count, stock_quantity, in_stock,\n" +
  "   is_featured, is_new, tags)\nvalues\n";
out += sampleProducts
  .map((p) => {
    const cat = `(select id from public.categories where slug = ${esc(p.category_slug)})`;
    const brand = p.brand_slug
      ? `(select id from public.brands where slug = ${esc(p.brand_slug)})`
      : "null";
    return (
      `  (${esc(p.name)}, ${esc(p.slug)}, ${esc(p.description)}, ${esc(p.short_description)}, ` +
      `${p.price}, ${p.compare_at_price ?? "null"}, ${esc(p.currency)}, ${jsonb(p.images)}, ` +
      `${cat}, ${brand}, ${p.rating}, ${p.review_count}, ${p.stock_quantity}, ${p.in_stock}, ` +
      `${p.is_featured}, ${p.is_new}, ${textArray(p.tags)})`
    );
  })
  .join(",\n");
out +=
  "\non conflict (slug) do update set\n" +
  "  name = excluded.name, description = excluded.description,\n" +
  "  short_description = excluded.short_description, price = excluded.price,\n" +
  "  compare_at_price = excluded.compare_at_price, images = excluded.images,\n" +
  "  category_id = excluded.category_id, brand_id = excluded.brand_id,\n" +
  "  rating = excluded.rating, review_count = excluded.review_count,\n" +
  "  stock_quantity = excluded.stock_quantity, in_stock = excluded.in_stock,\n" +
  "  is_featured = excluded.is_featured, is_new = excluded.is_new, tags = excluded.tags;\n";

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), out, "utf8");
console.log(`Wrote supabase/seed.sql — ${sampleProducts.length} products, ${sampleCategories.length} categories, ${sampleBrands.length} brands.`);
