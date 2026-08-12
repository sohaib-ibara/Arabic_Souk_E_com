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

/** Intent states where nobody has paid yet, so the intent is still ours to use. */
const OPEN_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

type LineItem = { product_id: string; name: string; unit_price: number; quantity: number };

/** Stable signature of a cart, so two attempts at the same basket compare equal. */
function cartSignature(lines: Array<{ product_id: string | null; quantity: number; unit_price: number }>) {
  return lines
    .map((l) => `${l.product_id}:${Math.trunc(l.quantity)}:${round3(Number(l.unit_price))}`)
    .sort()
    .join("|");
}

/**
 * An existing open order for the same basket, if there is one.
 *
 * Pressing "Continue to payment" twice, or going back and forward again, used to
 * mint a fresh order and a fresh PaymentIntent each time, leaving abandoned
 * pending rows behind. Only one of them could ever be paid, so no money was at
 * risk, but the orders table filled with noise.
 *
 * Reuse requires the basket, total and currency to be identical AND Stripe to
 * still consider the intent unpaid — anything else falls through to a new order.
 */
async function findReusableOrder(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  args: { userId: string; total: number; currency: string; lines: LineItem[]; presentment: Presentment },
): Promise<CreateOrderResult | null> {
  const { data } = await admin
    .from("orders")
    .select("id, order_number, total, currency, stripe_payment_intent, order_items(product_id,quantity,unit_price)")
    .eq("user_id", args.userId)
    .eq("status", "pending")
    .not("stripe_payment_intent", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data?.length) return null;
  const wanted = cartSignature(args.lines);

  for (const row of data) {
    if (round3(Number(row.total)) !== args.total) continue;
    if (String(row.currency).toUpperCase() !== args.currency) continue;

    const lines = Array.isArray(row.order_items) ? row.order_items : [];
    if (lines.length !== args.lines.length) continue;
    if (cartSignature(lines as never) !== wanted) continue;

    try {
      const intent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent as string);
      // Guard on the amount too: the catalogue price could have moved since,
      // in which case the old intent would charge the wrong figure.
      if (
        !OPEN_INTENT_STATUSES.has(intent.status) ||
        intent.amount !== args.presentment.stripeAmount ||
        intent.currency !== args.presentment.currency.toLowerCase() ||
        !intent.client_secret
      ) {
        continue;
      }
      return {
        ok: true,
        clientSecret: intent.client_secret,
        orderNumber: row.order_number as string,
        payment: args.presentment,
      };
    } catch {
      continue; // intent vanished or Stripe unreachable — fall through to a new one
    }
  }
  return null;
}

/**
 * Closes any other open checkout for this customer, so at most one is live.
 *
 * Deliberately conservative: an intent Stripe reports as processing or already
 * succeeded is left alone (and settled, if it succeeded), because cancelling an
 * order somebody has actually paid for would be far worse than leaving a stray
 * row behind.
 */
async function supersedeOpenOrders(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  userId: string,
): Promise<void> {
  const { data } = await admin
    .from("orders")
    .select("id, stripe_payment_intent")
    .eq("user_id", userId)
    .eq("status", "pending");

  for (const row of data ?? []) {
    const intentId = row.stripe_payment_intent as string | null;

    if (intentId) {
      try {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.status === "succeeded") {
          await markOrderPaid(intentId); // paid after all — settle, don't cancel
          continue;
        }
        if (!OPEN_INTENT_STATUSES.has(intent.status)) continue; // processing: leave it
        await stripe.paymentIntents.cancel(intentId, { cancellation_reason: "abandoned" });
      } catch {
        continue; // can't reach Stripe — safer to leave the row than guess
      }
    }

    await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", row.id)
      .eq("status", "pending");
  }
}

/**
 * Creates a PENDING order (+ its line items) and a Stripe PaymentIntent for the
 * total, returning the client secret the embedded Payment Element needs.
 *
 * Prices, availability and totals are ALWAYS recomputed from the catalogue —
 * the client is never trusted for money. The order is confirmed as "paid" later
 * by the Stripe webhook, not here.
 *
 * Repeat submissions are absorbed rather than duplicated: an identical basket
 * gets the existing order and client secret back, and a different basket
 * supersedes the previous open checkout, so a customer never has two live at
 * once.
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

  // 0) A repeat of the same basket reuses the order already open for it, so a
  //    double submit hands back the same client secret instead of a second row.
  const reused = await findReusableOrder(admin, stripe, {
    userId: input.userId,
    total,
    currency,
    lines: lineItems,
    presentment,
  });
  if (reused) return reused;

  // A different basket means the previous checkout was abandoned. Close it, so
  // a customer only ever has one live order at a time.
  await supersedeOpenOrders(admin, stripe, input.userId);

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
    const intent = await stripe.paymentIntents.create(
      {
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
      },
      // The SDK retries failed network calls twice by default, and a retry that
      // Stripe already processed would otherwise mint a second intent for this
      // order. Keyed on the order id: one order, one intent, however many
      // attempts it takes to get the response back.
      { idempotencyKey: `order_intent_${order.id}` },
    );
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
