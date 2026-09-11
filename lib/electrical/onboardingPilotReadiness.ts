/**
 * Where a contractor actually is, read from what they have actually done.
 *
 * NO STEP COUNTER. A stored `wizardStep = 5` is a second source of truth about
 * readiness, and the moment it disagrees with the configuration — a cost
 * cleared, a calibration withdrawn, a material system half-declared — one of
 * them is lying and the wizard has no way to know which. So progress is
 * DERIVED: each step reports done or not from the rows that step writes, and
 * "where do I resume" is simply the first step that is not done.
 *
 * The cost of deriving is a handful of queries per page load. The cost of not
 * deriving is a contractor sent to "Review your price" for a service whose
 * labor they cleared yesterday.
 */
import type { PrismaClient } from "@prisma/client";
import { loadAndPriceDerivedScope } from "./loadDerivedScope";
import { requiredFields, type PricingContext } from "../pricingSettingsState";
import type { DerivedScopeRefusalCode } from "./derivedScopePricing";

export type PilotStepKey =
  | "CATALOG" | "MATERIALS" | "LABOR" | "PRICING_SETTINGS" | "REVIEW" | "APPROVE" | "ACTIVATE";

export type PilotStep = {
  key: PilotStepKey;
  title: string;
  done: boolean;
  /** What is outstanding, in the contractor's words. Empty when done. */
  outstanding: string[];
};

export type PilotReadiness = {
  serviceId: string | null;
  serviceName: string;
  steps: PilotStep[];
  /** The first step not done — where the wizard resumes. Null when finished. */
  resumeAt: PilotStepKey | null;
  /** Present once economics can be computed at all. */
  proposed: {
    totalCents: number | null;
    laborCents: number;
    materialCents: number;
    materialCostCents: number;
    minimumApplied: boolean;
    refusal: DerivedScopeRefusalCode | null;
    refusalReason: string | null;
  } | null;
  /** True only when the customer flow would genuinely return a price. */
  live: boolean;
};

export const PILOT_SERVICE_SLUG = "new-120v-outlet";

/** The straight surface route the pilot proves. */
export const PILOT_ROUTE = { feet: 31, inside: 0, outside: 0, flat: 0 };

export async function loadPilotReadiness(
  db: PrismaClient,
  contractorId: string,
  args: { components: { key: string; quantity: number }[]; context: PricingContext;
          service: { materialMultiplier: number | null; permitAdminCents: number | null;
                     otherDirectCostCents: number | null; isPrimaryEligible: boolean } },
): Promise<PilotReadiness> {
  const service = await db.service.findFirst({
    where: { contractorId, slug: PILOT_SERVICE_SLUG },
    select: { id: true, name: true, active: true, pricingMethod: true },
  });

  if (!service) {
    return {
      serviceId: null, serviceName: "New 120V Outlet",
      steps: [{ key: "CATALOG", title: "Install your Electrical catalog", done: false,
                outstanding: ["Your services have not been set up yet."] }],
      resumeAt: "CATALOG", proposed: null, live: false,
    };
  }

  const priced = await loadAndPriceDerivedScope(db, {
    contractorId, serviceId: service.id, components: args.components,
    routeFeet: PILOT_ROUTE.feet, turnCount: 0,
    context: args.context, service: args.service,
  });

  // Each step asks the rows it owns, so a step can go BACK to not-done when a
  // contractor withdraws something. That is the behaviour a step counter
  // cannot have.
  const takeoffBlocked = priced.kind === "REVIEW" && priced.code === "MATERIAL_TAKEOFF_INCOMPLETE";
  const laborBlocked = priced.kind === "REVIEW" && priced.code === "COMPONENT_LABOR_NOT_ESTABLISHED";
  const settingsBlocked = priced.kind === "REVIEW" &&
    (priced.code === "PRICING_SETTINGS_MISSING" || priced.code === "PRICING_SETTINGS_INCOMPLETE");
  const approvalBlocked = priced.kind === "REVIEW" &&
    (priced.code === "DERIVED_PRICING_NOT_APPROVED" || priced.code === "DERIVED_PRICING_APPROVAL_STALE");

  const settingsRow = await db.pricingSettings.findUnique({
    where: { contractorId },
    select: { crewHourRateCents: true, primaryMinimumCents: true,
              roundingIncrementCents: true, defaultPermitAdminCents: true } });
  const settingsOutstanding = settingsRow
    ? requiredFields(args.context).filter((f) => settingsRow[f] === null)
    : requiredFields(args.context);

  const steps: PilotStep[] = [
    { key: "CATALOG", title: "Install your Electrical catalog", done: true, outstanding: [] },
    { key: "MATERIALS", title: "Choose your materials", done: !takeoffBlocked,
      outstanding: takeoffBlocked && priced.kind === "REVIEW" ? (priced.detail ?? [priced.reason]) : [] },
    { key: "LABOR", title: "Tell us how long this takes you", done: !takeoffBlocked && !laborBlocked,
      outstanding: laborBlocked && priced.kind === "REVIEW" ? (priced.detail ?? [priced.reason]) : [] },
    { key: "PRICING_SETTINGS", title: "Set your pricing basics",
      done: settingsOutstanding.length === 0,
      outstanding: settingsOutstanding },
    { key: "REVIEW", title: "Review your price",
      done: priced.kind === "PRICED" || approvalBlocked, outstanding: [] },
    { key: "APPROVE", title: "Approve this price", done: priced.kind === "PRICED",
      outstanding: approvalBlocked && priced.kind === "REVIEW" ? [priced.reason] : [] },
    { key: "ACTIVATE", title: "Go live", done: service.active && priced.kind === "PRICED",
      outstanding: service.active ? [] : ["This service is not live yet."] },
  ];

  return {
    serviceId: service.id,
    serviceName: service.name,
    steps,
    resumeAt: steps.find((s) => !s.done)?.key ?? null,
    proposed: {
      totalCents: priced.kind === "PRICED" ? priced.totalCents : null,
      laborCents: priced.kind === "PRICED" ? Math.round(priced.breakdown.laborCents) : 0,
      materialCents: priced.kind === "PRICED" ? priced.breakdown.materialCents : 0,
      materialCostCents: priced.kind === "PRICED" ? priced.materialCostCents : 0,
      minimumApplied: priced.kind === "PRICED" ? priced.breakdown.minimumApplied : false,
      refusal: priced.kind === "REVIEW" ? priced.code : null,
      refusalReason: priced.kind === "REVIEW" ? priced.reason : null,
    },
    live: service.active && priced.kind === "PRICED",
  };
}
