/**
 * Route Assist's observations -> Routing V2's canonical facts.
 *
 * THE BOUNDARY THIS ENFORCES
 *
 * Route Assist owns service-agnostic captured geometry. Routing V2 owns the
 * canonical trade vocabulary, the components, and every number with a currency
 * or an hour attached. Neither should know the other's internals, so exactly
 * one translation exists and it lives here, on the electrical side — Route
 * Assist's domain files must never contain an electrical answer key.
 *
 * PURE AND TOTAL, AND THE SECOND WORD IS THE POINT
 *
 * Pure: no Prisma, no I/O, no clock, no randomness, no pricing, no labor, no
 * diagnosis. Give it the same result twice and it answers the same twice.
 *
 * Total: EVERY field of RouteAssistResult is accounted for. A field either
 * produces a canonical fact or appears by name in `unmapped` with a reason a
 * person can read. Nothing is dropped on the floor, because the failure this
 * codebase keeps paying for is not a wrong value — it is a fact that quietly
 * stopped arriving and nobody noticed.
 *
 * Exhaustiveness is enforced by the compiler: FIELD_CLASSIFICATION is a
 * `Record<keyof RouteAssistResult, …>`, so adding a field to the result type
 * without classifying it here is a TYPE ERROR, not a runtime surprise. The
 * runtime sweep below then catches the other direction — a field present on
 * the object but absent from the type.
 *
 * WHAT THIS DELIBERATELY REFUSES TO DO
 *
 * `sameWall` never becomes back-to-back. They are different physical claims:
 * sameWall says the route crosses no wall transition; back-to-back says the
 * destination sits directly opposite the source through one wall's thickness.
 * The canonical back-to-back answer selects a component that carries NO
 * footage at all, so promoting a camera heuristic into it would let a
 * misclassification delete the entire length of a job. It stays unmapped until
 * the visual system can prove the specific condition.
 */

import type { RouteAssistResult } from "../visual-assist/route-assist/types";

/** Why a field produced no canonical fact. Every value is a decision. */
export type FieldClassification =
  | "MAPPED"
  | "UNMAPPED_INTENTIONALLY"
  | "UNSUPPORTED_INVALID";

export type UnmappedField = {
  field: keyof RouteAssistResult;
  classification: Exclude<FieldClassification, "MAPPED">;
  reason: string;
};

export type InvalidField = { field: keyof RouteAssistResult; reason: string };

/**
 * What Routing V2 is willing to hear from a camera.
 *
 * Physical observations only. No component, no quantity binding, no price —
 * the tree decides what a measurement means, which is why 21 ft routes to
 * Guided Estimate without this file knowing that 21 is special.
 */
export type RoutingV2ObservedFacts = {
  /** Maps to the install-method question. `null` when the capture was UNSURE. */
  installMethod: "surface" | "concealed" | null;
  /** Whole feet. Routing V2 is integer-only, so a fraction is refused, not rounded. */
  routeLengthFt: number | null;
  insideCorners: number | null;
  outsideCorners: number | null;
  /**
   * An EXACT opening count, when the capture produced one (min === max).
   * A range is not a quantity and is carried separately.
   */
  accessOpeningsExact: number | null;
  accessOpeningsRange: { min: number; max: number } | null;
  drywallAccessAllowed: boolean | null;
  /** The capture itself asked for a human. Routing V2 must not price past it. */
  needsContractorReview: boolean;
  customerConfirmedRoute: boolean;
};

export type RouteAssistAdaptation = {
  mapped: RoutingV2ObservedFacts;
  unmapped: UnmappedField[];
  invalid: InvalidField[];
};

/**
 * Every field of RouteAssistResult, classified. The compiler requires all of
 * them; the reasons are for the person who has to decide what to do next.
 */
export const FIELD_CLASSIFICATION: Record<
  keyof RouteAssistResult,
  { classification: FieldClassification; reason: string }
> = {
  mode: { classification: "MAPPED", reason: "install method — surface vs concealed" },
  estimatedTotalRouteLengthFt: { classification: "MAPPED", reason: "measured route length in whole feet" },
  insideCornersCount: { classification: "MAPPED", reason: "inside-corner count" },
  outsideCornersCount: { classification: "MAPPED", reason: "outside-corner count" },
  suggestedAccessOpeningsMin: { classification: "MAPPED", reason: "access-opening observation (exact when min === max, else a range)" },
  suggestedAccessOpeningsMax: { classification: "MAPPED", reason: "access-opening observation (exact when min === max, else a range)" },
  drywallAccessAllowed: { classification: "MAPPED", reason: "whether the homeowner permits drywall access" },
  needsContractorReview: { classification: "MAPPED", reason: "the capture asked for a human; routing must not price past it" },
  customerConfirmedRoute: { classification: "MAPPED", reason: "an unconfirmed route is not an observation anyone may act on" },

  sameWall: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason:
      "NOT back-to-back. sameWall means the route crosses no wall transition; back-to-back means " +
      "the destination is directly opposite the source through one wall. The canonical back-to-back " +
      "answer emits no footage, so promoting a heuristic here could erase a job's entire length. " +
      "Stays an observation until the visual system proves the specific condition.",
  },
  doorwayBypassesCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "Real geometry, no canonical Routing V2 primitive yet. A doorway currently sends the route to review with no quantity.",
  },
  windowBypassesCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "As doorways, kept distinct because the physical implications differ.",
  },
  wallTransitionsCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "No primitive exists on either the SURFACE or CONCEALED strategy today.",
  },
  verticalTransitionsCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "Pending an ordered-route representation; a vertical run is a segment kind, not a count, once fittings are placed in sequence.",
  },
  wallToCeilingTransitionsCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "A wall-to-ceiling transition is a segment KIND, not a count, once fittings are placed in sequence. Pending the ordered-route representation.",
  },
  wallToFloorTransitionsCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "A wall-to-floor transition is likewise a segment kind awaiting the ordered-route representation; counting them tells a takeoff nothing about where they occur.",
  },
  visibleObstacleDetoursCount: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "An unnamed detour is deliberately its own bucket in Route Assist and has no canonical meaning here.",
  },
  concealedRouteComplexity: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "A CLASSIFICATION, not an observation. Routing V2 makes its own judgements from counts; importing someone else's grade would move a decision across the boundary.",
  },
  points: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "Ordered geometry. Retained by Route Assist for a future takeoff that needs fittings placed in sequence; no consumer here yet.",
  },
  segments: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "As points — the ordered representation is not designed yet and must not be guessed at.",
  },
  destinationType: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "The endpoint is already settled by which service and question the customer is answering; taking it from the camera would let a capture contradict the tree.",
  },
  captureArtifacts: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "Photos and overlays are evidence for a person, never a routing fact.",
  },
  customerNotes: {
    classification: "UNMAPPED_INTENTIONALLY",
    reason: "Free text. Carried to the contractor by Route Assist; it can never select an option.",
  },
};

/** Integer-only, matching Routing V2's numeric contract exactly. */
function wholeFeet(n: number | null | undefined): { ok: true; value: number } | { ok: false; reason: string } | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return { ok: false, reason: `${n} is not a finite number` };
  if (!Number.isInteger(n)) {
    return { ok: false, reason: `${n} is not a whole number — Routing V2 refuses fractions rather than rounding them into a different range` };
  }
  if (n < 0) return { ok: false, reason: `${n} is negative` };
  return { ok: true, value: n };
}

function wholeCount(n: number | null | undefined): { ok: true; value: number } | { ok: false; reason: string } | null {
  if (n === null || n === undefined) return null;
  if (!Number.isInteger(n) || n < 0) return { ok: false, reason: `${n} is not a non-negative whole number` };
  return { ok: true, value: n };
}

/**
 * Translate one capture. Deterministic, side-effect free.
 */
export function adaptRouteAssistResult(result: RouteAssistResult): RouteAssistAdaptation {
  const unmapped: UnmappedField[] = [];
  const invalid: InvalidField[] = [];

  for (const [field, spec] of Object.entries(FIELD_CLASSIFICATION) as [
    keyof RouteAssistResult,
    { classification: FieldClassification; reason: string },
  ][]) {
    if (spec.classification !== "MAPPED") {
      unmapped.push({ field, classification: spec.classification, reason: spec.reason });
    }
  }

  // A field on the object that the TYPE does not know about. The compiler
  // cannot see this one, so it is checked here: an unclassified key is
  // surfaced rather than silently ignored.
  for (const key of Object.keys(result) as (keyof RouteAssistResult)[]) {
    if (!(key in FIELD_CLASSIFICATION)) {
      invalid.push({ field: key, reason: `"${String(key)}" is not classified in FIELD_CLASSIFICATION — classify it deliberately before it can be used or ignored` });
    }
  }

  const len = wholeFeet(result.estimatedTotalRouteLengthFt);
  if (len && !len.ok) invalid.push({ field: "estimatedTotalRouteLengthFt", reason: len.reason });
  const inside = wholeCount(result.insideCornersCount);
  if (inside && !inside.ok) invalid.push({ field: "insideCornersCount", reason: inside.reason });
  const outside = wholeCount(result.outsideCornersCount);
  if (outside && !outside.ok) invalid.push({ field: "outsideCornersCount", reason: outside.reason });

  const min = result.suggestedAccessOpeningsMin;
  const max = result.suggestedAccessOpeningsMax;
  let accessOpeningsExact: number | null = null;
  let accessOpeningsRange: { min: number; max: number } | null = null;
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      invalid.push({ field: "suggestedAccessOpeningsMin", reason: `openings ${min}–${max} is not a valid non-negative ascending range` });
    } else if (min === max) {
      // An exact observation. Still not a priced quantity — nothing consumes
      // it yet — but it is a different KIND of fact from a range and is kept
      // as one.
      accessOpeningsExact = min;
    } else {
      // Deliberately NOT collapsed. Not the min, not the max, not the mean:
      // a range is evidence that the route is not deterministic, and turning
      // it into a single number would invent a precision the camera refused.
      accessOpeningsRange = { min, max };
    }
  }

  const mapped: RoutingV2ObservedFacts = {
    installMethod:
      result.mode === "SURFACE" ? "surface" : result.mode === "CONCEALED" ? "concealed" : null,
    routeLengthFt: len && len.ok ? len.value : null,
    insideCorners: inside && inside.ok ? inside.value : null,
    outsideCorners: outside && outside.ok ? outside.value : null,
    accessOpeningsExact,
    accessOpeningsRange,
    drywallAccessAllowed: result.drywallAccessAllowed ?? null,
    needsContractorReview: result.needsContractorReview,
    customerConfirmedRoute: result.customerConfirmedRoute,
  };

  return { mapped, unmapped, invalid };
}
