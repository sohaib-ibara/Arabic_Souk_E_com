import { siteConfig } from "@/lib/config";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SignupTab } from "@/components/layout/signup-tab";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { JsonLd } from "@/components/seo/json-ld";
import { getFooterCategories, getNavGroups } from "@/lib/nav";

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
export default async function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolved here rather than imported as a constant: the menu has to be built
  // from the live catalogue so it can't offer a category that isn't there. The
  // header is a client component, so it takes the result as a prop.
  const [navGroups, footerCategories] = await Promise.all([
    getNavGroups(),
    getFooterCategories(),
  ]);

  return (
    <CartProvider>
      <JsonLd data={[organizationLd, websiteLd]} />
      <AnnouncementBar />
      <Header groups={navGroups} />
      <main className="flex-1">{children}</main>
      <Footer categories={footerCategories} />
      <CartDrawer />
      {/* Both float above the page and below the cart drawer. Only the store
          shell gets them — /admin has its own layout and staff don't need a
          newsletter tab. */}
      <SignupTab />
      <WhatsAppButton />
    </CartProvider>
  );
}
