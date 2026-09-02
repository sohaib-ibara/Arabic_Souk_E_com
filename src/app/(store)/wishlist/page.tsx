import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WishlistView } from "@/components/product/wishlist-view";

export const metadata: Metadata = {
  title: "Saved items",
  description: "The products you saved for later.",
  // Nothing here is the shop's content - it is one visitor's list, held on
  // their own device, and different for every person who opens the URL.
  robots: { index: false, follow: true },
};

export default function WishlistPage() {
  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Saved items" }]} />
      <h1 className="mt-4 font-serif text-3xl sm:text-4xl">Saved items</h1>
      <p className="mt-1 text-sm text-muted">
        Kept on this device, so there is nothing to sign in to.
      </p>
      <WishlistView />
    </Container>
  );
}
