import { siteConfig } from "@/lib/config";

export function AnnouncementBar() {
  return (
    <div className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-[13px]">
        <span>
          Free delivery across Bahrain on orders over {siteConfig.currency}{" "}
          {siteConfig.shipping.freeThreshold.toFixed(3)} · Authentic brands · {siteConfig.shipping.etaDays} delivery
        </span>
      </div>
    </div>
  );
}
