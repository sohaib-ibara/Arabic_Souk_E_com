import type { Brand, Category, Product, StockCheckResult, StockIssue } from "./types";
import { sampleBrands, sampleCategories, sampleProducts } from "./sample-data";
import { getSupabaseServer } from "./supabase/server";

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

async function loadProducts(): Promise<Product[]> {
  const sb = getSupabaseServer();
  if (sb) {
    const { data, error } = await sb
      .from("products")
      .select("*, category:categories(name,slug), brand:brands(name,slug)")
      .order("created_at", { ascending: false });
    if (!error && data && data.length) return data.map(mapProductRow);
    warnFallback("products", error);
  }
  return sampleProducts;
}

async function loadCategories(): Promise<Category[]> {
  const sb = getSupabaseServer();
  if (sb) {
    const { data, error } = await sb.from("categories").select("*").order("sort_order");
    if (!error && data && data.length) return data as Category[];
    warnFallback("categories", error);
  }
  return sampleCategories;
}

async function loadBrands(): Promise<Brand[]> {
  const sb = getSupabaseServer();
  if (sb) {
    const { data, error } = await sb.from("brands").select("*").order("name");
    if (!error && data && data.length) return data as Brand[];
    warnFallback("brands", error);
  }
  return sampleBrands;
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
  if (q.featured) items = items.filter((p) => p.is_featured);
  if (q.isNew) items = items.filter((p) => p.is_new);
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

export async function getAllProducts(): Promise<Product[]> {
  return loadProducts();
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const items = await loadProducts();
  return items.find((p) => p.slug === slug) ?? null;
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const items = await loadProducts();
  const sameCategory = items.filter(
    (p) => p.id !== product.id && p.category_slug === product.category_slug,
  );
  const others = items.filter(
    (p) => p.id !== product.id && p.category_slug !== product.category_slug,
  );
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

/**
 * Server-side stock validation used by the checkout API.
 *
 * Because the demo catalogue ships with `stock_quantity: 0`, every line item
 * comes back flagged as out of stock — which is exactly the behaviour the
 * checkout flow is meant to demonstrate. Once real inventory is set in
 * Supabase, this same function will correctly let in-stock orders through.
 */
export async function checkStock(
  items: Array<{ productId: string; quantity: number }>,
): Promise<StockCheckResult> {
  const products = await loadProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const issues: StockIssue[] = [];

  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) {
      issues.push({
        productId: it.productId,
        name: "Unknown item",
        requested: it.quantity,
        available: 0,
        reason: "not_found",
      });
      continue;
    }
    if (!p.in_stock || p.stock_quantity <= 0) {
      issues.push({
        productId: p.id,
        name: p.name,
        requested: it.quantity,
        available: p.stock_quantity,
        reason: "out_of_stock",
      });
    } else if (p.stock_quantity < it.quantity) {
      issues.push({
        productId: p.id,
        name: p.name,
        requested: it.quantity,
        available: p.stock_quantity,
        reason: "insufficient",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
