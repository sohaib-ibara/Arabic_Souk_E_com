"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/config";

/**
 * Floating WhatsApp button, wearing the shop's mascot.
 *
 * WhatsApp is how people in Bahrain actually contact a shop, so this is the
 * store's real support channel rather than decoration — which is why it sits on
 * every page including checkout, where questions are most expensive to leave
 * unanswered.
 *
 * It used to be a Server Component and a plain green glyph. The client asked
 * for the mascot and an opening line, and a greeting that can be dismissed
 * needs state, so it is a Client Component now. The anchor still renders in the
 * server HTML and still works with JavaScript off — only the bubble needs JS,
 * and its absence costs nothing.
 */
export function WhatsAppButton() {
  const [greeting, setGreeting] = useState(false);
  const pathname = usePathname();

  // Prefilled so the shopper doesn't have to open with "hi" and wait, and so
  // staff can see at a glance which channel the message came from.
  const message = encodeURIComponent(`Hello ${siteConfig.name}, I have a question about`);
  const href = `https://wa.me/${siteConfig.contact.whatsapp}?text=${message}`;

  /*
    The greeting waits, and then stops asking.

    Appearing instantly reads as an ad; appearing once someone has been on the
    page a few seconds reads as an offer of help. Once dismissed it stays
    dismissed for the session, because a bubble that keeps coming back is the
    thing people close the tab over.

    Session, not permanent: sessionStorage rather than localStorage, so a
    returning shopper is greeted again on a new visit but never twice in one.
  */
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Already greeted this session: simply never arm the timer. Setting state
    // here instead would be a synchronous setState inside an effect, which
    // cascades a render for no reason — and says nothing the absent timer
    // does not already say.
    let greeted = false;
    try {
      greeted = window.sessionStorage.getItem("wa-greeted") === "1";
    } catch {
      /* private browsing; treat as not yet greeted */
    }
    if (greeted) return;

    const t = window.setTimeout(() => setGreeting(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  function close() {
    setGreeting(false);
    try {
      window.sessionStorage.setItem("wa-greeted", "1");
    } catch {
      // Private browsing refuses storage; the bubble simply returns next page.
    }
  }

  // Not on checkout. Anything that pulls attention sideways on the one page
  // where someone is trying to finish paying costs more than it earns.
  if (pathname?.startsWith("/checkout")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {greeting && (
        <div className="flex max-w-[15rem] items-start gap-2 rounded-2xl rounded-br-sm bg-[#075E54] px-4 py-3 text-sm text-white shadow-lg shadow-black/20 motion-safe:animate-[fadeUp_.25s_ease-out]">
          <a href={href} target="_blank" rel="noopener noreferrer" className="flex-1">
            How can I help you today?
          </a>
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      )}

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="Chat with us on WhatsApp"
        onClick={close}
        /* z-40 on the wrapper keeps this under the cart drawer (z-50) rather
           than floating over an open cart. */
        className="group relative block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#075E54] shadow-lg shadow-black/20 ring-2 ring-white transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] sm:h-16 sm:w-16"
      >
        <Image
          src="/whatsapp.jpeg"
          alt=""
          fill
          sizes="64px"
          /* object-top: the mascot's face is in the upper half, and a centred
             crop at this size cuts it in half. */
          className="object-cover object-top"
          priority={false}
        />

        {/* The WhatsApp glyph, so the button still reads as WhatsApp rather
            than as an unexplained portrait. Inline SVG so it cannot be stopped
            by a tracker blocker. */}
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] ring-2 ring-white sm:h-7 sm:w-7">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="#fff" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
          </svg>
        </span>
      </a>
    </div>
  );
}
