import type { NavGroup } from "./types";
import { importedNav } from "./imported-data";
import { primaryNav } from "./config";
import { getCategories } from "./data";

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
 * So a link survives only if a category row EXISTS for it. Note what that no
 * longer says: it does not ask whether the category has anything in it today.
 *
 * It used to, and that was wrong once vendors became switchable. Whether a
 * shelf is stocked is now a provisioning decision an admin makes and unmakes —
 * switch noon off while Cult Beauty is still importing and every category
 * empties at once, which took the entire menu with it. The client's
 * requirement from the 1 Sep call is the opposite: the shop's structure holds
 * still while vendors, categories and products are switched on and off beneath
 * it.
 *
 * An empty category is not a dead link. /category/[slug] renders "Nothing here
 * yet" for one that exists and 404s only for one that does not — which is
 * exactly the line this filter draws.
 *
 * Groups whose children all disappear are dropped rather than left as a heading
 * that opens an empty dropdown.
 */
export async function getNavGroups(): Promise<NavGroup[]> {
  const categories = await getCategories();
  const real = new Set(categories.map((c) => c.slug));

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
  // Was /account, which sent guests to a login page for an account they never
  // made — and most orders are guest orders now. /track takes the order number
  // and email instead.
  { name: "Track your order", href: "/track" },
  { name: "FAQs", href: "/faq" },
] as const;

export const legalLinks = [
  { name: "About us", href: "/about" },
  { name: "Privacy policy", href: "/privacy" },
  { name: "Terms & conditions", href: "/terms" },
] as const;

/** Every indexable static page, for the sitemap. `/account` is excluded — it's private. */
const PRIVATE_ROUTES = new Set(["/account"]);

export const contentRoutes: string[] = [
  ...supportLinks.filter((l) => !PRIVATE_ROUTES.has(l.href)).map((l) => l.href),
  ...legalLinks.map((l) => l.href),
];
