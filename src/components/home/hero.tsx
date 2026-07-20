import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { siteConfig } from "@/lib/config";

const HERO_IMG =
  "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1400&q=80";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-tint/60 to-cream">
      <Container className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
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
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
            >
              Shop the collection
            </Link>
            <Link
              href="/category/fragrance"
              className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
            >
              Explore fragrance
            </Link>
          </div>
          <dl className="mt-10 flex gap-8">
            {[
              { n: "50+", l: "Luxury brands" },
              { n: "100%", l: "Authentic" },
              { n: siteConfig.shipping.etaDays, l: "Delivery" },
            ].map((s) => (
              <div key={s.l}>
                <dt className="font-serif text-2xl">{s.n}</dt>
                <dd className="text-xs text-muted">{s.l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-sand shadow-sm md:aspect-[5/6]">
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
