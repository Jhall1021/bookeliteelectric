"use client";

import { useState } from "react";

export type ServiceLaborReviewRow = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  suggestedHours: number;
  currentHours: number | null;
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
  const [saving, setSaving] = useState<string | null>(null);
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  async function approve(row: ServiceLaborReviewRow) {
    setSaving(row.serviceId);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-service-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: row.serviceId, expectedHours: row.suggestedHours }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not approve service labor.");
      setApproved((current) => new Set(current).add(row.serviceId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve service labor.");
    } finally {
      setSaving(null);
    }
  }

  if (ready.length === 0 && blockedCount === 0 && routeSpecificCount === 0) return null;
  return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Service labor review</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Turn approved operations into service durations</h2>
      <p className="mt-2 text-sm text-slate">Each row is recomputed from your approved labor units and the service&apos;s bounded physical scope. Approving labor does not approve or publish its customer price.</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{ready.length} ready for review</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{blockedCount} need labor units</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate">{routeSpecificCount} need job-specific route facts</span>
      </div>
      {ready.length > 0 && <div className="mt-4 space-y-3">
        {ready.map((row) => {
          const isApproved = approved.has(row.serviceId);
          return <div key={row.serviceId} className="flex items-start gap-3 rounded-xl border border-cardline p-3">
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer">
                <span className="text-sm font-semibold text-navy">{row.serviceName}</span>
                <span className="mt-1 block text-xs text-slate">{row.currentHours === null ? "No current service labor" : `Current ${row.currentHours.toFixed(2)} hr`} · Suggested {row.suggestedHours.toFixed(2)} hr</span>
              </summary>
              <div className="mt-3 border-t border-cardline pt-3 text-xs text-slate">
                {row.lines.map((line) => <div key={line.operationName} className="flex justify-between gap-4 py-1"><span>{line.operationName} × {line.quantity}</span><span>{line.unitHours.toFixed(3)} = {line.lineHours.toFixed(3)} hr</span></div>)}
              </div>
            </details>
            <button type="button" disabled={isApproved || saving === row.serviceId} onClick={() => { void approve(row); }} className="shrink-0 rounded-pill bg-electric px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {isApproved ? "Labor approved" : saving === row.serviceId ? "Saving…" : "Approve labor"}
            </button>
          </div>;
        })}
      </div>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
