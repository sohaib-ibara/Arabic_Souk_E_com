import { getSupabaseAdmin } from "./supabase/server";
import { siteConfig } from "./config";

/**
 * Looking up an order without being signed in.
 *
 * Guests can check out now, so for most orders there is no account to log into
 * and the signed cookie from checkout is gone within a couple of hours. Without
 * this, a guest who wanted to know where their delivery was had nowhere to ask —
 * which is exactly what the "Track your order" link promised and couldn't do.
 *
 * The order number and the email together are the credential: knowing one
 * without the other proves nothing. That's why both are required and why a
 * mismatch returns the same answer as a miss — telling someone their guess of
 * the order number was right and only the email was wrong would hand them half
 * the key.
 *
 * Read with the service role deliberately. The per-user RLS policy has no
 * session to match here, and the alternative — a policy that lets anyone read an
 * order by number — would be far weaker than this pair check.
 */

export interface TrackedLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface TrackedOrder {
  orderNumber: string;
  status: string;
  paymentMethod: "card" | "cod";
  createdAt: string;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  fullName: string | null;
  phone: string | null;
  address: string[];
  items: TrackedLine[];
}

/** Normalised so "lm-1a2b" and " LM-1A2B " find the same order. */
function normaliseNumber(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}

interface RawAddress {
  address?: string | null;
  area?: string | null;
  city?: string | null;
  governorate?: string | null;
}

function addressLines(raw: unknown): string[] {
  const a = (raw ?? {}) as RawAddress;
  return [a.address, a.area, a.city, a.governorate].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

export type TrackResult =
  | { ok: true; order: TrackedOrder }
  | { ok: false; reason: "not_found" | "unavailable" };

/**
 * The tracking form's state. Declared here rather than beside the action: a
 * "use server" module may only export async functions, so its types have to
 * live somewhere a client component can also import from.
 */
export interface TrackState {
  order: TrackedOrder | null;
  error: string | null;
  /** Echoed back so a failed lookup doesn't clear what was typed. */
  values: { orderNumber: string; email: string };
}

export async function findOrderForTracking(
  orderNumber: string,
  email: string,
): Promise<TrackResult> {
  const number = normaliseNumber(orderNumber);
  const addr = email.trim().toLowerCase();
  if (!number || !addr) return { ok: false, reason: "not_found" };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data, error } = await admin
    .from("orders")
    .select(
      "order_number, email, status, payment_method, created_at, currency, subtotal, shipping_fee, total, full_name, phone, shipping_address, order_items(name,quantity,unit_price)",
    )
    .eq("order_number", number)
    .maybeSingle();

  if (error) return { ok: false, reason: "unavailable" };
  // Same answer for "no such order" and "wrong email": see the note above.
  if (!data || String(data.email ?? "").trim().toLowerCase() !== addr) {
    return { ok: false, reason: "not_found" };
  }

  return {
    ok: true,
    order: {
      orderNumber: data.order_number as string,
      status: data.status as string,
      paymentMethod: ((data.payment_method as string) ?? "card") as "card" | "cod",
      createdAt: data.created_at as string,
      currency: (data.currency as string) ?? siteConfig.currency,
      subtotal: Number(data.subtotal ?? 0),
      shipping: Number(data.shipping_fee ?? 0),
      total: Number(data.total ?? 0),
      fullName: (data.full_name as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      address: addressLines(data.shipping_address),
      items: (Array.isArray(data.order_items) ? data.order_items : []).map((li) => ({
        name: (li as { name: string }).name,
        quantity: Number((li as { quantity: number }).quantity ?? 0),
        unitPrice: Number((li as { unit_price: number }).unit_price ?? 0),
      })),
    },
  };
}

/**
 * What each status means to the person waiting for a parcel.
 *
 * The admin's vocabulary isn't the customer's: "confirmed" tells a shopper
 * nothing, and "pending" sounds like the shop is thinking about it rather than
 * waiting to be paid. Each step also says what happens next, because that is
 * the actual question behind tracking an order.
 */
export const TRACKING_STEPS = ["placed", "preparing", "on_the_way", "delivered"] as const;
export type TrackingStep = (typeof TRACKING_STEPS)[number];

export interface StatusView {
  label: string;
  detail: string;
  /** How far along the four steps, or null when the order stopped. */
  step: TrackingStep | null;
  tone: "waiting" | "active" | "done" | "stopped";
}

export function describeStatus(status: string, paymentMethod: "card" | "cod"): StatusView {
  switch (status) {
    case "pending":
      return {
        label: "Awaiting payment",
        detail:
          "We haven't received payment for this order yet, so it hasn't been prepared. If you meant to pay by card, you can place the order again.",
        step: "placed",
        tone: "waiting",
      };
    case "confirmed":
      return {
        label: "Confirmed",
        detail:
          paymentMethod === "cod"
            ? "We're preparing your order. Please have the cash total ready for the courier."
            : "We're preparing your order for delivery.",
        step: "preparing",
        tone: "active",
      };
    case "paid":
      return {
        label: "Paid — preparing your order",
        detail: `Payment received. We're getting your order ready to send, and deliver across ${siteConfig.country} within ${siteConfig.shipping.etaDays}.`,
        step: "preparing",
        tone: "active",
      };
    case "fulfilled":
      return {
        label: "Delivered",
        detail: "This order has been delivered. We hope you love it.",
        step: "delivered",
        tone: "done",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        detail: "This order was cancelled and nothing is owed. Contact us if that's unexpected.",
        step: null,
        tone: "stopped",
      };
    default:
      return { label: status, detail: "", step: "placed", tone: "waiting" };
  }
}
