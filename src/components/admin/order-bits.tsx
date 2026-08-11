import { cn } from "@/lib/cn";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/admin-orders";
import { updateOrderStatusAction } from "@/app/admin/actions";

const statusStyles: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  fulfilled: "bg-blue-50 text-blue-700",
  cancelled: "bg-sand text-muted",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}

/** Re-exported so existing admin imports keep working; pinned to the store's zone. */
export { formatDateTime } from "@/lib/format";

/**
 * Status control. A plain form posting to a server action, so it works without
 * client JS — no hook, no client bundle.
 */
export function StatusForm({ id, status }: { id: string; status: OrderStatus }) {
  return (
    <form action={updateOrderStatusAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`status-${id}`} className="sr-only">
        Order status
      </label>
      <select
        id={`status-${id}`}
        name="status"
        defaultValue={status}
        className="rounded-full border border-line bg-white px-4 py-2 text-sm capitalize outline-none focus:border-brand"
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Update
      </button>
    </form>
  );
}
