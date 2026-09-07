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
    No price: an empty line, not a message.

    It said "Price on request" for a version, which invited a request the shop
    cannot answer — there is no price to quote, because the supplier has not
    given one, and all 46 products in this state are also out of stock. The
    card already says so twice, on the Out of stock badge and on the
    Unavailable button, and the product page says it in a panel of its own.
    A third notice in the price slot was one too many.

    The BOX stays, and that is the point of this branch existing at all rather
    than returning null. It is the same box a real price occupies — same
    `items-baseline` wrapper, same font size for the `size` asked for — so the
    prices across a row of cards still land on one line and the button below
    an unpriced card does not ride up to meet it. Returning null would collapse
    it to nothing and bring back the misalignment the client reported twice.

    `invisible` rather than a colour: the space is reserved and the text is
    not painted. `aria-hidden` because there is nothing here to read out.
  */
  if (!(price > 0)) {
    return (
      <span className={cn("inline-flex items-baseline", className)} aria-hidden="true">
        <span className={cn(size === "sm" && "text-sm", size === "lg" && "text-2xl", "invisible")}>
          &nbsp;
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
