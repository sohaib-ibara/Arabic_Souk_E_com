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
  /**
   * Supplier product page, used to fulfil an order. Staff-only — withheld from
   * the public key by the column grants in migration 0008, and never selected
   * by the storefront.
   */
  source_url: string | null;
  /** Supplier adapter key — "noon", "cultbeauty". Staff-only, like source_url. */
  source: string | null;
  /** That supplier's product code. The sync key; see migration 0010. */
  source_sku: string | null;
  /**
   * Listed on the storefront at all.
   *
   * Not the same as `in_stock`, and the difference is the whole point of it:
   * an out-of-stock product still has a page and still appears in listings,
   * marked unavailable. An unpublished one is not there.
   */
  is_published: boolean;
  /** Realistic delivery window in days — supplier dispatch plus their shipping. */
  lead_days_min: number | null;
  lead_days_max: number | null;
  /** The supplier's own dispatch wording, for staff. Never shown to customers. */
  supplier_dispatch_note: string | null;
  /** Supplier's cap on units per order, where they state one. */
  max_per_order: number | null;
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
    source_url: row.source_url ?? null,
    source: row.source ?? null,
    source_sku: row.source_sku ?? null,
    // Defaults to listed. A row written before migration 0012 has no value,
    // and treating that as hidden would empty the storefront.
    is_published: row.is_published !== false,
    lead_days_min: row.lead_days_min != null ? Number(row.lead_days_min) : null,
    lead_days_max: row.lead_days_max != null ? Number(row.lead_days_max) : null,
    supplier_dispatch_note: row.supplier_dispatch_note ?? null,
    max_per_order: row.max_per_order != null ? Number(row.max_per_order) : null,
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
  /**
   * Supplier adapter key, or "none" for products added by hand.
   *
   * The reason this filter exists: the client curates per supplier — some noon
   * lines, some Cult Beauty ones — and doing that across a few thousand rows
   * means being able to look at one supplier at a time.
   */
  source?: string;
  /** "listed" | "hidden". Omitted shows both. */
  visibility?: "listed" | "hidden";
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
  // "none" is a real choice, not an empty filter: it finds the products staff
  // added by hand, which is exactly the set an importer must never touch.
  if (q.source === "none") query = query.is("source", null);
  else if (q.source) query = query.eq("source", q.source);
  if (q.visibility === "listed") query = query.eq("is_published", true);
  else if (q.visibility === "hidden") query = query.eq("is_published", false);

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

/**
 * List or hide everything matching a filter, not just the page on screen.
 *
 * The bulk buttons worked on ticked rows, and rows come 25 at a time. Curating
 * one supplier's 177 products meant eight pages of ticking, and the person
 * doing it has no way to tell whether they missed a page.
 *
 * The filter is re-applied here rather than trusting a list of ids from the
 * browser: the page the button was pressed on may be minutes old, and "every
 * hidden Cult Beauty product" should mean what it means when the button is
 * pressed, not what it meant when the page was drawn.
 *
 * Deliberately shares its clauses with `listAdminProducts` — if the two ever
 * disagree, the count shown on the button is not the set it acts on.
 */
export async function setPublishedByFilter(
  q: ListQuery,
  published: boolean,
): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");

  let query = admin.from("products").update({ is_published: published }, { count: "exact" });

  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
  }
  if (q.categoryId) query = query.eq("category_id", q.categoryId);
  if (q.source === "none") query = query.is("source", null);
  else if (q.source) query = query.eq("source", q.source);
  if (q.visibility === "listed") query = query.eq("is_published", true);
  else if (q.visibility === "hidden") query = query.eq("is_published", false);

  /*
    A PostgREST update needs a WHERE clause or it refuses the request, and with
    no filters at all the clauses above add none. `is_published` is the column
    being written, so matching on its opposite is both a valid predicate and
    the correct one: rows already in the target state need no update.
  */
  if (!q.search?.trim() && !q.categoryId && !q.source && !q.visibility) {
    query = query.eq("is_published", !published);
  }

  const { error, count } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
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
  /*
    No `is_new`. Whether a product is a new arrival is worked out from when it
    was added (isRecentArrival, src/lib/data.ts), so the column is not written
    from the admin form any more. Leaving it out of the write rather than
    sending `false` keeps whatever is already in the row: nothing reads it, and
    quietly clearing 301 flags on the next save of an unrelated field is not
    this function's business.
  */
  images: string[];
  tags: string[];
  /** Supplier product page — internal only. See AdminProductRow.source_url. */
  source_url: string | null;
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

/**
 * List or hide products in bulk.
 *
 * Curating per supplier is a bulk job by nature — "carry these forty Cult
 * Beauty lines, not the other ten thousand" is not forty visits to an edit
 * form. Chunked because a filter on a few thousand ids exceeds what a URL can
 * carry, and PostgREST puts `in.(…)` in the query string.
 */
export async function setPublished(ids: string[], published: boolean): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  if (!ids.length) return 0;

  let changed = 0;
  for (const batch of chunk(ids, 200)) {
    const { error, count } = await admin
      .from("products")
      .update({ is_published: published }, { count: "exact" })
      .in("id", batch);
    if (error) throw new Error(error.message);
    changed += count ?? batch.length;
  }
  return changed;
}

/** Which suppliers are represented in the catalogue, for the filter dropdown. */
export async function getSourceOptions(): Promise<Array<{ key: string; count: number }>> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  // No group-by over PostgREST without a view, and the catalogue is small
  // enough that counting in memory beats adding one.
  const { data, error } = await admin.from("products").select("source");
  if (error) return [];
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ source: string | null }>) {
    const key = row.source ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
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
