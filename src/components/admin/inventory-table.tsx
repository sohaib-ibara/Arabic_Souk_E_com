import Link from "next/link";
import { siteConfig } from "@/lib/config";
import { setAvailabilityAction } from "@/app/admin/actions";
import type { InventoryFilter, InventoryList, InventoryRow } from "@/lib/inventory";
import { cn } from "@/lib/cn";

// "Running low" is gone: with nothing held on a shelf it matched 293 of 301
// products, which is noise rather than a filter.
const filters: Array<{ key: InventoryFilter; label: string }> = [
  { key: "all", label: "All products" },
  { key: "oversold", label: `To buy from ${siteConfig.supplier}` },
  { key: "unavailable", label: "Not sold" },
];

function hrefFor(p: { filter: string; search: string; page?: number }) {
  const q = new URLSearchParams();
  if (p.filter && p.filter !== "all") q.set("filter", p.filter);
  if (p.search) q.set("search", p.search);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  const qs = q.toString();
  return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
}

/**
 * How many units still need ordering from the supplier.
 *
 * The underlying figure is on-hand, which goes negative as paid orders consume
 * stock that was never held. Showing "-3" and asking staff to invert it in
 * their head served no one, so the sign is resolved here: a shortfall reads as
 * the number to buy, and anything else is simply nothing to do.
 */
function StockCell({ row }: { row: InventoryRow }) {
  const toBuy = row.stockQuantity < 0 ? Math.abs(row.stockQuantity) : 0;
  if (toBuy > 0) return <span className="font-medium text-red-700">{toBuy}</span>;
  // A genuine holding is rare but worth showing rather than hiding as "—".
  if (row.stockQuantity > 0) {
    return <span className="text-muted">{row.stockQuantity} held</span>;
  }
  return <span className="text-muted">—</span>;
}

/** One-click on/off. A plain form, so it works without client JS. */
function AvailabilityToggle({ row }: { row: InventoryRow }) {
  return (
    <form action={setAvailabilityAction} className="inline">
      <input type="hidden" name="product_id" value={row.id} />
      <input type="hidden" name="slug" value={row.slug} />
      <input type="hidden" name="available" value={row.inStock ? "0" : "1"} />
      <button
        type="submit"
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          row.inStock
            ? "border-line text-muted hover:border-red-300 hover:text-red-700"
            : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        )}
      >
        {row.inStock ? "Switch off" : "Switch on"}
      </button>
    </form>
  );
}

export function InventoryTable({
  result,
  filter,
  search,
}: {
  result: InventoryList;
  filter: string;
  search: string;
}) {
  const { items, total, page, pageCount, perPage } = result;
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={hrefFor({ filter: f.key, search })}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-colors",
              filter === f.key
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-muted hover:border-brand hover:text-brand",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <form method="GET" action="/admin/inventory" className="mt-4 flex flex-wrap gap-3">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search name, SKU or barcode…"
          aria-label="Search inventory"
          className="min-w-60 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Search
        </button>
        {search && (
          <Link
            href={hrefFor({ filter, search: "" })}
            className="rounded-full border border-line px-5 py-2.5 text-sm text-muted transition-colors hover:text-ink"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        {total === 0 ? "Nothing matches." : `Showing ${first}–${last} of ${total}`}
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-180 text-sm">
          <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium text-right">To buy</th>
              <th className="px-4 py-3 font-medium">Sold on the store</th>
              <th className="px-4 py-3 font-medium text-right">Stock history</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-muted">
                  No products match this filter.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {row.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {row.brandName ?? row.categoryName ?? row.slug}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.sku ? <code className="text-xs">{row.sku}</code> : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StockCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          row.inStock
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-sand text-muted",
                        )}
                      >
                        {row.inStock ? "Yes" : "No"}
                      </span>
                      <AvailabilityToggle row={row} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="text-brand hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={hrefFor({ filter, search, page: page - 1 })}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm transition-colors hover:border-brand hover:text-brand"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={hrefFor({ filter, search, page: page + 1 })}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm transition-colors hover:border-brand hover:text-brand"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
