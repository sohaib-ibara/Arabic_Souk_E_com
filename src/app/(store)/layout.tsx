import { Suspense } from "react";
import { siteConfig } from "@/lib/config";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SignupTab } from "@/components/layout/signup-tab";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { RegisterPrompt } from "@/components/layout/register-prompt";
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
  /*
    No `sameAs`.

    It listed instagram.com, tiktok.com and facebook.com — the platforms
    themselves, not profiles, because the store has none. `sameAs` is a claim to
    search engines that these are the business's own accounts, so publishing it
    asserted ownership of three sites it does not own. Add the real profile URLs
    here once the accounts exist.
  */
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
      {/* All three float above the page and below the cart drawer. Only the
          store shell gets them — /admin has its own layout and staff need
          none of it. */}
      <SignupTab />
      <WhatsAppButton />
      {/* Takes no session prop on purpose. Resolving one here would mean
          reading a cookie during layout render, which opts all 301 product
          pages out of static generation to decide whether to offer someone an
          account. It asks /api/auth/session-state from the browser instead,
          and only at the moment it would otherwise appear.

          The Suspense boundary is required, not decorative: the component
          reads `useSearchParams` for its preview flag, and without a boundary
          that forces every prerendered page in this layout to bail out to
          client rendering — the build fails outright rather than letting it
          pass quietly. `null` is the honest fallback, since it renders nothing
          until it triggers anyway. */}
      <Suspense fallback={null}>
        <RegisterPrompt />
      </Suspense>
    </CartProvider>
  );
}
