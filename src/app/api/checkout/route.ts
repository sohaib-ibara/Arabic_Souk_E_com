import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createOrderAndIntent } from "@/lib/orders";
import type { DemandContact } from "@/lib/data";

// Stripe SDK needs the Node runtime.
export const runtime = "nodejs";

/** Coerce untrusted input to a trimmed, length-capped string (or undefined). */
function clean(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/**
 * Checkout: create a pending order + Stripe PaymentIntent for the signed-in
 * customer, and return the client secret for the embedded Payment Element.
 * Requires an authenticated account. Prices are recomputed server-side.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? (obj.items as Array<Record<string, unknown>>) : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });
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
    fullName: clean(rawContact.fullName) ?? user.fullName ?? undefined,
    email: clean(rawContact.email) ?? user.email,
    phone: clean(rawContact.phone) ?? user.phone ?? undefined,
    address: clean(rawContact.address),
    area: clean(rawContact.area),
    city: clean(rawContact.city),
    governorate: clean(rawContact.governorate),
  };

  const result = await createOrderAndIntent({
    userId: user.id,
    email: user.email,
    contact,
    items,
  });

  if (!result.ok) {
    switch (result.error) {
      case "unavailable":
        return NextResponse.json({ ok: false, error: "unavailable", issues: result.issues }, { status: 409 });
      case "not_configured":
        return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 503 });
      case "empty_cart":
        return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });
      default:
        return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    clientSecret: result.clientSecret,
    orderNumber: result.orderNumber,
    payment: result.payment,
  });
}
