"use server";

import { findOrderForTracking, type TrackState } from "@/lib/track-order";

/*
 * Only async functions may be exported from a "use server" module — a plain
 * constant here compiles, then arrives as undefined at the call site. The
 * state's type and its initial value live in lib/track-order.ts and the form
 * component respectively.
 */

/**
 * Look up one order from the public tracking form.
 *
 * No session to check: the order number and email pair IS the authorisation,
 * and `findOrderForTracking` is where that's enforced. This only shapes the
 * result for the form.
 */
export async function trackOrderAction(
  _prev: TrackState,
  formData: FormData,
): Promise<TrackState> {
  const orderNumber = String(formData.get("orderNumber") ?? "").slice(0, 40);
  const email = String(formData.get("email") ?? "").slice(0, 320);
  const values = { orderNumber, email };

  if (!orderNumber.trim() || !email.trim()) {
    return { order: null, error: "Enter both your order number and email address.", values };
  }

  const result = await findOrderForTracking(orderNumber, email);

  if (!result.ok) {
    return {
      order: null,
      error:
        result.reason === "unavailable"
          ? "We can't look up orders right now. Please try again shortly."
          : // Same message whichever half was wrong — see lib/track-order.ts.
            "We couldn't find an order with those details. Check the order number and the email you used at checkout.",
      values,
    };
  }

  return { order: result.order, error: null, values };
}
