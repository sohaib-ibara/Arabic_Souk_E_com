import type { BulkUpdateResult, ValidationResult } from "./admin-products";
import type { StockCsvResult } from "./inventory";
import type { ImportResult, RepriceMode, RepriceResult } from "./vendors";

/**
 * Form state shapes and their initial values for the admin's `useActionState`
 * forms.
 *
 * These live outside `app/admin/actions.ts` because a `"use server"` module may
 * only export async functions — exporting a plain object from it is a build
 * error. Types are erased at compile time, so importing this from a client
 * component pulls in no server code.
 */

export interface ProductFormState {
  ok: boolean;
  message: string | null;
  fieldErrors: Record<string, string>;
}

export const emptyProductFormState: ProductFormState = {
  ok: false,
  message: null,
  fieldErrors: {},
};

export type PricingState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "preview"; result: BulkUpdateResult }
  | { kind: "applied"; result: BulkUpdateResult }
  | { kind: "validated"; result: ValidationResult };

export const emptyPricingState: PricingState = { kind: "idle" };

export interface StockAdjustState {
  ok: boolean;
  message: string | null;
  error: string | null;
}

export const emptyStockAdjustState: StockAdjustState = {
  ok: false,
  message: null,
  error: null,
};

export type StockCsvState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "preview"; result: StockCsvResult }
  | { kind: "applied"; result: StockCsvResult };

export const emptyStockCsvState: StockCsvState = { kind: "idle" };

/**
 * Vendor repricing. Both modes — recompute from the supplier price, and snap
 * an existing BHD price onto the retail ladder — share one shape, because the
 * screen shows the same before/after table either way.
 */
export type VendorPriceState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "preview"; mode: RepriceMode; result: RepriceResult }
  | { kind: "applied"; mode: RepriceMode; result: RepriceResult };

export const emptyVendorPriceState: VendorPriceState = { kind: "idle" };

/** Bringing a vendor's staged products into the catalogue. */
export type VendorImportState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "preview"; result: ImportResult }
  | { kind: "applied"; result: ImportResult };

export const emptyVendorImportState: VendorImportState = { kind: "idle" };
