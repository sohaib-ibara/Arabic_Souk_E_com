"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHomePicksAction, searchPickableAction } from "@/app/admin/actions";
import { adminButton } from "@/components/admin/button-styles";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { MAX_HOME_PICKS, type HomePick } from "@/lib/home-picks";

/**
 * Arranging the shop window.
 *
 * One component rather than two, because pinning and searching are one job:
 * you find something, add it, see where it landed, and drag it up. When they
 * were separate forms every click was a round trip and a full page render, the
 * search box lost what you had typed, and the list you were arranging jumped
 * back to the top of the page.
 *
 * The whole list is the unit of saving. Add, remove and reorder all produce
 * "here is what the row should be now", which is what the server takes — see
 * saveHomePicksAction. Each change is applied on screen first and saved behind
 * it, and rolled back if the save fails, so dragging feels like dragging
 * rather than like submitting a form.
 *
 * This screen needs JavaScript, which the form-and-redirect version it
 * replaces did not. A drag gesture has no no-script equivalent, and keeping
 * both would have meant two ways to edit the same row, only one of which
 * anybody tests. Everything a drag does is also on a button, so the cost is
 * to a browser with scripting off rather than to keyboard or screen-reader
 * users.
 */

const DEBOUNCE_MS = 250;

export function HomeShelfEditor({ initialPicks }: { initialPicks: HomePick[] }) {
  const router = useRouter();

  const [picks, setPicks] = useState<HomePick[]>(initialPicks);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  /*
    Take a newly rendered list from the server, unless we are mid-save.

    `initialPicks` is a fresh array on every server render, so this fires after
    each router.refresh() and keeps the two in step — including when somebody
    else has changed the row in another tab. Adjusting state during render
    rather than in an effect is deliberate: an effect would paint the stale
    list first, and the lint rule that forbids setState in an effect body is
    pointing at exactly this.

    While a save is in flight the server's answer is one we already know is out
    of date, so it is consumed and dropped. The refresh that follows the save
    brings the authoritative version.
  */
  const [lastFromServer, setLastFromServer] = useState(initialPicks);
  if (initialPicks !== lastFromServer) {
    setLastFromServer(initialPicks);
    if (!saving) setPicks(initialPicks);
  }

  const full = picks.length >= MAX_HOME_PICKS;
  const pinnedIds = new Set(picks.map((p) => p.product_id));

  /**
   * Show it, then save it, and put it back if the save fails.
   *
   * The screen is the optimistic copy and `picks` before the change is the
   * rollback. A refresh follows a successful save so the preview underneath —
   * which is rendered on the server by the same function the shop uses —
   * catches up.
   */
  const commit = useCallback(
    (next: HomePick[]) => {
      const previous = picks;
      setPicks(next);
      setError(null);

      startSaving(async () => {
        const result = await saveHomePicksAction(next.map((p) => p.product_id));
        if (!result.ok) {
          setPicks(previous);
          setError(result.error);
          return;
        }
        router.refresh();
      });
    },
    [picks, router],
  );

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= picks.length) return;
    const next = picks.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  const remove = (id: string) => commit(picks.filter((p) => p.product_id !== id));

  const add = (pick: HomePick) => {
    if (full || pinnedIds.has(pick.product_id)) return;
    commit([...picks, pick]);
  };

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <PinnedList
        picks={picks}
        saving={saving}
        onMove={move}
        onRemove={remove}
        onClear={() => commit([])}
      />

      <AddPanel full={full} pinnedIds={pinnedIds} onAdd={add} />
    </>
  );
}

/* --------------------------------- pinned -------------------------------- */

function PinnedList({
  picks,
  saving,
  onMove,
  onRemove,
  onClear,
}: {
  picks: HomePick[];
  saving: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  /** The row being dragged, and the gap it would drop into. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const free = MAX_HOME_PICKS - picks.length;
  const slots = free === 1 ? "slot" : "slots";

  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">
            Your picks
            {saving && <span className="ml-2 text-xs font-normal text-muted">Saving…</span>}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {picks.length === 0
              ? "Nothing pinned. The row ranks itself."
              : `${picks.length} pinned, ${free} ${slots} left. Drag a card to reorder — it saves as you drop it.`}
          </p>
        </div>
        {picks.length > 0 && (
          <button type="button" onClick={onClear} className={adminButton("quiet", "sm")}>
            Clear the list
          </button>
        )}
      </div>

      {picks.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line py-10 text-center">
          <p className="text-sm text-muted">
            Search below and press Add to put a product at the front of the home page.
          </p>
        </div>
      ) : (
        <ol className="mt-4">
          {picks.map((p, i) => {
            const problem = !p.is_listed
              ? "Hidden from the shop, so the row skips it."
              : !p.in_stock
                ? "Out of stock, so the row skips it until it is back."
                : null;

            return (
              <li
                key={p.product_id}
                draggable
                onDragStart={(e) => {
                  setDragging(i);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox refuses to start a drag without payload, and the
                  // index is in component state, so the value is a formality.
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  // Without preventDefault the browser treats this as a place
                  // where nothing may be dropped, and onDrop never fires.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== i) setOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null) onMove(dragging, i);
                  endDrag();
                }}
                onDragEnd={endDrag}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-transparent px-2 py-3 transition-colors",
                  "border-b-line [&:not(:last-child)]:border-b",
                  dragging === i && "opacity-40",
                  over === i && dragging !== i && "border-brand bg-brand/5",
                )}
              >
                <span
                  aria-hidden
                  title="Drag to reorder"
                  className="cursor-grab select-none px-1 text-base leading-none text-muted active:cursor-grabbing"
                >
                  ⠿
                </span>

                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    problem ? "bg-sand text-muted" : "bg-brand text-white",
                  )}
                >
                  {i + 1}
                </span>

                <Thumb src={p.image} alt={p.name} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{formatPrice(p.price)}</span>
                    <VendorTag vendor={p.vendor} />
                  </p>
                  {problem && <p className="mt-0.5 text-xs text-amber-700">{problem}</p>}
                </div>

                {/* Kept alongside the drag handle, not replaced by it. A drag
                    is unreachable from a keyboard and awkward on a phone. */}
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Move ${p.name} up`}
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${p.name} down`}
                    disabled={i === picks.length - 1}
                    onClick={() => onMove(i, i + 1)}
                  >
                    ↓
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => onRemove(p.product_id)}
                    aria-label={`Remove ${p.name} from the home page`}
                    className={adminButton("quiet", "sm")}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* --------------------------------- search -------------------------------- */

/**
 * Find something to pin, while you type.
 *
 * It was a form with a Search button, which meant a page load to see whether
 * you had spelled the product right. Results now arrive as the words are
 * typed, and each one says which supplier it came from — two of them stock
 * near-identical products under near-identical names, and the name alone does
 * not say which is which.
 */
function AddPanel({
  full,
  pinnedIds,
  onAdd,
}: {
  full: boolean;
  pinnedIds: Set<string>;
  onAdd: (pick: HomePick) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<HomePick[]>([]);
  const [searching, setSearching] = useState(false);
  /** True once a search for the current term has come back. */
  const [answered, setAnswered] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
    Which request is the current one.

    Replies can arrive out of order — "mas" can come back after "mascara" and
    would then overwrite it with results for a prefix of what is on screen.
    Every request takes a number and only the newest is allowed to render.
  */
  const latest = useRef(0);

  const run = (value: string) => {
    setTerm(value);
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (!trimmed) {
      latest.current += 1;
      setResults([]);
      setSearching(false);
      setAnswered(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(async () => {
      const ticket = (latest.current += 1);
      const found = await searchPickableAction(trimmed);
      if (ticket !== latest.current) return;
      setResults(found);
      setSearching(false);
      setAnswered(true);
    }, DEBOUNCE_MS);
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium">Add a product</h2>
      <p className="mt-1 text-sm text-muted">
        Start typing a product name. Only products that are live on the shop can be pinned.
      </p>

      <div className="relative mt-4">
        <input
          type="search"
          value={term}
          onChange={(e) => run(e.target.value)}
          placeholder="e.g. Cicaplast, oud, mascara"
          aria-label="Search products to pin"
          autoComplete="off"
          className="w-full rounded-full border border-line bg-white px-4 py-2.5 pr-24 text-sm outline-none focus:border-brand"
        />
        {searching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
            Searching…
          </span>
        )}
      </div>

      {full && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The row holds {MAX_HOME_PICKS}. Remove one above before adding another.
        </p>
      )}

      {answered && !searching && results.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nothing live on the shop matches that. A hidden product will not appear here — list
          it on the Products page first.
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-4">
          {results.map((p) => {
            const pinned = pinnedIds.has(p.product_id);
            return (
              <li
                key={p.product_id}
                className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
              >
                <Thumb src={p.image} alt={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{formatPrice(p.price)}</span>
                    <VendorTag vendor={p.vendor} />
                    {!p.in_stock && <span className="text-amber-700">out of stock</span>}
                  </p>
                </div>
                {pinned ? (
                  <span className="shrink-0 text-xs font-medium text-brand">Pinned</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(p)}
                    disabled={full}
                    className={adminButton("secondary", "sm")}
                  >
                    Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------- fragments ------------------------------- */

/** One 56px tile, used in every section so the rows line up. */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
      <ProductImage src={src} alt={alt} width={56} height={56} className="h-14 w-14 object-cover" />
    </div>
  );
}

/**
 * Who supplies this, for staff only.
 *
 * Never rendered anywhere a shopper can reach — `products.source` is not
 * granted to the anon role, so it is only ever populated on admin queries.
 */
function VendorTag({ vendor }: { vendor: string | null }) {
  if (!vendor) return <span className="text-muted/80">added by hand</span>;
  return (
    <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-ink/70">
      {vendor}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={adminButton("secondary", "sm")}
    >
      {children}
    </button>
  );
}
