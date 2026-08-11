import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { StockAdjustForm } from "@/components/admin/stock-adjust-form";
import { MovementsTable } from "@/components/admin/movements-table";
import { isAdmin } from "@/lib/admin-auth";
import { getInventoryItem, getProductMovements } from "@/lib/inventory";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Stock · Admin",
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

export default async function InventoryDetailPage({ params }: { params: Params }) {
  if (!(await isAdmin())) return null;

  const { id } = await params;
  const item = await getInventoryItem(id);
  if (!item) notFound();

  const movements = await getProductMovements(id, 100);
  const margin =
    item.costPrice != null && item.costPrice > 0
      ? Math.round(((item.price - item.costPrice) / item.price) * 100)
      : null;

  return (
    <Container className="py-10">
      <Link href="/admin/inventory" className="text-sm text-muted hover:text-ink">
        ← Back to inventory
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">{item.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {item.sku ? <code className="text-xs">{item.sku}</code> : item.slug}
            {item.brandName && ` · ${item.brandName}`}
          </p>
        </div>
        <Link
          href={`/admin/products/${item.id}`}
          className="rounded-full border border-line px-5 py-2.5 text-sm transition-colors hover:border-brand hover:text-brand"
        >
          Edit product
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StockAdjustForm product={item} />

          <section>
            <h2 className="font-serif text-xl">Movement history</h2>
            <p className="mt-1 text-sm text-muted">
              Newest first. This is the audit trail — entries are never edited or removed.
            </p>
            <div className="mt-4">
              <MovementsTable movements={movements} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-serif text-lg">Stock</h2>
            <div className="mt-3">
              <Row label="Sold on the store">
                <span
                  className={
                    item.inStock
                      ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-muted"
                  }
                >
                  {item.inStock ? "Yes" : "No"}
                </span>
              </Row>
              <Row label="In stock">
                <strong className={item.stockQuantity < 0 ? "text-red-700" : undefined}>
                  {item.stockQuantity}
                </strong>
              </Row>
              <Row label="Low-stock at">{item.lowStockThreshold}</Row>
            </div>
            {item.stockQuantity < 0 && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                You&rsquo;ve sold {Math.abs(item.stockQuantity)} more than you held. Buy{" "}
                {Math.abs(item.stockQuantity)} to get back to zero, or switch the product off if
                you can&rsquo;t source it.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-serif text-lg">Value</h2>
            <div className="mt-3">
              <Row label="Selling price">{formatPrice(item.price, item.currency)}</Row>
              <Row label="Cost price">
                {item.costPrice != null ? formatPrice(item.costPrice, item.currency) : "—"}
              </Row>
              <Row label="Margin">{margin != null ? `${margin}%` : "—"}</Row>
              <Row label="Stock value">
                {item.costPrice != null ? formatPrice(item.stockValue, item.currency) : "—"}
              </Row>
            </div>
            {item.costPrice == null && (
              <p className="mt-3 text-xs text-muted">
                Add a cost price on the product to see margin and stock value.
              </p>
            )}
          </section>
        </aside>
      </div>
    </Container>
  );
}
