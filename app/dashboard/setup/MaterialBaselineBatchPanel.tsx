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
  /** CanonicalMaterial.unit — the purchasing unit ServiceMaterial.quantity
   *  counts, always known, whether or not a baseline is offered. A manual
   *  entry is priced per THIS unit, never per the baseline's own basis. */
  unit: string;
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
      const data = await res.json() as { accepted: number; problems: { baselineVersionId: string; code: string }[] };
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "Could not accept the selected baselines.");

      // Each row is keyed here by ITS OWN baselineVersionId, not by position
      // — a problem only removes the row it actually names. Everything else
      // submitted, including every problem row, stays visible: a role this
      // reached but did not resolve is not the same as a role it resolved,
      // and showing it as gone would hide the one thing the contractor still
      // needs to act on.
      const problemByVersionId = new Map(data.problems.map((p) => [p.baselineVersionId, p.code]));
      const resolvedRows = rowsToAccept.filter((r) => !problemByVersionId.has(r.baseline!.id));
      remove(resolvedRows.map((r) => r.canonicalMaterialId));

      if (problemByVersionId.size === 0) {
        setNote(`Accepted ${data.accepted} starting cost${data.accepted === 1 ? "" : "s"}.`);
      } else {
        const codes = [...problemByVersionId.values()];
        const alreadyResolved = codes.filter((c) => c === "ALREADY_RESOLVED").length;
        const notFound = codes.filter((c) => c === "BASELINE_NOT_FOUND").length;
        const parts: string[] = [];
        if (alreadyResolved) {
          parts.push(`${alreadyResolved} already resolved by someone else before this reached the database — refresh to see the current cost`);
        }
        if (notFound) {
          parts.push(`${notFound} reference cost no longer exists — enter your own below`);
        }
        setNote(
          `Accepted ${data.accepted} of ${rowsToAccept.length}. ${parts.join("; ")}. Still shown below for you to act on.`
        );
      }
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
                      <span className="font-medium text-navy" title={r.key}>{r.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate" title={r.affectedServiceSlugs.join(", ")}>
                      Needed by {r.affectedServiceSlugs.length} of your services
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
                  <p className="mt-3 text-sm text-slate">No reference cost is offered for this role yet — enter your own, per {r.unit}.</p>
                )}

                <div className="mt-3">
                  {overrideOpen.has(r.canonicalMaterialId) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate">$</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                             value={overrideDraft[r.canonicalMaterialId] ?? ""}
                             onChange={(e) => setOverrideDraft((d) => ({ ...d, [r.canonicalMaterialId]: e.target.value }))}
                             className="w-24 rounded border border-cardline px-2 py-1 text-sm"
                             aria-label={`Your cost per ${r.unit} for ${r.name}`} />
                      {/* Always the CANONICAL unit, never the baseline's own
                          package basis — a manual entry is priced per what
                          ServiceMaterial.quantity counts, and "per unit" is
                          ambiguous for wire and anything else sold by length
                          or bulk. */}
                      <span className="text-sm text-slate">per {r.unit}</span>
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
