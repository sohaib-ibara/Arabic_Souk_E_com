"use client";

import { HeartIcon } from "@/components/ui/icons";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/cn";

/**
 * The save-for-later heart.
 *
 * Two sizes because it sits in two places with different jobs: a small one
 * floating on the product card, where it must not compete with Add to bag, and
 * a labelled one on the product page, where it is a real second option beside
 * buying.
 */
export function WishlistButton({
  slug,
  name,
  withLabel = false,
  className,
}: {
  slug: string;
  name: string;
  withLabel?: boolean;
  className?: string;
}) {
  const { slugs, toggle } = useWishlist();
  const saved = slugs.includes(slug);

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name} for later`}
      title={saved ? "Saved" : "Save for later"}
      className={cn(
        withLabel
          ? "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
          : "inline-flex h-9 w-9 items-center justify-center rounded-full bg-cream/90 shadow-sm backdrop-blur transition-colors hover:bg-white",
        saved && "text-brand",
        className,
      )}
    >
      <HeartIcon
        width={withLabel ? 18 : 16}
        height={withLabel ? 18 : 16}
        /* Filled once saved. The outline/filled pair is the only part of this
           control that reads at a glance, so it carries the state rather than
           a colour change alone -- which nobody sees on a busy product image. */
        fill={saved ? "currentColor" : "none"}
      />
      {withLabel && (saved ? "Saved" : "Save for later")}
    </button>
  );
}
