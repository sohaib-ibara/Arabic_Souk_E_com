/**
 * Central site configuration.
 *
 * The store is a placeholder premium-beauty brand for the demo phase.
 * To rebrand, change `name` / `legalName` / colors here and in globals.css.
 */
/**
 * The public origin, cleaned of anything a dashboard paste might have added.
 *
 * A trailing newline in NEXT_PUBLIC_SITE_URL is invisible and poisonous: the
 * `new URL()` behind `metadataBase` silently strips it, so canonical and OG
 * tags look perfect, while every raw `${siteConfig.url}/...` interpolation —
 * sitemap entries, the robots Sitemap: line, JSON-LD offer URLs — embeds the
 * newline mid-URL and is rejected by crawlers. That shipped once; normalising
 * here means it cannot happen again whatever is pasted into Vercel.
 */
function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();
  // Drop trailing slashes so callers can append "/path" without doubling up.
  return raw.replace(/\/+$/, "");
}

export const siteConfig = {
  name: "Arabic Souk",
  legalName: "Arabic Souk",
  tagline: "Arabian beauty, delivered across Bahrain",
  description:
    "Discover premium skincare, makeup, fragrance and beauty essentials at Arabic Souk. Authentic brands, an elegant experience and fast delivery across Bahrain.",
  // Used for canonical URLs, sitemap and Open Graph. Override with NEXT_PUBLIC_SITE_URL in production.
  url: resolveSiteUrl(),
  locale: "en_BH",
  currency: "BHD",
  country: "Bahrain",
  countryCode: "BH",
  /**
   * Every date shown to a human is rendered in this zone.
   *
   * Server Components format on the server, which on Vercel runs in UTC — so
   * without pinning this, the admin in Manama would read every order three
   * hours behind the clock on the wall. The store serves one country, so one
   * fixed zone is correct and beats guessing per viewer.
   */
  timeZone: "Asia/Bahrain",
  /**
   * Where stock is bought from once a customer has paid. Named in the admin so
   * staff read "To buy from noon" rather than an abstract stock figure; kept
   * here so switching supplier is one edit rather than a hunt through labels.
   */
  supplier: "noon",
  payments: {
    /**
     * Cash collected by the courier at the door. Turning this off hides the
     * option at checkout; orders already placed against it are unaffected.
     */
    cashOnDelivery: true,
  },
  /**
   * The registered entity, as it must appear on invoices and order
   * confirmations. Supplied by the client on 28 Aug 2026.
   *
   * `legalLine` is stored as one string on purpose. It is a legal identity, not
   * data to recombine — assembling "trading name" and "registered name" from
   * separate fields invites a later edit that changes the wording, and the
   * wording is the part that has to be exact.
   */
  business: {
    // "Souk", matching the brand everywhere else. The client's note spelled it
    // "Souq"; confirmed 28 Aug 2026 that the store is Arabic Souk. If the CR
    // certificate itself reads "Souq", that spelling has to win here — it is
    // the registered name, and an invoice should match the certificate.
    legalLine: "Arabic Souk (Trading Name of TEJARAT HUB W.L.L)",
    country: "Kingdom of Bahrain",
    crNumber: "177789-1",
  },
  contact: {
    // Confirmed 28 Aug 2026. Printed on every order confirmation and used as
    // the reply-to on every email the store sends.
    email: "hello@arabicsouk.com",
    // Callers build tel: links by stripping the spaces, so this stays the one
    // human-readable form rather than being duplicated as a second field.
    phone: "+973 3694 9682",
    /**
     * The same line, in the digits-only form wa.me requires — no +, no spaces.
     * Written out rather than derived from `phone` so that whoever changes one
     * is looking straight at the other: a WhatsApp button pointing at a number
     * nobody reads is a support channel that silently goes nowhere.
     */
    whatsapp: "97336949682",
    address: "Seef District, Manama, Kingdom of Bahrain",
  },
  /**
   * Social profiles — empty until the accounts exist.
   *
   * These held instagram.com / tiktok.com / facebook.com, the platforms' own
   * front pages, which rendered as footer icons that went nowhere and as
   * `sameAs` claims of ownership in the Organization JSON-LD. Both are removed;
   * fill these in and restore the footer block and `sameAs` when there are real
   * profiles to point at.
   */
  social: {
    instagram: "",
    tiktok: "",
    facebook: "",
  },
  shipping: {
    freeThreshold: 20, // BHD
    standardFee: 2, // BHD
    etaDays: "1–2 days",
  },
  /**
   * The welcome offer, shown once per visit in a modal.
   *
   * Kept here rather than in the component so a sale can be changed, renamed
   * or switched off without touching a React file — `enabled: false` removes
   * the modal entirely, which is the only lever anyone should need on the day
   * a promotion ends.
   *
   * `code` is what the shopper is told to use. Nothing validates it yet: the
   * checkout has no discount engine, so treat this as a marketing capture that
   * staff honour by hand until one exists.
   */
  promo: {
    enabled: true,
    eyebrow: "A welcome treat",
    headline: "Want 15% off?",
    body: "Join the list for 15% off your first order, plus early access to new arrivals and offers.",
    code: "WELCOME15",
    accept: "Yes, please!",
    decline: "No, but thanks anyway",
    /** Seconds on the page before it appears. Long enough not to read as an ad. */
    delaySeconds: 8,
    /** Days before a shopper who dismissed it is asked again. */
    remindAfterDays: 14,
  },
} as const;

/** Primary navigation categories (must match category slugs in the data layer). */
export const primaryNav = [
  { name: "Skincare", slug: "skincare" },
  { name: "Makeup", slug: "makeup" },
  { name: "Fragrance", slug: "fragrance" },
  { name: "Hair", slug: "hair" },
  { name: "Bath & Body", slug: "bath-body" },
  { name: "Tools & Accessories", slug: "tools" },
] as const;

export type SiteConfig = typeof siteConfig;
