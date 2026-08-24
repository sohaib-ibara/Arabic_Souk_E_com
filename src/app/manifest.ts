import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";

/**
 * Web app manifest — what a phone uses when the store is added to a home
 * screen, and one of the signals Lighthouse checks under "Installable".
 * Colours mirror the `viewport.themeColor` in the root layout and `--sand` in
 * globals.css, so the splash screen matches the site rather than flashing white.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.tagline}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    lang: "en",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
