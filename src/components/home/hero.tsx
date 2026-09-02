import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { siteConfig } from "@/lib/config";

const HERO_IMG =
  "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1400&q=80";

/**
 * `brandCount` is passed in rather than guessed at. The stat read "50+" while
 * the catalogue carried 148 brands - a hardcoded number is wrong in one
 * direction the day it is written and the other direction a month later.
 *
 * The colour behind it is three blurred circles on slow, offset drifts. A flat
 * tint reads as a background; something that moves at the edge of vision reads
 * as depth, and it costs one composited transform because nothing here paints
 * or lays out. They are the first children rather than negatively stacked: a
 * `relative` parent makes no stacking context, so a child behind it would
 * disappear under the section's own background.
 */
export function Hero({ brandCount }: { brandCount: number }) {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-tint/60 to-cream">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-24 -top-28 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
        <div className="animate-drift-slow absolute -right-20 top-16 h-80 w-80 rounded-full bg-gold/20 blur-3xl" />
        <div className="animate-drift absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-sage/20 blur-3xl" />
      </div>

      <Container className="relative grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
        <div className="animate-fade-in-up">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-brand">
            Premium beauty · Bahrain
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
            Beauty that feels <span className="text-brand">effortless</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-muted">
            Discover curated skincare, makeup and fragrance from the world&rsquo;s most-loved
            brands — delivered across the Kingdom in {siteConfig.shipping.etaDays}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-brand hover:shadow-lg hover:shadow-brand/25 motion-safe:active:scale-[0.97]"
            >
              Shop the collection
            </Link>
            <Link
              href="/category/fragrance"
              className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-all duration-200 hover:border-brand hover:bg-white/60 hover:text-brand motion-safe:active:scale-[0.97]"
            >
              Explore fragrance
            </Link>
          </div>
          <dl className="mt-10 flex gap-8">
            {[
              // Rounded DOWN to the ten below, so the claim stays true as the
              // catalogue moves and never has to be walked back.
              { n: `${Math.floor(brandCount / 10) * 10}+`, l: "Luxury brands", c: "text-brand" },
              { n: "100%", l: "Authentic", c: "text-sage" },
              { n: siteConfig.shipping.etaDays, l: "Delivery", c: "text-gold" },
            ].map((s) => (
              <div key={s.l}>
                <dt className={`font-serif text-2xl ${s.c}`}>{s.n}</dt>
                <dd className="text-xs text-muted">{s.l}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Floats rather than sits. The frame moves inside the grid gap, so
            nothing reflows and no edge of the photograph is ever exposed. */}
        <div className="animate-drift-slow relative aspect-[4/5] overflow-hidden rounded-3xl bg-sand shadow-lg shadow-ink/5 md:aspect-[5/6]">
          <ProductImage
            src={HERO_IMG}
            alt="Curated premium beauty products"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </Container>
    </section>
  );
}
