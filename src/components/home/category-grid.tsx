import Link from "next/link";
import type { Category } from "@/lib/types";
import { ProductImage } from "@/components/ui/product-image";

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          className="group relative aspect-square overflow-hidden rounded-2xl bg-sand"
        >
          <ProductImage
            src={c.image_url}
            alt={c.name}
            fill
            sizes="(max-width: 768px) 50vw, 16vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-t from-ink/70 via-ink/10 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-3 text-center text-sm font-medium text-white">
            {c.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
