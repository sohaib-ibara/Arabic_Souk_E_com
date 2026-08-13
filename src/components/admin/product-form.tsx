"use client";

import { useActionState } from "react";
import Link from "next/link";
import { deleteProductAction, saveProductAction } from "@/app/admin/actions";
import { emptyProductFormState } from "@/lib/admin-form-state";
import type { AdminProductRow, Option } from "@/lib/admin-products";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand";

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function Check({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border border-line bg-white p-3.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function ProductForm({
  product,
  categories,
  brands,
  justCreated,
}: {
  product: AdminProductRow | null;
  categories: Option[];
  brands: Option[];
  justCreated?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProductAction, emptyProductFormState);
  const isEdit = Boolean(product);
  const err = state.fieldErrors;

  return (
    <>
      {justCreated && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Product created.
        </div>
      )}
      {state.ok && state.message && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          {state.message}
        </div>
      )}
      {!state.ok && state.message && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-8 space-y-8">
        {isEdit && <input type="hidden" name="id" value={product!.id} />}

        <section className="rounded-2xl border border-line bg-sand/40 p-5 sm:p-6">
          <h2 className="font-serif text-lg">Details</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" error={err.name} className="sm:col-span-2">
              <input
                id="name"
                name="name"
                required
                defaultValue={product?.name ?? ""}
                className={inputClass}
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="slug"
              error={err.slug}
              hint="Leave blank to generate from the name. Changing it changes the product URL."
              className="sm:col-span-2"
            >
              <input
                id="slug"
                name="slug"
                defaultValue={product?.slug ?? ""}
                placeholder="auto-generated"
                className={inputClass}
              />
            </Field>

            <Field label="Category" htmlFor="category_id">
              <select
                id="category_id"
                name="category_id"
                defaultValue={product?.category_id ?? ""}
                className={inputClass}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Brand" htmlFor="brand_id">
              <select
                id="brand_id"
                name="brand_id"
                defaultValue={product?.brand_id ?? ""}
                className={inputClass}
              >
                <option value="">— None —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Short description"
              htmlFor="short_description"
              hint="One line, shown on cards and listings."
              className="sm:col-span-2"
            >
              <input
                id="short_description"
                name="short_description"
                defaultValue={product?.short_description ?? ""}
                className={inputClass}
              />
            </Field>

            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <textarea
                id="description"
                name="description"
                rows={5}
                defaultValue={product?.description ?? ""}
                className={cn(inputClass, "resize-y")}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-sand/40 p-5 sm:p-6">
          <h2 className="font-serif text-lg">Pricing</h2>
          <p className="mt-1 text-xs text-muted">
            Prices are in BHD, which uses three decimal places (1 dinar = 1000 fils).
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Field label="Price" htmlFor="price" error={err.price}>
              <input
                id="price"
                name="price"
                inputMode="decimal"
                required
                defaultValue={product ? String(product.price) : ""}
                placeholder="0.000"
                className={inputClass}
              />
            </Field>

            <Field
              label="Compare-at price"
              htmlFor="compare_at_price"
              error={err.compare_at_price}
              hint="Optional “was” price."
            >
              <input
                id="compare_at_price"
                name="compare_at_price"
                inputMode="decimal"
                defaultValue={product?.compare_at_price != null ? String(product.compare_at_price) : ""}
                placeholder="—"
                className={inputClass}
              />
            </Field>

            <Field
              label="Cost price"
              htmlFor="cost_price"
              error={err.cost_price}
              hint="What you pay. Drives margin and stock valuation."
            >
              <input
                id="cost_price"
                name="cost_price"
                inputMode="decimal"
                defaultValue={product?.cost_price != null ? String(product.cost_price) : ""}
                placeholder="—"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-sand/40 p-5 sm:p-6">
          <h2 className="font-serif text-lg">Inventory</h2>
          <p className="mt-1 text-xs text-muted">
            Stock is a record of what you hold — it never blocks an order on its own. Use{" "}
            <em>Listed for sale</em> below to take a product off the store.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Field label="SKU" htmlFor="sku" error={err.slug} hint="Optional, must be unique.">
              <input
                id="sku"
                name="sku"
                defaultValue={product?.sku ?? ""}
                placeholder="—"
                className={inputClass}
              />
            </Field>

            <Field label="Barcode" htmlFor="barcode" hint="EAN / UPC, optional.">
              <input
                id="barcode"
                name="barcode"
                defaultValue={product?.barcode ?? ""}
                placeholder="—"
                className={inputClass}
              />
            </Field>

            <Field
              label="Low-stock threshold"
              htmlFor="low_stock_threshold"
              error={err.low_stock_threshold}
              hint="Flagged when on hand drops to this."
            >
              <input
                id="low_stock_threshold"
                name="low_stock_threshold"
                inputMode="numeric"
                defaultValue={String(product?.low_stock_threshold ?? 5)}
                className={inputClass}
              />
            </Field>

            {isEdit ? (
              <Field label="On hand" htmlFor="on_hand_display">
                <div
                  id="on_hand_display"
                  className="flex items-center justify-between rounded-xl border border-line bg-white/60 px-3.5 py-2.5 text-sm"
                >
                  <span className="font-medium">{product!.stock_quantity}</span>
                  <Link
                    href={`/admin/inventory/${product!.id}`}
                    className="text-xs text-brand hover:underline"
                  >
                    Adjust →
                  </Link>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Changed from the inventory screen, so every movement is recorded.
                </p>
              </Field>
            ) : (
              <Field
                label="Opening stock"
                htmlFor="opening_stock"
                error={err.opening_stock}
                hint="Recorded as an opening-balance movement."
              >
                <input
                  id="opening_stock"
                  name="opening_stock"
                  inputMode="numeric"
                  defaultValue="0"
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-sand/40 p-5 sm:p-6">
          <h2 className="font-serif text-lg">Merchandising</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Check
              name="in_stock"
              label="Listed for sale"
              hint="Uncheck and it still appears, marked “Out of stock” and not orderable."
              defaultChecked={product ? product.in_stock : true}
            />
            <Check name="is_featured" label="Featured" defaultChecked={product?.is_featured} />
            <Check name="is_new" label="New arrival" defaultChecked={product?.is_new} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-sand/40 p-5 sm:p-6">
          <h2 className="font-serif text-lg">Media &amp; tags</h2>
          <div className="mt-5 grid gap-5">
            <Field
              label="Image URLs"
              htmlFor="images"
              hint="One URL per line. Hosts must be allowed in next.config.ts."
            >
              <textarea
                id="images"
                name="images"
                rows={4}
                defaultValue={(product?.images ?? []).join("\n")}
                placeholder="https://images.unsplash.com/…"
                className={cn(inputClass, "resize-y font-mono text-xs")}
              />
            </Field>

            <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
              <input
                id="tags"
                name="tags"
                defaultValue={(product?.tags ?? []).join(", ")}
                placeholder="hydrating, vegan"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </button>
          <Link
            href="/admin/products"
            className="rounded-full border border-line px-6 py-3 text-sm text-muted transition-colors hover:text-ink"
          >
            Cancel
          </Link>
          {isEdit && (
            <Link
              href={`/product/${product!.slug}`}
              target="_blank"
              className="text-sm text-brand hover:underline"
            >
              View on store ↗
            </Link>
          )}
        </div>
      </form>

      {isEdit && (
        <form
          action={deleteProductAction}
          onSubmit={(e) => {
            if (!confirm(`Delete “${product!.name}”? This can't be undone.`)) {
              e.preventDefault();
            }
          }}
          className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-5"
        >
          <input type="hidden" name="id" value={product!.id} />
          <div>
            <p className="text-sm font-medium text-red-800">Delete this product</p>
            <p className="mt-0.5 text-xs text-red-700">
              Removes it from the catalogue. Past order lines keep their recorded name and price.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-full border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            Delete
          </button>
        </form>
      )}
    </>
  );
}
