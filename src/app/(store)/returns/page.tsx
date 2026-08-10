import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/content/policy-page";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Returns & refunds",
  description: `How to return or exchange an order from ${siteConfig.name}, and how refunds work.`,
  alternates: { canonical: "/returns" },
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      title="Returns & refunds"
      intro="Changed your mind, or something arrived wrong? Here's exactly how it works and how long it takes."
    >
      <h2>The short version</h2>
      <ul>
        <li>You have <strong>14 days</strong> from delivery to request a return.</li>
        <li>Items must be unopened, unused and in their original sealed packaging.</li>
        <li>
          For hygiene reasons, opened beauty products can&rsquo;t be returned unless they are
          faulty.
        </li>
        <li>Refunds land back on your original payment method within 5–10 business days.</li>
      </ul>

      <h2>What can&rsquo;t be returned</h2>
      <p>
        Cosmetics and personal-care products are subject to hygiene rules. We cannot accept a
        return if any of the following apply, unless the item is faulty or was sent in error:
      </p>
      <ul>
        <li>The seal, shrink-wrap or protective cap has been broken.</li>
        <li>The product has been used, swatched or tested.</li>
        <li>It is a gift set with any component opened.</li>
        <li>It was sold as a clearance or final-sale item.</li>
      </ul>

      <h2>How to start a return</h2>
      <ol>
        <li>
          Email <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a> with
          your order number and what you&rsquo;d like to return.
        </li>
        <li>We&rsquo;ll reply within one business day with return instructions.</li>
        <li>
          Pack the item in its original packaging and hand it to our courier at the pickup we
          arrange, or drop it at our Manama address.
        </li>
        <li>
          Once it reaches us we inspect it — usually same day — and issue your refund straight
          away.
        </li>
      </ol>

      <h2>Return shipping costs</h2>
      <table>
        <thead>
          <tr>
            <th>Reason</th>
            <th>Who pays</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Faulty, damaged or wrong item sent</td>
            <td>We do — including collection</td>
          </tr>
          <tr>
            <td>Changed your mind</td>
            <td>You do — deducted from the refund</td>
          </tr>
        </tbody>
      </table>

      <h2>Damaged or incorrect items</h2>
      <p>
        Please check your parcel on arrival. If anything is broken, leaking or not what you
        ordered, email us <strong>within 48 hours</strong> with a photo and we&rsquo;ll replace it
        or refund you in full, including delivery. You won&rsquo;t need to return a leaking item.
      </p>

      <h2>Exchanges</h2>
      <p>
        We don&rsquo;t process direct swaps, because stock moves quickly. Return the original for a
        refund and place a new order — that way you secure the replacement immediately rather than
        waiting for your return to arrive.
      </p>

      <h2>Refund timing</h2>
      <p>
        We refund to your original payment method as soon as the return is inspected. Your bank
        then takes 5–10 business days to show it. Cash-on-delivery orders are refunded by bank
        transfer; we&rsquo;ll ask for your IBAN.
      </p>

      <h2>Cancelling an order</h2>
      <p>
        If your order hasn&rsquo;t shipped yet we can usually cancel it — email us quickly and
        we&rsquo;ll try. Once it&rsquo;s with the courier, treat it as a return.
      </p>

      <p>
        Still stuck? <Link href="/contact">Get in touch</Link> and a person will help.
      </p>
    </PolicyPage>
  );
}
