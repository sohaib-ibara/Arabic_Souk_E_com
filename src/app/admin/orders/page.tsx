import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { OrdersTable } from "@/components/admin/orders-table";
import { isAdmin } from "@/lib/admin-auth";
import { listOrders, isOrderStatus, type OrderStatus } from "@/lib/admin-orders";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Orders · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const rawStatus = str(sp.status);
  const status = isOrderStatus(rawStatus) ? rawStatus : "all";
  const search = str(sp.search);
  const parsedPage = Number.parseInt(str(sp.page) || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : parsedPage;

  const result = await listOrders({
    status: status as OrderStatus | "all",
    search,
    page,
  });

  const awaiting = result.countsByStatus.paid;

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Every order placed through checkout, with customer contact details.
        </p>
      </div>

      {result.error ? (
        <Notice tone="warning" title="Orders aren’t available" className="mt-6">
          {result.error}
        </Notice>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total orders" value={result.total} />
            <Stat
              label="Awaiting fulfilment"
              value={awaiting}
              hint="Paid, not yet fulfilled"
            />
            <Stat label="Fulfilled" value={result.countsByStatus.fulfilled} />
            <Stat
              label="Revenue"
              value={formatPrice(result.revenue)}
              hint="Paid + fulfilled orders"
            />
          </div>

          <OrdersTable result={result} status={status} search={search} />
        </>
      )}
    </Container>
  );
}
