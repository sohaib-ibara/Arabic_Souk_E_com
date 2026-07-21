/**
 * Turn a local noon capture (scripts/import/.noon-capture.json) into a
 * storefront data module (src/lib/imported-data.ts) — NO API KEYS, NO DB.
 *
 * Parsing is deterministic: every noon product page embeds a JSON-LD Product
 * block (name, brand, price, images, description, rating). We read that, map the
 * breadcrumb to our category taxonomy, convert SAR→BHD, and emit typed arrays.
 *
 * ⚠️  The emitted images/copy are noon's / the brands'. This file is for a demo;
 * replace with rights-cleared assets before a real go-live. See docs/NOON_IMPORT.md.
 *
 *   node scripts/import/build-imported-data.mjs
 *
 * Env: IN (capture path), OUT (ts path), SAR_TO_BHD (default 0.1), MAX_IMAGES (4)
 */
import { readFileSync, writeFileSync } from "node:fs";

const IN = process.env.IN || "scripts/import/.noon-capture.json";
const OUT = process.env.OUT || "src/lib/imported-data.ts";
const OUT_SQL = process.env.OUT_SQL || "supabase/seed-noon.sql";
const SAR_TO_BHD = Number(process.env.SAR_TO_BHD || 0.1); // ≈ 0.1003; BHD has 3 decimals
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 4);

// Preferred order for noon's top beauty departments in the nav.
const DEPT_ORDER = ["Makeup", "Skin Care", "Hair Care", "Fragrance", "Personal Care"];

const decode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "item";

// Mirror noon's own taxonomy: department = first node under "Beauty & Fragrance"
// (Makeup, Skin Care, Hair Care, Fragrance, Personal Care); category = the node
// below that (Nail Makeup, Cleansers, Styling Tools, Oral Hygiene, …). Falls back
// to the department when a product has no deeper breadcrumb.
const KNOWN_DEPTS = new Set(DEPT_ORDER);
function categoryFromBreadcrumb(crumbs) {
  const path = crumbs.filter((c) => !/^home$/i.test(c) && !/^beauty\s*&\s*fragrance$/i.test(c));
  let department = decode(path[0] || "Beauty");
  const sub = decode(path[1] || path[0] || "Beauty");
  // Some products are cross-listed outside beauty (e.g. "Home & Kitchen > Bath").
  // Fold any non-beauty department into Personal Care so the nav stays coherent.
  if (!KNOWN_DEPTS.has(department)) department = "Personal Care";
  return {
    department,
    departmentSlug: slugify(department),
    subName: sub,
    subSlug: slugify(sub),
  };
}

function firstSentence(text, max = 140) {
  const t = decode(text);
  if (!t) return null;
  const clean = t.replace(/^about the product:?\s*/i, "");
  const cut = clean.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  return (dot > 40 ? cut.slice(0, dot + 1) : cut).trim() + (clean.length > max && dot <= 40 ? "…" : "");
}

const raw = JSON.parse(readFileSync(IN, "utf8"));
const seen = new Set();
const products = [];
const brandMap = new Map();

for (const entry of raw.products || []) {
  if (entry.blocked || entry.error) continue;
  const flat = (entry.jsonld || []).flat().filter(Boolean);
  const prod = flat.find(
    (x) => x["@type"] === "Product" || (Array.isArray(x["@type"]) && x["@type"].includes("Product")),
  );
  if (!prod || !prod.name) continue;

  const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
  const url = offer?.url || entry.sourceUrl || "";
  const skuMatch = url.match(/\/([A-Z0-9]+)\/p\//i);
  const sku = (skuMatch ? skuMatch[1] : slugify(prod.name)).toUpperCase();
  if (seen.has(sku)) continue;
  seen.add(sku);

  const bc = flat.find((x) => x["@type"] === "BreadcrumbList");
  const crumbs = (bc?.itemListElement || []).map((i) => i.name || i.item?.name || "").filter(Boolean);
  const cat = categoryFromBreadcrumb(crumbs);

  const brandName = decode(prod.brand?.name || prod.brand || "") || null;
  const brand_slug = brandName ? slugify(brandName) : null;
  if (brandName && !brandMap.has(brand_slug)) {
    brandMap.set(brand_slug, { id: `brand-${brand_slug}`, name: brandName, slug: brand_slug, logo_url: null });
  }

  const priceSar = Number(offer?.price ?? 0);
  const price = Math.round(priceSar * SAR_TO_BHD * 1000) / 1000;

  const images = (Array.isArray(prod.image) ? prod.image : prod.image ? [prod.image] : [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_IMAGES);

  const rating = Number(prod.aggregateRating?.ratingValue ?? 0) || 0;
  const review_count = Number(prod.aggregateRating?.reviewCount ?? prod.aggregateRating?.ratingCount ?? 0) || 0;

  let slug = slugify(prod.name);
  if (products.some((p) => p.slug === slug)) slug = `${slug}-${sku.toLowerCase().slice(0, 6)}`;

  const tags = Array.from(
    new Set(crumbs.slice(2).flatMap((c) => slugify(c).split("-")).filter((w) => w.length > 2)),
  ).slice(0, 6);

  products.push({
    id: `noon-${sku}`,
    name: decode(prod.name),
    slug,
    description: decode(prod.description) || null,
    short_description: firstSentence(prod.description),
    price,
    compare_at_price: null,
    currency: "BHD",
    images,
    category_slug: cat.subSlug,
    category_name: cat.subName,
    // department is carried for grouping the nav; not part of the DB Product row.
    _department: cat.department,
    _departmentSlug: cat.departmentSlug,
    brand_slug: brand_slug,
    brand_name: brandName,
    rating,
    review_count,
    // Demo behaviour (unchanged): listed for sale but zero real inventory, so
    // checkout reports out of stock. Set real quantities to enable purchase.
    stock_quantity: 0,
    in_stock: true,
    is_featured: false,
    is_new: true,
    tags,
  });
}

// Feature the four highest-rated so the homepage has hero items.
[...products]
  .sort((a, b) => b.rating - a.rating || b.review_count - a.review_count)
  .slice(0, 4)
  .forEach((p) => (p.is_featured = true));

const brands = [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name));

// ---- Derive categories (noon subcategory level) + department nav grouping ----
const deptRank = (d) => {
  const i = DEPT_ORDER.indexOf(d);
  return i === -1 ? DEPT_ORDER.length : i;
};

const catMap = new Map(); // subSlug -> aggregate
for (const p of products) {
  let c = catMap.get(p.category_slug);
  if (!c) {
    c = {
      name: p.category_name,
      slug: p.category_slug,
      department: p._department,
      departmentSlug: p._departmentSlug,
      image: null,
    };
    catMap.set(p.category_slug, c);
  }
  if (!c.image && p.images[0]) c.image = p.images[0]; // use a product shot as the tile image
}

const sortedCats = [...catMap.values()].sort(
  (a, b) => deptRank(a.department) - deptRank(b.department) || a.name.localeCompare(b.name),
);

const categories = sortedCats.map((c, i) => ({
  id: `cat-${c.slug}`,
  name: c.name,
  slug: c.slug,
  description: null,
  image_url: c.image,
  sort_order: i + 1,
}));

// Nav: department → its subcategories, ordered by DEPT_ORDER then name.
const navMap = new Map();
for (const c of sortedCats) {
  let g = navMap.get(c.departmentSlug);
  if (!g) {
    g = { name: c.department, slug: c.departmentSlug, items: [] };
    navMap.set(c.departmentSlug, g);
  }
  g.items.push({ name: c.name, slug: c.slug });
}
const nav = [...navMap.values()].sort((a, b) => deptRank(a.name) - deptRank(b.name));

// Strip the internal _department markers before emitting typed Product[] rows.
const emitProducts = products.map((p) => {
  const { _department, _departmentSlug, ...rest } = p;
  void _department;
  void _departmentSlug;
  return rest;
});

const header = `import type { Brand, Category, NavGroup, Product } from "./types";

/**
 * Catalogue imported from noon via a local browser capture (feature/noon-import).
 * Generated by scripts/import/build-imported-data.mjs — DO NOT edit by hand;
 * re-run the capture + generator instead.
 *
 * ⚠️  Images and copy here originate from noon and the respective brands and are
 * used for this demo only. Prices were converted SAR→BHD at ${SAR_TO_BHD} and are
 * approximate. Every product ships stock_quantity=0 (out of stock at checkout by
 * design). Replace with rights-cleared assets and real pricing before go-live.
 * Source: ${raw.target} · captured ${raw.capturedAt}
 */

`;

const body =
  `export const importedBrands: Brand[] = ${JSON.stringify(brands, null, 2)};\n\n` +
  `export const importedCategories: Category[] = ${JSON.stringify(categories, null, 2)};\n\n` +
  `export const importedNav: NavGroup[] = ${JSON.stringify(nav, null, 2)};\n\n` +
  `export const importedProducts: Product[] = ${JSON.stringify(emitProducts, null, 2)};\n`;

writeFileSync(OUT, header + body, "utf8");

// ---- Emit Supabase seed SQL (paste into the SQL editor; no keys required) ----
const q = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const qOrNull = (s) => (s == null || s === "" ? "NULL" : q(s));
const jsonb = (arr) => `${q(JSON.stringify(arr ?? []))}::jsonb`;
const textArr = (arr) =>
  arr && arr.length ? `ARRAY[${arr.map((t) => q(t)).join(", ")}]::text[]` : `ARRAY[]::text[]`;

const brandValues = brands.map((b) => `  (${q(b.name)}, ${q(b.slug)})`).join(",\n");

const categoryValues = categories
  .map((c) => `  (${q(c.name)}, ${q(c.slug)}, ${qOrNull(c.description)}, ${qOrNull(c.image_url)}, ${c.sort_order})`)
  .join(",\n");

const productValues = products
  .map((p) => {
    const cat = `(select id from public.categories where slug = ${q(p.category_slug)})`;
    const brand = p.brand_slug
      ? `(select id from public.brands where slug = ${q(p.brand_slug)})`
      : "NULL";
    const rating = Math.round((p.rating || 0) * 10) / 10; // rating is numeric(2,1)
    return `  (${q(p.name)}, ${q(p.slug)}, ${qOrNull(p.description)}, ${qOrNull(p.short_description)}, ${p.price}, NULL, 'BHD', ${jsonb(p.images)}, ${cat}, ${brand}, ${rating}, ${p.review_count || 0}, ${p.stock_quantity}, ${p.in_stock}, ${p.is_featured}, ${p.is_new}, ${textArr(p.tags)})`;
  })
  .join(",\n");

const sql = `-- ============================================================================
-- Arabic Souk · noon catalogue seed  (feature/noon-import)
-- Generated by scripts/import/build-imported-data.mjs — DO NOT edit by hand.
--
-- HOW TO USE: paste this whole file into the Supabase SQL editor and Run.
-- Authenticated by your dashboard login — no API keys or service-role secret.
--
-- ⚠️  This REPLACES the current categories, brands and products with ${categories.length}
-- categories and ${products.length} products imported from noon (mirroring noon's own
-- department/sub-category taxonomy). Images and copy are noon's / the brands' and
-- are used for this demo only; prices were converted SAR→BHD at ${SAR_TO_BHD} and are
-- approximate. Every product is stock_quantity=0 (out of stock at checkout by
-- design). Replace with rights-cleared assets and real pricing before go-live.
-- To revert, re-run supabase/seed.sql.
-- Source: ${raw.target} · captured ${raw.capturedAt}
-- ============================================================================

begin;

-- Clear the existing catalogue (order_items.product_id is ON DELETE SET NULL,
-- so any historical order lines are preserved, just de-linked).
delete from public.products;
delete from public.categories;
delete from public.brands;

insert into public.categories (name, slug, description, image_url, sort_order) values
${categoryValues}
on conflict (slug) do update
  set name = excluded.name, image_url = excluded.image_url, sort_order = excluded.sort_order;

insert into public.brands (name, slug) values
${brandValues}
on conflict (slug) do update set name = excluded.name;

insert into public.products
  (name, slug, description, short_description, price, compare_at_price, currency,
   images, category_id, brand_id, rating, review_count, stock_quantity, in_stock,
   is_featured, is_new, tags)
values
${productValues};

commit;

-- Sanity check (optional):
-- select c.name as category, count(*) from public.products p
--   join public.categories c on c.id = p.category_id group by 1 order by 1;
`;

writeFileSync(OUT_SQL, sql, "utf8");

console.log(`Wrote ${OUT}`);
console.log(`Wrote ${OUT_SQL}`);
console.log(`  ${products.length} products · ${categories.length} categories · ${brands.length} brands`);
for (const g of nav) console.log(`  ${g.name} (${g.items.length}): ${g.items.map((i) => i.name).join(", ")}`);
console.log(`  price range: ${Math.min(...products.map((p) => p.price))}–${Math.max(...products.map((p) => p.price))} BHD (SAR×${SAR_TO_BHD})`);
