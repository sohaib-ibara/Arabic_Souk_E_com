import { NextResponse } from "next/server";
import { checkStock } from "@/lib/data";

/**
 * Checkout validation endpoint.
 *
 * Validates the cart against real inventory before an order can be placed.
 * During the demo phase the catalogue carries zero stock, so this returns a
 * 409 with the out-of-stock line items — driving the "sorry, out of stock"
 * experience on the checkout page. When real inventory exists in Supabase,
 * in-stock carts pass and the TODO below becomes order creation + payment.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const rawItems =
    body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? ((body as { items: unknown[] }).items as Array<Record<string, unknown>>)
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

  const result = await checkStock(items);

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
