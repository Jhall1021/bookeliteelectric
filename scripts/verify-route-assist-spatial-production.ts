import {
  getRouteAssistInvocation,
  getRouteAssistInvocationByTaskKey,
} from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { summarizeConcealedAccessEvidenceV1 } from "../lib/visual-assist/route-assist/concealedAccess";
import { buildOrderedRouteGeometryV1 } from "../lib/visual-assist/route-assist/orderedGeometry";
import type { RouteAssistResult, RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function placementResult(count: number): RouteAssistResult {
  return {
    mode: "CONCEALED",
    destinationType: "RECESSED_LIGHT",
    captureKind: "PLACEMENT_LAYOUT",
    placements: Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      x: 0.2 + index * 0.05,
      y: 0.3,
      imageId: "img",
      destinationType: "RECESSED_LIGHT",
      surface: "CEILING",
    })),
    points: [
      { id: "s", x: 0.1, y: 0.8, imageId: "img", kind: "SOURCE", surface: "WALL" },
      { id: "d", x: 0.5, y: 0.2, imageId: "img", kind: "DESTINATION", surface: "CEILING" },
    ],
    segments: [{ id: "seg", fromPointId: "s", toPointId: "d", surface: "UNKNOWN" }],
    concealedAccessEvidence: null,
    customerConfirmedRoute: true,
    estimatedTotalRouteLengthFt: null,
    sameWall: null,
    wallTransitionsCount: 0,
    insideCornersCount: 0,
    outsideCornersCount: 0,
    doorwayBypassesCount: 0,
    windowBypassesCount: 0,
    verticalTransitionsCount: 0,
    wallToCeilingTransitionsCount: 0,
    wallToFloorTransitionsCount: 0,
    visibleObstacleDetoursCount: 0,
    concealedRouteComplexity: "UNCERTAIN",
    suggestedAccessOpeningsMin: null,
    suggestedAccessOpeningsMax: null,
    needsContractorReview: false,
    captureArtifacts: { imageIds: ["img"], overlayImageIds: [] },
    customerNotes: null,
    drywallAccessAllowed: null,
  };
}

console.log("\nROUTE ASSIST SPATIAL PRODUCTION\n");

const outletAccessible = getRouteAssistInvocation("new-120v-outlet", "outlet_run_distance", {
  below_above_access: "has_access",
});
check("full outlet Route Assist is hidden when an accessible route exists", outletAccessible === null);

const outletNoAccess = getRouteAssistInvocation("new-120v-outlet", "outlet_run_distance", {
  below_above_access: "no_access",
});
check("full outlet Route Assist is available only on no-access route", outletNoAccess?.captureKind === "ROUTE");

const recessedAccessible = getRouteAssistInvocation("recessed-lighting", "recessed_light_count", {
  ceiling_access: "accessible",
});
check("recessed placement capture is hidden with accessible attic", recessedAccessible === null);

const recessedFinished = getRouteAssistInvocation("recessed-lighting", "recessed_light_count", {
  ceiling_access: "finished",
});
check("recessed placement capture is available with finished space above", recessedFinished?.captureKind === "PLACEMENT_LAYOUT");
check("recessed layout supports 1 through 8 placements", recessedFinished?.minPlacements === 1 && recessedFinished?.maxPlacements === 8);
check("four placement dots resolve only the existing count value", recessedFinished?.resolveAnswerValue(placementResult(4)) === "4");
check("zero placements cannot invent a recessed count", recessedFinished?.resolveAnswerValue(placementResult(0)) === null);

const lightFinished = getRouteAssistInvocation("new-ceiling-light", "lighting_control", { ceiling_access: "finished" });
const lightAccessible = getRouteAssistInvocation("new-ceiling-light", "lighting_control", { ceiling_access: "accessible" });
check("new ceiling light layout is evidence-only", lightFinished?.completionMode === "CAPTURE_ONLY");
check("new ceiling light layout is skipped with accessible attic", lightAccessible === null);

const fanFinished = getRouteAssistInvocation("new-ceiling-fan", "lighting_control", { ceiling_access: "finished" });
check("new fan layout is one placement and evidence-only", fanFinished?.maxPlacements === 1 && fanFinished?.completionMode === "CAPTURE_ONLY");

check(
  "phone handoff can recover recessed layout config by task key",
  getRouteAssistInvocationByTaskKey("recessed-lighting", "recessed_light_layout")?.destinationType === "RECESSED_LIGHT"
);

const shortRun = summarizeConcealedAccessEvidenceV1({
  discreteOpenings: { min: 1, max: 3 },
  baseboardRuns: [{ lengthFt: 5, confirmedRemovable: true }],
});
check("short run can preserve both openings and baseboard as candidates", shortRun.candidateMethods.includes("DISCRETE_OPENINGS") && shortRun.candidateMethods.includes("BASEBOARD_ACCESS"));
check("Route Assist never selects the concealed access method", shortRun.methodSelectionAuthorized === false && shortRun.evidence?.methodSelectionAuthorized === false);

const doorway = summarizeConcealedAccessEvidenceV1({
  baseboardRuns: [
    { lengthFt: 4.8, confirmedRemovable: true },
    { lengthFt: 5.2, confirmedRemovable: true },
  ],
  trimBypasses: [{ obstacle: "DOORWAY", accessLengthFt: 7, confirmedRemovable: true }],
});
check("doorway can preserve baseboard plus trim-assisted bypass opportunity", doorway.candidateMethods.includes("BASEBOARD_ACCESS") && doorway.candidateMethods.includes("TRIM_ASSISTED_BYPASS"));
check("doorway evidence preserves total baseboard length", doorway.evidence?.baseboardAccessLengthFt === 10);

const invalidRange = summarizeConcealedAccessEvidenceV1({ discreteOpenings: { min: 3, max: 1 } });
check("descending opening ranges are refused", invalidRange.valid === false && invalidRange.evidence === null);

const points: RoutePoint[] = [
  { id: "s", x: 0.1, y: 0.8, imageId: "img", kind: "SOURCE" },
  { id: "w", x: 0.4, y: 0.4, imageId: "img", kind: "WAYPOINT", obstacle: "DOORWAY", physicalTurn: "FLAT" },
  { id: "d", x: 0.8, y: 0.3, imageId: "img", kind: "DESTINATION" },
];
const segments: RouteSegment[] = [
  { id: "a", fromPointId: "s", toPointId: "w", estimatedLengthFt: 4.2, surface: "WALL" },
  { id: "b", fromPointId: "w", toPointId: "d", estimatedLengthFt: 7.8, surface: "WALL" },
];
const ordered = buildOrderedRouteGeometryV1(points, segments);
check("ordered geometry preserves per-segment lengths", ordered?.segments.map((row) => row.estimatedLengthFt).join(",") === "4.2,7.8");
check("obstacle context and physical turn coexist", ordered?.transitions[0]?.obstacleContext === "DOORWAY" && ordered?.transitions[0]?.physicalTurn === "FLAT");

console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
