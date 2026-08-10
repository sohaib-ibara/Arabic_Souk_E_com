import type { NavGroup } from "./types";
import { importedNav } from "./imported-data";
import { primaryNav } from "./config";

/**
 * Data-driven navigation.
 *
 * When a noon catalogue has been imported, the nav mirrors noon's own
 * department → sub-category taxonomy (a dropdown per department). Otherwise it
 * falls back to the static `primaryNav` from config (each entry a flat link).
 */
export const navGroups: NavGroup[] = importedNav.length
  ? importedNav
  : primaryNav.map((n) => ({ name: n.name, slug: n.slug, items: [] }));

/** A short, flat list of category links for compact places (e.g. the footer). */
export const footerCategories: Array<{ name: string; slug: string }> = navGroups
  .flatMap((g) => (g.items.length ? g.items : [{ name: g.name, slug: g.slug }]))
  .slice(0, 6);

/**
 * Static content pages, declared once so the footer, the sitemap and any future
 * nav all stay in step. Adding a page here is enough to surface it everywhere.
 */
export const supportLinks = [
  { name: "Contact us", href: "/contact" },
  { name: "Shipping & delivery", href: "/shipping" },
  { name: "Returns & refunds", href: "/returns" },
  { name: "Track your order", href: "/account" },
  { name: "FAQs", href: "/faq" },
] as const;

export const legalLinks = [
  { name: "About us", href: "/about" },
  { name: "Privacy policy", href: "/privacy" },
  { name: "Terms & conditions", href: "/terms" },
] as const;

/** Every indexable static page, for the sitemap. `/account` is excluded — it's private. */
export const contentRoutes: string[] = [
  ...supportLinks.filter((l) => l.href !== "/account").map((l) => l.href),
  ...legalLinks.map((l) => l.href),
];
