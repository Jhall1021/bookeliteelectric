import type { ObservationVisibility } from "../observation";
import { orderRoute } from "./geometry";
import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";

/**
 * Route Assist room-scan evidence contract.
 *
 * This file deliberately stops BEFORE canonical Routing V2 binding. A room
 * scan can report physical evidence; a separate, reviewed policy decides
 * whether any observation is strong enough to become a canonical fact.
 * Provider confidence is carried as evidence and is never authority here.
 */

export type RouteScanEvidenceBasis =
  /** Metric/plane geometry produced by calibrated world tracking / room scan. */
  | "WORLD_GEOMETRY"
  /** Visible semantic recognition from the scene/mesh/photo. Not metric authority. */
  | "VISIBLE_SCENE";

export type RouteSegmentOrientation = "HORIZONTAL" | "VERTICAL" | "OTHER";

/**
 * Context for why an observed route detours. This is evidence only — never a
 * cost adder and never a material component by itself.
 */
export type RouteScanObstacleContext =
  | "DOORWAY"
  | "WINDOW"
  | "LARGE_OPENING"
  | "FIXED_OBSTRUCTION";

export type RouteScanObservation<T> = {
  value: T | null;
  /** Provider/runtime confidence. Advisory only. */
  confidence: number;
  visibility: ObservationVisibility;
  basis: RouteScanEvidenceBasis;
};

type KnownRouteSurface = Exclude<RouteSurface, "UNKNOWN">;

export type RouteScanSegmentEvidenceV1 = {
  segmentId: string;

  /**
   * Real-world route length for this exact existing segment. A non-null value
   * is valid only when backed by WORLD_GEOMETRY. A pixel-length estimate is
   * never accepted as metric evidence.
   */
  measuredLengthFt?: RouteScanObservation<number> | null;

  /** Which physical surface the leg occupies. */
  surface?: RouteScanObservation<KnownRouteSurface> | null;

  /**
   * Opaque scan-local plane identity (for example wall-1 vs wall-2). It is not
   * a Routing V2 taxonomy. Its job is simply to preserve "same physical plane"
   * versus "different physical plane" without guessing from image direction.
   */
  surfacePlaneId?: RouteScanObservation<string> | null;

  /** Gravity/world-frame orientation when the scan actually establishes it. */
  orientation?: RouteScanObservation<RouteSegmentOrientation> | null;
};

export type RouteScanTransitionEvidenceV1 = {
  pointId: string;

  /**
   * Physical raceway turn identity. Must come from world/plane geometry, never
   * from the legacy 2-D cross-product direction.
   */
  physicalTurn?: RouteScanObservation<RoutePhysicalTurn> | null;

  /** Visible explanation for a detour. Independent of the physical turn. */
  obstacleContext?: RouteScanObservation<RouteScanObstacleContext> | null;
};

/**
 * Evidence references the existing Route Assist graph by ID rather than
 * creating a second route graph or taxonomy.
 */
export type RouteAssistScanEvidenceV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  segments: RouteScanSegmentEvidenceV1[];
  transitions: RouteScanTransitionEvidenceV1[];
};

export type RouteScanEvidenceValidation = {
  valid: boolean;
  problems: string[];
};

export type OrderedRouteScanEvidenceV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  /** One entry per route segment, in SOURCE -> DESTINATION order. */
  segments: Array<{
    segmentId: string;
    evidence: RouteScanSegmentEvidenceV1 | null;
  }>;
  /** One entry per interior route point, in SOURCE -> DESTINATION order. */
  transitions: Array<{
    pointId: string;
    evidence: RouteScanTransitionEvidenceV1 | null;
  }>;
};

function observationProblems<T>(
  observation: RouteScanObservation<T> | null | undefined,
  label: string
): string[] {
  if (!observation) return [];
  const problems: string[] = [];
  if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) {
    problems.push(`${label}: confidence must be a finite number in 0..1`);
  }
  if (observation.value !== null && observation.visibility === "NOT_VISIBLE") {
    problems.push(`${label}: value cannot be present when visibility is NOT_VISIBLE`);
  }
  return problems;
}

function worldGeometryValueProblems<T>(
  observation: RouteScanObservation<T> | null | undefined,
  label: string
): string[] {
  const problems = observationProblems(observation, label);
  if (observation?.value !== null && observation?.value !== undefined && observation.basis !== "WORLD_GEOMETRY") {
    problems.push(`${label}: non-null value requires WORLD_GEOMETRY basis`);
  }
  return problems;
}

function validPlaneId(value: string): boolean {
  // Opaque local identifier, not free text and never a prompt/query surface.
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value);
}

/**
 * Validate scan evidence against the already-existing Route Assist graph.
 *
 * This validates coherence and provenance only. It does NOT say an observation
 * may bind into Routing V2, does not apply confidence thresholds, and does not
 * mutate route points/segments.
 */
export function validateRouteAssistScanEvidenceV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  evidence: RouteAssistScanEvidenceV1
): RouteScanEvidenceValidation {
  const problems: string[] = [];
  const ordered = orderRoute(points, segments);
  if (!ordered) {
    return { valid: false, problems: ["base route is not a single SOURCE-to-DESTINATION path"] };
  }

  const sourceId = ordered.points[0].id;
  const destinationId = ordered.points[ordered.points.length - 1].id;
  if (evidence.version !== 1) problems.push(`unsupported evidence version ${String(evidence.version)}`);
  if (evidence.sourcePointId !== sourceId) problems.push("evidence sourcePointId does not match the base route source");
  if (evidence.destinationPointId !== destinationId) problems.push("evidence destinationPointId does not match the base route destination");

  const segmentIds = new Set(ordered.segments.map((segment) => segment.id));
  const seenSegmentIds = new Set<string>();
  for (const segmentEvidence of evidence.segments) {
    const prefix = `segment ${segmentEvidence.segmentId}`;
    if (!segmentIds.has(segmentEvidence.segmentId)) problems.push(`${prefix}: not present in the base route`);
    if (seenSegmentIds.has(segmentEvidence.segmentId)) problems.push(`${prefix}: duplicate evidence row`);
    seenSegmentIds.add(segmentEvidence.segmentId);

    problems.push(...worldGeometryValueProblems(segmentEvidence.measuredLengthFt, `${prefix} measuredLengthFt`));
    const length = segmentEvidence.measuredLengthFt?.value;
    if (length !== null && length !== undefined && (!Number.isFinite(length) || length <= 0)) {
      problems.push(`${prefix} measuredLengthFt: value must be a finite number greater than zero`);
    }

    problems.push(...observationProblems(segmentEvidence.surface, `${prefix} surface`));
    const surface = segmentEvidence.surface?.value;
    if (surface !== null && surface !== undefined && !(["WALL", "CEILING", "FLOOR"] as const).includes(surface)) {
      problems.push(`${prefix} surface: value is outside the Route Assist surface taxonomy`);
    }

    problems.push(...worldGeometryValueProblems(segmentEvidence.surfacePlaneId, `${prefix} surfacePlaneId`));
    const planeId = segmentEvidence.surfacePlaneId?.value;
    if (planeId !== null && planeId !== undefined && !validPlaneId(planeId)) {
      problems.push(`${prefix} surfacePlaneId: invalid opaque plane identifier`);
    }

    problems.push(...worldGeometryValueProblems(segmentEvidence.orientation, `${prefix} orientation`));
    const orientation = segmentEvidence.orientation?.value;
    if (
      orientation !== null &&
      orientation !== undefined &&
      !(["HORIZONTAL", "VERTICAL", "OTHER"] as const).includes(orientation)
    ) {
      problems.push(`${prefix} orientation: value is outside the orientation taxonomy`);
    }
  }

  const interiorPointIds = new Set(ordered.points.slice(1, -1).map((point) => point.id));
  const seenTransitionPointIds = new Set<string>();
  for (const transitionEvidence of evidence.transitions) {
    const prefix = `transition ${transitionEvidence.pointId}`;
    if (!interiorPointIds.has(transitionEvidence.pointId)) {
      problems.push(`${prefix}: must reference an interior waypoint on the base route`);
    }
    if (seenTransitionPointIds.has(transitionEvidence.pointId)) problems.push(`${prefix}: duplicate evidence row`);
    seenTransitionPointIds.add(transitionEvidence.pointId);

    problems.push(...worldGeometryValueProblems(transitionEvidence.physicalTurn, `${prefix} physicalTurn`));
    const physicalTurn = transitionEvidence.physicalTurn?.value;
    if (
      physicalTurn !== null &&
      physicalTurn !== undefined &&
      !(["FLAT", "INSIDE", "OUTSIDE"] as const).includes(physicalTurn)
    ) {
      problems.push(`${prefix} physicalTurn: value is outside the physical-turn taxonomy`);
    }

    problems.push(...observationProblems(transitionEvidence.obstacleContext, `${prefix} obstacleContext`));
    const obstacle = transitionEvidence.obstacleContext?.value;
    if (
      obstacle !== null &&
      obstacle !== undefined &&
      !(["DOORWAY", "WINDOW", "LARGE_OPENING", "FIXED_OBSTRUCTION"] as const).includes(obstacle)
    ) {
      problems.push(`${prefix} obstacleContext: value is outside the scan-obstacle taxonomy`);
    }
  }

  return { valid: problems.length === 0, problems };
}

/**
 * Align validated evidence to the canonical SOURCE -> DESTINATION walk.
 *
 * Missing evidence stays null. This is intentionally a view: it does not copy
 * scan values into `RouteSegment.estimatedLengthFt`, `RoutePoint.physicalTurn`,
 * Routing V2 quantities, MaterialTakeoff, or pricing.
 */
export function alignRouteAssistScanEvidenceV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  evidence: RouteAssistScanEvidenceV1
): { ordered: OrderedRouteScanEvidenceV1 | null; validation: RouteScanEvidenceValidation } {
  const validation = validateRouteAssistScanEvidenceV1(points, segments, evidence);
  if (!validation.valid) return { ordered: null, validation };

  const route = orderRoute(points, segments);
  if (!route) {
    // Defensive repeat. Validation already proves this path exists.
    return { ordered: null, validation: { valid: false, problems: ["base route became unorderable"] } };
  }

  const segmentEvidenceById = new Map(evidence.segments.map((row) => [row.segmentId, row]));
  const transitionEvidenceByPointId = new Map(evidence.transitions.map((row) => [row.pointId, row]));

  return {
    validation,
    ordered: {
      version: 1,
      sourcePointId: route.points[0].id,
      destinationPointId: route.points[route.points.length - 1].id,
      segments: route.segments.map((segment) => ({
        segmentId: segment.id,
        evidence: segmentEvidenceById.get(segment.id) ?? null,
      })),
      transitions: route.points.slice(1, -1).map((point) => ({
        pointId: point.id,
        evidence: transitionEvidenceByPointId.get(point.id) ?? null,
      })),
    },
  };
}

/**
 * Necessary (but deliberately not sufficient) condition for a metric/plane
 * observation to be considered by a later canonical-binding policy.
 *
 * Confidence is NOT checked here on purpose. A separate policy must decide how
 * confidence, customer confirmation and task-specific evidence interact. This
 * helper only says the observation is clear and comes from world geometry.
 */
export function isClearWorldGeometryObservation<T>(
  observation: RouteScanObservation<T> | null | undefined
): observation is RouteScanObservation<T> & { value: T; visibility: "CLEAR"; basis: "WORLD_GEOMETRY" } {
  return Boolean(
    observation &&
      observation.value !== null &&
      observation.visibility === "CLEAR" &&
      observation.basis === "WORLD_GEOMETRY"
  );
}
