import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { isAdmin } from "@/lib/admin-auth";
import { listSubscribers } from "@/lib/newsletter";
import { SubscriberExport } from "@/components/admin/subscriber-export";

export const metadata: Metadata = {
  title: "Subscribers \u00b7 Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The newsletter list.
 *
 * Exists because collecting addresses nobody can read is not "functional" - it
 * is the same demo with a database behind it. Export is the whole point: the
 * shop has no campaign tool, so the useful thing this page can do is hand the
 * list to whatever does.
 */
export default async function AdminSubscribersPage() {
  if (!(await isAdmin())) return null;

  const { ready, message, rows, total, bySource } = await listSubscribers();

  const sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Subscribers</h1>
          <p className="mt-1 text-sm text-muted">
            Everyone who has given us their email.
          </p>
        </div>
        {rows.length > 0 && <SubscriberExport rows={rows} />}
      </div>

      {!ready && (
        <Notice tone="warning" className="mt-6">
          {message ?? "The subscriber list is unavailable."}
        </Notice>
      )}

      {ready && (
        <>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-line bg-white px-4 py-1.5">
              {total} total
            </span>
            {sources.map(([name, n]) => (
              <span key={name} className="rounded-full border border-line bg-white px-4 py-1.5">
                {name}: {n}
              </span>
            ))}
          </div>

          <Notice tone="info" className="mt-6">
            Addresses are stored, not sent to. There is no campaign tool wired up yet, so
            export this list into whichever one you choose.
          </Notice>

          {rows.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line py-16 text-center">
              <p className="font-serif text-xl">Nobody yet</p>
              <p className="mt-2 text-sm text-muted">
                Signups from the footer, the homepage, the sticky tab and the welcome offer
                all arrive here.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">Page</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{r.email}</td>
                      <td className="px-4 py-3 text-muted">{r.source ?? "\u2014"}</td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-muted">
                        {r.page ?? "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {new Date(r.subscribed_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
