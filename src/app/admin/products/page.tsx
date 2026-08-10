import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { ProductsTable } from "@/components/admin/products-table";
import { isAdmin } from "@/lib/admin-auth";
import {
  getCatalogueStatus,
  getCategoryOptions,
  listAdminProducts,
  type ListResult,
} from "@/lib/admin-products";

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
  const parsedPage = Number.parseInt(str(sp.page) || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : parsedPage;

  const status = await getCatalogueStatus();

  // Only query when the catalogue is actually reachable — otherwise the notice
  // below explains what's missing instead of surfacing a raw Postgres error.
  let result: ListResult = { items: [], total: 0, page, perPage: 25, pageCount: 1 };
  let loadError: string | null = null;
  let categories = [] as Awaited<ReturnType<typeof getCategoryOptions>>;

  if (status.configured) {
    try {
      [result, categories] = await Promise.all([
        listAdminProducts({ search, categoryId, page }),
        getCategoryOptions(),
      ]);
    } catch (e) {
      loadError = (e as Error).message;
    }
  }

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            Add products, edit details and change prices.
          </p>
        </div>
        {status.configured && (
          <Link
            href="/admin/products/new"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
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

      {status.configured && !loadError && (
        <ProductsTable
          result={result}
          categories={categories}
          search={search}
          categoryId={categoryId}
        />
      )}
    </Container>
  );
}
