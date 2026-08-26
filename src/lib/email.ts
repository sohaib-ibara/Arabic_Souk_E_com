import { siteConfig } from "./config";
import { formatPrice } from "./format";

/**
 * Transactional email, via Resend's HTTP API.
 *
 * Called over `fetch` rather than through their SDK: one endpoint, one JSON
 * body, and nothing worth a dependency for. Supabase Auth already sends the
 * account-confirmation mail; this covers the messages Supabase knows nothing
 * about, starting with order confirmations.
 *
 * Unconfigured is a supported state. With no RESEND_API_KEY the send is skipped
 * and reported, exactly as checkout degrades without Stripe keys — an order must
 * never fail because a mail server is down or a key hasn't been issued yet.
 *
 * To switch it on:
 *   RESEND_API_KEY   from resend.com
 *   ORDER_EMAIL_FROM "Arabic Souk <orders@yourdomain.com>" — the domain must be
 *                    verified with Resend. Falls back to Resend's shared test
 *                    sender, which only delivers to the account owner.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend's shared sender: fine for a smoke test, useless for real customers. */
const FALLBACK_FROM = "Arabic Souk <onboarding@resend.dev>";

export interface OrderEmailLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderEmail {
  orderNumber: string;
  email: string;
  fullName?: string | null;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: "card" | "cod";
  items: OrderEmailLine[];
  address?: {
    address?: string | null;
    area?: string | null;
    city?: string | null;
    governorate?: string | null;
  } | null;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function addressLines(a: OrderEmail["address"]): string[] {
  if (!a) return [];
  return [a.address, a.area, a.city, a.governorate].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

function renderText(o: OrderEmail): string {
  const money = (n: number) => formatPrice(n, o.currency);
  const lines = o.items.map(
    (li) => `  ${li.quantity} × ${li.name} — ${money(li.unitPrice * li.quantity)}`,
  );
  const addr = addressLines(o.address);

  return [
    `Thank you for your order, ${o.fullName?.split(" ")[0] || "there"}.`,
    "",
    `Order ${o.orderNumber}`,
    "",
    ...lines,
    "",
    `Subtotal: ${money(o.subtotal)}`,
    `Delivery: ${o.shipping === 0 ? "Free" : money(o.shipping)}`,
    `Total: ${money(o.total)}`,
    "",
    o.paymentMethod === "cod"
      ? `Payment: cash on delivery. Please have ${money(o.total)} ready for the courier.`
      : "Payment: paid by card. Nothing further is due.",
    "",
    ...(addr.length ? ["Delivering to:", ...addr.map((l) => `  ${l}`), ""] : []),
    `We deliver across ${siteConfig.country} within ${siteConfig.shipping.etaDays}.`,
    "",
    `${siteConfig.name} — ${siteConfig.url}`,
  ].join("\n");
}

function renderHtml(o: OrderEmail): string {
  const money = (n: number) => esc(formatPrice(n, o.currency));
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:6px 0;color:#6f655f;font-size:14px">${esc(label)}</td>
      <td style="padding:6px 0;text-align:right;font-size:14px${
        strong ? ";font-weight:600;color:#1b1613" : ""
      }">${value}</td>
    </tr>`;

  const items = o.items
    .map(
      (li) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #ece7e0;font-size:14px;color:#1b1613">
        ${esc(li.name)}${li.quantity > 1 ? ` <span style="color:#6f655f">× ${li.quantity}</span>` : ""}
      </td>
      <td style="padding:10px 0;border-top:1px solid #ece7e0;text-align:right;font-size:14px;white-space:nowrap">
        ${money(li.unitPrice * li.quantity)}
      </td>
    </tr>`,
    )
    .join("");

  const addr = addressLines(o.address);

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <p style="margin:0 0 20px;font-size:22px;color:#1b1613">${esc(siteConfig.name)}</p>

    <div style="background:#ffffff;border:1px solid #ece7e0;border-radius:16px;padding:28px">
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#1b1613">Thank you for your order</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#6f655f">
        Order <strong style="color:#1b1613">${esc(o.orderNumber)}</strong> is confirmed.
        We deliver across ${esc(siteConfig.country)} within ${esc(siteConfig.shipping.etaDays)}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:24px">${items}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px solid #ece7e0">
        ${row("Subtotal", money(o.subtotal))}
        ${row("Delivery", o.shipping === 0 ? "Free" : money(o.shipping))}
        ${row("Total", money(o.total), true)}
      </table>

      <div style="margin-top:22px;padding:14px 16px;border-radius:12px;background:${
        o.paymentMethod === "cod" ? "#f0f7fc" : "#f1f8f3"
      };font-size:13px;color:#1b1613">
        ${
          o.paymentMethod === "cod"
            ? `<strong>Cash on delivery.</strong> Please have ${money(o.total)} ready for the courier.`
            : `<strong>Paid by card.</strong> Nothing further is due.`
        }
      </div>

      ${
        addr.length
          ? `<p style="margin:22px 0 0;font-size:13px;color:#6f655f">
               <strong style="color:#1b1613">Delivering to</strong><br>${addr.map(esc).join("<br>")}
             </p>`
          : ""
      }
    </div>

    <p style="margin:20px 0 0;font-size:12px;color:#6f655f;text-align:center">
      Questions? Reply to this email or contact us at ${esc(siteConfig.contact.email)}.
    </p>
  </div>
</body></html>`;
}

/**
 * Sends the confirmation for one order.
 *
 * Never throws: every caller sits behind an order that has already been placed,
 * and losing the email is far better than losing the order.
 */
export async function sendOrderConfirmation(order: OrderEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  if (!order.email) return { ok: false, reason: "no_recipient" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ORDER_EMAIL_FROM || FALLBACK_FROM,
        to: [order.email],
        subject: `Your ${siteConfig.name} order ${order.orderNumber}`,
        html: renderHtml(order),
        text: renderText(order),
      }),
      // A slow mail API must not hold the checkout response open.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === "TimeoutError" ? "timeout" : "network" };
  }
}
