import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { AdminProductRow, ListResult, Option } from "@/lib/admin-products";

function StockPill({ product }: { product: AdminProductRow }) {
  if (!product.in_stock) {
    return (
      <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">Unlisted</span>
    );
  }
  if (product.stock_quantity <= 0) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        Out of stock
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
      {product.stock_quantity} in stock
    </span>
  );
}

/** Builds a /admin/products URL preserving the active filters. */
function hrefFor(params: { search?: string; categoryId?: string; page?: number }) {
  const p = new URLSearchParams();
  if (params.search) p.set("search", params.search);
  if (params.categoryId) p.set("category", params.categoryId);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

export function ProductsTable({
  result,
  categories,
  search,
  categoryId,
}: {
  result: ListResult;
  categories: Option[];
  search: string;
  categoryId: string;
}) {
  const { items, total, page, pageCount, perPage } = result;
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

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
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Filter
        </button>
        {(search || categoryId) && (
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

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-180 text-sm">
          <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center text-muted">
                  Nothing here yet. Use <span className="text-ink">Add product</span> to create
                  one.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-t border-line align-middle">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted">{p.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.category_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{p.brand_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-medium">{formatPrice(p.price, p.currency)}</span>
                    {p.compare_at_price != null && p.compare_at_price > p.price && (
                      <span className="ml-2 text-xs text-muted line-through">
                        {formatPrice(p.compare_at_price, p.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StockPill product={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-brand hover:underline"
                    >
                      Edit
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
