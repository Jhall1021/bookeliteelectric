import EstimateEditor from "@/components/portal/pricing/EstimateEditor";
import { withAdminContractor } from "@/lib/adminContext";
import { readiness, suggestBounds } from "@/lib/pricingReadiness";

export const dynamic = "force-dynamic";

/**
 * Estimated hours — the TIME_AND_MATERIALS calibration screen (ADR-018).
 *
 * Every service arrives with the contractor's OWN labour baseline already on
 * it, because the audit found all 56 active non-quote-only services carry
 * `fieldLaborHours`. So this screen does not ask a contractor to start from
 * nothing. It shows what they already told us, offers a suggested band, and
 * asks the one thing Price2Book cannot know: how uncertain is this job.
 */
export default async function EstimatesPage() {
  const data = await withAdminContractor(async (db, ctx) => {
    const [strategy, rate, services] = await Promise.all([
      db.contractor.findUniqueOrThrow({ where: { id: ctx.contractorId }, select: { pricingStrategy: true } }),
      db.pricingSettings.findUnique({ where: { contractorId: ctx.contractorId }, select: { crewHourRateCents: true } }),
      db.service.findMany({
        where: { active: true },
        orderBy: [{ bookingType: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, slug: true, bookingType: true, active: true,
          fieldLaborHours: true,
          estimateLowCrewHours: true, estimateHighCrewHours: true, estimateApprovedAt: true,
          publishedPriceApprovedAt: true, basePrice: true,
          materialCostResolved: true, unresolvedMaterialKeys: true, unresolvedPolicyKeys: true,
        },
      }),
    ]);
    return { strategy: strategy.pricingStrategy, rate: rate?.crewHourRateCents ?? null, services };
  });

  const rows = data.services
    // Quote-only services never receive an automatic figure, so they are not
    // asked to carry a band. Showing them here would invent work.
    .filter((s) => s.bookingType !== "REMOTE_QUOTE")
    .map((s) => ({
      id: s.id,
      name: s.name,
      baselineHours: s.fieldLaborHours,
      suggested: suggestBounds(s.fieldLaborHours),
      low: s.estimateLowCrewHours,
      high: s.estimateHighCrewHours,
      approved: s.estimateApprovedAt !== null,
      blockers: readiness(s, "TIME_AND_MATERIALS").blockers
        .filter((b) => b.code === "materials" || b.code === "policy")
        .map((b) => b.message),
    }));

  return (
    <EstimateEditor
      strategy={data.strategy}
      crewHourRateCents={data.rate}
      rows={rows}
      quoteOnlyCount={data.services.filter((s) => s.bookingType === "REMOTE_QUOTE").length}
    />
  );
}
