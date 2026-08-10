import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { siteConfig } from "@/lib/config";

// NOTE: template wording for the demo build. Have a Bahraini lawyer review this
// (and the terms) before the store goes live — PDPL Law No. 30 of 2018 applies.
export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${siteConfig.name} collects, uses and protects your personal information.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy policy"
      intro={`This policy explains what ${siteConfig.name} collects when you browse or buy, why we collect it, and the control you have over it.`}
    >
      <h2>Who we are</h2>
      <p>
        {siteConfig.legalName} operates this store from {siteConfig.contact.address}. For any
        privacy question, or to exercise the rights below, email{" "}
        <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong> — your name, email address and password when you
          register. Passwords are hashed by our authentication provider; we never see them.
        </li>
        <li>
          <strong>Order details</strong> — delivery address, phone number and what you bought, so
          we can fulfil and support your order.
        </li>
        <li>
          <strong>Payment details</strong> — card data is entered directly into Stripe&rsquo;s
          hosted fields. It never reaches our servers and we never store card numbers.
        </li>
        <li>
          <strong>Usage data</strong> — pages viewed and items added to your basket, used to fix
          problems and improve the range we stock.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Processing and delivering your order</td>
            <td>Performance of a contract</td>
          </tr>
          <tr>
            <td>Customer support and order updates</td>
            <td>Performance of a contract</td>
          </tr>
          <tr>
            <td>Fraud prevention and account security</td>
            <td>Legitimate interest</td>
          </tr>
          <tr>
            <td>Marketing emails</td>
            <td>Your consent — withdrawable at any time</td>
          </tr>
        </tbody>
      </table>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your personal information. We share only what each provider needs to do its
        job:
      </p>
      <ul>
        <li>
          <strong>Stripe</strong> — payment processing.
        </li>
        <li>
          <strong>Supabase</strong> — database and account authentication.
        </li>
        <li>
          <strong>Delivery partners</strong> — your name, address and phone number, so your parcel
          arrives.
        </li>
      </ul>
      <p>
        We may also disclose information where required by the laws of the Kingdom of Bahrain.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies and similar browser storage to keep you signed in, remember your basket
        between visits, and understand which parts of the store are used. You can clear or block
        cookies in your browser, though the basket and sign-in will stop working if you do.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order records are kept for as long as accounting and tax rules require. Account data is
        kept until you ask us to delete it. Marketing consent is kept until you unsubscribe.
      </p>

      <h2>Your rights</h2>
      <p>
        You may ask us to give you a copy of your data, correct it, delete it, or stop using it for
        marketing. Email{" "}
        <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a> and we will
        respond within 30 days. You can unsubscribe from marketing using the link in any email.
      </p>

      <h2>Security</h2>
      <p>
        The store is served over HTTPS, payments are handled by a PCI-compliant processor, and
        access to customer data is limited to staff who need it. No system is perfectly secure, so
        please use a strong, unique password for your account.
      </p>

      <h2>Children</h2>
      <p>
        This store is not intended for children under 16, and we do not knowingly collect their
        information.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes we will update the date at the top of this page, and tell you by
        email where the change is significant.
      </p>
    </PolicyPage>
  );
}
