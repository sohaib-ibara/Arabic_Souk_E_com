"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useCart } from "@/components/cart/cart-provider";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { BagIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { getStripePromise } from "@/lib/stripe-client";

interface CheckoutUser {
  fullName: string | null;
  email: string;
  phone: string | null;
}

/** What the card is debited, when that isn't the BHD total (see lib/stripe.ts). */
interface Payment {
  currency: string;
  amount: number;
  rate: number;
  converted: boolean;
}

type Status = "idle" | "creating" | "unavailable" | "error";

const stripeAppearance: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    colorPrimary: "#a04963",
    colorText: "#1b1613",
    colorTextSecondary: "#6f655f",
    colorBackground: "#ffffff",
    fontFamily: "inherit",
    borderRadius: "12px",
  },
};

export function CheckoutView({
  paymentReady,
  user,
}: {
  paymentReady: boolean;
  user: CheckoutUser;
}) {
  const { items, subtotal, hydrated } = useCart();
  const [phase, setPhase] = useState<"details" | "payment">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [issues, setIssues] = useState<Array<{ productId: string; name: string }>>([]);

  const shipping =
    subtotal === 0 || subtotal >= siteConfig.shipping.freeThreshold
      ? 0
      : siteConfig.shipping.standardFee;
  const total = subtotal + shipping;

  const stripePromise = useMemo(() => getStripePromise(), []);

  async function startPayment(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const contact = {
      fullName: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      address: String(fd.get("address") ?? ""),
      area: String(fd.get("area") ?? ""),
      city: String(fd.get("city") ?? ""),
      governorate: String(fd.get("governorate") ?? ""),
    };
    setStatus("creating");
    setIssues([]);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          contact,
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = "/login?next=/checkout";
        return;
      }
      if (res.status === 409 && data.error === "unavailable") {
        setIssues(data.issues ?? []);
        setStatus("unavailable");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.ok && data.clientSecret) {
        setClientSecret(data.clientSecret);
        setOrderNumber(data.orderNumber ?? null);
        setPayment(data.payment ?? null);
        setPhase("payment");
        setStatus("idle");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (!hydrated) {
    return <Container className="py-20 text-center text-muted">Loading checkout…</Container>;
  }

  if (items.length === 0) {
    return (
      <Container className="flex flex-col items-center py-24 text-center">
        <BagIcon width={44} height={44} className="text-line" />
        <h1 className="mt-5 font-serif text-3xl">Your bag is empty</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Add a few beauty essentials before heading to checkout.
        </p>
        <Link
          href="/shop"
          className="mt-7 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
        >
          Start shopping
        </Link>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <h1 className="font-serif text-3xl sm:text-4xl">Checkout</h1>

      {!paymentReady && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Payments aren&rsquo;t configured yet — set the Stripe keys in the environment to
          enable checkout.
        </div>
      )}

      {status === "unavailable" && (
        <div role="alert" className="mt-6 rounded-2xl border border-brand/30 bg-brand-tint p-5">
          <h2 className="font-medium text-brand-dark">Some items are no longer available</h2>
          <p className="mt-1 text-sm text-ink/70">
            Please remove {issues.length === 1 ? "this item" : "these items"} to continue:
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {issues.map((i) => (
              <li key={i.productId} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="font-medium">{i.name}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/cart"
            className="mt-4 inline-flex rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium hover:border-brand hover:text-brand"
          >
            Edit bag
          </Link>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Something went wrong. Please try again.
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* Left: details form, then payment */}
        <div className="space-y-8">
          {phase === "details" ? (
            <form onSubmit={startPayment} className="space-y-8">
              <fieldset>
                <legend className="font-serif text-xl">Contact</legend>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="name" autoComplete="name" defaultValue={user.fullName ?? ""} />
                  <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={user.email} />
                  <Field label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="+973" defaultValue={user.phone ?? ""} />
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-serif text-xl">Delivery address</legend>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Address / Building" name="address" className="sm:col-span-2" autoComplete="street-address" />
                  <Field label="Area / Block" name="area" />
                  <Field label="City" name="city" defaultValue="Manama" />
                  <Field label="Governorate" name="governorate" placeholder="Capital" />
                </div>
                <p className="mt-3 text-xs text-muted">Delivering to the Kingdom of Bahrain only.</p>
              </fieldset>

              <button
                type="submit"
                disabled={status === "creating" || !paymentReady}
                className="flex w-full items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60 sm:w-auto sm:px-10"
              >
                {status === "creating" ? "Preparing payment…" : "Continue to payment"}
              </button>
            </form>
          ) : (
            clientSecret && (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
                <PaymentPanel
                  total={total}
                  payment={payment}
                  orderNumber={orderNumber}
                  onBack={() => {
                    setPhase("details");
                    setClientSecret(null);
                  }}
                />
              </Elements>
            )
          )}
        </div>

        {/* Right: order summary */}
        <aside className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-xl">Your order ({items.length})</h2>
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <li key={item.productId} className="flex gap-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                  <ProductImage src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</span>
                  <span className="text-xs text-muted">Qty {item.quantity}</span>
                </div>
                <span className="text-sm">{formatPrice(item.price * item.quantity, item.currency)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{shipping === 0 ? "Free" : formatPrice(shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 text-base font-medium">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-center text-xs text-muted">
            Secure payment by Stripe · {siteConfig.shipping.etaDays} delivery
          </p>
        </aside>
      </div>
    </Container>
  );
}

/** Embedded Stripe Payment Element + pay button. Renders inside <Elements>. */
function PaymentPanel({
  total,
  payment,
  orderNumber,
  onBack,
}: {
  total: number;
  payment: Payment | null;
  orderNumber: string | null;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The card fields live in a Stripe iframe that can fail to appear — a bad
  // publishable key, a blocked script, no network. Until it reports ready there
  // is nothing to submit, so the pay button stays disabled rather than throwing.
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function pay(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/checkout/success` },
      });
      // We only reach here if confirmation failed; success redirects away.
      setError(error.message ?? "Payment failed. Please try again.");
    } catch (err) {
      // confirmPayment throws (rather than resolving with an error) on
      // integration faults such as no mounted element. Without this the button
      // would sit on "Processing…" for ever with nothing explaining why.
      setError(
        err instanceof Error ? err.message : "Payment couldn't be started. Please try again.",
      );
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={pay} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl">Payment</h2>
        {orderNumber && <span className="text-xs text-muted">Order {orderNumber}</span>}
      </div>

      {/* Said before the card is entered, not after: the statement will show a
          different currency from the one the shop quotes in. */}
      {payment?.converted && (
        <p className="rounded-xl border border-line bg-sand/60 p-4 text-xs text-muted">
          Your card will be charged{" "}
          <strong className="text-ink">
            {formatPrice(payment.amount, payment.currency)}
          </strong>
          , the equivalent of {formatPrice(total)} at a fixed rate of 1{" "}
          {siteConfig.currency} = {payment.rate} {payment.currency}. That is the amount
          that will appear on your statement.
        </p>
      )}

      <PaymentElement
        onReady={() => {
          setReady(true);
          setLoadFailed(false);
        }}
        onLoadError={() => setLoadFailed(true)}
      />

      {loadFailed && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">The payment form couldn&rsquo;t load</p>
          <p className="mt-1">
            This is usually an ad blocker or privacy extension blocking Stripe. Try again with
            those disabled, or in a private window. Your order is saved — nothing has been
            charged.
          </p>
        </div>
      )}

      {!ready && !loadFailed && (
        <p className="text-sm text-muted">Loading secure payment form…</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!stripe || paying || !ready}
          title={ready ? undefined : "Waiting for the payment form to load"}
          className="flex items-center justify-center rounded-full bg-ink px-10 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
        >
          {paying ? "Processing…" : `Pay ${formatPrice(total)}`}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={paying}
          className="text-sm text-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          Back to details
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  className,
  autoComplete,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  className?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className ?? ""}`}>
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand"
      />
    </label>
  );
}
