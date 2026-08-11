import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ProductForm } from "@/components/admin/product-form";
import { isAdmin } from "@/lib/admin-auth";
import { formatDateTime } from "@/lib/format";
import { getAdminProduct, getBrandOptions, getCategoryOptions } from "@/lib/admin-products";

export const metadata: Metadata = {
  title: "Edit product · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  if (!(await isAdmin())) return null;

  const { id } = await params;
  const sp = await searchParams;

  const product = await getAdminProduct(id);
  if (!product) notFound();

  const [categories, brands] = await Promise.all([getCategoryOptions(), getBrandOptions()]);

  return (
    <Container className="py-10">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        ← Back to products
      </Link>
      <h1 className="mt-3 font-serif text-3xl sm:text-4xl">{product.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {product.slug}
        {product.updated_at && <> · last updated {formatDateTime(product.updated_at)}</>}
      </p>

      <ProductForm
        product={product}
        categories={categories}
        brands={brands}
        justCreated={sp.created === "1"}
      />
    </Container>
  );
}
