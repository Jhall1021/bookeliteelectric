/**
 * One quiet line of real catalog counts — replaces four large stat cards
 * that spent a whole row of vertical space on numbers a contractor mostly
 * skims past. Only the actionable count gets amber weight; everything else
 * stays neutral so nothing competes with the material rows below for
 * attention.
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
}: {
  total: number;
  priced: number;
  needsAttention: number;
  supplierLinked: number;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-cardline bg-white px-4 py-2.5 text-sm text-slate">
      <span>
        <strong className="font-semibold text-navy">{total}</strong> material{total === 1 ? "" : "s"}
      </span>
      <Dot />
      <span>
        <strong className="font-semibold text-navy">{priced}</strong> priced
      </span>
      <Dot />
      <span className={needsAttention > 0 ? "text-amber-700" : undefined}>
        <strong className={`font-semibold ${needsAttention > 0 ? "text-amber-700" : "text-navy"}`}>{needsAttention}</strong>{" "}
        need{needsAttention === 1 ? "s" : ""} attention
      </span>
      <Dot />
      <span>
        <strong className="font-semibold text-navy">{supplierLinked}</strong> supplier-linked
      </span>
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
