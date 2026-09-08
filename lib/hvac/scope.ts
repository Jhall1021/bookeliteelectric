/**
 * `condensate-pump-installation` — H3, the first executable HVAC service.
 *
 * ONE SERVICE, NOT A GENERIC RESOLVER. Mirrors lib/plumbing/scope.ts's ROLE
 * — the layer between a validated answer and the price, deciding WHAT THE
 * JOB IS and never what it costs — but not its generic, multi-service
 * shape. Plumbing's `scopePlumbingService` walks whichever gates a catalog
 * row declares, because sixty-three services share nine families. HVAC has
 * exactly one executable service so far, and a generic n-service walker
 * built for one caller would be scaffolding ahead of need — the same
 * discipline H1 and H2 already applied to composition.ts and publish.ts.
 * When a second HVAC service becomes executable, generalizing this file
 * (or building the multi-service walker H2's own file header already named
 * as H3+ work) is the right time to do it — not now, and not by guessing
 * what a second service will need.
 *
 *   Visual Assist / manual answer
 *     -> validated canonical Guided Pricing input   (not built for HVAC yet)
 *     -> THIS FILE                                  <- one service's scope logic
 *     -> deterministic Price2Book pricing engine    (lib/pricing.ts, untouched)
 *
 * PURE. No database, no clock, no network, no price. Reuses lib/hvac/gates.ts's
 * `accessGate` and `GateOutcome`/`toRouteAction` unchanged — no new gate, no
 * new primitive, no new shared enum. The platform's own `RouteAction`
 * (lib/flow-types.ts) is the result vocabulary throughout, not a
 * service-local invention.
 *
 * THE ONE CANONICAL SERVICE, BOTH BRANCHES, PER THE H3 RECONCILIATION
 *
 * `condensate_route` decides which branch a homeowner is in. `PUMP_PRESENT`
 * is the existing/replacement branch. `NONE_VISIBLE` and
 * `GRAVITY_DRAIN_PRESENT` are BOTH the new-installation branch of this SAME
 * service — neither is a different service, and nothing here can produce
 * `REROUTE_SERVICE`. `equipment_condition` is not read at all: it is
 * effect-free (lib/hvac/mappings.ts's EXISTING_CONDITION_SCOPE), and asking
 * a question no branch reads would tell a homeowner their answer matters
 * when nothing downstream sees it — see the H3 reconciliation's own §7.
 */

import type { RouteAction } from "../flow-types";
import { accessGate, toRouteAction, type AccessClass, type GateOutcome } from "./gates";

export type CondensatePumpBranch = "REPLACEMENT" | "NEW_INSTALLATION";

/** The four condensate_route values — H2's family vocabulary, unchanged. */
export type CondensateRouteObservation =
  | "PUMP_PRESENT"
  | "GRAVITY_DRAIN_PRESENT"
  | "NONE_VISIBLE"
  | "UNKNOWN";

export type SupplyArrangementChoice = "CUSTOMER_SUPPLIED" | "CONTRACTOR_SUPPLIED";

/** dedicated_power_availability's fact — H2, unchanged. */
export type DedicatedCircuitPresence = "PRESENT" | "ABSENT" | "UNKNOWN";

/** run_distance's condensate_run.breakpoints outcome — ONE boundary, so two bands. */
export type CondensateRunBand = "STANDARD" | "OVER_BAND" | "UNKNOWN";

/**
 * Every fact this service's tree can read. Always fully present at
 * resolution time — same discipline as Plumbing's `PlumbingScopeInput`: the
 * caller gathers a complete input before scoping, and this function GATES
 * it rather than progressively collecting it.
 *
 * `dedicatedCircuitPresent` and `runBand` are asked ONLY on the
 * new-installation branch and are simply never read when `condensateRoute`
 * is `PUMP_PRESENT` — not because they are unresolved, but because that
 * branch's questions never establish them. That is ordinary branching, not
 * the diagnostic-risk shape this file exists to refuse; nothing here reads
 * a fact to select a repair, and both of these facts route only to
 * REFUSED-or-CONTINUE, never to a chosen component.
 */
export type CondensatePumpInstallationFacts = {
  /** Q1 — shared start. */
  accessClass: AccessClass;
  /** Q2 — shared start, the branch decision. */
  condensateRoute: CondensateRouteObservation;
  /** Q3 (replacement) / Q5 (new-installation) — asked on both branches. */
  supplyArrangement: SupplyArrangementChoice;
  /** New-installation Q3 only. */
  dedicatedCircuitPresent: DedicatedCircuitPresence;
  /** New-installation Q4 only. */
  runBand: CondensateRunBand;
};

export type CondensatePumpResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
      branch: CondensatePumpBranch;
    }
  | {
      status: "REFUSED";
      routeAction: RouteAction;
      /** Never a price, never a cause — see lib/hvac/gates.ts's own GateOutcome contract. */
      outcome: GateOutcome;
    };

function refuse(outcome: GateOutcome): CondensatePumpResolution {
  return { status: "REFUSED", routeAction: toRouteAction(outcome.action), outcome };
}

/**
 * Resolve `condensate-pump-installation` against a complete fact set.
 *
 * FAILS CLOSED. There is no branch that returns RESOLVED with a fact
 * outstanding, and no default standing in for an unestablished one. Order
 * matches the reconciled question sequence: access first (shared to both
 * branches, and the honest refusal depends on establishing it before
 * anything downstream), then the branch decision, then each branch's own
 * questions in the order a homeowner is actually asked them.
 */
export function resolveCondensatePumpInstallation(
  facts: CondensatePumpInstallationFacts
): CondensatePumpResolution {
  // Q1 — indoor equipment access. Shared to both branches.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q2 — the branch decision. UNKNOWN stops before either branch is chosen.
  if (facts.condensateRoute === "UNKNOWN") {
    return refuse({
      action: "PHOTO_REVIEW",
      reason: "Whether an existing condensate pump is present has not been established.",
      factKey: "condensate_route",
      observed: "UNKNOWN",
    });
  }

  if (facts.condensateRoute === "PUMP_PRESENT") {
    // ── Existing / replacement branch ──────────────────────────────────
    // Q3 — supply arrangement. A homeowner's own choice, always resolvable
    // once asked; both values continue. equipment_condition is not read —
    // see the file header.
    return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "REPLACEMENT" };
  }

  // `GRAVITY_DRAIN_PRESENT` and `NONE_VISIBLE` are BOTH the same branch of
  // the SAME service. Neither is a diagnosis and neither reroutes anywhere.
  // ── New-installation branch ────────────────────────────────────────────

  // Q3 — dedicated power availability. The one product decision the H3
  // instruction settled: PRESENT continues, ABSENT leaves fixed pricing
  // (there is no approved cross-trade electrical composition path yet, so
  // a missing receptacle means this fixed-price installation cannot be
  // completed as promised), UNKNOWN stops.
  if (facts.dedicatedCircuitPresent === "UNKNOWN") {
    return refuse({
      action: "PHOTO_REVIEW",
      reason: "Whether a receptacle is within reach of the intended pump location has not been established.",
      factKey: "dedicated_circuit_present",
      observed: "UNKNOWN",
    });
  }
  if (facts.dedicatedCircuitPresent === "ABSENT") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason:
        "No receptacle is within reach of the intended pump location, and this fixed-price installation cannot be completed as promised without one.",
      factKey: "dedicated_circuit_present",
      observed: "ABSENT",
    });
  }

  // Q4 — discharge/tubing run distance. condensate_run.breakpoints has
  // exactly ONE boundary (hvac-v0-architecture.md §E.7), so this service's
  // run_band is two-valued — STANDARD or OVER_BAND — never a third
  // EXTENDED tier the generic family vocabulary could otherwise support.
  if (facts.runBand === "UNKNOWN") {
    return refuse({
      action: "PHOTO_REVIEW",
      reason: "The discharge line's run distance has not been established.",
      factKey: "run_band",
      observed: "UNKNOWN",
    });
  }
  if (facts.runBand === "OVER_BAND") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "The discharge line's run is longer than this contractor's standard band.",
      factKey: "run_band",
      observed: "OVER_BAND",
    });
  }

  // Q5 — supply arrangement. Same policy, same always-resolvable choice as
  // the replacement branch's Q3.
  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "NEW_INSTALLATION" };
}

// ---------------------------------------------------------------------------
// The question sequence as DATA, not just control flow — so a verifier (and
// eventually Visual Assist / the tree composer) can inspect wording and
// vocabulary without re-deriving them from the function above. Deliberately
// NOT lib/hvac/families.ts's shape: that file stays a manifest for all 15
// families across all 22 services, and giving it real question content for
// only one service's two branches would misrepresent the other 21 as
// further along than they are.
// ---------------------------------------------------------------------------

export type CondensatePumpQuestionKey =
  | "indoor_access"
  | "condensate_route"
  | "supply_arrangement_replacement"
  | "dedicated_power"
  | "run_distance"
  | "supply_arrangement_new_installation";

export type CondensatePumpAnswerOption = {
  value: string;
  /** Customer-ready wording. An observation or a choice — never a cause. */
  label: string;
};

export type CondensatePumpQuestion = {
  key: CondensatePumpQuestionKey;
  branch: CondensatePumpBranch | "SHARED";
  prompt: string;
  establishes: string;
  options: readonly CondensatePumpAnswerOption[];
};

export const CONDENSATE_PUMP_QUESTIONS: readonly CondensatePumpQuestion[] = [
  {
    key: "indoor_access",
    branch: "SHARED",
    prompt: "Where is the indoor equipment?",
    establishes: "indoor_location",
    options: [
      { value: "BASEMENT", label: "Basement" },
      { value: "UTILITY_CLOSET", label: "Utility closet" },
      { value: "GARAGE", label: "Garage" },
      { value: "ATTIC", label: "Attic" },
      { value: "CRAWL_SPACE", label: "Crawl space" },
      { value: "MECHANICAL_ROOM", label: "Mechanical room" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "condensate_route",
    branch: "SHARED",
    prompt: "Is there a small pump with a plastic reservoir beside or under the equipment?",
    establishes: "condensate_route",
    options: [
      { value: "PUMP_PRESENT", label: "Yes, there's a pump there now" },
      { value: "GRAVITY_DRAIN_PRESENT", label: "No, but there's a drain line that runs away on its own" },
      { value: "NONE_VISIBLE", label: "No, I don't see anything like that" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "supply_arrangement_replacement",
    branch: "REPLACEMENT",
    prompt: "Do you already have the replacement pump, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
  {
    key: "dedicated_power",
    branch: "NEW_INSTALLATION",
    prompt: "Is there a normal outlet within reach of where the pump would be installed?",
    establishes: "dedicated_circuit_present",
    options: [
      { value: "PRESENT", label: "Yes, there's an outlet nearby" },
      { value: "ABSENT", label: "No, there isn't one nearby" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "run_distance",
    branch: "NEW_INSTALLATION",
    // {b1} is the contractor's own boundary — see lib/policyBands.ts. Never
    // shipped with the hole unresolved; rendering it is a template-layer
    // concern this file does not perform.
    prompt: "About how far would the discharge line need to run to a suitable drain point?",
    establishes: "run_band",
    options: [
      { value: "STANDARD", label: "{b1} feet or less" },
      { value: "OVER_BAND", label: "More than {b1} feet" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "supply_arrangement_new_installation",
    branch: "NEW_INSTALLATION",
    prompt: "Do you already have the pump, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
] as const;
