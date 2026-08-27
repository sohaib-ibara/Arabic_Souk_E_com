/**
 * The site registry.
 *
 * Everything that differs between retailers lives in one adapter file; every
 * other script in scripts/import/ works against the normalised record below and
 * never names a site. Adding a third source means adding a file here and
 * nothing else.
 *
 * A normalised record — what every adapter's `parse` returns:
 *
 *   source       adapter key, e.g. "cultbeauty"
 *   sku          stable product code at that source
 *   sourceUrl    canonical link, query string stripped
 *   name, brand, description
 *   images       absolute URLs
 *   price        in the SOURCE's currency — never converted here
 *   currency     ISO code as the source states it
 *   available    true / false / null when the source doesn't say
 *   rating, reviewCount
 *   breadcrumb   as published; meaning varies (see each adapter's `category`)
 *   variantCount how many sellable SKUs that page holds
 *
 * Conversion to BHD is deliberately NOT done here. A price is a fact about the
 * source; a shelf price is a business decision (FX rate plus margin) and it
 * belongs with the other pricing rules, not scattered through the parsers.
 */
import { extractJsonLd, flattenLd } from "./shared.mjs";
import noon from "./noon.mjs";
import cultbeauty from "./cultbeauty.mjs";

export const sites = { noon, cultbeauty };

export function getSite(key) {
  const site = sites[key];
  if (!site) {
    throw new Error(`Unknown site "${key}". Known: ${Object.keys(sites).join(", ")}`);
  }
  return site;
}

/** Which adapter owns a URL. Matches on host, since both use `/p/` paths. */
export function siteForUrl(url) {
  let host;
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
  return (
    Object.values(sites).find((s) => new URL(s.origin).host.replace(/^www\./, "") === host) ?? null
  );
}

/**
 * Build the `page` object adapters parse, from either transport.
 *
 * The browser capture already holds parsed JSON-LD; an HTTP fetch holds raw
 * HTML. Normalising here means an adapter's `parse` never has to care which
 * route the page arrived by — the same code handles both, so a site that
 * switches from HTTP to browser (or back) needs no parser change.
 */
export function toPage({ url, html, jsonld }) {
  const entities = jsonld ? flattenLd(jsonld) : html ? extractJsonLd(html) : [];
  return { url, html, entities };
}

/** Convenience: fetch → parse, for `transport: "http"` sites. */
export async function parseUrl(site, url, { timeoutMs = 30_000, userAgent } = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent ?? DEFAULT_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = await res.text();
  return { status: res.status, record: site.parse(toPage({ url, html })) };
}

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
