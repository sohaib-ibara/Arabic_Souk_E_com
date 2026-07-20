"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const imgs = images.length ? images : [""];
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col-reverse gap-4 sm:flex-row">
      {imgs.length > 1 && (
        <div className="flex gap-3 sm:flex-col">
          {imgs.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1} of ${name}`}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sand ring-1 transition-colors",
                active === i ? "ring-brand" : "ring-line hover:ring-brand/50",
              )}
            >
              <ProductImage
                src={src}
                alt={`${name} — thumbnail ${i + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <div className="relative aspect-[4/5] flex-1 overflow-hidden rounded-3xl bg-sand">
        <ProductImage
          src={imgs[active]}
          alt={name}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
