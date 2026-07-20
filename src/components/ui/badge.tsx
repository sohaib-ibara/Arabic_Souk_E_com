import { cn } from "@/lib/cn";

const tones = {
  brand: "bg-brand text-white",
  gold: "bg-gold text-white",
  neutral: "bg-white/90 text-ink ring-1 ring-line",
  sale: "bg-ink text-white",
} as const;

export function Badge({
  children,
  tone = "brand",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
