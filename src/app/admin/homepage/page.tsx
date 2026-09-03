import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { ShelfPreview } from "@/components/admin/home-shelf";
import { HomeShelfEditor } from "@/components/admin/home-shelf-editor";
import { isAdmin } from "@/lib/admin-auth";
import { getBestsellers } from "@/lib/data";
import { listHomePicks } from "@/lib/home-picks";

export const metadata: Metadata = {
  title: "Home page · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Choosing what leads the home page.
 *
 * The Bestsellers row was computed and only computed: featured first, then
 * rating weighted by review count. Nothing on the shop let anybody say "this
 * one, in position one, this week", which is the ordinary reason a shop window
 * looks the way it does.
 *
 * Its own screen rather than a column on Products, because it is a decision
 * about one row of one page and it involves eight products out of hundreds.
 * Buried in a table it would be eight checkboxes with no way to see the order.
 *
 * The editing itself is a client component. Searching and reordering are both
 * things you do continuously — typing a name, dragging a card — and a server
 * round trip per keystroke and per nudge made both feel like paperwork. The
 * preview stays here on the server, built by the very function the home page
 * calls, so it cannot drift from what a shopper sees; the editor refreshes the
 * route after each save and it catches up on its own.
 */
export default async function AdminHomepagePage() {
  if (!(await isAdmin())) return null;

  // Two queries, one wave. Neither needs the other's answer.
  const [{ ready, message, picks }, preview] = await Promise.all([
    listHomePicks(),
    getBestsellers(8),
  ]);

  const pinnedIds = new Set(picks.map((p) => p.product_id));

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Home page</h1>
        <p className="mt-1 text-sm text-muted">
          Which products lead the Bestsellers row, and in what order.
        </p>
      </div>

      {!ready ? (
        <Notice tone="warning" title="Not available yet" className="mt-6">
          {message ?? "The home page picks are unavailable."}
        </Notice>
      ) : (
        <>
          <Notice tone="info" className="mt-6">
            Pin up to eight. They fill the row from the left in the order below, and whatever
            is left over is filled by the shop&rsquo;s own ranking — best rated first. Pin
            nothing and the whole row is chosen automatically, which is how it worked before.
          </Notice>

          {/*
            Deliberately NOT keyed on the picks.

            Keying it would remount on every refresh, and the editor refreshes
            after each save — so adding a product from the search would clear
            the search box and the results underneath it, which is precisely
            the behaviour the old form-and-redirect version had. The editor
            takes a newly rendered list on its own instead; see the note there.
          */}
          <HomeShelfEditor initialPicks={picks} />

          <ShelfPreview products={preview} pinnedIds={pinnedIds} />
        </>
      )}
    </Container>
  );
}
