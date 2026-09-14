import {
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
  type RouteAssistScanEvidenceV1,
} from "../visual-assist/route-assist/scanEvidence";
import type { RouteAssistResult } from "../visual-assist/route-assist/types";

/**
 * Canonical PHYSICAL facts that correspond one-for-one with Routing V2's
 * existing surface-route quantities:
 *
 * - surfaceRouteFt       -> SURFACE_ROUTE_FT
 * - insideCornerCount    -> SURFACE_ROUTE_INSIDE_CORNER
 * - outsideCornerCount   -> SURFACE_ROUTE_OUTSIDE_CORNER
 * - flatCornerCount      -> SURFACE_ROUTE_FLAT_CORNER
 *
 * This module deliberately does not import the Prisma authoring module and does
 * not emit question keys, AnswerOptions, components, material rows, labor or
 * price. It translates evidence into physical fact candidates only.
 */
export type RoutingV2SurfacePhysicalFactsV1 = {
  surfaceRouteFt: number;
  insideCornerCount: number;
  outsideCornerCount: number;
  flatCornerCount: number;
};

/**
 * The subset of a RouteAssistResult relevant to physical-fact projection.
 * Keeping this narrow prevents unrelated result fields (notes, complexity,
 * access-opening ranges, etc.) from quietly gaining authority here.
 */
export type RouteAssistSurfaceFactSource = Pick<
  RouteAssistResult,
  "mode" | "customerConfirmedRoute" | "needsContractorReview" | "points" | "segments"
>;

export type RoutingV2SurfacePhysicalFactProjectionV1 = {
  /** COMPLETE means the physical facts can be stated from this evidence. */
  state: "COMPLETE" | "INCOMPLETE";
  facts: RoutingV2SurfacePhysicalFactsV1 | null;

  /**
   * Ordered segment lengths remain available for future MaterialTakeoff stock
   * math. They are physical geometry, not purchased-stick quantities.
   */
  orderedSegmentLengthsFt: number[] | null;

  /** Lowest provider/runtime confidence among observations actually used. */
  evidenceConfidenceFloor: number | null;

  /** Human-readable reasons exact facts could not be established. */
  blockers: string[];

  /**
   * Intentionally false in V1. The Decision Tree Audit / later binding policy
   * owns whether a complete physical fact may auto-answer anything.
   */
  automaticBindingAuthorized: false;
};

function roundedPhysicalFeet(value: number): number {
  // Remove binary floating-point noise only. This is NOT whole-foot rounding
  // and not a pricing rule: 20.8 remains 20.8.
  return Math.round(value * 1000) / 1000;
}

/**
 * Convert confirmed Route Assist room-scan geometry into canonical Routing V2
 * SURFACE physical fact candidates without touching any decision tree.
 *
 * Strict completeness rules:
 * - the Route Assist route must be SURFACE, customer-confirmed and not already
 *   asking for contractor review;
 * - the scan evidence must validate against the same Route Assist graph;
 * - every route segment needs a CLEAR WORLD_GEOMETRY measured length;
 * - every interior transition needs a CLEAR WORLD_GEOMETRY physical-turn type;
 * - when plane IDs are available, they must agree with the claimed fitting
 *   topology (FLAT stays on the same plane; INSIDE/OUTSIDE changes planes).
 *
 * Provider confidence is carried, never thresholded here. Even COMPLETE output
 * has `automaticBindingAuthorized: false` until a separate policy explicitly
 * grants authority.
 */
export function projectRouteAssistSurfaceFactsV1(
  source: RouteAssistSurfaceFactSource,
  scanEvidence: RouteAssistScanEvidenceV1
): RoutingV2SurfacePhysicalFactProjectionV1 {
  const blockers: string[] = [];

  if (source.mode !== "SURFACE") blockers.push("Route Assist mode is not SURFACE");
  if (!source.customerConfirmedRoute) blockers.push("customer has not confirmed the route");
  if (source.needsContractorReview) blockers.push("Route Assist result requires contractor review");

  const alignedResult = alignRouteAssistScanEvidenceV1(source.points, source.segments, scanEvidence);
  if (!alignedResult.validation.valid) {
    blockers.push(...alignedResult.validation.problems.map((problem) => `scan evidence: ${problem}`));
  }
  const ordered = alignedResult.ordered;
  if (!ordered) {
    return {
      state: "INCOMPLETE",
      facts: null,
      orderedSegmentLengthsFt: null,
      evidenceConfidenceFloor: null,
      blockers,
      automaticBindingAuthorized: false,
    };
  }

  const usedConfidences: number[] = [];
  const orderedSegmentLengthsFt: number[] = [];

  for (const row of ordered.segments) {
    const observation = row.evidence?.measuredLengthFt;
    if (!isClearWorldGeometryObservation(observation)) {
      blockers.push(`segment ${row.segmentId} lacks a clear world-geometry length measurement`);
      continue;
    }
    if (!Number.isFinite(observation.value) || observation.value <= 0) {
      // Normally caught by the scan-evidence validator; retained here so this
      // projection stays safe if called with hand-constructed typed data.
      blockers.push(`segment ${row.segmentId} has an invalid measured length`);
      continue;
    }
    orderedSegmentLengthsFt.push(observation.value);
    usedConfidences.push(observation.confidence);
  }

  let insideCornerCount = 0;
  let outsideCornerCount = 0;
  let flatCornerCount = 0;

  for (let index = 0; index < ordered.transitions.length; index++) {
    const transition = ordered.transitions[index];
    const turn = transition.evidence?.physicalTurn;
    if (!isClearWorldGeometryObservation(turn)) {
      blockers.push(`transition ${transition.pointId} lacks a clear world-geometry physical-turn observation`);
      continue;
    }
    usedConfidences.push(turn.confidence);

    if (turn.value === "INSIDE") insideCornerCount += 1;
    else if (turn.value === "OUTSIDE") outsideCornerCount += 1;
    else if (turn.value === "FLAT") flatCornerCount += 1;

    // Plane identity is supporting evidence rather than a required signal: a
    // calibrated mesh may establish concavity/convexity without assigning
    // stable plane IDs. But when BOTH adjacent plane IDs are clear, they may
    // not contradict the claimed fitting.
    const incoming = ordered.segments[index]?.evidence?.surfacePlaneId;
    const outgoing = ordered.segments[index + 1]?.evidence?.surfacePlaneId;
    if (isClearWorldGeometryObservation(incoming) && isClearWorldGeometryObservation(outgoing)) {
      usedConfidences.push(incoming.confidence, outgoing.confidence);
      if (turn.value === "FLAT" && incoming.value !== outgoing.value) {
        blockers.push(
          `transition ${transition.pointId} claims FLAT but adjacent scan planes differ (${incoming.value} -> ${outgoing.value})`
        );
      }
      if ((turn.value === "INSIDE" || turn.value === "OUTSIDE") && incoming.value === outgoing.value) {
        blockers.push(
          `transition ${transition.pointId} claims ${turn.value} but adjacent scan planes are the same (${incoming.value})`
        );
      }
    }
  }

  if (blockers.length > 0 || orderedSegmentLengthsFt.length !== ordered.segments.length) {
    return {
      state: "INCOMPLETE",
      facts: null,
      orderedSegmentLengthsFt:
        orderedSegmentLengthsFt.length === ordered.segments.length ? orderedSegmentLengthsFt : null,
      evidenceConfidenceFloor: usedConfidences.length > 0 ? Math.min(...usedConfidences) : null,
      blockers,
      automaticBindingAuthorized: false,
    };
  }

  const surfaceRouteFt = roundedPhysicalFeet(
    orderedSegmentLengthsFt.reduce((sum, length) => sum + length, 0)
  );

  return {
    state: "COMPLETE",
    facts: {
      surfaceRouteFt,
      insideCornerCount,
      outsideCornerCount,
      flatCornerCount,
    },
    orderedSegmentLengthsFt,
    evidenceConfidenceFloor: usedConfidences.length > 0 ? Math.min(...usedConfidences) : null,
    blockers: [],
    automaticBindingAuthorized: false,
  };
}
