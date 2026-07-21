import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductImage } from "@/components/ui/product-image";
import { Hero } from "@/components/home/hero";
import { CategoryGrid } from "@/components/home/category-grid";
import { ValueProps } from "@/components/home/value-props";
import { BrandStrip } from "@/components/home/brand-strip";
import { ProductGrid } from "@/components/product/product-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { getBrands, getCategories, getProducts } from "@/lib/data";

export const revalidate = 3600;

const PROMO_IMG =
  "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1400&q=80";

export default async function HomePage() {
  const [categories, brands, featured, newArrivals] = await Promise.all([
    getCategories(),
    getBrands(),
    getProducts({ featured: true, limit: 8 }),
    getProducts({ isNew: true, limit: 4 }),
  ]);

  return (
    <>
      <Hero />

      {/* Value props */}
      <section className="border-y border-line bg-white/60">
        <Container className="py-8">
          <ValueProps />
        </Container>
      </section>

      {/* Categories */}
      <section className="py-16">
        <Container>
          <SectionHeading
            eyebrow="Explore"
            title="Shop by category"
            description="From your daily skincare ritual to a signature scent."
          />
          <div className="mt-8">
            <CategoryGrid categories={categories.slice(0, 12)} />
          </div>
        </Container>
      </section>

      {/* Bestsellers */}
      <section className="pb-16">
        <Container>
          <SectionHeading
            eyebrow="Loved by many"
            title="Bestsellers"
            description="The pieces our customers keep coming back for."
            href="/shop"
          />
          <div className="mt-8">
            <ProductGrid products={featured} priorityCount={4} />
          </div>
        </Container>
      </section>

      {/* Promo banner */}
      <section className="pb-16">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-ink text-cream">
            <div className="absolute inset-0">
              <ProductImage
                src={PROMO_IMG}
                alt="The fragrance edit"
                fill
                sizes="100vw"
                className="object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-linear-to-r from-ink/90 via-ink/60 to-transparent" />
            </div>
            <div className="relative max-w-lg px-6 py-16 sm:px-12 sm:py-20">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/70">
                The edit
              </p>
              <h2 className="mt-3 font-serif text-3xl sm:text-4xl">
                Find your signature scent
              </h2>
              <p className="mt-4 text-sm text-cream/80">
                Oud, florals and fresh musks — a fragrance wardrobe for every mood and moment.
              </p>
              <Link
                href="/category/fragrance"
                className="mt-7 inline-flex rounded-full bg-cream px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white"
              >
                Discover fragrance
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* New arrivals */}
      <section className="pb-16">
        <Container>
          <SectionHeading
            eyebrow="Just in"
            title="New arrivals"
            description="Fresh additions to the collection."
            href="/shop?sort=newest"
          />
          <div className="mt-8">
            <ProductGrid products={newArrivals} />
          </div>
        </Container>
      </section>

      {/* Brands */}
      <section className="pb-16">
        <Container>
          <SectionHeading align="center" eyebrow="Curated" title="Brands we love" />
          <div className="mt-8">
            <BrandStrip brands={brands} />
          </div>
        </Container>
      </section>

      {/* Newsletter */}
      <section className="bg-ink py-16 text-cream">
        <Container className="flex flex-col items-center text-center">
          <h2 className="font-serif text-3xl sm:text-4xl">Join the Arabic Souk list</h2>
          <p className="mt-3 max-w-md text-sm text-cream/75">
            Be first to know about new arrivals, exclusive offers and beauty edits.
          </p>
          <NewsletterForm tone="dark" className="mt-7 justify-center" />
        </Container>
      </section>
    </>
  );
}
