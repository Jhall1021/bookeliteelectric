/**
 * The one function that turns a customer's placed-and-tagged geometry into
 * a `RouteAssistResult` — or refuses, per §22, with a `RouteAssistIncomplete`
 * and no partial result. Everything it calls is pure (geometry.ts,
 * complexity.ts, uncertainty.ts); this file's only job is composing them in
 * the right order and refusing early when a required point is missing.
 *
 * `needsContractorReview` starts `true` on every fresh result, because
 * nothing is confirmed yet — see confirmation.ts, the only place that ever
 * lowers it.
 */

import {
  corners,
  obstacleBypasses,
  orderRoute,
  sameWallHeuristic,
  surfaceTransitions,
  totalEstimatedLengthFt,
  verticalWallSegments,
  wallTransitions,
} from "./geometry";
import { classifyConcealedComplexity, suggestedAccessOpeningRange } from "./complexity";
import { incompleteResult } from "./uncertainty";
import type { RouteAssistCaptureInput, RouteAssistOutcome, RouteAssistResult } from "./types";

export function buildRouteAssistResult(input: RouteAssistCaptureInput): RouteAssistOutcome {
  const source = input.points.find((p) => p.kind === "SOURCE");
  const destination = input.points.find((p) => p.kind === "DESTINATION");
  if (!source) return incompleteResult("SOURCE_NOT_CLEAR");
  if (!destination) return incompleteResult("DESTINATION_NOT_CLEAR");

  const route = orderRoute(input.points, input.segments);
  // A branch, a dead end, or a disconnected graph isn't "the" route to
  // guess at — refuse rather than pick a branch. See geometry.ts's
  // orderRoute for exactly what disqualifies a graph.
  if (!route) return incompleteResult("MULTIPLE_POSSIBLE_ROUTES");

  const cornerList = corners(route);
  const insideCornersCount = cornerList.filter((c) => c.direction === "INSIDE").length;
  const outsideCornersCount = cornerList.filter((c) => c.direction === "OUTSIDE").length;
  const transitions = surfaceTransitions(route);
  const wallTransitionsCount = wallTransitions(route);
  const { doorways, windows } = obstacleBypasses(route);
  const verticalTransitionsCount = verticalWallSegments(route);
  const estimatedTotalRouteLengthFt = totalEstimatedLengthFt(route);
  const sameWall =
    input.mode === "CONCEALED" ? sameWallHeuristic(route, wallTransitionsCount, transitions, cornerList) : null;

  let concealedRouteComplexity: RouteAssistResult["concealedRouteComplexity"] = null;
  let accessRange: { min: number; max: number } | null = null;
  if (input.mode === "CONCEALED") {
    concealedRouteComplexity = classifyConcealedComplexity({
      mode: input.mode,
      insideCorners: insideCornersCount,
      outsideCorners: outsideCornersCount,
      wallTransitions: wallTransitionsCount,
      wallToCeiling: transitions.wallToCeiling,
      wallToFloor: transitions.wallToFloor,
      doorwayBypasses: doorways,
      windowBypasses: windows,
      sameWall,
    });
    if (input.drywallAccessAllowed === true) {
      accessRange = suggestedAccessOpeningRange(concealedRouteComplexity);
    }
  }

  return {
    mode: input.mode,
    destinationType: input.destinationType,
    points: input.points,
    segments: input.segments,
    customerConfirmedRoute: false,
    estimatedTotalRouteLengthFt,
    sameWall,
    wallTransitionsCount,
    insideCornersCount,
    outsideCornersCount,
    doorwayBypassesCount: doorways,
    windowBypassesCount: windows,
    verticalTransitionsCount,
    wallToCeilingTransitionsCount: transitions.wallToCeiling,
    wallToFloorTransitionsCount: transitions.wallToFloor,
    // Reserved for Phase 2 (assisted geometry) — see types.ts. Phase 1 has
    // no signal distinct from a tagged doorway/window bypass or a corner,
    // and reporting a nonzero count without one would be a guess.
    visibleObstacleDetoursCount: 0,
    concealedRouteComplexity,
    suggestedAccessOpeningsMin: accessRange?.min ?? null,
    suggestedAccessOpeningsMax: accessRange?.max ?? null,
    needsContractorReview: true,
    captureArtifacts: input.captureArtifacts,
    customerNotes: input.customerNotes ?? null,
    drywallAccessAllowed: input.drywallAccessAllowed,
  };
}
