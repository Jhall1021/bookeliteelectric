import { buildFixtureVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/fixtureVisibleSceneProvider";
import { validateRouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import { proposeVisibleTrimHuggingRouteV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";
import { buildVisibleTrimRouteOverlayV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteOverlay";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import type { RouteAssistNormalizedImageBoxV1, RouteAssistVisibleSceneObjectV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";

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

// --- CORNER contract correction ---------------------------------------------
// Real phone test with doorway/around-corner geometry failed with "visible
// scene object corner-1 references unknown point corner-anchor-1" -- correct
// fail-closed behavior, but it exposed that the provider contract let (in
// fact, per the JSON schema's required-but-nullable pointId field, nearly
// invited) a CORNER object to carry a point reference at all. Nothing
// downstream ever reads pointId for a CORNER (livePhotoFactAdapter locates
// it purely by its image-space box), so the fix is Option B: CORNER must
// never carry one, declared or not -- not just "the id must be declared."

const cornerObject = (id: string, extra: { pointId?: string } = {}) => ({
  id,
  kind: "CORNER" as const,
  imageId: captureImageIds[0],
  confidence: 0.9,
  box: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
  ...extra,
});

const cornerNoPointId = { ...semantics, objects: [...semantics.objects, cornerObject("corner-1")] };
const cornerNoPointIdProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: cornerNoPointId, expectedCaptureImageIds: captureImageIds, points, segments });
check("1. a CORNER object with no pointId (the corrected provider contract) validates cleanly", cornerNoPointIdProblems.length === 0, JSON.stringify(cornerNoPointIdProblems));

const cornerUndeclaredPointId = { ...semantics, objects: [...semantics.objects, cornerObject("corner-1", { pointId: "corner-anchor-1" })] };
const cornerUndeclaredProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: cornerUndeclaredPointId, expectedCaptureImageIds: captureImageIds, points, segments });
check(
  "2. the exact real-phone failure mode -- corner-1 referencing undeclared corner-anchor-1 -- still fails closed",
  cornerUndeclaredProblems.some((problem) => problem.includes("corner-1") && problem.includes("must not reference a route point")),
  JSON.stringify(cornerUndeclaredProblems),
);

const cornerDeclaredButIrrelevantPointId = { ...semantics, objects: [...semantics.objects, cornerObject("corner-2", { pointId: "source" })] };
const cornerDeclaredProblems = validateRouteAssistVisibleSceneSemanticsV1({ semantics: cornerDeclaredButIrrelevantPointId, expectedCaptureImageIds: captureImageIds, points, segments });
check(
  "a CORNER is rejected even when it names a REAL declared point -- CORNER never anchors to any point, declared or not",
  cornerDeclaredProblems.some((problem) => problem.includes("corner-2") && problem.includes("must not reference a route point")),
  JSON.stringify(cornerDeclaredProblems),
);

// --- Box-bounds correction ---------------------------------------------
// After the CORNER fix, the same doorway/around-corner phone test got
// farther and failed with "visible scene object doorway-1 has invalid
// normalized box" (and the same for its three casings) -- correct
// fail-closed behavior on a box exceeding the image. validBox() itself is
// UNCHANGED here: still rejects outright, no clamping/repairing/coercing.
// What's new is (a) a concrete, testable box contract in the provider
// prompt (aiGatewayVisibleScene.ts) instead of the vague "keep boxes
// inside image bounds", and (b) a preview-only diagnostic suffix on the
// same problem string carrying the actual numbers, so a real violation
// says WHICH field overshot instead of just that something did.

function boxTestObject(id: string, box: RouteAssistNormalizedImageBoxV1, kind: RouteAssistVisibleSceneObjectV1["kind"] = "DOORWAY"): RouteAssistVisibleSceneObjectV1 {
  return { id, kind, imageId: captureImageIds[0], confidence: 0.9, box };
}
function boxProblems(objects: RouteAssistVisibleSceneObjectV1[]): string[] {
  return validateRouteAssistVisibleSceneSemanticsV1({ semantics: { ...semantics!, objects: [...semantics!.objects, ...objects] }, expectedCaptureImageIds: captureImageIds, points, segments });
}

const validBoxProblems = boxProblems([boxTestObject("box-valid", { x: 0.25, y: 0.1, width: 0.3, height: 0.7 })]);
check("1. a valid normalized box passes", validBoxProblems.length === 0, JSON.stringify(validBoxProblems));

const overshootXProblems = boxProblems([boxTestObject("box-overshoot-x", { x: 0.8, y: 0.1, width: 0.3, height: 0.1 })]);
check(
  "2. x + width > 1 fails",
  overshootXProblems.some((problem) => problem.includes("box-overshoot-x") && problem.includes("invalid normalized box")),
  JSON.stringify(overshootXProblems),
);

const overshootYProblems = boxProblems([boxTestObject("box-overshoot-y", { x: 0.1, y: 0.8, width: 0.1, height: 0.3 })]);
check(
  "3. y + height > 1 fails",
  overshootYProblems.some((problem) => problem.includes("box-overshoot-y") && problem.includes("invalid normalized box")),
  JSON.stringify(overshootYProblems),
);

const negativeProblems = boxProblems([
  boxTestObject("box-negative-x", { x: -0.1, y: 0.1, width: 0.2, height: 0.2 }),
  boxTestObject("box-negative-y", { x: 0.1, y: -0.1, width: 0.2, height: 0.2 }),
]);
check(
  "4. negative x or y fails",
  negativeProblems.some((problem) => problem.includes("box-negative-x")) && negativeProblems.some((problem) => problem.includes("box-negative-y")),
  JSON.stringify(negativeProblems),
);

const nonPositiveExtentProblems = boxProblems([
  boxTestObject("box-zero-width", { x: 0.1, y: 0.1, width: 0, height: 0.2 }),
  boxTestObject("box-negative-height", { x: 0.1, y: 0.1, width: 0.2, height: -0.1 }),
]);
check(
  "5. width or height <= 0 fails",
  nonPositiveExtentProblems.some((problem) => problem.includes("box-zero-width")) && nonPositiveExtentProblems.some((problem) => problem.includes("box-negative-height")),
  JSON.stringify(nonPositiveExtentProblems),
);

const edgeTouchingProblems = boxProblems([boxTestObject("box-edge-touching", { x: 0.7, y: 0.1, width: 0.3, height: 0.2 })]);
check(
  "6. an edge-touching box where x + width === 1 passes",
  edgeTouchingProblems.length === 0,
  JSON.stringify(edgeTouchingProblems),
);

// 7. The exact real-phone shape: a doorway plus its three casings, each
// overshooting the image bounds the same way a real provider response did.
const doorwayComplexProblems = boxProblems([
  boxTestObject("doorway-1", { x: 0.55, y: 0.1, width: 0.5, height: 0.6 }, "DOORWAY"),
  boxTestObject("left-casing-1", { x: 0.5, y: 0.1, width: 0.55, height: 0.6 }, "DOOR_SIDE_CASING"),
  boxTestObject("right-casing-1", { x: 0.6, y: 0.1, width: 0.45, height: 0.6 }, "DOOR_SIDE_CASING"),
  boxTestObject("top-casing-1", { x: 0.5, y: -0.05, width: 0.5, height: 0.2 }, "DOOR_TOP_CASING"),
]);
check(
  "7. malformed doorway/casing boxes (the exact real-phone shapes) still fail closed",
  ["doorway-1", "left-casing-1", "right-casing-1", "top-casing-1"].every((id) => doorwayComplexProblems.some((problem) => problem.includes(id) && problem.includes("invalid normalized box"))),
  JSON.stringify(doorwayComplexProblems),
);

// Preview-only diagnostic suffix: numbers appear under the preview gate,
// and the production-facing message stays exactly as bare as before
// otherwise -- proving this is a diagnostic addition, not a behavior or
// contract change for any non-preview caller.
{
  const savedVercelEnv = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    const previewProblems = boxProblems([boxTestObject("box-overshoot-preview", { x: 0.8, y: 0.1, width: 0.3, height: 0.1 })]);
    check(
      "preview-only diagnostic: the problem string includes the actual box numbers under the preview gate",
      previewProblems.some((problem) => problem.includes("box-overshoot-preview") && problem.includes("x=") && problem.includes("width=")),
      JSON.stringify(previewProblems),
    );
  } finally {
    process.env.VERCEL_ENV = savedVercelEnv;
  }

  const savedNodeEnv = process.env.NODE_ENV;
  process.env.VERCEL_ENV = "production";
  try { (process.env as Record<string, string>).NODE_ENV = "production"; } catch { /* read-only in some Node builds */ }
  const productionProblems = boxProblems([boxTestObject("box-overshoot-production", { x: 0.8, y: 0.1, width: 0.3, height: 0.1 })]);
  check(
    "outside preview/dev, the box problem stays exactly the original bare message -- no numbers exposed to a non-preview caller",
    productionProblems.some((problem) => problem === "visible scene object box-overshoot-production has invalid normalized box"),
    JSON.stringify(productionProblems),
  );
  process.env.VERCEL_ENV = savedVercelEnv;
  try { (process.env as Record<string, string>).NODE_ENV = savedNodeEnv ?? ""; } catch { /* read-only in some Node builds */ }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
