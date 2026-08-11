import { getSupabaseAdmin } from "./supabase/server";
import { parseCsvWithHeader } from "./csv";
import { ID_KEYS, chunk, splitKeys } from "./admin-products";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Inventory data layer — reads the `inventory_overview` view and writes through
 * the `apply_stock_movement` function (migrations 0005 / 0006).
 *
 * Two rules shape everything here:
 *
 *  1. Availability and quantity are separate. The `in_stock` toggle decides
 *     whether customers can order; the quantity is tracked and reported but
 *     never blocks a sale. The admin turns a product off when they can't
 *     source it.
 *  2. Nothing writes `products.stock_quantity` directly. Every change goes
 *     through the database function, which moves the balance and appends the
 *     ledger row in one statement — so concurrent orders can't lose an update,
 *     and no change can happen without an audit trail.
 */

export const MOVEMENT_REASONS = [
  "sale",
  "restock",
  "adjustment",
  "receipt",
  "count",
  "initial",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Reasons an admin can pick by hand; 'sale'/'restock' are written by the order path. */
export const MANUAL_REASONS: MovementReason[] = ["adjustment", "receipt", "count", "initial"];

export const reasonLabels: Record<MovementReason, string> = {
  sale: "Sale",
  restock: "Returned to stock",
  adjustment: "Manual adjustment",
  receipt: "Stock received",
  count: "Stock count",
  initial: "Opening balance",
};

export interface InventoryRow {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  costPrice: number | null;
  currency: string;
  stockQuantity: number;
  lowStockThreshold: number;
  /** The availability switch — the only thing that blocks checkout. */
  inStock: boolean;
  stockValue: number;
  isUnavailable: boolean;
  isOversold: boolean;
  isLow: boolean;
  categoryName: string | null;
  brandName: string | null;
  updatedAt: string | null;
}

export interface MovementRow {
  id: string;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  delta: number;
  balanceAfter: number | null;
  reason: MovementReason;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  actor: string | null;
  createdAt: string;
}

function mapInventory(row: any): InventoryRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    price: Number(row.price ?? 0),
    costPrice: row.cost_price != null ? Number(row.cost_price) : null,
    currency: row.currency ?? "BHD",
    stockQuantity: Number(row.stock_quantity ?? 0),
    lowStockThreshold: Number(row.low_stock_threshold ?? 0),
    inStock: Boolean(row.in_stock),
    stockValue: Number(row.stock_value ?? 0),
    isUnavailable: Boolean(row.is_unavailable),
    isOversold: Boolean(row.is_oversold),
    isLow: Boolean(row.is_low),
    categoryName: row.category_name ?? null,
    brandName: row.brand_name ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapMovement(row: any): MovementRow {
  const p = row.product ?? {};
  return {
    id: row.id,
    productId: row.product_id,
    productName: p.name ?? null,
    productSlug: p.slug ?? null,
    delta: Number(row.delta ?? 0),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    reason: row.reason as MovementReason,
    note: row.note ?? null,
    referenceType: row.reference_type ?? null,
    referenceId: row.reference_id ?? null,
    actor: row.actor ?? null,
    createdAt: row.created_at,
  };
}

/* ----------------------------- availability ----------------------------- */

export interface InventoryStatus {
  ready: boolean;
  error: string | null;
}

/** Whether the inventory migrations have been applied and the view is reachable. */
export async function getInventoryStatus(): Promise<InventoryStatus> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ready: false,
      error: "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local to manage inventory.",
    };
  }
  // Ask for the 0006 flags specifically. Selecting only `id` would succeed
  // against the older 0005 view too, and the screens would then render every
  // status as false instead of saying the migration is outstanding.
  const { error } = await admin
    .from("inventory_overview")
    .select("id,is_oversold,is_unavailable", { head: true, count: "exact" });
  if (error) {
    return {
      ready: false,
      error: `Inventory isn't available yet — run supabase/migrations/0005_inventory.sql and 0006_simplify_inventory.sql in the Supabase SQL editor. (${error.message})`,
    };
  }
  return { ready: true, error: null };
}

/* -------------------------------- listing ------------------------------- */

export type InventoryFilter = "all" | "low" | "oversold" | "unavailable";

export interface InventoryQuery {
  search?: string;
  filter?: InventoryFilter;
  page?: number;
  perPage?: number;
}

export interface InventoryList {
  items: InventoryRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export async function listInventory(q: InventoryQuery = {}): Promise<InventoryList> {
  const perPage = Math.min(100, Math.max(10, q.perPage ?? 25));
  const page = Math.max(1, q.page ?? 1);
  const admin = getSupabaseAdmin();
  if (!admin) return { items: [], total: 0, page, perPage, pageCount: 1 };

  let query = admin.from("inventory_overview").select("*", { count: "exact" });

  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${s}%,slug.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`);
  }
  switch (q.filter) {
    case "low":
      query = query.eq("is_low", true);
      break;
    case "oversold":
      query = query.eq("is_oversold", true);
      break;
    case "unavailable":
      query = query.eq("is_unavailable", true);
      break;
  }

  const from = (page - 1) * perPage;
  // Lowest stock first — whatever needs buying floats to the top.
  const { data, count, error } = await query
    .order("stock_quantity", { ascending: true })
    .order("name", { ascending: true })
    .range(from, from + perPage - 1);

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    items: (data ?? []).map(mapInventory),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getInventoryItem(productId: string): Promise<InventoryRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("inventory_overview")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (error || !data) return null;
  return mapInventory(data);
}

/* -------------------------------- stats --------------------------------- */

export interface InventoryStats {
  productCount: number;
  unavailableCount: number;
  lowCount: number;
  oversoldCount: number;
  totalUnits: number;
  totalValue: number;
  /** True when no product has a cost price, so valuation can't be meaningful yet. */
  valuationIncomplete: boolean;
}

export async function getInventoryStats(): Promise<InventoryStats> {
  const empty: InventoryStats = {
    productCount: 0,
    unavailableCount: 0,
    lowCount: 0,
    oversoldCount: 0,
    totalUnits: 0,
    totalValue: 0,
    valuationIncomplete: true,
  };
  const admin = getSupabaseAdmin();
  if (!admin) return empty;

  const { data, error } = await admin
    .from("inventory_overview")
    .select("stock_quantity,cost_price,is_low,is_oversold,is_unavailable");
  if (error || !data) return empty;

  const stats = { ...empty };
  let anyCost = false;

  for (const row of data as any[]) {
    const qty = Number(row.stock_quantity ?? 0);
    stats.productCount += 1;
    stats.totalUnits += Math.max(0, qty);
    if (row.cost_price != null) {
      anyCost = true;
      stats.totalValue += Math.max(0, qty) * Number(row.cost_price);
    }
    if (row.is_unavailable) stats.unavailableCount += 1;
    if (row.is_low) stats.lowCount += 1;
    if (row.is_oversold) stats.oversoldCount += 1;
  }

  stats.totalValue = Math.round(stats.totalValue * 1000) / 1000;
  stats.valuationIncomplete = !anyCost;
  return stats;
}

/* ------------------------------- movements ------------------------------ */

const MOVEMENT_SELECT = "*, product:products(name,slug)";

export async function getProductMovements(productId: string, limit = 50): Promise<MovementRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from("stock_movements")
    .select(MOVEMENT_SELECT)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapMovement);
}

export async function getRecentMovements(limit = 50): Promise<MovementRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from("stock_movements")
    .select(MOVEMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapMovement);
}

export interface MovementInput {
  productId: string;
  delta: number;
  reason: MovementReason;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actor?: string | null;
}

/** Applies one movement atomically and returns the new on-hand balance. */
export async function recordMovement(input: MovementInput): Promise<number | null> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");

  const { data, error } = await admin.rpc("apply_stock_movement", {
    p_product_id: input.productId,
    p_delta: Math.trunc(input.delta),
    p_reason: input.reason,
    p_affects_stock: true,
    p_note: input.note ?? null,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_actor: input.actor ?? "system",
  });

  if (error) throw new Error(error.message);
  return data == null ? null : Number(data);
}

/**
 * Sets on-hand to an absolute figure by recording the difference, so "set to
 * 40" still leaves a signed ledger entry rather than a silent overwrite.
 */
export async function setStockLevel(args: {
  productId: string;
  newQuantity: number;
  reason: MovementReason;
  note?: string | null;
  actor: string;
  referenceType?: string | null;
  referenceId?: string | null;
}): Promise<{ delta: number; balance: number | null }> {
  const current = await getInventoryItem(args.productId);
  if (!current) throw new Error("Product not found.");

  const target = Math.trunc(args.newQuantity);
  const delta = target - current.stockQuantity;
  if (delta === 0) return { delta: 0, balance: current.stockQuantity };

  const balance = await recordMovement({
    productId: args.productId,
    delta,
    reason: args.reason,
    note: args.note ?? null,
    referenceType: args.referenceType ?? null,
    referenceId: args.referenceId ?? null,
    actor: args.actor,
  });
  return { delta, balance };
}

/** Turn a product on or off for sale. This is what actually gates checkout. */
export async function setProductAvailability(
  productId: string,
  available: boolean,
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  const { error } = await admin
    .from("products")
    .update({ in_stock: available })
    .eq("id", productId);
  if (error) throw new Error(error.message);
}

/* ------------------------------ order hooks ----------------------------- */

interface OrderLine {
  product_id: string | null;
  name: string;
  quantity: number;
}

/** Statuses in which an order is considered to be consuming stock. */
const CONSUMING_STATUSES = new Set(["paid", "fulfilled"]);

/**
 * Brings the ledger in line with an order's current status.
 *
 * Rather than posting a one-way "sale" or "restock", this compares what the
 * order has *already* posted against what its status says it should have, and
 * writes only the difference. That makes it idempotent and correct for every
 * transition: a duplicate webhook posts nothing, cancelling a paid order
 * returns the units, and un-cancelling takes them out again.
 *
 * On-hand may go negative — selling something not on the shelf is normal when
 * stock is sourced per order, and the shortfall is the buying list.
 *
 * Best-effort: bookkeeping must never fail a payment Stripe already captured,
 * so per-line failures are logged and skipped rather than thrown.
 */
export async function reconcileOrderStock(args: {
  orderId: string;
  status: string;
  actor?: string;
}): Promise<{ adjusted: number; skipped: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { adjusted: 0, skipped: 0 };

  const [linesRes, movementsRes] = await Promise.all([
    admin.from("order_items").select("product_id,name,quantity").eq("order_id", args.orderId),
    admin
      .from("stock_movements")
      .select("product_id,delta")
      .eq("reference_type", "order")
      .eq("reference_id", args.orderId),
  ]);

  if (linesRes.error || !linesRes.data?.length) return { adjusted: 0, skipped: 0 };

  const withProduct = (linesRes.data as OrderLine[]).filter((l) => l.product_id);
  let skipped = linesRes.data.length - withProduct.length;
  if (!withProduct.length) return { adjusted: 0, skipped };

  // Net units already posted for this order, per product.
  const posted = new Map<string, number>();
  for (const m of (movementsRes.data ?? []) as any[]) {
    const key = m.product_id as string;
    posted.set(key, (posted.get(key) ?? 0) + Number(m.delta ?? 0));
  }

  const consuming = CONSUMING_STATUSES.has(args.status);
  let adjusted = 0;

  for (const line of withProduct) {
    const productId = line.product_id as string;
    const magnitude = Math.max(0, Math.trunc(line.quantity));
    if (!magnitude) continue;

    const target = consuming ? -magnitude : 0;
    const delta = target - (posted.get(productId) ?? 0);
    if (delta === 0) continue;

    try {
      await recordMovement({
        productId,
        delta,
        reason: delta < 0 ? "sale" : "restock",
        referenceType: "order",
        referenceId: args.orderId,
        actor: args.actor ?? "system",
      });
      adjusted += 1;
    } catch (e) {
      skipped += 1;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[inventory] reconcile failed for ${line.name} on order ${args.orderId}: ${(e as Error).message}`,
        );
      }
    }
  }

  return { adjusted, skipped };
}

/* --------------------------------- CSV ---------------------------------- */

const QTY_KEYS = [
  "quantity",
  "qty",
  "stock",
  "stock_quantity",
  "on_hand",
  "onhand",
  "counted",
  "count",
  "new_quantity",
];

export interface CsvQtyRow {
  line: number;
  key: string;
  quantity: number;
}

/** Reads a two-column stock sheet: product identifier + absolute quantity. */
export function readQuantityCsv(text: string): {
  rows: CsvQtyRow[];
  invalid: Array<{ line: number; reason: string }>;
  idHeader: string;
  qtyHeader: string;
} {
  const parsed = parseCsvWithHeader(text);
  if (!parsed) throw new Error("That file is empty.");

  const idHeader = parsed.headers.find((h) => ID_KEYS.includes(h));
  const qtyHeader = parsed.headers.find((h) => QTY_KEYS.includes(h));

  if (!idHeader) {
    throw new Error(
      `No product column found. Expected one of: ${ID_KEYS.join(", ")}. Found: ${parsed.headers.join(", ") || "(none)"}.`,
    );
  }
  if (!qtyHeader) {
    throw new Error(
      `No quantity column found. Expected one of: ${QTY_KEYS.join(", ")}. Found: ${parsed.headers.join(", ") || "(none)"}.`,
    );
  }

  const rows: CsvQtyRow[] = [];
  const invalid: Array<{ line: number; reason: string }> = [];

  parsed.rows.forEach((r, idx) => {
    const line = idx + 2; // header is line 1
    const key = (r[idHeader] ?? "").trim();
    const raw = (r[qtyHeader] ?? "").trim().replace(/[^0-9\-]/g, "");

    if (!key) return invalid.push({ line, reason: "Missing product id, slug or SKU" });
    if (!raw) return invalid.push({ line, reason: "Missing quantity" });

    const quantity = Number(raw);
    if (!Number.isInteger(quantity)) {
      invalid.push({ line, reason: `Not a whole number: "${r[qtyHeader]}"` });
      return;
    }
    rows.push({ line, key, quantity });
  });

  return { rows, invalid, idHeader, qtyHeader };
}

/** Resolve CSV keys against id, slug or SKU. */
async function resolveInventoryKeys(keys: string[]): Promise<Map<string, InventoryRow>> {
  const admin = getSupabaseAdmin();
  const found = new Map<string, InventoryRow>();
  if (!admin || !keys.length) return found;

  const { ids, slugs } = splitKeys(keys);

  for (const part of chunk(ids, 200)) {
    const { data } = await admin.from("inventory_overview").select("*").in("id", part);
    for (const row of data ?? []) found.set(row.id as string, mapInventory(row));
  }
  // Non-UUID keys may be either a slug or a SKU; try both.
  for (const part of chunk(slugs, 200)) {
    const { data } = await admin.from("inventory_overview").select("*").in("slug", part);
    for (const row of data ?? []) found.set(row.slug as string, mapInventory(row));

    const unresolved = part.filter((k) => !found.has(k));
    if (unresolved.length) {
      const { data: bySku } = await admin
        .from("inventory_overview")
        .select("*")
        .in("sku", unresolved);
      for (const row of bySku ?? []) found.set(row.sku as string, mapInventory(row));
    }
  }
  return found;
}

export interface StockChange {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  from: number;
  to: number;
  delta: number;
}

export interface StockCsvResult {
  applied: boolean;
  /** 'set' rewrites on-hand; 'count' is a stock take and reports variance. */
  mode: "set" | "count";
  total: number;
  changes: StockChange[];
  unchanged: number;
  notFound: Array<{ line: number; key: string }>;
  invalid: Array<{ line: number; reason: string }>;
  idHeader: string;
  qtyHeader: string;
  /** Net units gained/lost — the headline number for a stock take. */
  netUnits: number;
}

/**
 * Bulk stock update and stock take share one implementation: both compare a
 * sheet of absolute quantities against on-hand and write the difference. They
 * differ only in the ledger reason ('adjustment' vs 'count') and in how the UI
 * frames the result, so a stock take reads as variance rather than an edit.
 */
export async function applyStockCsv(
  text: string,
  opts: { apply: boolean; mode: "set" | "count"; actor: string },
): Promise<StockCsvResult> {
  const { rows, invalid, idHeader, qtyHeader } = readQuantityCsv(text);
  const found = await resolveInventoryKeys(rows.map((r) => r.key));

  const changes: StockChange[] = [];
  const notFound: Array<{ line: number; key: string }> = [];
  let unchanged = 0;

  for (const r of rows) {
    const p = found.get(r.key);
    if (!p) {
      notFound.push({ line: r.line, key: r.key });
      continue;
    }
    if (p.stockQuantity === r.quantity) {
      unchanged++;
      continue;
    }
    changes.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      from: p.stockQuantity,
      to: r.quantity,
      delta: r.quantity - p.stockQuantity,
    });
  }

  if (opts.apply && changes.length) {
    // One reference id ties this batch together in the ledger, so a stock take
    // can be reviewed as a single event afterwards.
    const batchId = crypto.randomUUID();
    for (const c of changes) {
      await recordMovement({
        productId: c.id,
        delta: c.delta,
        reason: opts.mode === "count" ? "count" : "adjustment",
        note: opts.mode === "count" ? "Stock take" : "Bulk stock update",
        referenceType: opts.mode === "count" ? "stock_take" : "bulk_update",
        referenceId: batchId,
        actor: opts.actor,
      });
    }
  }

  return {
    applied: opts.apply,
    mode: opts.mode,
    total: rows.length,
    changes,
    unchanged,
    notFound,
    invalid,
    idHeader,
    qtyHeader,
    netUnits: changes.reduce((s, c) => s + c.delta, 0),
  };
}
