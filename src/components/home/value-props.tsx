import { LeafIcon, ShieldIcon, SparklesIcon, TruckIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/config";
import { accentAt } from "@/lib/accent";
import { cn } from "@/lib/cn";

const items = [
  // From config, not written out again here: this said "1–2 days" for
  // months after the shop-wide promise had been corrected everywhere else,
  // because a second copy of a fact is a second thing to forget.
  {
    Icon: TruckIcon,
    title: "Delivery across Bahrain",
    text: `Usually ${siteConfig.shipping.etaDays}`,
  },
  { Icon: ShieldIcon, title: "100% authentic", text: "Sourced from official brands" },
  { Icon: SparklesIcon, title: "Expert curated", text: "Only the best beauty picks" },
  { Icon: LeafIcon, title: "Conscious beauty", text: "Cruelty-free options, always" },
];

/**
 * Four promises in a row, and until now four identical rose circles — which
 * made them read as one repeated thing rather than four separate reassurances.
 * A different accent each, taken straight down the palette rather than hashed,
 * because this list is fixed and the order is deliberate: the one people
 * actually want to know is delivery, and it is first.
 */
export function ValueProps() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
      {items.map(({ Icon, title, text }, i) => {
        const accent = accentAt(i);
        return (
          <div key={title} className="group flex items-start gap-3">
            <span
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-300",
                "motion-safe:group-hover:scale-110",
                accent.tint,
                accent.text,
              )}
            >
              <Icon width={22} height={22} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
