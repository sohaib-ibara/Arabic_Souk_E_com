"use client";

import Link from "next/link";
import { HeartIcon } from "@/components/ui/icons";
import { useWishlist } from "@/lib/wishlist";

/**
 * The saved-items link in the header, with its count.
 *
 * Hidden entirely until something is saved. An empty heart in the header is a
 * feature advertising itself; a heart with a 3 on it is somewhere the shopper
 * actually wants to go back to. Nothing is lost by waiting - the only way to
 * save anything is the heart on the product itself, which is always there.
 */
export function WishlistLink() {
  const { count } = useWishlist();

  if (count === 0) return null;

  return (
    <Link
      href="/wishlist"
      aria-label={`Saved items (${count})`}
      className="relative grid h-10 w-10 place-items-center rounded-full text-ink hover:text-brand"
    >
      <HeartIcon width={22} height={22} />
      <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-medium text-white">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}
