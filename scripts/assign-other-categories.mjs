/**
 * Give the uncategorised Cult Beauty products a category.
 *
 * 68 of them arrived with none, because Cult files products by merchandising
 * angle ("mature-skin", "halloween") rather than by product type, and only the
 * unambiguous shelves are mapped in src/lib/category-aliases.ts. A product with
 * no category is buyable and searchable but sits under no heading, and neither
 * the shop-wide switch nor the per-vendor one can reach it — both are keyed on
 * a category.
 *
 * This creates one category per leftover shelf (the same list as migration
 * 0016 — keep the two in step) and moves the products onto them. nav.ts then
 * collects anything the captured noon taxonomy does not claim into an "Others"
 * group at the end of the menu.
 *
 *   node --env-file=.env.local scripts/assign-other-categories.mjs           # dry run
 *   node --env-file=.env.local scripts/assign-other-categories.mjs --apply
 *
 * Safe to re-run: it only ever touches products whose category is still null.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const VENDOR = "cultbeauty";

/*
  The leftover shelves, in the order they are added to the menu.

  `on` is set for the three that already hold a published product, so "Others"
  is not an empty heading the day this runs. The rest arrive switched off: most
  of these are moods rather than aisles — `refillable` is two Chloé perfumes
  that belong in Eau de Parfum, `grunge` is one eyeliner — and which of them the
  shop actually carries is the client's call, made in /admin/categories.
*/
const SHELVES = [
  { slug: "active", name: "Active Ingredients", on: true },
  { slug: "eyes-lips", name: "Eyes & Lips", on: true },
  { slug: "sun-kissed", name: "Sun-kissed", on: true },
  { slug: "mature-skin", name: "Mature Skin" },
  { slug: "vegan-make-up", name: "Vegan Make-up" },
  { slug: "our-customers-love", name: "Customer Favourites" },
  { slug: "multi-tasking-make-up", name: "Multi-tasking Make-up" },
  { slug: "mother-baby", name: "Mother & Baby" },
  { slug: "skin-care-benefits", name: "Skin Care Benefits" },
  { slug: "night-time", name: "Night-time" },
  { slug: "hair-type", name: "Hair Type" },
  { slug: "refillable", name: "Refillable" },
  { slug: "skin-care-tools", name: "Skin Care Tools" },
  { slug: "dewy", name: "Dewy" },
  { slug: "dermatological-skincare", name: "Dermatological Skincare" },
  { slug: "goody-bag", name: "Goody Bag" },
  { slug: "good-to-skin-make-up", name: "Good-to-Skin Make-up" },
  { slug: "tools-technology", name: "Tools & Technology" },
  { slug: "home-scents", name: "Home Scents" },
  { slug: "grunge", name: "Grunge" },
  { slug: "vitamins-supplements", name: "Vitamins & Supplements" },
  { slug: "korean-skin-care", name: "Korean Skin Care" },
  { slug: "spotlight", name: "Spotlight" },
  { slug: "skin-barrier-relief", name: "Skin Barrier Relief" },
  { slug: "firming", name: "Firming" },
  { slug: "halloween", name: "Halloween" },
];

/*
  Cult's `personal-care` shelf gets no category of its own: `personal-care` is
  already the slug of a menu DEPARTMENT, and a category sharing it would be
  unreachable from the very menu it collided with. Its four products name
  themselves plainly enough to go straight to aisles we already have.
*/
const BY_NAME = [
  { test: /toothbrush|toothpaste|mouthwash|floss/i, slug: "oral-hygiene" },
  { test: /deodorant|antiperspirant/i, slug: "deodorants-antiperspirants" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const die = (what, error) => {
  if (!error) return;
  console.error(`${what}: ${error.message}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// 1. The categories
// ---------------------------------------------------------------------------

const { data: existing, error: catError } = await sb
  .from("categories")
  .select("id, slug, sort_order");
die("reading categories", catError);

const bySlug = new Map(existing.map((c) => [c.slug, c]));
const missing = SHELVES.filter((s) => !bySlug.has(s.slug));
let order = Math.max(0, ...existing.map((c) => c.sort_order ?? 0));

if (missing.length && APPLY) {
  const rows = missing.map((s) => ({
    slug: s.slug,
    name: s.name,
    sort_order: ++order,
    is_enabled: Boolean(s.on),
  }));
  const { data: made, error } = await sb.from("categories").insert(rows).select("id, slug");
  die("creating categories", error);
  for (const c of made) bySlug.set(c.slug, c);
}
console.log(
  `categories: ${SHELVES.length - missing.length} already there, ` +
    `${missing.length} ${APPLY ? "created" : "to create"}`,
);

// ---------------------------------------------------------------------------
// 2. The products
// ---------------------------------------------------------------------------

const [{ data: products, error: prodError }, { data: staged, error: stageError }] =
  await Promise.all([
    sb.from("products").select("id, name, source_sku").eq("source", VENDOR).is("category_id", null),
    sb.from("staging_products").select("source_sku, category").eq("source", VENDOR),
  ]);
die("reading products", prodError);
die("reading staging", stageError);

const shelfOf = new Map(staged.map((r) => [String(r.source_sku), r.category]));

// On a dry run the new categories have not been written, so plan against the
// slugs that WILL exist. Otherwise the preview reports every product as
// unplaceable and shows nothing about what the run would actually do.
const willExist = new Set([...bySlug.keys(), ...SHELVES.map((s) => s.slug)]);

/** slug -> product ids */
const plan = new Map();
const unplaced = [];

for (const p of products) {
  const shelf = shelfOf.get(String(p.source_sku));
  const named = BY_NAME.find((r) => r.test.test(p.name));
  // The shelf first, so a deliberate mapping always beats a keyword guess; the
  // name only decides for products whose shelf we chose not to carry.
  const slug = (shelf && willExist.has(shelf) && shelf) || named?.slug;
  if (!slug || !willExist.has(slug)) {
    unplaced.push(`${p.name}  [shelf: ${shelf ?? "none"}]`);
    continue;
  }
  if (!plan.has(slug)) plan.set(slug, []);
  plan.get(slug).push(p.id);
}

console.log(`\nuncategorised products: ${products.length}`);
for (const [slug, ids] of [...plan].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ids.length).padStart(3)} -> ${slug}`);
}
if (unplaced.length) {
  console.log(`\nstill without a category (${unplaced.length}):`);
  for (const u of unplaced) console.log("   -", u);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

let moved = 0;
for (const [slug, ids] of plan) {
  // In batches: a very long `in` list becomes a URL longer than PostgREST accepts.
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const { error } = await sb
      .from("products")
      .update({ category_id: bySlug.get(slug).id })
      .in("id", part);
    die(`assigning ${slug}`, error);
    moved += part.length;
  }
}

console.log(`\nmoved ${moved} products.`);
