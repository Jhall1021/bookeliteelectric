import {
  ROUTE_ASSIST_DESTINATION_TYPES,
  ROUTE_ASSIST_MODES,
  ROUTE_COMPLEXITIES,
  ROUTE_OBSTACLES,
  ROUTE_PHYSICAL_TURNS,
  ROUTE_POINT_KINDS,
  ROUTE_SURFACES,
} from "./taxonomy";
import type { RouteAssistResult } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inList = (value: unknown, list: readonly string[]): value is string =>
  typeof value === "string" && list.includes(value);

const finiteNonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const nonnegativeInteger = (value: unknown): value is number =>
  finiteNonnegative(value) && Number.isSafeInteger(value);

const nullable = <T>(value: unknown, check: (candidate: unknown) => candidate is T): value is T | null =>
  value === null || check(value);

const optionalNullable = <T>(value: unknown, check: (candidate: unknown) => candidate is T): boolean =>
  value === undefined || value === null || check(value);

function validPoint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (!finiteNonnegative(value.x) || value.x > 1) return false;
  if (!finiteNonnegative(value.y) || value.y > 1) return false;
  if (typeof value.imageId !== "string") return false;
  if (!inList(value.kind, ROUTE_POINT_KINDS)) return false;
  if (!optionalNullable(value.surface, (v): v is string => inList(v, ROUTE_SURFACES))) return false;
  if (!optionalNullable(value.obstacle, (v): v is string => inList(v, ROUTE_OBSTACLES))) return false;
  if (!optionalNullable(value.physicalTurn, (v): v is string => inList(v, ROUTE_PHYSICAL_TURNS))) return false;
  return true;
}

function validSegment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.fromPointId !== "string" || value.fromPointId.length === 0) return false;
  if (typeof value.toPointId !== "string" || value.toPointId.length === 0) return false;
  if (!optionalNullable(value.surface, (v): v is string => inList(v, ROUTE_SURFACES))) return false;
  if (!optionalNullable(value.estimatedLengthFt, finiteNonnegative)) return false;
  if (!(value.transitionAtEnd === undefined || value.transitionAtEnd === null || typeof value.transitionAtEnd === "boolean")) return false;
  return true;
}

/**
 * Runtime boundary for persisted Route Assist completion.
 *
 * TypeScript only protects trusted callers at compile time; the PATCH endpoint
 * accepts JSON from a browser and therefore has to validate the shape before a
 * result is allowed to win the task's first-completion race. This deliberately
 * validates OBSERVABLE facts only. It does not diagnose, price, choose a route,
 * or reinterpret any value.
 */
export function isRouteAssistResultPayload(value: unknown): value is RouteAssistResult {
  if (!isRecord(value)) return false;
  if (!inList(value.mode, ROUTE_ASSIST_MODES)) return false;
  if (!inList(value.destinationType, ROUTE_ASSIST_DESTINATION_TYPES)) return false;

  if (!Array.isArray(value.points) || !value.points.every(validPoint)) return false;
  if (!Array.isArray(value.segments) || !value.segments.every(validSegment)) return false;

  // A COMPLETED task is a route the customer actually confirmed. Adjusted and
  // retake states never call task completion; accepting one here would let an
  // unconfirmed payload lock out the later legitimate completion.
  if (value.customerConfirmedRoute !== true) return false;

  if (!nullable(value.estimatedTotalRouteLengthFt, finiteNonnegative)) return false;
  if (!(value.sameWall === null || typeof value.sameWall === "boolean")) return false;

  for (const key of [
    "wallTransitionsCount",
    "insideCornersCount",
    "outsideCornersCount",
    "doorwayBypassesCount",
    "windowBypassesCount",
    "verticalTransitionsCount",
    "wallToCeilingTransitionsCount",
    "wallToFloorTransitionsCount",
    "visibleObstacleDetoursCount",
  ] as const) {
    if (!nonnegativeInteger(value[key])) return false;
  }

  if (!nullable(value.concealedRouteComplexity, (v): v is string => inList(v, ROUTE_COMPLEXITIES))) return false;
  if (!nullable(value.suggestedAccessOpeningsMin, nonnegativeInteger)) return false;
  if (!nullable(value.suggestedAccessOpeningsMax, nonnegativeInteger)) return false;
  if ((value.suggestedAccessOpeningsMin === null) !== (value.suggestedAccessOpeningsMax === null)) return false;
  if (value.suggestedAccessOpeningsMin !== null && value.suggestedAccessOpeningsMax !== null) {
    if (value.mode !== "CONCEALED") return false;
    if (value.suggestedAccessOpeningsMin > value.suggestedAccessOpeningsMax) return false;
  }

  if (typeof value.needsContractorReview !== "boolean") return false;

  if (!isRecord(value.captureArtifacts)) return false;
  if (!Array.isArray(value.captureArtifacts.imageIds) ||
      !value.captureArtifacts.imageIds.every((v) => typeof v === "string")) return false;
  if (!Array.isArray(value.captureArtifacts.overlayImageIds) ||
      !value.captureArtifacts.overlayImageIds.every((v) => typeof v === "string")) return false;

  if (!(value.customerNotes === null || typeof value.customerNotes === "string")) return false;
  if (!(value.drywallAccessAllowed === null || typeof value.drywallAccessAllowed === "boolean")) return false;
  if (value.mode !== "CONCEALED" && value.drywallAccessAllowed !== null) return false;

  // Physical-turn evidence is meaningful only for a surface waypoint.
  for (const point of value.points) {
    if (point.physicalTurn == null) continue;
    if (value.mode !== "SURFACE" || point.kind !== "WAYPOINT") return false;
  }

  return true;
}
