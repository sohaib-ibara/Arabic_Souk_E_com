import Link from "next/link";
import type { Product } from "@/lib/types";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "./add-to-cart-button";
import { discountPercent } from "@/lib/format";

export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const dp = discountPercent(product.price, product.compare_at_price);
  const href = `/product/${product.slug}`;

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
        <Link href={href} aria-label={product.name} className="block h-full w-full">
          <ProductImage
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.is_new && <Badge tone="brand">New</Badge>}
          {dp ? <Badge tone="sale">-{dp}%</Badge> : null}
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
        <div className="mt-1.5">
          <StarRating rating={product.rating} count={product.review_count} size={13} />
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
