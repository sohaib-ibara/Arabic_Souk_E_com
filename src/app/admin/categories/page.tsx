import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { setCategoryEnabledAction } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin-auth";
import { listCategorySwitches } from "@/lib/vendors";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Categories · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The shop-wide category switch.
 *
 * Deliberately its own screen rather than a column on /admin/vendors, because
 * it answers a different question. A vendor's category switch decides WHOSE
 * products fill a category. This one decides whether the category is on the
 * shop at all — and turning it off takes the heading, the nav entry and the
 * page with it, not just the products.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const error = str(sp.error);
  const categories = await listCategorySwitches();
  const off = categories.filter((c) => !c.is_enabled);

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Categories</h1>
        <p className="mt-1 text-sm text-muted">
          Which sections the shop has at all.
        </p>
      </div>

      {error && (
        <Notice tone="danger" title="Couldn’t change that" className="mt-6">
          {error}
        </Notice>
      )}

      <Notice tone="info" className="mt-6">
        Switching a category off removes it completely — the heading, the menu entry, its page,
        and every product in it, whichever vendor supplies them. To keep a category but change
        who fills it, use the per-vendor switches in{" "}
        <Link href="/admin/vendors" className="underline">
          Vendors
        </Link>{" "}
        instead.
      </Notice>

      {categories.length === 0 ? (
        <Notice tone="warning" className="mt-6">
          No categories found. If this is unexpected, check that migration 0015 has been run.
        </Notice>
      ) : (
        <>
          {off.length > 0 && (
            <p className="mt-6 text-sm text-muted">
              {off.length} of {categories.length} switched off:{" "}
              {off.map((c) => c.name).join(", ")}.
            </p>
          )}

          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className={cn("truncate", !c.is_enabled && "text-muted line-through")}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.product_count === 0 ? (
                      "no products"
                    ) : c.is_enabled ? (
                      <>
                        {c.listed_count} of {c.product_count} visible
                        {c.vendors_off.length > 0 && (
                          <> · {c.vendors_off.join(", ")} switched off here</>
                        )}
                      </>
                    ) : (
                      <>{c.product_count} products, all hidden with the category</>
                    )}
                  </p>
                </div>

                <form action={setCategoryEnabledAction} className="shrink-0">
                  <input type="hidden" name="category_id" value={c.id} />
                  <input type="hidden" name="enabled" value={c.is_enabled ? "0" : "1"} />
                  <input type="hidden" name="back" value="/admin/categories" />
                  <button
                    type="submit"
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                      c.is_enabled
                        ? "border-line bg-white text-ink hover:border-brand hover:text-brand"
                        : "border-transparent bg-ink text-white hover:opacity-90",
                    )}
                  >
                    {c.is_enabled ? "Turn off" : "Turn on"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
