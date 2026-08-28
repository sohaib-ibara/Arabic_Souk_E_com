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

type Status = "idle" | "creating" | "unavailable" | "error" | "missing";
type Method = "card" | "cod";

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
  codEnabled,
  user,
}: {
  paymentReady: boolean;
  codEnabled: boolean;
  /** null when checking out as a guest. */
  user: CheckoutUser | null;
}) {
  const { items, subtotal, hydrated } = useCart();
  // Cash is the fallback when cards aren't configured, so the shop can still
  // take an order rather than showing a dead checkout.
  const [method, setMethod] = useState<Method>(paymentReady ? "card" : "cod");
  const [phase, setPhase] = useState<"details" | "payment">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [issues, setIssues] = useState<Array<{ productId: string; name: string }>>([]);
  const [missing, setMissing] = useState<string[]>([]);

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
    setMissing([]);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          contact,
          paymentMethod: method,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === "unavailable") {
        setIssues(data.issues ?? []);
        setStatus("unavailable");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // The server checks the contact details too — the form's `required`
      // attributes are a convenience, not the rule.
      if (res.status === 400 && data.error === "missing_details") {
        setMissing(Array.isArray(data.missing) ? data.missing : []);
        setStatus("missing");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Cash: the order is already placed, so there's no second step. Straight
      // to the confirmation page, which clears the bag.
      if (res.ok && data.paymentMethod === "cod" && data.orderNumber) {
        window.location.href = `/checkout/success?order=${encodeURIComponent(data.orderNumber)}`;
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
          {codEnabled
            ? "Card payments are unavailable at the moment — you can still order and pay cash on delivery."
            : "Payments aren’t configured yet — set the Stripe keys in the environment to enable checkout."}
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

      {status === "missing" && (
        <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {missing.length
            ? `Please fill in your ${missing.join(", ")} so we can confirm and deliver your order.`
            : "Please complete your contact and delivery details."}
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
              {/* Offered, not imposed. A guest can complete the whole order
                  below; this is only here for customers who already have an
                  account and would rather not retype their details. */}
              {!user && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-sand/50 p-4 text-sm">
                  <span className="text-muted">
                    Checking out as a guest — no account needed.
                  </span>
                  <Link
                    href="/login?next=/checkout"
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-medium transition-colors hover:border-brand hover:text-brand"
                  >
                    Sign in instead
                  </Link>
                </div>
              )}

              <fieldset>
                <legend className="font-serif text-xl">Contact</legend>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="name" autoComplete="name" defaultValue={user?.fullName ?? ""} />
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={user?.email ?? ""}
                    // Signed in, the account's own address is the one we use —
                    // it's verified, and it's where the order history lives.
                    readOnly={Boolean(user)}
                  />
                  <Field label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="+973" defaultValue={user?.phone ?? ""} />
                </div>
                <p className="mt-3 text-xs text-muted">
                  We use these to confirm your order and arrange delivery.
                </p>
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

              {codEnabled && (
                <fieldset>
                  <legend className="font-serif text-xl">Payment</legend>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MethodOption
                      checked={method === "card"}
                      onSelect={() => setMethod("card")}
                      disabled={!paymentReady}
                      title="Pay by card"
                      hint={
                        paymentReady
                          ? "Card or wallet, paid securely now."
                          : "Unavailable — card payments aren’t configured."
                      }
                    />
                    <MethodOption
                      checked={method === "cod"}
                      onSelect={() => setMethod("cod")}
                      title="Cash on delivery"
                      hint={`Pay the courier when your order arrives, within ${siteConfig.shipping.etaDays}.`}
                    />
                  </div>
                </fieldset>
              )}

              <button
                type="submit"
                disabled={status === "creating" || (method === "card" && !paymentReady)}
                className="flex w-full items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60 sm:w-auto sm:px-10"
              >
                {status === "creating"
                  ? method === "cod"
                    ? "Placing order…"
                    : "Preparing payment…"
                  : method === "cod"
                    ? `Place order · ${formatPrice(total)}`
                    : "Continue to payment"}
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
            {/* Why this order was charged and another wasn't. Without it the
                fee looks arbitrary — it appears on a 3 BHD basket and vanishes
                on a 25 BHD one, with nothing on the page connecting the two. */}
            {shipping > 0 && (
              <p className="text-xs text-muted">
                Add {formatPrice(siteConfig.shipping.freeThreshold - subtotal)} more for free
                delivery.
              </p>
            )}
            <div className="flex justify-between border-t border-line pt-2.5 text-base font-medium">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-center text-xs text-muted">
            {method === "cod" ? "Pay cash on delivery" : "Secure payment by Stripe"}
            {" · "}
            {siteConfig.shipping.etaDays} delivery
          </p>
        </aside>
      </div>
    </Container>
  );
}

/** One payment choice. A label wrapping a radio, so the whole card is clickable. */
function MethodOption({
  checked,
  onSelect,
  disabled,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
        disabled
          ? "cursor-not-allowed border-line bg-sand/40 opacity-60"
          : checked
            ? "border-brand bg-brand-tint/40"
            : "border-line bg-white hover:border-brand/50"
      }`}
    >
      <input
        type="radio"
        name="payment_method"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
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
          different currency from the one the shop quotes in.

          Ordered to lead with the figure the customer recognises. Opening on
          the converted amount read as a price change — the shopper sees a
          number they never agreed to, in a currency they weren't shopping in,
          and has to work backwards to find out nothing has changed.

          A footnote now rather than a bordered panel. As a boxed callout it
          carried the weight of a warning and set two currencies side by side as
          though the shop could not decide what it was charging. BHD is the
          price — the only figure quoted anywhere, Pay button included — and
          this is a note about what the bank will print.

          Not removable, though: the card really is debited in AED, so hiding it
          would surprise the customer at their statement. It disappears by
          itself once Stripe can charge BHD, which needs a Bahrain Stripe
          account — the current UK one rejects BHD outright. */}
      {payment?.converted && (
        <p className="text-xs leading-relaxed text-muted">
          You pay <strong className="text-ink">{formatPrice(total)}</strong>. Your bank statement
          will show this as {formatPrice(payment.amount, payment.currency)}, because our payment
          provider settles in {payment.currency} at a fixed 1 {siteConfig.currency} ={" "}
          {payment.rate} {payment.currency}. Nothing extra is added.
        </p>
      )}

      <PaymentElement
        options={{
          // Stripe defaults the country picker to the account's own country,
          // which showed "United Kingdom" to shoppers in Bahrain and read as
          // yet another sign the shop was foreign. Every customer here is in
          // Bahrain, so that is the sensible default; they can still change it.
          defaultValues: { billingDetails: { address: { country: siteConfig.countryCode } } },
        }}
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
  readOnly,
}: {
  label: string;
  name: string;
  type?: string;
  className?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className ?? ""}`}>
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required
        readOnly={readOnly}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={`rounded-xl border border-line px-4 py-3 text-ink outline-none transition-colors focus:border-brand ${
          readOnly ? "bg-sand/60 text-muted" : "bg-white"
        }`}
      />
    </label>
  );
}
