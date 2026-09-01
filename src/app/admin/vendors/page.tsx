import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { VendorDetail, VendorList } from "@/components/admin/vendor-panel";
import { isAdmin } from "@/lib/admin-auth";
import {
  getVendorsStatus,
  listVendorCategories,
  listVendors,
  type VendorCategory,
} from "@/lib/vendors";

export const metadata: Metadata = {
  title: "Vendors · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Vendor provisioning.
 *
 * One route rather than a nested `[id]`, because configuring a vendor is
 * always done while looking at the list — you turn one off, see what it did to
 * the counts, and move on.
 */
export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const sp = await searchParams;
  const selectedId = str(sp.vendor);
  const status = await getVendorsStatus();

  if (!status.ready) {
    return (
      <Container className="py-10">
        <Header />
        <Notice tone="warning" title="Vendors aren’t available yet" className="mt-6">
          {status.error}
        </Notice>
      </Container>
    );
  }

  const vendors = await listVendors();
  const selected = vendors.find((v) => v.id === selectedId) ?? null;

  let categories: VendorCategory[] = [];
  if (selected) categories = await listVendorCategories(selected.id);

  // Preserved through every switch so the redirect lands back on the vendor
  // that was open, not at the top of the list.
  const back = selected ? `/admin/vendors?vendor=${selected.id}` : "/admin/vendors";

  const anyEnabled = vendors.some((v) => v.is_enabled);

  return (
    <Container className="py-10">
      <Header />

      {vendors.length === 0 ? (
        <Notice tone="info" className="mt-6">
          No vendors are configured. Migration 0014 creates one for every supplier already in
          the catalogue, so an empty list usually means the catalogue is empty too.
        </Notice>
      ) : (
        <>
          {!anyEnabled && (
            <Notice tone="danger" title="Every vendor is switched off" className="mt-6">
              The shop is showing nothing but hand-added products right now.
            </Notice>
          )}

          <div className="mt-6">
            <VendorList vendors={vendors} selectedId={selected?.id ?? null} back={back} />
          </div>

          {selected && (
            <VendorDetail vendor={selected} categories={categories} back={back} />
          )}
        </>
      )}
    </Container>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl">Vendors</h1>
      <p className="mt-1 text-sm text-muted">
        Who we buy from, what shoppers see of them, and what their prices become in dinar.
      </p>
    </div>
  );
}
