/**
 * "Is this contractor ready to run the onboarding pilot, and where are they stuck?"
 *
 * A SUPPORT VIEW, NOT A SECOND READINESS TRUTH. Every check is read from the
 * wizard's own loader (loadFirstServiceWizard) and the homeowner resolver the
 * storefront uses. Nothing here decides readiness differently; it only says
 * the same thing in words a support person can read out to a contractor.
 *
 * Friendly text only — no role keys, no component keys, no approval digests.
 */
import type { PrismaClient } from "@prisma/client";
import { loadFirstServiceWizard } from "./firstServiceWizardData";
import { PILOT_ANSWERS, PILOT_SERVICE_SLUG } from "./onboardingPilotReadiness";
import { resolveRouteWithDerivedPricing } from "./resolveWithDerivedPricing";
import { loadServiceForResolution, loadPricingSettings } from "../routeResolver";
import { FIELD_PROMPT, type PricingSettingsField } from "../pricingSettingsState";
import { PILOT_LIMITATIONS } from "./pilotScope";

export type PilotSupportStatus =
  | "Catalog not installed"
  | "Materials incomplete"
  | "Labor incomplete"
  | "Pricing setup incomplete"
  | "Price ready to approve"
  | "Price needs review"
  | "Ready to activate"
  | "Live";

export type PilotCheck = { label: string; ok: boolean; detail: string | null };

export type PilotDiagnostic = {
  status: PilotSupportStatus;
  /** What the contractor should do next, in one sentence. */
  nextAction: string;
  checks: PilotCheck[];
  /** What is still missing, by friendly name. */
  missing: string[];
  /** The frozen pilot boundaries, so a support view states them without importing them. */
  limitations: readonly string[];
  audit: {
    lastSetupActivityAt: Date | null;
    approvedAt: Date | null;
    approvedTotalCents: number | null;
    currentProposedCents: number | null;
    costChangesSinceApproval: number;
    laborChangesSinceApproval: number;
    pricingChangesSinceApproval: boolean;
    active: boolean;
    pricedBookings: number;
    lastPricedBookingAt: Date | null;
    storefrontVerdict: "PRICED" | "REVIEW" | "NOT_AVAILABLE";
    storefrontReason: string | null;
  };
};

const max = (...ds: (Date | null | undefined)[]) =>
  ds.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

export async function loadPilotDiagnostic(db: PrismaClient, contractorId: string): Promise<PilotDiagnostic> {
  const w = await loadFirstServiceWizard(db, contractorId);

  if (!w.catalogInstalled) {
    return {
      status: "Catalog not installed",
      nextAction: "Add the Electrical services from the first-service page.",
      checks: [{ label: "Catalog installed", ok: false, detail: null }],
      missing: ["Electrical services"],
      limitations: PILOT_LIMITATIONS,
      audit: { lastSetupActivityAt: null, approvedAt: null, approvedTotalCents: null, currentProposedCents: null,
        costChangesSinceApproval: 0, laborChangesSinceApproval: 0, pricingChangesSinceApproval: false,
        active: false, pricedBookings: 0, lastPricedBookingAt: null, storefrontVerdict: "NOT_AVAILABLE", storefrontReason: null },
    };
  }

  const done = (k: string) => w.steps.find((s) => s.key === k)?.done ?? false;
  const service = await db.service.findUniqueOrThrow({
    where: { id: w.serviceId }, select: { pricingMethod: true, active: true } });

  const setupQuestions: string[] = [];
  if (!w.system.conductorGauge) setupQuestions.push("Wire size");
  if (!w.system.groundingStrategy) setupQuestions.push("Grounding");
  if (w.system.supportSpacingFt === null || w.system.supportAtEachTerminus === null) setupQuestions.push("Support clip spacing");
  if (!w.system.sourceTermination || !w.system.destinationTermination) setupQuestions.push("Channel entry fittings");
  if (!w.system.slackDecided) setupQuestions.push("Extra wire at connections");
  const missingParts = w.parts.filter((p) => !p.configured).map((p) => `Price for ${p.name}`);
  const missingLabor = w.labor.filter((l) => l.hours === null).map((l) => `Labor for ${l.label}`);
  const p = w.pricing;
  const missingPricing = (["crewHourRateCents", "primaryMinimumCents", "roundingIncrementCents", ...(p.permitAsked ? ["defaultPermitAdminCents"] : [])] as PricingSettingsField[])
    .filter((f) => p[f] === null).map((f) => `Decide ${FIELD_PROMPT[f]}`);

  const materialsOk = done("MATERIALS");
  const laborOk = done("LABOR");
  const pricingOk = done("PRICING_SETTINGS");
  const approvedCurrent = done("APPROVE");

  // The storefront, asked exactly as a homeowner's request asks it.
  let storefrontVerdict: "PRICED" | "REVIEW" | "NOT_AVAILABLE" = "NOT_AVAILABLE";
  let storefrontReason: string | null = null;
  const loaded = await loadServiceForResolution(db, w.serviceId);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db, contractorId); } catch { settings = null; }
  if (loaded && settings) {
    const v = await resolveRouteWithDerivedPricing(db, loaded, PILOT_ANSWERS, true, settings as never);
    storefrontVerdict = v.status === "PRICED" ? "PRICED" : "REVIEW";
    storefrontReason = v.status === "PRICED" ? null : ("reason" in v ? (v.reason as string) : null);
  } else {
    storefrontReason = "Pricing setup is not complete, so no price can be worked out yet.";
  }

  // ── durable audit, from records that already exist ──
  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId: w.serviceId } },
    select: { approvedAt: true, approvedTotalCents: true } });
  const since = approval?.approvedAt ?? null;
  const [lastMat, lastLab, lastSys, lastSet, lastPol, costChanges, laborChanges, pricingRow, booked, lastBooked] = await Promise.all([
    db.contractorMaterial.aggregate({ where: { contractorId }, _max: { updatedAt: true } }),
    db.contractorComponent.aggregate({ where: { contractorId }, _max: { updatedAt: true } }),
    db.contractorMaterialSystem.aggregate({ where: { contractorId }, _max: { updatedAt: true } }),
    db.pricingSettings.findUnique({ where: { contractorId }, select: { updatedAt: true } }),
    db.contractorPolicyValue.aggregate({ where: { contractorId }, _max: { resolvedAt: true } }),
    since ? db.materialCostEvent.count({ where: { contractorId, createdAt: { gt: since } } }) : Promise.resolve(0),
    since ? db.contractorComponent.count({ where: { contractorId, updatedAt: { gt: since } } }) : Promise.resolve(0),
    db.pricingSettings.findUnique({ where: { contractorId }, select: { updatedAt: true } }),
    db.lineItem.count({ where: { serviceId: w.serviceId, resolvedEconomicBasis: { not: null } } }),
    db.lineItem.findFirst({ where: { serviceId: w.serviceId, resolvedEconomicBasis: { not: null } },
      orderBy: { id: "desc" }, select: { visit: { select: { createdAt: true } } } }),
  ]);

  const checks: PilotCheck[] = [
    { label: "Catalog installed", ok: true, detail: null },
    { label: "Pilot service present", ok: service.pricingMethod === "DERIVED_RESOLVED_SCOPE",
      detail: service.pricingMethod === "DERIVED_RESOLVED_SCOPE" ? `${w.serviceName}, priced from its own costs` : `${w.serviceName} uses a published price, not the pilot pricing` },
    { label: "Materials configured", ok: materialsOk, detail: materialsOk ? null : `${setupQuestions.length + missingParts.length} still needed` },
    { label: "Labor configured", ok: laborOk, detail: laborOk ? null : `${missingLabor.length} of ${w.labor.length} still needed` },
    { label: "Pricing setup complete", ok: pricingOk, detail: pricingOk ? null : `${missingPricing.length} decision(s) still needed` },
    { label: "Price approved and current", ok: approvedCurrent,
      detail: w.needsReapproval ? "Costs changed after approval" : approval ? null : "Not approved yet" },
    { label: "Service live", ok: service.active, detail: null },
    { label: "Homeowners get a fixed price", ok: storefrontVerdict === "PRICED", detail: storefrontReason },
  ];

  let status: PilotSupportStatus;
  let nextAction: string;
  if (!materialsOk) { status = "Materials incomplete"; nextAction = "Finish the Materials step: how they run surface wiring and what they pay for the parts."; }
  else if (!laborOk) { status = "Labor incomplete"; nextAction = "Finish the Labor step with the contractor's own times."; }
  else if (!pricingOk) { status = "Pricing setup incomplete"; nextAction = "Finish the pricing decisions."; }
  else if (w.needsReapproval) { status = "Price needs review"; nextAction = "Costs changed — review and approve the updated price."; }
  else if (!approvedCurrent) { status = "Price ready to approve"; nextAction = "Review the proposed price and approve it."; }
  else if (!service.active) { status = "Ready to activate"; nextAction = `Make ${w.serviceName} bookable.`; }
  else { status = "Live"; nextAction = "Nothing to do."; }

  return {
    status, nextAction, checks,
    missing: [...setupQuestions, ...missingParts, ...missingLabor, ...missingPricing],
    limitations: PILOT_LIMITATIONS,
    audit: {
      lastSetupActivityAt: max(lastMat._max.updatedAt, lastLab._max.updatedAt, lastSys._max.updatedAt, lastSet?.updatedAt, lastPol._max.resolvedAt),
      approvedAt: approval?.approvedAt ?? null,
      approvedTotalCents: approval?.approvedTotalCents ?? null,
      currentProposedCents: w.proposal?.totalCents ?? null,
      costChangesSinceApproval: costChanges,
      laborChangesSinceApproval: laborChanges,
      pricingChangesSinceApproval: !!(since && pricingRow && pricingRow.updatedAt > since),
      active: service.active,
      pricedBookings: booked,
      lastPricedBookingAt: lastBooked?.visit.createdAt ?? null,
      storefrontVerdict,
      storefrontReason,
    },
  };
}

export { PILOT_SERVICE_SLUG };
