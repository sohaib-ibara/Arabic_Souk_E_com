import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase/server";
import { siteConfig } from "./config";
import {
  sendNewOrderAlert,
  sendOrderConfirmation,
  sendOrderStatusToAdmin,
  sendOrderStatusToCustomer,
  type OrderEmail,
  type OrderNotifyStatus,
  type SendResult,
} from "./email";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Who gets told what about an order, and when.
 *
 * Its own module because both halves of the shop need it and neither should
 * import the other: `orders.ts` is the storefront's write path and
 * `admin-orders.ts` is the console's, and the thing they share is only "read
 * the order back, then post about it".
 *
 * Reading the order back rather than being handed the figures is the point of
 * the shape. A message that disagrees with the order is worse than no message,
 * and the row is the only thing that knows what was actually stored.
 *
 * WHEN EACH ONE FIRES, and why it is not simply "on every status change":
 *
 *   notifyNewOrder      once, at the moment the order becomes real. For cash
 *                       that is when it is written; for a card it is when
 *                       Stripe confirms the payment, which is also the moment
 *                       it becomes `paid`. Sends the customer's confirmation
 *                       and the staff copy.
 *
 *   notifyStatusChange  when a member of staff moves an order to paid,
 *                       fulfilled or cancelled in the console. Sends both.
 *
 * A card order therefore does NOT get a "payment received" mail on top of its
 * confirmation — the confirmation already says "Paid by card. Nothing further
 * is due.", and two mails a second apart saying the same thing reads as a
 * fault. `pending` and `confirmed` are passed through silently: nobody needs
 * telling that an order they just placed exists.
 *
 * Nothing here throws, and nothing here is awaited for its result. Every caller
 * sits behind something that has already happened.
 */

type Admin = SupabaseClient<any, any, any>;

const SELECT =
  "id, order_number, email, full_name, phone, currency, subtotal, shipping_fee, total, payment_method, shipping_address, order_items(name,quantity,unit_price)";

/** One order, in the shape the templates want. Null if it cannot be mailed. */
export async function loadOrderEmail(admin: Admin, orderId: string): Promise<OrderEmail | null> {
  const { data } = await admin.from("orders").select(SELECT).eq("id", orderId).maybeSingle();
  if (!data?.email) return null;

  const row = data as any;
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
    email: row.email as string,
    fullName: (row.full_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    currency: (row.currency as string) ?? siteConfig.currency,
    subtotal: Number(row.subtotal ?? 0),
    shipping: Number(row.shipping_fee ?? 0),
    total: Number(row.total ?? 0),
    paymentMethod: (row.payment_method as "card" | "cod") ?? "card",
    address: (row.shipping_address as OrderEmail["address"]) ?? null,
    items: (Array.isArray(row.order_items) ? row.order_items : []).map((li: any) => ({
      name: li.name as string,
      quantity: Number(li.quantity ?? 0),
      unitPrice: Number(li.unit_price ?? 0),
    })),
  };
}

/** Logs a failed send in development. Silent in production by design — a
 *  mail that did not go is not a reason to put noise in the request log of a
 *  shop that took the order successfully. */
function note(what: string, result: SendResult): void {
  if (result.ok) return;
  // "not_configured" and "no_admin_recipient" are ordinary states, not faults:
  // a shop with no SMTP credentials is supported, and saying so on every order
  // would bury the reasons that do need looking at.
  if (result.reason === "not_configured" || result.reason === "no_admin_recipient") return;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[email] ${what}: ${result.reason}`);
  }
}

/**
 * A new order: the customer's confirmation, and the staff copy.
 *
 * The two are sent together rather than one after the other, because the staff
 * copy failing must not cost the customer theirs and the reverse is just as
 * true. `allSettled` semantics come free — neither send throws.
 */
export async function notifyNewOrder(admin: Admin, orderId: string): Promise<void> {
  try {
    const order = await loadOrderEmail(admin, orderId);
    if (!order) return;
    const [customer, staff] = await Promise.all([
      sendOrderConfirmation(order),
      sendNewOrderAlert(order),
    ]);
    note(`confirmation for ${order.orderNumber}`, customer);
    note(`staff notice for ${order.orderNumber}`, staff);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[email] new order ${orderId} failed: ${(e as Error).message}`);
    }
  }
}

/** A status a member of staff set: both parties hear about it. */
export async function notifyStatusChange(
  orderId: string,
  status: OrderNotifyStatus,
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    const order = await loadOrderEmail(admin, orderId);
    if (!order) return;
    const [customer, staff] = await Promise.all([
      sendOrderStatusToCustomer(order, status),
      sendOrderStatusToAdmin(order, status),
    ]);
    note(`${status} notice to ${order.email} for ${order.orderNumber}`, customer);
    note(`${status} notice to staff for ${order.orderNumber}`, staff);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[email] status ${status} for order ${orderId} failed: ${(e as Error).message}`);
    }
  }
}
