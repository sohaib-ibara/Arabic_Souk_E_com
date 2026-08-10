import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/admin/notice";
import { ProductForm } from "@/components/admin/product-form";
import { isAdmin } from "@/lib/admin-auth";
import { getBrandOptions, getCatalogueStatus, getCategoryOptions } from "@/lib/admin-products";

export const metadata: Metadata = {
  title: "Add product · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  if (!(await isAdmin())) return null;

  const status = await getCatalogueStatus();
  if (!status.configured) {
    return (
      <Container className="py-10">
        <h1 className="font-serif text-3xl sm:text-4xl">Add product</h1>
        <Notice tone="warning" title="Catalogue editing isn’t available" className="mt-6">
          {status.error}
        </Notice>
      </Container>
    );
  }

  const [categories, brands] = await Promise.all([getCategoryOptions(), getBrandOptions()]);

  return (
    <Container className="py-10">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        ← Back to products
      </Link>
      <h1 className="mt-3 font-serif text-3xl sm:text-4xl">Add product</h1>
      <p className="mt-1 text-sm text-muted">
        Creates a new product in the Supabase catalogue.
      </p>

      <ProductForm product={null} categories={categories} brands={brands} />
    </Container>
  );
}
