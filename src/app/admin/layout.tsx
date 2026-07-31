import Link from "next/link";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";

// Admin console shell. Deliberately outside the (store) route group so it does
// NOT inherit the storefront announcement bar, header, footer or cart drawer.
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="border-b border-line bg-white">
        <Container className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <span className="font-serif text-lg tracking-tight text-ink">{siteConfig.name}</span>
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium uppercase tracking-[0.15em] text-white">
              Admin
            </span>
          </div>
          <Link
            href="/"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            View store ↗
          </Link>
        </Container>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
