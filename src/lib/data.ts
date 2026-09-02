import type { Brand, Category, Product } from "./types";
import { sampleBrands, sampleCategories, sampleProducts } from "./sample-data";
import { importedBrands, importedCategories, importedProducts } from "./imported-data";
import { getSupabaseServer, getSupabaseAdmin } from "./supabase/server";

/**
 * Local catalogue source. When a noon capture has been generated into
 * `imported-data.ts` it takes precedence over the bundled sample catalogue;
 * otherwise we fall back to the samples. Supabase (when configured) still wins
 * over both — see the loaders below.
 */
const localProducts: Product[] = importedProducts.length ? importedProducts : sampleProducts;
const localBrands: Brand[] = importedBrands.length ? importedBrands : sampleBrands;
// Prefer the imported (noon) categories; otherwise fall back to the sample
// categories that actually contain products, so we never link to an empty page.
const localCategories: Category[] = importedCategories.length
  ? importedCategories
  : sampleCategories.filter((c) => localProducts.some((p) => p.category_slug === c.slug));

/**
 * Data-access layer for the storefront.
 *
 * Strategy: try Supabase first; if it isn't configured, errors, or returns no
 * rows, transparently fall back to the bundled sample catalogue. Filtering,
 * sorting and search run in memory so the exact same behaviour applies to both
 * sources — perfectly adequate for a curated boutique catalogue.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProductRow(row: any): Product {
  const category = row.category ?? {};
  const brand = row.brand ?? {};
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    short_description: row.short_description ?? null,
    price: Number(row.price),
    compare_at_price: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    currency: row.currency ?? "BHD",
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    category_slug: category.slug ?? "",
    category_name: category.name ?? "",
    brand_slug: brand.slug ?? null,
    brand_name: brand.name ?? null,
    rating: Number(row.rating ?? 0),
    review_count: Number(row.review_count ?? 0),
    stock_quantity: Number(row.stock_quantity ?? 0),
    in_stock: Boolean(row.in_stock),
    is_featured: Boolean(row.is_featured),
    is_new: Boolean(row.is_new),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    updated_at: row.updated_at ?? row.created_at ?? null,
    lead_days_min: row.lead_days_min != null ? Number(row.lead_days_min) : null,
    lead_days_max: row.lead_days_max != null ? Number(row.lead_days_max) : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Warns (in dev) when Supabase is configured but a table isn't usable, so a
 * silent fall back to sample data can't be mistaken for "coming from Supabase".
 */
function warnFallback(table: string, error: { message: string } | null) {
  if (process.env.NODE_ENV === "production") return;
  if (error) {
    console.warn(`[data] Supabase "${table}" query failed — using sample data: ${error.message}`);
  } else {
    console.warn(
      `[data] Supabase "${table}" table is empty — using sample data. Run supabase/seed.sql to load the catalogue.`,
    );
  }
}

/**
 * Explicit column list rather than `*`.
 *
 * The table's public-read policy is per-row and can't hide a column, so the
 * staff-only ones — cost_price, source_url, sku, barcode, low_stock_threshold —
 * are withheld by grant instead: migration 0008 drops the blanket table grant
 * and grants back exactly this list. `select *` as anon is therefore refused,
 * which is the intended tripwire.
 *
 * This list and the grant in 0008 must stay in step. Adding a column here that
 * isn't granted there takes the storefront down; granting one there that isn't
 * needed here is a quiet leak.
 */
const LEGACY_PRODUCT_COLUMNS = [
  "id",
  "name",
  "slug",
  "description",
  "short_description",
  "price",
  "compare_at_price",
  "currency",
  "images",
  "category_id",
  "brand_id",
  "rating",
  "review_count",
  "stock_quantity",
  "in_stock",
  "is_featured",
  "is_new",
  "tags",
  "created_at",
  "updated_at",
].join(",");

/**
 * The same list plus what migration 0012 adds.
 *
 * These must stay in step with the column grants in that migration: selected
 * here but not granted takes the whole catalogue down with a 403, and granted
 * but unselected means hidden products get served.
 */
const PUBLIC_PRODUCT_COLUMNS = [
  LEGACY_PRODUCT_COLUMNS,
  "is_published",
  // The honest delivery window for this product, where the supplier gave one.
  "lead_days_min",
  "lead_days_max",
].join(",");

/**
 * The same list plus what migration 0014 adds.
 *
 * `is_listed` is the resolved answer to "does a shopper see this" — the
 * product's own switch AND its vendor's AND that vendor's switch for the
 * product's category. It is computed by trigger precisely so the storefront
 * can filter on one public boolean without ever being granted `source`, which
 * is the sourcing list. See 0014's header.
 */
const PROVISIONED_PRODUCT_COLUMNS = [PUBLIC_PRODUCT_COLUMNS, "is_listed"].join(",");

/** Postgres "column does not exist" — i.e. a migration hasn't run here yet. */
const UNDEFINED_COLUMN = "42703";

async function loadProducts(): Promise<Product[]> {
  const sb = getSupabaseServer();
  if (sb) {
    // The single gate for "is this product listed at all".
    //
    // Filtered in this loader rather than at each call site: everything
    // downstream — listings, search, categories, related products, the
    // sitemap, generateStaticParams — reads from here, so an unlisted product
    // cannot reappear through a path someone forgot to filter.
    //
    // Since 0014 the gate is `is_listed`, which already folds in the vendor
    // and vendor-category switches. Filtering on `is_published` here instead
    // would show products from a vendor that has been turned off.
    const provisioned = await sb
      .from("products")
      .select(
        `${PROVISIONED_PRODUCT_COLUMNS}, category:categories(name,slug), brand:brands(name,slug)`,
      )
      .eq("is_listed", true)
      .order("created_at", { ascending: false });

    if (!provisioned.error) {
      if (provisioned.data?.length) return provisioned.data.map(mapProductRow);

      /*
        The query worked and matched nothing. That is a LEGITIMATE answer here,
        unlike everywhere else in this loader: an admin who switches off every
        vendor has asked for an empty shop, and must get one.

        So the usual "empty means misconfigured, serve samples" rule cannot
        apply. It is still the right rule for a database with no catalogue at
        all, which is what this distinguishes — one cheap count, only ever on
        the empty path.
      */
      const { count, error: countError } = await sb
        .from("products")
        .select("id", { count: "exact", head: true });

      if (!countError && (count ?? 0) > 0) return [];
      warnFallback("products", countError);
      return localProducts;
    }

    /*
      Deploy-order safety net, same shape as the 0012 one below.

      If this code ships before 0014 runs, `is_listed` does not exist. Falling
      straight through to sample data would replace the real catalogue with 628
      demo products, so instead we drop back to the 0012 behaviour — every
      published product, vendor switches unenforced — and say so. Wrong
      products on a live shop is far worse than an unenforced vendor filter.
    */
    if (provisioned.error.code === UNDEFINED_COLUMN) {
      console.error(
        "[data] products.is_listed is missing — run supabase/migrations/0014. " +
          "Vendor and category provisioning is NOT being enforced.",
      );
    }

    const withVisibility = await sb
      .from("products")
      .select(`${PUBLIC_PRODUCT_COLUMNS}, category:categories(name,slug), brand:brands(name,slug)`)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (!withVisibility.error && withVisibility.data?.length) {
      return withVisibility.data.map(mapProductRow);
    }

    /*
      Deploy-order safety net.

      If the code ships before migration 0012 runs, selecting and filtering on
      `is_published` fails, and the generic fallback below would quietly serve
      the bundled sample catalogue — 628 demo products at demo prices, in place
      of the real 301. A build did exactly that before this branch was added.
      Wrong products on a live shop is far worse than an unenforced filter, so
      a missing column retries without it and says so loudly.
    */
    if (withVisibility.error?.code === UNDEFINED_COLUMN) {
      console.error(
        "[data] products.is_published is missing — run supabase/migrations/0012. " +
          "Serving the full catalogue; hidden products are NOT being filtered.",
      );
      const legacy = await sb
        .from("products")
        .select(`${LEGACY_PRODUCT_COLUMNS}, category:categories(name,slug), brand:brands(name,slug)`)
        .order("created_at", { ascending: false });
      if (!legacy.error && legacy.data?.length) return legacy.data.map(mapProductRow);
      warnFallback("products", legacy.error);
      return localProducts;
    }

    warnFallback("products", withVisibility.error);
  }
  return localProducts;
}

async function loadCategories(): Promise<Category[]> {
  const sb = getSupabaseServer();
  if (sb) {
    const { data, error } = await sb.from("categories").select("*").order("sort_order");
    if (!error && data && data.length) {
      /*
        A category switched off is not on the shop at all.

        Filtered here rather than at each call site, for the same reason
        products are: the navigation, the homepage grid, the footer, the
        sitemap, generateStaticParams and getCategoryBySlug all read from this
        one loader, so a disabled category cannot come back through a path
        someone forgot. Its own URL then 404s, because the page calls
        notFound() when the slug resolves to nothing.

        `!== false` rather than `=== true`: before migration 0015 the column
        does not exist, and a missing switch has to mean "on" or deploying the
        code first would empty the shop.
      */
      const enabled = (data as Category[]).filter((c) => c.is_enabled !== false);
      if (enabled.length) return enabled;
      // Every category switched off is a legitimate state, and quietly serving
      // the sample taxonomy instead would be a lie.
      return [];
    }
    warnFallback("categories", error);
  }
  return localCategories;
}

async function loadBrands(): Promise<Brand[]> {
  const sb = getSupabaseServer();
  if (sb) {
    const { data, error } = await sb.from("brands").select("*").order("name");
    if (!error && data && data.length) return data as Brand[];
    warnFallback("brands", error);
  }
  return localBrands;
}

export type ProductSort = "featured" | "price-asc" | "price-desc" | "rating" | "newest";

export interface ProductQuery {
  category?: string;
  brand?: string;
  featured?: boolean;
  isNew?: boolean;
  search?: string;
  sort?: ProductSort;
  limit?: number;
  excludeId?: string;
}

function sortProducts(items: Product[], sort: ProductSort): Product[] {
  const copy = [...items];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price);
    case "rating":
      return copy.sort((a, b) => b.rating - a.rating);
    case "newest":
      return copy.sort((a, b) => Number(b.is_new) - Number(a.is_new) || b.rating - a.rating);
    case "featured":
    default:
      return copy.sort(
        (a, b) => Number(b.is_featured) - Number(a.is_featured) || b.rating - a.rating,
      );
  }
}

export async function getProducts(q: ProductQuery = {}): Promise<Product[]> {
  let items = await loadProducts();
  if (q.category) items = items.filter((p) => p.category_slug === q.category);
  if (q.brand) items = items.filter((p) => p.brand_slug === q.brand);
  // Curated shelves are a recommendation, so they only carry things a shopper
  // can actually buy. Category, search and the full shop still list everything,
  // marked unavailable — those are places people go looking for a specific item.
  if (q.featured) items = items.filter((p) => p.is_featured && p.in_stock);
  if (q.isNew) items = items.filter((p) => p.is_new && p.in_stock);
  if (q.excludeId) items = items.filter((p) => p.id !== q.excludeId);
  if (q.search) {
    const s = q.search.toLowerCase().trim();
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.brand_name ?? "").toLowerCase().includes(s) ||
        (p.category_name ?? "").toLowerCase().includes(s) ||
        (p.short_description ?? "").toLowerCase().includes(s) ||
        p.tags.some((t) => t.toLowerCase().includes(s)),
    );
  }
  items = sortProducts(items, q.sort ?? "featured");
  if (q.limit) items = items.slice(0, q.limit);
  return items;
}

/**
 * The shelf to show when the question is "what should I look at?".
 *
 * `is_featured` alone could not answer it: four products in a catalogue of 332
 * carry the flag, so the homepage's Bestsellers row rendered four cards under a
 * heading promising the shop's best, and the cart nudge had almost nothing to
 * suggest. Curation is a job nobody has done here yet, and a row that is empty
 * until they do is worse than one that fills itself sensibly.
 *
 * So the four curated ones still come first — that is what the flag is for —
 * and the rest of the row is filled by rating weighted by how many people left
 * one. `log1p` on the count is what stops a lone five-star review outranking a
 * 4.6 with four hundred: it rewards agreement without letting volume alone
 * decide.
 *
 * In-stock only, like every other recommendation on the site. Suggesting
 * something unbuyable to someone who is browsing is worse than suggesting
 * nothing.
 */
export async function getBestsellers(limit = 8): Promise<Product[]> {
  const items = await loadProducts();
  const score = (p: Product) =>
    (p.is_featured ? 1_000_000 : 0) + (p.rating ?? 0) * Math.log1p(p.review_count ?? 0);
  return items
    .filter((p) => p.in_stock)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export async function getAllProducts(): Promise<Product[]> {
  return loadProducts();
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const items = await loadProducts();
  return items.find((p) => p.slug === slug) ?? null;
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const items = await loadProducts();
  // Recommendations, so only things that can be bought — suggesting an
  // unavailable product to someone already looking at one is no help.
  const candidates = items.filter((p) => p.id !== product.id && p.in_stock);
  const sameCategory = candidates.filter((p) => p.category_slug === product.category_slug);
  const others = candidates.filter((p) => p.category_slug !== product.category_slug);
  return [...sameCategory, ...others].slice(0, limit);
}

export async function getCategories(): Promise<Category[]> {
  return loadCategories();
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const cats = await loadCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

export async function getBrands(): Promise<Brand[]> {
  return loadBrands();
}

/** Shopper contact details captured at checkout (all optional). */
export interface DemandContact {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  area?: string;
  city?: string;
  governorate?: string;
}

/**
 * Records a checkout attempt — who the shopper is and which items they wanted —
 * into `demand_signals` / `demand_signal_items`, so the store keeps a demand log
 * even while everything is out of stock (see the migration for the analytics
 * view).
 *
 * Best-effort by design: if the service-role key isn't configured (demo mode)
 * or the write fails, it returns `{ recorded: false }` and the caller carries on
 * — capturing demand must never block or break the checkout response.
 */
export async function recordDemand(input: {
  contact: DemandContact;
  items: Array<{ productId: string; quantity: number }>;
  allInStock: boolean;
}): Promise<{ recorded: boolean; id?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { recorded: false };

  try {
    const products = await loadProducts();
    const byId = new Map(products.map((p) => [p.id, p]));

    // Resolve each wanted item to authoritative catalogue data (never trust the
    // client for price/name); slug is the stable key used for analytics.
    const lineItems = input.items.map((it) => {
      const p = byId.get(it.productId);
      return {
        product_id: it.productId || null,
        product_slug: p?.slug ?? null,
        product_name: p?.name ?? "Unknown item",
        unit_price: p?.price ?? 0,
        quantity: it.quantity,
      };
    });
    const subtotal = lineItems.reduce((s, li) => s + li.unit_price * li.quantity, 0);
    const currency = products[0]?.currency ?? "BHD";

    const { data, error } = await admin
      .from("demand_signals")
      .insert({
        full_name: input.contact.fullName ?? null,
        email: input.contact.email ?? null,
        phone: input.contact.phone ?? null,
        shipping_address: {
          address: input.contact.address ?? null,
          area: input.contact.area ?? null,
          city: input.contact.city ?? null,
          governorate: input.contact.governorate ?? null,
        },
        subtotal,
        currency,
        all_in_stock: input.allInStock,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[demand] signal insert failed: ${error?.message ?? "no row returned"}`);
      }
      return { recorded: false };
    }

    const { error: itemsError } = await admin
      .from("demand_signal_items")
      .insert(lineItems.map((li) => ({ ...li, signal_id: data.id })));
    if (itemsError && process.env.NODE_ENV !== "production") {
      console.warn(`[demand] items insert failed: ${itemsError.message}`);
    }

    return { recorded: true, id: data.id };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[demand] unexpected error: ${(e as Error).message}`);
    }
    return { recorded: false };
  }
}
