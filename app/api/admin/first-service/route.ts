/**
 * Where the contractor is in getting their first service ready — over HTTP.
 *
 * The same readiness the /dashboard/first-service page renders, for the
 * wizard's client actions and for anything that needs the proposed price
 * without rendering a page. Progress is DERIVED from stored state on every
 * call; nothing here reads or writes a step counter.
 *
 * It also returns what an approval must name. The client echoes those back to
 * /api/admin/derived-pricing-approval, which recomputes and refuses on any
 * difference — so a screen left open while a cost changed cannot approve the
 * old numbers. The digest itself is an internal token, never shown to a
 * contractor.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { loadPilotReadiness, PILOT_SERVICE_SLUG, PILOT_ANSWERS } from "@/lib/electrical/onboardingPilotReadiness";
import { loadDerivedPricingBasis } from "@/lib/electrical/loadDerivedScope";
import { fingerprintBasis } from "@/lib/electrical/derivedPricingBasis";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "@/lib/routeResolver";


export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return withAdminContractor(async (db, ctx) => {
    const service = await db.service.findFirst({
      where: { contractorId: ctx.contractorId, slug: PILOT_SERVICE_SLUG },
      select: { id: true, name: true, active: true, isPrimaryEligible: true,
                materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
    });
    if (!service) {
      return NextResponse.json({ resumeAt: "CATALOG", serviceId: null, live: false });
    }

    const loaded = await loadServiceForResolution(db, service.id);
    let settings: unknown = null;
    try { settings = await loadPricingSettings(db, ctx.contractorId); } catch { settings = null; }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resolved = loaded ? (resolveRoute(loaded as never, PILOT_ANSWERS, true, settings as never) as any) : null;
    const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];

    const readiness = await loadPilotReadiness(db, ctx.contractorId, {
      components,
      context: { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible,
                 servicePermitAdminEstablished: service.permitAdminCents !== null },
      service: { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
                 otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible },
    });

    const approval = await db.contractorDerivedPricingApproval.findUnique({
      where: { contractorId_serviceId: { contractorId: ctx.contractorId, serviceId: service.id } },
      select: { approvedTotalCents: true, approvedAt: true },
    });

    const componentKeys = components.map((c) => c.key);
    const basisToken = componentKeys.length
      ? fingerprintBasis(await loadDerivedPricingBasis(db, ctx.contractorId, componentKeys))
      : null;

    return NextResponse.json({
      serviceId: service.id,
      serviceName: service.name,
      active: service.active,
      live: readiness.live,
      resumeAt: readiness.resumeAt,
      steps: readiness.steps,
      proposed: readiness.proposed,
      previouslyApprovedCents: approval?.approvedTotalCents ?? null,
      approvedAt: approval?.approvedAt ?? null,
      // Echoed back on approve. Internal — never rendered to a contractor.
      approvalRequest: { componentKeys, basisToken },
    });
  });
}
