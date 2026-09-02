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
import { StickyBuyBar } from "@/components/product/sticky-buy-bar";
import { ProductGrid } from "@/components/product/product-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { CheckIcon, LeafIcon, ShieldIcon, TruckIcon } from "@/components/ui/icons";
import { getAllProducts, getProductBySlug, getRelatedProducts } from "@/lib/data";
import {
  RecentlyViewed,
  RecordProductView,
} from "@/components/product/recently-viewed";
import { deliveryWindow, discountPercent } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { PRICE_DECIMALS } from "@/lib/format";

/** Shared between the buy box and the sticky bar that follows it down the page. */
const BUY_BOX_ID = "product-buy-box";

export const revalidate = 3600;

/**
 * Google ignores — or ages out — an Offer with no `priceValidUntil`.
 *
 * Read the clock once at module load rather than per render: calling `Date.now`
 * inside a component breaks React's purity rule, and a date a year out doesn't
 * need to be precise. Every deploy refreshes it, and even a long-lived server
 * process leaves it comfortably in the future.
 */
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

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

  const productUrl = `${siteConfig.url}/product/${product.slug}`;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.short_description ?? undefined,
    image: product.images,
    url: productUrl,
    // Our internal UUID, not a manufacturer code. Declaring it as `sku` invites
    // Merchant Center to match it against a real one and fail; `productID` is
    // the honest field for an identifier that is ours alone.
    productID: product.id,
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
      price: product.price.toFixed(PRICE_DECIMALS),
      priceValidUntil: PRICE_VALID_UNTIL,
      itemCondition: "https://schema.org/NewCondition",
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: productUrl,
      seller: { "@type": "Organization", name: siteConfig.legalName },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        // The standard fee. Orders over the free-delivery threshold pay
        // nothing, but a single entry can't express both and quoting the
        // higher of the two is the safe direction to be imprecise in.
        shippingRate: {
          "@type": "MonetaryAmount",
          value: siteConfig.shipping.standardFee,
          currency: siteConfig.currency,
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: siteConfig.countryCode,
        },
        /*
          The same window the page shows the shopper, not a second opinion.

          Google sums handlingTime and transitTime into one estimate and checks
          it against the visible page; structured data promising 1–3 days over
          a page reading "5–8 days" is a contradiction it can drop the rich
          result over, and it would be the more optimistic of the two claims
          that reached Google Shopping.

          Where the supplier states a window we hold it as one figure rather
          than a dispatch/transit split, so it goes in transitTime alone and
          handlingTime is omitted — the sum is what matters, and inventing a
          decomposition we were never given would be a third claim.
        */
        deliveryTime:
          product.lead_days_min != null && product.lead_days_max != null
            ? {
                "@type": "ShippingDeliveryTime",
                transitTime: {
                  "@type": "QuantitativeValue",
                  minValue: product.lead_days_min,
                  maxValue: product.lead_days_max,
                  unitCode: "DAY",
                },
              }
            : {
                "@type": "ShippingDeliveryTime",
                handlingTime: {
                  "@type": "QuantitativeValue",
                  minValue: 0,
                  maxValue: 1,
                  unitCode: "DAY",
                },
                transitTime: {
                  "@type": "QuantitativeValue",
                  minValue: 1,
                  maxValue: 2,
                  unitCode: "DAY",
                },
              },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: siteConfig.countryCode,
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: ["https://schema.org/ReturnByMail", "https://schema.org/ReturnInStore"],
        // `returnFees` is deliberately absent: the returns page doesn't say who
        // pays the courier, and guessing "free" here would be a claim we can't
        // honour. Add it once the client confirms.
      },
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

            {/* The id is the sticky bar's anchor: it watches this element
                rather than a scroll offset, because how far down the button
                sits depends on the name, the discount and the gallery. */}
            <div id={BUY_BOX_ID}>
              <ProductBuyBox product={product} />
            </div>

            {/* Assurances */}
            <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-sm text-ink/80 sm:grid-cols-2">
              {/*
                The supplier's real window where we have one, the house default
                otherwise.

                Worth stating plainly: the default is "1–2 days", which
                describes a shop delivering from its own shelf. This one buys
                from the supplier after the customer pays, so a line sourced
                from the UK is nearer two weeks. Quoting 1–2 days on those is a
                promise the shop cannot keep, and the customer finds out only
                after paying.
              */}
              <li className="flex items-center gap-2">
                <TruckIcon width={18} height={18} className="text-brand" /> Delivery in{" "}
                {deliveryWindow(product.lead_days_min, product.lead_days_max)}
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

      {/* Records this view, renders nothing. Below the fold in source order so
          it can never delay what the page is actually for. */}
      <RecordProductView slug={product.slug} />
      <StickyBuyBar product={product} watch={BUY_BOX_ID} />
      <RecentlyViewed excludeSlug={product.slug} />
    </>
  );
}
