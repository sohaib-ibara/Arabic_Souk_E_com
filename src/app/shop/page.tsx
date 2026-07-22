import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ProductGrid } from "@/components/product/product-grid";
import { ShopToolbar } from "@/components/shop/shop-toolbar";
import { Pagination } from "@/components/shop/pagination";
import { getBrands, getCategories, getProducts, type ProductSort } from "@/lib/data";

export const revalidate = 3600;

/** Products shown per page — a multiple of the 2/3/4-column grid for clean rows. */
const PAGE_SIZE = 24;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const search = str(sp.search);
  const title = search ? `Search: “${search}”` : "Shop all products";
  return {
    title,
    description:
      "Browse premium skincare, makeup, fragrance, hair and body care — delivered across Bahrain.",
    alternates: { canonical: "/shop" },
    // Filtered/searched permutations shouldn't be indexed as duplicates.
    robots: search || sp.category || sp.brand ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const category = str(sp.category);
  const brand = str(sp.brand);
  const search = str(sp.search);
  const sort = (str(sp.sort) as ProductSort) ?? "featured";

  const [categories, brands, products] = await Promise.all([
    getCategories(),
    getBrands(),
    getProducts({ category, brand, search, sort }),
  ]);

  const activeCategory = categories.find((c) => c.slug === category);
  const activeBrand = brands.find((b) => b.slug === brand);

  const heading = search
    ? `Results for “${search}”`
    : activeCategory?.name ?? activeBrand?.name ?? "Shop all";

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(str(sp.page) ?? "1", 10);
  const page = Math.min(Math.max(1, Number.isNaN(requestedPage) ? 1 : requestedPage), totalPages);
  const pageProducts = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Preserves the active filters/sort; page 1 and default sort stay out of the URL.
  const hrefFor = (target: number) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (brand) p.set("brand", brand);
    if (search) p.set("search", search);
    if (sort !== "featured") p.set("sort", sort);
    if (target > 1) p.set("page", String(target));
    const qs = p.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs
        items={[{ name: "Home", href: "/" }, { name: heading }]}
      />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted">
            {products.length > PAGE_SIZE
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + pageProducts.length} of ${products.length} products`
              : `${products.length} ${products.length === 1 ? "product" : "products"}`}
          </p>
        </div>
      </header>

      <div className="mt-8">
        <ShopToolbar categories={categories} filters={{ category, brand, search, sort }} />
      </div>

      <div className="mt-10">
        {products.length > 0 ? (
          <>
            <ProductGrid products={pageProducts} priorityCount={4} />
            <Pagination currentPage={page} totalPages={totalPages} hrefFor={hrefFor} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-line py-20 text-center">
            <p className="font-serif text-xl">No products found</p>
            <p className="mt-2 text-sm text-muted">
              Try a different search or browse all products.
            </p>
          </div>
        )}
      </div>
    </Container>
  );
}
