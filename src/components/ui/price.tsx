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
  if (!(price > 0)) {
    return (
      <span className={cn("inline-flex items-baseline text-sm text-muted", className)}>
        Price on request
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
