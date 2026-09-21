"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RoutePricingReviewData } from "@/lib/electrical/routePricingReview";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function RoutePricingReviewPanel({ data }: { data: RoutePricingReviewData }) {
  const router = useRouter();
  const [selected, setSelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canApprove = data.approvalToken !== null && !data.approvalCurrent;

  async function approve() {
    if (!selected || !data.approvalToken) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/derived-pricing-approval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", serviceId: data.serviceId, expectedFingerprint: data.approvalToken }),
      });
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? "Could not approve route pricing.");
      setSelected(false); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve route pricing.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/setup?stage=pricing-foundation" className="text-sm font-semibold text-electric hover:underline">← Back to pricing setup</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">Review route pricing</h1>
      <p className="mt-1 text-sm text-slate">{data.serviceName}</p>

      <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-electric">Representative route</p>
        <h2 className="mt-1 font-display text-lg font-bold text-navy">{data.scenarioLabel}</h2>
        <p className="mt-2 text-sm text-slate">{data.scenarioScope}</p>
        <p className="mt-3 rounded-card bg-warmwhite p-3 text-xs text-slate">
          Approval covers your current labor units, materials, raceway policies and pricing rules—not one fixed price for every route. Each customer route is still calculated from its measured quantities.
        </p>

        {data.proposal?.totalCents !== null && data.proposal ? (
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate">Labor ({data.proposal.laborHours.toFixed(2)} hr)</span><span>{money(data.proposal.laborCents + data.proposal.minimumAdjustmentCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate">Materials and markup</span><span>{money(data.proposal.materialCostCents + data.proposal.materialMarkupCents)}</span></div>
            <div className="flex justify-between border-t border-cardline pt-2 font-bold text-navy"><span>Representative total</span><span>{money(data.proposal.totalCents)}</span></div>
          </div>
        ) : (
          <p className="mt-5 rounded-card bg-amber-50 p-3 text-sm text-amber-900">{data.refusal ?? "This route is not ready to price."}</p>
        )}

        {data.approvalCurrent ? (
          <p className="mt-5 rounded-card bg-success/10 p-3 text-sm font-semibold text-success">Route pricing approved and current.</p>
        ) : canApprove ? (
          <div className="mt-5">
            <label className="flex items-start gap-2 text-sm text-navy">
              <input type="checkbox" checked={selected} onChange={(event) => setSelected(event.target.checked)} className="mt-0.5" />
              I reviewed this representative calculation and approve these current route-pricing inputs.
            </label>
            <button type="button" disabled={!selected || busy} onClick={() => void approve()} className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Approving…" : "Approve route pricing"}
            </button>
          </div>
        ) : null}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
    </div>
  );
}
