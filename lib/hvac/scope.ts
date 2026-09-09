/**
 * HVAC's executable services. H3 added `condensate-pump-installation`, H4
 * `thermostat-installation`, H5 `condensate-safety-switch-installation` and
 * `air-filter-replacement`, H6 the four tune-ups (`ac-tune-up`,
 * `furnace-tune-up`, `heat-pump-tune-up`, `mini-split-tune-up`), H7 three
 * accessory/IAQ services (`air-cleaner-cabinet-installation`,
 * `duct-air-treatment-installation`, `accessory-consumable-replacement`),
 * H8 the two services H7 left blocked: `mini-split-head-cleaning` and
 * `whole-house-humidifier`, H9 `vent-cover-replacement`. Fourteen priced
 * resolvers, still not a generic n-service engine.
 *
 * `duct-assessment` and `hvac-service-call` are DELIBERATELY NOT among
 * them, and never routed through this file at all — both are
 * `APPOINTMENT_ONLY`, mode `V` only (catalog review: *"scope produced by
 * the visit"*), and neither ever produces a priced `RouteAction` the way
 * every resolver below does. `hvac-service-call`'s own reroute-in path is
 * already fully built (`lib/troubleshooting.ts`, pre-dating HVAC). Direct-
 * selection context capture for both belongs to a later booking/intake
 * integration, not a `scope.ts` pricing resolver — H9's own audit raised
 * this and it was settled, not implemented.
 *
 * `mini-split-head-cleaning` was implemented in H7, then REMOVED before
 * push — the final applied trade review requires it to capture indoor-unit
 * type as a CONDITIONAL_FIXED scope driver, and no approved vocabulary for
 * one existed anywhere in authority. H8's own audit confirmed the gap was
 * real and settled it as an explicit product decision — the closed
 * `IndoorUnitType` vocabulary, below — rather than inventing one quietly
 * to preserve a batch count. `whole-house-humidifier` was blocked for the
 * same reason: two facts (humidifier device type, water supply presence)
 * genuinely missing from H2's declared vocabulary and load-bearing for its
 * own CONDITIONAL_FIXED branches. H8 settles both with two narrow new H2
 * families (`indoor_unit_form`, `water_supply_availability`) and one new
 * fact on an already-declared family (`humidifier_type`, on
 * `accessory_and_media`) — no new gate, no new shared primitive.
 *
 * STILL NOT A GENERIC RESOLVER, EVEN AT FOURTEEN. Mirrors lib/plumbing/scope.ts's
 * ROLE — the layer between a validated answer and the price, deciding WHAT
 * THE JOB IS and never what it costs — but not its generic, multi-service
 * shape. Plumbing's `scopePlumbingService` walks whichever gates a catalog
 * row declares, because sixty-three services share nine families and one
 * shape genuinely pays for itself. HVAC's resolvers keep materially
 * different branch structures (condensate's is a flat gate sequence per
 * branch; thermostat's calls back into a shared gate with an explicit
 * opt-in; the four H6 tune-ups share one small access-gating helper;
 * mini-split-head-cleaning writes its own access refusal, deliberately
 * bypassing the shared gate) — not enough to justify a common tree shape,
 * per every prior phase's own instruction against building one merely
 * because another resolver arrived. What genuinely IS shared is narrow
 * and named: `SupplyArrangementChoice`, `refuse()`, `unresolved()` (H5),
 * `gateTwoSlotAccess()` (H6) — one mechanical helper per genuinely
 * repeated shape, nothing assembled into a shared tree walker.
 *
 *   Visual Assist / manual answer
 *     -> validated canonical Guided Pricing input   (not built for HVAC yet)
 *     -> THIS FILE                                  <- each service's own scope logic
 *     -> deterministic Price2Book pricing engine    (lib/pricing.ts, untouched)
 *
 * PURE. No database, no clock, no network, no price. Reuses lib/hvac/gates.ts's
 * `accessGate`, `identityGate`, `fuelGate`, `controlGate` and
 * `GateOutcome`/`toRouteAction` unchanged in count — H4 narrowly EXTENDED
 * `controlGate` with two optional, default-preserving parameters (see
 * gates.ts's own comment), not an eighth gate; H6, H7, H8 and H9 add no
 * gate at all. H8 adds exactly two new families (`indoor_unit_form`,
 * `water_supply_availability` — lib/hvac/families.ts's own comments on
 * them) and one new fact on an existing family (`humidifier_type`, on
 * `accessory_and_media`); H9 adds one more narrow family
 * (`vent_cover_configuration`) and removes `indoor_equipment_access` from
 * exactly one service (families.ts's own comment on both) — no new gate,
 * no new shared primitive at any point. The platform's own `RouteAction`
 * (lib/flow-types.ts) is the result vocabulary throughout, not a
 * service-local invention.
 */

import type { RouteAction } from "../flow-types";
import {
  accessGate,
  identityGate,
  fuelGate,
  controlGate,
  toRouteAction,
  type AccessClass,
  type GateOutcome,
  type SystemType,
  type FuelType,
  type OutdoorLocation,
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

/**
 * H5. The one shape repeated at nearly every unresolved-fact check in this
 * file: an unestablished fact fails to PHOTO_REVIEW, carrying which fact
 * and what was (or wasn't) observed. Purely mechanical — it does not decide
 * WHEN a fact is unresolved, doesn't know about branches, and every other
 * refusal shape (REMOTE_QUOTE, ON_SITE_SERVICE) is still written out at its
 * own call site. `observed` defaults to "UNKNOWN" for the ordinary case; a
 * caller passes its own value when the fact was affirmatively observed but
 * still leaves the service's scope unconfirmed (condensate-safety-switch's
 * NONE_VISIBLE, below).
 *
 * NOT retrofitted into H3/H4's own already-verified call sites — this
 * changes nothing about condensate-pump-installation or
 * thermostat-installation, which keep their original, already-proven
 * inline refusals unchanged. Used only by the H5 resolvers that follow.
 */
function unresolved(factKey: string, reason: string, observed = "UNKNOWN"): HvacRefusal {
  return refuse({ action: "PHOTO_REVIEW", reason, factKey, observed });
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

// ═══════════════════════════════════════════════════════════════════════
// condensate-safety-switch-installation — H5
//
// FIXED, not CONDITIONAL_FIXED. condensate_route decides WHICH fitting is
// scoped — a float switch into a pump reservoir, or an inline switch on a
// gravity drain line — never a price or route difference: PUMP_PRESENT and
// GRAVITY_DRAIN_PRESENT both resolve to the SAME one-price terminal.
// Reuses H3's own four-value condensate_route vocabulary unchanged — no
// new fact, no new family, no new gate.
//
// NONE_VISIBLE fails to PHOTO_REVIEW here — the settled H5 product
// decision, and NOT the same treatment condensate-pump-installation gives
// it. That service's whole job is fitting a NEW pump where none exists;
// this one attaches a switch to an EXISTING mechanism, so "nothing
// visible" is not a second branch of this service. It is an unconfirmed
// scope, not a confirmed one.
//
// Base scope is exactly ONE switch (catalog review Part 7: "one accessible
// condensate drain/pan safety switch"). No quantity question — an
// additional switch is component_increment add-on scope, not asked here.
// No supply_arrangement — the switch is always contractor-supplied at the
// fixed price; H2 never declared that family for this service and this
// resolver does not invent it.
// ═══════════════════════════════════════════════════════════════════════

export type CondensateSafetySwitchFacts = {
  /** Q1 — shared start. */
  accessClass: AccessClass;
  /** Q2. Reuses H3's own four-value condensate_route vocabulary unchanged. */
  condensateRoute: CondensateRouteObservation;
};

export type CondensateSafetySwitchResolution =
  | {
      status: "RESOLVED";
      /** FIXED, not CONDITIONAL_FIXED — one price, no branch adjustment. */
      routeAction: "RESOLVE_INSTANT";
    }
  | HvacRefusal;

/**
 * Resolve `condensate-safety-switch-installation` against a complete fact
 * set. FAILS CLOSED, same discipline as every other resolver in this file.
 * There is no REMOTE_QUOTE branch anywhere — a FIXED-disposition service
 * has none to reach.
 */
export function resolveCondensateSafetySwitchInstallation(
  facts: CondensateSafetySwitchFacts
): CondensateSafetySwitchResolution {
  // Q1 — indoor equipment access. Shared start, same as condensate-pump.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q2 — visible condensate arrangement.
  if (facts.condensateRoute === "UNKNOWN") {
    return unresolved(
      "condensate_route",
      "Whether an existing condensate pump or drain is present has not been established."
    );
  }
  if (facts.condensateRoute === "NONE_VISIBLE") {
    return unresolved(
      "condensate_route",
      "No existing condensate pump or drain was observed to attach a safety switch to.",
      "NONE_VISIBLE"
    );
  }

  // PUMP_PRESENT and GRAVITY_DRAIN_PRESENT are BOTH the same one-price
  // terminal — the fact selects which fitting is scoped, never a price or
  // route difference.
  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

// ---------------------------------------------------------------------------
// The question sequence as DATA — same rationale as every other resolver in
// this file. No `branch` field: this service has exactly one path, so
// nothing here is branch-conditional.
// ---------------------------------------------------------------------------

export type CondensateSafetySwitchQuestionKey = "indoor_access" | "condensate_route";

export type CondensateSafetySwitchAnswerOption = {
  value: string;
  /** Customer-ready wording. An observation — never a cause. */
  label: string;
};

export type CondensateSafetySwitchQuestion = {
  key: CondensateSafetySwitchQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly CondensateSafetySwitchAnswerOption[];
};

export const CONDENSATE_SAFETY_SWITCH_QUESTIONS: readonly CondensateSafetySwitchQuestion[] = [
  {
    key: "indoor_access",
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
    prompt: "Is there a small pump with a plastic reservoir, or a drain line that runs away on its own, near the equipment?",
    establishes: "condensate_route",
    options: [
      { value: "PUMP_PRESENT", label: "Yes, there's a pump there now" },
      { value: "GRAVITY_DRAIN_PRESENT", label: "No, but there's a drain line that runs away on its own" },
      { value: "NONE_VISIBLE", label: "No, I don't see anything like that" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// air-filter-replacement — H5
//
// FIXED. The smallest tree in the file: one material fact, one quantity
// that gates nothing. filter_slot_size is read as an open observation
// (`string | null`), mirroring capacityGate's own `number | null` shape
// (lib/hvac/gates.ts) — a printed filter size is not a finite vocabulary
// this template can enumerate, so there is no closed answer set to define.
//
// No accessory_present, no replacement_vs_new, no indoor_equipment_access
// question — the H5 audit's own conclusion: those facts choose BETWEEN
// services (accessory-consumable-replacement, air-cleaner-cabinet-
// installation), not branches within this one, already explicitly-selected
// service. H2 never declared indoor_equipment_access for this service in
// the first place, and this resolver does not invent it.
//
// No filter compatibility is inferred from the size read. There is no
// REMOTE_QUOTE branch anywhere — a FIXED-disposition service has none to
// reach, and no printed size takes this job outside its fixed scope.
// ═══════════════════════════════════════════════════════════════════════

export type AirFilterReplacementFacts = {
  /** Q1. The printed size, or null when unreadable / not sure. */
  filterSlotSize: string | null;
  /** Q2. A quantity. Gates nothing — same treatment as thermostat_count. */
  quantity: number;
};

export type AirFilterReplacementResolution =
  | {
      status: "RESOLVED";
      /** FIXED, not CONDITIONAL_FIXED — one price, no branch adjustment. */
      routeAction: "RESOLVE_INSTANT";
    }
  | HvacRefusal;

/**
 * Resolve `air-filter-replacement` against a complete fact set. FAILS
 * CLOSED: an unreadable size is the one and only refusal this tree can
 * produce.
 */
export function resolveAirFilterReplacement(facts: AirFilterReplacementFacts): AirFilterReplacementResolution {
  // Q1 — the printed size.
  if (facts.filterSlotSize === null) {
    return unresolved("filter_slot_size", "The size printed on the filter has not been established.");
  }

  // Q2 — quantity. Gates nothing; captured for material provisioning only.
  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

// ---------------------------------------------------------------------------
// The question sequence as DATA — same rationale as every other resolver in
// this file. Both options arrays are empty: an open reading and a quantity
// are not closed answer sets, the same convention CONDENSATE_PUMP_QUESTIONS
// and THERMOSTAT_QUESTIONS already use for thermostat_count.
// ---------------------------------------------------------------------------

export type AirFilterReplacementQuestionKey = "filter_slot_size" | "quantity";

export type AirFilterReplacementAnswerOption = {
  value: string;
  label: string;
};

export type AirFilterReplacementQuestion = {
  key: AirFilterReplacementQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly AirFilterReplacementAnswerOption[];
};

export const AIR_FILTER_REPLACEMENT_QUESTIONS: readonly AirFilterReplacementQuestion[] = [
  {
    key: "filter_slot_size",
    prompt: "What size is printed on the edge of the filter?",
    establishes: "filter_slot_size",
    options: [],
  },
  {
    key: "quantity",
    prompt: "How many filters need replacing?",
    establishes: "quantity",
    options: [],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// The four tune-ups — H6. `ac-tune-up`, `heat-pump-tune-up` and
// `mini-split-tune-up` are the three services G1 corrected to genuinely
// BOTH-location scope (families.ts's own comment on each: "truthfully
// BOTH... Kept FIXED; the fix was the declaration, not the scope").
// `furnace-tune-up` is the one tune-up that was always genuinely
// single-location (catalog review Part 6.2's own "control case").
//
// POST-G1 ACCESS, THE SETTLED CORRECTION. INDOOR_EQUIPMENT and
// OUTDOOR_EQUIPMENT are gated INDEPENDENTLY, each through the unchanged
// `accessGate` — a known access class (ACCESSIBLE or FINISHED) always
// CONTINUEs; only UNKNOWN refuses. `outdoor_location`'s ROOF /
// WALL_OR_BALCONY_MOUNT do NOT branch to REMOTE_QUOTE here — that was
// pre-G1/fallback reasoning, explicitly superseded. `outdoor_location`'s
// ONLY live effect in this file is catching `NONE` — a genuine
// contradiction for a service whose scope requires an outdoor unit, not an
// access-difficulty judgment. No `equipment_height.breakpoints`, no other
// policy binding, is introduced.
//
// A TUNE-UP PROMISES A DEFINED MAINTENANCE PROCEDURE, NEVER A DIAGNOSIS.
// Every one of these four resolvers gates only identity, fuel (furnace
// only), access, and quantity. None reads `equipment_condition`. None asks
// about a burner, an ignitor, a heat exchanger, defrost, a reversing
// valve, backup heat, or refrigerant — those are `HVAC_MAINTENANCE_SCOPE`
// items (lib/hvac/metadata.ts), the technician's promised procedure, never
// a homeowner pre-booking question. See `hvac-v0-architecture.md` F.4's
// own words: "The scope is defined by the procedure, not by the system's
// condition. A tune-up on a struggling unit and a tune-up on a healthy one
// are the same work."
// ═══════════════════════════════════════════════════════════════════════

/** Every tune-up resolves to the same one shape — FIXED, one price, no branch. */
export type TuneUpResolution =
  | {
      status: "RESOLVED";
      /** FIXED — one price, no branch adjustment. */
      routeAction: "RESOLVE_INSTANT";
    }
  | HvacRefusal;

/** The facts `gateTwoSlotAccess` needs — the three two-slot tune-ups' shared shape. */
type TwoSlotAccessFacts = {
  indoorAccessClass: AccessClass;
  outdoorLocation: OutdoorLocation;
  outdoorAccessClass: AccessClass;
};

/**
 * H6. The identical INDOOR_EQUIPMENT + OUTDOOR_EQUIPMENT gating sequence
 * shared by `ac-tune-up`, `heat-pump-tune-up` and `mini-split-tune-up` —
 * the three services G1 corrected to genuinely both-location scope. Each
 * slot is gated INDEPENDENTLY (never collapsed to one scalar answer);
 * `outdoor_location = NONE` fails closed as a contradiction; ROOF and
 * WALL_OR_BALCONY_MOUNT do NOT branch here — see the section header.
 *
 * Purely mechanical: it knows nothing about system identity, fuel, or
 * quantity — every resolver below still calls its own `identityGate` (or,
 * for mini-split, none at all) and still writes its own quantity check.
 * This removes one exact, three-times-repeated gating sequence; it is not
 * a step toward a generic tree engine.
 */
function gateTwoSlotAccess(facts: TwoSlotAccessFacts): GateOutcome {
  const indoorAccess = accessGate(facts.indoorAccessClass);
  if (indoorAccess.action !== "CONTINUE") return indoorAccess;

  if (facts.outdoorLocation === "NONE") {
    return {
      action: "PHOTO_REVIEW",
      reason: "No outdoor unit was observed for a service whose scope includes the outdoor unit.",
      factKey: "outdoor_location",
      observed: "NONE",
    };
  }
  if (facts.outdoorLocation === "UNKNOWN") {
    return {
      action: "PHOTO_REVIEW",
      reason: "Where the outdoor unit sits has not been established.",
      factKey: "outdoor_location",
      observed: "UNKNOWN",
    };
  }

  // ROOF / WALL_OR_BALCONY_MOUNT / GROUND_LEVEL_ADJACENT / GROUND_LEVEL_REMOTE
  // all proceed to the same ordinary access-class check — post-G1, the
  // location value itself is not a route gate.
  return accessGate(facts.outdoorAccessClass);
}

// ─────────────────────────────────────────────────────────────────────────
// ac-tune-up
// ─────────────────────────────────────────────────────────────────────────

/** First V1 fixed tree: FURNACE_AND_AC only. */
const AC_TUNE_UP_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = ["FURNACE_AND_AC"];

export type AcTuneUpFacts = {
  /** Q1. */
  systemType: SystemType;
  /** Q2 — INDOOR_EQUIPMENT slot. */
  indoorAccessClass: AccessClass;
  /** Q3 — OUTDOOR_EQUIPMENT slot, the location half. */
  outdoorLocation: OutdoorLocation;
  /** Q3 (same look) — OUTDOOR_EQUIPMENT slot, the access half. */
  outdoorAccessClass: AccessClass;
  /** Q4. A quantity; gates nothing. */
  systemCount: number;
};

/**
 * Resolve `ac-tune-up` against a complete fact set. FAILS CLOSED. No
 * question here asks about condensate condition, refrigerant, or any
 * diagnosis — `HVAC_MAINTENANCE_SCOPE["ac-tune-up"]` (metadata.ts) is the
 * promised procedure, including clearing the condensate drain, which is
 * routine included maintenance, never evidence of a diagnosed blockage.
 */
export function resolveAcTuneUp(facts: AcTuneUpFacts): TuneUpResolution {
  // Q1 — system identity.
  const identity = identityGate(facts.systemType, { serviceExpects: AC_TUNE_UP_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2/Q3 — both access slots, independently gated. See gateTwoSlotAccess.
  const access = gateTwoSlotAccess(facts);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q4 — quantity. Gates nothing; scales price, not scope.
  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type AcTuneUpQuestionKey = "system_identity" | "indoor_access" | "outdoor_access" | "system_count";

export type AcTuneUpAnswerOption = { value: string; label: string };

export type AcTuneUpQuestion = {
  key: AcTuneUpQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly AcTuneUpAnswerOption[];
};

export const AC_TUNE_UP_QUESTIONS: readonly AcTuneUpQuestion[] = [
  {
    key: "system_identity",
    prompt: "What kind of system do you have?",
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
    key: "indoor_access",
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
    key: "outdoor_access",
    prompt: "Where does the outdoor unit sit?",
    establishes: "outdoor_location",
    options: [
      { value: "GROUND_LEVEL_ADJACENT", label: "On the ground, next to the house" },
      { value: "GROUND_LEVEL_REMOTE", label: "On the ground, away from the house" },
      { value: "ROOF", label: "On the roof" },
      { value: "WALL_OR_BALCONY_MOUNT", label: "Mounted on a wall or balcony" },
      { value: "NONE", label: "There's no outdoor unit" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "system_count",
    prompt: "How many cooling systems are being serviced?",
    establishes: "system_count",
    options: [],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// furnace-tune-up
// ─────────────────────────────────────────────────────────────────────────

const FURNACE_TUNE_UP_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = ["FURNACE_AND_AC"];
const FURNACE_TUNE_UP_SUPPORTED_FUEL_TYPES: readonly Exclude<FuelType, "UNKNOWN">[] = ["NATURAL_GAS", "PROPANE"];

export type FurnaceTuneUpFacts = {
  /** Q1. */
  systemType: SystemType;
  /** Q2. */
  fuelType: FuelType;
  /** Q3 — PRIMARY slot. Genuinely single-location; no outdoor fact exists here. */
  accessClass: AccessClass;
  /** Q4. A quantity; gates nothing. */
  systemCount: number;
};

/**
 * Resolve `furnace-tune-up` against a complete fact set. FAILS CLOSED.
 * `venting_class` and `heating_input_btu` are declared on `heating_equipment`
 * (H2) but NOT read here — the maintenance procedure and its price are the
 * same regardless of pipe material or BTU rating; only `fuel_type` genuinely
 * bounds V1's fixed scope to gas/propane forced-air. `equipment_condition`
 * is never read. No question here asks whether burners, ignition, venting,
 * the heat exchanger, or safeties are good, bad, or safe — those are
 * `HVAC_MAINTENANCE_SCOPE["furnace-tune-up"]`'s own promised checks,
 * performed by the technician, never asked of the homeowner.
 */
export function resolveFurnaceTuneUp(facts: FurnaceTuneUpFacts): TuneUpResolution {
  // Q1 — system identity.
  const identity = identityGate(facts.systemType, { serviceExpects: FURNACE_TUNE_UP_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2 — fuel. V1's fixed scope is gas/propane forced-air only.
  const fuel = fuelGate(facts.fuelType, { serviceExpects: FURNACE_TUNE_UP_SUPPORTED_FUEL_TYPES });
  if (fuel.action !== "CONTINUE") return refuse(fuel);

  // Q3 — PRIMARY access. Single location; no second slot to gate.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q4 — quantity. Gates nothing.
  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type FurnaceTuneUpQuestionKey = "system_identity" | "fuel_type" | "indoor_access" | "system_count";

export type FurnaceTuneUpAnswerOption = { value: string; label: string };

export type FurnaceTuneUpQuestion = {
  key: FurnaceTuneUpQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly FurnaceTuneUpAnswerOption[];
};

export const FURNACE_TUNE_UP_QUESTIONS: readonly FurnaceTuneUpQuestion[] = [
  {
    key: "system_identity",
    prompt: "What kind of system do you have?",
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
    key: "fuel_type",
    prompt: "What fuel does the furnace use?",
    establishes: "fuel_type",
    options: [
      { value: "NATURAL_GAS", label: "Natural gas" },
      { value: "PROPANE", label: "Propane" },
      { value: "OIL", label: "Oil" },
      { value: "ELECTRIC", label: "Electric" },
      { value: "DUAL_FUEL", label: "Dual fuel" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "indoor_access",
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
    key: "system_count",
    prompt: "How many heating systems are being serviced?",
    establishes: "system_count",
    options: [],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// heat-pump-tune-up
// ─────────────────────────────────────────────────────────────────────────

/** First V1 fixed tree: HEAT_PUMP_SPLIT only. DUAL_FUEL and PACKAGE_UNIT
 *  are NOT auto-accepted — their maintenance topology is not represented
 *  by this approved H6 scope. */
const HEAT_PUMP_TUNE_UP_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = ["HEAT_PUMP_SPLIT"];

export type HeatPumpTuneUpFacts = {
  /** Q1. Confirming this is a heat pump is the only identity fact needed. */
  systemType: SystemType;
  /** Q2 — INDOOR_EQUIPMENT slot. */
  indoorAccessClass: AccessClass;
  /** Q3 — OUTDOOR_EQUIPMENT slot, the location half. */
  outdoorLocation: OutdoorLocation;
  /** Q3 (same look) — OUTDOOR_EQUIPMENT slot, the access half. */
  outdoorAccessClass: AccessClass;
  /** Q4. A quantity; gates nothing. */
  systemCount: number;
};

/**
 * Resolve `heat-pump-tune-up` against a complete fact set. FAILS CLOSED.
 * No question here asks about defrost, reversing-valve position, backup
 * heat, or refrigerant — those are `HVAC_MAINTENANCE_SCOPE["heat-pump-tune-up"]`
 * items, the technician's promised procedure, never a homeowner question.
 */
export function resolveHeatPumpTuneUp(facts: HeatPumpTuneUpFacts): TuneUpResolution {
  // Q1 — system identity. Confirming a heat pump; nothing further.
  const identity = identityGate(facts.systemType, { serviceExpects: HEAT_PUMP_TUNE_UP_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2/Q3 — both access slots, independently gated.
  const access = gateTwoSlotAccess(facts);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q4 — quantity. Gates nothing.
  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type HeatPumpTuneUpQuestionKey = "system_identity" | "indoor_access" | "outdoor_access" | "system_count";

export type HeatPumpTuneUpAnswerOption = { value: string; label: string };

export type HeatPumpTuneUpQuestion = {
  key: HeatPumpTuneUpQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly HeatPumpTuneUpAnswerOption[];
};

export const HEAT_PUMP_TUNE_UP_QUESTIONS: readonly HeatPumpTuneUpQuestion[] = [
  {
    key: "system_identity",
    prompt: "What kind of system do you have?",
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
    key: "indoor_access",
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
    key: "outdoor_access",
    prompt: "Where does the outdoor unit sit?",
    establishes: "outdoor_location",
    options: [
      { value: "GROUND_LEVEL_ADJACENT", label: "On the ground, next to the house" },
      { value: "GROUND_LEVEL_REMOTE", label: "On the ground, away from the house" },
      { value: "ROOF", label: "On the roof" },
      { value: "WALL_OR_BALCONY_MOUNT", label: "Mounted on a wall or balcony" },
      { value: "NONE", label: "There's no outdoor unit" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "system_count",
    prompt: "How many heat pump systems are being serviced?",
    establishes: "system_count",
    options: [],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// mini-split-tune-up
// ─────────────────────────────────────────────────────────────────────────

export type MiniSplitTuneUpFacts = {
  /** Q1. Outdoor mini-split SYSTEMS being serviced — not heads. head_count
   *  alone cannot describe two independent outdoor systems. */
  systemCount: number;
  /** Q2. Total indoor HEADS being serviced, across all systems. */
  headCount: number;
  /** Q3 — INDOOR_EQUIPMENT slot. */
  indoorAccessClass: AccessClass;
  /** Q4 — OUTDOOR_EQUIPMENT slot, the location half. */
  outdoorLocation: OutdoorLocation;
  /** Q4 (same look) — OUTDOOR_EQUIPMENT slot, the access half. */
  outdoorAccessClass: AccessClass;
};

/**
 * Resolve `mini-split-tune-up` against a complete fact set. FAILS CLOSED.
 *
 * NO `system_type` QUESTION. H2 declares `distribution_and_zoning` for
 * this service, never `system_identity` — this resolver does not add one.
 *
 * Distinct from `mini-split-head-cleaning`: this is the routine tune-up and
 * light cleaning `HVAC_MAINTENANCE_SCOPE["mini-split-tune-up"]` describes,
 * never Deep Cleaning's disassembly wash — no disassembly question exists
 * here, and none should.
 */
export function resolveMiniSplitTuneUp(facts: MiniSplitTuneUpFacts): TuneUpResolution {
  // Q1/Q2 — quantities. Both must be positive to describe real work; a
  // non-positive count is unresolved scope, not a legitimate zero-priced job.
  if (facts.systemCount < 1) {
    return unresolved("system_count", "The number of mini-split systems being serviced has not been established.");
  }
  if (facts.headCount < 1) {
    return unresolved("head_count", "The number of indoor heads being serviced has not been established.");
  }

  // Q3/Q4 — both access slots, independently gated.
  const access = gateTwoSlotAccess(facts);
  if (access.action !== "CONTINUE") return refuse(access);

  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type MiniSplitTuneUpQuestionKey = "system_count" | "head_count" | "indoor_access" | "outdoor_access";

export type MiniSplitTuneUpAnswerOption = { value: string; label: string };

export type MiniSplitTuneUpQuestion = {
  key: MiniSplitTuneUpQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly MiniSplitTuneUpAnswerOption[];
};

export const MINI_SPLIT_TUNE_UP_QUESTIONS: readonly MiniSplitTuneUpQuestion[] = [
  {
    key: "system_count",
    prompt: "How many outdoor mini-split systems are being serviced?",
    establishes: "system_count",
    options: [],
  },
  {
    key: "head_count",
    prompt: "How many indoor heads, in total, are being serviced?",
    establishes: "head_count",
    options: [],
  },
  {
    key: "indoor_access",
    prompt: "Where are the indoor units?",
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
    key: "outdoor_access",
    prompt: "Where does the outdoor unit sit?",
    establishes: "outdoor_location",
    options: [
      { value: "GROUND_LEVEL_ADJACENT", label: "On the ground, next to the house" },
      { value: "GROUND_LEVEL_REMOTE", label: "On the ground, away from the house" },
      { value: "ROOF", label: "On the roof" },
      { value: "WALL_OR_BALCONY_MOUNT", label: "Mounted on a wall or balcony" },
      { value: "NONE", label: "There's no outdoor unit" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// air-cleaner-cabinet-installation — H7
//
// CONDITIONAL_FIXED. accessory_present decides the branch — PRESENT
// (replacement) is bounded, because the existing cabinet proves the
// opening already exists, the same "one already there proves the scope"
// logic every merged replacement/new-fit service in this codebase uses.
// ABSENT (first-time insertion) leaves automated pricing UNCONDITIONALLY:
// no approved document contains a homeowner-observable proxy for "unbounded
// sheet-metal transitions" narrower than presence/absence itself — the H7
// audit's own finding — so this resolver does not invent one.
//
// NO POWER FACT. The powered electronic-air-cleaner variant was removed
// outright at candidate stage (families.ts's own comment); this resolver
// never reads dedicated_circuit_present and never asks about one.
// ═══════════════════════════════════════════════════════════════════════

/** Ductwork-based systems only — a media cabinet fits into central return ductwork. */
const AIR_CLEANER_CABINET_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = [
  "FURNACE_AND_AC",
  "HEAT_PUMP_SPLIT",
  "DUAL_FUEL",
  "PACKAGE_UNIT",
  "AIR_HANDLER_ONLY",
];

/** Shared presence vocabulary — PRESENT/ABSENT/UNKNOWN, the ordinary shape
 *  every presence/absence merge fact in this file uses. */
export type AccessoryPresence = "PRESENT" | "ABSENT" | "UNKNOWN";

export type AirCleanerCabinetInstallationFacts = {
  /** Q1. */
  systemType: SystemType;
  /** Q2 — PRIMARY slot. */
  accessClass: AccessClass;
  /** Q3. The branch decision. */
  accessoryPresent: AccessoryPresence;
  /** Q4 (replacement branch only). */
  filterSlotSize: string | null;
};

export type AirCleanerCabinetInstallationResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
    }
  | HvacRefusal;

/**
 * Resolve `air-cleaner-cabinet-installation` against a complete fact set.
 * FAILS CLOSED. No question here asks whether duct transitions are
 * standard, easy, or adequate — the branch decision is presence/absence
 * of the existing cabinet, observation only.
 */
export function resolveAirCleanerCabinetInstallation(
  facts: AirCleanerCabinetInstallationFacts
): AirCleanerCabinetInstallationResolution {
  // Q1 — system identity.
  const identity = identityGate(facts.systemType, { serviceExpects: AIR_CLEANER_CABINET_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2 — indoor access.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q3 — the branch decision.
  if (facts.accessoryPresent === "UNKNOWN") {
    return unresolved("accessory_present", "Whether a filter cabinet is already fitted has not been established.");
  }
  if (facts.accessoryPresent === "ABSENT") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "A first-time filter cabinet insertion may need duct transitions this fixed scope does not bound.",
      factKey: "accessory_present",
      observed: "ABSENT",
    });
  }

  // Q4 — printed filter size, replacement branch only.
  if (facts.filterSlotSize === null) {
    return unresolved("filter_slot_size", "The size printed on the filter has not been established.");
  }

  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED" };
}

export type AirCleanerCabinetInstallationQuestionKey = "system_identity" | "indoor_access" | "accessory_present" | "filter_slot_size";

export type AirCleanerCabinetInstallationAnswerOption = { value: string; label: string };

export type AirCleanerCabinetInstallationQuestion = {
  key: AirCleanerCabinetInstallationQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly AirCleanerCabinetInstallationAnswerOption[];
};

export const AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS: readonly AirCleanerCabinetInstallationQuestion[] = [
  {
    key: "system_identity",
    prompt: "What kind of system do you have?",
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
    key: "indoor_access",
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
    key: "accessory_present",
    prompt: "Is there a filter cabinet there now?",
    establishes: "accessory_present",
    options: [
      { value: "PRESENT", label: "Yes, there's one there now" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "filter_slot_size",
    prompt: "What size is printed on the filter you take out?",
    establishes: "filter_slot_size",
    options: [],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// duct-air-treatment-installation — H7
//
// CONDITIONAL_FIXED. Device configuration (UV lamp / PCO cell / ionizer)
// is exactly that — configuration, never a route gate: catalog review
// Part 7's own words, "Device is configuration... No performance or
// air-quality claims in canonical scope." Mounting is bounded regardless
// of which specific device; only the power prerequisite can leave fixed
// pricing. No device-type question exists in this resolver at all.
//
// dedicated_circuit_present is UNCONDITIONAL, matching H2's own
// declaration exactly (families.ts's own comment: "a UV/treatment device
// is powered whether it is a first fit or a replacement") — read on every
// path, never branch-only.
// ═══════════════════════════════════════════════════════════════════════

/** Ductwork-based systems only, same reasoning as the filter cabinet. */
const DUCT_AIR_TREATMENT_SUPPORTED_SYSTEM_TYPES: readonly Exclude<SystemType, "UNKNOWN">[] = [
  "FURNACE_AND_AC",
  "HEAT_PUMP_SPLIT",
  "DUAL_FUEL",
  "PACKAGE_UNIT",
  "AIR_HANDLER_ONLY",
];

export type DuctAirTreatmentInstallationFacts = {
  /** Q1. */
  systemType: SystemType;
  /** Q2 — PRIMARY slot. */
  accessClass: AccessClass;
  /** Q3. Unconditional — read on every path. */
  dedicatedCircuitPresent: DedicatedCircuitPresence;
};

export type DuctAirTreatmentInstallationResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
    }
  | HvacRefusal;

/**
 * Resolve `duct-air-treatment-installation` against a complete fact set.
 * FAILS CLOSED. No question here claims the air is dirty, contaminated,
 * unhealthy, or moldy, and none makes any performance or air-quality
 * claim — this resolver scopes a mounting job, nothing else.
 */
export function resolveDuctAirTreatmentInstallation(
  facts: DuctAirTreatmentInstallationFacts
): DuctAirTreatmentInstallationResolution {
  // Q1 — system identity.
  const identity = identityGate(facts.systemType, { serviceExpects: DUCT_AIR_TREATMENT_SUPPORTED_SYSTEM_TYPES });
  if (identity.action !== "CONTINUE") return refuse(identity);

  // Q2 — indoor access.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q3 — power. Unconditional on every path.
  if (facts.dedicatedCircuitPresent === "UNKNOWN") {
    return unresolved("dedicated_circuit_present", "Whether a normal outlet is within reach of the device has not been established.");
  }
  if (facts.dedicatedCircuitPresent === "ABSENT") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "No outlet is within reach of the device, and this fixed-price installation cannot be completed as promised without one.",
      factKey: "dedicated_circuit_present",
      observed: "ABSENT",
    });
  }

  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED" };
}

export type DuctAirTreatmentInstallationQuestionKey = "system_identity" | "indoor_access" | "dedicated_power";

export type DuctAirTreatmentInstallationAnswerOption = { value: string; label: string };

export type DuctAirTreatmentInstallationQuestion = {
  key: DuctAirTreatmentInstallationQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly DuctAirTreatmentInstallationAnswerOption[];
};

export const DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS: readonly DuctAirTreatmentInstallationQuestion[] = [
  {
    key: "system_identity",
    prompt: "What kind of system do you have?",
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
    key: "indoor_access",
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
    key: "dedicated_power",
    prompt: "Is there a normal outlet within reach of the device?",
    establishes: "dedicated_circuit_present",
    options: [
      { value: "PRESENT", label: "Yes, there's an outlet nearby" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// accessory-consumable-replacement — H7
//
// FIXED. The merged physical work is always "open an existing accessory,
// remove the spent element, fit the new one" — no first-time-install
// branch exists here at all, unlike every other accessory_and_media
// service in this batch.
//
// accessory_kind, NOT accessory_present. This service is the one place
// "which accessory" (not "is one there") is the decision that matters —
// families.ts's own comment explains why this fact was added rather than
// overloading accessory_present's existing presence semantics. No other
// accessory_and_media-declared service renders accessory_kind.
//
// NO supply_arrangement. The H7 decision, settled: the older uv-lamp-
// bulb-replacement candidate's inclusion of supply_arrangement was a
// pre-merge artifact. Part 3's consolidated family table, H2's own
// families.ts declaration, and Part 7's trade pass all agree it does not
// belong here, and this resolver does not read it. H2 is not modified to
// restore it.
//
// The printed identifier (size, part number, whatever is on the item
// being replaced) is read as `filter_slot_size` — the one "printed
// reading" fact accessory_and_media already establishes — and is
// observation only. Nothing here infers compatibility from its content;
// the only question asked of it is whether it was read at all.
// ═══════════════════════════════════════════════════════════════════════

/**
 * H7. Which existing accessory contains the consumable being replaced —
 * families.ts's own new fact on accessory_and_media. Concrete typing
 * lives here, not gates.ts: nothing in the seven gates reads it, the same
 * placement CondensateRouteObservation already uses for a family-declared,
 * gate-free fact.
 */
export type AccessoryKind = "HUMIDIFIER" | "AIR_CLEANER" | "UV_TREATMENT" | "UNKNOWN";

export type AccessoryConsumableReplacementFacts = {
  /** Q1. The branch decision — which accessory, not whether one exists. */
  accessoryKind: AccessoryKind;
  /** Q2 — PRIMARY slot. */
  accessClass: AccessClass;
  /** Q3. Observation only — see the section header. */
  identifierText: string | null;
};

export type AccessoryConsumableReplacementResolution =
  | {
      status: "RESOLVED";
      /** FIXED, not CONDITIONAL_FIXED — one price, no branch adjustment. */
      routeAction: "RESOLVE_INSTANT";
    }
  | HvacRefusal;

/**
 * Resolve `accessory-consumable-replacement` against a complete fact set.
 * FAILS CLOSED. No compatibility is ever inferred from the printed
 * identifier's content — only whether it was read at all.
 */
export function resolveAccessoryConsumableReplacement(
  facts: AccessoryConsumableReplacementFacts
): AccessoryConsumableReplacementResolution {
  // Q1 — which accessory.
  if (facts.accessoryKind === "UNKNOWN") {
    return unresolved("accessory_kind", "Which existing accessory contains the consumable has not been established.");
  }

  // Q2 — indoor access.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q3 — the printed identifier. Observation only.
  if (facts.identifierText === null) {
    return unresolved("filter_slot_size", "The size or part number printed on the item being replaced has not been established.");
  }

  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type AccessoryConsumableReplacementQuestionKey = "accessory_kind" | "indoor_access" | "printed_identifier";

export type AccessoryConsumableReplacementAnswerOption = { value: string; label: string };

export type AccessoryConsumableReplacementQuestion = {
  key: AccessoryConsumableReplacementQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly AccessoryConsumableReplacementAnswerOption[];
};

export const ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS: readonly AccessoryConsumableReplacementQuestion[] = [
  {
    key: "accessory_kind",
    prompt: "Which piece of equipment is it — humidifier, air cleaner, or UV lamp?",
    establishes: "accessory_kind",
    options: [
      { value: "HUMIDIFIER", label: "Humidifier" },
      { value: "AIR_CLEANER", label: "Air cleaner" },
      { value: "UV_TREATMENT", label: "UV lamp" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "indoor_access",
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
    key: "printed_identifier",
    prompt: "What size or part number is printed on the one you are taking out?",
    establishes: "filter_slot_size",
    options: [],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// mini-split-head-cleaning — H7, blocked; H8 settles indoor_unit_type
//
// CONDITIONAL_FIXED, and — same as before — deliberately NOT built on
// gateTwoSlotAccess or the shared accessGate's own behavior. This is the
// ONE service in the codebase whose access answer diverges from
// accessGate's generic rule (ACCESSIBLE and FINISHED both continue
// everywhere else) — the H7 trade decision makes disassembly washing
// behind finished construction genuinely outside this service's bounded
// scope, while every other service's FINISHED still continues. accessGate
// ITSELF is untouched; this resolver simply does not call it, and writes
// its own two-value check instead.
//
// indoor_unit_type — H8's own settled product decision, NOT discovered in
// approved authority. The H8 audit found no existing vocabulary for a
// mini-split indoor unit's physical form anywhere in Price2Book's own
// documents; the seven-value closed set below (WALL_MOUNTED /
// CEILING_CASSETTE / FLOOR_CONSOLE / CONCEALED_DUCTED / OTHER /
// MIXED_TYPES / UNKNOWN) is an explicit H8 decision, not a citation.
// Physical form ONLY — never capacity, refrigerant configuration,
// serviceability, manufacturer compatibility, or whether the unit "needs"
// cleaning. MIXED_TYPES exists so one scalar answer can never falsely
// describe several different heads at once — a home with two wall-mounted
// heads and one ceiling cassette answers MIXED_TYPES, not a guess at
// whichever type "counts most."
//
// Single-location (PRIMARY) — the outdoor unit is never touched by this
// service, unlike mini-split-tune-up's genuinely two-slot scope. No
// system_type question: H2 never declared system_identity for this
// service, and this resolver does not add one.
// ═══════════════════════════════════════════════════════════════════════

/**
 * H8. The physical form of the indoor mini-split unit(s) being cleaned —
 * families.ts's own new `indoor_unit_form` family. Concrete typing lives
 * here, not gates.ts: nothing in the seven gates reads it, the same
 * placement `CondensateRouteObservation` and `AccessoryKind` already use
 * for a family-declared, gate-free fact.
 */
export type IndoorUnitType =
  | "WALL_MOUNTED"
  | "CEILING_CASSETTE"
  | "FLOOR_CONSOLE"
  | "CONCEALED_DUCTED"
  | "OTHER"
  | "MIXED_TYPES"
  | "UNKNOWN";

export type MiniSplitHeadCleaningFacts = {
  /** Q1. A quantity; gates nothing beyond being positive. */
  headCount: number;
  /** Q2. The H8 settled vocabulary — see the section header. */
  indoorUnitType: IndoorUnitType;
  /** Q3. Read directly, NOT through accessGate — see the section header. */
  accessClass: AccessClass;
};

export type MiniSplitHeadCleaningResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
    }
  | HvacRefusal;

/**
 * Resolve `mini-split-head-cleaning` against a complete fact set. FAILS
 * CLOSED. No symptom question, no equipment_condition, no inference about
 * why cleaning is needed — the homeowner selected known disassembly-wash
 * work by name, and this resolver only ever scopes it.
 */
export function resolveMiniSplitHeadCleaning(facts: MiniSplitHeadCleaningFacts): MiniSplitHeadCleaningResolution {
  // Q1 — quantity. Must be positive to describe real work.
  if (facts.headCount < 1) {
    return unresolved("head_count", "The number of indoor units being deep cleaned has not been established.");
  }

  // Q2 — physical form. WALL_MOUNTED/CEILING_CASSETTE/FLOOR_CONSOLE stay
  // bounded; CONCEALED_DUCTED (hidden behind finished construction, only a
  // grille visible), OTHER, and MIXED_TYPES all leave automated pricing.
  if (facts.indoorUnitType === "UNKNOWN") {
    return unresolved("indoor_unit_type", "The physical form of the indoor unit(s) has not been established.");
  }
  if (
    facts.indoorUnitType === "CONCEALED_DUCTED" ||
    facts.indoorUnitType === "OTHER" ||
    facts.indoorUnitType === "MIXED_TYPES"
  ) {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "This indoor unit form is outside this service's bounded deep-cleaning scope.",
      factKey: "indoor_unit_type",
      observed: facts.indoorUnitType,
    });
  }

  // Q3 — access. Service-specific: FINISHED leaves automated pricing HERE
  // ONLY. Not accessGate — see the section header.
  if (facts.accessClass === "UNKNOWN") {
    return unresolved("access_class", "Whether the indoor units are in an open or finished space has not been established.");
  }
  if (facts.accessClass === "FINISHED") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "Disassembly washing behind finished construction is outside this service's bounded deep-cleaning scope.",
      factKey: "access_class",
      observed: "FINISHED",
    });
  }

  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED" };
}

export type MiniSplitHeadCleaningQuestionKey = "head_count" | "indoor_unit_type" | "indoor_access";

export type MiniSplitHeadCleaningAnswerOption = { value: string; label: string };

export type MiniSplitHeadCleaningQuestion = {
  key: MiniSplitHeadCleaningQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly MiniSplitHeadCleaningAnswerOption[];
};

export const MINI_SPLIT_HEAD_CLEANING_QUESTIONS: readonly MiniSplitHeadCleaningQuestion[] = [
  {
    key: "head_count",
    prompt: "How many indoor units need deep cleaning?",
    establishes: "head_count",
    options: [],
  },
  {
    key: "indoor_unit_type",
    prompt: "What do the indoor units look like?",
    establishes: "indoor_unit_type",
    options: [
      { value: "WALL_MOUNTED", label: "A wall-mounted unit, high on the wall" },
      { value: "CEILING_CASSETTE", label: "A flat cassette or grille in the ceiling" },
      { value: "FLOOR_CONSOLE", label: "A low, floor-level console" },
      { value: "CONCEALED_DUCTED", label: "Concealed, with only vents or grilles visible" },
      { value: "OTHER", label: "Something else" },
      { value: "MIXED_TYPES", label: "More than one different type" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "indoor_access",
    prompt: "Where are the indoor units?",
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
] as const;

// ═══════════════════════════════════════════════════════════════════════
// whole-house-humidifier — H8
//
// CONDITIONAL_FIXED. accessory_present decides the branch, the same
// presence/absence merge pattern every merged replacement/new-fit service
// in this codebase uses. The existing/replacement branch does NOT re-ask
// water, drain, or power — the unit standing there already proves them,
// per catalog review F.7's own resolution logic ("One already there
// proves the water, drain, duct opening and power"). The new-installation
// branch establishes all of them, because none is proven yet.
//
// humidifier_type gates BOTH branches, not just new installations — a
// steam humidifier's more complex power/water/drainage requirements apply
// whether it's a replacement or a first fit. UNKNOWN behaves DIFFERENTLY
// per branch: on replacement, an installed device exists and a photo can
// classify it (PHOTO_REVIEW); on new installation, there is no installed
// device for a photo to classify, so an unestablished desired type simply
// leaves fixed pricing (REMOTE_QUOTE) — the H8 settled distinction.
//
// water_supply_present is the H8-restored half of the original
// candidate-level new-installation branch (families.ts's own comment on
// water_supply_availability) — branch-only, matching
// dedicated_power_availability's own branch-only declaration for the same
// branch exactly. run_band reuses condensate-pump-installation's own
// one-boundary CondensateRunBand shape unchanged — no new numeric
// threshold invented in H8.
// ═══════════════════════════════════════════════════════════════════════

/**
 * H8. What kind of humidifier — families.ts's own new `humidifier_type`
 * fact on the already-declared `accessory_and_media` family. Read directly
 * off the unit (a bypass humidifier has no visible fan/motor, a
 * fan-powered one does, a steam one has a distinct canister/electrode
 * assembly) — never inferred from a manufacturer or model string.
 */
export type HumidifierType = "BYPASS" | "FAN_POWERED" | "STEAM" | "UNKNOWN";

/**
 * H8. Whether visible existing water tubing or a connection point is
 * within reach of the proposed installation — families.ts's own new
 * `water_supply_availability` family. Observation only: never whether the
 * connection is adequate, whether tapping it is permitted, or whether
 * pressure is sufficient.
 */
export type WaterSupplyPresence = "PRESENT" | "ABSENT" | "UNKNOWN";

export type WholeHouseHumidifierBranch = "REPLACEMENT" | "NEW_INSTALLATION";

/**
 * Every fact this service's tree can read. Always fully present at
 * resolution time — same discipline as every other resolver in this file.
 * `waterSupplyPresent`, `condensateRoute`, `dedicatedCircuitPresent` and
 * `runBand` are asked ONLY on the new-installation branch and are simply
 * never read when `accessoryPresent` is PRESENT — not because they are
 * unresolved, but because that branch's questions never establish them.
 * Ordinary branching, not the diagnostic-risk shape this file exists to
 * refuse.
 */
export type WholeHouseHumidifierFacts = {
  /** Q1. The branch decision. */
  accessoryPresent: AccessoryPresence;
  /** Q2. Asked on both branches; UNKNOWN routes differently per branch — see the section header. */
  humidifierType: HumidifierType;
  /** Q3 — PRIMARY slot. */
  accessClass: AccessClass;
  /** New-installation only. */
  waterSupplyPresent: WaterSupplyPresence;
  /** New-installation only. Reuses H3's own condensate_route vocabulary unchanged. */
  condensateRoute: CondensateRouteObservation;
  /** New-installation only. */
  dedicatedCircuitPresent: DedicatedCircuitPresence;
  /** New-installation only. Reuses condensate-pump-installation's own one-boundary run-band shape. */
  runBand: CondensateRunBand;
  /** Asked on both branches. */
  supplyArrangement: SupplyArrangementChoice;
};

export type WholeHouseHumidifierResolution =
  | {
      status: "RESOLVED";
      /** The approved CONDITIONAL_FIXED terminal, in the platform's own vocabulary. */
      routeAction: "RESOLVE_ADJUSTED";
      branch: WholeHouseHumidifierBranch;
    }
  | HvacRefusal;

/**
 * Resolve `whole-house-humidifier` against a complete fact set. FAILS
 * CLOSED. No question here asks whether a humidifier is needed, working
 * properly, undersized, or causing humidity problems — every fact below is
 * identity, type, access, or a utility-connection observation.
 */
export function resolveWholeHouseHumidifier(facts: WholeHouseHumidifierFacts): WholeHouseHumidifierResolution {
  // Q1 — the branch decision.
  if (facts.accessoryPresent === "UNKNOWN") {
    return unresolved("accessory_present", "Whether a humidifier is already on the ductwork has not been established.");
  }

  if (facts.accessoryPresent === "PRESENT") {
    // ── Existing / replacement branch ──────────────────────────────────
    // Q2 — humidifier type. An installed device exists, so UNKNOWN is
    // photo-reviewable, not a reason to leave pricing outright.
    if (facts.humidifierType === "UNKNOWN") {
      return unresolved("humidifier_type", "The type of the existing humidifier has not been established.");
    }
    if (facts.humidifierType === "STEAM") {
      return refuse({
        action: "REMOTE_QUOTE",
        reason: "Steam humidifiers are outside this fixed scope's bounded type branches.",
        factKey: "humidifier_type",
        observed: "STEAM",
      });
    }

    // Q3 — indoor access.
    const access = accessGate(facts.accessClass);
    if (access.action !== "CONTINUE") return refuse(access);

    // Water, drain, and power are NOT re-asked — the existing unit already
    // proves them. Q4 — supply arrangement, a policy choice that always
    // continues once asked.
    return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "REPLACEMENT" };
  }

  // ── New-installation branch ────────────────────────────────────────────
  // Q2 — desired humidifier type. No installed device exists for a photo
  // to classify, so an unestablished desired type leaves fixed pricing
  // instead of failing to PHOTO_REVIEW — the H8 settled distinction from
  // the replacement branch, above.
  if (facts.humidifierType === "UNKNOWN") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "No desired humidifier type was established, and there is no installed device a photo could classify instead.",
      factKey: "humidifier_type",
      observed: "UNKNOWN",
    });
  }
  if (facts.humidifierType === "STEAM") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "Steam humidifiers are outside this fixed scope's bounded type branches.",
      factKey: "humidifier_type",
      observed: "STEAM",
    });
  }

  // Q3 — indoor access.
  const access = accessGate(facts.accessClass);
  if (access.action !== "CONTINUE") return refuse(access);

  // Q4 — water supply.
  if (facts.waterSupplyPresent === "UNKNOWN") {
    return unresolved("water_supply_present", "Whether a water line is within reach of the installation point has not been established.");
  }
  if (facts.waterSupplyPresent === "ABSENT") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "No water line is within reach, and this fixed-price installation cannot be completed as promised without one.",
      factKey: "water_supply_present",
      observed: "ABSENT",
    });
  }

  // Q5 — condensate route.
  if (facts.condensateRoute === "UNKNOWN") {
    return unresolved("condensate_route", "Whether a floor drain or condensate pump is nearby has not been established.");
  }
  if (facts.condensateRoute === "NONE_VISIBLE") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "No floor drain or condensate pump was observed, and this fixed-price installation cannot be completed as promised without one.",
      factKey: "condensate_route",
      observed: "NONE_VISIBLE",
    });
  }
  // PUMP_PRESENT and GRAVITY_DRAIN_PRESENT both continue.

  // Q6 — power.
  if (facts.dedicatedCircuitPresent === "UNKNOWN") {
    return unresolved("dedicated_circuit_present", "Whether a normal outlet is within reach has not been established.");
  }
  if (facts.dedicatedCircuitPresent === "ABSENT") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "No outlet is within reach, and this fixed-price installation cannot be completed as promised without one.",
      factKey: "dedicated_circuit_present",
      observed: "ABSENT",
    });
  }

  // Q7 — run distance.
  if (facts.runBand === "UNKNOWN") {
    return unresolved("run_band", "The run distance has not been established.");
  }
  if (facts.runBand === "OVER_BAND") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "The run is longer than this contractor's standard band.",
      factKey: "run_band",
      observed: "OVER_BAND",
    });
  }

  // Q8 — supply arrangement.
  return { status: "RESOLVED", routeAction: "RESOLVE_ADJUSTED", branch: "NEW_INSTALLATION" };
}

export type WholeHouseHumidifierQuestionKey =
  | "accessory_present"
  | "humidifier_type_existing"
  | "humidifier_type_new"
  | "indoor_access"
  | "water_supply"
  | "condensate_route"
  | "dedicated_power"
  | "run_distance"
  | "supply_arrangement_replacement"
  | "supply_arrangement_new_installation";

export type WholeHouseHumidifierAnswerOption = { value: string; label: string };

export type WholeHouseHumidifierQuestion = {
  key: WholeHouseHumidifierQuestionKey;
  branch: WholeHouseHumidifierBranch | "SHARED";
  prompt: string;
  establishes: string;
  options: readonly WholeHouseHumidifierAnswerOption[];
};

export const WHOLE_HOUSE_HUMIDIFIER_QUESTIONS: readonly WholeHouseHumidifierQuestion[] = [
  {
    key: "accessory_present",
    branch: "SHARED",
    prompt: "Is there a whole-house humidifier on the ductwork now?",
    establishes: "accessory_present",
    options: [
      { value: "PRESENT", label: "Yes, there's one there now" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "humidifier_type_existing",
    branch: "REPLACEMENT",
    prompt: "What type of humidifier is installed now?",
    establishes: "humidifier_type",
    options: [
      { value: "BYPASS", label: "Bypass" },
      { value: "FAN_POWERED", label: "Fan-powered" },
      { value: "STEAM", label: "Steam" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "humidifier_type_new",
    branch: "NEW_INSTALLATION",
    prompt: "What type of whole-house humidifier would you like installed?",
    establishes: "humidifier_type",
    options: [
      { value: "BYPASS", label: "Bypass" },
      { value: "FAN_POWERED", label: "Fan-powered" },
      { value: "STEAM", label: "Steam" },
      { value: "UNKNOWN", label: "Not sure yet" },
    ],
  },
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
    key: "water_supply",
    branch: "NEW_INSTALLATION",
    prompt: "Is there a water line within reach of where the humidifier would be installed?",
    establishes: "water_supply_present",
    options: [
      { value: "PRESENT", label: "Yes, there's a water line nearby" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "condensate_route",
    branch: "NEW_INSTALLATION",
    prompt: "Is there a floor drain or a condensate pump nearby?",
    establishes: "condensate_route",
    options: [
      { value: "PUMP_PRESENT", label: "Yes, there's a pump there now" },
      { value: "GRAVITY_DRAIN_PRESENT", label: "No, but there's a drain line that runs away on its own" },
      { value: "NONE_VISIBLE", label: "No, I don't see anything like that" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "dedicated_power",
    branch: "NEW_INSTALLATION",
    prompt: "Is there a normal outlet within reach?",
    establishes: "dedicated_circuit_present",
    options: [
      { value: "PRESENT", label: "Yes, there's an outlet nearby" },
      { value: "ABSENT", label: "No" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "run_distance",
    branch: "NEW_INSTALLATION",
    // {b1} is the contractor's own one boundary — see lib/policyBands.ts.
    // Never shipped with a hole unresolved; rendering is a template-layer
    // concern this file does not perform.
    prompt: "About how far would a run need to travel to reach the installation point?",
    establishes: "run_band",
    options: [
      { value: "STANDARD", label: "{b1} feet or less" },
      { value: "OVER_BAND", label: "More than {b1} feet" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "supply_arrangement_replacement",
    branch: "REPLACEMENT",
    prompt: "Do you already have the replacement humidifier, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
  {
    key: "supply_arrangement_new_installation",
    branch: "NEW_INSTALLATION",
    prompt: "Do you already have the humidifier, or should one be supplied?",
    establishes: "supply_arrangement",
    options: [
      { value: "CUSTOMER_SUPPLIED", label: "I already have it" },
      { value: "CONTRACTOR_SUPPLIED", label: "Please supply it" },
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// vent-cover-replacement — H9
//
// FIXED. Nothing behind the wall changes on this service — the catalog
// review's own reason it stays bounded — so every fact here is a direct
// physical observation of the cover itself, never a duct-sizing, adequacy,
// airflow, balancing, or condition judgment. No `identityGate`, no
// `accessGate`: a vent cover is not HVAC equipment (families.ts's own
// comment on removing `indoor_equipment_access` from this service),
// and this service has no system-identity concern at all.
//
// THE MULTI-COVER PROBLEM, SOLVED THE SAME WAY H8 ALREADY DID. A
// homeowner replacing several covers may not have uniform sizes or
// surfaces. Exactly like H8's own `indoor_unit_type`, one scalar answer
// must never falsely describe several different items — `opening_size_
// pattern` and `mount_surface` each carry their own MIXED-shaped signal
// (`MIXED` for mount_surface, `MIXED` for opening_size_pattern) and each
// leaves automated pricing on its own, independently. No repeater, no
// array — the smallest architecture this platform already has a working
// precedent for.
//
// A SINGLE OPENING IS INHERENTLY UNIFORM. `opening_size_pattern` is read
// ONLY when `count > 1` — asking a homeowner replacing one cover whether
// several different sizes match would be a redundant, meaningless
// question, and this resolver skips it entirely rather than ask it.
//
// NO STANDARD-SIZE VOCABULARY. `opening_dimensions` is an open reading —
// `string | null`, the same shape `filter_slot_size` already uses —
// because no approved document anywhere defines a closed register/grille
// size list or a numeric size policy. Its content is never normalized,
// classified STANDARD/NONSTANDARD, or read for duct-sizing/airflow/
// compatibility meaning — only whether it was established at all.
// ═══════════════════════════════════════════════════════════════════════

export type OpeningSizePattern = "UNIFORM" | "MIXED" | "UNKNOWN";

export type MountSurface = "WALL" | "CEILING" | "FLOOR" | "MIXED" | "UNKNOWN";

export type VentCoverReplacementFacts = {
  /** Q1. A quantity; gates nothing beyond being positive. */
  count: number;
  /** Q2. Read only when count > 1 — see the section header. */
  openingSizePattern: OpeningSizePattern;
  /** Q3. A direct measurement/readout only — never duct sizing. */
  openingDimensions: string | null;
  /** Q4. */
  mountSurface: MountSurface;
};

export type VentCoverReplacementResolution =
  | {
      status: "RESOLVED";
      /** FIXED, not CONDITIONAL_FIXED — one price, no branch adjustment. */
      routeAction: "RESOLVE_INSTANT";
    }
  | HvacRefusal;

/**
 * Resolve `vent-cover-replacement` against a complete fact set. FAILS
 * CLOSED. No question here asks about airflow, duct adequacy, sizing
 * calculations, balancing, or condition — every branch below is either a
 * quantity, a direct physical reading, or a same-look observation of the
 * cover itself. Never REROUTE_SERVICE, never REROUTE_TROUBLESHOOTING.
 */
export function resolveVentCoverReplacement(facts: VentCoverReplacementFacts): VentCoverReplacementResolution {
  // Q1 — quantity. An observed count, not a number to normalize into
  // validity: a fraction, NaN, or Infinity is never rounded, floored, or
  // clamped into something usable — it fails closed exactly like an
  // unestablished count would.
  if (!Number.isInteger(facts.count) || facts.count < 1) {
    return unresolved("count", "The number of vent covers or grilles being replaced has not been established.");
  }

  // Q2 — size consistency. Only meaningful, and only read, when there is
  // more than one opening to compare — see the section header.
  if (facts.count > 1) {
    if (facts.openingSizePattern === "UNKNOWN") {
      return unresolved("opening_size_pattern", "Whether the openings are all the same size has not been established.");
    }
    if (facts.openingSizePattern === "MIXED") {
      return refuse({
        action: "REMOTE_QUOTE",
        reason: "Openings of different sizes cannot be bounded by this service's single fixed-price configuration.",
        factKey: "opening_size_pattern",
        observed: "MIXED",
      });
    }
  }

  // Q3 — physical dimensions. A direct measurement or printed readout,
  // never a duct-sizing or adequacy judgment. .trim() decides only whether
  // a reading exists — the stored value itself is never rewritten,
  // normalized, or parsed into width/height.
  if (facts.openingDimensions === null || facts.openingDimensions.trim() === "") {
    return unresolved("opening_dimensions", "The size of the existing opening has not been established.");
  }

  // Q4 — mounting surface.
  if (facts.mountSurface === "UNKNOWN") {
    return unresolved("mount_surface", "Whether the covers are on a wall, ceiling, or floor has not been established.");
  }
  if (facts.mountSurface === "MIXED") {
    return refuse({
      action: "REMOTE_QUOTE",
      reason: "Covers on more than one kind of surface cannot be bounded by this service's single fixed-price configuration.",
      factKey: "mount_surface",
      observed: "MIXED",
    });
  }

  return { status: "RESOLVED", routeAction: "RESOLVE_INSTANT" };
}

export type VentCoverReplacementQuestionKey = "count" | "opening_size_pattern" | "opening_dimensions" | "mount_surface";

export type VentCoverReplacementAnswerOption = { value: string; label: string };

export type VentCoverReplacementQuestion = {
  key: VentCoverReplacementQuestionKey;
  prompt: string;
  establishes: string;
  options: readonly VentCoverReplacementAnswerOption[];
};

export const VENT_COVER_REPLACEMENT_QUESTIONS: readonly VentCoverReplacementQuestion[] = [
  {
    key: "count",
    prompt: "How many vent covers or grilles are being replaced?",
    establishes: "count",
    options: [],
  },
  {
    // Rendered only when count > 1 — a single opening is inherently
    // uniform for this tree, per resolveVentCoverReplacement's own logic.
    key: "opening_size_pattern",
    prompt: "Are all of the openings the same size?",
    establishes: "opening_size_pattern",
    options: [
      { value: "UNIFORM", label: "Yes, they're all the same size" },
      { value: "MIXED", label: "No, they're different sizes" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  {
    key: "opening_dimensions",
    prompt: "What size is the existing opening?",
    establishes: "opening_dimensions",
    options: [],
  },
  {
    key: "mount_surface",
    prompt: "Where are the vent covers?",
    establishes: "mount_surface",
    options: [
      { value: "WALL", label: "On a wall" },
      { value: "CEILING", label: "On the ceiling" },
      { value: "FLOOR", label: "On the floor" },
      { value: "MIXED", label: "More than one of these" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
] as const;
