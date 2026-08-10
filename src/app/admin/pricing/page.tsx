import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { BulkPriceUpdate, PriceFloorValidation } from "@/components/admin/bulk-pricing";
import { isAdmin } from "@/lib/admin-auth";
import { getCatalogueStatus } from "@/lib/admin-products";

export const metadata: Metadata = {
  title: "Bulk pricing · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  if (!(await isAdmin())) return null;

  const status = await getCatalogueStatus();

  return (
    <Container className="py-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Bulk pricing</h1>
        <p className="mt-1 text-sm text-muted">
          Update many prices at once from a CSV, and check every price against a margin floor.
        </p>
      </div>

      {!status.configured ? (
        <Notice tone="warning" title="Bulk pricing isn’t available" className="mt-6">
          {status.error}
        </Notice>
      ) : (
        <>
          {status.error && (
            <Notice tone="warning" title="Heads up" className="mt-6">
              {status.error}
            </Notice>
          )}
          <div className="mt-8">
            <BulkPriceUpdate />
            <PriceFloorValidation />
          </div>
        </>
      )}
    </Container>
  );
}
