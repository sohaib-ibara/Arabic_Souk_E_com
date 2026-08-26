"use client";

import { useActionState } from "react";
import Link from "next/link";
import { trackOrderAction } from "@/app/(store)/track/actions";
import { TRACKING_STEPS, describeStatus, type TrackState } from "@/lib/track-order";
import { formatPrice, formatDateTime } from "@/lib/format";
import { siteConfig } from "@/lib/config";
import { CheckIcon } from "@/components/ui/icons";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand";

const STEP_LABELS: Record<(typeof TRACKING_STEPS)[number], string> = {
  placed: "Order placed",
  preparing: "Preparing",
  on_the_way: "On the way",
  delivered: "Delivered",
};

const toneStyles = {
  waiting: "border-amber-200 bg-amber-50 text-amber-900",
  active: "border-sky-200 bg-sky-50 text-sky-900",
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  stopped: "border-line bg-sand text-muted",
} as const;

const initialState: TrackState = {
  order: null,
  error: null,
  values: { orderNumber: "", email: "" },
};

export function TrackOrderForm({ defaultOrderNumber }: { defaultOrderNumber?: string }) {
  const [state, formAction, pending] = useActionState(trackOrderAction, {
    ...initialState,
    // Arriving from a confirmation page or email, the order number is already
    // known — only the email is left to type.
    values: { ...initialState.values, orderNumber: defaultOrderNumber ?? "" },
  });
  const order = state.order;
  const status = order ? describeStatus(order.status, order.paymentMethod) : null;
  const reached = status?.step ? TRACKING_STEPS.indexOf(status.step) : -1;

  return (
    <div className="mt-8">
      <form action={formAction} className="rounded-2xl border border-line bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Order number</span>
            <input
              name="orderNumber"
              required
              defaultValue={state.values.orderNumber}
              placeholder="LM-1A2B3C4D"
              autoComplete="off"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email used at checkout</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={state.values.email}
              autoComplete="email"
              className={field}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-muted">
          Your order number is in your confirmation email, and on the page shown right after you
          ordered.
        </p>

        <button
          type="submit"
          disabled={pending}
          className="mt-5 rounded-full bg-ink px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
        >
          {pending ? "Looking…" : "Track order"}
        </button>

        {state.error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {state.error}
          </p>
        )}
      </form>

      {order && status && (
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">{order.orderNumber}</h2>
              <p className="mt-1 text-sm text-muted">
                Placed {formatDateTime(order.createdAt)}
              </p>
            </div>
            <span
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${toneStyles[status.tone]}`}
            >
              {status.label}
            </span>
          </div>

          {status.detail && <p className="mt-4 text-sm text-ink/80">{status.detail}</p>}

          {/* The four steps, so "where is it" has a visual answer and not just
              a word. Hidden for a cancelled order, which is not on the path. */}
          {status.step && (
            <ol className="mt-7 grid gap-3 sm:grid-cols-4">
              {TRACKING_STEPS.map((s, i) => {
                const done = i <= reached;
                return (
                  <li key={s} className="flex items-center gap-2 sm:flex-col sm:items-start">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                        done ? "bg-brand text-white" : "border border-line bg-white text-muted"
                      }`}
                    >
                      {done ? <CheckIcon width={13} height={13} /> : i + 1}
                    </span>
                    <span className={`text-xs ${done ? "text-ink" : "text-muted"}`}>
                      {STEP_LABELS[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {order.items.length > 0 && (
            <ul className="mt-8 space-y-2 border-t border-line pt-5 text-sm">
              {order.items.map((li, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    {li.name}
                    {li.quantity > 1 && <span className="text-muted"> × {li.quantity}</span>}
                  </span>
                  <span className="shrink-0">
                    {formatPrice(li.unitPrice * li.quantity, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(order.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{order.shipping === 0 ? "Free" : formatPrice(order.shipping, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-medium">
              <dt>{order.paymentMethod === "cod" ? "Due on delivery" : "Total"}</dt>
              <dd>{formatPrice(order.total, order.currency)}</dd>
            </div>
          </dl>

          {(order.address.length > 0 || order.phone) && (
            <div className="mt-5 grid gap-4 border-t border-line pt-4 text-xs sm:grid-cols-2">
              {order.address.length > 0 && (
                <div>
                  <p className="text-muted">Delivering to</p>
                  <p className="mt-1 text-ink">{order.address.join(", ")}</p>
                </div>
              )}
              {order.phone && (
                <div>
                  <p className="text-muted">Contact number</p>
                  <p className="mt-1 text-ink">{order.phone}</p>
                </div>
              )}
            </div>
          )}

          <p className="mt-6 text-xs text-muted">
            Something not right?{" "}
            <Link href="/contact" className="text-brand hover:underline">
              Contact us
            </Link>{" "}
            and quote {order.orderNumber}, or email {siteConfig.contact.email}.
          </p>
        </div>
      )}
    </div>
  );
}
