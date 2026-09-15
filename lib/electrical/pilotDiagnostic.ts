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
  // A contractor this fixed-price pilot does not support. Checked before every
  // other state, so none of the states below can be reached for them.
  | "Not available for time-and-materials pricing"
  | "Not available for this pricing model"
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
    /** The verdict in words that are true for this contractor's pricing model. */
    storefrontOutcome: string;
  };
};

const max = (...ds: (Date | null | undefined)[]) =>
  ds.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

/** The storefront, asked exactly as a homeowner's request asks it. */
async function storefrontNow(db: PrismaClient, contractorId: string, serviceId: string) {
  const loaded = await loadServiceForResolution(db, serviceId);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db, contractorId); } catch { settings = null; }
  if (!loaded || !settings) {
    return { verdict: "NOT_AVAILABLE" as const, reason: "Pricing setup is not complete, so no price can be worked out yet." };
  }
  const v = await resolveRouteWithDerivedPricing(db, loaded, PILOT_ANSWERS, true, settings as never);
  return v.status === "PRICED"
    ? { verdict: "PRICED" as const, reason: null }
    : { verdict: "REVIEW" as const, reason: "reason" in v ? (v.reason as string) : null };
}

const outcomeWords = (verdict: "PRICED" | "REVIEW" | "NOT_AVAILABLE", pricedWords: string) =>
  verdict === "PRICED" ? pricedWords : verdict === "REVIEW" ? "review" : "not available";

export async function loadPilotDiagnostic(db: PrismaClient, contractorId: string): Promise<PilotDiagnostic> {
  const w = await loadFirstServiceWizard(db, contractorId);

  // ── not a contractor this pilot supports: a readiness OUTCOME, not a label ──
  // The status, next step and checks come from the one eligibility decision.
  // What is still reported is fact — whether a pilot service exists, is live,
  // what the storefront does now (review: the resolver refuses a derived price
  // for them), and whether any priced booking was ever recorded.
  if (!w.pilotAvailable) {
    const svc = await db.service.findFirst({
      where: { contractorId, slug: PILOT_SERVICE_SLUG }, select: { id: true, active: true } });
    const store = svc ? await storefrontNow(db, contractorId, svc.id) : { verdict: "NOT_AVAILABLE" as const, reason: null };
    const approval = svc ? await db.contractorDerivedPricingApproval.findUnique({
      where: { contractorId_serviceId: { contractorId, serviceId: svc.id } },
      select: { approvedAt: true, approvedTotalCents: true } }) : null;
    const booked = svc ? await db.lineItem.count({ where: { serviceId: svc.id, resolvedEconomicBasis: { not: null } } }) : 0;
    const status = (w.copy.supportStatus || "Not available for this pricing model") as PilotSupportStatus;
    return {
      status,
      nextAction: w.copy.supportNextAction || w.unavailable.message,
      checks: [
        { label: "Pricing model supported by this pilot", ok: false, detail: w.copy.strategyLabel },
        { label: "Catalog installed", ok: w.catalogInstalled, detail: null },
        { label: w.copy.homeownerPricedCheck, ok: false, detail: store.reason },
      ],
      missing: [],
      limitations: PILOT_LIMITATIONS,
      audit: {
        lastSetupActivityAt: null,
        approvedAt: approval?.approvedAt ?? null,
        approvedTotalCents: approval?.approvedTotalCents ?? null,
        currentProposedCents: null,
        costChangesSinceApproval: 0, laborChangesSinceApproval: 0, pricingChangesSinceApproval: false,
        active: svc?.active ?? false,
        pricedBookings: booked, lastPricedBookingAt: null,
        storefrontVerdict: store.verdict, storefrontReason: store.reason,
        storefrontOutcome: outcomeWords(store.verdict, w.copy.homeownerPricedOutcome),
      },
    };
  }

  if (!w.catalogInstalled) {
    return {
      status: "Catalog not installed",
      nextAction: "Add the Electrical services from the first-service page.",
      checks: [{ label: "Catalog installed", ok: false, detail: null }],
      missing: ["Electrical services"],
      limitations: PILOT_LIMITATIONS,
      audit: { lastSetupActivityAt: null, approvedAt: null, approvedTotalCents: null, currentProposedCents: null,
        costChangesSinceApproval: 0, laborChangesSinceApproval: 0, pricingChangesSinceApproval: false,
        active: false, pricedBookings: 0, lastPricedBookingAt: null, storefrontVerdict: "NOT_AVAILABLE", storefrontReason: null,
        storefrontOutcome: outcomeWords("NOT_AVAILABLE", w.copy.homeownerPricedOutcome) },
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

  const store = await storefrontNow(db, contractorId, w.serviceId);
  const storefrontVerdict = store.verdict;
  const storefrontReason = store.reason;

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
    { label: w.copy.homeownerPricedCheck, ok: storefrontVerdict === "PRICED", detail: storefrontReason },
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
      storefrontOutcome: outcomeWords(storefrontVerdict, w.copy.homeownerPricedOutcome),
    },
  };
}

export { PILOT_SERVICE_SLUG };
