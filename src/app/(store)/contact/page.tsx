import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Get in touch with ${siteConfig.name} — email, phone and our Manama address.`,
  alternates: { canonical: "/contact" },
};

const tel = siteConfig.contact.phone.replace(/\s/g, "");

const channels = [
  {
    label: "Email",
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
    note: "Replies within one business day",
  },
  {
    label: "Phone",
    value: siteConfig.contact.phone,
    href: `tel:${tel}`,
    note: "Sun–Thu, 9:00 am – 6:00 pm",
  },
  {
    label: "WhatsApp",
    value: siteConfig.contact.phone,
    href: `https://wa.me/${tel.replace(/\D/g, "")}`,
    note: "Fastest for order questions",
  },
];

const quickLinks = [
  { name: "Where is my order?", href: "/account", hint: "Track it in your account" },
  { name: "Delivery times & fees", href: "/shipping" },
  { name: "Returns & refunds", href: "/returns" },
  { name: "Frequently asked questions", href: "/faq" },
];

export default function ContactPage() {
  return (
    <Container className="py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Contact us" }]} />
      </div>

      <header className="mx-auto mt-4 max-w-5xl">
        <h1 className="font-serif text-3xl sm:text-4xl">Contact us</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          A real person reads every message. Have your order number handy and we&rsquo;ll sort it
          out faster.
        </p>
      </header>

      <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-3">
        {channels.map((c) => (
          <a
            key={c.label}
            href={c.href}
            target={c.href.startsWith("http") ? "_blank" : undefined}
            rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="rounded-2xl border border-line bg-white p-6 transition-colors hover:border-brand"
          >
            <p className="text-xs uppercase tracking-[0.15em] text-muted">{c.label}</p>
            <p className="mt-2 font-medium wrap-break-word text-ink">{c.value}</p>
            <p className="mt-1 text-sm text-muted">{c.note}</p>
          </a>
        ))}
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-xl">Visit us</h2>
          <address className="mt-3 text-[15px] not-italic leading-relaxed text-muted">
            {siteConfig.legalName}
            <br />
            {siteConfig.contact.address}
          </address>

          <h3 className="mt-8 font-medium text-ink">Opening hours</h3>
          <dl className="mt-3 max-w-xs text-[15px] text-muted">
            <div className="flex justify-between border-b border-line py-2">
              <dt>Sunday – Thursday</dt>
              <dd className="text-ink">9:00 am – 6:00 pm</dd>
            </div>
            <div className="flex justify-between border-b border-line py-2">
              <dt>Saturday</dt>
              <dd className="text-ink">10:00 am – 4:00 pm</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt>Friday</dt>
              <dd className="text-ink">Closed</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="font-serif text-xl">Before you write</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Most questions are answered faster on these pages:
          </p>
          <ul className="mt-4 space-y-2.5">
            {quickLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[15px] text-brand hover:underline">
                  {l.name}
                </Link>
                {l.hint && <span className="ml-2 text-sm text-muted">— {l.hint}</span>}
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-2xl border border-line bg-sand/50 p-5">
            <p className="text-sm font-medium text-ink">Wholesale &amp; partnerships</p>
            <p className="mt-1.5 text-sm text-muted">
              Stocking a brand, or want to sell with us? Email{" "}
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="text-brand underline underline-offset-2"
              >
                {siteConfig.contact.email}
              </a>{" "}
              with &ldquo;Partnership&rdquo; in the subject line.
            </p>
          </div>
        </section>
      </div>
    </Container>
  );
}
