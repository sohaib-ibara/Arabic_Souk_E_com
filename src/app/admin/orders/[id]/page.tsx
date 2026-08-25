import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { StatusBadge, StatusForm, formatDateTime } from "@/components/admin/order-bits";
import { isAdmin } from "@/lib/admin-auth";
import { getOrder } from "@/lib/admin-orders";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Order · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2.5 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function AdminOrderPage({ params }: { params: Params }) {
  if (!(await isAdmin())) return null;

  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const addr = order.address;
  const addressLines = [addr.address, addr.area, addr.city, addr.governorate].filter(Boolean);

  return (
    <Container className="py-10">
      <Link href="/admin/orders" className="text-sm text-muted hover:text-ink">
        ← Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">{order.orderNumber}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            Placed {formatDateTime(order.createdAt)} <StatusBadge status={order.status} />
          </p>
        </div>
        <StatusForm id={order.id} status={order.status} />
      </div>

      {/* Cash orders carry an instruction a card order doesn't: someone has to
          come back and record that the money arrived. Said once, at the top. */}
      {order.paymentMethod === "cod" && order.status === "confirmed" && (
        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-900">
          <p className="font-medium">
            Cash on delivery — {formatPrice(order.total, order.currency)} to collect
          </p>
          <p className="mt-1 text-sky-800">
            {/* Explicit space: this JSX transform drops the one that would
                otherwise sit between </strong> and the text after it. */}
            Buy the items below, deliver, then set the status to <strong>Paid</strong>{" "}
            once the courier has the money. It isn&rsquo;t counted as revenue until you do.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Line items */}
        <section className="lg:col-span-2">
          <h2 className="font-serif text-xl">Items</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-120 text-sm">
              <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium text-right">Unit price</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    {/* Column stack, not inline: product names here run to a
                        full line of text, and anything following them inline
                        collides with the last word. */}
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-2">
                        {item.productId ? (
                          <Link
                            href={`/admin/products/${item.productId}`}
                            className="text-ink hover:text-brand"
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <span>
                            {item.name}
                            <span className="block text-xs text-muted">
                              product no longer in catalogue
                            </span>
                          </span>
                        )}

                        {/* The fulfilment step: staff buy this line from the
                            supplier once the order is paid. */}
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand hover:text-brand"
                          >
                            Buy from supplier ↗
                          </a>
                        ) : item.productId ? (
                          <span className="text-xs text-amber-700">
                            No supplier link —{" "}
                            <Link
                              href={`/admin/products/${item.productId}`}
                              className="underline hover:no-underline"
                            >
                              add one
                            </Link>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top text-muted">
                      {formatPrice(item.unitPrice, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">{item.quantity}</td>
                    <td className="px-4 py-3 text-right align-top font-medium">
                      {formatPrice(item.unitPrice * item.quantity, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-white p-5">
            <Row label="Subtotal">{formatPrice(order.subtotal, order.currency)}</Row>
            <Row label="Shipping">
              {order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee, order.currency)}
            </Row>
            <Row label="Total">
              <strong>{formatPrice(order.total, order.currency)}</strong>
            </Row>
          </div>
        </section>

        {/* Customer / CRM panel */}
        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-serif text-lg">Customer</h2>
            <div className="mt-3">
              <Row label="Name">{order.fullName ?? "—"}</Row>
              <Row label="Email">
                {order.email ? (
                  <a href={`mailto:${order.email}`} className="text-brand hover:underline">
                    {order.email}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Phone">
                {order.phone ? (
                  <a href={`tel:${order.phone}`} className="text-brand hover:underline">
                    {order.phone}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-serif text-lg">Delivery address</h2>
            {addressLines.length ? (
              <address className="mt-3 text-sm not-italic leading-relaxed text-ink">
                {addressLines.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <p className="mt-3 text-sm text-muted">No address captured.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-serif text-lg">Payment</h2>
            <div className="mt-3">
              <Row label="Method">
                {order.paymentMethod === "cod" ? "Cash on delivery" : "Card (Stripe)"}
              </Row>
              <Row label="Status">
                <StatusBadge status={order.status} />
              </Row>
              {order.paymentMethod === "card" && (
                <Row label="Stripe intent">
                  {order.stripePaymentIntent ? (
                    <code className="text-xs break-all">{order.stripePaymentIntent}</code>
                  ) : (
                    "—"
                  )}
                </Row>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Container>
  );
}
