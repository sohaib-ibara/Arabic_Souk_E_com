"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import {
  bulkUpdatePrices,
  deleteProductRow,
  getAdminProduct,
  insertProduct,
  slugify,
  updateProductRow,
  validatePriceFloors,
  type ProductInput,
} from "@/lib/admin-products";
import { isOrderStatus, setOrderStatus } from "@/lib/admin-orders";
import type { PricingState, ProductFormState } from "@/lib/admin-form-state";

/**
 * Server actions for the admin console.
 *
 * Every action calls `requireAdmin()` first. Server actions are reachable by
 * direct POST regardless of what the UI renders, so the layout's session gate
 * is not a security boundary on its own.
 */

/* ---------------------------- form helpers ---------------------------- */

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function num(fd: FormData, key: string): number {
  const v = str(fd, key).replace(/[^0-9.\-]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}

/** Split a textarea of one-per-line values into a trimmed, non-empty array. */
function lines(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function commaList(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Invalidate the admin list plus the storefront surfaces a product appears on. */
function revalidateProduct(slug?: string | null) {
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
  if (slug) revalidatePath(`/product/${slug}`);
}

/* ---------------------------- product form ---------------------------- */

/**
 * Creates or updates a product (client requirements 3 and "change price").
 *
 * A hidden `id` field decides which: absent means insert, present means update.
 * On create we redirect to the new product's edit screen so the next action has
 * somewhere to go; on update we stay put and report success inline.
 */
export async function saveProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  const id = str(formData, "id");
  const name = str(formData, "name");
  const price = num(formData, "price");
  const compareAtRaw = str(formData, "compare_at_price");
  const compareAt = compareAtRaw === "" ? null : num(formData, "compare_at_price");
  const stock = str(formData, "stock_quantity") === "" ? 0 : num(formData, "stock_quantity");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required.";
  if (!Number.isFinite(price) || price < 0) fieldErrors.price = "Enter a price of 0 or more.";
  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) {
    fieldErrors.compare_at_price = "Enter a valid compare-at price, or leave it blank.";
  }
  if (compareAt !== null && Number.isFinite(price) && compareAt > 0 && compareAt <= price) {
    fieldErrors.compare_at_price = "Compare-at price should be higher than the selling price.";
  }
  if (!Number.isFinite(stock) || stock < 0) {
    fieldErrors.stock_quantity = "Stock must be 0 or more.";
  }

  if (Object.keys(fieldErrors).length) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }

  const slug = str(formData, "slug") || slugify(name);
  const input: ProductInput = {
    name,
    slug,
    price,
    compare_at_price: compareAt,
    short_description: optStr(formData, "short_description"),
    description: optStr(formData, "description"),
    category_id: optStr(formData, "category_id"),
    brand_id: optStr(formData, "brand_id"),
    stock_quantity: Math.floor(stock),
    in_stock: bool(formData, "in_stock"),
    is_featured: bool(formData, "is_featured"),
    is_new: bool(formData, "is_new"),
    images: lines(formData, "images"),
    tags: commaList(formData, "tags"),
  };

  let newId: string | null = null;
  try {
    if (id) {
      await updateProductRow(id, input);
    } else {
      newId = (await insertProduct(input)).id;
    }
  } catch (e) {
    const msg = (e as Error).message;
    // 23505 = unique_violation; the only unique column here is `slug`.
    if (/duplicate key|23505/i.test(msg)) {
      return {
        ok: false,
        message: null,
        fieldErrors: { slug: `The slug "${slug}" is already used by another product.` },
      };
    }
    return { ok: false, message: msg, fieldErrors: {} };
  }

  revalidateProduct(slug);

  // redirect() throws a control-flow exception — it must run outside the catch.
  if (newId) redirect(`/admin/products/${newId}?created=1`);

  return { ok: true, message: "Saved.", fieldErrors: {} };
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) return;

  const existing = await getAdminProduct(id);
  await deleteProductRow(id);
  revalidateProduct(existing?.slug);
  redirect("/admin/products?deleted=1");
}

/* ---------------------------- bulk pricing ---------------------------- */

/** Read the uploaded file, guarding against an empty or oversized upload. */
async function readUpload(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a CSV file to upload.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("That file is larger than 5 MB. Split it into smaller batches.");
  }
  return file.text();
}

/**
 * Handles all three CSV operations, chosen by the `mode` field:
 *
 *  - `preview`  — dry run of a bulk price update, writes nothing
 *  - `apply`    — commits the update (client requirement 4)
 *  - `validate` — margin floor check, read-only (client requirement 5)
 */
export async function pricingCsvAction(
  _prev: PricingState,
  formData: FormData,
): Promise<PricingState> {
  await requireAdmin();

  const mode = str(formData, "mode");
  try {
    const text = await readUpload(formData);

    if (mode === "validate") {
      return { kind: "validated", result: await validatePriceFloors(text) };
    }

    const apply = mode === "apply";
    const result = await bulkUpdatePrices(text, { apply });
    if (apply) {
      revalidatePath("/admin/products");
      revalidatePath("/shop");
      revalidatePath("/");
      for (const c of result.changes) revalidatePath(`/product/${c.slug}`);
      return { kind: "applied", result };
    }
    return { kind: "preview", result };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

/* ------------------------------- orders ------------------------------- */

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!id || !isOrderStatus(status)) return;

  await setOrderStatus(id, status);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/account");
}
