import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/config";

/**
 * Default social card for the whole site.
 *
 * Without one, a shared link renders as bare text — poor for any brand, worse
 * for a beauty store whose whole appeal is visual. Product and category pages
 * set their own imagery in `generateMetadata`; this is the fallback for the
 * home page, the shop and every policy page.
 *
 * Drawn in code rather than shipped as a PNG so it stays correct after a
 * rebrand: the colours below are the tokens from globals.css and the words come
 * from siteConfig.
 *
 * Playfair Display is read from `assets/` rather than fetched from Google at
 * build time — the site's headings use it, and a webfont request during the
 * build is a network dependency that can fail a deploy. It must be a *static*
 * instance: Satori cannot read the variable-weight release and dies mid-render
 * with a bare "Cannot read properties of undefined". Licence sits beside it.
 */
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SAND = "#f2ebe1";
const INK = "#1b1613";
const BRAND = "#a04963";
const TINT = "#f7ebef";

export default async function Image() {
  const playfair = await readFile(join(process.cwd(), "assets/PlayfairDisplay-SemiBold.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: SAND,
          backgroundImage: `radial-gradient(circle at 50% 0%, ${TINT} 0%, ${SAND} 62%)`,
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 14,
            textTransform: "uppercase",
            color: BRAND,
          }}
        >
          {siteConfig.country}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 104,
            fontWeight: 700,
            letterSpacing: -2,
            color: INK,
          }}
        >
          <span style={{ fontFamily: "Playfair Display" }}>{siteConfig.name}</span>
        </div>

        <div
          style={{
            display: "flex",
            width: 120,
            height: 4,
            marginTop: 36,
            backgroundColor: BRAND,
          }}
        />

        <div
          style={{
            display: "flex",
            marginTop: 36,
            maxWidth: 820,
            fontSize: 38,
            lineHeight: 1.35,
            textAlign: "center",
            color: INK,
            opacity: 0.75,
          }}
        >
          {siteConfig.tagline}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Playfair Display", data: playfair, style: "normal", weight: 600 }],
    },
  );
}
