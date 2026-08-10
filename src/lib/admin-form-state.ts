import type { BulkUpdateResult, ValidationResult } from "./admin-products";

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
