/**
 * Central site configuration.
 *
 * The store is a placeholder premium-beauty brand for the demo phase.
 * To rebrand, change `name` / `legalName` / colors here and in globals.css.
 */
export const siteConfig = {
  name: "Arabic Souk",
  legalName: "Arabic Souk",
  tagline: "Arabian beauty, delivered across Bahrain",
  description:
    "Discover premium skincare, makeup, fragrance and beauty essentials at Arabic Souk. Authentic brands, an elegant experience and fast delivery across Bahrain.",
  // Used for canonical URLs, sitemap and Open Graph. Override with NEXT_PUBLIC_SITE_URL in production.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en_BH",
  currency: "BHD",
  country: "Bahrain",
  countryCode: "BH",
  contact: {
    email: "hello@arabicsouk.com",
    phone: "+973 1700 0000",
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
