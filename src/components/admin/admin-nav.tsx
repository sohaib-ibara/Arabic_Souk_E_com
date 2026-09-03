"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/*
  Ordered the way the work runs, not the way the screens were built.

  Overview is where you land. Home page is what a shopper sees first, so it
  comes next. Vendors decides who we buy from and what of theirs is on the
  shop, which is the decision Products then works inside — so Vendors leads
  Products rather than following it. Everything after that is downstream of a
  catalogue already being there: stock, then orders, then the people and the
  suppliers behind them.
*/
const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/homepage", label: "Home page" },
  // Categories used to sit here as its own entry. Both kinds of category
  // switch are on the Vendors page now - see shop-sections.tsx.
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/sync", label: "Supplier sync" },
];

/**
 * Console navigation. `/admin` matches exactly (it's the index); every other
 * entry also matches its nested routes, so the tab stays lit while you're deep
 * in an edit screen.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {links.map((link) => {
          const active =
            link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm transition-colors",
                active
                  ? "border-brand font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
