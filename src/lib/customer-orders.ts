import { getSupabaseUserServer } from "./supabase/user-server";
import { siteConfig } from "./config";

/**
 * A customer reading their own order history.
 *
 * Kept apart from `orders.ts` on purpose: this is the only order code that
 * needs a request-scoped session, and `orders.ts` is imported by the Stripe
 * webhook — a context with no cookies at all. Pulling `next/headers` in there
 * would tie the payment path to the request lifecycle for no reason.
 */

export interface MyOrderLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface MyOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  items: MyOrderLine[];
}

interface RawLine {
  name: string;
  quantity: number;
  unit_price: number;
}

/**
 * The signed-in customer's own orders, newest first.
 *
 * Deliberately uses the cookie-scoped client rather than the service role: the
 * "read own orders" RLS policy from migration 0004 is what limits the result to
 * this customer, so the database enforces the boundary rather than a `.eq()`
 * that a future edit could quietly drop.
 */
export async function getMyOrders(limit = 20): Promise<MyOrder[]> {
  const sb = await getSupabaseUserServer();
  if (!sb) return [];

  const { data, error } = await sb
    .from("orders")
    .select(
      "id,order_number,status,total,currency,created_at,order_items(name,quantity,unit_price)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((o) => ({
    id: o.id as string,
    orderNumber: o.order_number as string,
    status: o.status as string,
    total: Number(o.total ?? 0),
    currency: (o.currency as string) ?? siteConfig.currency,
    createdAt: o.created_at as string,
    items: (Array.isArray(o.order_items) ? (o.order_items as RawLine[]) : []).map((li) => ({
      name: li.name,
      quantity: Number(li.quantity ?? 0),
      unitPrice: Number(li.unit_price ?? 0),
    })),
  }));
}
