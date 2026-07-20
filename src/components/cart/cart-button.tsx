"use client";

import { useCart } from "./cart-provider";
import { BagIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function CartButton({ className }: { className?: string }) {
  const { count, openCart, hydrated } = useCart();
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`Open shopping bag${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:text-brand",
        className,
      )}
    >
      <BagIcon width={22} height={22} />
      {hydrated && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white">
          {count}
        </span>
      )}
    </button>
  );
}
