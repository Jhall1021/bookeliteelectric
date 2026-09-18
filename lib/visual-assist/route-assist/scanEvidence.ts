import type { ObservationVisibility } from "../observation";
import { orderRoute } from "./geometry";
import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";

/**
 * Route Assist room-scan evidence contract.
 *
 * A calibrated room scan can report physical evidence. This contract stops
 * BEFORE decision-tree binding, MaterialTakeoff or pricing. Provider
 * confidence is carried as evidence and is never authority here.
 */
export type RouteScanEvidenceBasis =
  | "WORLD_GEOMETRY"
  | "VISIBLE_SCENE";

export type RouteSegmentOrientation = "HORIZONTAL" | "VERTICAL" | "OTHER";

/** Visible explanation for a detour. Evidence only; never a cost adder. */
export type RouteScanObstacleContext =
  | "DOORWAY"
  | "WINDOW"
  | "LARGE_OPENING"
  | "FIXED_OBSTRUCTION";

export type RouteScanObservation<T> = {
  value: T | null;
  confidence: number;
  visibility: ObservationVisibility;
  basis: RouteScanEvidenceBasis;
};

type KnownRouteSurface = Exclude<RouteSurface, "UNKNOWN">;

export type RouteScanSegmentEvidenceV1 = {
  segmentId: string;
  measuredLengthFt?: RouteScanObservation<number> | null;
  surface?: RouteScanObservation<KnownRouteSurface> | null;
  /** Opaque scan-local plane id: same plane vs different plane, not a trade taxonomy. */
  surfacePlaneId?: RouteScanObservation<string> | null;
  orientation?: RouteScanObservation<RouteSegmentOrientation> | null;
};

export type RouteScanTransitionEvidenceV1 = {
  pointId: string;
  /** Physical fitting identity; WORLD_GEOMETRY only. */
  physicalTurn?: RouteScanObservation<RoutePhysicalTurn> | null;
  /** Visible obstacle context, independent of the turn itself. */
  obstacleContext?: RouteScanObservation<RouteScanObstacleContext> | null;
};

/** Evidence references the existing Route Assist graph by ID. */
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
  segments: Array<{ segmentId: string; evidence: RouteScanSegmentEvidenceV1 | null }>;
  transitions: Array<{ pointId: string; evidence: RouteScanTransitionEvidenceV1 | null }>;
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
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value);
}

/** Validate coherence/provenance without granting authority to bind anything. */
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

/** Align evidence to SOURCE -> DESTINATION order without mutating route facts. */
export function alignRouteAssistScanEvidenceV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  evidence: RouteAssistScanEvidenceV1
): { ordered: OrderedRouteScanEvidenceV1 | null; validation: RouteScanEvidenceValidation } {
  const validation = validateRouteAssistScanEvidenceV1(points, segments, evidence);
  if (!validation.valid) return { ordered: null, validation };

  const route = orderRoute(points, segments);
  if (!route) {
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

/** Necessary, but not sufficient, condition for later canonical binding. */
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
