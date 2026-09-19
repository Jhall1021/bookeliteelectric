import type { SourcedLaborScopeFact } from "./validateLaborScopeFacts";

export type AccessibleRouteAssistPathEvidenceV1 = {
  kind: "ACCESSIBLE_PATH";
  spaceType: "ATTIC" | "UNFINISHED_BASEMENT" | "CRAWLSPACE" | "OTHER_ACCESSIBLE";
  customerConfirmedPath: boolean;
  needsContractorReview: boolean;
  segments: Array<{
    id: string;
    measuredLengthFeet: number;
    observationBasis: "WORLD_GEOMETRY";
    confidence: number;
  }>;
};

export type AccessibleRouteAssistPathProjection =
  | {
      kind: "READY";
      accessibleRouteFeet: SourcedLaborScopeFact & { value: number; source: "ROUTE_ASSIST_ACCESSIBLE_PATH_CONFIRMED" };
      evidenceConfidenceFloor: number;
    }
  | { kind: "INCOMPLETE"; blockers: string[] };

/**
 * Stable labor-side handoff for the independently evolving Route Assist flow.
 * It accepts only an explicitly observed accessible path—never an ordinary
 * room scan's endpoint distance or an estimated total.
 */
export function projectAccessibleRouteAssistPathFact(
  evidence: AccessibleRouteAssistPathEvidenceV1,
): AccessibleRouteAssistPathProjection {
  const blockers: string[] = [];
  if (evidence.kind !== "ACCESSIBLE_PATH") blockers.push("evidence is not an explicit accessible-path capture");
  if (!evidence.customerConfirmedPath) blockers.push("customer has not confirmed the captured path");
  if (evidence.needsContractorReview) blockers.push("capture still requires contractor review");
  if (evidence.segments.length === 0) blockers.push("accessible path has no measured segments");

  const ids = new Set<string>();
  let total = 0;
  let confidenceFloor = 1;
  for (const segment of evidence.segments) {
    if (!segment.id.trim()) blockers.push("accessible path contains a segment without an id");
    else if (ids.has(segment.id)) blockers.push(`duplicate accessible-path segment id: ${segment.id}`);
    ids.add(segment.id);
    if (segment.observationBasis !== "WORLD_GEOMETRY") blockers.push(`segment ${segment.id || "(unknown)"} is not world-geometry measured`);
    if (!Number.isFinite(segment.measuredLengthFeet) || segment.measuredLengthFeet <= 0) blockers.push(`segment ${segment.id || "(unknown)"} has invalid measured length`);
    else total += segment.measuredLengthFeet;
    if (!Number.isFinite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1) blockers.push(`segment ${segment.id || "(unknown)"} has invalid confidence`);
    else confidenceFloor = Math.min(confidenceFloor, segment.confidence);
  }

  if (blockers.length > 0) return { kind: "INCOMPLETE", blockers };
  return {
    kind: "READY",
    accessibleRouteFeet: {
      value: Math.round(total * 1000) / 1000,
      source: "ROUTE_ASSIST_ACCESSIBLE_PATH_CONFIRMED",
    },
    evidenceConfidenceFloor: confidenceFloor,
  };
}
