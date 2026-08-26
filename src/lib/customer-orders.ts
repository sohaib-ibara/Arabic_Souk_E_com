import { getSupabaseUserServer } from "./supabase/user-server";
import { getSupabaseAdmin } from "./supabase/server";
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
  /** Where this order is going, as the customer gave it at checkout. */
  contact: {
    fullName: string | null;
    phone: string | null;
    address: string[];
  };
}

interface RawLine {
  name: string;
  quantity: number;
  unit_price: number;
}

interface RawAddress {
  address?: string | null;
  area?: string | null;
  city?: string | null;
  governorate?: string | null;
}

/** The address as lines worth printing — blanks dropped, order preserved. */
function addressLines(raw: unknown): string[] {
  const a = (raw ?? {}) as RawAddress;
  return [a.address, a.area, a.city, a.governorate].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

/**
 * Attaches a customer's earlier guest orders to their new account.
 *
 * Guest checkout writes orders with no `user_id`, which the per-user RLS policy
 * can never return. Without this, a guest who takes up the offer to "create an
 * account and track this order" signs in to an empty order list — the account
 * looks broken at the exact moment it was supposed to prove its worth.
 *
 * The email is the link, and `emailConfirmed` is what makes that safe: Supabase
 * has seen the address prove itself, so this can only ever hand someone orders
 * placed to a mailbox they control. Never call it on an unconfirmed address.
 *
 * Best-effort — a failure here costs visibility of old orders, not the orders.
 */
export async function claimGuestOrders(userId: string, email: string): Promise<void> {
  if (!email) return;
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    await admin
      .from("orders")
      .update({ user_id: userId })
      .is("user_id", null)
      .eq("email", email);
  } catch {
    // Nothing to recover: the orders remain, just unlinked.
  }
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
      "id,order_number,status,total,currency,created_at,full_name,phone,shipping_address,order_items(name,quantity,unit_price)",
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
    contact: {
      fullName: (o.full_name as string | null) ?? null,
      phone: (o.phone as string | null) ?? null,
      address: addressLines(o.shipping_address),
    },
  }));
}
