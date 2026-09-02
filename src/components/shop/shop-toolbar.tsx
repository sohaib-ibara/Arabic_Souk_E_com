"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand, Category } from "@/lib/types";
import { cn } from "@/lib/cn";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Top rated" },
];

export interface ShopFilters {
  category?: string;
  brand?: string;
  search?: string;
  sort?: string;
  priceMin?: string;
  priceMax?: string;
}

/**
 * The shop's filters.
 *
 * There were two: a row of category chips and a sort dropdown. With 332
 * products across 25 pages, that left brand and price - the two things people
 * actually shop by in beauty - reachable only by editing the URL. The brand
 * filter existed in the data layer and had no control at all.
 *
 * Everything stays in the URL rather than in component state, so a filtered
 * view can be sent to somebody, bookmarked, or reached with the back button.
 */
export function ShopToolbar({
  categories,
  brands,
  filters,
}: {
  categories: Category[];
  brands: Brand[];
  filters: ShopFilters;
}) {
  const router = useRouter();

  /*
    Price is the one filter that is typed rather than picked, so it is held
    locally until the shopper is done: navigating on every keystroke would fire
    a request for "1", then "12", then "125" and land them somewhere they never
    asked to be. Applied on blur, on Enter, or with the button.
  */
  const [minInput, setMinInput] = useState(filters.priceMin ?? "");
  const [maxInput, setMaxInput] = useState(filters.priceMax ?? "");

  /*
    The URL is the source of truth; the back button and the Clear link both
    change it without touching these fields, so the boxes have to follow.

    Adjusted during render rather than in an effect. An effect would paint the
    stale value first and correct it on the next frame, and React's own advice
    for "reset state when a prop changes" is exactly this shape - the same one
    register-prompt.tsx uses to close itself on navigation.
  */
  const fromUrl = `${filters.priceMin ?? ""}|${filters.priceMax ?? ""}`;
  const [lastUrl, setLastUrl] = useState(fromUrl);
  if (lastUrl !== fromUrl) {
    setLastUrl(fromUrl);
    setMinInput(filters.priceMin ?? "");
    setMaxInput(filters.priceMax ?? "");
  }

  function buildHref(overrides: Partial<ShopFilters>) {
    const merged = { ...filters, ...overrides };
    const p = new URLSearchParams();
    if (merged.category) p.set("category", merged.category);
    if (merged.brand) p.set("brand", merged.brand);
    if (merged.search) p.set("search", merged.search);
    if (merged.sort && merged.sort !== "featured") p.set("sort", merged.sort);
    if (merged.priceMin) p.set("price_min", merged.priceMin);
    if (merged.priceMax) p.set("price_max", merged.priceMax);
    const qs = p.toString();
    return qs ? `/shop?${qs}` : "/shop";
  }

  /** Digits and one decimal point, or nothing. Anything else is dropped. */
  const clean = (v: string) => {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? String(n) : undefined;
  };

  function applyPrice() {
    const min = clean(minInput);
    const max = clean(maxInput);
    // A backwards range returns nothing and reads as a broken shop, so swap it
    // rather than making the shopper work out what they did.
    const swap = min && max && Number(min) > Number(max);
    router.push(
      buildHref({ priceMin: swap ? max : min, priceMax: swap ? min : max }),
    );
  }

  const chipClass = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm transition-colors",
      active
        ? "border-brand bg-brand text-white"
        : "border-line bg-white text-ink hover:border-brand hover:text-brand",
    );

  const fieldClass =
    "rounded-full border border-line bg-white px-4 py-2 text-sm outline-none hover:border-brand focus:border-brand";

  const filtered = Boolean(
    filters.category || filters.brand || filters.priceMin || filters.priceMax,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {filtered && (
          <Link
            href={buildHref({
              category: undefined,
              brand: undefined,
              priceMin: undefined,
              priceMax: undefined,
            })}
            className="mr-auto text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Clear filters
          </Link>
        )}

        {brands.length > 0 && (
          <>
            <label htmlFor="brand" className="sr-only">
              Brand
            </label>
            <select
              id="brand"
              value={filters.brand ?? ""}
              onChange={(e) => router.push(buildHref({ brand: e.target.value || undefined }))}
              className={fieldClass}
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1">
          <label htmlFor="price-min" className="sr-only">
            Lowest price
          </label>
          <input
            id="price-min"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Min"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === "Enter" && applyPrice()}
            className="w-16 bg-transparent px-1 py-1 text-sm outline-none [appearance:textfield] placeholder:text-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span aria-hidden="true" className="text-muted">
            –
          </span>
          <label htmlFor="price-max" className="sr-only">
            Highest price
          </label>
          <input
            id="price-max"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Max"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === "Enter" && applyPrice()}
            className="w-16 bg-transparent px-1 py-1 text-sm outline-none [appearance:textfield] placeholder:text-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pr-1 text-xs text-muted">BHD</span>
        </div>

        <label htmlFor="sort" className="text-sm text-muted">
          Sort by
        </label>
        <select
          id="sort"
          value={filters.sort ?? "featured"}
          onChange={(e) => router.push(buildHref({ sort: e.target.value }))}
          className={fieldClass}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Link href={buildHref({ category: undefined })} className={chipClass(!filters.category)}>
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={buildHref({ category: c.slug })}
            className={cn(chipClass(filters.category === c.slug), "whitespace-nowrap")}
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
