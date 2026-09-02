"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";

/**
 * Results under the search bar, as you type.
 *
 * The search box used to be a one-way trip: type, press enter, wait for a full
 * page of 24 cards, discover you spelt the brand wrong, go back. For a
 * catalogue where people search by half-remembered product names — "the
 * ordinary something acid" — that round trip is the whole cost of searching.
 *
 * Deliberately not a replacement for the results page. Eight rows, no filters,
 * no paging: enough to recognise the thing you meant, with a way through to the
 * real page when it is not in the list.
 */

const MIN_CHARS = 2;
/** Long enough to skip the middle of a word, short enough to feel live. */
const DEBOUNCE_MS = 250;

interface Hit {
  slug: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image: string | null;
  brand: string | null;
  in_stock: boolean;
}

export function SearchSuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: () => void;
}) {
  /*
    The query and its results are one piece of state, not two.

    Kept together so a render can tell whether what it holds actually answers
    what is in the box: results for "ser" must not be shown under "serum", and
    "nothing matched" must not appear against a word still being typed. Both
    are the same bug, and separate `hits` / `searched` state is what lets them
    disagree.
  */
  const [result, setResult] = useState<{ q: string; hits: Hit[] } | null>(null);

  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_CHARS) return;

    const controller = new AbortController();
    // Debounced AND abortable: the timer stops most requests being made, and
    // the abort stops a slow earlier one landing after a faster later one and
    // showing results for a query the shopper has already moved past.
    const timer = window.setTimeout(() => {
      fetch(`/api/products?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { products: [] }))
        .then((data: { products: Hit[] }) => setResult({ q, hits: data.products ?? [] }))
        .catch(() => {
          /* aborted, or offline: leave whatever is on screen */
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (q.length < MIN_CHARS) return null;
  // Nothing to say until the answer for THIS query is in.
  if (!result || result.q !== q) return null;
  const hits = result.hits;

  return (
    <div className="absolute inset-x-0 top-full border-t border-line bg-cream shadow-xl">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        {hits.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">
            Nothing matched “{q}”. Try a brand, or a shorter word.
          </p>
        ) : (
          <>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {hits.map((h) => (
                <li key={h.slug}>
                  <Link
                    href={`/product/${h.slug}`}
                    onClick={onPick}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-brand-tint"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                      <ProductImage src={h.image} alt="" fill sizes="48px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {h.brand && (
                        <p className="text-[11px] uppercase tracking-wide text-muted">{h.brand}</p>
                      )}
                      <p className="truncate text-sm text-ink">{h.name}</p>
                    </div>
                    <Price
                      price={h.price}
                      compareAt={h.compare_at_price}
                      currency={h.currency}
                      size="sm"
                      className="shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/shop?search=${encodeURIComponent(q)}`}
              onClick={onPick}
              className="block border-t border-line px-2 py-3 text-center text-sm text-brand hover:text-brand-dark"
            >
              See all results for “{q}”
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
