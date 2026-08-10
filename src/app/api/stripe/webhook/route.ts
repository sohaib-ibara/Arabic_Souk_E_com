import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/orders";

// Needs the Node runtime + the raw request body for signature verification.
export const runtime = "nodejs";

/**
 * Stripe webhook — the source of truth for payment success. Stripe calls this
 * (server-to-server), we verify the signature, and on payment_intent.succeeded
 * we flip the matching order to "paid". This is reliable even if the shopper
 * closes the tab right after paying.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as { id: string };
    await markOrderPaid(intent.id);
  }

  return NextResponse.json({ received: true });
}
