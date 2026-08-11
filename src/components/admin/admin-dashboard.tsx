import Link from "next/link";
import { Container } from "@/components/ui/container";
import { formatPrice, formatDateShort } from "@/lib/format";
import type { AdminOverview } from "@/lib/admin-data";
import type { InventoryStats } from "@/lib/inventory";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const fmtDate = formatDateShort;

export function AdminDashboard({
  overview,
  inventory,
}: {
  overview: AdminOverview;
  /** Null until migration 0005 is applied — the inventory tiles just don't render. */
  inventory: InventoryStats | null;
}) {
  const { catalogue, demandAvailable, demandError, stats, topWanted, recent } = overview;
  const needsAttention = inventory ? inventory.lowCount + inventory.oversoldCount : 0;

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Overview</h1>
        <p className="mt-1 text-sm text-muted">Catalogue and customer-demand monitoring.</p>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Checkout attempts" value={demandAvailable ? stats.attempts : "—"} hint="Demand signals captured" />
        <Stat label="Items requested" value={demandAvailable ? stats.itemsRequested : "—"} hint="Total qty across attempts" />
        <Stat label="Products wanted" value={demandAvailable ? stats.productsWanted : "—"} hint="Distinct products requested" />
        <Stat label="Products" value={catalogue.products} hint="In the catalogue" />
        <Stat label="Categories" value={catalogue.categories} />
        <Stat label="Brands" value={catalogue.brands} />
      </div>

      {/* Stock needing attention is the thing worth interrupting for, so it sits
          above the analytics rather than buried on the inventory tab. */}
      {inventory && needsAttention > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p>
            <strong>
              {inventory.oversoldCount > 0 && `${inventory.oversoldCount} product(s) need buying`}
              {inventory.oversoldCount > 0 && inventory.lowCount > 0 && " · "}
              {inventory.lowCount > 0 && `${inventory.lowCount} running low`}
            </strong>
            <span className="mt-0.5 block text-xs text-amber-800">
              Sold more than you held, or close to it.
            </span>
          </p>
          <Link
            href={`/admin/inventory?filter=${inventory.oversoldCount > 0 ? "oversold" : "low"}`}
            className="rounded-full border border-amber-300 bg-white px-5 py-2.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            Review inventory
          </Link>
        </div>
      )}

      {/* Demand unavailable notice */}
      {!demandAvailable && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-medium">Demand monitoring isn&rsquo;t active yet</p>
          <p className="mt-1">{demandError}</p>
        </div>
      )}

      {demandAvailable && (
        <>
          {/* Top wanted products */}
          <section className="mt-10">
            <h2 className="font-serif text-xl">Most-wanted products</h2>
            <p className="mt-1 text-sm text-muted">
              Ranked by total quantity customers tried to buy while out of stock.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-140 text-sm">
                <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Shoppers</th>
                    <th className="px-4 py-3 font-medium text-right">Qty wanted</th>
                    <th className="px-4 py-3 font-medium text-right">Last requested</th>
                  </tr>
                </thead>
                <tbody>
                  {topWanted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        No demand recorded yet. It appears here after the first checkout attempt.
                      </td>
                    </tr>
                  ) : (
                    topWanted.map((p, i) => (
                      <tr key={p.slug ?? i} className="border-t border-line">
                        <td className="px-4 py-3 text-muted">{i + 1}</td>
                        <td className="px-4 py-3">{p.name ?? p.slug ?? "—"}</td>
                        <td className="px-4 py-3 text-right">{p.shoppers}</td>
                        <td className="px-4 py-3 text-right font-medium">{p.totalQuantity}</td>
                        <td className="px-4 py-3 text-right text-muted">{fmtDate(p.lastRequestedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent leads */}
          <section className="mt-10">
            <h2 className="font-serif text-xl">Recent checkout attempts</h2>
            <p className="mt-1 text-sm text-muted">
              The latest shoppers and how to reach them. Newest first.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-180 text-sm">
                <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium text-right">Items</th>
                    <th className="px-4 py-3 font-medium text-right">Cart value</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        No checkout attempts yet.
                      </td>
                    </tr>
                  ) : (
                    recent.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="px-4 py-3 whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</td>
                        <td className="px-4 py-3">{r.fullName ?? "—"}</td>
                        <td className="px-4 py-3">
                          {r.email ? (
                            <a href={`mailto:${r.email}`} className="text-brand hover:underline">
                              {r.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{r.phone ?? "—"}</td>
                        <td className="px-4 py-3">{r.city ?? "—"}</td>
                        <td className="px-4 py-3 text-right">{r.itemCount}</td>
                        <td className="px-4 py-3 text-right">{formatPrice(r.subtotal, r.currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Container>
  );
}
