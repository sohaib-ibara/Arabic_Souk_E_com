"use client";

import { useRouter } from "next/navigation";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Top rated" },
];

export function SortSelect({ basePath, sort }: { basePath: string; sort?: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-muted">
        Sort by
      </label>
      <select
        id="sort"
        value={sort ?? "featured"}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v && v !== "featured" ? `${basePath}?sort=${v}` : basePath);
        }}
        className="rounded-full border border-line bg-white px-4 py-2 text-sm outline-none hover:border-brand focus:border-brand"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
