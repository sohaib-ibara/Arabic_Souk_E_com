import { cn } from "@/lib/cn";

/**
 * Placeholder shapes for content that is still on its way.
 *
 * The point is not decoration, it is that the page does not JUMP. A grid that
 * arrives into blank space shifts everything under it; a grid that arrives into
 * placeholders of the same size does not. So these mirror the real cards'
 * proportions - the 4/5 image, two lines of title, a price - rather than being
 * generic grey boxes.
 *
 * `motion-safe` because a pulsing screen is genuinely unpleasant for some
 * people, and "prefers-reduced-motion" is them saying so.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded bg-sand motion-safe:animate-pulse", className)}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      <Skeleton className="mt-3 h-2.5 w-1/3" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-2/3" />
      <Skeleton className="mt-3 h-3 w-1/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading products"
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
