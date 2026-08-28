import { siteConfig } from "@/lib/config";

/**
 * The registered business identity, as it must appear on anything that acts as
 * a receipt — the order confirmation page, the tracking page, the footer.
 *
 * One component rather than the same five lines pasted in three places: a CR
 * number or a trading name that is right in two of them and stale in the third
 * is worse than one that is wrong everywhere, because nobody notices.
 *
 * The email version lives in lib/email.ts and cannot share this — an email
 * client needs inline-styled table HTML, not Tailwind classes — so the two are
 * deliberately kept next to the same config values instead.
 */
export function CompanyDetails({ className = "" }: { className?: string }) {
  const tel = siteConfig.contact.phone.replace(/\s/g, "");
  return (
    <address className={`text-xs not-italic leading-relaxed text-muted ${className}`}>
      <span className="block text-ink">{siteConfig.business.legalLine}</span>
      <span className="block">{siteConfig.business.country}</span>
      <span className="block">CR No. {siteConfig.business.crNumber}</span>
      <span className="block">
        Contact Number:{" "}
        <a href={`tel:${tel}`} className="hover:text-ink">
          {siteConfig.contact.phone}
        </a>
      </span>
      <span className="block">
        E-mail:{" "}
        <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-ink">
          {siteConfig.contact.email}
        </a>
      </span>
    </address>
  );
}
