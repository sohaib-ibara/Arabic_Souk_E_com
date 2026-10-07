import { getSupabaseAdmin } from "./supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Admin-side order access, read and written with the service-role client.
 *
 * `orders` has RLS with a customer-only read policy (migration 0004), so the
 * anon key can't see anything here — the service role is required, and every
 * caller must already have passed the admin session check.
 */

/** Mirrors the CHECK constraint on `orders.status` (0001, extended in 0009). */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "paid",
  "fulfilled",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Mirrors the CHECK constraint on `orders.payment_method` (0009). */
export type OrderPaymentMethod = "card" | "cod";

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

export interface OrderItemRow {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  productId: string | null;
  /**
   * Where staff go to buy this line, read live from the product rather than
   * copied onto the order: fulfilment happens within days, and correcting a
   * wrong link on the product should fix every order still open. Null when the
   * product has no link yet, or has since been deleted from the catalogue.
   */
  sourceUrl: string | null;
  /**
   * Which supplier this line has to be bought from — the vendor `key`, null
   * for a product added by hand. Everything below is read live from the
   * product for the same reason `sourceUrl` is, and exists so the order can be
   * turned into a purchase request per supplier.
   */
  source: string | null;
  /** The supplier's own code for it, which is what they will recognise. */
  sourceSku: string | null;
  /** What the SUPPLIER charges, in their currency — not our shelf price. */
  supplierPrice: number | null;
  supplierCurrency: string | null;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  address: {
    address: string | null;
    area: string | null;
    city: string | null;
    governorate: string | null;
  };
  subtotal: number;
  shippingFee: number;
  total: number;
  currency: string;
  paymentMethod: OrderPaymentMethod;
  stripePaymentIntent: string | null;
  createdAt: string;
  itemCount: number;
  items?: OrderItemRow[];
}

function mapOrder(row: any, withItems = false): OrderRow {
  const addr = row.shipping_address ?? {};
  const order: OrderRow = {
    id: row.id,
    orderNumber: row.order_number,
    status: (isOrderStatus(row.status) ? row.status : "pending") as OrderStatus,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    phone: row.phone ?? null,
    address: {
      address: addr.address ?? null,
      area: addr.area ?? null,
      city: addr.city ?? null,
      governorate: addr.governorate ?? null,
    },
    subtotal: Number(row.subtotal ?? 0),
    shippingFee: Number(row.shipping_fee ?? 0),
    total: Number(row.total ?? 0),
    currency: row.currency ?? "BHD",
    paymentMethod: row.payment_method === "cod" ? "cod" : "card",
    stripePaymentIntent: row.stripe_payment_intent ?? null,
    createdAt: row.created_at,
    itemCount: 0,
  };

  if (withItems) {
    const items = (row.items ?? []) as any[];
    order.items = items.map((i) => ({
      id: i.id,
      name: i.name,
      unitPrice: Number(i.unit_price ?? 0),
      quantity: Number(i.quantity ?? 0),
      productId: i.product_id ?? null,
      sourceUrl: i.product?.source_url ?? null,
      source: i.product?.source ?? null,
      sourceSku: i.product?.source_sku ?? null,
      // A supplier price of zero means "they would not quote one", which is
      // not a price — see the same rule in the importer and in <Price>.
      supplierPrice: Number(i.product?.source_price) > 0 ? Number(i.product.source_price) : null,
      supplierCurrency: i.product?.source_currency ?? null,
    }));
    order.itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  } else {
    // `items:order_items(count)` returns [{ count: n }].
    order.itemCount = Number(row.items?.[0]?.count ?? 0);
  }

  return order;
}

export interface OrdersQuery {
  status?: OrderStatus | "all";
  search?: string;
  page?: number;
  perPage?: number;
  /** Inclusive date window on when the order was placed, as yyyy-mm-dd. */
  from?: string;
  to?: string;
}

/**
 * A yyyy-mm-dd day turned into the instant range it covers.
 *
 * Local midnight to local midnight, not UTC: "orders for the 7th" means the
 * day the staff in Bahrain lived through, and the two differ by three hours —
 * enough to put an evening order on the wrong day's purchase request, which
 * is the one mistake this window exists to prevent.
 */
export function dayBounds(day: string, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface OrdersResult {
  items: OrderRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  /** Set when orders can't be read at all — shown instead of an empty table. */
  error: string | null;
  countsByStatus: Record<OrderStatus, number>;
  revenue: number;
}

const EMPTY_COUNTS: Record<OrderStatus, number> = {
  pending: 0,
  confirmed: 0,
  paid: 0,
  fulfilled: 0,
  cancelled: 0,
};

export async function listOrders(q: OrdersQuery = {}): Promise<OrdersResult> {
  const perPage = Math.min(100, Math.max(10, q.perPage ?? 25));
  const page = Math.max(1, q.page ?? 1);
  const base: OrdersResult = {
    items: [],
    total: 0,
    page,
    perPage,
    pageCount: 1,
    error: null,
    countsByStatus: { ...EMPTY_COUNTS },
    revenue: 0,
  };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ...base,
      error: "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local to manage orders.",
    };
  }

  let query = admin
    .from("orders")
    .select("*, items:order_items(count)", { count: "exact" });

  if (q.status && q.status !== "all") query = query.eq("status", q.status);
  const fromAt = q.from ? dayBounds(q.from) : null;
  const toAt = q.to ? dayBounds(q.to, true) : null;
  if (fromAt) query = query.gte("created_at", fromAt);
  if (toAt) query = query.lte("created_at", toAt);
  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%,]/g, "");
    query = query.or(`order_number.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }

  const from = (page - 1) * perPage;
  const [listRes, statusRes] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, from + perPage - 1),
    // Status counts + revenue are computed across ALL orders, not just this
    // page, so the summary tiles don't change as you paginate.
    admin.from("orders").select("status,total"),
  ]);

  if (listRes.error) {
    return {
      ...base,
      error: `Couldn't load orders — has migration 0004 been run? (${listRes.error.message})`,
    };
  }

  const counts = { ...EMPTY_COUNTS };
  let revenue = 0;
  for (const row of (statusRes.data ?? []) as any[]) {
    // Narrow off `any` first, otherwise the guard can't type the index.
    const rowStatus = String(row.status ?? "");
    if (isOrderStatus(rowStatus)) counts[rowStatus] += 1;
    // Revenue counts money actually captured — pending and cancelled don't.
    if (rowStatus === "paid" || rowStatus === "fulfilled") revenue += Number(row.total ?? 0);
  }

  const total = listRes.count ?? 0;
  return {
    items: (listRes.data ?? []).map((r) => mapOrder(r)),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    error: null,
    countsByStatus: counts,
    revenue: Math.round(revenue * 1000) / 1000,
  };
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("orders")
    .select(
      "*, items:order_items(id,name,unit_price,quantity,product_id," +
        "product:products(source_url,source,source_sku,source_price,source_currency))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapOrder(data, true);
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");
  const { error } = await admin.from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------- purchase requests --------------------------- */

/**
 * Which statuses mean "we owe a supplier these goods".
 *
 *   confirmed  a cash order. Committed, money arrives on delivery, and the
 *              stock has to be bought before then.
 *   paid       committed and paid for.
 *
 * Everything else is excluded, and each exclusion is the answer to "would
 * buying this be a mistake":
 *
 *   pending    the card payment never completed. Buying stock for it is
 *              buying stock for an order that may never exist.
 *   cancelled  obviously.
 *   fulfilled  already bought and delivered. Including it would buy it twice,
 *              which is the expensive direction to be wrong in.
 */
export const PURCHASE_STATUSES: OrderStatus[] = ["confirmed", "paid"];

export interface PurchaseOrdersResult {
  orders: Array<{ orderNumber: string; items: OrderItemRow[] }>;
  /** How many orders were looked at, before any supplier split. */
  orderCount: number;
  /** True when the window held more orders than one request should carry. */
  truncated: boolean;
  error: string | null;
}

/** Orders that still need buying, within an optional date window. */
const PURCHASE_LIMIT = 500;

/**
 * Every line we still have to buy, for the orders in a window.
 *
 * A separate read from `listOrders` and deliberately so: that one is a table
 * of 25 rows and must stay cheap, while this needs every matching order's
 * lines and each line's product. Asking the table query for all of that would
 * make paginating the orders screen pay for an export nobody asked for.
 */
export async function listOrdersToBuy(q: {
  from?: string;
  to?: string;
  status?: OrderStatus | "all";
  search?: string;
} = {}): Promise<PurchaseOrdersResult> {
  const empty: PurchaseOrdersResult = {
    orders: [],
    orderCount: 0,
    truncated: false,
    error: null,
  };

  const admin = getSupabaseAdmin();
  if (!admin) return { ...empty, error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };

  let query = admin
    .from("orders")
    .select(
      "order_number, created_at, status, items:order_items(id,name,unit_price,quantity,product_id," +
        "product:products(source_url,source,source_sku,source_price,source_currency))",
    );

  /*
    A status filter on the screen narrows this; no filter does NOT mean "every
    status". The page can be showing cancelled orders while the thing being
    exported is a purchase request, and a request is only ever for orders that
    still need buying. Picking a status outside that set gives an empty file
    rather than a wrong one.
  */
  if (q.status && q.status !== "all") {
    if (!PURCHASE_STATUSES.includes(q.status)) return empty;
    query = query.eq("status", q.status);
  } else {
    query = query.in("status", PURCHASE_STATUSES);
  }

  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%,]/g, "");
    query = query.or(`order_number.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }

  const fromAt = q.from ? dayBounds(q.from) : null;
  const toAt = q.to ? dayBounds(q.to, true) : null;
  if (fromAt) query = query.gte("created_at", fromAt);
  if (toAt) query = query.lte("created_at", toAt);

  // One more than the limit, so "there are more" is a fact rather than a guess.
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(PURCHASE_LIMIT + 1);

  if (error) return { ...empty, error: error.message };

  const rows = (data ?? []) as any[];
  const truncated = rows.length > PURCHASE_LIMIT;

  return {
    orders: rows.slice(0, PURCHASE_LIMIT).map((row) => ({
      orderNumber: row.order_number as string,
      items: mapOrder(row, true).items ?? [],
    })),
    orderCount: Math.min(rows.length, PURCHASE_LIMIT),
    truncated,
    error: null,
  };
}
