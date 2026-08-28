import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { AdminProductRow, ListResult, Option } from "@/lib/admin-products";

/**
 * Two states, because there are only two.
 *
 * A sale is gated by the `in_stock` switch alone (see orders.ts) — quantity is
 * never consulted, since stock is bought from the supplier after the order is
 * paid. This column used to read from the quantity instead, and so labelled 299
 * of 301 products "Out of stock" while every one of them was on sale.
 */
function StockPill({ product }: { product: AdminProductRow }) {
  if (!product.in_stock) {
    return <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">Not sold</span>;
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">On sale</span>
  );
}

/** Listed on the storefront, or not there at all. Distinct from "on sale". */
function VisibilityPill({ product }: { product: AdminProductRow }) {
  if (product.is_published) {
    return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">Listed</span>;
  }
  return <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">Hidden</span>;
}

/** Human name for a supplier key. "—" is a product someone added by hand. */
const SOURCE_LABELS: Record<string, string> = {
  noon: "noon",
  cultbeauty: "Cult Beauty",
  none: "Added by hand",
};
const sourceLabel = (key: string | null) => SOURCE_LABELS[key ?? "none"] ?? key ?? "—";

interface Filters {
  search?: string;
  categoryId?: string;
  source?: string;
  visibility?: string;
  page?: number;
}

/** Builds a /admin/products URL preserving the active filters. */
function hrefFor(params: Filters) {
  const p = new URLSearchParams();
  if (params.search) p.set("search", params.search);
  if (params.categoryId) p.set("category", params.categoryId);
  if (params.source) p.set("source", params.source);
  if (params.visibility) p.set("visibility", params.visibility);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

export function ProductsTable({
  result,
  categories,
  sources,
  search,
  categoryId,
  source,
  visibility,
  action,
}: {
  result: ListResult;
  categories: Option[];
  sources: Array<{ key: string; count: number }>;
  search: string;
  categoryId: string;
  source: string;
  visibility: string;
  /** Server action for the bulk list/hide buttons. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const { items, total, page, pageCount, perPage } = result;
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  const filtersActive = Boolean(search || categoryId || source || visibility);
  // Where the bulk action should return to, so a curation pass stays on the
  // supplier and page the person was working through.
  const back = hrefFor({ search, categoryId, source, visibility, page });

  return (
    <>
      {/* Filters — a plain GET form, so this works without client JS. */}
      <form method="GET" action="/admin/products" className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search name or slug…"
          aria-label="Search products"
          className="min-w-60 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        />
        <select
          name="category"
          defaultValue={categoryId}
          aria-label="Filter by category"
          className="rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {/* Supplier. The filter the curation job is actually done through:
            "show me Cult Beauty" then list or hide in bulk. */}
        <select
          name="source"
          defaultValue={source}
          aria-label="Filter by supplier"
          className="rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        >
          <option value="">All suppliers</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {sourceLabel(s.key)} ({s.count})
            </option>
          ))}
        </select>
        <select
          name="visibility"
          defaultValue={visibility}
          aria-label="Filter by visibility"
          className="rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        >
          <option value="">Listed and hidden</option>
          <option value="listed">Listed only</option>
          <option value="hidden">Hidden only</option>
        </select>
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Filter
        </button>
        {filtersActive && (
          <Link
            href="/admin/products"
            className="rounded-full border border-line px-5 py-2.5 text-sm text-muted transition-colors hover:text-ink"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        {total === 0 ? "No products match." : `Showing ${first}–${last} of ${total}`}
      </p>

      {/* Selection and the bulk buttons are one plain form, so this works with
          JavaScript off like the rest of the admin. */}
      <form action={action}>
        <input type="hidden" name="back" value={back} />

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-sand/50 px-4 py-3">
          <span className="text-sm text-muted">With selected:</span>
          <button
            type="submit"
            name="publish"
            value="1"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            List on storefront
          </button>
          <button
            type="submit"
            name="publish"
            value="0"
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
          >
            Hide from storefront
          </button>
          <span className="text-xs text-muted">
            Hidden products keep their data and orders — they just stop appearing.
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-220 text-sm">
            <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3 font-medium">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium">Delivery</th>
                <th className="px-4 py-3 font-medium">Storefront</th>
                <th className="px-4 py-3 font-medium">Availability</th>
                <th className="px-4 py-3 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-muted">
                    Nothing matches. Clear the filters, or use{" "}
                    <span className="text-ink">Add product</span> to create one.
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="border-t border-line align-middle">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        aria-label={`Select ${p.name}`}
                        className="h-4 w-4 rounded border-line accent-brand"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted">{p.slug}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {sourceLabel(p.source)}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.category_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-medium">{formatPrice(p.price, p.currency)}</span>
                      {p.compare_at_price != null && p.compare_at_price > p.price && (
                        <span className="ml-2 text-xs text-muted line-through">
                          {formatPrice(p.compare_at_price, p.currency)}
                        </span>
                      )}
                    </td>
                    {/* The supplier's real window. "Site default" means they
                        stated none, so the page falls back to siteConfig. */}
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {p.lead_days_min && p.lead_days_max ? (
                        <span title={p.supplier_dispatch_note ?? undefined}>
                          {p.lead_days_min}–{p.lead_days_max} days
                        </span>
                      ) : (
                        <span className="text-xs">Site default</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <VisibilityPill product={p} />
                    </td>
                    <td className="px-4 py-3">
                      <StockPill product={p} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/products/${p.id}`} className="text-brand hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </form>

      {pageCount > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={hrefFor({ search, categoryId, page: page - 1 })}
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
              href={hrefFor({ search, categoryId, page: page + 1 })}
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
