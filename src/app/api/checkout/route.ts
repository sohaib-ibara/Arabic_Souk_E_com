import { NextResponse } from "next/server";
import { checkStock, recordDemand, type DemandContact } from "@/lib/data";

/** Coerce untrusted input to a trimmed, length-capped string (or undefined). */
function clean(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/**
 * Checkout endpoint.
 *
 * 1. Validates the cart against real inventory. During the demo phase the
 *    catalogue carries zero stock, so this returns a 409 with the out-of-stock
 *    line items — driving the "sorry, out of stock" experience.
 * 2. Records the attempt (contact + wanted items) as a demand signal, so the
 *    store keeps a log of who wants which product even while out of stock. This
 *    is best-effort and never blocks the response.
 *
 * When real inventory exists in Supabase, in-stock carts pass and the TODO
 * below becomes order creation + payment.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const rawItems = Array.isArray(obj.items)
    ? (obj.items as Array<Record<string, unknown>>)
    : [];

  if (rawItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: "empty_cart", issues: [] },
      { status: 400 },
    );
  }

  const items = rawItems.map((i) => ({
    productId: String(i.productId ?? ""),
    quantity: Math.max(1, Number(i.quantity) || 1),
  }));

  const rawContact = (obj.contact && typeof obj.contact === "object" ? obj.contact : {}) as Record<
    string,
    unknown
  >;
  const contact: DemandContact = {
    fullName: clean(rawContact.fullName),
    email: clean(rawContact.email),
    phone: clean(rawContact.phone),
    address: clean(rawContact.address),
    area: clean(rawContact.area),
    city: clean(rawContact.city),
    governorate: clean(rawContact.governorate),
  };

  const result = await checkStock(items);

  // Capture demand (best-effort) — records who wanted what, in or out of stock.
  await recordDemand({ contact, items, allInStock: result.ok });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "out_of_stock", issues: result.issues },
      { status: 409 },
    );
  }

  // TODO (next phase): create the order + order_items in Supabase (service role),
  // decrement stock, and hand off to a payment provider (BENEFIT / card / Apple Pay).
  return NextResponse.json({ ok: true });
}
