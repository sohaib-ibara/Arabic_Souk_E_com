import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/lib/config";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "FAQs",
  description: `Answers to common questions about ordering, delivery, payment and returns at ${siteConfig.name}.`,
  alternates: { canonical: "/faq" },
};

const { freeThreshold, standardFee, etaDays } = siteConfig.shipping;

/**
 * Plain-text answers, so the same source feeds both the rendered accordion and
 * the FAQPage structured data without them drifting apart.
 */
const groups: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: "Ordering",
    items: [
      {
        q: "Do I need an account to order?",
        a: "You can browse and fill your basket without one, but you'll need an account to check out. It takes a few seconds and means you can track your orders afterwards.",
      },
      {
        q: "Can I change or cancel my order?",
        a: `If it hasn't shipped yet, usually yes — email ${siteConfig.contact.email} as soon as you can with your order number. Once it's with the courier you'll need to return it instead.`,
      },
      {
        q: "Are your products genuine?",
        a: "Yes. We buy through authorised distributors only, and every product arrives sealed in its original manufacturer packaging.",
      },
    ],
  },
  {
    title: "Delivery",
    items: [
      {
        q: "How long does delivery take?",
        a: `Normally ${etaDays} anywhere in ${siteConfig.country}. Orders placed before 3:00 pm Sunday to Thursday are dispatched the same day.`,
      },
      {
        q: "How much is delivery?",
        a: `Free on orders of ${formatPrice(freeThreshold)} and above. Below that it's a flat ${formatPrice(standardFee)}.`,
      },
      {
        q: "Do you deliver outside Bahrain?",
        a: "Not yet. We currently deliver within the Kingdom of Bahrain only.",
      },
      {
        q: "How do I track my order?",
        a: "Sign in and open your account — every order shows its current status there. We also email you when the parcel is handed to the courier.",
      },
    ],
  },
  {
    title: "Payment",
    items: [
      {
        q: "Which payment methods do you accept?",
        a: "Visa, Mastercard, BENEFIT and Apple Pay online, plus cash on delivery across Bahrain.",
      },
      {
        q: "Is it safe to pay by card?",
        a: "Yes. Card details are entered directly into Stripe's secure fields and never reach our servers. We don't store card numbers.",
      },
      {
        q: "Which currency are prices in?",
        a: `All prices are in Bahraini Dinar (${siteConfig.currency}), inclusive of VAT. BHD uses three decimal places, so you'll see prices like ${formatPrice(12.5)}.`,
      },
    ],
  },
  {
    title: "Returns",
    items: [
      {
        q: "What's your returns window?",
        a: "14 days from delivery, provided the item is unopened, unused and still sealed in its original packaging.",
      },
      {
        q: "Can I return an opened product?",
        a: "For hygiene reasons, no — unless it's faulty or we sent the wrong item, in which case we'll replace or refund it in full.",
      },
      {
        q: "How long do refunds take?",
        a: "We refund as soon as the return is inspected. Your bank then takes 5–10 business days to show it.",
      },
    ],
  },
];

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) =>
      g.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    ),
  };

  return (
    <Container className="py-8 sm:py-12">
      <JsonLd data={faqSchema} />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "FAQs" }]} />

      <header className="mx-auto mt-4 max-w-3xl">
        <h1 className="font-serif text-3xl sm:text-4xl">Frequently asked questions</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Everything we get asked most. If your question isn&rsquo;t here,{" "}
          <Link href="/contact" className="text-brand underline underline-offset-2">
            get in touch
          </Link>
          .
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-3xl space-y-10">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="font-serif text-xl">{group.title}</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
              {group.items.map((item, i) => (
                <details
                  key={item.q}
                  className={i > 0 ? "border-t border-line" : undefined}
                >
                  <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-medium text-ink transition-colors marker:hidden hover:text-brand [&::-webkit-details-marker]:hidden">
                    {item.q}
                  </summary>
                  <p className="px-5 pb-4 text-[15px] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-line bg-sand/50 p-6">
        <p className="font-serif text-lg">Still need help?</p>
        <p className="mt-1.5 text-sm text-muted">
          Email{" "}
          <a
            href={`mailto:${siteConfig.contact.email}`}
            className="text-brand underline underline-offset-2"
          >
            {siteConfig.contact.email}
          </a>{" "}
          or call{" "}
          <a
            href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
            className="text-brand underline underline-offset-2"
          >
            {siteConfig.contact.phone}
          </a>
          , Sunday to Thursday, 9:00 am – 6:00 pm.
        </p>
      </div>
    </Container>
  );
}
