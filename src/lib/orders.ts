import { getSupabaseAdmin } from "./supabase/server";
import { getStripe, toStripeAmount } from "./stripe";
import { getAllProducts, type DemandContact } from "./data";
import { siteConfig } from "./config";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface CreateOrderInput {
  userId: string;
  email: string;
  contact: DemandContact;
  items: Array<{ productId: string; quantity: number }>;
}

export interface CreateOrderResult {
  ok: boolean;
  clientSecret?: string;
  orderNumber?: string;
  error?: "empty_cart" | "unavailable" | "not_configured" | "server_error";
  issues?: Array<{ productId: string; name: string }>;
}

/**
 * Creates a PENDING order (+ its line items) and a Stripe PaymentIntent for the
 * total, returning the client secret the embedded Payment Element needs.
 *
 * Prices, availability and totals are ALWAYS recomputed from the catalogue —
 * the client is never trusted for money. The order is confirmed as "paid" later
 * by the Stripe webhook, not here.
 */
export async function createOrderAndIntent(input: CreateOrderInput): Promise<CreateOrderResult> {
  const admin = getSupabaseAdmin();
  const stripe = getStripe();
  if (!admin || !stripe) return { ok: false, error: "not_configured" };
  if (!input.items.length) return { ok: false, error: "empty_cart" };

  const products = await getAllProducts();
  const byId = new Map(products.map((p) => [p.id, p]));

  const unavailable: Array<{ productId: string; name: string }> = [];
  const lineItems: Array<{ product_id: string; name: string; unit_price: number; quantity: number }> = [];

  for (const it of input.items) {
    const p = byId.get(it.productId);
    // Dropship model: availability is the `in_stock` listing flag, not quantity.
    if (!p || !p.in_stock) {
      unavailable.push({ productId: it.productId, name: p?.name ?? "Unknown item" });
      continue;
    }
    const quantity = Math.max(1, Math.min(99, Math.floor(it.quantity) || 1));
    lineItems.push({ product_id: p.id, name: p.name, unit_price: p.price, quantity });
  }

  if (unavailable.length) return { ok: false, error: "unavailable", issues: unavailable };
  if (!lineItems.length) return { ok: false, error: "empty_cart" };

  const currency = (products[0]?.currency ?? siteConfig.currency).toUpperCase();
  const subtotal = round3(lineItems.reduce((s, li) => s + li.unit_price * li.quantity, 0));
  const shipping = subtotal >= siteConfig.shipping.freeThreshold ? 0 : siteConfig.shipping.standardFee;
  const total = round3(subtotal + shipping);

  // 1) Pending order (service role bypasses RLS).
  const { data: order, error } = await admin
    .from("orders")
    .insert({
      user_id: input.userId,
      email: input.email,
      full_name: input.contact.fullName ?? null,
      phone: input.contact.phone ?? null,
      shipping_address: {
        address: input.contact.address ?? null,
        area: input.contact.area ?? null,
        city: input.contact.city ?? null,
        governorate: input.contact.governorate ?? null,
      },
      subtotal,
      shipping_fee: shipping,
      total,
      currency,
      status: "pending",
    })
    .select("id, order_number")
    .single();
  if (error || !order) return { ok: false, error: "server_error" };

  const { error: itemsError } = await admin.from("order_items").insert(
    lineItems.map((li) => ({
      order_id: order.id,
      product_id: li.product_id,
      name: li.name,
      unit_price: li.unit_price,
      quantity: li.quantity,
    })),
  );
  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id); // rollback (items cascade)
    return { ok: false, error: "server_error" };
  }

  // 2) PaymentIntent for the total; link it back to the order via metadata.
  try {
    const intent = await stripe.paymentIntents.create({
      amount: toStripeAmount(total, currency),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: order.id, order_number: order.order_number },
    });
    await admin.from("orders").update({ stripe_payment_intent: intent.id }).eq("id", order.id);
    return {
      ok: true,
      clientSecret: intent.client_secret ?? undefined,
      orderNumber: order.order_number,
    };
  } catch {
    await admin.from("orders").delete().eq("id", order.id); // rollback order + items
    return { ok: false, error: "server_error" };
  }
}

/**
 * Marks the order behind a PaymentIntent as paid. Idempotent: only flips a
 * still-pending order, so duplicate webhook deliveries are harmless.
 */
export async function markOrderPaid(paymentIntentId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin
    .from("orders")
    .update({ status: "paid" })
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("status", "pending");
}
