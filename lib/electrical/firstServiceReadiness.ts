/**
 * Where the contractor is in getting their first service ready — the decision
 * behind GET /api/admin/first-service.
 *
 * Progress is DERIVED from stored state on every call; nothing here reads or
 * writes a step counter. It also returns what an approval must name: the
 * client echoes those back to /api/admin/derived-pricing-approval, which
 * recomputes and refuses on any difference. The digest is an internal token,
 * never shown to a contractor.
 *
 * A contractor this fixed-price pilot does not support is refused FIRST, with
 * the named code, before any readiness, price or approval token is computed —
 * lib/electrical/pilotEligibility.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { loadPilotReadiness, PILOT_SERVICE_SLUG, PILOT_ANSWERS } from "./onboardingPilotReadiness";
import { loadDerivedPricingBasis } from "./loadDerivedScope";
import { fingerprintBasis } from "./derivedPricingBasis";
import { loadPilotEligibility, pilotRefusalBody } from "./pilotEligibility";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../routeResolver";

export async function readFirstServiceReadiness(
  db: PrismaClient, contractorId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const eligibility = await loadPilotEligibility(db, contractorId);
  if (!eligibility.eligible) return { status: 409, body: pilotRefusalBody(eligibility) };

  const service = await db.service.findFirst({
    where: { contractorId, slug: PILOT_SERVICE_SLUG },
    select: { id: true, name: true, active: true, isPrimaryEligible: true,
              materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
  });
  if (!service) {
    return { status: 200, body: { resumeAt: "CATALOG", serviceId: null, live: false } };
  }

  const loaded = await loadServiceForResolution(db, service.id);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db, contractorId); } catch { settings = null; }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resolved = loaded ? (resolveRoute(loaded as never, PILOT_ANSWERS, true, settings as never) as any) : null;
  const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];

  const readiness = await loadPilotReadiness(db, contractorId, {
    components,
    context: { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible,
               servicePermitAdminEstablished: service.permitAdminCents !== null },
    service: { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
               otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible },
  });

  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId: service.id } },
    select: { approvedTotalCents: true, approvedAt: true },
  });

  const componentKeys = components.map((c) => c.key);
  const basisToken = componentKeys.length
    ? fingerprintBasis(await loadDerivedPricingBasis(db, contractorId, componentKeys))
    : null;

  return {
    status: 200,
    body: {
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
    },
  };
}
