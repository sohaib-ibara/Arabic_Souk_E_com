import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/content/policy-page";
import { siteConfig } from "@/lib/config";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Shipping & delivery",
  description: `Delivery times, fees and coverage for ${siteConfig.name} across ${siteConfig.country}.`,
  alternates: { canonical: "/shipping" },
};

export default function ShippingPage() {
  const { freeThreshold, standardFee, etaDays } = siteConfig.shipping;

  return (
    <PolicyPage
      title="Shipping & delivery"
      intro={`We deliver across ${siteConfig.country}, usually within ${etaDays}.`}
    >
      <h2>Rates</h2>
      <table>
        <thead>
          <tr>
            <th>Order value</th>
            <th>Delivery fee</th>
            <th>Arrives in</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{formatPrice(freeThreshold)} and above</td>
            <td>
              <strong>Free</strong>
            </td>
            <td>{etaDays}</td>
          </tr>
          <tr>
            <td>Under {formatPrice(freeThreshold)}</td>
            <td>{formatPrice(standardFee)}</td>
            <td>{etaDays}</td>
          </tr>
        </tbody>
      </table>

      <h2>Where we deliver</h2>
      <p>
        Every governorate in {siteConfig.country} — Capital, Muharraq, Northern and Southern —
        including Manama, Riffa, Muharraq, Hamad Town, A&rsquo;ali, Isa Town, Sitra and Budaiya. We
        don&rsquo;t ship outside the Kingdom at the moment.
      </p>

      <h2>Order cut-off</h2>
      <p>
        Orders placed before <strong>3:00 pm</strong> Sunday to Thursday are picked and dispatched
        the same day. Orders placed after that, or on Friday and Saturday, go out on the next
        working day.
      </p>

      <h2>Tracking your order</h2>
      <p>
        You&rsquo;ll get an email confirmation as soon as your payment clears, and a second message
        when the parcel is handed to the courier. You can see the current status of every order in{" "}
        <Link href="/account">your account</Link> at any time.
      </p>

      <h2>Delivery attempts</h2>
      <p>
        Our courier calls the number on your order before arriving. If nobody is available they
        will try once more the next working day. After two failed attempts the parcel returns to us
        and we&rsquo;ll contact you to arrange redelivery or a refund.
      </p>

      <h2>Payment on delivery</h2>
      <p>
        Cash on delivery is available across {siteConfig.country}. Please have the exact amount
        ready — couriers may not carry change for large notes.
      </p>

      <h2>Packaging</h2>
      <p>
        Fragrances and glass bottles are wrapped and boxed with protective filling. If anything
        arrives damaged, photograph it and contact us within 48 hours — see{" "}
        <Link href="/returns">returns &amp; refunds</Link>.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a> or call{" "}
        <a href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}>
          {siteConfig.contact.phone}
        </a>
        .
      </p>
    </PolicyPage>
  );
}
