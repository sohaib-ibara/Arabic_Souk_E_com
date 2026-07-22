"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
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
}

export function ShopToolbar({
  categories,
  filters,
}: {
  categories: Category[];
  filters: ShopFilters;
}) {
  const router = useRouter();

  function buildHref(overrides: Partial<ShopFilters>) {
    const merged = { ...filters, ...overrides };
    const p = new URLSearchParams();
    if (merged.category) p.set("category", merged.category);
    if (merged.brand) p.set("brand", merged.brand);
    if (merged.search) p.set("search", merged.search);
    if (merged.sort && merged.sort !== "featured") p.set("sort", merged.sort);
    const qs = p.toString();
    return qs ? `/shop?${qs}` : "/shop";
  }

  const chipClass = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm transition-colors",
      active
        ? "border-brand bg-brand text-white"
        : "border-line bg-white text-ink hover:border-brand hover:text-brand",
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <label htmlFor="sort" className="text-sm text-muted">
          Sort by
        </label>
        <select
          id="sort"
          value={filters.sort ?? "featured"}
          onChange={(e) => router.push(buildHref({ sort: e.target.value }))}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm outline-none hover:border-brand focus:border-brand"
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
