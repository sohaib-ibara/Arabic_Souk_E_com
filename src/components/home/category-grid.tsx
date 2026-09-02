import Link from "next/link";
import type { Category } from "@/lib/types";
import { ProductImage } from "@/components/ui/product-image";
import { accentFor } from "@/lib/accent";
import { cn } from "@/lib/cn";

/**
 * Twelve tiles, and until now twelve identical ones: same sand background, same
 * grey-to-black gradient, same white label. Nothing distinguished Fragrance
 * from Hair Care except the word, so the grid was read rather than recognised.
 *
 * Each tile now carries an accent drawn from its slug (see lib/accent.ts), so
 * the wash under the label differs from its neighbours' and stays the same
 * colour on every visit. On hover the tile lifts, the photograph pushes in
 * behind it, and the name steps up to make room for "Shop now" — the tiles
 * have always been links, and nothing on them ever said so.
 *
 * The name is visible at rest, which is what matters: a phone has no hover, so
 * everything that hover adds here is a second layer over a tile that already
 * works without it.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {categories.map((c) => {
        const accent = accentFor(c.slug);
        return (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-2xl",
              "transition-all duration-300 hover:shadow-lg hover:shadow-ink/10",
              "motion-safe:hover:-translate-y-1",
              accent.tint,
            )}
          >
            <ProductImage
              src={c.image_url}
              alt={c.name}
              fill
              sizes="(max-width: 768px) 50vw, 16vw"
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />

            {/* The accent, over the photograph rather than instead of it: the
                colour identifies the tile, the picture still sells it. */}
            <div
              className={cn(
                "absolute inset-0 bg-linear-to-t via-ink/20 to-transparent",
                "opacity-85 transition-opacity duration-300 group-hover:opacity-95",
                accent.wash,
              )}
            />

            <div className="absolute inset-x-0 bottom-0 p-3 text-center">
              <span className="block text-sm font-medium text-white transition-transform duration-300 group-hover:-translate-y-3">
                {c.name}
              </span>
              {/* Absolute, so appearing costs the name no room and the tile
                  does not reflow under the cursor. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-3 translate-y-2 text-[11px] font-medium text-white/90 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
              >
                Shop now &rarr;
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
