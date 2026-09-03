import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { VendorDetail, VendorList } from "@/components/admin/vendor-panel";
import { isAdmin } from "@/lib/admin-auth";
import { getVendorBoard } from "@/lib/vendors";
import { ShopSections } from "@/components/admin/shop-sections";

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

  /*
    One call, one wave of queries.

    This page used to read in four stages — is the table there, then the
    vendors, then each vendor's categories, then the shop sections — each
    waiting on the one before it, and each re-reading tables the last had
    already fetched. Fourteen queries for a screen that needs five tables.
    Everything it draws now comes back together; see getVendorBoard.
  */
  const { status, vendors, sections } = await getVendorBoard();

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

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

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

          {/*
            Keyed on the vendor, so switching vendor builds a new panel rather
            than re-using the old one.

            Without it React keeps the same component instances: the import
            panel's useActionState held on to the previous vendor's result, and
            the pricing form is uncontrolled, so its defaultValues never
            refreshed. The screen then showed "Cult Beauty" as a heading over
            noon's currency, rate and notes — and pressing Save there would have
            written SAR and 0.1 onto Cult Beauty.
          */}
          {selected && <VendorDetail key={selected.id} vendor={selected} back={back} />}

          {/*
            "What we sell from each vendor" used to sit here — a vendor
            dropdown over fifty-four checkboxes. It was never used once, and
            once Products grew a supplier-then-category browser of its own the
            two were indistinguishable at a glance while doing different
            things. The rule it set now lives on Products, offered as a single
            button at the supplier and category it applies to.
          */}
          {/* The other kind of category switch, kept on the same screen but
              plainly separated. It answers a different question from the ones
              on the cards, and having it on a page of its own is what made the
              two look like duplicates of each other. */}
          <ShopSections sections={sections} back={back} />
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
