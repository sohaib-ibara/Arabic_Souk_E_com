import Link from "next/link";
import type { Product } from "@/lib/types";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { TruckIcon } from "@/components/ui/icons";
import { AddToCartButton } from "./add-to-cart-button";
import { WishlistButton } from "./wishlist-button";
import { deliveryWindow, discountPercent } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What hovering a card adds.
 *
 * Three things, and all three answer a question somebody browsing actually
 * asks. The photograph turns over to the second one the supplier gave us —
 * 177 of 200 listed products have one, and for a lipstick or a serum the
 * second shot is usually the swatch or the back of the box. The stars step
 * aside for how long it takes to arrive, because at the browsing stage that is
 * the thing people want and the thing they otherwise have to open the product
 * page to find. And the card lifts, so the pointer has something under it.
 *
 * Everything hover adds is a second layer over a card that is already
 * complete. A phone has no hover: it gets the first image, the rating, and an
 * add button that is always visible rather than one that appears.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const dp = discountPercent(product.price, product.compare_at_price);
  const href = `/product/${product.slug}`;
  const unavailable = !product.in_stock;
  const second = product.images[1];

  return (
    <article className="group flex flex-col">
      <div
        className={cn(
          "relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand",
          "transition-all duration-300 group-hover:shadow-lg group-hover:shadow-ink/10",
          "motion-safe:group-hover:-translate-y-1",
        )}
      >
        <Link href={href} aria-label={product.name} className="block h-full w-full">
          <ProductImage
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            className={cn(
              "object-cover transition-transform duration-500 group-hover:scale-105",
              // Faded rather than hidden: the product stays browsable and its
              // page keeps working, it just reads as not-for-sale at a glance.
              unavailable && "opacity-45 saturate-50",
            )}
          />

          {/*
            The second shot, stacked on top and faded in. Only rendered when
            there is one — an empty layer would crossfade to the placeholder
            monogram, which looks like the image failed to load.

            Not marked priority even on the first row: it is invisible until
            somebody hovers, and preloading it would compete with the images
            that are actually on screen.
          */}
          {second && !unavailable && (
            <ProductImage
              src={second}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          )}
        </Link>

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {unavailable ? (
            <Badge tone="neutral">Out of stock</Badge>
          ) : (
            <>
              {product.is_new && <Badge tone="brand">New</Badge>}
              {dp ? <Badge tone="sale">-{dp}%</Badge> : null}
            </>
          )}
        </div>

        {/* Opposite corner to the badges, and above the hover button: this is
            the quiet second option and must never be mistaken for the loud
            first one. */}
        <div className="absolute right-3 top-3">
          <WishlistButton slug={product.slug} name={product.name} />
        </div>

        {/* Hover add-to-bag (desktop) */}
        <div className="absolute inset-x-3 bottom-3 hidden translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:block">
          <AddToCartButton product={product} label="Add to bag" className="w-full py-2.5 text-xs" />
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {product.brand_name && (
          <p className="text-[11px] uppercase tracking-wide text-muted">{product.brand_name}</p>
        )}
        <h3 className="mt-0.5">
          <Link
            href={href}
            className="line-clamp-2 text-sm font-medium leading-snug hover:text-brand"
          >
            {product.name}
          </Link>
        </h3>

        {/*
          Rating and delivery in the same grid cell, so one replaces the other
          without the card changing height — a row of cards that all grew a
          line on hover would shunt the whole grid down.
        */}
        <div className="mt-1.5 grid">
          <div
            className={cn(
              "col-start-1 row-start-1 transition-opacity duration-200",
              !unavailable && "group-hover:opacity-0",
            )}
          >
            <StarRating rating={product.rating} count={product.review_count} size={13} />
          </div>
          {!unavailable && (
            <p
              aria-hidden="true"
              className="col-start-1 row-start-1 flex items-center gap-1.5 text-[11px] text-sage opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <TruckIcon width={13} height={13} />
              Arrives in {deliveryWindow(product.lead_days_min, product.lead_days_max)}
            </p>
          )}
        </div>

        <div className="mt-2">
          <Price
            price={product.price}
            compareAt={product.compare_at_price}
            currency={product.currency}
          />
        </div>

        {/* Always-visible add button on mobile */}
        <div className="mt-3 lg:hidden">
          <AddToCartButton product={product} label="Add to bag" className="w-full py-2.5 text-xs" />
        </div>
      </div>
    </article>
  );
}
