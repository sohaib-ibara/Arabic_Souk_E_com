import { getSupabaseAdmin } from "./supabase/server";
import { parseCsvWithHeader } from "./csv";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Admin-side catalogue access.
 *
 * Unlike `data.ts` — which serves the storefront and transparently falls back
 * to the bundled sample catalogue — everything here talks to Supabase through
 * the service-role client and never falls back. Editing is only meaningful
 * against the real table, and silently "succeeding" against static sample data
 * would be worse than a clear error.
 */

/** BHD is a 3-decimal currency (1 dinar = 1000 fils). */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  currency: string;
  sku: string | null;
  barcode: string | null;
  low_stock_threshold: number;
  stock_quantity: number;
  in_stock: boolean;
  is_featured: boolean;
  is_new: boolean;
  category_id: string | null;
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  images: string[];
  short_description: string | null;
  description: string | null;
  tags: string[];
  updated_at: string | null;
}

export interface Option {
  id: string;
  name: string;
}

export interface CatalogueStatus {
  configured: boolean;
  productCount: number;
  /** Set when the admin can't write — explains why, in plain language. */
  error: string | null;
}

function mapRow(row: any): AdminProductRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: Number(row.price),
    compare_at_price: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    cost_price: row.cost_price != null ? Number(row.cost_price) : null,
    currency: row.currency ?? "BHD",
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    low_stock_threshold: Number(row.low_stock_threshold ?? 5),
    stock_quantity: Number(row.stock_quantity ?? 0),
    in_stock: Boolean(row.in_stock),
    is_featured: Boolean(row.is_featured),
    is_new: Boolean(row.is_new),
    category_id: row.category_id ?? null,
    category_name: row.category?.name ?? null,
    brand_id: row.brand_id ?? null,
    brand_name: row.brand?.name ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    short_description: row.short_description ?? null,
    description: row.description ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    updated_at: row.updated_at ?? null,
  };
}

const SELECT = "*, category:categories(name), brand:brands(name)";

/**
 * Whether the admin can actually manage the catalogue: needs the service-role
 * key AND rows in `products`. An empty table means the storefront is still
 * serving the bundled sample catalogue, so edits here wouldn't show up there —
 * worth saying out loud rather than letting it confuse someone.
 */
export async function getCatalogueStatus(): Promise<CatalogueStatus> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      configured: false,
      productCount: 0,
      error:
        "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local to manage the catalogue.",
    };
  }
  const { count, error } = await admin
    .from("products")
    .select("id", { count: "exact", head: true });
  if (error) {
    return {
      configured: false,
      productCount: 0,
      error: `Couldn't reach the products table — has migration 0001 been run? (${error.message})`,
    };
  }
  const productCount = count ?? 0;
  return {
    configured: true,
    productCount,
    error:
      productCount === 0
        ? "The products table is empty, so the storefront is still serving the bundled sample catalogue. Run supabase/seed-noon.sql (or add a product below) for changes here to appear on the store."
        : null,
  };
}

export interface ListQuery {
  search?: string;
  categoryId?: string;
  page?: number;
  perPage?: number;
}

export interface ListResult {
  items: AdminProductRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export async function listAdminProducts(q: ListQuery = {}): Promise<ListResult> {
  const perPage = Math.min(100, Math.max(10, q.perPage ?? 25));
  const page = Math.max(1, q.page ?? 1);
  const admin = getSupabaseAdmin();
  if (!admin) return { items: [], total: 0, page, perPage, pageCount: 0 };

  let query = admin.from("products").select(SELECT, { count: "exact" });

  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
  }
  if (q.categoryId) query = query.eq("category_id", q.categoryId);

  const from = (page - 1) * perPage;
  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    items: (data ?? []).map(mapRow),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getAdminProduct(id: string): Promise<AdminProductRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("products").select(SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function getCategoryOptions(): Promise<Option[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin.from("categories").select("id,name").order("sort_order");
  return (data ?? []) as Option[];
}

export async function getBrandOptions(): Promise<Option[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin.from("brands").select("id,name").order("name");
  return (data ?? []) as Option[];
}

/**
 * URL-safe slug from a product name. NFKD decomposes accented characters into
 * base letter + combining mark, and the non-alphanumeric rule below then drops
 * the marks — so "Crème" becomes "creme" without a separate diacritic pass.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Editable product fields.
 *
 * `stock_quantity` is deliberately absent. Once the movement ledger exists
 * (migration 0005) every change to on-hand has to go through
 * `apply_stock_movement`, or the audit trail silently develops holes. Stock is
 * set from the inventory screen instead; an opening balance at creation time is
 * passed separately and recorded as an 'initial' movement.
 */
export interface ProductInput {
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  sku: string | null;
  barcode: string | null;
  low_stock_threshold: number;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  in_stock: boolean;
  is_featured: boolean;
  is_new: boolean;
  images: string[];
  tags: string[];
}

export async function insertProduct(input: ProductInput): Promise<{ id: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  const { data, error } = await admin
    .from("products")
    .insert({
      ...input,
      price: round3(input.price),
      cost_price: input.cost_price == null ? null : round3(input.cost_price),
      // New products start empty; an opening balance is posted as a movement so
      // even the first number has a ledger entry behind it.
      stock_quantity: 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed.");
  return { id: data.id as string };
}

export async function updateProductRow(id: string, input: ProductInput): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  const { error } = await admin
    .from("products")
    .update({
      ...input,
      price: round3(input.price),
      cost_price: input.cost_price == null ? null : round3(input.cost_price),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProductRow(id: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* CSV price sheets                                                     */
/* ------------------------------------------------------------------ */

/** Header aliases accepted for the product identifier column. */
export const ID_KEYS = ["id", "product_id", "productid", "slug", "sku", "handle"];

/** Split CSV keys into UUIDs and non-UUIDs (slugs/SKUs) for separate lookups. */
export function splitKeys(keys: string[]): { ids: string[]; slugs: string[] } {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const unique = [...new Set(keys)];
  return {
    ids: unique.filter((k) => uuid.test(k)),
    slugs: unique.filter((k) => !uuid.test(k)),
  };
}

/** Chunk an array so a large sheet doesn't build an over-long request URL. */
export function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}
/** Header aliases accepted for the price column. */
const PRICE_KEYS = [
  "price",
  "new_price",
  "newprice",
  "unit_price",
  "min_price",
  "minimum_price",
  "floor",
  "floor_price",
  "cost",
  "cost_price",
  "supplier_price",
];

export interface CsvPriceRow {
  /** Line number in the uploaded file (1-based, header counted). */
  line: number;
  key: string;
  price: number;
}

export interface CsvReadResult {
  rows: CsvPriceRow[];
  invalid: Array<{ line: number; reason: string }>;
  idHeader: string;
  priceHeader: string;
}

/**
 * Reads a two-column price sheet. Accepts several common header spellings so an
 * export from Excel or a supplier system usually just works; the resolved
 * headers are returned so the UI can show which columns were used.
 */
export function readPriceCsv(text: string): CsvReadResult {
  const parsed = parseCsvWithHeader(text);
  if (!parsed) throw new Error("That file is empty.");

  const idHeader = parsed.headers.find((h) => ID_KEYS.includes(h));
  const priceHeader = parsed.headers.find((h) => PRICE_KEYS.includes(h));

  if (!idHeader) {
    throw new Error(
      `No product column found. Expected one of: ${ID_KEYS.join(", ")}. Found: ${parsed.headers.join(", ") || "(none)"}.`,
    );
  }
  if (!priceHeader) {
    throw new Error(
      `No price column found. Expected one of: ${PRICE_KEYS.join(", ")}. Found: ${parsed.headers.join(", ") || "(none)"}.`,
    );
  }

  const rows: CsvPriceRow[] = [];
  const invalid: Array<{ line: number; reason: string }> = [];

  parsed.rows.forEach((r, idx) => {
    const line = idx + 2; // +1 for the header, +1 for 1-based numbering
    const key = (r[idHeader] ?? "").trim();
    const rawPrice = (r[priceHeader] ?? "").trim().replace(/[^0-9.\-]/g, "");

    if (!key) {
      invalid.push({ line, reason: "Missing product id/slug" });
      return;
    }
    if (!rawPrice) {
      invalid.push({ line, reason: "Missing price" });
      return;
    }
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) {
      invalid.push({ line, reason: `Not a valid price: "${r[priceHeader]}"` });
      return;
    }
    rows.push({ line, key, price: round3(price) });
  });

  return { rows, invalid, idHeader, priceHeader };
}

/** Look up every referenced product by id OR slug in as few queries as possible. */
async function resolveKeys(keys: string[]): Promise<Map<string, AdminProductRow>> {
  const admin = getSupabaseAdmin();
  const found = new Map<string, AdminProductRow>();
  if (!admin || !keys.length) return found;

  const { ids, slugs } = splitKeys(keys);

  for (const part of chunk(ids, 200)) {
    const { data } = await admin.from("products").select(SELECT).in("id", part);
    for (const row of data ?? []) {
      const m = mapRow(row);
      found.set(m.id, m);
    }
  }
  for (const part of chunk(slugs, 200)) {
    const { data } = await admin.from("products").select(SELECT).in("slug", part);
    for (const row of data ?? []) {
      const m = mapRow(row);
      found.set(m.slug, m);
    }
  }
  return found;
}

export interface PriceChange {
  id: string;
  slug: string;
  name: string;
  from: number;
  to: number;
  currency: string;
}

export interface BulkUpdateResult {
  applied: boolean;
  total: number;
  changes: PriceChange[];
  unchanged: number;
  notFound: Array<{ line: number; key: string }>;
  invalid: Array<{ line: number; reason: string }>;
  idHeader: string;
  priceHeader: string;
}

/**
 * Bulk price update (client requirement 4).
 *
 * Always computes the full diff first. With `apply: false` that diff is
 * returned as a preview and nothing is written — bulk price edits are hard to
 * undo, so the UI shows exactly what will change before committing.
 */
export async function bulkUpdatePrices(
  text: string,
  opts: { apply: boolean },
): Promise<BulkUpdateResult> {
  const { rows, invalid, idHeader, priceHeader } = readPriceCsv(text);
  const found = await resolveKeys(rows.map((r) => r.key));

  const changes: PriceChange[] = [];
  const notFound: Array<{ line: number; key: string }> = [];
  let unchanged = 0;

  for (const r of rows) {
    const p = found.get(r.key);
    if (!p) {
      notFound.push({ line: r.line, key: r.key });
      continue;
    }
    if (round3(p.price) === r.price) {
      unchanged++;
      continue;
    }
    changes.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      from: round3(p.price),
      to: r.price,
      currency: p.currency,
    });
  }

  if (opts.apply && changes.length) {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error("Supabase service role isn't configured.");
    // One statement per product: the rows carry different values, and the
    // catalogue is small enough that a batched upsert isn't worth the risk of
    // overwriting columns the sheet doesn't mention.
    for (const c of changes) {
      const { error } = await admin.from("products").update({ price: c.to }).eq("id", c.id);
      if (error) throw new Error(`Failed updating ${c.slug}: ${error.message}`);
    }
  }

  return {
    applied: opts.apply,
    total: rows.length,
    changes,
    unchanged,
    notFound,
    invalid,
    idHeader,
    priceHeader,
  };
}

export interface FloorViolation {
  id: string;
  slug: string;
  name: string;
  storePrice: number;
  floorPrice: number;
  shortfall: number;
  currency: string;
}

export interface ValidationResult {
  total: number;
  passed: number;
  violations: FloorViolation[];
  notFound: Array<{ line: number; key: string }>;
  invalid: Array<{ line: number; reason: string }>;
  idHeader: string;
  priceHeader: string;
}

/**
 * Margin guard (client requirement 5).
 *
 * The sheet supplies a floor — a supplier/cost price — per product. A product
 * passes when the store price is greater than or equal to that floor; anything
 * priced below it is reported as a violation with the shortfall, so margin
 * can't silently go negative after a bulk edit. Read-only: nothing is written.
 */
export async function validatePriceFloors(text: string): Promise<ValidationResult> {
  const { rows, invalid, idHeader, priceHeader } = readPriceCsv(text);
  const found = await resolveKeys(rows.map((r) => r.key));

  const violations: FloorViolation[] = [];
  const notFound: Array<{ line: number; key: string }> = [];
  let passed = 0;

  for (const r of rows) {
    const p = found.get(r.key);
    if (!p) {
      notFound.push({ line: r.line, key: r.key });
      continue;
    }
    const storePrice = round3(p.price);
    if (storePrice >= r.price) {
      passed++;
      continue;
    }
    violations.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      storePrice,
      floorPrice: r.price,
      shortfall: round3(r.price - storePrice),
      currency: p.currency,
    });
  }

  // Worst offenders first — that's the order you'd want to fix them in.
  violations.sort((a, b) => b.shortfall - a.shortfall);

  return { total: rows.length, passed, violations, notFound, invalid, idHeader, priceHeader };
}
