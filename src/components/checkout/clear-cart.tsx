"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/cart-provider";

/** Clears the cart once, on mount. Rendered by the order-success page. */
export function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
