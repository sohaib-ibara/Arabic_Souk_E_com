import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { InventoryTable } from "@/components/admin/inventory-table";
import { MovementsTable } from "@/components/admin/movements-table";
import { BulkStockUpdate, StockTake } from "@/components/admin/stock-csv";
import { isAdmin } from "@/lib/admin-auth";
import {
  getInventoryOverview,
  getRecentMovements,
  listInventory,
  type InventoryFilter,
  type InventoryList,
} from "@/lib/inventory";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Inventory · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

const FILTERS: InventoryFilter[] = ["all", "oversold", "unavailable"];

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-muted">{label}</p>
      <p
        className={
          "mt-2 font-serif text-3xl " +
          (tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "")
        }
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const rawFilter = str(sp.filter) as InventoryFilter;
  const filter: InventoryFilter = FILTERS.includes(rawFilter) ? rawFilter : "all";
  const search = str(sp.search);
  const parsedPage = Number.parseInt(str(sp.page) || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : parsedPage;

  /*
    All four in one wave.

    The readiness check used to be awaited on its own, ahead of this, so the
    page sat through a round trip before it could even ask for what it came
    for. It now arrives with the figures — see getInventoryOverview.

    The table and the movements are asked for regardless. If the migrations
    really are outstanding they fail, which they are already written to
    survive: listInventory throws and is caught below, getRecentMovements
    returns nothing. Two doomed queries in a state that exists once, at setup,
    against a round trip on every load for everyone else.
  */
  const [stock, result, recent] = await Promise.all([
    getInventoryOverview(),
    listInventory({ filter, search, page }).catch(
      () => ({ items: [], total: 0, page, perPage: 25, pageCount: 1 }) as InventoryList,
    ),
    getRecentMovements(15),
  ]);

  if (!stock.status.ready) {
    return (
      <Container className="py-10">
        <h1 className="font-serif text-3xl sm:text-4xl">Inventory</h1>
        <Notice tone="warning" title="Inventory isn’t set up yet" className="mt-6">
          {stock.status.error}
        </Notice>
      </Container>
    );
  }

  const stats = stock.stats;

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Inventory</h1>
          <p className="mt-1 text-sm text-muted">
            What&rsquo;s been sold and still needs ordering, and what&rsquo;s on sale. Every change
            is recorded.
          </p>
        </div>
      </div>

      {/*
        Three cards, not four. "Running low" counted every product at or below
        its threshold, which for a shop that holds no stock meant 293 of 301 —
        an alarm on almost the whole catalogue is worse than no alarm. Stock
        value has no meaning until cost prices exist, so it appears only then.
      */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label={`To buy from ${siteConfig.supplier}`}
          value={stats.oversoldCount}
          tone={stats.oversoldCount > 0 ? "danger" : undefined}
          hint="Sold, not yet ordered"
        />
        <Stat label="On sale" value={stats.productCount - stats.unavailableCount} hint="Customers can buy these" />
        <Stat label="Not sold" value={stats.unavailableCount} hint="Switched off, still browsable" />
      </div>

      {/*
        Every space that touches a tag or an {expression} is written as an
        explicit {" "} on its own line. This transform drops the leading space of
        text that follows one, which is what produced "noonafter" here and
        "storeswitch" in the copy this replaces. Verified in the rendered page,
        not assumed — the behaviour is inconsistent enough that reading the JSX
        doesn't tell you which spaces survive.
      */}
      <Notice tone="info" className="mt-8">
        <strong className="text-ink">How this works.</strong>
        {" "}
        Stock is bought from{" "}
        {siteConfig.supplier}
        {" "}
        after a customer pays, so there&rsquo;s nothing on a shelf to count. The only thing that
        decides whether a product can be ordered is the{" "}
        <em>Sold on the store</em>
        {" "}
        switch &mdash; turn it off when you can&rsquo;t get something. The{" "}
        <em>To buy</em>
        {" "}
        figure is what customers have paid for and staff still need to order.
      </Notice>

      <InventoryTable result={result} filter={filter} search={search} />

      <div className="mt-12">
        <h2 className="font-serif text-2xl">Bulk tools</h2>
        <p className="mt-1 text-sm text-muted">
          Update many products at once, or reconcile against a physical count.
        </p>
        <div className="mt-6">
          <BulkStockUpdate />
          <StockTake />
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Recent activity</h2>
        <p className="mt-1 text-sm text-muted">The latest movements across all products.</p>
        <div className="mt-4">
          <MovementsTable
            movements={recent}
            showProduct
            emptyMessage="No stock movements yet. Sales, adjustments and counts appear here."
          />
        </div>
      </section>
    </Container>
  );
}
