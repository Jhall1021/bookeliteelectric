import { buildFixtureVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/fixtureVisibleSceneProvider";
import { validateRouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import { proposeVisibleTrimHuggingRouteV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";
import { buildVisibleTrimRouteOverlayV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteOverlay";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST VISIBLE SCENE REVIEW\n");

const captureImageIds = ["img-1", "img-2", "img-3"];
const points: RoutePoint[] = [
  { id: "source", x: 0.1, y: 0.6, imageId: "graph", kind: "SOURCE" },
  { id: "destination", x: 0.9, y: 0.6, imageId: "graph", kind: "DESTINATION" },
];
const segments: RouteSegment[] = [{ id: "segment", fromPointId: "source", toPointId: "destination" }];

const semantics = buildFixtureVisibleSceneSemanticsV1({ captureImageIds, sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
check("fixture semantics build with three ordered sweep frames", semantics !== null);
if (!semantics) process.exit(1);

const valid = validateRouteAssistVisibleSceneSemanticsV1({ semantics, expectedCaptureImageIds: captureImageIds, points, segments });
check("coherent visible scene semantics validate", valid.length === 0, JSON.stringify(valid));

const proposal = proposeVisibleTrimHuggingRouteV1({ semantics, expectedCaptureImageIds: captureImageIds, points, segments });
check("complete doorway evidence produces review-required route proposal", proposal.status === "REVIEW_REQUIRED", JSON.stringify(proposal));
check("doorway proposal includes up/top/down casing steps", ["DOOR_SIDE_UP", "DOOR_TOP", "DOOR_SIDE_DOWN"].every((kind) => proposal.steps.some((step) => step.kind === kind)), JSON.stringify(proposal.steps));
check("proposal remains review-only", proposal.requiresHomeownerReview === true && !("accepted" in proposal), JSON.stringify(proposal));

const overlay = buildVisibleTrimRouteOverlayV1({ semantics, proposal });
check("review proposal projects into frame-local overlays", overlay !== null && overlay.paths.length >= 2, JSON.stringify(overlay));
check(
  "every overlay path stays on a durable capture image and has one point per step",
  overlay?.paths.every((path) => captureImageIds.includes(path.imageId) && path.points.length === path.stepKinds.length && path.points.length > 0) === true,
  JSON.stringify(overlay),
);
check(
  "overlay paths preserve capture order",
  overlay?.paths.map((path) => captureImageIds.indexOf(path.imageId)).every((order, index, all) => index === 0 || order > all[index - 1]) === true,
  JSON.stringify(overlay?.paths),
);

const wrongOrder = { ...semantics, captureImageIds: [...captureImageIds].reverse() };
const wrongOrderProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: wrongOrder, expectedCaptureImageIds: captureImageIds, points, segments });
check("capture order mismatch fails closed", wrongOrderProblems.some((problem) => problem.includes("capture order")), JSON.stringify(wrongOrderProblems));

const missingTop = { ...semantics, objects: semantics.objects.filter((object) => object.kind !== "DOOR_TOP_CASING") };
const missingTopProposal = proposeVisibleTrimHuggingRouteV1({ semantics: missingTop, expectedCaptureImageIds: captureImageIds, points, segments });
check("doorway without top casing refuses to invent bypass", missingTopProposal.status === "INSUFFICIENT_VISIBLE_EVIDENCE", JSON.stringify(missingTopProposal));

const unknownImage = { ...semantics, objects: semantics.objects.map((object, index) => index === 0 ? { ...object, imageId: "not-in-sweep" } : object) };
const unknownImageProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: unknownImage, expectedCaptureImageIds: captureImageIds, points, segments });
check("scene object outside durable sweep is rejected", unknownImageProblems.some((problem) => problem.includes("unknown image")), JSON.stringify(unknownImageProblems));

const duplicateObject = { ...semantics, objects: [...semantics.objects, { ...semantics.objects[0] }] };
const duplicateProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: duplicateObject, expectedCaptureImageIds: captureImageIds, points, segments });
check("duplicate semantic object IDs are rejected", duplicateProblems.some((problem) => problem.includes("duplicate or empty id")), JSON.stringify(duplicateProblems));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
