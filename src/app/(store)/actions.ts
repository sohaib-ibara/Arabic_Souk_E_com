"use server";

import {
  subscribeToNewsletter,
  type NewsletterState,
} from "@/lib/newsletter";

/*
 * Storefront server actions.
 *
 * Only async functions may be exported from a "use server" module - a plain
 * constant here compiles and then arrives as undefined at the call site, so the
 * state's type and its initial value live in lib/newsletter.ts.
 */

/**
 * Newsletter signup, from any of the four places the form appears.
 *
 * `source` comes from a hidden field rather than the referer so it says which
 * SURFACE was used (the modal, the sticky tab, the footer) rather than which
 * page it happened on - the page is recorded separately. Which of them earns
 * its interruption is the question the admin list exists to answer.
 */
export async function subscribeAction(
  _prev: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  return subscribeToNewsletter(String(formData.get("email") ?? ""), {
    source: String(formData.get("source") ?? "") || undefined,
    page: String(formData.get("page") ?? "") || undefined,
  });
}
