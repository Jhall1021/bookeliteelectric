/**
 * HVAC's executable services — H3 added `condensate-pump-installation`, H4
 * adds `thermostat-installation`. Two independent resolvers, not a generic
 * n-service engine.
 *
 * STILL NOT A GENERIC RESOLVER, EVEN AT TWO. Mirrors lib/plumbing/scope.ts's
 * ROLE — the layer between a validated answer and the price, deciding WHAT
 * THE JOB IS and never what it costs — but not its generic, multi-service
 * shape. Plumbing's `scopePlumbingService` walks whichever gates a catalog
 * row declares, because sixty-three services share nine families and one
 * shape genuinely pays for itself. Two HVAC services with materially
 * different branch structures (condensate's is a flat gate sequence per
 * branch; thermostat's calls back into a SHARED gate with an explicit
 * opt-in for one narrow exception) do not yet establish that a common shape
 * exists to extract — see H4's own instruction against building one merely
 * because a second resolver arrived. What genuinely IS shared between them
 * — `SupplyArrangementChoice` (the same primitive, same two values) and the
 * tiny `refuse()` helper — is shared, narrowly, below. Nothing else is.
 *
 *   Visual Assist / manual answer
 *     -> validated canonical Guided Pricing input   (not built for HVAC yet)
 *     -> THIS FILE                                  <- each service's own scope logic
 *     -> deterministic Price2Book pricing engine    (lib/pricing.ts, untouched)
 *
 * PURE. No database, no clock, no network, no price. Reuses lib/hvac/gates.ts's
 * `accessGate`, `identityGate`, `controlGate` and `GateOutcome`/`toRouteAction`
 * unchanged in count — H4 narrowly EXTENDED `controlGate` with two optional,
 * default-preserving parameters (see gates.ts's own comment), not an eighth
 * gate. The platform's own `RouteAction` (lib/flow-types.ts) is the result
 * vocabulary throughout, not a service-local invention.
 */

import type { RouteAction } from "../flow-types";
import {
  accessGate,
  identityGate,
  controlGate,
  toRouteAction,
  type AccessClass,
  type GateOutcome,
  type SystemType,
  type ControlPresent,
  type TerminalScheme,
  type CommonWirePresence,
} from "./gates";

/** Shared by every HVAC resolver's REFUSED case — see the file header. */
type HvacRefusal = {
  status: "REFUSED";
  routeAction: RouteAction;
  /** Never a price, never a cause — see lib/hvac/gates.ts's own GateOutcome contract. */
  outcome: GateOutcome;
};

function refuse(outcome: GateOutcome): HvacRefusal {
  return { status: "REFUSED", routeAction: toRouteAction(outcome.action), outcome };
}

export type SupplyArrangementChoice = "CUSTOMER_SUPPLIED" | "CONTRACTOR_SUPPLIED";

// ═══════════════════════════════════════════════════════════════════════
// condensate-pump-installation — H3
//
// `condensate_route` decides which branch a homeowner is in. `PUMP_PRESENT`
// is the existing/replacement branch. `NONE_VISIBLE` and
// `GRAVITY_DRAIN_PRESENT` are BOTH the new-installation branch of this SAME
// service — neither is a different service, and nothing here can produce
// `REROUTE_SERVICE`. `equipment_condition` is not read at all: it is
// effect-free (lib/hvac/mappings.ts's EXISTING_CONDITION_SCOPE), and asking
// a question no branch reads would tell a homeowner their answer matters
// when nothing downstream sees it — see the H3 reconciliation's own §7.
// ═══════════════════════════════════════════════════════════════════════

export type CondensatePumpBranch = "REPLACEMENT" | "NEW_INSTALLATION";

/** The four condensate_route values — H2's family vocabulary, unchanged. */
export type CondensateRouteObservation =
  | "PUMP_PRESENT"
  | "GRAVITY_DRAIN_PRESENT"
  | "NONE_VISIBLE"
  | "UNKNOWN";

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
  | HvacRefusal;

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

// ═══════════════════════════════════════════════════════════════════════
// thermostat-installation — H4, the second executable HVAC service
//
// `control_present` decides the branch, exactly as `condensate_route` does
// for H3's service — but the decision is made HERE, in this resolver,
// never inside `controlGate`. `controlGate`'s own UNKNOWN/PRESENT_NOT_
// RESPONDING checks apply to a single control's state; they do not know
// how to route ABSENT to an entirely different question set (a new-
// location wire run), because for OTHER, future callers ABSENT might mean
// something else entirely. Branch selection is this service's own
// business, matching H3's identical reasoning for `condensate_route`.
//
// PRESENT_NOT_RESPONDING — H4's settled correction. Both `PRESENT_WORKING`
// and `PRESENT_NOT_RESPONDING` enter the SAME existing/replacement branch:
// the homeowner explicitly selected known replacement/installation work,
// and a non-responding old unit is on-point evidence FOR that choice, not
// an unresolved symptom needing a visit to interpret. `controlGate` is
// still called — for the terminal_scheme/common_wire checks that DO apply
// uniformly — with `presentNotRespondingIsKnownWork: true`, the one narrow,
// additive, default-preserving opt-in lib/hvac/gates.ts added for exactly
// this. Every OTHER caller of `controlGate`, including this file's own
// verifier-facing default-behavior proof, gets the untouched symptom-safe
// refusal — see gates.ts's own comment.
//
// THE UPSTREAM INVARIANT THIS FILE DOES NOT ENFORCE, BECAUSE IT ISN'T
// THIS FILE'S JOB. "My thermostat isn't working" is symptom language, and
// it must never reach this resolver at all — that boundary is held at the
// search/intent layer (lib/serviceMatch.ts, lib/hvac/intents.ts), upstream
// of everything here, exactly as it already is for hvac-service-call vs.
// condensate-pump-installation. This resolver only ever runs once a
// homeowner has explicitly selected `thermostat-installation` as a known
// service to book — the same precondition H3's resolver has always had.
//
// NO C-WIRE ADAPTER IN THIS SLICE. `common_wire = ABSENT` refuses to
// REMOTE_QUOTE unconditionally. `conductor_count` cannot prove an adapter
// is safe to attach — a raw wire count says nothing about which conductors
// are already in use — so no automatic `component_increment` attachment
// happens here. `conductor_count` stays declared on `existing_control`
// (lib/hvac/families.ts) for a future, separately-approved compatibility
// fact; it is not read by this resolver at all, the same treatment H3 gave
// `equipment_condition` once it had no remaining effect on any route.
// ═══════════════════════════════════════════════════════════════════════

export type ThermostatBranch = "REPLACEMENT" | "NEW_LOCATION";

/**
 * control_wire_run.breakpoints has TWO boundaries (hvac-v0-architecture.md
 * §E.7) — unlike condensate_run's one — so this service's run band is
 * genuinely three-valued. STANDARD and EXTENDED both continue (two real
 * priced tiers, not a binary in/out); only OVER_BAND leaves pricing.
 */
export type ControlWireRunBand = "STANDARD" | "EXTENDED" | "OVER_BAND" | "UNKNOWN";

/**
 * Every fact this service's tree can read. Always fully present at
 * resolution time — same discipline as H3's condensate facts.
 *
 * `terminalScheme` and `commonWire` are asked ONLY on the existing/
 * replacement branch; `runBand` only on the new-location branch. Each is
 * simply never read on the branch that doesn't ask it — ordinary
 * branching, not a diagnostic-risk shape.
 */
export type ThermostatInstallationFacts = {
  /** Q1 — shared start. */
  systemType: SystemType;
  /** Q2 — shared start, the branch decision. */
  controlPresent: ControlPresent;
  /** Replacement branch only. */
  terminalScheme: TerminalScheme;
  /** Replacement branch only, and only once terminalScheme is STANDARD_LETTERED. */
  commonWire: CommonWirePresence;
  /** Asked on both branches. */
  supplyArrangement: SupplyArrangementChoice;
  /** New-location branch only. */
  runBand: ControlWireRunBand;
};

export type ThermostatInstallationResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
      branch: ThermostatBranch;
    }
  | HvacRefusal;

/** The system types this service prices against — the settled H4 decision. */
const THERMOSTAT_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = [
  "FURNACE_AND_AC",
  "HEAT_PUMP_SPLIT",
  "DUAL_FUEL",
  "PACKAGE_UNIT",
  "AIR_HANDLER_ONLY",
];

/**
 * Resolve `thermostat-installation` against a complete fact set.
 *
 * FAILS CLOSED, same discipline as H3. Order: system identity first (the
 * honest refusal for an unsupported system depends on establishing it
 * before anything downstream), then the branch decision, then each
 * branch's own questions in the order a homeowner is actually asked them.
 */
export function resolveThermostatInstallation(
  facts: ThermostatInstallationFacts
): ThermostatInstallationResolution {
  // Q1 — system identity. Shared to both branches. BOILER_HYDRONIC and
  // MINI_SPLIT_DUCTLESS are named as unsupported explicitly — a different
  // job, not an unusual version of this one — never as an inferred cause.
  const identity = identityGate(facts.systemType, { serviceExpects: THERMOSTAT_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2 — the branch decision, made here rather than inside controlGate.
  // See the section header for why.
  if (facts.controlPresent === "UNKNOWN") {
    return refuse({
      action: "PHOTO_REVIEW",
      reason: "Whether an existing thermostat is present and controlling the system has not been established.",
      factKey: "control_present",
      observed: "UNKNOWN",
    });
  }

  if (facts.controlPresent === "ABSENT") {
    // ── New-location branch ────────────────────────────────────────────
    // Q3 — control-wire run distance.
    if (facts.runBand === "UNKNOWN") {
      return refuse({
        action: "PHOTO_REVIEW",
        reason: "The new control-wire run's distance has not been established.",
        factKey: "run_band",
        observed: "UNKNOWN",
      });
    }
    if (facts.runBand === "OVER_BAND") {
      return refuse({
        action: "REMOTE_QUOTE",
        reason: "The new control-wire run is longer than this contractor's standard or extended band.",
        factKey: "run_band",
        observed: "OVER_BAND",
      });
    }
    // Q4 — finish_disruption_ack. Not a question: the conditional_disclaimer
    // primitive, attached to this branch's RESOLVED outcome below — never a
    // route gate, never a price switch. See lib/hvac/families.ts's own
    // declaration for this family.
    // Q5 — supply arrangement, same policy as the replacement branch's Q5.
    return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "NEW_LOCATION" };
  }

  // ── Existing / replacement branch ──────────────────────────────────────
  // facts.controlPresent is PRESENT_WORKING or PRESENT_NOT_RESPONDING here.
  // controlGate handles both the (bypassed, known-work) present-check and
  // the terminal_scheme / common_wire checks in one call — see the section
  // header and gates.ts's own comment on the opt-in.
  const control = controlGate(facts.controlPresent, {
    presentNotRespondingIsKnownWork: true,
    terminalScheme: facts.terminalScheme,
    requiresCommonWire: true,
    commonWirePresent: facts.commonWire,
  });
  if (control.action !== "CONTINUE") return refuse(control);

  // Q5 (replacement) — supply arrangement. Q6 — thermostat_count, a
  // quantity that gates nothing. conductor_count is declared on the family
  // but not read here — see the section header.
  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "REPLACEMENT" };
}

// ---------------------------------------------------------------------------
// The question sequence as DATA — same rationale as CONDENSATE_PUMP_
// QUESTIONS above: a verifier can inspect wording and vocabulary without
// re-deriving them from the function. A separate, service-specific type
// rather than a shared generic one — see the file header on why a second
// resolver doesn't yet justify extracting a common tree shape.
// ---------------------------------------------------------------------------

export type ThermostatQuestionKey =
  | "system_identity"
  | "control_present"
  | "terminal_scheme"
  | "common_wire"
  | "supply_arrangement_replacement"
  | "thermostat_count"
  | "run_distance"
  | "supply_arrangement_new_location";

export type ThermostatAnswerOption = {
  value: string;
  /** Customer-ready wording. An observation or a choice — never a cause. */
  label: string;
};

export type ThermostatQuestion = {
  key: ThermostatQuestionKey;
  branch: ThermostatBranch | "SHARED";
  prompt: string;
  establishes: string;
  options: readonly ThermostatAnswerOption[];
};

export const THERMOSTAT_QUESTIONS: readonly ThermostatQuestion[] = [
  {
    key: "system_identity",
    branch: "SHARED",
    prompt: "What kind of heating and cooling system do you have?",
    establishes: "system_type",
    options: [
      { value: "FURNACE_AND_AC", label: "Furnace and central air conditioner" },
      { value: "HEAT_PUMP_SPLIT", label: "Heat pump" },
      { value: "DUAL_FUEL", label: "Dual fuel (furnace and heat pump together)" },
      { value: "PACKAGE_UNIT", label: "One outdoor package unit" },
      { value: "AIR_HANDLER_ONLY", label: "Indoor air handler only" },
      { value: "BOILER_HYDRONIC", label: "Boiler or radiators" },
      { value: "MINI_SPLIT_DUCTLESS", label: "Ductless mini-split" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "control_present",
    branch: "SHARED",
    prompt: "Is there a thermostat on the wall now, and does it control the system?",
    establishes: "control_present",
    options: [
      { value: "PRESENT_WORKING", label: "Yes, and it works" },
      { value: "PRESENT_NOT_RESPONDING", label: "Yes, but it isn't responding" },
      { value: "ABSENT", label: "No, there's no thermostat there now" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "terminal_scheme",
    branch: "REPLACEMENT",
    prompt: "Do the wire terminals on the back plate use ordinary letter labels like R, C, W, Y, G, or O/B?",
    establishes: "terminal_scheme",
    options: [
      { value: "STANDARD_LETTERED", label: "Yes, they're labeled with letters like that" },
      { value: "MANUFACTURER_SPECIFIC", label: "No, they're labeled differently" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "common_wire",
    branch: "REPLACEMENT",
    prompt: "Is a wire connected to the terminal marked C?",
    establishes: "common_wire",
    options: [
      { value: "PRESENT", label: "Yes" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "supply_arrangement_replacement",
    branch: "REPLACEMENT",
    prompt: "Do you already have the new thermostat, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
  {
    key: "thermostat_count",
    branch: "REPLACEMENT",
    prompt: "How many thermostats are being replaced?",
    establishes: "thermostat_count",
    // Integer input, not a closed answer set — a quantity, same status as
    // condensate's own count-shaped facts.
    options: [],
  },
  {
    key: "run_distance",
    branch: "NEW_LOCATION",
    // {b1} and {b2} are the contractor's own two boundaries — see
    // lib/policyBands.ts. Never shipped with a hole unresolved; rendering
    // is a template-layer concern this file does not perform.
    prompt: "About how far would a new control-wire run need to travel, from the equipment to this location?",
    establishes: "run_band",
    options: [
      { value: "STANDARD", label: "{b1} feet or less" },
      { value: "EXTENDED", label: "{b1} to {b2} feet" },
      { value: "OVER_BAND", label: "More than {b2} feet" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "supply_arrangement_new_location",
    branch: "NEW_LOCATION",
    prompt: "Do you already have the thermostat, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
] as const;
