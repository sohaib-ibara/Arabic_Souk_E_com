import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/shop/sort-select";
import {
  getCategories,
  getCategoryBySlug,
  getProducts,
  type ProductSort,
} from "@/lib/data";
import { siteConfig } from "@/lib/config";
import { accentFor } from "@/lib/accent";
import { cn } from "@/lib/cn";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export async function generateStaticParams() {
  const cats = await getCategories();
  return cats.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.name,
    description: category.description ?? `Shop ${category.name} at ${siteConfig.name}, Bahrain.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} | ${siteConfig.name}`,
      description: category.description ?? undefined,
      images: category.image_url ? [{ url: category.image_url }] : undefined,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort = (str(sp.sort) as ProductSort) ?? "featured";

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const products = await getProducts({ category: slug, sort });
  const accent = accentFor(category.slug);

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Shop", href: "/shop" },
          { name: category.name },
        ]}
      />

      {/*
        The same accent this category wears on the homepage grid, so the tile
        somebody pressed and the page they land on are recognisably the same
        thing. Derived from the slug, so the two cannot disagree.
      */}
      <header className={cn("mt-4 rounded-3xl px-6 py-8 sm:px-8", accent.tint)}>
        <span aria-hidden="true" className={cn("block h-0.5 w-10 rounded-full", accent.bar)} />
        <h1 className="mt-4 font-serif text-3xl sm:text-4xl">{category.name}</h1>
        {category.description && (
          <p className="mt-2 max-w-2xl text-sm text-muted">{category.description}</p>
        )}
      </header>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-muted">
          {products.length} {products.length === 1 ? "product" : "products"}
        </p>
        <SortSelect basePath={`/category/${slug}`} sort={sort} />
      </div>

      <div className="mt-8">
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : (
          <div className="rounded-2xl border border-dashed border-line py-20 text-center">
            <p className="font-serif text-xl">Nothing here yet</p>
            <p className="mt-2 text-sm text-muted">Check back soon for new arrivals.</p>
          </div>
        )}
      </div>
    </Container>
  );
}
