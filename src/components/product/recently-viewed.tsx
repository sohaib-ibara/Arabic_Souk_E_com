"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/ui/container";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";

/**
 * The row of things you already looked at.
 *
 * Beauty is a comparison purchase — people open four serums, decide none of
 * them, and then cannot find the second one again. This is the cheapest fix for
 * that, and unlike everything else added this week it interrupts nobody: it
 * sits at the bottom of the page and is only there if you gave it something to
 * show.
 *
 * Kept on the device, not the account. It is browsing history, most visitors
 * are guests, and it is worth nothing to anyone but the person who made it.
 */

const KEY = "arabicsouk.recently-viewed.v1";
/** Enough to be useful, short enough that the row stays scannable. */
const MAX = 12;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    // Corrupt or blocked storage reads as no history, never as a crash on a
    // product page.
    return [];
  }
}

/**
 * Records one product view. Mounted on the product page; renders nothing.
 *
 * Most-recent-first, de-duplicated, so re-opening a product moves it to the
 * front rather than filling the row with one item.
 */
export function RecordProductView({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    try {
      const next = [slug, ...read().filter((s) => s !== slug)].slice(0, MAX);
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private browsing: no history, no strip, no error */
    }
  }, [slug]);

  return null;
}

interface Card {
  slug: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image: string | null;
}

export function RecentlyViewed({
  excludeSlug,
  title = "Recently viewed",
}: {
  excludeSlug?: string;
  title?: string;
}) {
  const [products, setProducts] = useState<Card[]>([]);

  useEffect(() => {
    const slugs = read().filter((s) => s !== excludeSlug);
    // One is not a row. Two is the first point at which "which was the other
    // one?" is a question this can answer.
    if (slugs.length < 2) return;

    const controller = new AbortController();
    fetch(`/api/products?slugs=${encodeURIComponent(slugs.join(","))}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data: { products: Card[] }) => setProducts(data.products ?? []))
      .catch(() => {
        /* aborted on unmount, or offline; the row simply does not appear */
      });

    return () => controller.abort();
  }, [excludeSlug]);

  if (products.length < 2) return null;

  return (
    <section className="border-t border-line py-10">
      <Container>
        <h2 className="font-serif text-2xl">{title}</h2>
        {/* A scroller rather than a grid: this row is a memory aid, and it must
            not push the page's real content further down as it fills up. */}
        <ul className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {products.map((p) => (
            <li key={p.slug} className="w-36 shrink-0 snap-start sm:w-44">
              <Link href={`/product/${p.slug}`} className="group block">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-white">
                  <ProductImage
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="(min-width: 640px) 11rem, 9rem"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink group-hover:text-brand">
                  {p.name}
                </p>
                <Price
                  price={p.price}
                  compareAt={p.compare_at_price}
                  currency={p.currency}
                  size="sm"
                  className="mt-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
