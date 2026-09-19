import {
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
  type RouteAssistScanEvidenceV1,
} from "../visual-assist/route-assist/scanEvidence";
import type { RouteAssistResult } from "../visual-assist/route-assist/types";

export type LightingRouteAssistProjection =
  | { kind: "READY"; installedCablePathFeet: number; source: "ROUTE_ASSIST_CONFIRMED" }
  | { kind: "INCOMPLETE"; blockers: string[] };

/**
 * Project only the planned path length that confirmed world geometry proves.
 *
 * This intentionally does NOT emit perpendicular-to-joist footage. Route
 * Assist V1 knows segment surfaces and gravity orientation, but it does not
 * observe the hidden joist direction. Treating a horizontal ceiling segment
 * as perpendicular would recreate the exact estimating guess this work is
 * removing.
 */
export function projectLightingCablePathFromRouteAssist(
  result: Pick<RouteAssistResult, "mode" | "customerConfirmedRoute" | "needsContractorReview" | "points" | "segments">,
  evidence: RouteAssistScanEvidenceV1
): LightingRouteAssistProjection {
  const blockers: string[] = [];
  if (result.mode !== "CONCEALED") blockers.push("Route Assist mode is not CONCEALED");
  if (!result.customerConfirmedRoute) blockers.push("customer has not confirmed the route");
  if (result.needsContractorReview) blockers.push("Route Assist result requires contractor review");

  const aligned = alignRouteAssistScanEvidenceV1(result.points, result.segments, evidence);
  if (!aligned.validation.valid) blockers.push(...aligned.validation.problems.map((problem) => `scan evidence: ${problem}`));
  if (!aligned.ordered) return { kind: "INCOMPLETE", blockers };

  let installedCablePathFeet = 0;
  for (const row of aligned.ordered.segments) {
    const length = row.evidence?.measuredLengthFt;
    if (!isClearWorldGeometryObservation(length) || !Number.isFinite(length.value) || length.value <= 0) {
      blockers.push(`segment ${row.segmentId} lacks a clear positive world-geometry length`);
      continue;
    }
    installedCablePathFeet += length.value;
  }

  if (blockers.length > 0) return { kind: "INCOMPLETE", blockers };
  return {
    kind: "READY",
    installedCablePathFeet: Math.round(installedCablePathFeet * 1000) / 1000,
    source: "ROUTE_ASSIST_CONFIRMED",
  };
}
