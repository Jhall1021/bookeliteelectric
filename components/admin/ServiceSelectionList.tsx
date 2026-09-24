"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Which services this contractor offers — ONE control, two places.
 *
 * The Services area owns this setting permanently; Guided Setup walks a
 * contractor through it the first time. Both render this component, so there
 * is no onboarding-only list that can drift from the portal, and
 * `Service.offered` stays the single source of truth.
 *
 * WHAT SELECTING DOES NOT DO
 *
 * It does not price anything and does not put anything on the storefront.
 * provisioned -> offered -> ready -> active are four separate states, and this
 * control moves exactly one of them. Deselecting something already live is
 * refused by the server (SERVICE_IS_LIVE): taking a service off a storefront
 * belongs to the deactivation lifecycle, not to a checkbox.
 */

export type SelectableService = {
  id: string;
  name: string;
  categoryName: string | null;
  offered: boolean;
  active: boolean;
  laborCrewType: "ELECTRICIAN" | "ELECTRICIAN_AND_HELPER";
  /** From the same promise logic readiness uses. Not a lookalike rule. */
  promisesFixedPrice: boolean;
  /** Uses the correct legacy publication or derived-basis approval contract. */
  priceApproved: boolean;
  /** Explains review-priced and handoff services without calling both quote-only. */
  pricingPathLabel: string | null;
};

export default function ServiceSelectionList({ services }: { services: SelectableService[] }) {
  const [rows, setRows] = useState(services);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(services), [services]);

  const byCategory = useMemo(() => rows.reduce<Record<string, SelectableService[]>>((acc, s) => {
    const key = s.categoryName ?? "Other";
    (acc[key] ??= []).push(s);
    return acc;
  }, {}), [rows]);
  const offeredCount = rows.filter((s) => s.offered).length;

  const markPending = (id: string, value: boolean) => setPending((current) => {
    const next = new Set(current);
    if (value) next.add(id); else next.delete(id);
    return next;
  });

  async function toggle(s: SelectableService, offered: boolean) {
    if (pending.has(s.id) || s.offered === offered) return;

    setRows((current) => current.map((row) => row.id === s.id ? { ...row, offered } : row));
    markPending(s.id, true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/services/${s.id}/offered`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offered }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows((current) => current.map((row) => row.id === s.id ? { ...row, offered: s.offered } : row));
        setError(data.message ?? data.error ?? `Could not ${offered ? "select" : "deselect"} ${s.name}. Nothing was changed.`);
        return;
      }
    } catch {
      // A lost browser response does not prove the PATCH failed. Refresh the
      // server-rendered list so Service.offered remains the authority and the
      // contractor never has to guess whether the checkbox was saved.
      setRows((current) => current.map((row) => row.id === s.id ? { ...row, offered: s.offered } : row));
      setError(`Price2Book could not confirm the change to ${s.name}. Its previous selection was restored.`);
    } finally {
      markPending(s.id, false);
    }
  }

  async function setAll(offered: boolean) {
    if (bulkBusy || pending.size > 0) return;
    const previous = rows;
    setRows((current) => current.map((row) => row.active && !offered ? row : { ...row, offered }));
    setBulkBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/services/bulk-offered", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offered }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not update all services.");
    } catch (caught) {
      setRows(previous);
      setError(caught instanceof Error ? caught.message : "Could not update all services.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function setCrew(s: SelectableService, laborCrewType: SelectableService["laborCrewType"]) {
    if (pending.has(s.id) || s.laborCrewType === laborCrewType) return;
    setRows((current) => current.map((row) => row.id === s.id ? { ...row, laborCrewType } : row));
    markPending(s.id, true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/services/${s.id}/offered`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ laborCrewType }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Could not change the crew for ${s.name}.`);
    } catch (caught) {
      setRows((current) => current.map((row) => row.id === s.id ? { ...row, laborCrewType: s.laborCrewType } : row));
      setError(caught instanceof Error ? caught.message : `Could not change the crew for ${s.name}.`);
    } finally {
      markPending(s.id, false);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate">
        <span className="font-medium text-navy">{offeredCount} of {rows.length} selected.</span>{" "}
        Choosing a service tells us what to check — it does not price it or put it on your
        storefront.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={bulkBusy || pending.size > 0 || offeredCount === rows.length} onClick={() => void setAll(true)} className="rounded-pill border border-electric px-4 py-2 text-xs font-semibold text-electric disabled:opacity-40">{bulkBusy ? "Saving…" : "Select all"}</button>
        {offeredCount > 0 && <button type="button" disabled={bulkBusy || pending.size > 0} onClick={() => void setAll(false)} className="rounded-pill border border-cardline px-4 py-2 text-xs font-semibold text-navy disabled:opacity-40">Clear selections</button>}
      </div>

      {error && <div role="alert" className="mt-3 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4 space-y-5">
        {Object.entries(byCategory).map(([category, items]) => (
          <section key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">{category}</h3>
            <ul className="mt-2 space-y-1">
              {items.map((s) => (
                <li key={s.id}>
                  <div className="flex flex-col gap-2 rounded-card px-3 py-2 text-sm hover:bg-warmwhite sm:flex-row sm:items-center">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={s.offered}
                      disabled={bulkBusy || pending.has(s.id)}
                      onChange={(e) => void toggle(s, e.target.checked)}
                    />
                    <span className="text-navy">{s.name}</span>
                    </label>
                    <span className="flex items-center gap-3 text-xs sm:ml-auto">
                      {/* Read from the same logic that decides readiness, so a
                          preview can never contradict the verdict. */}
                      <span className="text-slate">
                        {!s.promisesFixedPrice
                          ? (s.pricingPathLabel ?? "Price after review")
                          : s.priceApproved
                            ? "Price approved"
                            : "Review fixed price in the next step"}
                      </span>
                      <select aria-label={`Crew used to price ${s.name}`} value={s.laborCrewType} disabled={bulkBusy || pending.has(s.id) || s.active} onChange={(event) => void setCrew(s, event.target.value as SelectableService["laborCrewType"])} className="rounded-lg border border-cardline bg-white px-2 py-1.5 text-xs text-navy">
                        <option value="ELECTRICIAN">Electrician</option>
                        <option value="ELECTRICIAN_AND_HELPER">Electrician + helper</option>
                      </select>
                      {s.active && <span className="text-success">Live</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
