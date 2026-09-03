import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/types";

/**
 * The row exactly as a shopper will see it.
 *
 * Built by the same function the home page calls, so it cannot drift from it.
 * The tags are the point: they show where the picks run out and the ranking
 * takes over, which is the one thing a numbered list of picks cannot say.
 */
export function ShelfPreview({
  products,
  pinnedIds,
}: {
  products: Product[];
  pinnedIds: Set<string>;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium">What the home page shows right now</h2>
      <p className="mt-1 text-sm text-muted">
        Left to right, then wrapping — the same order as the Bestsellers row on the shop.
      </p>

      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products.map((p, i) => {
          const pinned = pinnedIds.has(p.id);
          return (
            <li key={p.id} className="rounded-xl border border-line p-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-sand">
                <ProductImage
                  src={p.images[0] ?? null}
                  alt={p.name}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[10px] font-medium">
                  {i + 1}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs">{p.name}</p>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  pinned ? "font-medium text-brand" : "text-muted",
                )}
              >
                {pinned ? "Pinned by you" : "Chosen automatically"}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
