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
                    <td className="px-4 py-3">
                      {item.productId ? (
                        <Link
                          href={`/admin/products/${item.productId}`}
                          className="text-ink hover:text-brand"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <>
                          {item.name}
                          <span className="block text-xs text-muted">
                            product no longer in catalogue
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatPrice(item.unitPrice, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium">
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
              <Row label="Status">
                <StatusBadge status={order.status} />
              </Row>
              <Row label="Stripe intent">
                {order.stripePaymentIntent ? (
                  <code className="text-xs break-all">{order.stripePaymentIntent}</code>
                ) : (
                  "—"
                )}
              </Row>
            </div>
          </section>
        </aside>
      </div>
    </Container>
  );
}
