import nodemailer from "nodemailer";
import { siteConfig } from "./config";
import { formatPrice } from "./format";

/**
 * Transactional email, over SMTP.
 *
 * Supabase Auth already sends the account-confirmation mail; this covers the
 * messages Supabase knows nothing about, starting with order confirmations.
 *
 * SMTP rather than a provider's own HTTP API because it's the one interface
 * every provider speaks. Gmail and Google Workspace today; Resend, SES or
 * Postmark later by changing four environment variables and touching no code.
 *
 * Unconfigured is a supported state. With no credentials the send is skipped
 * and reported, exactly as checkout degrades without Stripe keys — an order
 * must never fail because a mail server is down or a key hasn't been issued.
 *
 * To switch it on:
 *   SMTP_USER        the mailbox to send as
 *   SMTP_PASS        an app password, NOT the account password
 *   SMTP_HOST/PORT   optional; defaults to Gmail on implicit TLS
 *   ORDER_EMAIL_FROM optional display name; defaults to the store name at
 *                    SMTP_USER. Gmail rewrites this to the authenticated
 *                    mailbox unless the address is a verified alias, so
 *                    inventing a from-address it doesn't own achieves nothing.
 */

const DEFAULT_HOST = "smtp.gmail.com";
/** Implicit TLS. 587 (STARTTLS) also works if a network blocks 465. */
const DEFAULT_PORT = 465;
/** A slow mail server must not hold a checkout response open. */
const SMTP_TIMEOUT_MS = 10_000;

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
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Who the message is from. See the note above on why Gmail may override this. */
function sender(user: string): string {
  return process.env.ORDER_EMAIL_FROM || `${siteConfig.name} <${user}>`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function addressLines(a: OrderEmail["address"]): string[] {
  if (!a) return [];
  return [a.address, a.area, a.city, a.governorate].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

/** Where this order can be checked on later. The number is prefilled. */
function trackUrl(orderNumber: string): string {
  return `${siteConfig.url}/track?order=${encodeURIComponent(orderNumber)}`;
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
    // This email is where someone comes back to days later, so it carries the
    // way to check on the order rather than assuming they'll find the site.
    `Track your order: ${trackUrl(o.orderNumber)}`,
    `(You'll need this order number and this email address.)`,
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

      <div style="margin-top:26px;padding-top:22px;border-top:1px solid #ece7e0;text-align:center">
        <a href="${esc(trackUrl(o.orderNumber))}"
           style="display:inline-block;padding:13px 30px;border-radius:999px;background:#1b1613;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none">
          Track your order
        </a>
        <p style="margin:12px 0 0;font-size:12px;color:#6f655f">
          Check on this order any time with your order number and this email address.
        </p>
      </div>
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
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { ok: false, reason: "not_configured" };
  if (!order.email) return { ok: false, reason: "no_recipient" };

  const port = Number(process.env.SMTP_PORT || DEFAULT_PORT);

  try {
    // Built per send rather than pooled: on Vercel each invocation is its own
    // short-lived process, so a pooled connection has nothing to be reused by.
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || DEFAULT_HOST,
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS on 587
      auth: { user, pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });

    await transport.sendMail({
      from: sender(user),
      to: order.email,
      // Replies belong with whoever reads the shop's mail, which need not be
      // the mailbox doing the sending.
      replyTo: siteConfig.contact.email,
      subject: `Your ${siteConfig.name} order ${order.orderNumber}`,
      text: renderText(order),
      html: renderHtml(order),
    });

    return { ok: true };
  } catch (e) {
    // Surfaced rather than swallowed: bad credentials and a blocked port look
    // identical from the outside, and the difference is the whole diagnosis.
    const err = e as { code?: string; responseCode?: number; message?: string };
    return {
      ok: false,
      reason: err.code || (err.responseCode ? `smtp_${err.responseCode}` : err.message) || "send_failed",
    };
  }
}
