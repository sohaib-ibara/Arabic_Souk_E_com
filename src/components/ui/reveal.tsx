"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Sections that arrive as you reach them.
 *
 * A long page of eight full-width bands reads as one undifferentiated scroll.
 * Letting each one rise into place as it comes into view marks where one ends
 * and the next begins, which is the whole job — it is punctuation, not
 * decoration, and that is why the movement is 18px and 0.7s rather than
 * something you would notice as an effect.
 *
 * Three things it deliberately does not do:
 *
 *   Re-hide on the way back up. Once seen, a section stays put; a page that
 *   re-animates on every scroll direction is exhausting to use.
 *
 *   Hide anything for somebody who has asked for less motion, or whose browser
 *   has JavaScript off. Both are handled in CSS — the `.reveal` rule only
 *   exists inside a `prefers-reduced-motion: no-preference` query — so there is
 *   no path where this component failing leaves a blank page behind it.
 *
 *   Delay the fold. Anything above it is already on screen when the observer
 *   first runs, so it reveals on the same frame.
 */
export function Reveal({
  children,
  /** Milliseconds behind its neighbours, for staggering a row of cards. */
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // An old browser gets the content, immediately. The animation is the
    // part that is optional.
    //
    // Written straight onto the node rather than through state: this is a
    // one-way, terminal decision that nothing else re-reads, and setting state
    // synchronously in an effect body is a cascading render for no gain.
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("reveal-in");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // A little before the edge, so the movement finishes as the section
      // reaches a comfortable reading position rather than starting there.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", shown && "reveal-in", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
