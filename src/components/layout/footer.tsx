import Link from "next/link";
import { siteConfig } from "@/lib/config";
import { legalLinks, supportLinks } from "@/lib/nav";
import { NewsletterForm } from "@/components/newsletter-form";
import { PaymentMarks } from "@/components/ui/payment-marks";
import { CompanyDetails } from "@/components/layout/company-details";

/** Category links come from the store layout, built from the live catalogue. */
export function Footer({ categories }: { categories: Array<{ name: string; slug: string }> }) {
  const year = 2026;
  return (
    <footer className="mt-20 border-t border-line bg-sand/60">
      {/* Extra bottom padding so the floating WhatsApp button clears the last
          row. It is fixed to the viewport and occupies the bottom ~80px, so
          without this it sat on top of the payment marks once the page was
          scrolled all the way down — which is exactly where it always is. */}
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/*
            Brand.

            The Instagram / TikTok / Facebook icons that used to sit here have
            gone. They pointed at instagram.com, tiktok.com and facebook.com —
            the platforms' own front pages — because the store has no accounts
            on any of them. A social icon that goes nowhere is worse than no
            icon: it looks like a broken link on a shop asking for card details.

            To bring them back, set the real profile URLs in siteConfig.social
            and restore this block along with the `sameAs` entries in the
            store layout's Organization JSON-LD.
          */}
          <div>
            <span className="font-serif text-2xl">{siteConfig.name}</span>
            <p className="mt-3 max-w-xs text-sm text-muted">{siteConfig.description}</p>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Shop</h3>
            <ul className="mt-4 space-y-2.5">
              {categories.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/category/${item.slug}`}
                    className="text-sm text-muted hover:text-brand"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/shop" className="text-sm text-muted hover:text-brand">
                  Shop all
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer care */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">
              Customer care
            </h3>
            <ul className="mt-4 space-y-2.5">
              {supportLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-muted hover:text-brand">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">
              Join the list
            </h3>
            <p className="mt-4 text-sm text-muted">
              Beauty edits, new arrivals and members-only offers — straight to your inbox.
            </p>
            <NewsletterForm className="mt-4 max-w-full flex-col sm:flex-row" />
            <p className="mt-4 text-xs text-muted">
              {siteConfig.contact.address}
            </p>
          </div>
        </div>

        <nav
          aria-label="Legal"
          className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-xs"
        >
          {legalLinks.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted hover:text-brand">
              {item.name}
            </Link>
          ))}
        </nav>

        {/* The registered entity, on every page rather than only on receipts —
            a Bahrain storefront is expected to say who it trades as. */}
        <CompanyDetails className="mt-6 border-t border-line pt-6 text-center sm:text-left" />

        <div className="mt-4 flex flex-col items-center justify-between gap-4 text-xs text-muted sm:flex-row">
          <p>
            © {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <span>Prices in Bahraini Dinar (BHD)</span>
            <PaymentMarks />
          </div>
        </div>
      </div>
    </footer>
  );
}
