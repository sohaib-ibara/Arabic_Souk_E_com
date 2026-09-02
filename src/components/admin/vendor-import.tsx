"use client";

import Link from "next/link";
import { useActionState } from "react";
import { vendorImportAction } from "@/app/admin/actions";
import { emptyVendorImportState, type VendorImportState } from "@/lib/admin-form-state";
import { Notice } from "@/components/admin/notice";
import { adminButton } from "@/components/admin/button-styles";

/**
 * Bring a vendor's staged products into the catalogue.
 *
 * Staging is the sync's scratch space — nothing in the admin or the storefront
 * reads it, which is why a vendor can have thousands of staged products and
 * still show "no products in the catalogue". This is the step that makes them
 * real, and everything it creates arrives unlisted.
 */
export function VendorImport({
  vendorId,
  vendorName,
  stagedCount,
}: {
  vendorId: string;
  vendorName: string;
  stagedCount: number;
}) {
  const [state, formAction, pending] = useActionState<VendorImportState, FormData>(
    vendorImportAction,
    emptyVendorImportState,
  );

  const previewed = state.kind === "preview";
  const total = previewed ? state.result.created + state.result.updated : 0;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="font-medium">Products from staging</h3>
      <p className="mt-1 text-sm text-muted">
        {stagedCount > 0 ? (
          <>
            The sync has {stagedCount} {vendorName} product{stagedCount === 1 ? "" : "s"} waiting.
            Bringing them in puts them in the catalogue so you can choose what to carry — every
            one arrives <strong>hidden</strong>, and nothing reaches the shop until you list it.
          </>
        ) : (
          <>Nothing is staged for {vendorName}. Run the sync first.</>
        )}
      </p>

      {stagedCount > 0 && (
        <form action={formAction} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="vendor_id" value={vendorId} />
          <button
            type="submit"
            name="intent"
            value="preview"
            disabled={pending}
            className={adminButton("secondary")}
          >
            {pending ? "Working…" : "Check what would come in"}
          </button>

          {previewed && total > 0 && (
            <button
              type="submit"
              name="intent"
              value="apply"
              disabled={pending}
              className={adminButton("primary")}
            >
              Bring in {total} product{total === 1 ? "" : "s"}
            </button>
          )}
        </form>
      )}

      {state.kind === "error" && (
        <Notice tone="warning" title="Nothing imported" className="mt-4">
          {state.message}
        </Notice>
      )}

      {(state.kind === "preview" || state.kind === "applied") && (
        <Outcome state={state} vendorName={vendorName} />
      )}
    </div>
  );
}

function Outcome({
  state,
  vendorName,
}: {
  state: Extract<VendorImportState, { kind: "preview" | "applied" }>;
  vendorName: string;
}) {
  const { result } = state;
  const applied = state.kind === "applied";

  return (
    <div className="mt-4 space-y-3">
      <Notice tone={applied ? "success" : "info"}>
        {applied ? (
          <>
            Added {result.created} product{result.created === 1 ? "" : "s"} to the catalogue
            {result.updated > 0 && <>, refreshed {result.updated} already there</>}. All hidden
            until you list them.
          </>
        ) : (
          <>
            {result.created} would be added{result.updated > 0 && <>, {result.updated} refreshed</>}
            . Nothing has been written yet.
          </>
        )}
      </Notice>

      {result.uncategorised > 0 && (
        <Notice tone="warning" title={`${result.uncategorised} need a category`}>
          {vendorName} files these under shelf names this shop has no equivalent for — things
          like <em>spotlight</em> or <em>halloween</em>, which say nothing about what the product
          is. They came in without a category rather than being guessed into the wrong aisle,
          so they will not appear under any category until one is set.{" "}
          <Link href="/admin/products" className="underline">
            Set them in Products
          </Link>
          , or tell us which of your categories each shelf belongs in and it can be mapped once
          for every future import.
        </Notice>
      )}

      {result.failed.length > 0 && (
        <Notice tone="danger" title={`${result.failed.length} could not be imported`}>
          <ul className="mt-1 space-y-0.5">
            {result.failed.slice(0, 8).map((f, i) => (
              <li key={i}>
                {f.name} — {f.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
