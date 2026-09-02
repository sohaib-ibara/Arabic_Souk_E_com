/**
 * Which accent a category wears.
 *
 * The category grid was twelve identical sand tiles, and twelve identical
 * anythings is a list, not a shop. Colour is the cheapest way to make them
 * distinguishable — you learn where Fragrance sits without reading the labels.
 *
 * Assigned from the slug rather than stored, for two reasons. A colour column
 * is one more thing for somebody to fill in for twenty-six categories, and one
 * more thing to be blank when the sync creates the twenty-seventh. And derived
 * from the slug rather than the position in the list, so a category's colour
 * does not change when a different one is switched off above it — the tile a
 * regular visitor recognises stays the colour they recognise it by.
 *
 * Five accents, all muted to about the same value, so the grid reads as one
 * palette rather than a paintbox.
 */

export interface Accent {
  /** Tailwind class for the wash behind the tile. */
  tint: string;
  /** Tailwind class for the gradient the label sits on. */
  wash: string;
  /** Tailwind class for text and icons at full strength. */
  text: string;
  /** Tailwind class for a solid rule or dot in the accent. */
  bar: string;
}

const ACCENTS: Accent[] = [
  { tint: "bg-brand-tint", wash: "from-brand/85", text: "text-brand", bar: "bg-brand" },
  { tint: "bg-plum-tint", wash: "from-plum/85", text: "text-plum", bar: "bg-plum" },
  { tint: "bg-sage-tint", wash: "from-sage/85", text: "text-sage", bar: "bg-sage" },
  { tint: "bg-sky-tint", wash: "from-sky/85", text: "text-sky", bar: "bg-sky" },
  { tint: "bg-clay-tint", wash: "from-clay/85", text: "text-clay", bar: "bg-clay" },
  { tint: "bg-gold-tint", wash: "from-gold/85", text: "text-gold", bar: "bg-gold" },
];

/**
 * A small stable hash of the slug.
 *
 * Stable is the hard requirement: the same answer on the server and in the
 * browser, every time, or React reports a hydration mismatch. So no randomness
 * and nothing derived from the clock.
 *
 * FNV-1a followed by an avalanche mix, and the mix is not ceremony. Plain djb2
 * was tried first and these slugs defeated it — they share prefixes and
 * lengths ("lip-care", "sun-care", "hair-scalp-treatments"), and a weak hash
 * maps similar inputs to neighbouring outputs. Measured against the 30 enabled
 * categories it put eleven of them on one accent and one on another, and five
 * of the twelve homepage tiles came out the same colour, which is the exact
 * problem the accents exist to solve.
 *
 * With the mix the same 30 spread 4-8 per accent, all six appear in the first
 * twelve tiles, and no tile shares a colour with the one beside it.
 */
function hash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Avalanche: without this, inputs one character apart land next to each
  // other and `% 6` hands them the same accent.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27220a95);
  h ^= h >>> 16;
  return h >>> 0;
}

export function accentFor(slug: string): Accent {
  return ACCENTS[hash(slug) % ACCENTS.length];
}

/** Straight down the list, for a fixed set like the value props. */
export function accentAt(index: number): Accent {
  return ACCENTS[index % ACCENTS.length];
}
