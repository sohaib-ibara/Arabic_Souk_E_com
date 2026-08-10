import type { Metadata } from "next";
import { getAdminOverview } from "@/lib/admin-data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdmin } from "@/lib/admin-auth";

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

  const overview = await getAdminOverview();
  return <AdminDashboard overview={overview} />;
}
