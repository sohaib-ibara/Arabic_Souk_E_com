"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { siteConfig } from "@/lib/config";
import { navGroups } from "@/lib/nav";
import { CartButton } from "@/components/cart/cart-button";
import { ChevronRightIcon, CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setSearchOpen(false);
    setMenuOpen(false);
    router.push(q ? `/shop?search=${encodeURIComponent(q)}` : "/shop");
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-full text-ink hover:text-brand lg:hidden"
          >
            <MenuIcon width={24} height={24} />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-baseline gap-1.5" aria-label={`${siteConfig.name} home`}>
            <span className="font-serif text-2xl leading-none tracking-tight">{siteConfig.name}</span>
            <span className="hidden text-[10px] uppercase tracking-[0.25em] text-muted sm:inline">
              Bahrain
            </span>
          </Link>

          {/* Desktop nav — departments with sub-category dropdowns */}
          <nav className="mx-auto hidden items-center gap-6 lg:flex">
            {navGroups.map((group) =>
              group.items.length ? (
                <div key={group.slug} className="group relative">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm text-ink/80 transition-colors group-hover:text-brand"
                  >
                    {group.name}
                    <ChevronRightIcon width={14} height={14} className="rotate-90 opacity-60" />
                  </button>
                  <div className="invisible absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-3 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 focus-within:visible focus-within:opacity-100">
                    <div className="rounded-2xl border border-line bg-cream p-2 shadow-xl">
                      {group.items.map((item) => (
                        <Link
                          key={item.slug}
                          href={`/category/${item.slug}`}
                          className="block rounded-lg px-3 py-2 text-sm text-ink/80 hover:bg-brand-tint hover:text-brand"
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={group.slug}
                  href={`/category/${group.slug}`}
                  className="text-sm text-ink/80 transition-colors hover:text-brand"
                >
                  {group.name}
                </Link>
              ),
            )}
            <Link href="/shop" className="text-sm font-medium text-brand hover:text-brand-dark">
              Shop all
            </Link>
          </nav>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search"
              aria-expanded={searchOpen}
              className="grid h-10 w-10 place-items-center rounded-full text-ink hover:text-brand"
            >
              {searchOpen ? <CloseIcon width={22} height={22} /> : <SearchIcon width={22} height={22} />}
            </button>
            <CartButton />
          </div>
        </div>

        {/* Expandable search bar */}
        <div
          className={cn(
            "overflow-hidden border-line bg-cream transition-[max-height] duration-300",
            searchOpen ? "max-h-24 border-t" : "max-h-0",
          )}
        >
          <form
            onSubmit={submitSearch}
            className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8"
          >
            <SearchIcon className="text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, brands, categories…"
              aria-label="Search products"
              autoFocus={searchOpen}
              className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-brand"
            >
              Search
            </button>
          </form>
        </div>
      </header>

      {/*
        Mobile slide-in menu — intentionally rendered OUTSIDE <header>.
        The header uses `backdrop-blur`, and an element with backdrop-filter
        becomes the containing block for `fixed` descendants; nesting this here
        would clip the overlay to the header's height. As a sibling it is
        positioned against the viewport, like the cart drawer.
      */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", !menuOpen && "pointer-events-none")}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={() => setMenuOpen(false)}
          className={cn(
            "absolute inset-0 bg-ink/40 transition-opacity",
            menuOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute left-0 top-0 flex h-full w-4/5 max-w-xs flex-col bg-cream shadow-2xl transition-transform duration-300",
            menuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <span className="font-serif text-xl">{siteConfig.name}</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="grid h-9 w-9 place-items-center rounded-full hover:text-brand"
            >
              <CloseIcon />
            </button>
          </div>

          <form onSubmit={submitSearch} className="flex items-center gap-2 border-b border-line px-5 py-3">
            <SearchIcon className="text-muted" width={18} height={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search products"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </form>

          <nav className="flex flex-col gap-1 overflow-y-auto px-2 py-2">
            {navGroups.map((group) =>
              group.items.length ? (
                <div key={group.slug} className="px-3 py-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {group.name}
                  </p>
                  <div className="mt-1 flex flex-col">
                    {group.items.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/category/${item.slug}`}
                        onClick={() => setMenuOpen(false)}
                        className="rounded-lg px-2 py-2 text-[15px] text-ink hover:bg-brand-tint hover:text-brand"
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={group.slug}
                  href={`/category/${group.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-3 text-[15px] text-ink hover:bg-brand-tint hover:text-brand"
                >
                  {group.name}
                </Link>
              ),
            )}
            <Link
              href="/shop"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-lg px-3 py-3 text-[15px] font-medium text-brand hover:bg-brand-tint"
            >
              Shop all
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
