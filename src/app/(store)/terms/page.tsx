import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/content/policy-page";
import { siteConfig } from "@/lib/config";

// NOTE: template wording for the demo build — have it reviewed by a Bahraini
// lawyer before launch.
export const metadata: Metadata = {
  title: "Terms & conditions",
  description: `The terms that apply when you shop with ${siteConfig.name}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms & conditions"
      intro={`These terms govern your use of ${siteConfig.name} and any order you place with us. By using the store, you accept them.`}
    >
      <h2>1. About us</h2>
      <p>
        This store is operated by {siteConfig.legalName}, {siteConfig.contact.address}. In these
        terms, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean {siteConfig.legalName}, and
        &ldquo;you&rdquo; means the person using the store.
      </p>

      <h2>2. Using the store</h2>
      <p>
        You must be at least 18, or have the permission of a parent or guardian, to place an order.
        You agree not to misuse the store — including attempting to gain unauthorised access,
        scraping the catalogue, or interfering with its operation.
      </p>

      <h2>3. Your account</h2>
      <p>
        You&rsquo;re responsible for keeping your password confidential and for activity under your
        account. Tell us immediately if you believe someone else has accessed it. We may suspend an
        account we reasonably believe is being used fraudulently.
      </p>

      <h2>4. Products and descriptions</h2>
      <p>
        We describe every product as accurately as we can, but colours can vary between screens and
        manufacturers occasionally change formulations or packaging without notice. Products are
        cosmetics, not medicines — always patch-test and read the ingredient list if you have
        sensitivities.
      </p>

      <h2>5. Prices</h2>
      <p>
        All prices are in Bahraini Dinar ({siteConfig.currency}) and include applicable VAT.
        Delivery is charged separately as set out on our{" "}
        <Link href="/shipping">shipping page</Link>. We may change prices at any time, but a change
        never affects an order we have already accepted.
      </p>
      <p>
        If a product is listed at an obviously incorrect price because of a clerical error, we may
        cancel the order and refund you in full rather than fulfil it at that price.
      </p>

      <h2>6. Orders</h2>
      <p>
        Your order is an offer to buy. A contract forms only when we send you an email confirming
        the order has been dispatched. We may decline an order if the item is out of stock, we
        can&rsquo;t verify payment, or we can&rsquo;t deliver to your address.
      </p>

      <h2>7. Payment</h2>
      <p>
        We accept the cards shown at checkout, and cash on delivery within {siteConfig.country}.
        Card payments are processed by Stripe; we never receive or store your card number. Title in
        the goods passes to you on full payment.
      </p>

      <h2>8. Delivery</h2>
      <p>
        Delivery estimates are estimates, not guarantees. Risk in the goods passes to you on
        delivery. See <Link href="/shipping">shipping &amp; delivery</Link> for full details.
      </p>

      <h2>9. Returns</h2>
      <p>
        Your return rights, including the hygiene exclusions that apply to opened cosmetics, are
        set out in our <Link href="/returns">returns &amp; refunds policy</Link>, which forms part
        of these terms.
      </p>

      <h2>10. Intellectual property</h2>
      <p>
        The store&rsquo;s design, text, photography and logos belong to us or our licensors. Brand
        names and product imagery remain the property of their respective owners. You may not
        reproduce any of it commercially without written permission.
      </p>

      <h2>11. Liability</h2>
      <p>
        Nothing in these terms limits liability for death or personal injury caused by negligence,
        or for fraud. Subject to that, our total liability for any order is limited to the amount
        you paid for it, and we are not liable for indirect or consequential loss.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of the Kingdom of {siteConfig.country}, and the courts
        of {siteConfig.country} have exclusive jurisdiction over any dispute.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>.
      </p>
    </PolicyPage>
  );
}
