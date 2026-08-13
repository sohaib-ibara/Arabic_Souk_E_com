"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { useCart } from "@/components/cart/cart-provider";
import { BagIcon, CheckIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";

export function ProductBuyBox({ product }: { product: Product }) {
  const { addItem, openCart } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function add(open = false) {
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        currency: product.currency,
        image: product.images[0] ?? "",
        brand: product.brand_name,
      },
      qty,
    );
    if (open) openCart();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }

  // Off sale: no quantity, no buttons. The checkout would refuse this order
  // anyway, so the honest place to say so is before anything is added.
  if (!product.in_stock) {
    return (
      <div className="mt-6 space-y-4">
        <div
          role="status"
          className="rounded-2xl border border-line bg-sand/60 p-5 text-sm"
        >
          <p className="font-medium text-ink">Currently unavailable</p>
          <p className="mt-1 text-muted">
            We can&rsquo;t source this one at the moment, so it can&rsquo;t be ordered. Do get in
            touch if you&rsquo;d like us to look for it.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line bg-sand px-6 py-3.5 text-sm font-medium text-muted"
          >
            <BagIcon width={18} height={18} /> Unavailable
          </button>
          <Link
            href="/shop"
            className="inline-flex flex-1 items-center justify-center rounded-full border border-brand px-6 py-3.5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
          >
            Browse similar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-ink">Quantity</span>
        <div className="inline-flex items-center rounded-full border border-line bg-white">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="grid h-10 w-10 place-items-center rounded-full text-ink hover:text-brand disabled:opacity-40"
            aria-label="Decrease quantity"
            disabled={qty <= 1}
          >
            <MinusIcon width={16} height={16} />
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(10, q + 1))}
            className="grid h-10 w-10 place-items-center rounded-full text-ink hover:text-brand"
            aria-label="Increase quantity"
          >
            <PlusIcon width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => add(false)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
        >
          {added ? (
            <>
              <CheckIcon width={18} height={18} /> Added to bag
            </>
          ) : (
            <>
              <BagIcon width={18} height={18} /> Add to bag
            </>
          )}
        </button>
        <Link
          href="/checkout"
          onClick={() => add(false)}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-brand px-6 py-3.5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
        >
          Buy it now
        </Link>
      </div>
    </div>
  );
}
