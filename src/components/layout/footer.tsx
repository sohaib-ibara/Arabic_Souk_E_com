import Link from "next/link";
import { primaryNav, siteConfig } from "@/lib/config";
import { NewsletterForm } from "@/components/newsletter-form";
import { FacebookIcon, InstagramIcon, TiktokIcon } from "@/components/ui/icons";

const careLinks = [
  { name: "Contact us", href: `mailto:${siteConfig.contact.email}` },
  { name: "Shipping & delivery", href: "/shop" },
  { name: "Returns & exchanges", href: "/shop" },
  { name: "Track your order", href: "/shop" },
  { name: "FAQs", href: "/shop" },
];

export function Footer() {
  const year = 2026;
  return (
    <footer className="mt-20 border-t border-line bg-sand/60">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand + social */}
          <div>
            <span className="font-serif text-2xl">{siteConfig.name}</span>
            <p className="mt-3 max-w-xs text-sm text-muted">{siteConfig.description}</p>
            <div className="mt-5 flex gap-2">
              <a
                href={siteConfig.social.instagram}
                aria-label="Instagram"
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink hover:border-brand hover:text-brand"
              >
                <InstagramIcon width={18} height={18} />
              </a>
              <a
                href={siteConfig.social.tiktok}
                aria-label="TikTok"
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink hover:border-brand hover:text-brand"
              >
                <TiktokIcon width={18} height={18} />
              </a>
              <a
                href={siteConfig.social.facebook}
                aria-label="Facebook"
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink hover:border-brand hover:text-brand"
              >
                <FacebookIcon width={18} height={18} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Shop</h3>
            <ul className="mt-4 space-y-2.5">
              {primaryNav.map((item) => (
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
              {careLinks.map((item) => (
                <li key={item.name}>
                  <a href={item.href} className="text-sm text-muted hover:text-brand">
                    {item.name}
                  </a>
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

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row">
          <p>
            © {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <p className="flex items-center gap-3">
            <span>Prices in Bahraini Dinar (BHD)</span>
            <span aria-hidden>·</span>
            <span>Visa · Mastercard · BENEFIT · Apple Pay · Cash on delivery</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
