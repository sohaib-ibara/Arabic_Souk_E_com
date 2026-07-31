import { siteConfig } from "@/lib/config";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { JsonLd } from "@/components/seo/json-ld";

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.legalName,
  url: siteConfig.url,
  description: siteConfig.description,
  email: siteConfig.contact.email,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Manama",
    addressCountry: "BH",
  },
  sameAs: [
    siteConfig.social.instagram,
    siteConfig.social.tiktok,
    siteConfig.social.facebook,
  ],
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  url: siteConfig.url,
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteConfig.url}/shop?search={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

// Storefront chrome (announcement bar, header, footer, cart). Lives here so the
// customer-facing shell wraps every shop route but NOT /admin, which has its own
// layout outside this route group.
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <CartProvider>
      <JsonLd data={[organizationLd, websiteLd]} />
      <AnnouncementBar />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
