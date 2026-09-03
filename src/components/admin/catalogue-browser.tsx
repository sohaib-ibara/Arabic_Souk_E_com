import Link from "next/link";
import { SubmitButton } from "@/components/admin/submit-button";
import { cn } from "@/lib/cn";
import type { Option, Tally } from "@/lib/admin-products";

/**
 * Getting to a handful of products from a catalogue of several hundred.
 *
 * The screen opened on page 1 of 547 rows with four dropdowns above it, and
 * the job nobody could do from that was the ordinary one: "what have we got
 * from Cult Beauty in skin cleansers, and which of it is live". You could
 * assemble it — pick the supplier, pick the category, press Filter — but
 * nothing on the page told you those two questions were related, or how many
 * products were waiting behind either answer.
 *
 * So the two filters that form a hierarchy are drawn as one: suppliers, then
 * that supplier's categories, then the table. They still set the same `source`
 * and `category` query parameters the table has always read, so every
 * operation below — search, bulk list and hide, paging, edit — is unchanged
 * and works on exactly the selection shown here.
 *
 * Both rows always show counts, because the count is the answer to half the
 * questions people bring to this screen, and "Skin Cleansers 0" is worth
 * seeing rather than hiding.
 */

/** Preserves search and visibility while changing where in the tree we are. */
function browseHref(params: {
  search?: string;
  visibility?: string;
  source?: string;
  categoryId?: string;
}) {
  const p = new URLSearchParams();
  if (params.search) p.set("search", params.search);
  if (params.visibility) p.set("visibility", params.visibility);
  if (params.source) p.set("source", params.source);
  if (params.categoryId) p.set("category", params.categoryId);
  const qs = p.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

export function CatalogueBrowser({
  sources,
  byVendor,
  vendorNames,
  vendorIds,
  rulesOff,
  categories,
  source,
  categoryId,
  search,
  visibility,
  total,
  ruleAction,
}: {
  sources: Array<{ key: string } & Tally>;
  byVendor: Record<string, Record<string, Tally>>;
  /** Supplier key to display name, straight from the vendors table. */
  vendorNames: Record<string, string>;
  /** Supplier key to vendor row id, for the standing-rule form. */
  vendorIds: Record<string, string>;
  /** Standing rules in force, keyed `<supplier>:<category>`. */
  rulesOff: Record<string, true>;
  categories: Option[];
  source: string;
  categoryId: string;
  search: string;
  visibility: string;
  /** Every product in the catalogue, for the "All suppliers" card. */
  total: number;
  /** Server action behind the standing-rule switch. */
  ruleAction: (formData: FormData) => void | Promise<void>;
}) {
  const allListed = sources.reduce((n, s) => n + s.listed, 0);
  const label = (key: string) => vendorNames[key] ?? key;

  /*
    The categories this supplier actually stocks, in the shop's own order.

    Only the ones with products: a supplier's screen listing all 40 aisles with
    38 of them empty is the same wall of nothing the dropdown was. The one
    exception is the category currently selected — if a bulk hide has just
    emptied it, it has to stay on screen, or the page you are looking at
    vanishes from the navigation while you are standing on it.
  */
  const counts = byVendor[source] ?? {};
  const shown = categories.filter((c) => counts[c.id]?.count || c.id === categoryId);
  const uncategorised = counts[""];

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <Breadcrumb
        source={source}
        sourceName={source ? label(source) : ""}
        categoryId={categoryId}
        categories={categories}
        search={search}
        visibility={visibility}
      />

      <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted">Supplier</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <VendorCard
          label="All suppliers"
          count={total}
          listed={allListed}
          active={!source}
          href={browseHref({ search, visibility })}
        />
        {sources.map((s) => (
          <VendorCard
            key={s.key}
            label={label(s.key)}
            count={s.count}
            listed={s.listed}
            active={source === s.key}
            // Changing supplier drops the category: a category id from one
            // supplier's shelf usually matches nothing on another's, and
            // landing on an empty table reads as a fault.
            href={browseHref({ search, visibility, source: s.key })}
          />
        ))}
      </div>

      <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-muted">
        Category
        {source && <span className="ml-1.5 normal-case tracking-normal">in {label(source)}</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip
          label="All categories"
          active={!categoryId}
          href={browseHref({ search, visibility, source })}
        />
        {shown.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            count={counts[c.id]?.count ?? 0}
            active={categoryId === c.id}
            href={browseHref({ search, visibility, source, categoryId: c.id })}
          />
        ))}
        {uncategorised?.count ? (
          <span
            title="These have no category, so the shop cannot show them. Give them one on the product's own page."
            className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
          >
            No category · {uncategorised.count}
          </span>
        ) : null}
      </div>

      {shown.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          Nothing from this supplier has a category yet.
        </p>
      )}

      {/*
        The standing rule, offered where the context for it already is.

        This used to be a panel of fifty-four checkboxes on the Vendors screen
        called "What we sell from each vendor", which looked exactly like the
        supplier-then-category navigation here and was never once used — the
        vendor_categories table had no rows in it. It was not the same thing as
        the bulk Hide below, though, and deleting it outright would have taken
        the difference with it:

          Hide from storefront  — these 23 products, now.
          The rule below        — this supplier's products in this category,
                                  including the ones imported next week.

        Only shown standing at a supplier AND a category, because that pair is
        the whole of what the rule is about. Not offered for hand-added stock:
        those products have no vendor, so no vendor switch can reach them (see
        compute_is_listed in migration 0015).
      */}
      {source && source !== "none" && categoryId && vendorIds[source] && (
        <StandingRule
          vendorId={vendorIds[source]}
          vendorName={label(source)}
          categoryId={categoryId}
          categoryName={categories.find((c) => c.id === categoryId)?.name ?? "this category"}
          count={counts[categoryId]?.count ?? 0}
          off={Boolean(rulesOff[`${source}:${categoryId}`])}
          back={browseHref({ search, visibility, source, categoryId })}
          action={ruleAction}
        />
      )}
    </section>
  );
}

function StandingRule({
  vendorId,
  vendorName,
  categoryId,
  categoryName,
  count,
  off,
  back,
  action,
}: {
  vendorId: string;
  vendorName: string;
  categoryId: string;
  categoryName: string;
  count: number;
  /** True when a rule is already holding these products off the shop. */
  off: boolean;
  back: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      className={cn(
        "mt-5 rounded-xl border p-4",
        off ? "border-amber-200 bg-amber-50" : "border-line bg-sand/40",
      )}
    >
      <input type="hidden" name="vendor_id" value={vendorId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="enabled" value={off ? "1" : "0"} />
      <input type="hidden" name="back" value={back} />

      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Standing rule</p>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <p className={cn("text-sm", off ? "text-amber-900" : "text-ink")}>
          {off ? (
            <>
              <strong>{vendorName}</strong>&rsquo;s {categoryName} products are held off the shop,
              whatever each one&rsquo;s own switch says.
            </>
          ) : (
            <>
              You sell <strong>{vendorName}</strong>&rsquo;s {categoryName} products.
            </>
          )}
        </p>

        <SubmitButton
          variant={off ? "primary" : "secondary"}
          size="sm"
          pendingLabel={off ? "Switching on" : "Switching off"}
        >
          {off ? `Sell ${vendorName}'s ${categoryName} again` : `Stop selling these`}
        </SubmitButton>
      </div>

      <p className="mt-2 text-xs text-muted">
        {off
          ? "Lifting this puts back only the ones that were listed before — each product still has its own switch."
          : `Hides ${count === 1 ? "this product" : `all ${count}`} and anything ${vendorName} adds to ${categoryName} later, until you switch it back. To hide only some of them, tick the ones you mean in the table below instead.`}
      </p>
    </form>
  );
}

function Breadcrumb({
  source,
  sourceName,
  categoryId,
  categories,
  search,
  visibility,
}: {
  source: string;
  sourceName: string;
  categoryId: string;
  categories: Option[];
  search: string;
  visibility: string;
}) {
  const category = categories.find((c) => c.id === categoryId);

  return (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1.5 text-sm">
      {source || categoryId ? (
        <Link href={browseHref({ search, visibility })} className="text-brand hover:underline">
          All products
        </Link>
      ) : (
        <span className="font-medium">All products</span>
      )}

      {source && (
        <>
          <span className="text-muted">›</span>
          {categoryId ? (
            <Link
              href={browseHref({ search, visibility, source })}
              className="text-brand hover:underline"
            >
              {sourceName}
            </Link>
          ) : (
            <span className="font-medium">{sourceName}</span>
          )}
        </>
      )}

      {category && (
        <>
          <span className="text-muted">›</span>
          <span className="font-medium">{category.name}</span>
        </>
      )}
    </nav>
  );
}

function VendorCard({
  label,
  count,
  listed,
  active,
  href,
}: {
  label: string;
  count: number;
  listed: number;
  active: boolean;
  href: string;
}) {
  const hidden = count - listed;
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        active ? "border-brand bg-brand/5" : "border-line hover:border-brand/40 hover:bg-sand/50",
      )}
    >
      <p className={cn("truncate text-sm", active && "font-medium")}>{label}</p>
      <p className="mt-0.5 font-serif text-2xl">{count}</p>
      <p className="text-xs text-muted">
        {count === 0 ? "nothing yet" : hidden === 0 ? "all listed" : `${hidden} hidden`}
      </p>
    </Link>
  );
}

function Chip({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count?: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-line hover:border-brand/40 hover:bg-sand",
      )}
    >
      {label}
      {count != null && (
        <span className={cn("ml-1.5 text-xs", active ? "text-white/70" : "text-muted")}>
          {count}
        </span>
      )}
    </Link>
  );
}
