import type { MetadataRoute } from "next";
import { getAllProducts, getCategories } from "@/lib/data";
import { siteConfig } from "@/lib/config";
import { contentRoutes } from "@/lib/nav";

/**
 * `<lastmod>` is only useful if it's true. Stamping `new Date()` on every entry
 * at build time would claim the whole catalogue changed on each deploy, and
 * Google demotes a lastmod it learns to distrust — so dates come from real
 * `updated_at` values, and entries with no honest date carry none at all.
 */
function latest(dates: Array<string | null | undefined>): Date | undefined {
  let newest = 0;
  for (const d of dates) {
    const t = d ? Date.parse(d) : NaN;
    if (!Number.isNaN(t) && t > newest) newest = t;
  }
  return newest ? new Date(newest) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const [products, categories] = await Promise.all([getAllProducts(), getCategories()]);

  const catalogueUpdated = latest(products.map((p) => p.updated_at));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: catalogueUpdated, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, lastModified: catalogueUpdated, changeFrequency: "daily", priority: 0.9 },
    // Policy / support pages — rarely change, but should still be indexed.
    // No trustworthy date for these, so they deliberately carry no lastmod.
    ...contentRoutes.map((path) => ({
      url: `${base}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => {
    const inCategory = products.filter((p) => p.category_slug === c.slug);
    return {
      url: `${base}/category/${c.slug}`,
      // A category listing is only as fresh as the products on it.
      lastModified: latest(inCategory.map((p) => p.updated_at)),
      changeFrequency: "weekly",
      priority: 0.8,
    };
  });

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.slug}`,
    lastModified: latest([p.updated_at]),
    changeFrequency: "weekly",
    // Off-sale products stay listed — their pages still work and still rank,
    // and the Offer schema already reports OutOfStock — but they shouldn't
    // compete with sellable stock for crawl budget.
    priority: p.in_stock ? 0.7 : 0.4,
    // Primary shot only: an image sitemap helps product images surface in
    // Google Images, and the gallery adds bulk without adding much reach.
    ...(p.images[0] ? { images: [p.images[0]] } : {}),
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
