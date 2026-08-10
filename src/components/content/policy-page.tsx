import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

/**
 * Shared shell for the static content pages (policies, FAQ, contact, about).
 *
 * Tailwind's typography plugin isn't installed, so the reading styles live here
 * as descendant rules and every page inherits the same rhythm instead of
 * repeating a dozen utility classes per heading.
 */
export const prose = [
  "text-[15px] leading-relaxed text-muted",
  "[&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-ink [&_h2]:first:mt-0",
  "[&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-ink",
  "[&_p]:mt-3",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
  "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
  "[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2",
  "[&_strong]:font-medium [&_strong]:text-ink",
  "[&_table]:mt-4 [&_table]:w-full [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-line [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink",
  "[&_td]:border-b [&_td]:border-line [&_td]:py-2",
].join(" ");

/** Bumped by hand whenever the policy wording changes. */
export const POLICY_UPDATED = "10 August 2026";

export function PolicyPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  /** Pass `false` to hide the "last updated" line (e.g. contact, about). */
  updated?: string | false;
  children: React.ReactNode;
}) {
  return (
    <Container className="py-8 sm:py-12">
      {/* Centred reading column — a 65ch-ish measure sitting in the middle of the
          page, rather than hugging the left edge of the 7xl shell. */}
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: title }]} />

        <header className="mt-4">
          <h1 className="font-serif text-3xl sm:text-4xl">{title}</h1>
          {intro && <p className="mt-3 text-[15px] leading-relaxed text-muted">{intro}</p>}
          {updated !== false && (
            <p className="mt-4 text-xs uppercase tracking-[0.15em] text-muted">
              Last updated · {updated ?? POLICY_UPDATED}
            </p>
          )}
        </header>

        <div className={`mt-10 ${prose}`}>{children}</div>
      </div>
    </Container>
  );
}
