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
