import Link from "next/link";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";
import { getAdminEmail, adminConfigured } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/admin/logout-button";

// Reads the session cookie on every request — never cache or prerender.
export const dynamic = "force-dynamic";

// Admin console shell. Deliberately outside the (store) route group so it does
// NOT inherit the storefront announcement bar, header, footer or cart drawer.
//
// The session gate lives here so every screen under /admin is protected by
// construction. Pages and server actions re-check independently (see
// `requireAdmin`) — a layout gate alone is not a security boundary, since
// server actions are reachable by direct POST.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const email = await getAdminEmail();

  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="border-b border-line bg-white">
        <Container className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="font-serif text-lg tracking-tight text-ink">{siteConfig.name}</span>
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium uppercase tracking-[0.15em] text-white">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
              View store ↗
            </Link>
            {email && (
              <>
                <span className="hidden text-sm text-muted sm:inline">{email}</span>
                <LogoutButton />
              </>
            )}
          </div>
        </Container>
      </header>

      {email ? (
        <>
          <AdminNav />
          <div className="flex-1">{children}</div>
        </>
      ) : (
        <div className="flex-1">
          <AdminLogin configured={adminConfigured()} />
        </div>
      )}
    </div>
  );
}
