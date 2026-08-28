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
    legalLine: "Arabic Souq (Trading Name of TEJARAT HUB W.L.L)",
    country: "Kingdom of Bahrain",
    crNumber: "177789-1",
  },
  contact: {
    // ⚠️ PLACEHOLDER. The client's message gave this as "E-mail: Hello@" —
    // truncated mid-address — so this is still the old demo value. Confirm the
    // real address before go-live; it is printed on every order confirmation
    // and is the reply-to on every email the store sends.
    email: "hello@arabicsouk.com",
    // Callers build tel: links by stripping the spaces, so this stays the one
    // human-readable form rather than being duplicated as a second field.
    phone: "+973 3694 9682",
    address: "Seef District, Manama, Kingdom of Bahrain",
  },
  social: {
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com",
    facebook: "https://facebook.com",
  },
  shipping: {
    freeThreshold: 20, // BHD
    standardFee: 2, // BHD
    etaDays: "1–2 days",
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
