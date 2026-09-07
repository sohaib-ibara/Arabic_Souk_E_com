import nodemailer from "nodemailer";
import { siteConfig } from "./config";
import { formatPrice } from "./format";

/**
 * Transactional email, over SMTP.
 *
 * Supabase Auth already sends the account-confirmation mail; this covers the
 * messages Supabase knows nothing about: order confirmations, the staff copy of
 * a new order, and what happens to an order afterwards.
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
 *   SMTP_USER          the mailbox to send as
 *   SMTP_PASS          an app password, NOT the account password
 *   SMTP_HOST/PORT     optional; defaults to Gmail on implicit TLS
 *   ORDER_EMAIL_FROM   optional display name; defaults to the store name at
 *                      SMTP_USER. Gmail rewrites this to the authenticated
 *                      mailbox unless the address is a verified alias, so
 *                      inventing a from-address it doesn't own achieves
 *                      nothing.
 *   ORDER_ADMIN_EMAILS optional; who gets the staff notices. Defaults to
 *                      ADMIN_EMAILS, which is already set for the console
 *                      login, so the staff mail needs no new configuration.
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
  /** Row id, so a staff notice can link straight to the order. */
  id?: string | null;
  /** On the staff notices only — the customer's own copy doesn't need it. */
  phone?: string | null;
}

/** The three the client asked to be told about. `pending` and `confirmed` are
 *  the states an order passes through on its own, and mailing about those is
 *  noise. */
export type OrderNotifyStatus = "paid" | "fulfilled" | "cancelled";

export function isNotifyStatus(v: string): v is OrderNotifyStatus {
  return v === "paid" || v === "fulfilled" || v === "cancelled";
}

export type SendResult = { ok: true } | { ok: false; reason: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Who gets the staff notices.
 *
 * Falls back to `ADMIN_EMAILS` — the console login allowlist — because those
 * are by definition the people who run the shop, and asking for the same
 * addresses under a second name is a way of having one of them go stale.
 * `ORDER_ADMIN_EMAILS` overrides it for the case where the people who read
 * order mail are not the people who log in.
 *
 * No fallback to the public contact address on purpose: an order notice
 * carrying a customer's name, phone and address should go where somebody
 * decided it should, not wherever the shop's published mailbox happens to be.
 */
export function adminRecipients(): string[] {
  const raw = process.env.ORDER_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when a staff notice has both a mail server and somewhere to go. */
export function adminEmailConfigured(): boolean {
  return emailConfigured() && adminRecipients().length > 0;
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

/** The order in the console. Only ever put in a message going to staff. */
function adminUrl(id: string | null | undefined): string {
  return id ? `${siteConfig.url}/admin/orders/${id}` : `${siteConfig.url}/admin/orders`;
}

/* ----------------------------- delivery ----------------------------- */

/**
 * One send. Every message in this file goes through here.
 *
 * Never throws: each caller sits behind something that has already happened —
 * an order placed, a status changed by a member of staff — and losing the
 * email is far better than losing the thing it describes.
 */
async function deliver(message: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { ok: false, reason: "not_configured" };

  const to = Array.isArray(message.to) ? message.to.filter(Boolean) : [message.to];
  if (to.length === 0) return { ok: false, reason: "no_recipient" };

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
      to,
      // Replies belong with whoever reads the shop's mail, which need not be
      // the mailbox doing the sending.
      replyTo: siteConfig.contact.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
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

/**
 * Checks the mail server will accept us, without sending anything.
 *
 * For the admin console's own diagnostics: "email is configured" and "email
 * works" are different claims, and an app password revoked six weeks ago looks
 * exactly like a working one from the environment variables alone.
 */
export async function verifyEmailTransport(): Promise<SendResult> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { ok: false, reason: "not_configured" };
  const port = Number(process.env.SMTP_PORT || DEFAULT_PORT);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || DEFAULT_HOST,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    await transport.verify();
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    return {
      ok: false,
      reason: err.code || (err.responseCode ? `smtp_${err.responseCode}` : err.message) || "verify_failed",
    };
  }
}

/* ------------------------------ shared shell ------------------------------ */

/**
 * The page every message is printed on: brand line, the card, the reply note
 * and the registered identity.
 *
 * Extracted so the four templates cannot drift apart. In Bahrain the customer's
 * confirmation has to carry the trading entity and the CR number, and the
 * cheapest way to get that wrong is to write the footer out a second time.
 *
 * `staff` drops the customer-facing reply line and the legal block: a notice to
 * the people who run the shop does not need the shop's own CR number quoted
 * back at it.
 */
function shell(card: string, { staff = false }: { staff?: boolean } = {}): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <p style="margin:0 0 20px;font-size:22px;color:#1b1613">${esc(siteConfig.name)}${
      staff ? ` <span style="font-size:12px;color:#6f655f">ADMIN</span>` : ""
    }</p>

    <div style="background:#ffffff;border:1px solid #ece7e0;border-radius:16px;padding:28px">
${card}
    </div>
${
  staff
    ? ""
    : `
    <p style="margin:20px 0 0;font-size:12px;color:#6f655f;text-align:center">
      Questions? Reply to this email or contact us at ${esc(siteConfig.contact.email)}.
    </p>

    <!-- Registered identity. Inline styles and a plain block, not the shared
         React component: an email client cannot use Tailwind, so the two are
         kept in step through siteConfig rather than through markup. -->
    <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #e7e0d8;font-size:11px;line-height:1.7;color:#6f655f;text-align:center">
      <strong style="color:#1b1613;font-weight:600">${esc(siteConfig.business.legalLine)}</strong><br />
      ${esc(siteConfig.business.country)}<br />
      CR No. ${esc(siteConfig.business.crNumber)}<br />
      Contact Number: ${esc(siteConfig.contact.phone)}<br />
      E-mail: ${esc(siteConfig.contact.email)}
    </p>`
}
  </div>
</body></html>`;
}

/** The legal block again, for the plain-text half. */
function textFooter(): string[] {
  return [
    `${siteConfig.name} — ${siteConfig.url}`,
    "",
    siteConfig.business.legalLine,
    siteConfig.business.country,
    `CR No. ${siteConfig.business.crNumber}`,
    `Contact Number: ${siteConfig.contact.phone}`,
    `E-mail: ${siteConfig.contact.email}`,
  ];
}

function itemRows(o: OrderEmail): string {
  return o.items
    .map(
      (li) => `
      <tr>
        <td style="padding:10px 0;border-top:1px solid #ece7e0;font-size:14px;color:#1b1613">
          ${esc(li.name)}${li.quantity > 1 ? ` <span style="color:#6f655f">× ${li.quantity}</span>` : ""}
        </td>
        <td style="padding:10px 0;border-top:1px solid #ece7e0;text-align:right;font-size:14px;white-space:nowrap">
          ${esc(formatPrice(li.unitPrice * li.quantity, o.currency))}
        </td>
      </tr>`,
    )
    .join("");
}

function totalsRows(o: OrderEmail): string {
  const money = (n: number) => esc(formatPrice(n, o.currency));
  const row = (label: string, value: string, strong = false) => `
        <tr>
          <td style="padding:6px 0;color:#6f655f;font-size:14px">${esc(label)}</td>
          <td style="padding:6px 0;text-align:right;font-size:14px${
            strong ? ";font-weight:600;color:#1b1613" : ""
          }">${value}</td>
        </tr>`;
  return (
    row("Subtotal", money(o.subtotal)) +
    row("Delivery", o.shipping === 0 ? "Free" : money(o.shipping)) +
    row("Total", money(o.total), true)
  );
}

function button(href: string, label: string): string {
  return `
      <div style="margin-top:26px;padding-top:22px;border-top:1px solid #ece7e0;text-align:center">
        <a href="${esc(href)}"
           style="display:inline-block;padding:13px 30px;border-radius:999px;background:#1b1613;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none">
          ${esc(label)}
        </a>
      </div>`;
}

/* --------------------- 1. the customer's confirmation --------------------- */

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
    ...textFooter(),
  ].join("\n");
}

function renderHtml(o: OrderEmail): string {
  const money = (n: number) => esc(formatPrice(n, o.currency));
  const addr = addressLines(o.address);

  return shell(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#1b1613">Thank you for your order</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#6f655f">
        Order <strong style="color:#1b1613">${esc(o.orderNumber)}</strong> is confirmed.
        We deliver across ${esc(siteConfig.country)} within ${esc(siteConfig.shipping.etaDays)}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:24px">${itemRows(o)}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px solid #ece7e0">${totalsRows(o)}</table>

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
${button(trackUrl(o.orderNumber), "Track your order")}
      <p style="margin:12px 0 0;font-size:12px;color:#6f655f;text-align:center">
        Check on this order any time with your order number and this email address.
      </p>`);
}

/** Sends the confirmation for one order, to the customer. */
export async function sendOrderConfirmation(order: OrderEmail): Promise<SendResult> {
  if (!order.email) return { ok: false, reason: "no_recipient" };
  return deliver({
    to: order.email,
    subject: `Your ${siteConfig.name} order ${order.orderNumber}`,
    text: renderText(order),
    html: renderHtml(order),
  });
}

/* ----------------------- 2. the staff copy of a new order ----------------------- */

/**
 * Tells the people who run the shop that an order has arrived.
 *
 * A separate message from the customer's rather than a BCC, and deliberately
 * so: this one carries the phone number, the delivery address and a link into
 * the console, none of which belong in a copy that a customer might be shown.
 * It is also the message somebody acts on — the shop buys from the supplier
 * after the customer pays, so the useful contents are "who, what, and where do
 * I go to start".
 */
export async function sendNewOrderAlert(order: OrderEmail): Promise<SendResult> {
  const to = adminRecipients();
  if (to.length === 0) return { ok: false, reason: "no_admin_recipient" };

  const money = (n: number) => formatPrice(n, order.currency);
  const addr = addressLines(order.address);
  const count = order.items.reduce((s, li) => s + li.quantity, 0);

  const text = [
    `New order ${order.orderNumber} — ${money(order.total)}`,
    "",
    `Customer: ${order.fullName || "(no name given)"}`,
    `Email: ${order.email}`,
    ...(order.phone ? [`Phone: ${order.phone}`] : []),
    `Payment: ${order.paymentMethod === "cod" ? "cash on delivery" : "paid by card"}`,
    "",
    `${count} item${count === 1 ? "" : "s"}:`,
    ...order.items.map((li) => `  ${li.quantity} × ${li.name} — ${money(li.unitPrice * li.quantity)}`),
    "",
    `Subtotal: ${money(order.subtotal)}`,
    `Delivery: ${order.shipping === 0 ? "Free" : money(order.shipping)}`,
    `Total: ${money(order.total)}`,
    "",
    ...(addr.length ? ["Delivering to:", ...addr.map((l) => `  ${l}`), ""] : []),
    `Open it: ${adminUrl(order.id)}`,
  ].join("\n");

  const html = shell(
    `
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#1b1613">New order ${esc(order.orderNumber)}</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#6f655f">
        ${esc(money(order.total))} · ${count} item${count === 1 ? "" : "s"} ·
        ${order.paymentMethod === "cod" ? "cash on delivery" : "paid by card"}
      </p>

      <p style="margin:20px 0 0;font-size:13px;color:#6f655f">
        <strong style="color:#1b1613">Customer</strong><br>
        ${esc(order.fullName || "(no name given)")}<br>
        ${esc(order.email)}${order.phone ? `<br>${esc(order.phone)}` : ""}
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:20px">${itemRows(order)}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px solid #ece7e0">${totalsRows(order)}</table>

      ${
        addr.length
          ? `<p style="margin:22px 0 0;font-size:13px;color:#6f655f">
               <strong style="color:#1b1613">Delivering to</strong><br>${addr.map(esc).join("<br>")}
             </p>`
          : ""
      }
${button(adminUrl(order.id), "Open in the console")}`,
    { staff: true },
  );

  return deliver({
    to,
    subject: `New order ${order.orderNumber} — ${money(order.total)}`,
    text,
    html,
  });
}

/* ------------------------- 3. what happened next ------------------------- */

/**
 * What each status change means, in the words the person reading it needs.
 *
 * `cancelled` says nothing about a refund having been made, only about how to
 * get one. Whether money has actually moved depends on how the order was paid
 * and on what staff did in Stripe, and this file cannot know either — a mail
 * promising a refund the shop has not issued is worse than one that asks.
 */
const CUSTOMER_COPY: Record<
  OrderNotifyStatus,
  { subject: (n: string) => string; heading: string; body: string }
> = {
  paid: {
    subject: (n) => `Payment received for order ${n}`,
    heading: "Payment received",
    body: `Thank you — your payment has come through and we are getting your order ready. We deliver across ${siteConfig.country} within ${siteConfig.shipping.etaDays}.`,
  },
  fulfilled: {
    subject: (n) => `Your ${siteConfig.name} order ${n} is on its way`,
    heading: "Your order is on its way",
    body: "Your order has left us and is with the courier. You can check on it any time with the button below.",
  },
  cancelled: {
    subject: (n) => `Your ${siteConfig.name} order ${n} has been cancelled`,
    heading: "Your order has been cancelled",
    body: "This order has been cancelled and will not be delivered. If you have already paid for it, reply to this email and we will arrange the refund.",
  },
};

const STAFF_LABEL: Record<OrderNotifyStatus, string> = {
  paid: "marked paid",
  fulfilled: "marked fulfilled",
  cancelled: "cancelled",
};

/** Tells the customer what has happened to their order. */
export async function sendOrderStatusToCustomer(
  order: OrderEmail,
  status: OrderNotifyStatus,
): Promise<SendResult> {
  if (!order.email) return { ok: false, reason: "no_recipient" };
  const copy = CUSTOMER_COPY[status];
  const money = (n: number) => formatPrice(n, order.currency);

  const text = [
    copy.heading,
    "",
    `Order ${order.orderNumber}`,
    copy.body,
    "",
    ...order.items.map((li) => `  ${li.quantity} × ${li.name} — ${money(li.unitPrice * li.quantity)}`),
    "",
    `Total: ${money(order.total)}`,
    "",
    `Track your order: ${trackUrl(order.orderNumber)}`,
    "",
    ...textFooter(),
  ].join("\n");

  const html = shell(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#1b1613">${esc(copy.heading)}</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#6f655f">
        Order <strong style="color:#1b1613">${esc(order.orderNumber)}</strong>. ${esc(copy.body)}
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:24px">${itemRows(order)}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px solid #ece7e0">${totalsRows(order)}</table>
${button(trackUrl(order.orderNumber), "Track your order")}`);

  return deliver({ to: order.email, subject: copy.subject(order.orderNumber), text, html });
}

/** Tells staff the same thing, with a link into the console. */
export async function sendOrderStatusToAdmin(
  order: OrderEmail,
  status: OrderNotifyStatus,
): Promise<SendResult> {
  const to = adminRecipients();
  if (to.length === 0) return { ok: false, reason: "no_admin_recipient" };

  const label = STAFF_LABEL[status];
  const money = (n: number) => formatPrice(n, order.currency);

  const text = [
    `Order ${order.orderNumber} ${label}.`,
    "",
    `Customer: ${order.fullName || "(no name given)"}`,
    `Email: ${order.email}`,
    ...(order.phone ? [`Phone: ${order.phone}`] : []),
    `Total: ${money(order.total)}`,
    "",
    `The customer has been emailed about this.`,
    "",
    `Open it: ${adminUrl(order.id)}`,
  ].join("\n");

  const html = shell(
    `
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#1b1613">Order ${esc(order.orderNumber)} ${esc(label)}</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#6f655f">
        ${esc(order.fullName || "(no name given)")} · ${esc(order.email)}${
          order.phone ? ` · ${esc(order.phone)}` : ""
        } · ${esc(money(order.total))}
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6f655f">The customer has been emailed about this.</p>
${button(adminUrl(order.id), "Open in the console")}`,
    { staff: true },
  );

  return deliver({ to, subject: `Order ${order.orderNumber} ${label}`, text, html });
}
