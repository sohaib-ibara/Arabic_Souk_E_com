import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES, type OrdersResult, type OrderStatus } from "@/lib/admin-orders";
import { StatusBadge, formatDateTime } from "./order-bits";
import { cn } from "@/lib/cn";
import { adminButton } from "@/components/admin/button-styles";

function hrefFor(params: {
  status: string;
  search: string;
  from?: string;
  to?: string;
  page?: number;
}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "all") p.set("status", params.status);
  if (params.search) p.set("search", params.search);
  if (params.from) p.set("from", params.from);
  if (params.to) p.set("to", params.to);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

/** Today, as the browser-less server would write it for a date input. */
function todayValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function OrdersTable({
  result,
  status,
  search,
  from,
  to,
}: {
  result: OrdersResult;
  status: string;
  search: string;
  from: string;
  to: string;
}) {
  const { items, total, page, pageCount, perPage, countsByStatus } = result;
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

  const tabs: Array<{ key: string; label: string; count: number | null }> = [
    { key: "all", label: "All", count: null },
    ...ORDER_STATUSES.map((s) => ({
      key: s,
      label: s[0].toUpperCase() + s.slice(1),
      count: countsByStatus[s as OrderStatus],
    })),
  ];

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={hrefFor({ status: t.key, search, from, to })}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-colors",
              status === t.key
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-muted hover:border-brand hover:text-brand",
            )}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 opacity-70">{t.count}</span>}
          </Link>
        ))}
      </div>

      <form method="GET" action="/admin/orders" className="mt-4 flex flex-wrap items-center gap-3">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search order number, name or email…"
          aria-label="Search orders"
          className="min-w-60 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        />

        {/*
          The day a purchase request is for.

          Two fields rather than one, because the common case after a weekend
          or a day off is "Friday and Saturday", and a single-day picker makes
          that two downloads a human has to merge. Leave them blank and
          nothing is filtered, which is what this page did before.
        */}
        <label className="flex items-center gap-2 text-sm text-muted">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            max={to || undefined}
            aria-label="Orders placed from"
            className="rounded-full border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          to
          <input
            type="date"
            name="to"
            defaultValue={to}
            min={from || undefined}
            aria-label="Orders placed up to"
            className="rounded-full border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <button
          type="submit"
          className={adminButton("primary")}
        >
          Apply
        </button>

        {/* The one window anybody asks for by name, in one click. */}
        <Link
          href={hrefFor({ status, search, from: todayValue(), to: todayValue() })}
          className={adminButton("secondary")}
        >
          Today
        </Link>

        {(search || from || to) && (
          <Link
            href={hrefFor({ status, search: "", from: "", to: "" })}
            className={adminButton("quiet")}
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        {total === 0 ? "No orders match." : `Showing ${first}–${last} of ${total}`}
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-200 text-sm">
          <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Placed</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium text-right">Items</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-muted">
                  No orders yet. They appear here as soon as a customer checks out.
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatDateTime(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {o.fullName ?? "—"}
                    {o.address.city && (
                      <span className="block text-xs text-muted">{o.address.city}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.email ? (
                      <a href={`mailto:${o.email}`} className="text-brand hover:underline">
                        {o.email}
                      </a>
                    ) : (
                      "—"
                    )}
                    {o.phone && <span className="block text-xs text-muted">{o.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                    {formatPrice(o.total, o.currency)}
                    {o.paymentMethod === "cod" && (
                      <span className="block text-xs font-normal text-muted">cash</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
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
              href={hrefFor({ status, search, from, to, page: page - 1 })}
              className={adminButton("secondary")}
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
              href={hrefFor({ status, search, from, to, page: page + 1 })}
              className={adminButton("secondary")}
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
