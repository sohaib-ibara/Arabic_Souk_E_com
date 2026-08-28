import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { SyncPanel } from "@/components/admin/sync-panel";
import { isAdmin } from "@/lib/admin-auth";
import { getPendingChanges, getSyncStatus } from "@/lib/sync-status";

export const metadata: Metadata = {
  title: "Supplier sync · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Sources we expect to hear from.
 *
 * Listed explicitly rather than derived from `sync_runs`, because a source that
 * has never reported would otherwise not appear at all — and "noon has never
 * synced" is precisely the thing this page has to be able to say.
 */
const EXPECTED_SOURCES = ["noon", "cultbeauty"];

export default async function AdminSyncPage() {
  if (!(await isAdmin())) return null;

  const [status, changes] = await Promise.all([
    getSyncStatus(EXPECTED_SOURCES),
    getPendingChanges(60),
  ]);

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Supplier sync</h1>
        <p className="mt-1 text-sm text-muted">
          What each supplier has told us, and when we last asked.
        </p>
      </div>

      {!status.ready && (
        <Notice tone="warning" title="Sync history isn’t available" className="mt-6">
          {status.message}
        </Notice>
      )}

      {status.ready && <SyncPanel status={status} changes={changes} />}
    </Container>
  );
}
