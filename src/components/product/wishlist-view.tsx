"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { useWishlist } from "@/lib/wishlist";

/**
 * The saved list, resolved.
 *
 * Storage holds slugs and nothing else, so the names, prices and images are
 * fetched fresh every time this opens. That is the point: a product saved three
 * weeks ago shows today's price, and one that has since been taken off the shop
 * simply is not in the answer — /api/products only returns listed products, so
 * an unlisted item drops out of the list on its own with nothing to clean up.
 */

interface Saved {
  slug: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image: string | null;
  brand: string | null;
}

export function WishlistView() {
  const { slugs, remove } = useWishlist();
  const [state, setState] = useState<{ for: string; items: Saved[] } | null>(null);

  const key = slugs.join(",");

  useEffect(() => {
    if (!key) {
      // Nothing saved: no request, and the empty state below is the answer.
      return;
    }
    const controller = new AbortController();
    fetch(`/api/products?slugs=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data: { products: Saved[] }) => setState({ for: key, items: data.products ?? [] }))
      .catch(() => {
        /* aborted on unmount, or offline */
      });
    return () => controller.abort();
  }, [key]);

  if (!key) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-line py-20 text-center">
        <p className="font-serif text-xl">Nothing saved yet</p>
        <p className="mt-2 text-sm text-muted">
          Tap the heart on anything you want to come back to.
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  // Slugs are known before the products are. Reserving the space stops the page
  // jumping when they land.
  if (!state || state.for !== key) {
    return (
      <div className="mt-10">
        <ProductGridSkeleton count={Math.min(slugs.length, 8)} />
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-line py-16 text-center">
        <p className="font-serif text-xl">These are no longer on the shop</p>
        <p className="mt-2 text-sm text-muted">
          Everything you saved has since been taken off sale.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
      {state.items.map((p) => (
        <article key={p.slug} className="group flex flex-col">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
            <Link href={`/product/${p.slug}`} aria-label={p.name} className="block h-full w-full">
              <ProductImage
                src={p.image}
                alt={p.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </Link>
            <button
              type="button"
              onClick={() => remove(p.slug)}
              aria-label={`Remove ${p.name} from saved`}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-cream/90 text-muted shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </div>
          <div className="mt-3">
            {p.brand && (
              <p className="text-[11px] uppercase tracking-wide text-muted">{p.brand}</p>
            )}
            <h2 className="mt-0.5">
              <Link
                href={`/product/${p.slug}`}
                className="line-clamp-2 text-sm font-medium leading-snug hover:text-brand"
              >
                {p.name}
              </Link>
            </h2>
            <Price
              price={p.price}
              compareAt={p.compare_at_price}
              currency={p.currency}
              className="mt-2"
            />
          </div>
        </article>
      ))}
    </div>
  );
}
