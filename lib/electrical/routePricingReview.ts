import type { PrismaClient } from "@prisma/client";
import { loadPricingSettings, loadServiceForResolution, resolveRoute } from "../routeResolver";
import { proposalRows } from "./onboardingPilotReadiness";
import { loadPilotEligibility } from "./pilotEligibility";
import { pilotRefusalMessage } from "./pilotRefusal";
import { proposeDerivedScope } from "./loadDerivedScope";
import { routeShapeFromAnswers } from "./resolveWithDerivedPricing";
import { routePricingReviewScenario } from "./routePricingReviewScenario";

export type RoutePricingReviewData = {
  serviceId: string;
  serviceName: string;
  scenarioLabel: string;
  scenarioScope: string;
  approved: boolean;
  approvalCurrent: boolean;
  approvalToken: string | null;
  proposal: ReturnType<typeof proposalRows> | null;
  refusal: string | null;
};

export async function loadRoutePricingReview(
  db: PrismaClient,
  contractorId: string,
  serviceId: string,
): Promise<RoutePricingReviewData | null> {
  const service = await db.service.findFirst({
    where: { id: serviceId, contractorId },
    select: {
      id: true, slug: true, name: true, pricingMethod: true, isPrimaryEligible: true,
      materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true,
    },
  });
  if (!service || service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") return null;
  const scenario = routePricingReviewScenario(service.slug);
  if (!scenario) return null;
  const eligibility = await loadPilotEligibility(db, contractorId);
  if (!eligibility.eligible) {
    return {
      serviceId, serviceName: service.name, scenarioLabel: scenario.label, scenarioScope: scenario.scope,
      approved: false, approvalCurrent: false, approvalToken: null, proposal: null,
      refusal: pilotRefusalMessage(eligibility),
    };
  }

  const loaded = await loadServiceForResolution(db, service.id);
  let settings: Awaited<ReturnType<typeof loadPricingSettings>> | null = null;
  try { settings = await loadPricingSettings(db, contractorId); } catch { settings = null; }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resolved = loaded && settings
    ? (resolveRoute(loaded as never, scenario.answers, true, settings as never) as any)
    : null;
  const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];
  if (components.length === 0) {
    return {
      serviceId, serviceName: service.name, scenarioLabel: scenario.label, scenarioScope: scenario.scope,
      approved: false, approvalCurrent: false, approvalToken: null, proposal: null,
      refusal: "The representative route is not ready to calculate.",
    };
  }
  const shape = routeShapeFromAnswers(scenario.answers);
  const { proposal, basisFingerprint } = await proposeDerivedScope(db, {
    contractorId, serviceId, components, routeFeet: shape.routeFeet, turnCount: shape.turnCount,
    context: { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible, servicePermitAdminEstablished: service.permitAdminCents !== null },
    service: {
      materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
      otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible,
    },
  });
  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId } },
    select: { approvedBasisFingerprint: true },
  });
  const priced = proposal.kind === "PRICED";
  return {
    serviceId, serviceName: service.name, scenarioLabel: scenario.label, scenarioScope: scenario.scope,
    approved: approval !== null,
    approvalCurrent: approval?.approvedBasisFingerprint === basisFingerprint,
    approvalToken: priced ? basisFingerprint : null,
    proposal: proposalRows(proposal, settings?.crewHourRateCents ?? null),
    refusal: priced ? null : proposal.reason,
  };
}
