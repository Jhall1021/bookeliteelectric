/**
 * The seven HVAC gates. Everything HVAC refuses to price, it refuses here.
 *
 * SEVEN, NOT EIGHT — H2 audit correction. An earlier draft of the
 * architecture package summarized this as eight in one passing comparison
 * line; the itemized table it never updated says seven, and seven is what
 * this file declares. Adding an eighth on the strength of a stale summary
 * count is exactly the error the correction exists to prevent.
 *
 * A gate is a pure function from RESOLVED FACTS to a route decision. It
 * holds no prices, reads no database, and mirrors lib/plumbing/gates.ts's
 * shape exactly — same outcome vocabulary, same fail-closed posture, same
 * "say which fact was missing" discipline — INDEPENDENTLY AUTHORED. HVAC's
 * own AccessClass, EquipmentCondition and friends are declared fresh below,
 * not imported from lib/plumbing/gates.ts: the shape recurs, the content
 * does not, and a cross-trade import here would be exactly the coupling
 * H1's own verifier already refuses.
 *
 * FAIL CLOSED, AND SAY WHICH FACT WAS MISSING
 *
 * Every refusal carries the fact key that caused it. lib/routeResolver.ts's
 * rule — uncertain scope is a review, and our own missing data is uncertain
 * scope — is what these gates exist to express in HVAC's own vocabulary.
 */

import type { RouteAction } from "../flow-types";

/**
 * What a gate may return, in HVAC'S OWN VOCABULARY — Plumbing's four,
 * unchanged, because the outcome shape is generic and the content is not.
 *
 * ON_SITE_SERVICE, NOT "DIAGNOSTIC" — same boundary Plumbing draws. The
 * platform expresses this hand-off as `REROUTE_TROUBLESHOOTING`; HVAC must
 * not describe the destination as a diagnosis, in code or in front of a
 * customer. Somebody visits, on site, and establishes what the work is —
 * that is the whole and honest claim.
 */
export type HvacOutcome = "CONTINUE" | "PHOTO_REVIEW" | "REMOTE_QUOTE" | "ON_SITE_SERVICE";

/** HVAC's outcome to the platform's route action. One translation, total. */
export const PLATFORM_ROUTE_ACTION: Readonly<Record<HvacOutcome, RouteAction>> = {
  CONTINUE: "CONTINUE",
  PHOTO_REVIEW: "PHOTO_REVIEW",
  REMOTE_QUOTE: "REMOTE_QUOTE",
  ON_SITE_SERVICE: "REROUTE_TROUBLESHOOTING",
};

export function toRouteAction(outcome: HvacOutcome): RouteAction {
  return PLATFORM_ROUTE_ACTION[outcome];
}

export type GateOutcome = {
  action: HvacOutcome;
  /** Operator-facing. Never rendered to a customer as-is. */
  reason: string;
  /** The canonical input that was missing or disqualifying. */
  factKey: string;
  /** What was observed, carried onto the refusal as CONTEXT — never a conclusion. */
  observed?: string;
};

const proceed = (factKey: string, observed?: string): GateOutcome => ({
  action: "CONTINUE",
  reason: "",
  factKey,
  observed,
});

export type HvacGateKey =
  | "identity_gate"
  | "fuel_gate"
  | "venting_gate"
  | "capacity_gate"
  | "access_gate"
  | "control_gate"
  | "condition_gate";

export const HVAC_GATE_KEYS: readonly HvacGateKey[] = [
  "identity_gate",
  "fuel_gate",
  "venting_gate",
  "capacity_gate",
  "access_gate",
  "control_gate",
  "condition_gate",
] as const;

// ---------------------------------------------------------------------------
// The canonical fact vocabularies — HVAC trade knowledge, independently
// declared. Every closed vocabulary carries UNKNOWN, and UNKNOWN stops
// rather than defaulting to the common case (hvac-v0-architecture.md §E).
// ---------------------------------------------------------------------------

export type SystemType =
  | "FURNACE_AND_AC"
  | "HEAT_PUMP_SPLIT"
  | "DUAL_FUEL"
  | "BOILER_HYDRONIC"
  | "MINI_SPLIT_DUCTLESS"
  | "PACKAGE_UNIT"
  | "AIR_HANDLER_ONLY"
  | "UNKNOWN";

export type FuelType = "NATURAL_GAS" | "PROPANE" | "OIL" | "ELECTRIC" | "DUAL_FUEL" | "UNKNOWN";

/**
 * Directly observable from pipe material and count — a metal pipe into a
 * chimney; a metal pipe with a fan behind it; one or two white plastic pipes
 * through a side wall; nothing at all. Asking what the pipe looks like is an
 * observation; asking whether the system is "high efficiency" is asking the
 * homeowner to classify their equipment, and no question here does that.
 */
export type VentingClass = "ATMOSPHERIC" | "INDUCED_DRAFT" | "DIRECT_VENT_SEALED" | "NON_COMBUSTION" | "UNKNOWN";

/** Independently declared — see the file header on why this is not imported. */
export type AccessClass = "ACCESSIBLE" | "FINISHED" | "UNKNOWN";

/**
 * H6. `outdoor_equipment_access`'s own second established fact (H2:
 * `establishes: ["outdoor_location", "access_class"]`) — declared since H2
 * but never given a concrete vocabulary until now, the same "first concrete
 * typing of an already-declared fact" shape H4 gave `terminal_scheme`.
 * Per hvac-v0-architecture.md §E.5.2. Observable only: where the outdoor
 * unit physically sits, never a judgment about whether that location is
 * "standard" or "difficult" — `access_class`, gated by the unchanged
 * `accessGate`, is what carries that boundary. `NONE` is a distinct,
 * meaningful value (no outdoor unit was found at all), not folded into
 * `UNKNOWN` — a service whose scope requires outdoor equipment treats it as
 * a contradiction, not merely an unresolved fact.
 */
export type OutdoorLocation =
  | "GROUND_LEVEL_ADJACENT"
  | "GROUND_LEVEL_REMOTE"
  | "ROOF"
  | "WALL_OR_BALCONY_MOUNT"
  | "NONE"
  | "UNKNOWN";

export type ControlPresent = "PRESENT_WORKING" | "PRESENT_NOT_RESPONDING" | "ABSENT" | "UNKNOWN";

/** The C-wire fact, per §E.3 — a homeowner counts wires and looks for one marked C. */
export type CommonWirePresence = "PRESENT" | "ABSENT" | "UNKNOWN";

/**
 * H4. What's printed on the back plate — ordinary lettered low-voltage
 * terminals (R, C, W, Y, G, O/B) versus a manufacturer-specific or
 * communicating scheme. Observable, never a judgment: the question is what
 * the labels say, not whether the system is "compatible" or "communicating".
 * `existing_control`'s own fact, established before `common_wire` is even
 * asked — "is there a C wire" is meaningless on a plate that isn't lettered
 * that way at all.
 */
export type TerminalScheme = "STANDARD_LETTERED" | "MANUFACTURER_SPECIFIC" | "UNKNOWN";

/**
 * An observation, never a conclusion — the same test `existing_condition`
 * answers pass. "There is visible rust or corrosion", never "the heat
 * exchanger is cracked".
 */
export type EquipmentCondition = "SERVICEABLE" | "DEGRADED" | "ACTIVE_FAILURE" | "UNKNOWN";

/** Which rating a capacity reading is on. A service covering both declares two. */
export type CapacityAxis = "COOLING" | "HEATING";

// ---------------------------------------------------------------------------
// 1. IDENTITY GATE
// ---------------------------------------------------------------------------

/**
 * Asked first on nearly every service — the root fact. An unrecognized
 * system type is a different job, not an unusual version of this one.
 */
export function identityGate(
  observed: SystemType,
  opts: { serviceExpects: readonly Exclude<SystemType, "UNKNOWN">[] }
): GateOutcome {
  if (observed === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The system type has not been established.",
      factKey: "system_type",
      observed,
    };
  if (!opts.serviceExpects.includes(observed))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.serviceExpects.join(", ")}; the equipment observed is ${observed}.`,
      factKey: "system_type",
      observed,
    };
  return proceed("system_type", observed);
}

// ---------------------------------------------------------------------------
// 2. FUEL GATE
// ---------------------------------------------------------------------------

/**
 * V1's structured scope is gas/propane forced-air (Part 7, trade pass).
 * Selecting oil or another fuel a service does not structure must not
 * silently receive a gas-furnace promise — it reroutes rather than guesses.
 */
export function fuelGate(
  observed: FuelType,
  opts: { serviceExpects: readonly Exclude<FuelType, "UNKNOWN">[] }
): GateOutcome {
  if (observed === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The fuel type has not been established.",
      factKey: "fuel_type",
      observed,
    };
  if (!opts.serviceExpects.includes(observed))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.serviceExpects.join(", ")}; the fuel observed is ${observed}.`,
      factKey: "fuel_type",
      observed,
    };
  return proceed("fuel_type", observed);
}

// ---------------------------------------------------------------------------
// 3. VENTING GATE
// ---------------------------------------------------------------------------

/**
 * One of the largest scope drivers in the trade. A sealed-combustion unit
 * needs PVC venting and condensate disposal an atmospheric one never had.
 * Guessing the common case is the single most expensive mistake available
 * here, so UNKNOWN stops rather than assuming atmospheric.
 */
export function ventingGate(
  observed: VentingClass,
  opts: { serviceExpects: readonly Exclude<VentingClass, "UNKNOWN">[] }
): GateOutcome {
  if (observed === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The venting arrangement has not been established.",
      factKey: "venting_class",
      observed,
    };
  if (!opts.serviceExpects.includes(observed))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.serviceExpects.join(", ")}; the venting observed is ${observed}.`,
      factKey: "venting_class",
      observed,
    };
  return proceed("venting_class", observed);
}

// ---------------------------------------------------------------------------
// 4. CAPACITY GATE
// ---------------------------------------------------------------------------

/**
 * Cooling capacity (tons) and heating input (BTU/h) are separate ratings on
 * separate equipment, read off a nameplate or rating plate — never inferred.
 * `covers` values are standard manufactured ratings (1.5–5 tons; 40k–120k
 * BTU) that nobody at Price2Book chose, exactly as Plumbing's TANK_GALLONS
 * are canonical labels rather than a policy with holes.
 *
 * A service covering both axes (whole-system-replacement) calls this twice,
 * once per axis — approved, H2 decision — never once with two numbers.
 */
export function capacityGate(
  capacity: number | null,
  opts: { axis: CapacityAxis; unit: string; covers: readonly number[] }
): GateOutcome {
  const factKey = opts.axis === "COOLING" ? "cooling_tons" : "heating_input_btu";
  if (capacity === null)
    return {
      action: "PHOTO_REVIEW",
      reason: `The equipment's ${opts.axis === "COOLING" ? "cooling capacity" : "heating input"} has not been established.`,
      factKey,
    };
  if (!Number.isFinite(capacity) || capacity <= 0)
    return {
      action: "PHOTO_REVIEW",
      reason: `Capacity ${capacity} is not a usable figure.`,
      factKey,
      observed: String(capacity),
    };
  if (!opts.covers.includes(capacity))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.covers.join("/")} ${opts.unit}; the equipment observed is ${capacity} ${opts.unit}.`,
      factKey,
      observed: String(capacity),
    };
  return proceed(factKey, String(capacity));
}

// ---------------------------------------------------------------------------
// 5. ACCESS GATE
// ---------------------------------------------------------------------------

/** An unknown route is not an open route. Conditions on the classification only. */
export function accessGate(access: AccessClass): GateOutcome {
  if (access === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The route to the equipment has not been established.",
      factKey: "access_class",
      observed: access,
    };
  return proceed("access_class", access);
}

// ---------------------------------------------------------------------------
// 6. CONTROL GATE
// ---------------------------------------------------------------------------

/**
 * The highest-volume family in the catalog. `PRESENT_NOT_RESPONDING` is a
 * SYMPTOM, and by DEFAULT this gate routes it to ON_SITE_SERVICE rather
 * than continuing — the homeowner can select what they observed and still
 * be routed correctly without this gate concluding anything from it.
 *
 * `opts.presentNotRespondingIsKnownWork` IS THE ONE NARROW EXCEPTION —
 * H4. Every caller that omits it (every caller today, and every future
 * one, unless it deliberately opts in) gets the exact behavior above,
 * unchanged. It exists for exactly one shape of caller: an explicitly
 * selected KNOWN-WORK replacement/installation request (`thermostat-
 * installation`'s own resolver), where "not responding" is not an
 * unresolved question — the homeowner already said "replace it", and a
 * non-responding old unit is on-point evidence FOR that choice, not a
 * symptom report needing a visit to interpret. It does not weaken the
 * default: scripts/verify-hvac-template.ts proves the un-opted-in call
 * still refuses to ON_SITE_SERVICE.
 *
 * Counting wires and finding a blue or C-marked one are observations a
 * homeowner makes reliably from one photograph. Whether the thermostat has
 * enough power is a conclusion, and this gate never asks it — it asks
 * whether the conductors present can carry the SELECTED control, a
 * mechanical fact the service's own requirement states.
 *
 * `opts.terminalScheme` IS ALSO H4, ALSO OPTIONAL. Set only by a family
 * that actually asks the question — `existing_control`'s own
 * `terminal_scheme` fact — and checked before common wire: asking "is
 * there a C wire" is meaningless on a plate that isn't lettered that way
 * at all. Every caller that omits it skips straight to the common-wire
 * check, exactly as before H4.
 */
export function controlGate(
  present: ControlPresent,
  opts: {
    presentNotRespondingIsKnownWork?: boolean;
    terminalScheme?: TerminalScheme;
    requiresCommonWire: boolean;
    commonWirePresent: CommonWirePresence;
  }
): GateOutcome {
  if (present === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "Whether an existing control is present and working has not been established.",
      factKey: "control_present",
      observed: present,
    };
  if (present === "PRESENT_NOT_RESPONDING" && !opts.presentNotRespondingIsKnownWork)
    return {
      action: "ON_SITE_SERVICE",
      reason: "The existing control was reported not responding — an observation, not a diagnosis of why.",
      factKey: "control_present",
      observed: present,
    };
  if (opts.terminalScheme !== undefined) {
    if (opts.terminalScheme === "UNKNOWN")
      return {
        action: "PHOTO_REVIEW",
        reason: "Whether the terminal labeling is a standard lettered scheme has not been established.",
        factKey: "terminal_scheme",
        observed: opts.terminalScheme,
      };
    if (opts.terminalScheme === "MANUFACTURER_SPECIFIC")
      return {
        action: "REMOTE_QUOTE",
        reason: "The terminal labeling is not the standard lettered scheme this service prices against.",
        factKey: "terminal_scheme",
        observed: opts.terminalScheme,
      };
  }
  if (opts.requiresCommonWire) {
    if (opts.commonWirePresent === "UNKNOWN")
      return {
        action: "PHOTO_REVIEW",
        reason: "Whether a common (C) wire is present has not been established.",
        factKey: "common_wire",
        observed: opts.commonWirePresent,
      };
    if (opts.commonWirePresent === "ABSENT")
      return {
        action: "REMOTE_QUOTE",
        reason: "The selected control needs a common wire the conductors present do not carry, without a spare to add one.",
        factKey: "common_wire",
        observed: opts.commonWirePresent,
      };
  }
  return proceed("control_present", present);
}

// ---------------------------------------------------------------------------
// 7. CONDITION GATE
// ---------------------------------------------------------------------------

/**
 * An OBSERVATION decides whether automated pricing still applies. Nothing
 * more — mirrors lib/plumbing/gates.ts's conditionGate exactly, because the
 * no-self-diagnosis boundary is the same boundary in every trade.
 * EFFECT-FREE: see lib/hvac/mappings.ts's EXISTING_CONDITION_SCOPE, which
 * attaches no material role, no component and no prerequisite to any member.
 */
export function conditionGate(condition: EquipmentCondition): GateOutcome {
  if (condition === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The condition of the existing installation has not been established.",
      factKey: "equipment_condition",
      observed: condition,
    };
  if (condition === "ACTIVE_FAILURE")
    return {
      action: "ON_SITE_SERVICE",
      reason: "An active failure was observed, so this is an on-site service call rather than a scheduled visit.",
      factKey: "equipment_condition",
      observed: condition,
    };
  if (condition === "DEGRADED")
    return {
      action: "PHOTO_REVIEW",
      reason: "A visible condition was reported that may put the work outside the fixed scope.",
      factKey: "equipment_condition",
      observed: condition,
    };
  return proceed("equipment_condition", condition);
}

/**
 * Run several gates and take the FIRST refusal, in the order given — mirrors
 * lib/plumbing/gates.ts's firstRefusal exactly. Order is the caller's
 * decision: asking about capacity before establishing system identity
 * produces a confusing refusal about the wrong fact.
 */
export function firstRefusal(outcomes: readonly GateOutcome[]): GateOutcome {
  for (const o of outcomes) if (o.action !== "CONTINUE") return o;
  return proceed("");
}
