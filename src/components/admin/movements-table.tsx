import Link from "next/link";
import { reasonLabels, type MovementRow } from "@/lib/inventory";
import { formatDateTime } from "./order-bits";
import { cn } from "@/lib/cn";

/**
 * The stock ledger. Append-only, newest first — this is the audit trail, so it
 * shows who did what and what the balance became, not just the delta.
 */
export function MovementsTable({
  movements,
  showProduct = false,
  emptyMessage = "No movements recorded yet.",
}: {
  movements: MovementRow[];
  showProduct?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-160 text-sm">
        <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">When</th>
            {showProduct && <th className="px-4 py-3 font-medium">Product</th>}
            <th className="px-4 py-3 font-medium">Reason</th>
            <th className="px-4 py-3 font-medium text-right">Change</th>
            <th className="px-4 py-3 font-medium text-right">Balance</th>
            <th className="px-4 py-3 font-medium">By</th>
          </tr>
        </thead>
        <tbody>
          {movements.length === 0 ? (
            <tr>
              <td colSpan={showProduct ? 6 : 5} className="px-4 py-12 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            movements.map((m) => (
              <tr key={m.id} className="border-t border-line align-top">
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatDateTime(m.createdAt)}
                </td>
                {showProduct && (
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/${m.productId}`}
                      className="text-ink hover:text-brand"
                    >
                      {m.productName ?? m.productSlug ?? "—"}
                    </Link>
                  </td>
                )}
                <td className="px-4 py-3">
                  {reasonLabels[m.reason] ?? m.reason}
                  {m.note && <span className="block text-xs text-muted">{m.note}</span>}
                  {m.referenceType === "order" && m.referenceId && (
                    <Link
                      href={`/admin/orders/${m.referenceId}`}
                      className="block text-xs text-brand hover:underline"
                    >
                      View order →
                    </Link>
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-medium whitespace-nowrap",
                    m.delta > 0 ? "text-emerald-700" : "text-red-700",
                  )}
                >
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Null only for rows written before 0006, when a movement
                      could be recorded without moving the balance. */}
                  {m.balanceAfter == null ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    <span className={m.balanceAfter < 0 ? "text-red-700" : undefined}>
                      {m.balanceAfter}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {m.actor === "system" ? (
                    <span className="text-xs">system</span>
                  ) : (
                    <span className="text-xs break-all">{m.actor ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
