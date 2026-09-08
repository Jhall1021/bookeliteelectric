"use client";

import { useState } from "react";
import { formatCents } from "@/lib/flow-types";

/**
 * Reviewing and accepting Material Baselines — one batch, not one screen per
 * role.
 *
 * A BASELINE IS A STARTING POINT, NEVER A DEFAULT. Every row here is a role
 * this contractor has not costed at all — accepting one writes a real
 * ContractorMaterial row with `costSource: BASELINE`, exactly as if the
 * contractor had typed the same figure themselves. Nothing here reaches a
 * customer-facing price; only the pricing MODEL moves, same as any other
 * cost edit.
 *
 * THREE OUTCOMES PER ROLE, and only three: accept the baseline shown,
 * override it with your own figure, or leave it — a role simply not acted on
 * stays exactly as unresolved as it was before this screen existed. "Hide
 * for now" below only tidies this session's view; it writes nothing, so the
 * role is back on the list the next time this page loads.
 */
export type BaselineRow = {
  canonicalMaterialId: string;
  key: string;
  name: string;
  affectedServiceSlugs: string[];
  baseline: {
    id: string;
    unitCostCents: number;
    unit: string;
    sourceLabel: string;
    sourceUrl: string | null;
    specNote: string;
    sourcedAt: string;
  } | null;
};

const money = (c: number) => formatCents(c);

export default function MaterialBaselineBatchPanel({ rows }: { rows: BaselineRow[] }) {
  const [visible, setVisible] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.baseline).map((r) => r.canonicalMaterialId))
  );
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const remove = (canonicalMaterialIds: string[]) => {
    setVisible((v) => v.filter((r) => !canonicalMaterialIds.includes(r.canonicalMaterialId)));
    setSelected((s) => { const n = new Set(s); for (const id of canonicalMaterialIds) n.delete(id); return n; });
  };

  async function acceptSelected() {
    const rowsToAccept = visible.filter((r) => selected.has(r.canonicalMaterialId) && r.baseline);
    if (rowsToAccept.length === 0) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/portal/material-baselines", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", baselineVersionIds: rowsToAccept.map((r) => r.baseline!.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not accept the selected baselines.");
      remove(rowsToAccept.map((r) => r.canonicalMaterialId));
      setNote(
        data.accepted === rowsToAccept.length
          ? `Accepted ${data.accepted} starting cost${data.accepted === 1 ? "" : "s"}.`
          : `Accepted ${data.accepted} of ${rowsToAccept.length} — the rest were already resolved by the time this reached the database. Refresh to see their current cost.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function submitOverride(row: BaselineRow) {
    const raw = overrideDraft[row.canonicalMaterialId];
    const dollars = Number(raw);
    if (!raw || !Number.isFinite(dollars) || dollars < 0) {
      setError(`Enter a cost of zero or more for ${row.name}.`);
      return;
    }
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/portal/material-baselines", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "override", canonicalMaterialId: row.canonicalMaterialId, unitCostCents: Math.round(dollars * 100) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that cost.");
      remove([row.canonicalMaterialId]);
      setNote(`Saved your own cost for ${row.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  if (rows.length === 0) return null;

  const selectedWithBaseline = visible.filter((r) => selected.has(r.canonicalMaterialId) && r.baseline);

  return (
    <div className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Starting costs for your materials</h2>
      <p className="mt-1 text-sm text-slate">
        Sourced, dated reference costs for the material roles your catalog needs but you have not
        priced yet. Accept the ones that look right, enter your own for anything that does not, or
        leave a role for later — nothing here moves until you act on it.
      </p>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-success">Nothing left to review here.</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || selectedWithBaseline.length === 0} onClick={acceptSelected}
                    className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              Accept {selectedWithBaseline.length} selected
            </button>
          </div>

          {note && <p className="mt-4 text-sm text-success">{note}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

          <div className="mt-5 space-y-4">
            {visible.map((r) => (
              <div key={r.canonicalMaterialId} className="rounded-card border border-cardline p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {r.baseline && (
                        <input type="checkbox" checked={selected.has(r.canonicalMaterialId)}
                               aria-label={`Include ${r.name} in the batch accept`}
                               onChange={(e) => setSelected((s) => {
                                 const n = new Set(s);
                                 e.target.checked ? n.add(r.canonicalMaterialId) : n.delete(r.canonicalMaterialId);
                                 return n;
                               })} />
                      )}
                      <span className="font-medium text-navy">{r.name}</span>
                      <span className="text-xs text-slate">({r.key})</span>
                    </div>
                    <p className="mt-1 text-xs text-slate">
                      Needed by {r.affectedServiceSlugs.length} service{r.affectedServiceSlugs.length === 1 ? "" : "s"}:{" "}
                      {r.affectedServiceSlugs.slice(0, 3).join(", ")}
                      {r.affectedServiceSlugs.length > 3 ? `, and ${r.affectedServiceSlugs.length - 3} more` : ""}
                    </p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => remove([r.canonicalMaterialId])}
                          className="text-xs font-semibold text-slate underline-offset-2 hover:underline">
                    Skip for now
                  </button>
                </div>

                {r.baseline ? (
                  <p className="mt-3 text-sm text-slate">
                    <span className="font-semibold text-navy">{money(r.baseline.unitCostCents)} / {r.baseline.unit}</span>
                    {" — "}{r.baseline.sourceLabel}, {r.baseline.specNote}, dated {r.baseline.sourcedAt.slice(0, 10)}
                    {r.baseline.sourceUrl && (
                      <>
                        {" "}<a href={r.baseline.sourceUrl} target="_blank" rel="noreferrer" className="text-electric underline-offset-2 hover:underline">source</a>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate">No reference cost is offered for this role yet — enter your own.</p>
                )}

                <div className="mt-3">
                  {overrideOpen.has(r.canonicalMaterialId) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate">$</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                             value={overrideDraft[r.canonicalMaterialId] ?? ""}
                             onChange={(e) => setOverrideDraft((d) => ({ ...d, [r.canonicalMaterialId]: e.target.value }))}
                             className="w-24 rounded border border-cardline px-2 py-1 text-sm"
                             aria-label={`Your cost per ${r.baseline?.unit ?? "unit"} for ${r.name}`} />
                      <span className="text-sm text-slate">per {r.baseline?.unit ?? "unit"}</span>
                      <button type="button" disabled={busy} onClick={() => submitOverride(r)}
                              className="rounded-pill border border-cardline px-3 py-1 text-sm font-semibold text-navy">
                        Save this cost instead
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setOverrideOpen((s) => new Set(s).add(r.canonicalMaterialId))}
                            className="text-sm font-semibold text-electric underline-offset-2 hover:underline">
                      Enter your own cost instead
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
