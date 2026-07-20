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
