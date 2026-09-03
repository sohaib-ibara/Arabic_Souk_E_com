import type { Metadata } from "next";
import { getAdminOverview } from "@/lib/admin-data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdmin } from "@/lib/admin-auth";
import { getInventoryOverview, type InventoryStats } from "@/lib/inventory";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Reads cookies + live demand data — never cache or prerender.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // The layout renders the sign-in screen when there's no session; bail out here
  // too so the overview query never runs for an anonymous request.
  if (!(await isAdmin())) return null;

  const [overview, stock] = await Promise.all([getAdminOverview(), getInventoryOverview()]);

  // Null until migration 0005 is in, so the tiles simply don't render rather
  // than showing a scary error for a feature that isn't installed yet. The
  // readiness now comes back with the figures instead of from a probe ahead of
  // them, which is what lets this sit inside the Promise.all above.
  const inventory: InventoryStats | null = stock.status.ready ? stock.stats : null;

  return <AdminDashboard overview={overview} inventory={inventory} />;
}
