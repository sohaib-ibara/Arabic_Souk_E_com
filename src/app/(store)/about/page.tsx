import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "About us",
  description: `${siteConfig.tagline}. Learn what ${siteConfig.name} stands for and how we choose what we stock.`,
  alternates: { canonical: "/about" },
};

const values = [
  {
    title: "Authentic, always",
    body: "We buy through authorised distributors only. Every product arrives sealed, in original manufacturer packaging, with batch codes intact.",
  },
  {
    title: "Curated, not endless",
    body: "We'd rather stock a hundred products worth buying than ten thousand you have to sift through. Everything here earns its place on the shelf.",
  },
  {
    title: "Delivered properly",
    body: `Fragrances and glass are wrapped and boxed, not dropped in a bag. Across ${siteConfig.country} in ${siteConfig.shipping.etaDays}.`,
  },
  {
    title: "Answered by a person",
    body: "No ticket queues or bots. Message us and someone who knows the catalogue replies, usually within a business day.",
  },
];

export default function AboutPage() {
  return (
    <Container className="py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "About us" }]} />

        <header className="mt-4">
          <h1 className="font-serif text-3xl sm:text-4xl">About {siteConfig.name}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{siteConfig.tagline}.</p>
        </header>

        <div className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            {siteConfig.name} began with a simple frustration: finding genuine, well-kept beauty
            products in {siteConfig.country} usually meant a trip to a mall counter, or gambling on a
            marketplace seller with no idea how the stock had been stored.
          </p>
          <p>
            So we built the shop we wanted. A tight, well-chosen range of skincare, makeup, fragrance
            and hair care from brands we actually rate — bought through proper channels, stored
            correctly, and delivered quickly to your door anywhere in the Kingdom.
          </p>
          <p>
            We&rsquo;re based in {siteConfig.contact.address}, and we ship across all four
            governorates.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-line bg-white p-6">
              <h2 className="font-serif text-lg">{v.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/shop"
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Shop the range
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-line px-6 py-3 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
          >
            Contact us
          </Link>
        </div>
      </div>
    </Container>
  );
}
