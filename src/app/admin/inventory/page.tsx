import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { InventoryTable } from "@/components/admin/inventory-table";
import { MovementsTable } from "@/components/admin/movements-table";
import { BulkStockUpdate, StockTake } from "@/components/admin/stock-csv";
import { isAdmin } from "@/lib/admin-auth";
import {
  getInventoryStats,
  getInventoryStatus,
  getRecentMovements,
  listInventory,
  type InventoryFilter,
  type InventoryList,
} from "@/lib/inventory";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Inventory · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

const FILTERS: InventoryFilter[] = ["all", "low", "oversold", "unavailable"];

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

  const status = await getInventoryStatus();

  if (!status.ready) {
    return (
      <Container className="py-10">
        <h1 className="font-serif text-3xl sm:text-4xl">Inventory</h1>
        <Notice tone="warning" title="Inventory isn’t set up yet" className="mt-6">
          {status.error}
        </Notice>
      </Container>
    );
  }

  const [stats, result, recent] = await Promise.all([
    getInventoryStats(),
    listInventory({ filter, search, page }).catch(
      () => ({ items: [], total: 0, page, perPage: 25, pageCount: 1 }) as InventoryList,
    ),
    getRecentMovements(15),
  ]);

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Inventory</h1>
          <p className="mt-1 text-sm text-muted">
            Stock levels, movements and counts. Every change is recorded.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Need buying"
          value={stats.oversoldCount}
          tone={stats.oversoldCount > 0 ? "danger" : undefined}
          hint="Sold more than you held"
        />
        <Stat
          label="Running low"
          value={stats.lowCount}
          tone={stats.lowCount > 0 ? "warning" : undefined}
          hint="At or below threshold"
        />
        <Stat
          label="Switched off"
          value={stats.unavailableCount}
          hint="Not sold on the store"
        />
        <Stat
          label="Stock value"
          value={stats.valuationIncomplete ? "—" : formatPrice(stats.totalValue)}
          hint={
            stats.valuationIncomplete
              ? "Add cost prices to value stock"
              : `${stats.totalUnits} units at cost`
          }
        />
      </div>

      <Notice tone="info" className="mt-8">
        <strong className="text-ink">How this works.</strong> Whether a product can be ordered is
        the <em>Sold on the store</em> switch — flip it off when you can&rsquo;t get something. The
        stock number is a record of what you hold: it goes down as orders are paid, and a negative
        figure is simply what you need to buy. It never blocks a sale on its own.
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
