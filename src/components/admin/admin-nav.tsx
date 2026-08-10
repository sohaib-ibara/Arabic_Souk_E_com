"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/pricing", label: "Bulk pricing" },
  { href: "/admin/orders", label: "Orders" },
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
