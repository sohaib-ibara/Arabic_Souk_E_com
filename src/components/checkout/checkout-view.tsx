"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { BagIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import type { StockIssue } from "@/lib/types";

type Status = "idle" | "checking" | "out_of_stock" | "error";

export function CheckoutView() {
  const { items, subtotal, hydrated } = useCart();
  const [status, setStatus] = useState<Status>("idle");
  const [issues, setIssues] = useState<StockIssue[]>([]);

  const shipping =
    subtotal === 0 || subtotal >= siteConfig.shipping.freeThreshold
      ? 0
      : siteConfig.shipping.standardFee;
  const total = subtotal + shipping;

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setStatus("checking");
    setIssues([]);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === "out_of_stock") {
        setIssues(data.issues ?? []);
        setStatus("out_of_stock");
        // Bring the notice into view.
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (res.ok && data.ok) {
        // Real phase: redirect to payment / confirmation.
        setStatus("idle");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (!hydrated) {
    return <Container className="py-20 text-center text-muted">Loading checkout…</Container>;
  }

  if (items.length === 0 && status !== "out_of_stock") {
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

  const outOfStockNames = new Set(issues.map((i) => i.name));

  return (
    <Container className="py-10">
      <h1 className="font-serif text-3xl sm:text-4xl">Checkout</h1>

      {/* Out-of-stock notice */}
      {status === "out_of_stock" && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-brand/30 bg-brand-tint p-5"
        >
          <h2 className="font-medium text-brand-dark">
            Sorry — some items are out of stock
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            We couldn&rsquo;t complete your order because the following{" "}
            {issues.length === 1 ? "item is" : "items are"} currently unavailable:
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {issues.map((i) => (
              <li key={i.productId} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="font-medium">{i.name}</span>
                <span className="text-muted">— out of stock</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand"
            >
              Continue shopping
            </Link>
            <Link
              href="/cart"
              className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium hover:border-brand hover:text-brand"
            >
              Edit bag
            </Link>
          </div>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Something went wrong while placing your order. Please try again.
        </div>
      )}

      <form onSubmit={placeOrder} className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* Details */}
        <div className="space-y-8">
          <fieldset>
            <legend className="font-serif text-xl">Contact</legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="name" autoComplete="name" />
              <Field label="Email" name="email" type="email" autoComplete="email" />
              <Field label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="+973" />
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
            <p className="mt-3 text-xs text-muted">
              Delivering to the Kingdom of Bahrain only.
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-serif text-xl">Payment</legend>
            <div className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-muted">
              Payment is set up in the next phase (BENEFIT, card &amp; Apple Pay). For this
              preview, placing the order runs a live stock check.
            </div>
          </fieldset>
        </div>

        {/* Summary */}
        <aside className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-xl">Your order ({items.length})</h2>
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <li key={item.productId} className="flex gap-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="line-clamp-2 text-sm font-medium leading-snug">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted">Qty {item.quantity}</span>
                  {outOfStockNames.has(item.name) && (
                    <span className="mt-0.5 text-xs font-medium text-brand">Out of stock</span>
                  )}
                </div>
                <span className="text-sm">
                  {formatPrice(item.price * item.quantity, item.currency)}
                </span>
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

          <button
            type="submit"
            disabled={status === "checking" || items.length === 0}
            className="mt-6 flex w-full items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
          >
            {status === "checking" ? "Placing order…" : "Place order"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Secure checkout · {siteConfig.shipping.etaDays} delivery
          </p>
        </aside>
      </form>
    </Container>
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
