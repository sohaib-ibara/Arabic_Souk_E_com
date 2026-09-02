import { LeafIcon, ShieldIcon, SparklesIcon, TruckIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/config";

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

export function ValueProps() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
      {items.map(({ Icon, title, text }) => (
        <div key={title} className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
            <Icon width={22} height={22} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{title}</p>
            <p className="text-sm text-muted">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
