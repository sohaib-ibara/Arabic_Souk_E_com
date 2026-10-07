import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { OrdersTable } from "@/components/admin/orders-table";
import { SupplierExport } from "@/components/admin/supplier-export";
import { isAdmin } from "@/lib/admin-auth";
import {
  listOrders,
  listOrdersToBuy,
  isOrderStatus,
  PURCHASE_STATUSES,
  type OrderStatus,
} from "@/lib/admin-orders";
import { vendorNames } from "@/lib/vendors";
import { splitBySupplier } from "@/lib/supplier-order";
import { formatPrice } from "@/lib/format";
import { adminRecipients, emailConfigured } from "@/lib/email";

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
  // Only a yyyy-mm-dd gets through. A date input cannot produce anything else,
  // but this is a URL and anyone can type one.
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const from = day(str(sp.from));
  const to = day(str(sp.to));
  const parsedPage = Number.parseInt(str(sp.page) || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : parsedPage;

  /*
    Three reads, one wave. The table is 25 rows; the purchase request needs
    every matching order's lines and is a separate query for that reason; the
    vendor names are two rows and are needed to label the suppliers.
  */
  const [result, toBuy, names] = await Promise.all([
    listOrders({ status: status as OrderStatus | "all", search, from, to, page }),
    listOrdersToBuy({ status: status as OrderStatus | "all", search, from, to }),
    vendorNames(),
  ]);

  const purchase = splitBySupplier(toBuy.orders, names);

  // What the file is for, in the words on the screen and in its filename.
  const coversLabel =
    from && to ? (from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`)
    : from ? `${formatDay(from)} onwards`
    : to ? `up to ${formatDay(to)}`
    : "every open order";
  const coversSlug = from && to ? (from === to ? from : `${from}_${to}`) : from || to || "open";

  // A cash order needs buying and delivering exactly like a paid one — the only
  // difference is when the money arrives — so it counts as awaiting fulfilment.
  const awaiting = result.countsByStatus.paid + result.countsByStatus.confirmed;

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Every order placed through checkout, with customer contact details.
        </p>
      </div>

      {/* Said here because this is where someone would otherwise assume it was
          working. Mail failing silently is the kind of thing nobody notices
          until a customer asks why they never heard anything. */}
      {!emailConfigured() ? (
        <Notice tone="warning" title="Order emails are switched off" className="mt-6">
          Nobody is being emailed — not the customer when they order, and not you when the
          status changes. Set <code className="rounded bg-sand px-1">SMTP_USER</code> and{" "}
          <code className="rounded bg-sand px-1">SMTP_PASS</code> in the environment to turn
          them on. Orders themselves are unaffected.
        </Notice>
      ) : (
        adminRecipients().length === 0 && (
          /* The customer's half works and yours does not, which is the case
             most likely to be mistaken for everything working. */
          <Notice tone="warning" title="You are not being emailed about orders" className="mt-6">
            Customers get their confirmations, but the staff copies have nowhere to go. Set{" "}
            <code className="rounded bg-sand px-1">ADMIN_EMAILS</code> (or{" "}
            <code className="rounded bg-sand px-1">ORDER_ADMIN_EMAILS</code>) to a
            comma-separated list of addresses.
          </Notice>
        )
      )}

      {result.error ? (
        <Notice tone="warning" title="Orders aren’t available" className="mt-6">
          {result.error}
        </Notice>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/*
              Every tile counts the whole shop, including this one.

              It used to count whatever the page was filtered to, which put
              "Total orders 3" beside "Awaiting fulfilment 19" and read as a
              contradiction — the date window made it obvious, the status tabs
              had been doing it quietly all along. How many match the filter is
              already answered by "Showing 1–3 of 3" under the search box, so
              these four are the business and the table is the view.
            */}
            <Stat
              label="Total orders"
              value={Object.values(result.countsByStatus).reduce((a, b) => a + b, 0)}
            />
            <Stat
              label="Awaiting fulfilment"
              value={awaiting}
              hint="Paid or cash, not yet delivered"
            />
            <Stat label="Fulfilled" value={result.countsByStatus.fulfilled} />
            <Stat
              label="Revenue"
              value={formatPrice(result.revenue)}
              hint="Money collected — excludes unpaid cash orders"
            />
          </div>

          <SupplierExport split={purchase} covers={coversSlug} coversLabel={coversLabel}>
            {/*
              What was counted, said before anyone presses a button. The set
              is not "the orders on screen": a purchase request is only ever
              for orders that still need buying, so cancelled, unpaid and
              already-fulfilled ones are out however the page is filtered.
            */}
            <p className="mt-2 text-xs text-muted">
              Counting {toBuy.orderCount} confirmed or paid order
              {toBuy.orderCount === 1 ? "" : "s"}. Cancelled, unpaid and already-fulfilled
              orders are never included.
              {status !== "all" && !PURCHASE_STATUSES.includes(status as OrderStatus) && (
                <span className="text-amber-700">
                  {" "}
                  The {status} filter has nothing to buy in it.
                </span>
              )}
            </p>
            {toBuy.truncated && (
              <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
                More orders match than one request should carry. Narrow the dates — these
                files cover the oldest 500 only.
              </p>
            )}
            {toBuy.error && (
              <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
                Couldn&rsquo;t work out what to buy: {toBuy.error}
              </p>
            )}
          </SupplierExport>

          <OrdersTable
            result={result}
            status={status}
            search={search}
            from={from}
            to={to}
          />
        </>
      )}
    </Container>
  );
}

/** "7 Oct 2026" — short, unambiguous, and the same in every locale we serve. */
function formatDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
