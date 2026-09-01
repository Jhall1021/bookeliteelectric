/**
 * The five gates. Everything plumbing refuses to price, it refuses here.
 *
 * A gate is a pure function from RESOLVED FACTS to a route decision. It holds
 * no prices, reads no database, and cannot be talked into an answer by a
 * confident-sounding input — it is the plumbing-side expression of the rule
 * lib/routeResolver.ts already enforces: uncertain scope is a review, and our
 * own missing data is uncertain scope.
 *
 * WHY GATES AND NOT SIXTY-THREE DECISION TREES
 *
 * The deciding facts repeat. "Is there a working shutoff", "what is the pipe
 * made of", "how does this appliance vent" are asked across whole families of
 * services and mean the same thing every time. Written per service they would
 * drift — one tree treating an unknown vent as atmospheric because that is the
 * common case, which is a guess that ships a wrong price to whoever has the
 * other kind.
 *
 * FAIL CLOSED, AND SAY WHICH FACT WAS MISSING
 *
 * Every refusal carries the fact key that caused it. A review reason of
 * "insufficient information" tells an operator nothing and tells the next
 * engineer less.
 */

import type { RouteAction } from "../flow-types";

/**
 * What a gate may return, in PLUMBING'S OWN VOCABULARY.
 *
 * Deliberately not the platform's `RouteAction` strings. A gate can send a
 * route to review, ask for photographs, or hand off to an on-site service
 * call — it can never RESOLVE. Only the pricing engine resolves, and a gate
 * that could would be a second place that decides a price.
 *
 * ON_SITE_SERVICE, NOT "DIAGNOSTIC"
 *
 * The platform expresses this hand-off as `REROUTE_TROUBLESHOOTING`, and that
 * enum is shared and stays exactly as it is. But plumbing must not describe
 * the destination as a diagnosis, in its own code or in front of a customer:
 * "diagnostic" asserts we already know the problem is a fault to be found,
 * which is a conclusion about a cause. What is actually true is narrower and
 * honest — somebody visits, on site, and establishes what the work is.
 *
 * That is the no-self-diagnosis boundary applied to the ROUTE as well as to
 * the answer. An observation of water escaping earns a visit; it does not
 * earn a diagnosis, and naming the outcome after one would smuggle the
 * conclusion back in through the label.
 */
export type PlumbingOutcome = "CONTINUE" | "PHOTO_REVIEW" | "REMOTE_QUOTE" | "ON_SITE_SERVICE";

/**
 * Plumbing's outcome to the platform's route action.
 *
 * One translation, in one place, total over the union. The platform enum is
 * untouched — this is a vocabulary boundary, not a schema change.
 */
export const PLATFORM_ROUTE_ACTION: Readonly<Record<PlumbingOutcome, RouteAction>> = {
  CONTINUE: "CONTINUE",
  PHOTO_REVIEW: "PHOTO_REVIEW",
  REMOTE_QUOTE: "REMOTE_QUOTE",
  ON_SITE_SERVICE: "REROUTE_TROUBLESHOOTING",
};

export function toRouteAction(outcome: PlumbingOutcome): RouteAction {
  return PLATFORM_ROUTE_ACTION[outcome];
}

export type GateOutcome = {
  action: PlumbingOutcome;
  /** Operator-facing. Never rendered to a customer as-is. */
  reason: string;
  /** The canonical input that was missing or disqualifying. */
  factKey: string;
  /**
   * WHAT WAS OBSERVED, carried onto the refusal.
   *
   * A route that leaves automated pricing must arrive at review with the
   * observation intact. "Needs review" on its own tells whoever picks it up
   * nothing, and they then ask the customer the question the customer already
   * answered. This is the observation as CONTEXT — never a conclusion drawn
   * from it, and never a recommendation about what to do next.
   */
  observed?: string;
};

const proceed = (factKey: string, observed?: string): GateOutcome => ({
  action: "CONTINUE",
  reason: "",
  factKey,
  observed,
});

export type PlumbingGateKey =
  | "access_gate"
  | "shutoff_gate"
  | "combustion_gate"
  | "capacity_gate"
  | "condition_gate";

// ---------------------------------------------------------------------------
// The canonical fact vocabularies.
//
// These are TRADE KNOWLEDGE, not policy: that a gas appliance is either
// atmospherically vented or power vented is true of the appliance, and no
// contractor chose it. They are the values Visual Assist is validated into and
// the values a manual answer produces — one vocabulary, two ways of reaching
// it, so nothing downstream can tell or care which was used.
// ---------------------------------------------------------------------------

export type AccessClass = "ACCESSIBLE" | "FINISHED" | "UNKNOWN";

export type ShutoffCondition =
  /** A dedicated shutoff exists and operates. */
  | "PRESENT_WORKING"
  /** It exists and does not hold — the job now includes replacing it. */
  | "PRESENT_FAILED"
  /** There is none; the work reaches back to the next upstream valve. */
  | "ABSENT"
  | "UNKNOWN";

export type CombustionClass =
  /** Draft hood, B-vent, no fan. */
  | "GAS_ATMOSPHERIC"
  /** Fan-assisted, PVC vent, needs a receptacle. */
  | "GAS_POWER_VENT"
  /** Sealed combustion, two-pipe direct vent. */
  | "GAS_DIRECT_VENT"
  /** No combustion at all. */
  | "ELECTRIC"
  | "UNKNOWN";

export type FixtureCondition =
  | "SERVICEABLE"
  /** Corroded, seized, leaking at a joint that has to be cut. */
  | "DEGRADED"
  /** Actively failing — this is not a scheduled replacement. */
  | "ACTIVE_FAILURE"
  | "UNKNOWN";

export const COMBUSTION_CLASSES: readonly CombustionClass[] = [
  "GAS_ATMOSPHERIC",
  "GAS_POWER_VENT",
  "GAS_DIRECT_VENT",
  "ELECTRIC",
  "UNKNOWN",
];

// ---------------------------------------------------------------------------
// 1. ACCESS GATE
// ---------------------------------------------------------------------------

/**
 * An unknown route is not an open route.
 *
 * The electrical catalog learned this the expensive way: a component
 * conditioned on "accessible" failed to match "has_access" and three services
 * quietly fell through to review. Plumbing conditions on the classification
 * only, and an UNKNOWN classification stops rather than defaulting to the
 * cheaper branch.
 */
export function accessGate(access: AccessClass): GateOutcome {
  if (access === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The route to the connection has not been established.",
      factKey: "access_class",
      observed: access,
    };
  return proceed("access_class", access);
}

// ---------------------------------------------------------------------------
// 2. SHUTOFF GATE
// ---------------------------------------------------------------------------

/**
 * Whether the water can be stopped at the fixture decides the size of the job.
 *
 * A failed or absent stop means shutting the building down and, in most cases,
 * replacing the valve as part of the work. That is a scope change, not a
 * surcharge — which is why this returns a route rather than a modifier.
 *
 * `valveReplacementIsInScope` is the service's own declaration that it already
 * includes the valve. For those services a failed stop changes nothing and the
 * gate must not send a perfectly ordinary job to review.
 */
export function shutoffGate(
  condition: ShutoffCondition,
  opts: { valveReplacementIsInScope: boolean }
): GateOutcome {
  if (condition === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "Whether a working fixture shutoff exists has not been established.",
      factKey: "shutoff_condition",
      observed: condition,
    };
  if (opts.valveReplacementIsInScope) return proceed("shutoff_condition", condition);
  if (condition === "PRESENT_FAILED" || condition === "ABSENT")
    return {
      action: "REMOTE_QUOTE",
      reason:
        condition === "ABSENT"
          ? "No fixture shutoff exists, so the work reaches back to the next upstream valve."
          : "The fixture shutoff does not hold and has to be replaced as part of the work.",
      factKey: "shutoff_condition",
      observed: condition,
    };
  return proceed("shutoff_condition", condition);
}

// ---------------------------------------------------------------------------
// 3. COMBUSTION GATE
// ---------------------------------------------------------------------------

/**
 * A gas appliance cannot be priced without knowing how it vents.
 *
 * Atmospheric and power vent are different installations: different vent
 * material, different terminations, and a power vent needs a receptacle within
 * reach that an atmospheric heater never had. Guessing the common case is the
 * single most expensive mistake available in this catalog, so UNKNOWN stops.
 *
 * ELECTRIC on a service that expects combustion is a REROUTE rather than a
 * review: the customer is not describing an unusual version of this job, they
 * are describing a different job, and their answers belong to that one.
 */
export function combustionGate(
  observed: CombustionClass,
  opts: { serviceExpects: Exclude<CombustionClass, "UNKNOWN">[] }
): GateOutcome {
  if (observed === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The appliance's venting arrangement has not been established.",
      factKey: "combustion_class",
      observed: observed,
    };
  if (!opts.serviceExpects.includes(observed))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.serviceExpects.join(", ")}; the equipment observed is ${observed}.`,
      factKey: "combustion_class",
      observed,
    };
  return proceed("combustion_class", observed);
}

// ---------------------------------------------------------------------------
// 4. CAPACITY GATE
// ---------------------------------------------------------------------------

/**
 * Equipment sized outside the bands a service covers is a different job.
 *
 * The bands themselves are trade facts — a 40 and a 50 gallon heater are
 * standard residential sizes and nobody chose those numbers. What a contractor
 * stocks is not a trade fact and is not here; this gate only decides whether
 * the SERVICE claims to cover the size in front of it.
 *
 * A null capacity is unresolved, and unresolved is not "probably the common
 * size". It is the reason this returns PHOTO_REVIEW rather than picking one.
 */
export function capacityGate(
  capacity: number | null,
  opts: { unit: string; covers: readonly number[] }
): GateOutcome {
  if (capacity === null)
    return {
      action: "PHOTO_REVIEW",
      reason: "The equipment's capacity has not been established.",
      factKey: "capacity",
    };
  if (!Number.isFinite(capacity) || capacity <= 0)
    return {
      action: "PHOTO_REVIEW",
      reason: `Capacity ${capacity} is not a usable figure.`,
      factKey: "capacity",
      observed: String(capacity),
    };
  if (!opts.covers.includes(capacity))
    return {
      action: "REMOTE_QUOTE",
      reason: `This service covers ${opts.covers.join("/")} ${opts.unit}; the equipment observed is ${capacity} ${opts.unit}.`,
      factKey: "capacity",
      observed: String(capacity),
    };
  return proceed("capacity", String(capacity));
}

// ---------------------------------------------------------------------------
// 5. CONDITION GATE
// ---------------------------------------------------------------------------

/**
 * An OBSERVATION decides whether automated pricing still applies. Nothing more.
 *
 * THE NO-SELF-DIAGNOSIS BOUNDARY, AT ITS STRICTEST
 *
 * This is the only gate that can take a customer out of the priceable catalog
 * entirely, so it is held to the narrowest contract in the template:
 *
 *     observable condition  ->  continue, or leave automated pricing
 *
 * It may not choose a repair, recommend a replacement, attach a
 * component-specific fix, or name why anything is failing. "Visibly corroded"
 * is something a homeowner can see and a photograph can show. "Failed
 * cartridge", "bad PRV", "collapsed sewer" and "undersized piping" are
 * conclusions about a cause, and a booking flow that reached one would be
 * diagnosing from a web form.
 *
 * The distinction is not pedantic. A conclusion here would pick the repair,
 * and the customer would be quoted for work nobody has seen — which is the
 * failure the whole price promise is built to avoid.
 *
 * The same rule governs the DESTINATION. An observed active failure routes to
 * an on-site service call, never to a "diagnostic" — the second word asserts
 * we already know there is a fault to find, which is the conclusion this gate
 * is forbidden to reach.
 *
 * WHY DEGRADED LEAVES AUTOMATED PRICING RATHER THAN ADDING WORK
 *
 * An earlier version attached a repair coupling and a rework component to
 * DEGRADED. That was the boundary being crossed: an observation was choosing a
 * specific repair. It now routes out and carries the observation with it, so a
 * person decides what the work is.
 */
export function conditionGate(condition: FixtureCondition): GateOutcome {
  if (condition === "UNKNOWN")
    return {
      action: "PHOTO_REVIEW",
      reason: "The condition of the existing installation has not been established.",
      factKey: "fixture_condition",
      observed: condition,
    };
  if (condition === "ACTIVE_FAILURE")
    return {
      action: "ON_SITE_SERVICE",
      // States what was seen and where it goes. Names no cause, and calls the
      // destination what it is: somebody visits and establishes the work.
      reason: "Water was observed escaping, so this is an on-site service call rather than a scheduled replacement.",
      factKey: "fixture_condition",
      observed: condition,
    };
  if (condition === "DEGRADED")
    return {
      action: "PHOTO_REVIEW",
      reason: "A visible condition was reported that may put the work outside the fixed scope.",
      factKey: "fixture_condition",
      observed: condition,
    };
  return proceed("fixture_condition", condition);
}

/**
 * Run several gates and take the FIRST refusal, in the order given.
 *
 * Order matters and is the caller's decision: asking about a water heater's
 * capacity before establishing that it is even a gas heater produces a
 * confusing refusal about the wrong fact. Combining outcomes any other way —
 * "most severe wins", say — would hide which fact was actually missing.
 */
export function firstRefusal(outcomes: readonly GateOutcome[]): GateOutcome {
  for (const o of outcomes) if (o.action !== "CONTINUE") return o;
  return proceed("");
}
