"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "./cart-provider";
import { ProductImage } from "@/components/ui/product-image";
import { BagIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/cn";

export function CartDrawer() {
  const { isOpen, closeCart, items, subtotal, count, updateQuantity, removeItem } =
    useCart();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCart();
    }
    if (isOpen) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, closeCart]);

  const remaining = Math.max(0, siteConfig.shipping.freeThreshold - subtotal);

  return (
    <div
      className={cn("fixed inset-0 z-50", !isOpen && "pointer-events-none")}
      aria-hidden={!isOpen}
    >
      <div
        onClick={closeCart}
        className={cn(
          "absolute inset-0 bg-ink/40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-cream shadow-2xl transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-lg">Your bag ({count})</h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Close bag"
            className="grid h-9 w-9 place-items-center rounded-full text-ink hover:text-brand"
          >
            <CloseIcon />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <BagIcon width={40} height={40} className="text-line" />
            <p className="text-muted">Your bag is empty.</p>
            <button
              type="button"
              onClick={closeCart}
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand"
            >
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-3 text-xs text-muted">
              {remaining > 0 ? (
                <>
                  Add <b className="text-ink">{formatPrice(remaining)}</b> more for free
                  delivery
                </>
              ) : (
                <span className="text-brand">You&rsquo;ve unlocked free delivery ✨</span>
              )}
            </div>

            <ul className="thin-scroll flex-1 divide-y divide-line overflow-y-auto px-5">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-4 py-4">
                  <Link
                    href={`/product/${item.slug}`}
                    onClick={closeCart}
                    className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-sand"
                  >
                    <ProductImage
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </Link>

                  <div className="flex flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <div>
                        {item.brand && (
                          <p className="text-[11px] uppercase tracking-wide text-muted">
                            {item.brand}
                          </p>
                        )}
                        <Link
                          href={`/product/${item.slug}`}
                          onClick={closeCart}
                          className="text-sm font-medium leading-snug hover:text-brand"
                        >
                          {item.name}
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        aria-label={`Remove ${item.name}`}
                        className="h-fit text-muted hover:text-brand"
                      >
                        <CloseIcon width={16} height={16} />
                      </button>
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="inline-flex items-center rounded-full border border-line bg-white">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="grid h-8 w-8 place-items-center hover:text-brand"
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon width={14} height={14} />
                        </button>
                        <span className="w-7 text-center text-sm tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="grid h-8 w-8 place-items-center hover:text-brand"
                          aria-label="Increase quantity"
                        >
                          <PlusIcon width={14} height={14} />
                        </button>
                      </div>
                      <span className="text-sm font-medium">
                        {formatPrice(item.price * item.quantity, item.currency)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-line px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Subtotal</span>
                <span className="text-lg font-medium">{formatPrice(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Shipping &amp; taxes calculated at checkout.
              </p>
              <Link
                href="/checkout"
                onClick={closeCart}
                className="mt-4 flex items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
              >
                Checkout
              </Link>
              <Link
                href="/cart"
                onClick={closeCart}
                className="mt-2 flex items-center justify-center rounded-full py-2.5 text-sm text-ink hover:text-brand"
              >
                View full bag
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
