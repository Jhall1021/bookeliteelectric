/**
 * One compact card: setup progress at a glance, then the three counts a
 * contractor actually acts on. Replaces the earlier dot-separated line —
 * the progress bar answers "how set up am I" in one look, before any of the
 * rows below need reading. Only the actionable count gets amber weight;
 * everything else stays neutral so nothing competes with the material rows
 * below for attention.
 *
 * `needsAttention` is the same combined `statusBucket === "needs_attention"`
 * count the filter dropdown already uses — it covers BOTH a missing price
 * and a cost merely needing confirmation, so the label reads "need
 * attention" rather than the narrower (and here inaccurate) "need a cost".
 */
export function CatalogHealthStrip({
  total,
  priced,
  needsAttention,
  supplierLinked,
  usedInServices,
}: {
  total: number;
  priced: number;
  needsAttention: number;
  supplierLinked: number;
  usedInServices: number;
}) {
  const percent = total > 0 ? Math.round((priced / total) * 100) : 0;

  return (
    <div className="mt-4 rounded-card border border-cardline bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-slate">
          <strong className="font-semibold text-navy">{priced}</strong> of{" "}
          <strong className="font-semibold text-navy">{total}</strong> active material
          {total === 1 ? "" : "s"} priced
        </p>
        <span className="text-xs font-medium text-slate">{percent}%</span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-warmwhite" role="presentation">
        <div
          className="h-full rounded-full bg-electric transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate">
        <span className={needsAttention > 0 ? "font-semibold text-amber-700" : undefined}>
          {needsAttention} need{needsAttention === 1 ? "s" : ""} attention
        </span>
        <Dot />
        <span>{supplierLinked} supplier linked</span>
        <Dot />
        <span>{usedInServices} used in services</span>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-cardline">
      •
    </span>
  );
}
