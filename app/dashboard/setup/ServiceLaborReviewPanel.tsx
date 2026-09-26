"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ServiceLaborReviewRow = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  categoryName: string;
  categorySortOrder: number;
  laborContext: "BOTH" | "PRIMARY" | "ADD_ON";
  suggestedHours: number;
  currentPrimaryHours: number | null;
  currentAddOnHours: number | null;
  lines: { operationName: string; quantity: number; unitHours: number; lineHours: number }[];
};

export default function ServiceLaborReviewPanel({
  ready,
  blockedCount,
  routeSpecificCount,
}: {
  ready: ServiceLaborReviewRow[];
  blockedCount: number;
  routeSpecificCount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [approvedHours, setApprovedHours] = useState<Map<string, number>>(() => new Map());
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const isCurrent = (row: ServiceLaborReviewRow) => {
    const persisted = row.laborContext === "PRIMARY"
      ? row.currentPrimaryHours !== null && Math.abs(row.currentPrimaryHours - row.suggestedHours) <= 1e-9
      : row.laborContext === "ADD_ON"
      ? row.currentAddOnHours !== null && Math.abs(row.currentAddOnHours - row.suggestedHours) <= 1e-9
      : row.currentPrimaryHours !== null && row.currentAddOnHours !== null
        && Math.abs(row.currentPrimaryHours - row.suggestedHours) <= 1e-9
        && Math.abs(row.currentAddOnHours - row.suggestedHours) <= 1e-9;
    return persisted || approvedHours.get(row.serviceId) === row.suggestedHours;
  };
  const currentCount = ready.filter(isCurrent).length;
  const pendingCount = ready.length - currentCount;

  const pending = ready.filter((row) => !isCurrent(row));
  const allPendingSelected = pending.length > 0 && pending.every((row) => selectedServiceIds.has(row.serviceId));

  function toggle(serviceId: string) {
    setSelectedServiceIds((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
  }

  async function approveSelected() {
    const items = pending
      .filter((row) => selectedServiceIds.has(row.serviceId))
      .map((row) => ({ serviceId: row.serviceId, expectedHours: row.suggestedHours }));
    if (items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-service-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await response.json().catch(() => null) as { error?: string; approved?: { serviceId: string; approvedHours: number }[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not approve service labor.");
      setApprovedHours((current) => {
        const next = new Map(current);
        for (const row of body?.approved ?? items.map((item) => ({ serviceId: item.serviceId, approvedHours: item.expectedHours }))) {
          next.set(row.serviceId, row.approvedHours);
        }
        return next;
      });
      setSelectedServiceIds(new Set());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve service labor.");
    } finally {
      setSaving(false);
    }
  }

  if (ready.length === 0 && blockedCount === 0 && routeSpecificCount === 0) return null;
  return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Service labor review</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Turn approved operations into service durations</h2>
      <p className="mt-2 text-sm text-slate">Each row is recomputed from your approved labor units and the service&apos;s bounded physical scope. Approving labor does not approve or publish its customer price.</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{currentCount} labor durations current</span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{pendingCount} ready for review</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{blockedCount} need labor units</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate">{routeSpecificCount} priced from each job&apos;s route</span>
      </div>
      {routeSpecificCount > 0 && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate">
          Route-priced services do not need one made-up service duration here. The homeowner&apos;s
          measurements choose the quantities later; your approved per-item and per-foot labor
          units calculate that job&apos;s time and price.
        </p>
      )}
      {ready.length > 0 && <div className="mt-4 space-y-3">
        {pending.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-900">Select the service durations you reviewed. Nothing is preselected; one stale row refuses the whole batch.</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedServiceIds(allPendingSelected ? new Set() : new Set(pending.map((row) => row.serviceId)))} className="text-xs font-semibold text-electric">
              {allPendingSelected ? "Clear duration selections" : "Select all reviewed durations"}
            </button>
            <button type="button" disabled={saving || selectedServiceIds.size === 0} onClick={() => { void approveSelected(); }} className="rounded-pill bg-electric px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? "Approving…" : `Approve selected durations (${selectedServiceIds.size})`}
            </button>
          </div>
        </div>}
        {ready.map((row) => {
          const isApproved = isCurrent(row);
          return <div key={row.serviceId} className="flex items-start gap-3 rounded-xl border border-cardline p-3">
            {!isApproved && <input type="checkbox" aria-label={`Select suggested duration for ${row.serviceName}`} checked={selectedServiceIds.has(row.serviceId)} onChange={() => toggle(row.serviceId)} className="mt-1" />}
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer">
                <span className="text-sm font-semibold text-navy">{row.serviceName}</span>
                <span className="mt-1 block text-xs text-slate">
                  {row.laborContext === "PRIMARY"
                    ? `Current primary ${row.currentPrimaryHours?.toFixed(2) ?? "unset"} hr`
                    : row.laborContext === "ADD_ON"
                    ? `Current add-on ${row.currentAddOnHours?.toFixed(2) ?? "unset"} hr`
                    : `Current primary ${row.currentPrimaryHours?.toFixed(2) ?? "unset"} hr · add-on ${row.currentAddOnHours?.toFixed(2) ?? "unset"} hr`}
                  {` · Suggested ${row.suggestedHours.toFixed(2)} hr ${row.laborContext === "PRIMARY" ? "primary" : row.laborContext === "ADD_ON" ? "add-on" : "for both"}`}
                </span>
              </summary>
              <div className="mt-3 border-t border-cardline pt-3 text-xs text-slate">
                {row.lines.map((line) => <div key={line.operationName} className="flex justify-between gap-4 py-1"><span>{line.operationName} × {line.quantity}</span><span>{line.unitHours.toFixed(3)} = {line.lineHours.toFixed(3)} hr</span></div>)}
              </div>
            </details>
            {isApproved && <span className="shrink-0 rounded-pill bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Labor current</span>}
          </div>;
        })}
      </div>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
