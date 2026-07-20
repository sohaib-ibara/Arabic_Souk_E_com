"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * next/image wrapper that degrades gracefully to an elegant monogram tile if a
 * remote image fails to load — so the storefront never shows a broken image.
 */
export function ProductImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  priority,
  className,
}: {
  src?: string | null;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center bg-linear-to-br from-brand-tint via-cream to-sand",
          className,
        )}
      >
        <span className="font-serif text-4xl text-brand/40 select-none">
          {alt?.trim()?.charAt(0)?.toUpperCase() || "L"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : (width ?? 600)}
      height={fill ? undefined : (height ?? 600)}
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
