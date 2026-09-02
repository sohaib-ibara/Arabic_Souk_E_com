import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The product page's shape, held open while it loads.
 *
 * Mirrors the real two-column layout rather than showing a spinner, so the
 * gallery and the buy box arrive into the space they will occupy instead of
 * pushing each other around as each one resolves.
 */
export default function ProductLoading() {
  return (
    <Container className="py-6 sm:py-8">
      <Skeleton className="h-3 w-56" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-5/6" />
          <Skeleton className="mt-2 h-8 w-2/3" />
          <Skeleton className="mt-5 h-4 w-32" />
          <Skeleton className="mt-6 h-7 w-28" />
          <Skeleton className="mt-8 h-12 w-full rounded-full" />
          <Skeleton className="mt-3 h-12 w-full rounded-full" />
        </div>
      </div>
    </Container>
  );
}
