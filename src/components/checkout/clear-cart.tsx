"use client";

import { useEffect, useRef } from "react";
import { useCartOptional } from "@/components/cart/cart-provider";

/**
 * Empties the bag once the order is confirmed. Rendered by the success page.
 *
 * Waits for `hydrated` rather than clearing on mount. The provider restores the
 * saved bag in an effect of its own, and child effects run before parent ones —
 * so clearing immediately would be undone by that restore a moment later, and
 * the customer would land on "thank you" with the order still in their bag.
 *
 * Uses the non-throwing hook deliberately: this is bookkeeping that runs after
 * money has already changed hands, and there is no error boundary above it. A
 * missing provider should cost the shopper a stale bag, not their confirmation.
 */
export function ClearCart() {
  const cart = useCartOptional();
  const cleared = useRef(false);

  const hydrated = cart?.hydrated ?? false;
  const clear = cart?.clear;

  useEffect(() => {
    if (!hydrated || cleared.current || !clear) return;
    cleared.current = true;
    clear();
  }, [hydrated, clear]);

  return null;
}
