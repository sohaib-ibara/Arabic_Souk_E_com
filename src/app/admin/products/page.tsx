import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { ProductsTable } from "@/components/admin/products-table";
import { CatalogueBrowser } from "@/components/admin/catalogue-browser";
import { isAdmin } from "@/lib/admin-auth";
import {
  getCatalogueBreakdown,
  getCategoryOptions,
  listAdminProducts,
  type ListResult,
} from "@/lib/admin-products";
import { setVendorCategoryAction, setVisibilityAction } from "@/app/admin/actions";
import { adminButton } from "@/components/admin/button-styles";

export const metadata: Metadata = {
  title: "Products · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const search = str(sp.search);
  const categoryId = str(sp.category);
  const source = str(sp.source);
  const rawVisibility = str(sp.visibility);
  const visibility = rawVisibility === "listed" || rawVisibility === "hidden" ? rawVisibility : "";
  const parsedPage = Number.parseInt(str(sp.page) || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : parsedPage;

  /*
    All three at once.

    "Is the catalogue reachable" used to be its own query, awaited before any
    of this could start — and it was a count of the products table, which the
    supplier breakdown below was about to read in full anyway. It now comes
    back with that breakdown, so the screen waits for one round trip instead
    of two. See getCatalogueBreakdown.

    The other two are asked for unconditionally. Both return an empty result
    rather than throwing when the service key is absent, and when the table
    itself is unreachable the breakdown says so and the notice below explains
    it in place of a raw Postgres error — which is what the guard was for.
  */
  const [breakdown, listed, categories] = await Promise.all([
    getCatalogueBreakdown(),
    listAdminProducts({
      search,
      categoryId,
      source,
      visibility: visibility || undefined,
      page,
    }).then(
      (r) => ({ ok: true as const, result: r }),
      (e: unknown) => ({ ok: false as const, message: (e as Error).message }),
    ),
    getCategoryOptions(),
  ]);

  const { status, sources, byVendor, vendorNames, vendorIds, rulesOff } = breakdown;
  const result: ListResult = listed.ok
    ? listed.result
    : { items: [], total: 0, page, perPage: 25, pageCount: 1 };
  // A table that cannot be read explains itself once, through the status
  // notice above, rather than twice.
  const loadError = status.configured && !listed.ok ? listed.message : null;

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            Pick a supplier, then a category, then work through what&rsquo;s in it.
          </p>
        </div>
        {status.configured && (
          <Link
            href="/admin/products/new"
            className={adminButton("primary")}
          >
            Add product
          </Link>
        )}
      </div>

      {str(sp.deleted) === "1" && (
        <Notice tone="success" className="mt-6">
          Product deleted.
        </Notice>
      )}

      {!status.configured && (
        <Notice tone="warning" title="Catalogue editing isn’t available" className="mt-6">
          {status.error}
        </Notice>
      )}

      {status.configured && status.error && (
        <Notice tone="warning" title="Heads up" className="mt-6">
          {status.error}
        </Notice>
      )}

      {loadError && (
        <Notice tone="danger" title="Couldn’t load products" className="mt-6">
          {loadError}
        </Notice>
      )}

      {str(sp.bulk) === "none" && (
        <Notice tone="warning" className="mt-6">
          Nothing was selected, so nothing changed. Tick the products first.
        </Notice>
      )}
      {(str(sp.bulk) === "listed" || str(sp.bulk) === "hidden") && (
        <Notice tone="success" className="mt-6">
          {str(sp.n)} product{str(sp.n) === "1" ? "" : "s"}{" "}
          {str(sp.bulk) === "listed" ? "now listed on the storefront." : "hidden from the storefront."}
        </Notice>
      )}

      {status.configured && (
        <CatalogueBrowser
          sources={sources}
          byVendor={byVendor}
          vendorNames={vendorNames}
          vendorIds={vendorIds}
          rulesOff={rulesOff}
          categories={categories}
          source={source}
          categoryId={categoryId}
          search={search}
          visibility={visibility}
          total={status.productCount}
          ruleAction={setVendorCategoryAction}
        />
      )}

      {status.configured && !loadError && (
        <ProductsTable
          result={result}
          vendorNames={vendorNames}
          search={search}
          categoryId={categoryId}
          source={source}
          visibility={visibility}
          action={setVisibilityAction}
        />
      )}
    </Container>
  );
}
