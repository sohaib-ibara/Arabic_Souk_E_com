import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { getSessionUser } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/admin-auth";
import { getMyOrders } from "@/lib/customer-orders";
import { formatPrice } from "@/lib/format";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "My account" };

/** Order status as the customer should read it — not the internal vocabulary. */
const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting payment", className: "bg-amber-50 text-amber-800 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  fulfilled: { label: "Delivered", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
};

function orderDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Reads the auth cookie — must not be cached.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  // Server-side backstop for the login check: catches staff sessions created
  // before that check existed, and any case where the client-side call failed.
  if (isAllowedEmail(user.email)) redirect("/admin");

  const firstName = user.fullName?.split(" ")[0] || null;
  const orders = await getMyOrders();

  return (
    <Container className="py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">
            {firstName ? `Hello, ${firstName}` : "My account"}
          </h1>
          <p className="mt-1 text-sm text-muted">Manage your details and orders.</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8 grid gap-4">
        {/* Details */}
        <section className="rounded-2xl border border-line bg-white p-6 sm:max-w-md">
          <h2 className="font-serif text-lg">Your details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Name</dt>
              <dd className="text-right">{user.fullName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="text-right break-all">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Phone</dt>
              <dd className="text-right">{user.phone || "—"}</dd>
            </div>
          </dl>
        </section>

        {/* Orders */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-serif text-lg">Your orders</h2>

          {orders.length === 0 ? (
            <>
              <p className="mt-4 text-sm text-muted">You haven&rsquo;t placed any orders yet.</p>
              <Link
                href="/shop"
                className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand"
              >
                Start shopping
              </Link>
            </>
          ) : (
            <ul className="mt-5 space-y-4">
              {orders.map((order) => {
                const status = statusLabels[order.status] ?? {
                  label: order.status,
                  className: "bg-sand text-muted border-line",
                };
                return (
                  <li key={order.id} className="rounded-xl border border-line p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="mt-0.5 text-xs text-muted">{orderDate(order.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-sm font-medium">
                          {formatPrice(order.total, order.currency)}
                        </span>
                      </div>
                    </div>

                    {order.items.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-muted">
                        {order.items.map((line, i) => (
                          <li key={i} className="flex justify-between gap-4">
                            <span className="line-clamp-1">
                              {line.name}
                              {line.quantity > 1 && ` × ${line.quantity}`}
                            </span>
                            <span className="shrink-0">
                              {formatPrice(line.unitPrice * line.quantity, order.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
