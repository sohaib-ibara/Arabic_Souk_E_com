import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CheckIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseUserServer } from "@/lib/supabase/user-server";
import { confirmOrderFromIntent } from "@/lib/orders";
import { ClearCart } from "@/components/checkout/clear-cart";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

// Reads the auth cookie + live order — never cache.
export const dynamic = "force-dynamic";

interface OrderRow {
  order_number: string;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string; order?: string }>;
}) {
  const { payment_intent, redirect_status, order: orderParam } = await searchParams;

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const failed = Boolean(redirect_status && redirect_status !== "succeeded");

  // Settle the order from Stripe's own record before reading it back. Normally
  // the webhook has already done this; locally it hasn't unless `stripe listen`
  // is running, and without this the page would thank the customer for an order
  // still sitting at "pending". Idempotent, and scoped to this user's order.
  if (payment_intent && !failed) {
    await confirmOrderFromIntent(payment_intent, user.id);
  }

  // The order belongs to the signed-in user, so per-user RLS lets us read it —
  // which is also what stops an order number guessed from the URL showing
  // somebody else's order.
  let order: OrderRow | null = null;
  if (payment_intent || orderParam) {
    const sb = await getSupabaseUserServer();
    if (sb) {
      const columns = "order_number, total, currency, status, payment_method";
      const query = payment_intent
        ? sb.from("orders").select(columns).eq("stripe_payment_intent", payment_intent)
        : sb.from("orders").select(columns).eq("order_number", orderParam!);
      const { data } = await query.maybeSingle();
      order = (data as OrderRow | null) ?? null;
    }
  }

  const isCash = order?.payment_method === "cod";

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
            We&rsquo;ve received your order{order ? ` (${order.order_number})` : ""} and a
            confirmation is on its way to {user.email}. We&rsquo;ll deliver across Bahrain within{" "}
            {siteConfig.shipping.etaDays}.
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

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/account"
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
            >
              View my orders
            </Link>
            <Link
              href="/shop"
              className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
            >
              Continue shopping
            </Link>
          </div>
        </>
      )}
    </Container>
  );
}
