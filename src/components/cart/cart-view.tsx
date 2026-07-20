"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { BagIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";

export function CartView() {
  const { items, subtotal, updateQuantity, removeItem, hydrated } = useCart();

  const shipping =
    subtotal === 0 || subtotal >= siteConfig.shipping.freeThreshold
      ? 0
      : siteConfig.shipping.standardFee;
  const total = subtotal + shipping;

  if (!hydrated) {
    return (
      <Container className="py-20 text-center text-muted">Loading your bag…</Container>
    );
  }

  if (items.length === 0) {
    return (
      <Container className="flex flex-col items-center py-24 text-center">
        <BagIcon width={44} height={44} className="text-line" />
        <h1 className="mt-5 font-serif text-3xl">Your bag is empty</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Discover our curated beauty edit and add your favourites to the bag.
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
      <h1 className="font-serif text-3xl sm:text-4xl">Your bag</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* Line items */}
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.productId} className="flex gap-4 py-5 sm:gap-6">
              <Link
                href={`/product/${item.slug}`}
                className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-sand"
              >
                <ProductImage
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </Link>

              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div>
                    {item.brand && (
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        {item.brand}
                      </p>
                    )}
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-medium leading-snug hover:text-brand"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {formatPrice(item.price, item.currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Remove ${item.name}`}
                    className="h-fit text-muted hover:text-brand"
                  >
                    <CloseIcon width={18} height={18} />
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="inline-flex items-center rounded-full border border-line bg-white">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="grid h-9 w-9 place-items-center hover:text-brand"
                      aria-label="Decrease quantity"
                    >
                      <MinusIcon width={15} height={15} />
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="grid h-9 w-9 place-items-center hover:text-brand"
                      aria-label="Increase quantity"
                    >
                      <PlusIcon width={15} height={15} />
                    </button>
                  </div>
                  <span className="font-medium">
                    {formatPrice(item.price * item.quantity, item.currency)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Summary */}
        <aside className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-xl">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{shipping === 0 ? "Free" : formatPrice(shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-medium">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          <Link
            href="/checkout"
            className="mt-6 flex items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            Proceed to checkout
          </Link>
          <Link
            href="/shop"
            className="mt-3 flex items-center justify-center text-sm text-muted hover:text-brand"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </Container>
  );
}
