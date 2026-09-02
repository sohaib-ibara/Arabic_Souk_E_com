import { Container } from "@/components/ui/container";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while /shop resolves. The shop reads the whole catalogue and filters it
 * in memory, so a filter change is a round trip - without this the page simply
 * sat there, and the shopper could not tell a slow filter from a broken one.
 */
export default function ShopLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-6 h-9 w-56" />
      <Skeleton className="mt-2 h-3.5 w-32" />
      <Skeleton className="mt-8 h-10 w-full rounded-full" />
      <div className="mt-10">
        <ProductGridSkeleton count={8} />
      </div>
    </Container>
  );
}
