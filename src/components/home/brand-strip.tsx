import Link from "next/link";
import type { Brand } from "@/lib/types";

export function BrandStrip({ brands }: { brands: Brand[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
      {brands.map((b) => (
        <Link
          key={b.id}
          href={`/shop?brand=${b.slug}`}
          className="font-serif text-lg text-ink/50 transition-colors hover:text-brand sm:text-xl"
        >
          {b.name}
        </Link>
      ))}
    </div>
  );
}
