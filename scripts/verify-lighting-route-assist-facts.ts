import { strict as assert } from "node:assert";
import { projectLightingCablePathFromRouteAssist } from "../lib/electrical/lightingRouteAssistFacts";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";
import type { RouteAssistResult } from "../lib/visual-assist/route-assist/types";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const points: RouteAssistResult["points"] = [
  { id: "source", x: 0, y: 0, imageId: "image", kind: "SOURCE" },
  { id: "turn", x: 0.5, y: 0, imageId: "image", kind: "WAYPOINT" },
  { id: "destination", x: 1, y: 0, imageId: "image", kind: "DESTINATION" },
];
const segments: RouteAssistResult["segments"] = [
  { id: "a", fromPointId: "source", toPointId: "turn", surface: "WALL" },
  { id: "b", fromPointId: "turn", toPointId: "destination", surface: "CEILING" },
];
const evidence: RouteAssistScanEvidenceV1 = {
  version: 1, sourcePointId: "source", destinationPointId: "destination",
  segments: [
    { segmentId: "a", measuredLengthFt: { value: 6, confidence: 0.95, visibility: "CLEAR", basis: "WORLD_GEOMETRY" } },
    { segmentId: "b", measuredLengthFt: { value: 18.25, confidence: 0.92, visibility: "CLEAR", basis: "WORLD_GEOMETRY" } },
  ],
  transitions: [{ pointId: "turn" }],
};
const base = { mode: "CONCEALED" as const, customerConfirmedRoute: true, needsContractorReview: false, points, segments };

const ready = projectLightingCablePathFromRouteAssist(base, evidence);
ok(ready.kind === "READY" && ready.installedCablePathFeet === 24.25, "confirmed world geometry establishes the exact planned cable path");
ok(ready.kind === "READY" && !("perpendicularCeilingFeet" in ready), "projection does not invent joist-relative distance from a ceiling segment");

const unconfirmed = projectLightingCablePathFromRouteAssist({ ...base, customerConfirmedRoute: false }, evidence);
ok(unconfirmed.kind === "INCOMPLETE" && unconfirmed.blockers.some((item) => item.includes("not confirmed")), "unconfirmed route cannot become a lighting fact");
const review = projectLightingCablePathFromRouteAssist({ ...base, needsContractorReview: true }, evidence);
ok(review.kind === "INCOMPLETE" && review.blockers.some((item) => item.includes("requires contractor review")), "review-marked route cannot become a lighting fact");
const surface = projectLightingCablePathFromRouteAssist({ ...base, mode: "SURFACE" }, evidence);
ok(surface.kind === "INCOMPLETE" && surface.blockers.some((item) => item.includes("not CONCEALED")), "surface route cannot be reused as concealed cable geometry");

const partialEvidence: RouteAssistScanEvidenceV1 = {
  ...evidence,
  segments: [
    evidence.segments[0],
    { segmentId: "b", measuredLengthFt: { value: 18.25, confidence: 0.92, visibility: "PARTIAL", basis: "WORLD_GEOMETRY" } },
  ],
};
const partial = projectLightingCablePathFromRouteAssist(base, partialEvidence);
ok(partial.kind === "INCOMPLETE" && partial.blockers.some((item) => item.includes("segment b")), "partially visible geometry fails closed");

console.log(`\nLIGHTING ROUTE ASSIST FACTS — ${checks}/${checks} checks passed`);
