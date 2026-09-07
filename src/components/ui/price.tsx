import { cn } from "@/lib/cn";
import { discountPercent, formatPrice } from "@/lib/format";

export function Price({
  price,
  compareAt,
  currency,
  size = "md",
  className,
}: {
  price: number;
  compareAt?: number | null;
  currency?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  /*
    Zero is not a price.

    noon signals "we cannot sell you this today" by returning 0, and a refresh
    wrote that through to 43 products that were already on the shop. Every one
    of them was correctly badged Out of stock and priced, in the same breath, at
    BHD 0.00 — which reads as broken, or as free.

    The importer no longer overwrites a known price with a zero, but the prices
    it already replaced are not recoverable, and a supplier can always be the
    first to tell us about a product. So the display refuses to print it: out of
    stock with no figure is honest, and out of stock at nothing is not.
  */
  /*
    Same box as a real price, so it sits on the same line as one.

    This branch used to be a bare `text-sm` on the wrapper while a real price
    is an inner span at the size the `size` prop asks for — which at the
    default is the base 16px, not 14px. Two different font sizes inside an
    `items-baseline` flex box put the text 3px apart, and on a shop grid where
    some cards have a price and some do not, that is a row of prices that does
    not line up. It was the last 3px of a misalignment the client reported
    twice; see the note in product-card.tsx for the other 19.
  */
  if (!(price > 0)) {
    return (
      <span className={cn("inline-flex items-baseline", className)}>
        <span
          className={cn(
            "text-muted",
            size === "sm" && "text-sm",
            size === "lg" && "text-2xl",
          )}
        >
          Price on request
        </span>
      </span>
    );
  }

  const dp = discountPercent(price, compareAt);
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span
        className={cn(
          "font-medium text-ink",
          size === "sm" && "text-sm",
          size === "lg" && "text-2xl",
        )}
      >
        {formatPrice(price, currency)}
      </span>
      {dp && compareAt ? (
        <span
          className={cn(
            "text-muted line-through",
            size === "lg" ? "text-base" : "text-xs",
          )}
        >
          {formatPrice(compareAt, currency)}
        </span>
      ) : null}
    </span>
  );
}
