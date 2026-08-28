/**
 * Helpers every site adapter needs.
 *
 * The one thing all these retailers have in common is schema.org JSON-LD —
 * they publish it for Google, which means it is maintained, structured, and
 * far more stable than any CSS selector we could write. Everything here is
 * about getting at that block and tidying what comes out of it.
 */

/** Entities appear at the top level, inside @graph, or nested in arrays. */
export function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      /* a malformed block is not worth failing the page over */
    }
  }
  return flattenLd(blocks);
}

/** Normalise arrays / @graph wrappers into one flat list of entities. */
export function flattenLd(blocks) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(walk);
    if (node["@type"]) out.push(node);
  };
  blocks.forEach(walk);
  return out;
}

/** `@type` may be a string or an array, so never compare it directly. */
export const isType = (entity, type) => {
  const t = entity?.["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
};

export const findType = (entities, type) => entities.find((e) => isType(e, type)) ?? null;

/** Breadcrumb names in order, minus the "Home" root. */
export function breadcrumbOf(entities) {
  const bc = findType(entities, "BreadcrumbList");
  return (bc?.itemListElement ?? [])
    .map((i) => i.name ?? i.item?.name ?? "")
    .filter(Boolean)
    .filter((n) => !/^home$/i.test(n))
    .map(decode);
}

/** schema.org availability → a plain boolean, or null when unstated. */
export function availabilityToBool(availability) {
  if (!availability) return null;
  const a = String(availability).replace(/^https?:\/\/schema\.org\//, "").toLowerCase();
  if (a.includes("instock") || a.includes("limitedavailability") || a.includes("presale")) return true;
  if (a.includes("outofstock") || a.includes("soldout") || a.includes("discontinued")) return false;
  return null;
}

export const decode = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ") // some retailers put marked-up HTML in `description`
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();

/** Identical to the original noon generator's, so existing slugs still match. */
export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "item";

export function firstSentence(text, max = 140) {
  const t = decode(text);
  if (!t) return null;
  const clean = t.replace(/^about the product:?\s*/i, "");
  const cut = clean.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  return (dot > 40 ? cut.slice(0, dot + 1) : cut).trim() + (clean.length > max && dot <= 40 ? "…" : "");
}

/** Absolute http(s) image URLs only, capped — feeds are full of 1px trackers. */
export const imageList = (image, max = 4) =>
  (Array.isArray(image) ? image : image ? [image] : [])
    .map((i) => (typeof i === "string" ? i : i?.url ?? i?.contentUrl))
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u))
    .slice(0, max);

/** Tracking params make a supplier link long and stale; the bare path is stable. */
export const cleanUrl = (u) => String(u || "").split("?")[0];
