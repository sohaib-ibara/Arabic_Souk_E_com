import { getSupabaseAdmin } from "./supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Admin-side order access, read and written with the service-role client.
 *
 * `orders` has RLS with a customer-only read policy (migration 0004), so the
 * anon key can't see anything here — the service role is required, and every
 * caller must already have passed the admin session check.
 */

/** Mirrors the CHECK constraint on `orders.status` in migration 0001. */
export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

export interface OrderItemRow {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  productId: string | null;
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
    .select("*, items:order_items(id,name,unit_price,quantity,product_id)")
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
