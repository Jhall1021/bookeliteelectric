import Link from "next/link";
import type { RoutePricingReviewData } from "@/lib/electrical/routePricingReview";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function RoutePricingReviewPanel({ data }: { data: RoutePricingReviewData }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/setup?stage=pricing-foundation#price-${data.serviceId}`} className="text-sm font-semibold text-electric hover:underline">← Back to Your prices</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">Route price example</h1>
      <p className="mt-1 text-sm text-slate">{data.serviceName}</p>

      <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-electric">Example calculation</p>
        <h2 className="mt-1 font-display text-lg font-bold text-navy">{data.scenarioLabel}</h2>
        <p className="mt-2 text-sm text-slate">{data.scenarioScope}</p>
        <p className="mt-3 rounded-card bg-warmwhite p-3 text-xs text-slate">
          {data.basisNotice}
        </p>

        {data.proposal?.totalCents !== null && data.proposal ? (
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate">Labor ({data.proposal.laborHours.toFixed(2)} hr · {data.crewLabel})</span><span>{money(data.proposal.laborCents + data.proposal.minimumAdjustmentCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate">Materials and markup</span><span>{money(data.proposal.materialCostCents + data.proposal.materialMarkupCents)}</span></div>
            <div className="flex justify-between border-t border-cardline pt-2 font-bold text-navy"><span>Example total</span><span>{money(data.proposal.totalCents)}</span></div>
          </div>
        ) : (
          <p className="mt-5 rounded-card bg-amber-50 p-3 text-sm text-amber-900">{data.refusal ?? "This route is not ready to price."}</p>
        )}

        {data.approvalCurrent ? (
          <p className="mt-5 rounded-card bg-success/10 p-3 text-sm font-semibold text-success">The current pricing inputs are approved.</p>
        ) : data.approvalToken ? (
          <p className="mt-5 text-sm text-slate">
            This example is informational. Return to <Link href={`/dashboard/setup?stage=pricing-foundation#price-${data.serviceId}`} className="font-semibold text-electric hover:underline">Your prices</Link> to approve this service together with the others.
          </p>
        ) : null}
      </section>
    </div>
  );
}
