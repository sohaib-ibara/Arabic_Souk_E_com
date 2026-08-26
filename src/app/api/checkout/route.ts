import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { createCodOrder, createOrderAndIntent } from "@/lib/orders";
import type { DemandContact } from "@/lib/data";
import { siteConfig } from "@/lib/config";
import { ORDER_COOKIE, ORDER_TOKEN_MAX_AGE, createOrderToken, readOrderToken } from "@/lib/order-token";

// Stripe SDK needs the Node runtime.
export const runtime = "nodejs";

/** Coerce untrusted input to a trimmed, length-capped string (or undefined). */
function clean(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/** Deliberately loose — enough to catch a typo, not to police the RFC. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/**
 * Details we refuse an order without.
 *
 * Someone has to be able to ring the customer and confirm the delivery, and for
 * a cash order there is no card record to fall back on — so the contact details
 * are the order. Enforced here rather than trusting the form's `required`
 * attributes, which any client can simply not send.
 */
const REQUIRED: Array<{ key: keyof DemandContact; label: string }> = [
  { key: "fullName", label: "full name" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone number" },
  { key: "address", label: "delivery address" },
  { key: "city", label: "city" },
];

/**
 * Checkout: price the basket, create the order, and either return a Stripe
 * client secret (card) or confirm it outright (cash).
 *
 * Open to guests. An account is offered, never required — but the contact
 * details are, because an order nobody can be reached about is not an order.
 * Prices are always recomputed server-side.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();

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
    fullName: clean(rawContact.fullName) ?? user?.fullName ?? undefined,
    // A signed-in customer's account email wins: it's the verified one, and it's
    // where the order history they can sign in and read is going to hang.
    email: user?.email ?? clean(rawContact.email),
    phone: clean(rawContact.phone) ?? user?.phone ?? undefined,
    address: clean(rawContact.address),
    area: clean(rawContact.area),
    city: clean(rawContact.city),
    governorate: clean(rawContact.governorate),
  };

  const missing = REQUIRED.filter((f) => !contact[f.key]).map((f) => f.label);
  if (missing.length) {
    return NextResponse.json({ ok: false, error: "missing_details", missing }, { status: 400 });
  }
  if (!looksLikeEmail(contact.email!)) {
    return NextResponse.json(
      { ok: false, error: "missing_details", missing: ["a valid email"] },
      { status: 400 },
    );
  }

  // Cash is only ever accepted because the server says so — a client asking for
  // it while the option is switched off is refused, not quietly given a free
  // order.
  const wantsCash = obj.paymentMethod === "cod";
  if (wantsCash && !siteConfig.payments.cashOnDelivery) {
    return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 503 });
  }

  // What this browser last checked out, if anything. It's how a guest's repeat
  // submit is matched to the order they already have (see `ownOrders`).
  const jar = await cookies();
  const priorOrderId = readOrderToken(jar.get(ORDER_COOKIE)?.value);

  const args = {
    userId: user?.id ?? null,
    email: contact.email!,
    contact,
    items,
    priorOrderId,
  };
  const result = wantsCash ? await createCodOrder(args) : await createOrderAndIntent(args);

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

  const res = NextResponse.json({
    ok: true,
    paymentMethod: wantsCash ? "cod" : "card",
    // Absent for cash: there is nothing to collect in the browser, so the
    // client goes straight to the confirmation page.
    clientSecret: result.clientSecret,
    orderNumber: result.orderNumber,
    payment: result.payment,
  });

  // Lets the confirmation page show this order to a guest, who has no session
  // for the per-user RLS policy to match on. Signed. httpOnly so page scripts
  // can't read it, and lax so it survives the return trip from Stripe.
  if (result.orderId) {
    const token = createOrderToken(result.orderId);
    if (token) {
      res.cookies.set(ORDER_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ORDER_TOKEN_MAX_AGE,
      });
    }
  }

  return res;
}
