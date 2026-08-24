import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal or transactional routes with nothing to offer a searcher.
      // /admin is deliberately absent: its pages already send `noindex`, and
      // blocking the crawl here would stop Google ever reading that header.
      disallow: ["/cart", "/checkout", "/account", "/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
