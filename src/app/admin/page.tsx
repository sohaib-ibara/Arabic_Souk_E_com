import type { Metadata } from "next";
import { getAdminEmail, adminConfigured } from "@/lib/admin-auth";
import { getAdminOverview } from "@/lib/admin-data";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Reads cookies + live demand data — never cache or prerender.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const email = await getAdminEmail();
  if (!email) {
    return <AdminLogin configured={adminConfigured()} />;
  }
  const overview = await getAdminOverview();
  return <AdminDashboard overview={overview} email={email} />;
}
