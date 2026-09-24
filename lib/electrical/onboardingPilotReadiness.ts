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
import { loadAndPriceDerivedScope, proposeDerivedScope } from "./loadDerivedScope";
import { requiredFields, type PricingContext } from "../pricingSettingsState";
import type { DerivedScopeRefusalCode } from "./derivedScopePricing";
import { NEW_OUTLET_REVIEW_ANSWERS, NEW_OUTLET_REVIEW_ROUTE } from "./routePricingReviewScenario";
import { loadPilotEligibility, type PilotEligibility } from "./pilotEligibility";
import { pilotSetupCopy } from "../pricingCopy";

export type PilotStepKey =
  | "ELIGIBILITY" | "CATALOG" | "MATERIALS" | "LABOR" | "PRICING_SETTINGS" | "REVIEW" | "APPROVE" | "ACTIVATE";

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
  /**
   * The price approving now would produce, as the rows a contractor reads.
   * Every row comes from the engine's own breakdown and they reconcile exactly
   * to `totalCents`; a row that contributes nothing is zero so the page can
   * leave it out rather than print "$0.00 permit".
   */
  proposed: ProposalRows & {
    refusal: DerivedScopeRefusalCode | null;
    refusalReason: string | null;
  } | null;
  /** True only when the customer flow would genuinely return a price. */
  live: boolean;
  /**
   * Whether this contractor may use the fixed-price pilot at all. When not,
   * the ONLY step is ELIGIBILITY, never done: no proposal, no approval step,
   * not live — the pilot readiness model cannot report "ready to approve",
   * "ready to activate" or "live" for a contractor it does not support.
   */
  eligibility: PilotEligibility;
};

export const PILOT_SERVICE_SLUG = "new-120v-outlet";

/** The straight surface route the pilot proves. */
export const PILOT_ROUTE = NEW_OUTLET_REVIEW_ROUTE;

/**
 * The straight pilot route, answered exactly as a homeowner would.
 *
 * `below_above_access` precedes the install method and only "no_access"
 * reaches it — omitting it made the route INVALID, which read downstream as a
 * missing product. One definition, shared by the page, the readiness route
 * and the suites, so they cannot drift onto different routes.
 *
 * `outlet_load_type: "everyday"` and `outlet_power_source: "tap_existing"` —
 * NOT `purpose: "general_use"`. A prior correction here had the rename
 * backwards. `prisma/seed-questions.ts` creates `purpose` first, but
 * `prisma/seed-outlet-power-source.ts` runs after it in every real seed chain
 * that includes it and explicitly RETIRES `purpose` — its own comment: "Two
 * questions asking nearly the same thing is worse than either alone, so the
 * older one goes rather than being routed around" — deleting the question
 * outright and replacing it with these two: `outlet_load_type` ("What will
 * you be plugging in?", `everyday` continues to `outlet_power_source`, every
 * other answer reroutes or reviews) then `outlet_power_source` ("How would
 * you like it powered?", `tap_existing` continues into `below_above_access`,
 * `dedicated` reroutes). `purpose` is the one no longer read; answering it
 * left the route unqualified before it ever reached `below_above_access`,
 * which is what made every derived-pricing rehearsal that walks answers
 * through `resolveRoute` (rather than handing `loadSurfaceTakeoff` a
 * component list directly) fail before it ever reached the surface-raceway
 * module — including, precisely, an apparent SURFACE_RACEWAY_JOINT refusal
 * that was actually an empty component list one qualification question
 * upstream of any material at all.
 */
export const PILOT_ANSWERS = NEW_OUTLET_REVIEW_ANSWERS;


export type ProposalRows = {
  totalCents: number | null;
  laborHours: number;
  crewHourRateCents: number | null;
  /** Hours x rate, BEFORE any service-call minimum. */
  laborCents: number;
  /** What the minimum added on top of labor. Zero when it did not apply. */
  minimumAdjustmentCents: number;
  minimumApplied: boolean;
  /** What the contractor actually pays for materials, package-rounded. */
  materialCostCents: number;
  /** The progressive markup the engine applied to that cost. */
  materialMarkupCents: number;
  permitCents: number;
  /** What rounding up to the contractor's increment added. */
  roundingCents: number;
};

/** Split the engine's breakdown into rows that add up, and nothing invented. */
export function proposalRows(
  proposal: import("./derivedScopePricing").DerivedScopeResult,
  crewHourRateCents: number | null,
): ProposalRows {
  if (proposal.kind !== "PRICED") {
    return { totalCents: null, laborHours: 0, crewHourRateCents, laborCents: 0,
             minimumAdjustmentCents: 0, minimumApplied: false, materialCostCents: 0,
             materialMarkupCents: 0, permitCents: 0, roundingCents: 0 };
  }
  const b = proposal.breakdown;
  const rawLabor = crewHourRateCents === null ? b.laborCents : b.actualTechHours * crewHourRateCents;
  const flooredLabor = b.laborCents;
  const subtotal = flooredLabor + b.materialCents + b.permitCents + b.otherCents;
  return {
    totalCents: proposal.totalCents,
    laborHours: proposal.laborHours,
    crewHourRateCents,
    laborCents: Math.round(rawLabor),
    minimumAdjustmentCents: b.minimumApplied ? Math.round(flooredLabor - rawLabor) : 0,
    minimumApplied: b.minimumApplied,
    materialCostCents: proposal.materialCostCents,
    materialMarkupCents: b.materialCents - proposal.materialCostCents,
    permitCents: b.permitCents,
    roundingCents: Math.round(proposal.totalCents - subtotal),
  };
}

export async function loadPilotReadiness(
  db: PrismaClient,
  contractorId: string,
  args: { components: { key: string; quantity: number }[]; context: PricingContext;
          service: { materialMultiplier: number | null; permitAdminCents: number | null;
                     otherDirectCostCents: number | null; isPrimaryEligible: boolean } },
): Promise<PilotReadiness> {
  const eligibility = await loadPilotEligibility(db, contractorId);
  if (!eligibility.eligible) {
    return {
      serviceId: null, serviceName: "New 120V Outlet",
      steps: [{ key: "ELIGIBILITY", title: pilotSetupCopy(eligibility).unavailableTitle,
                done: false, outstanding: [pilotSetupCopy(eligibility).unavailableMessage] }],
      resumeAt: "ELIGIBILITY", proposed: null, live: false, eligibility,
    };
  }
  const copy = pilotSetupCopy(eligibility);

  const service = await db.service.findFirst({
    where: { contractorId, slug: PILOT_SERVICE_SLUG },
    select: { id: true, name: true, active: true, pricingMethod: true },
  });

  if (!service) {
    return {
      serviceId: null, serviceName: "New 120V Outlet",
      steps: [{ key: "CATALOG", title: "Install your Electrical catalog", done: false,
                outstanding: ["Your services have not been set up yet."] }],
      resumeAt: "CATALOG", proposed: null, live: false, eligibility,
    };
  }

  const scopeArgs = {
    contractorId, serviceId: service.id, components: args.components,
    routeFeet: PILOT_ROUTE.feet, turnCount: 0,
    context: args.context, service: args.service,
  };
  const priced = await loadAndPriceDerivedScope(db, scopeArgs);
  // What approving now would produce — so the review step can show the price
  // BEFORE it is approved, and a stale approval can show the new figure.
  const { proposal } = await proposeDerivedScope(db, scopeArgs);

  // Each step asks the rows it owns, so a step can go BACK to not-done when a
  // contractor withdraws something. That is the behaviour a step counter
  // cannot have.
  const takeoffBlocked = priced.kind === "REVIEW" && priced.code === "MATERIAL_TAKEOFF_INCOMPLETE";
  const laborBlocked = priced.kind === "REVIEW" &&
    (priced.code === "COMPONENT_LABOR_NOT_ESTABLISHED" || priced.code === "ATOMIC_LABOR_NOT_ESTABLISHED");
  const settingsBlocked = priced.kind === "REVIEW" &&
    (priced.code === "PRICING_SETTINGS_MISSING" || priced.code === "PRICING_SETTINGS_INCOMPLETE");
  const approvalBlocked = priced.kind === "REVIEW" &&
    (priced.code === "DERIVED_PRICING_NOT_APPROVED" || priced.code === "DERIVED_PRICING_APPROVAL_STALE");

  const settingsRow = await db.pricingSettings.findUnique({
    where: { contractorId },
    select: { crewHourRateCents: true, electricianHourRateCents: true,
              fixtureHeight12Percent: true, fixtureHeight14Percent: true, primaryMinimumCents: true,
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
    { key: "REVIEW", title: copy.reviewStepTitle,
      done: proposal.kind === "PRICED", outstanding: [] },
    { key: "APPROVE", title: copy.approveStepTitle, done: priced.kind === "PRICED",
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
      ...proposalRows(proposal, settingsRow?.crewHourRateCents ?? null),
      refusal: priced.kind === "REVIEW" ? priced.code : null,
      refusalReason: priced.kind === "REVIEW" ? priced.reason : null,
    },
    live: service.active && priced.kind === "PRICED",
    eligibility,
  };
}
