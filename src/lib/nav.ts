import type { NavGroup } from "./types";
import { importedNav } from "./imported-data";
import { primaryNav } from "./config";
import { getAllProducts, getCategories } from "./data";

/**
 * The navigation as captured — noon's own department → sub-category taxonomy,
 * or the static `primaryNav` from config when no catalogue has been imported.
 *
 * This is the SHAPE of the menu, not the menu itself. It comes from the noon
 * capture, which lists every department noon has; the catalogue we actually
 * stock is a subset. Use `getNavGroups()` to get the version that only points
 * at pages that exist.
 */
const capturedNav: NavGroup[] = importedNav.length
  ? importedNav
  : primaryNav.map((n) => ({ name: n.name, slug: n.slug, items: [] }));

/**
 * The navigation, reduced to links that actually go somewhere.
 *
 * The captured taxonomy and the catalogue drift apart: noon lists departments
 * such as Eye Treatments and Hair Extensions that our capture returned no
 * products for, so no category row was ever created for them. Rendering those
 * anyway put six dead links in the menu — one of them, "Makeup", in the footer
 * of every page — each landing the shopper on a 404.
 *
 * So the menu is built from the catalogue rather than from the capture: a link
 * survives only if its category exists AND has something to sell. An empty
 * shelf is a dead end too, just a politer one, and `data.ts` already applies
 * that same rule to the sample catalogue.
 *
 * Groups whose children all disappear are dropped rather than left as a heading
 * that opens an empty dropdown.
 */
export async function getNavGroups(): Promise<NavGroup[]> {
  const [categories, products] = await Promise.all([getCategories(), getAllProducts()]);

  const stocked = new Set(products.map((p) => p.category_slug));
  const real = new Set(categories.filter((c) => stocked.has(c.slug)).map((c) => c.slug));

  return capturedNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => real.has(item.slug)),
    }))
    .filter((group) => group.items.length > 0 || real.has(group.slug));
}

/** A short, flat list of category links for compact places (e.g. the footer). */
export async function getFooterCategories(): Promise<Array<{ name: string; slug: string }>> {
  const groups = await getNavGroups();
  return groups
    .flatMap((g) => (g.items.length ? g.items : [{ name: g.name, slug: g.slug }]))
    .slice(0, 6);
}

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
