import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductImage } from "@/components/ui/product-image";
import { Reveal } from "@/components/ui/reveal";
import { Hero } from "@/components/home/hero";
import { CategoryGrid } from "@/components/home/category-grid";
import { ValueProps } from "@/components/home/value-props";
import { BrandStrip } from "@/components/home/brand-strip";
import { ProductGrid } from "@/components/product/product-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { getBestsellers, getBrands, getCategories, getProducts } from "@/lib/data";

export const revalidate = 3600;

const PROMO_IMG =
  "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1400&q=80";

/**
 * Eight bands down a long page, and until now every one of them arrived the
 * same way on the same cream: nothing marked where one ended and the next
 * began except a gap. Two changes, both structural rather than decorative.
 *
 * Each section rises into place as you reach it (see ui/reveal.tsx), which is
 * punctuation — it tells you a new thing has started. And the bands alternate
 * ground: cream, white, cream, ink, a sage wash, white. Colour doing the same
 * job the movement does, for anyone who has movement switched off.
 *
 * The hero is deliberately not wrapped. It is already on screen when the page
 * loads, so animating it would only be a delay before the first thing anybody
 * reads.
 */
export default async function HomePage() {
  const [categories, brands, featured, newArrivals] = await Promise.all([
    getCategories(),
    getBrands(),
    // Not getProducts({ featured: true }): only four products in the catalogue
    // carry the flag, so this row rendered four cards under a heading promising
    // the shop's best. getBestsellers puts whatever the admin pinned first and
    // fills the rest by rating — see /admin/homepage.
    getBestsellers(8),
    getProducts({ isNew: true, limit: 4 }),
  ]);

  return (
    <>
      <Hero brandCount={brands.length} />

      {/* Value props */}
      <section className="border-y border-line bg-white/60">
        <Container className="py-8">
          <Reveal>
            <ValueProps />
          </Reveal>
        </Container>
      </section>

      {/* Categories */}
      <section className="py-16">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Explore"
              title="Shop by category"
              description="From your daily skincare ritual to a signature scent."
            />
          </Reveal>
          {/* A beat behind its heading, so the two read as one arrival rather
              than a race. */}
          <Reveal delay={120} className="mt-8">
            <CategoryGrid categories={categories.slice(0, 12)} />
          </Reveal>
        </Container>
      </section>

      {/* Bestsellers */}
      <section className="border-y border-line bg-white/60 py-16">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Loved by many"
              title="Bestsellers"
              description="The pieces our customers keep coming back for."
              href="/shop"
            />
          </Reveal>
          <Reveal delay={120} className="mt-8">
            <ProductGrid products={featured} priorityCount={4} />
          </Reveal>
        </Container>
      </section>

      {/* Promo banner */}
      <section className="py-16">
        <Container>
          <Reveal>
            <Link
              href="/category/fragrance"
              className="group relative block overflow-hidden rounded-3xl bg-ink text-cream transition-shadow duration-300 hover:shadow-2xl hover:shadow-ink/20"
            >
              <div className="absolute inset-0">
                <ProductImage
                  src={PROMO_IMG}
                  alt="The fragrance edit"
                  fill
                  sizes="100vw"
                  className="object-cover opacity-40 transition-transform duration-700 group-hover:scale-105"
                />
                {/* Two washes rather than one: the plum keeps the panel from
                    being another rose section, and the black keeps the text
                    legible over whatever the photograph is doing. */}
                <div className="absolute inset-0 bg-linear-to-r from-ink/90 via-ink/60 to-transparent" />
                <div className="absolute inset-0 bg-linear-to-tr from-plum/50 via-transparent to-transparent" />
              </div>
              <div className="relative max-w-lg px-6 py-16 sm:px-12 sm:py-20">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/70">
                  The edit
                </p>
                <h2 className="mt-3 font-serif text-3xl sm:text-4xl">
                  Find your signature scent
                </h2>
                <p className="mt-4 text-sm text-cream/80">
                  Oud, florals and fresh musks — a fragrance wardrobe for every mood and
                  moment.
                </p>
                {/* A span, not a nested link: the whole panel is the link now,
                    which is a much larger target than a button in the corner. */}
                <span className="mt-7 inline-flex items-center gap-2 rounded-full bg-cream px-7 py-3.5 text-sm font-medium text-ink transition-colors group-hover:bg-white">
                  Discover fragrance
                  <span
                    aria-hidden="true"
                    className="transition-transform duration-200 motion-safe:group-hover:translate-x-1"
                  >
                    &rarr;
                  </span>
                </span>
              </div>
            </Link>
          </Reveal>
        </Container>
      </section>

      {/* New arrivals */}
      <section className="bg-linear-to-b from-sage-tint/50 to-cream py-16">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Just in"
              title="New arrivals"
              description="Fresh additions to the collection."
              href="/shop?sort=newest"
            />
          </Reveal>
          <Reveal delay={120} className="mt-8">
            <ProductGrid products={newArrivals} />
          </Reveal>
        </Container>
      </section>

      {/* Brands */}
      <section className="border-y border-line bg-white/60 py-16">
        <Container>
          <Reveal>
            <SectionHeading align="center" eyebrow="Curated" title="Brands we love" />
          </Reveal>
          <Reveal delay={120} className="mt-8">
            <BrandStrip brands={brands} />
          </Reveal>
        </Container>
      </section>

      {/* Renders only for someone who has looked at two or more products, so a
          first-time visitor never sees an empty band here. */}
      <RecentlyViewed />

      {/* Newsletter */}
      <section className="bg-ink py-16 text-cream">
        <Container className="flex flex-col items-center text-center">
          <Reveal className="flex flex-col items-center">
            <h2 className="font-serif text-3xl sm:text-4xl">Join the Arabic Souk list</h2>
            <p className="mt-3 max-w-md text-sm text-cream/75">
              Be first to know about new arrivals, exclusive offers and beauty edits.
            </p>
            <NewsletterForm tone="dark" source="homepage" className="mt-7 justify-center" />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
