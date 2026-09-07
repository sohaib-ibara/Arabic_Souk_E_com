/**
 * Supplier shelf names → our categories.
 *
 * Cult Beauty's "categories" are not a taxonomy. They are merchandising
 * shelves, and 58 of the 62 its crawl found have no equivalent here: some are
 * genuine aisles under another name (`make-up-removers`, `nails`), and some are
 * campaigns that describe nothing about the product at all — `halloween`,
 * `spotlight`, `goody-bag`, `our-customers-love`.
 *
 * Only the unambiguous ones are mapped. A campaign shelf, or a shelf that spans
 * two of our aisles (`eyes-lips`) or describes a concern rather than a product
 * type (`firming`, `dewy`, `korean-skin-care`), is deliberately left out: an
 * imported product then arrives with no category and is listed in the admin as
 * needing one, which is the honest outcome. Guessing would put a serum in the
 * lipstick aisle and nobody would notice until a customer did.
 *
 * PROVISIONAL. The client said on the 1 Sep call that they would decide which
 * Cult categories the shop carries. This exists so the import is useful before
 * that conversation, not to pre-empt it — every line here is a guess a human
 * can overrule per product in /admin/products.
 */
export const CATEGORY_ALIASES: Record<string, Record<string, string>> = {
  cultbeauty: {
    // Make-up
    "make-up-removers": "makeup-remover",
    complexion: "face-makeups",
    "faux-freckles": "face-makeups",
    "make-up-setting-spray": "face-makeups",
    brows: "eyes",
    eyelashes: "eyes",
    nails: "nail-makeup",
    "tools-brushes": "makeup-tools-accessories",
    brushes: "makeup-tools-accessories",

    // Skin
    moisturisers: "creams-moisturizers",
    "moisturisers-serums": "creams-moisturizers",
    neck: "creams-moisturizers",
    serums: "treatment-serums",
    "masks-exfoliators": "skin-cleansers",
    "scrubs-exfoliators": "skin-cleansers",
    "cleansers-exfoliators": "skin-cleansers",
    "cleansers-toners": "skin-cleansers",
    "cleansers-toners-mists": "skin-cleansers",
    "toners-mists": "skin-cleansers",
    "tanning-suncare": "sun-care",
    "sun-tanning": "sun-care",

    // Hair
    "heat-protection": "styling-products",
    "sleek-hair": "styling-products",
    "hair-gloss": "hair-color",
    "hair-concern": "hair-scalp-treatments",
    "scalp-exfoliator-treatments": "hair-scalp-treatments",

    // Bath and body
    // Not "bath": that is a second bath aisle beside "Bath & Body", holding
    // eight products nobody could see because it was switched off shop-wide
    // while Bath & Body was on. One aisle, and it is the one already there.
    "bath-oils-bubbles-soaks": "bath-body",
    "bath-shower": "bath-body",
    "body-oil": "bath-body",
    "body-oil-shimmers": "bath-body",
    "hands-feet": "bath-body",
  },
};

/**
 * The category slug to file a staged product under, or null to leave it for a
 * human. `staged` is whatever the supplier's crawl called the shelf.
 */
export function resolveCategorySlug(
  source: string | null,
  staged: string | null,
  known: Set<string>,
): string | null {
  if (!staged) return null;
  // A shelf whose name already matches one of ours needs no alias.
  if (known.has(staged)) return staged;
  const mapped = CATEGORY_ALIASES[source ?? ""]?.[staged];
  return mapped && known.has(mapped) ? mapped : null;
}
