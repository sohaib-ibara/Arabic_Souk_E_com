import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Price } from "@/components/ui/price";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductBuyBox } from "@/components/product/product-buy-box";
import { ProductGrid } from "@/components/product/product-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { CheckIcon, LeafIcon, ShieldIcon, TruckIcon } from "@/components/ui/icons";
import { getAllProducts, getProductBySlug, getRelatedProducts } from "@/lib/data";
import { discountPercent } from "@/lib/format";
import { siteConfig } from "@/lib/config";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const title = `${product.name}${product.brand_name ? ` — ${product.brand_name}` : ""}`;
  const description =
    product.short_description ?? product.description ?? `Shop ${product.name} at ${siteConfig.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${title} | ${siteConfig.name}`,
      description,
      images: product.images.length ? product.images.map((url) => ({ url })) : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product, 4);
  const dp = discountPercent(product.price, product.compare_at_price);
  const categoryHref = `/category/${product.category_slug}`;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.short_description ?? undefined,
    image: product.images,
    sku: product.id,
    ...(product.brand_name
      ? { brand: { "@type": "Brand", name: product.brand_name } }
      : {}),
    category: product.category_name,
    aggregateRating:
      product.review_count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.review_count,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: product.price.toFixed(3),
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${siteConfig.url}/product/${product.slug}`,
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${siteConfig.url}/shop` },
      {
        "@type": "ListItem",
        position: 3,
        name: product.category_name,
        item: `${siteConfig.url}${categoryHref}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: product.name,
        item: `${siteConfig.url}/product/${product.slug}`,
      },
    ],
  };

  return (
    <>
      <JsonLd data={[productLd, breadcrumbLd]} />

      <Container className="py-8 sm:py-10">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Shop", href: "/shop" },
            { name: product.category_name, href: categoryHref },
            { name: product.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          {/* Gallery */}
          <ProductGallery images={product.images} name={product.name} />

          {/* Info */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {product.is_new && <Badge tone="brand">New</Badge>}
              {dp ? <Badge tone="sale">Save {dp}%</Badge> : null}
            </div>

            {product.brand_name && (
              <Link
                href={`/shop?brand=${product.brand_slug}`}
                className="mt-3 inline-block text-sm uppercase tracking-wide text-muted hover:text-brand"
              >
                {product.brand_name}
              </Link>
            )}

            <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">
              {product.name}
            </h1>

            <div className="mt-3">
              <StarRating rating={product.rating} count={product.review_count} size={16} />
            </div>

            <div className="mt-4">
              <Price
                price={product.price}
                compareAt={product.compare_at_price}
                currency={product.currency}
                size="lg"
              />
              <p className="mt-1 text-xs text-muted">Inclusive of VAT</p>
            </div>

            {product.short_description && (
              <p className="mt-5 text-[15px] leading-relaxed text-ink/80">
                {product.short_description}
              </p>
            )}

            <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              In stock — ready to ship
            </p>

            <ProductBuyBox product={product} />

            {/* Assurances */}
            <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-sm text-ink/80 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <TruckIcon width={18} height={18} className="text-brand" /> Delivery in{" "}
                {siteConfig.shipping.etaDays}
              </li>
              <li className="flex items-center gap-2">
                <ShieldIcon width={18} height={18} className="text-brand" /> 100% authentic
              </li>
              <li className="flex items-center gap-2">
                <LeafIcon width={18} height={18} className="text-brand" /> Cruelty-free
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon width={18} height={18} className="text-brand" /> Easy 14-day returns
              </li>
            </ul>
          </div>
        </div>

        {/* Description + details */}
        {(product.description || product.tags.length > 0) && (
          <div className="mt-14 grid gap-10 border-t border-line pt-10 lg:grid-cols-3">
            {product.description && (
              <div className="lg:col-span-2">
                <h2 className="font-serif text-2xl">Description</h2>
                <p className="mt-4 max-w-2xl leading-relaxed text-ink/80">
                  {product.description}
                </p>
              </div>
            )}
            <div>
              <h2 className="font-serif text-2xl">Details</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b border-line pb-2">
                  <dt className="text-muted">Category</dt>
                  <dd>
                    <Link href={categoryHref} className="hover:text-brand">
                      {product.category_name}
                    </Link>
                  </dd>
                </div>
                {product.brand_name && (
                  <div className="flex justify-between border-b border-line pb-2">
                    <dt className="text-muted">Brand</dt>
                    <dd>{product.brand_name}</dd>
                  </div>
                )}
                <div className="flex justify-between border-b border-line pb-2">
                  <dt className="text-muted">Rating</dt>
                  <dd>
                    {product.rating.toFixed(1)} ({product.review_count})
                  </dd>
                </div>
              </dl>
              {product.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-brand-tint px-3 py-1 text-xs text-brand"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-16">
            <SectionHeading eyebrow="You may also like" title="Complete the ritual" />
            <div className="mt-8">
              <ProductGrid products={related} />
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
