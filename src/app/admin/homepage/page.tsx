import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { AddSearch, PickList, ShelfPreview } from "@/components/admin/home-shelf";
import { isAdmin } from "@/lib/admin-auth";
import { getBestsellers } from "@/lib/data";
import {
  listHomePicks,
  MAX_HOME_PICKS,
  searchPickable,
  type HomePick,
} from "@/lib/home-picks";

export const metadata: Metadata = {
  title: "Home page · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/** How the row reports what just happened, in the words of the thing that did it. */
const SAVED: Record<string, string> = {
  add: "Pinned to the home page.",
  remove: "Removed from the home page.",
  up: "Moved up.",
  down: "Moved down.",
  clear: "The list is empty again — the row ranks itself.",
};

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
 */
export default async function AdminHomepagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const term = str(sp.q).slice(0, 80);
  const error = str(sp.error);
  const saved = SAVED[str(sp.saved)];

  /*
    Search only when asked, but always draw the preview: it is the answer to
    "did that do what I wanted", and it has to be there before the first click.

    All three go out together. The pick list used to be awaited first, and the
    search was gated on the `ready` it returned — so the two queries that do
    not depend on it waited for it anyway. A search against a database with no
    picks table returns nothing and is discarded, since the screen renders the
    "not available yet" notice in that state rather than any of this.
  */
  const [{ ready, message, picks }, results, preview] = await Promise.all([
    listHomePicks(),
    term ? searchPickable(term) : Promise.resolve<HomePick[]>([]),
    getBestsellers(8),
  ]);

  const pinnedIds = new Set(picks.map((p) => p.product_id));

  // Carried through every form so a save comes back to the same search.
  const back = term ? `/admin/homepage?q=${encodeURIComponent(term)}` : "/admin/homepage";

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
          {error && (
            <Notice tone="danger" className="mt-6">
              {error}
            </Notice>
          )}
          {saved && !error && (
            <Notice tone="success" className="mt-6">
              {saved} The shop updates within a few seconds.
            </Notice>
          )}

          <Notice tone="info" className="mt-6">
            Pin up to eight. They fill the row from the left in the order below, and whatever
            is left over is filled by the shop&rsquo;s own ranking — best rated first. Pin
            nothing and the whole row is chosen automatically, which is how it worked before.
          </Notice>

          <PickList picks={picks} back={back} />
          <AddSearch
            term={term}
            results={results}
            pinnedIds={pinnedIds}
            full={picks.length >= MAX_HOME_PICKS}
            back={back}
          />
          <ShelfPreview products={preview} pinnedIds={pinnedIds} />
        </>
      )}
    </Container>
  );
}
