import { Container } from "@/components/ui/container";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-6 h-9 w-64" />
      <Skeleton className="mt-2 h-3.5 w-40" />
      <div className="mt-10">
        <ProductGridSkeleton count={8} />
      </div>
    </Container>
  );
}
