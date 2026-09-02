"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";
import { AddToCartButton } from "./add-to-cart-button";

/**
 * The buy button, kept within reach on a phone.
 *
 * A product page is long — gallery, description, ingredients, delivery, reviews,
 * related products — and on a small screen the one control the page exists for
 * scrolls away in the first swipe. Everything below that point is read by
 * somebody who would have to scroll back up to act on it.
 *
 * So once the real buy box has left the top of the screen, a compact copy of it
 * takes the bottom edge. Phones only: on a desktop the buy box is beside the
 * gallery and stays in view on its own.
 *
 * Watches the buy box itself rather than a scroll offset, because "how far down
 * is the button" depends on the length of the product name, whether there is a
 * discount, and how tall the gallery rendered.
 */
export function StickyBuyBar({ product, watch }: { product: Product; watch: string }) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only when the buy box has gone UP off the screen. Scrolling back
        // above it — which happens on load, since the page starts at the top —
        // must not raise the bar.
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  if (!past) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 backdrop-blur-sm lg:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white">
          <ProductImage src={product.images[0]} alt="" fill sizes="44px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{product.name}</p>
          <Price price={product.price} compareAt={product.compare_at_price} currency={product.currency} size="sm" />
        </div>
        <AddToCartButton product={product} label="Add" className="shrink-0 px-5 py-2.5 text-sm" />
      </div>
      {/* Clears the home indicator on iOS, where a button flush with the bottom
          edge is the one the system gesture swallows. */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
