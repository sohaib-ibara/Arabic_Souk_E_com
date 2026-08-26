import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Container } from "@/components/ui/container";
import { CheckIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseUserServer } from "@/lib/supabase/user-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { confirmOrderFromIntent } from "@/lib/orders";
import { ORDER_COOKIE, readOrderToken } from "@/lib/order-token";
import { ClearCart } from "@/components/checkout/clear-cart";
import { emailConfigured } from "@/lib/email";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

// Reads the auth cookie + live order — never cache.
export const dynamic = "force-dynamic";

const COLUMNS = "id, order_number, email, total, currency, status, payment_method";

interface OrderRow {
  id: string;
  order_number: string;
  email: string | null;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
}

/**
 * The order this page is confirming.
 *
 * Two ways in, and each is scoped by something the visitor can't forge. A
 * signed-in customer reads through the cookie-scoped client, where the per-user
 * RLS policy does the limiting. A guest has no session for that policy to match,
 * so they present the signed cookie the checkout route issued, and the service
 * role fetches exactly the one row it names — never a row from the URL.
 */
async function loadOrder(
  userId: string | null,
  intentId: string | undefined,
  orderNumber: string | undefined,
): Promise<OrderRow | null> {
  if (userId && (intentId || orderNumber)) {
    const sb = await getSupabaseUserServer();
    if (!sb) return null;
    const query = intentId
      ? sb.from("orders").select(COLUMNS).eq("stripe_payment_intent", intentId)
      : sb.from("orders").select(COLUMNS).eq("order_number", orderNumber!);
    const { data } = await query.maybeSingle();
    if (data) return data as OrderRow;
  }

  const tokenOrderId = readOrderToken((await cookies()).get(ORDER_COOKIE)?.value);
  if (!tokenOrderId) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from("orders").select(COLUMNS).eq("id", tokenOrderId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string; order?: string }>;
}) {
  const { payment_intent, redirect_status, order: orderParam } = await searchParams;

  const user = await getSessionUser();
  const failed = Boolean(redirect_status && redirect_status !== "succeeded");

  // Settle the order from Stripe's own record before reading it back. Normally
  // the webhook has already done this; locally it hasn't unless `stripe listen`
  // is running, and without this the page would thank the customer for an order
  // still sitting at "pending". Idempotent, and scoped to this order.
  if (payment_intent && !failed) {
    await confirmOrderFromIntent(payment_intent, user?.id ?? null);
  }

  const order = await loadOrder(user?.id ?? null, payment_intent, orderParam);
  const isCash = order?.payment_method === "cod";
  const recipient = order?.email ?? user?.email ?? null;

  return (
    <Container className="flex flex-col items-center py-20 text-center">
      {/* Payment succeeded: empty the bag. */}
      {!failed && <ClearCart />}

      {failed ? (
        <>
          <h1 className="font-serif text-3xl">Payment not completed</h1>
          <p className="mt-2 max-w-md text-sm text-muted">
            Your payment didn&rsquo;t go through. Your bag is still saved — you can try again.
          </p>
          <Link
            href="/checkout"
            className="mt-7 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            Back to checkout
          </Link>
        </>
      ) : (
        <>
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-tint text-brand">
            <CheckIcon width={32} height={32} />
          </span>
          <h1 className="mt-5 font-serif text-3xl sm:text-4xl">Thank you for your order</h1>
          <p className="mt-2 max-w-md text-sm text-muted">
            We&rsquo;ve received your order{order ? ` (${order.order_number})` : ""}
            {/* Only promised when a confirmation can actually be sent. This
                page used to say one was on its way regardless, which was a
                plain untruth whenever no mail provider was configured. */}
            {recipient && emailConfigured() ? (
              <>
                {" "}
                and a confirmation is on its way to {recipient}
              </>
            ) : null}
            . We&rsquo;ll deliver across Bahrain within {siteConfig.shipping.etaDays}.
          </p>

          {order && (
            <div className="mt-6 w-full max-w-xs rounded-2xl border border-line bg-white p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Order</span>
                <span className="font-medium">{order.order_number}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted">{isCash ? "Due on delivery" : "Total paid"}</span>
                <span className="font-medium">{formatPrice(order.total, order.currency)}</span>
              </div>
            </div>
          )}

          {/* Said plainly, and only to cash customers: the courier expects the
              money at the door, so the amount shouldn't be a surprise. */}
          {isCash && order && (
            <p className="mt-5 max-w-md rounded-2xl border border-line bg-sand/60 p-4 text-xs text-muted">
              Please have{" "}
              <strong className="text-ink">{formatPrice(order.total, order.currency)}</strong>{" "}
              ready in cash for the courier when your order arrives.
            </p>
          )}

          {/* The offer to save their details, made after the order rather than
              before it — so it can't cost the sale. */}
          {!user && (
            <div className="mt-8 w-full max-w-md rounded-2xl border border-brand/25 bg-brand-tint/30 p-5 text-left">
              <h2 className="font-serif text-lg">Save your details for next time</h2>
              <p className="mt-1.5 text-sm text-muted">
                Create an account with{recipient ? ` ${recipient}` : " your email"} to track this
                order, reorder in a couple of taps, and skip retyping your address.
              </p>
              <Link
                href={`/register?next=/account${
                  recipient ? `&email=${encodeURIComponent(recipient)}` : ""
                }`}
                className="mt-4 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand"
              >
                Create an account
              </Link>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {/* The order number is carried over, so tracking it later is one
                field, not a hunt through an inbox. */}
            {order && (
              <Link
                href={`/track?order=${encodeURIComponent(order.order_number)}`}
                className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
              >
                Track this order
              </Link>
            )}
            {user && (
              <Link
                href="/account"
                className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
              >
                View my orders
              </Link>
            )}
            <Link
              href="/shop"
              className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
            >
              Continue shopping
            </Link>
          </div>

          {order && (
            <p className="mt-6 max-w-md text-xs text-muted">
              Keep your order number, <strong className="text-ink">{order.order_number}</strong> —
              it&rsquo;s all you need (with your email) to check on this order at any time.
            </p>
          )}
        </>
      )}
    </Container>
  );
}
