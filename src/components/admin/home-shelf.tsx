import { homePickAction } from "@/app/admin/actions";
import { adminButton } from "@/components/admin/button-styles";
import { SubmitButton } from "@/components/admin/submit-button";
import { ProductImage } from "@/components/ui/product-image";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { MAX_HOME_PICKS, type HomePick } from "@/lib/home-picks";
import type { Product } from "@/lib/types";

/**
 * Arranging the shop window.
 *
 * Three parts, in the order somebody works through them: what is pinned now,
 * how to pin something else, and what the home page will actually show. The
 * third is the one that matters — the row is eight cards, the picks are usually
 * fewer, and without seeing the join nobody can tell where their choices stop
 * and the automatic ranking starts.
 *
 * Every button saves as it is pressed. There is no Save at the bottom, and that
 * is deliberate: the preview underneath would otherwise be showing a home page
 * that does not exist yet.
 */

/** One 56px tile, used in every section so the rows line up. */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
      <ProductImage
        src={src}
        alt={alt}
        width={56}
        height={56}
        className="h-14 w-14 object-cover"
      />
    </div>
  );
}

/**
 * A one-field form posting a single verb. Every button on a row gets its own,
 * because a form inside a form is not allowed.
 */
function PickForm({
  intent,
  productId,
  back,
  children,
  pendingLabel,
  variant = "secondary",
  disabled,
  title,
  ariaLabel,
}: {
  intent: "add" | "remove" | "up" | "down" | "clear";
  productId?: string;
  back: string;
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <form action={homePickAction}>
      <input type="hidden" name="intent" value={intent} />
      {productId && <input type="hidden" name="product_id" value={productId} />}
      <input type="hidden" name="back" value={back} />
      <SubmitButton
        variant={variant}
        size="sm"
        disabled={disabled}
        pendingLabel={pendingLabel}
        title={title}
        aria-label={ariaLabel}
      >
        {children}
      </SubmitButton>
    </form>
  );
}

export function PickList({ picks, back }: { picks: HomePick[]; back: string }) {
  const free = MAX_HOME_PICKS - picks.length;
  const slots = free === 1 ? "slot" : "slots";

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Your picks</h2>
          <p className="mt-1 text-sm text-muted">
            {picks.length === 0
              ? "Nothing pinned. The row ranks itself."
              : `${picks.length} pinned, ${free} ${slots} left. They appear in this order.`}
          </p>
        </div>
        {picks.length > 0 && (
          <PickForm intent="clear" back={back} variant="quiet" pendingLabel="Clearing">
            Clear the list
          </PickForm>
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
                className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
              >
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
                  <p className="text-xs text-muted">{formatPrice(p.price)}</p>
                  {problem && <p className="mt-0.5 text-xs text-amber-700">{problem}</p>}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <PickForm
                    intent="up"
                    productId={p.product_id}
                    back={back}
                    disabled={i === 0}
                    title="Move up"
                    ariaLabel={`Move ${p.name} up`}
                  >
                    &uarr;
                  </PickForm>
                  <PickForm
                    intent="down"
                    productId={p.product_id}
                    back={back}
                    disabled={i === picks.length - 1}
                    title="Move down"
                    ariaLabel={`Move ${p.name} down`}
                  >
                    &darr;
                  </PickForm>
                  <PickForm
                    intent="remove"
                    productId={p.product_id}
                    back={back}
                    variant="quiet"
                    pendingLabel="Removing"
                    ariaLabel={`Remove ${p.name} from the home page`}
                  >
                    Remove
                  </PickForm>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * Find something to pin.
 *
 * A search rather than a list of the whole catalogue: there are hundreds of
 * listed products and nobody scrolls to the one they had in mind. It returns
 * listed products only — pinning something a shopper cannot see produces a row
 * that quietly ignores the choice, with nothing on screen to explain why.
 */
export function AddSearch({
  term,
  results,
  pinnedIds,
  full,
  back,
}: {
  term: string;
  results: HomePick[];
  pinnedIds: Set<string>;
  /** True when the list is at MAX_HOME_PICKS and nothing more will fit. */
  full: boolean;
  back: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium">Add a product</h2>
      <p className="mt-1 text-sm text-muted">
        Search by name. Only products that are live on the shop can be pinned.
      </p>

      {/* A plain GET, so a search is a URL that can be reloaded or shared. */}
      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={term}
          placeholder="e.g. Cicaplast, oud, mascara"
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className={adminButton("secondary")}>
          Search
        </button>
      </form>

      {full && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The row holds {MAX_HOME_PICKS}. Remove one above before adding another.
        </p>
      )}

      {term && results.length === 0 && (
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
                  <p className="text-xs text-muted">
                    {formatPrice(p.price)}
                    {!p.in_stock && " · out of stock"}
                  </p>
                </div>
                {pinned ? (
                  <span className="shrink-0 text-xs font-medium text-brand">Pinned</span>
                ) : (
                  <PickForm
                    intent="add"
                    productId={p.product_id}
                    back={back}
                    disabled={full}
                    pendingLabel="Adding"
                  >
                    Add
                  </PickForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The row exactly as a shopper will see it.
 *
 * Built by the same function the home page calls, so it cannot drift from it.
 * The tags are the point: they show where the picks run out and the ranking
 * takes over, which is the one thing a numbered list of picks cannot say.
 */
export function ShelfPreview({
  products,
  pinnedIds,
}: {
  products: Product[];
  pinnedIds: Set<string>;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium">What the home page shows right now</h2>
      <p className="mt-1 text-sm text-muted">
        Left to right, then wrapping — the same order as the Bestsellers row on the shop.
      </p>

      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products.map((p, i) => {
          const pinned = pinnedIds.has(p.id);
          return (
            <li key={p.id} className="rounded-xl border border-line p-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-sand">
                <ProductImage
                  src={p.images[0] ?? null}
                  alt={p.name}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[10px] font-medium">
                  {i + 1}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs">{p.name}</p>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  pinned ? "font-medium text-brand" : "text-muted",
                )}
              >
                {pinned ? "Pinned by you" : "Chosen automatically"}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
