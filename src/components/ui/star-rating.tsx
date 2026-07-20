import { cn } from "@/lib/cn";
import { StarIcon } from "./icons";

export function StarRating({
  rating,
  count,
  showCount = true,
  size = 14,
  className,
}: {
  rating: number;
  count?: number;
  showCount?: boolean;
  size?: number;
  className?: string;
}) {
  const rounded = Math.round(rating);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="flex" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon
            key={i}
            width={size}
            height={size}
            className={i < rounded ? "text-gold" : "text-line"}
          />
        ))}
      </span>
      <span className="text-xs text-muted">
        {rating.toFixed(1)}
        {showCount && count != null ? ` (${count})` : ""}
      </span>
      <span className="sr-only">Rated {rating} out of 5 stars</span>
    </span>
  );
}
