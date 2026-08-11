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
import {
  applyStockCsv,
  MANUAL_REASONS,
  reconcileOrderStock,
  recordMovement,
  setProductAvailability,
  setStockLevel,
  type MovementReason,
} from "@/lib/inventory";
import type {
  PricingState,
  ProductFormState,
  StockAdjustState,
  StockCsvState,
} from "@/lib/admin-form-state";

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
  const email = await requireAdmin();

  const id = str(formData, "id");
  const name = str(formData, "name");
  const price = num(formData, "price");
  const compareAtRaw = str(formData, "compare_at_price");
  const compareAt = compareAtRaw === "" ? null : num(formData, "compare_at_price");
  const costRaw = str(formData, "cost_price");
  const cost = costRaw === "" ? null : num(formData, "cost_price");
  const thresholdRaw = str(formData, "low_stock_threshold");
  const threshold = thresholdRaw === "" ? 5 : num(formData, "low_stock_threshold");
  // Opening balance only applies when creating; edits go via the ledger.
  const openingRaw = str(formData, "opening_stock");
  const opening = openingRaw === "" ? 0 : num(formData, "opening_stock");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required.";
  if (!Number.isFinite(price) || price < 0) fieldErrors.price = "Enter a price of 0 or more.";
  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) {
    fieldErrors.compare_at_price = "Enter a valid compare-at price, or leave it blank.";
  }
  if (compareAt !== null && Number.isFinite(price) && compareAt > 0 && compareAt <= price) {
    fieldErrors.compare_at_price = "Compare-at price should be higher than the selling price.";
  }
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    fieldErrors.cost_price = "Enter a valid cost price, or leave it blank.";
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    fieldErrors.low_stock_threshold = "Threshold must be 0 or more.";
  }
  if (!id && (!Number.isFinite(opening) || opening < 0)) {
    fieldErrors.opening_stock = "Opening stock must be 0 or more.";
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
    cost_price: cost,
    sku: optStr(formData, "sku"),
    barcode: optStr(formData, "barcode"),
    low_stock_threshold: Math.floor(threshold),
    short_description: optStr(formData, "short_description"),
    description: optStr(formData, "description"),
    category_id: optStr(formData, "category_id"),
    brand_id: optStr(formData, "brand_id"),
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
      // Opening balance goes through the ledger like every other change, so the
      // very first number is attributable too.
      const openingUnits = Math.floor(opening);
      if (openingUnits > 0) {
        await recordMovement({
          productId: newId,
          delta: openingUnits,
          reason: "initial",
          note: "Opening balance at creation",
          actor: email,
        });
      }
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

/* ------------------------------ inventory ------------------------------ */

/** Invalidate the inventory surfaces plus the storefront pages a stock change affects. */
function revalidateInventory(slug?: string | null) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  if (slug) revalidatePath(`/product/${slug}`);
}

/**
 * Manual stock change for one product (client requirement: adjustments with a
 * reason). Accepts either an absolute figure or a relative delta — counting a
 * shelf gives you an absolute, receiving a delivery gives you a delta.
 */
export async function adjustStockAction(
  _prev: StockAdjustState,
  formData: FormData,
): Promise<StockAdjustState> {
  const email = await requireAdmin();

  const productId = str(formData, "product_id");
  const slug = optStr(formData, "slug");
  const mode = str(formData, "adjust_mode"); // "absolute" | "delta"
  const reason = str(formData, "reason") as MovementReason;
  const note = optStr(formData, "note");
  const value = num(formData, "value");

  if (!productId) return { ok: false, message: null, error: "Missing product." };
  if (!Number.isFinite(value)) {
    return { ok: false, message: null, error: "Enter a whole number." };
  }
  if (!MANUAL_REASONS.includes(reason)) {
    return { ok: false, message: null, error: "Choose a reason for this change." };
  }

  try {
    if (mode === "delta") {
      const delta = Math.trunc(value);
      if (delta === 0) {
        return { ok: false, message: null, error: "A change of zero does nothing." };
      }
      const balance = await recordMovement({
        productId,
        delta,
        reason,
        note,
        actor: email,
      });
      revalidateInventory(slug);
      return {
        ok: true,
        message: `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} — on hand is now ${balance}.`,
        error: null,
      };
    }

    const { delta, balance } = await setStockLevel({
      productId,
      newQuantity: Math.trunc(value),
      reason,
      note,
      actor: email,
    });
    revalidateInventory(slug);
    return {
      ok: true,
      message:
        delta === 0
          ? "On hand already matched — nothing recorded."
          : `On hand set to ${balance} (${delta > 0 ? "+" : ""}${delta}).`,
      error: null,
    };
  } catch (e) {
    return { ok: false, message: null, error: (e as Error).message };
  }
}

/**
 * Turn a product on or off for sale.
 *
 * This is the workflow the store actually runs on: stock is sourced per order,
 * so when something can't be obtained the admin switches it off rather than
 * fiddling with quantities. Exposed as a plain form action so it can sit as a
 * one-click control in the inventory list.
 */
export async function setAvailabilityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = str(formData, "product_id");
  if (!productId) return;

  const available = str(formData, "available") === "1";
  await setProductAvailability(productId, available);
  revalidateInventory(optStr(formData, "slug"));
  revalidatePath("/shop");
}

/**
 * Bulk stock update and stock take, chosen by the `mode` field:
 *
 *  - `set`   — overwrite on-hand from the sheet (ledger reason: adjustment)
 *  - `count` — stock take; same maths, reported as variance (reason: count)
 *
 * `apply` decides whether anything is written; without it this is a dry run.
 */
export async function stockCsvAction(
  _prev: StockCsvState,
  formData: FormData,
): Promise<StockCsvState> {
  const email = await requireAdmin();

  const apply = str(formData, "apply") === "1";
  const mode = str(formData, "mode") === "count" ? "count" : "set";

  try {
    const text = await readUpload(formData);
    const result = await applyStockCsv(text, { apply, mode, actor: email });
    if (apply) {
      revalidateInventory();
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
  const email = await requireAdmin();
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!id || !isOrderStatus(status)) return;

  await setOrderStatus(id, status);

  // Bring the stock ledger in line with the new status: cancelling a paid order
  // returns its units, re-instating it takes them out again. The reconciler
  // writes only the difference, so repeating a status change is harmless.
  try {
    await reconcileOrderStock({ orderId: id, status, actor: email });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[inventory] reconcile failed for order ${id}: ${(e as Error).message}`);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/account");
}
