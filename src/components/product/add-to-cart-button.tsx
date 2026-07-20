"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { useCart } from "@/components/cart/cart-provider";
import { BagIcon, CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function AddToCartButton({
  product,
  quantity = 1,
  label = "Add to bag",
  className,
}: {
  product: Product;
  quantity?: number;
  label?: string;
  className?: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleAdd() {
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
      quantity,
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      aria-label={`Add ${product.name} to bag`}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60",
        className,
      )}
    >
      {added ? (
        <>
          <CheckIcon width={18} height={18} />
          Added to bag
        </>
      ) : (
        <>
          <BagIcon width={18} height={18} />
          {label}
        </>
      )}
    </button>
  );
}
