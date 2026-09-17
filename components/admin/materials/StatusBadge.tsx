import type { MaterialStatus } from "@/lib/materialCatalog";

/**
 * Extracted from MaterialRow.tsx so the cost drawer's header can show the
 * exact same badge a row does — one definition of what each status looks
 * like, not two drifting copies.
 */
export function StatusBadge({ status }: { status: MaterialStatus }) {
  const dotColor =
    status === "Confirmed" ? "bg-success" : status === "Supplier linked" ? "bg-electric" : "bg-amber-500"; // Needs confirmation and Missing price are both amber — work to do, not an error.
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      {status}
    </span>
  );
}
