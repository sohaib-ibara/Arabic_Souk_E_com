import { getSupabaseAdmin } from "./supabase/server";
import { getStripe, getPresentment, type Presentment } from "./stripe";
import { getAllProducts, type DemandContact } from "./data";
import { siteConfig } from "./config";
import { reconcileOrderStock } from "./inventory";

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
  /** What Stripe will actually charge — differs from the BHD total when the
   *  account can't present in the store currency. */
  payment?: Presentment;
  error?: "empty_cart" | "unavailable" | "not_configured" | "server_error";
  issues?: Array<{ productId: string; name: string; available?: number }>;
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

  // Availability is the `in_stock` switch, not the quantity. Stock is sourced
  // per order, so an on-hand of zero is normal; the admin turns a product off
  // when they genuinely can't get it. The sale still posts to the ledger, which
  // is how the shortfall to buy becomes visible.
  for (const it of input.items) {
    const p = byId.get(it.productId);
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

  // Resolve the charge before writing anything: if the account can't present in
  // this currency and no conversion is configured, there's no order to create.
  const presentment = getPresentment(total, currency);
  if (!presentment) return { ok: false, error: "not_configured" };

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
  //    The order row keeps the BHD figures — the business record is in the
  //    store's currency regardless of what Stripe settles in — so the
  //    presentment details go into metadata to keep the two reconcilable.
  try {
    const intent = await stripe.paymentIntents.create({
      amount: presentment.stripeAmount,
      currency: presentment.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        store_total: total.toFixed(3),
        store_currency: currency,
        ...(presentment.converted ? { fx_rate: String(presentment.rate) } : {}),
      },
    });
    await admin.from("orders").update({ stripe_payment_intent: intent.id }).eq("id", order.id);
    return {
      ok: true,
      clientSecret: intent.client_secret ?? undefined,
      orderNumber: order.order_number,
      payment: presentment,
    };
  } catch {
    await admin.from("orders").delete().eq("id", order.id); // rollback order + items
    return { ok: false, error: "server_error" };
  }
}

/**
 * Marks the order behind a PaymentIntent as paid, then posts the sale to the
 * stock ledger.
 *
 * Idempotent twice over: the update only flips a still-pending order, and the
 * reconciler writes the difference between what's posted and what the status
 * implies — so a duplicate webhook delivery can't double-count stock.
 */
export async function markOrderPaid(paymentIntentId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { data } = await admin
    .from("orders")
    .update({ status: "paid" })
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  // No row means it was already paid — another delivery got there first.
  if (!data?.id) return;

  // Bookkeeping must never fail a payment Stripe has already captured.
  try {
    await reconcileOrderStock({ orderId: data.id, status: "paid" });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[inventory] sale posting failed for order ${data.id}: ${(e as Error).message}`);
    }
  }
}

/**
 * Confirms an order from the shopper's return to the success page, by asking
 * Stripe directly whether the PaymentIntent succeeded.
 *
 * The webhook remains the source of truth — it fires even if the shopper closes
 * the tab, and it's the only path that works when the site can't be reached
 * from the internet. This exists because it *can't* be reached during local
 * development unless `stripe listen` is running, which would otherwise leave
 * every locally-placed order stuck at "pending" while the page said thank you.
 *
 * Safe to run alongside the webhook: whichever arrives first wins, and
 * `markOrderPaid` only ever moves a pending order.
 *
 * Scoped to the signed-in owner and gated on Stripe's own view of the payment,
 * so a guessed PaymentIntent id can't be used to mark somebody else's order —
 * or an unpaid one — as paid.
 */
export async function confirmOrderFromIntent(
  paymentIntentId: string,
  userId: string,
): Promise<void> {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe || !admin) return;

  const { data: order } = await admin
    .from("orders")
    .select("id,status")
    .eq("stripe_payment_intent", paymentIntentId)
    .eq("user_id", userId)
    .maybeSingle();

  // Not this customer's order, or the webhook already handled it.
  if (!order || order.status !== "pending") return;

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "succeeded") await markOrderPaid(paymentIntentId);
  } catch {
    // Stripe unreachable — the webhook will still settle this.
  }
}
