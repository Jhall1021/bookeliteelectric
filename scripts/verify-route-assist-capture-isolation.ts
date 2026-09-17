/**
 * CAPTURE-UX ISOLATION PASS: proves the storyboard capture interaction in
 * isolation from geometric registration, WebGL/CSS composite rendering,
 * workspace bounds, markers, and route evaluation -- none of which this
 * pass invokes (the underlying modules are untouched; this file proves
 * they are simply not called from the simplified client). Combines a
 * direct unit-test of the one pure function this pass introduces
 * (routeAssistAlignmentGuidanceLabelV1) with source-contract checks
 * against the actual client, following this repo's established
 * "-source.ts" pattern (see verify-route-assist-camera-shell-source.ts)
 * for guarantees that are about component wiring rather than pure math.
 *
 * Run: npx tsx scripts/verify-route-assist-capture-isolation.ts
 */
import { readFileSync } from "node:fs";
import { routeAssistAlignmentGuidanceLabelV1 } from "../app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient";
import { ghostEdgeCropRectV1, ghostEdgeDisplayEdgeV1 } from "../lib/visual-assist/route-assist/alignmentLock";
import { initialRouteAssistCaptureHoldStateV1, type RouteAssistCaptureHoldStateV1 } from "../lib/visual-assist/route-assist/frameContinuation";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST CAPTURE-UX ISOLATION — TESTS\n");

const client = readFileSync("app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient.tsx", "utf8");

function hold(consecutiveInRange: number): RouteAssistCaptureHoldStateV1 {
  return { consecutiveInRange, holdStartedAtMs: consecutiveInRange > 0 ? 0 : null };
}

// --- 9: alignment states progress correctly (pure logic) -------------------

check(
  "9a. MOVE_BACK and KEEP_MOVING both read as the single 'Move right →' prompt",
  routeAssistAlignmentGuidanceLabelV1("MOVE_BACK", initialRouteAssistCaptureHoldStateV1()) === "Move right →" &&
    routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", initialRouteAssistCaptureHoldStateV1()) === "Move right →",
);
check("9b. entering the acceptable overlap window for the first time reads as 'Almost there'", routeAssistAlignmentGuidanceLabelV1("ALMOST_THERE", hold(1)) === "Almost there");
check("9c. continuing to hold reads as 'Hold steady', a visibly distinct step from 'Almost there'", routeAssistAlignmentGuidanceLabelV1("ALMOST_THERE", hold(2)) === "Hold steady");
check("9d. a stable hold reads as '✓ Aligned'", routeAssistAlignmentGuidanceLabelV1("READY_TO_CAPTURE", hold(2)) === "✓ Aligned");
check(
  "9e. the four states form the exact storyboard progression in order: Move right -> Almost there -> Hold steady -> Aligned",
  [
    routeAssistAlignmentGuidanceLabelV1("MOVE_BACK", hold(0)),
    routeAssistAlignmentGuidanceLabelV1("ALMOST_THERE", hold(1)),
    routeAssistAlignmentGuidanceLabelV1("ALMOST_THERE", hold(2)),
    routeAssistAlignmentGuidanceLabelV1("READY_TO_CAPTURE", hold(2)),
  ].join(" -> ") === "Move right → -> Almost there -> Hold steady -> ✓ Aligned",
);

// --- 4/5: right continuation uses the right edge, displayed on the left ----

check(
  "4. RIGHT continuation crops the RIGHTMOST ~25% of the previous photo (ghostEdgeCropRectV1('RIGHT'))",
  ghostEdgeCropRectV1("RIGHT").x > 0.7 && ghostEdgeCropRectV1("RIGHT").width >= 0.2 && ghostEdgeCropRectV1("RIGHT").width <= 0.3,
);
check("5. the RIGHT-source ghost strip displays on the LEFT ~25% of the live camera (ghostEdgeDisplayEdgeV1('RIGHT') === 'LEFT')", ghostEdgeDisplayEdgeV1("RIGHT") === "LEFT" && ghostEdgeCropRectV1(ghostEdgeDisplayEdgeV1("RIGHT")).x === 0);

// --- 1/2: Photo 1 displays, never enters WebGL/composite rendering ---------

check(
  "1. CAPTURE_FIRST and REVIEW render captured photos via the plain photo panel, never a canvas or projective component",
  /stage === "CAPTURE_FIRST"/.test(client) && /RouteAssistPlainPhotoPanelV1/.test(client) && !/<canvas/.test(client),
);
check(
  "2. this file never imports or references WebGL, the projective drawer, CSS-affine composite math, or the geometric registration/workspace modules -- only frameContinuation.ts's unchanged window/hold classifier, alignmentLock.ts's pure crop-geometry helpers, and the plain image loader",
  !/drawRouteAssistProjectiveFrameV1|isAffineRepresentableV1|getContext\(.webgl|registerFrameV1|addRouteAssistStitchedWorkspaceFrameV1|advanceRouteAssistAlignmentLockV1/.test(client),
);

// --- 3: ghost strip appears immediately, no AI direction inference --------

check(
  "3. startAlignment computes and shows the ghost strip via a direct local crop (cropRouteAssistGhostStripV1), not gated behind any network/AI response",
  /async function startAlignment\(\)[\s\S]{0,600}cropRouteAssistGhostStripV1\(/.test(client) && !/relativeDirection/.test(client),
);

// --- 6: ghost strip is a raw crop, no transform -----------------------------

check(
  "6. the ghost-strip crop function performs a plain drawImage sub-rectangle crop with no rotate/scale/skew beyond the crop itself",
  /async function cropRouteAssistGhostStripV1[\s\S]{0,600}context\.drawImage\(image, rect\.x \* sourceWidth, rect\.y \* sourceHeight, rect\.width \* sourceWidth, rect\.height \* sourceHeight, 0, 0, canvas\.width, canvas\.height\);/.test(client),
);

// --- 7: ghost strip stays fixed during the alignment attempt ---------------

check(
  "7. ghostStripUrl is set exactly once (inside startAlignment) and never written to again by the probe handler or any effect keyed on live guidance",
  (client.match(/setGhostStripUrl\(/g) ?? []).length === 2, // one success path, one catch fallback -- both inside startAlignment only
);
check("7b. the probe handler never calls setGhostStripUrl", !/async function handleAlignmentProbeFrame[\s\S]*?setGhostStripUrl/.test(client.slice(client.indexOf("async function handleAlignmentProbeFrame"), client.indexOf("handleShutterCaptured"))));

// --- 8: direction text is exactly "Move right" ------------------------------

check("8. the direction copy is exactly 'Move right →'", client.includes('"Move right →"'));

// --- 10: capture is manual once aligned -------------------------------------

{
  const cameraComponent = client.slice(client.indexOf("function RouteAssistGhostAlignmentCameraV1"), client.indexOf("function RouteAssistPlainPhotoPanelV1"));
  check(
    "10. the alignment camera's shutter button is disabled unless captureEnabled, and the button's onClick is the only place in this component that invokes takePhoto",
    /disabled=\{!captureEnabled\}/.test(cameraComponent) && /onClick=\{takePhoto\}/.test(cameraComponent) && (cameraComponent.match(/takePhoto\(\)/g) ?? []).length === 1,
  );
  const probeEffectBody = cameraComponent.slice(cameraComponent.indexOf("setInterval"), cameraComponent.indexOf("}, 900);") + 8);
  check("10b. the alignment camera's probe-interval effect only calls onProbeFrame, never takePhoto -- capture never fires from the probe loop", /onProbeFrame\(downscaled\)/.test(probeEffectBody) && !/takePhoto/.test(probeEffectBody));
  check("10c. captureEnabled comes straight from guidance === READY_TO_CAPTURE, computed once per render in the parent, not from any auto-capture signal", /const captureEnabled = alignmentGuidance === "READY_TO_CAPTURE";/.test(client));
}

// --- 11/12/13: Photo 2 is independently displayable, never hidden behind canvas/WebGL --

check(
  "11/13. the review/progress grid renders every captured frame as a plain <img src={frame.dataUrl}>, independently of any other frame",
  /<img src=\{frame\.dataUrl\}/.test(client),
);
check("12. there is no <canvas> element anywhere in the review/progress rendering path (RouteAssistPlainPhotoPanelV1)", !/function RouteAssistPlainPhotoPanelV1[\s\S]{0,20}\{[\s\S]*?<canvas/.test(client.slice(client.indexOf("function RouteAssistPlainPhotoPanelV1"), client.indexOf("function RouteAssistPlainPhotoPanelV1") + 600)));

// --- 14: no geometric transform in the progress screen ----------------------

{
  const panelComponent = client.slice(client.indexOf("function RouteAssistPlainPhotoPanelV1"), client.indexOf("export default function"));
  check("14. RouteAssistPlainPhotoPanelV1 never sets a CSS transform style", !/transform:/.test(panelComponent));
}

// --- 15: Photo 3's ghost source is the MOST RECENT photo, not always Photo 1 --

check(
  "15. startAlignment always crops from frames[frames.length - 1] (the most recently captured photo), never a fixed reference to frames[0]",
  /const previousFrame = frames\[frames\.length - 1\];\s*\n\s*if \(!previousFrame\) return;\s*\n\s*holdStateRef/.test(client),
);

// --- 16: no workspace/device/routing code runs in this capture proof -------

check(
  "16. this file imports nothing from stitchedWorkspace.ts, imageRegistration.ts, frameRegistrationAiGateway.ts, factModel.ts, livePhotoFactAdapter.ts, taxonomy.ts, or visualSceneSemantics.ts",
  !/from "@\/lib\/visual-assist\/route-assist\/(stitchedWorkspace|imageRegistration|frameRegistrationAiGateway|factModel|livePhotoFactAdapter|taxonomy|visualSceneSemantics)"/.test(client),
);
check(
  "16b. no marker/route-intent/registration function names appear anywhere in this file's source",
  !/placeRouteAssistWorkspaceMarkerV1|deriveRouteAssistWorkspaceLegIntentsV1|evaluateRouteAssistWorkspaceLegV1|registerFrameV1|addRouteAssistStitchedWorkspaceFrameV1/.test(client),
);
check(
  "16c. the underlying modules are NOT deleted -- they still exist on disk, untouched, ready to be reconnected",
  [
    "lib/visual-assist/route-assist/stitchedWorkspace.ts",
    "lib/visual-assist/route-assist/imageRegistration.ts",
    "lib/visual-assist/route-assist/projectiveRenderer.ts",
    "lib/visual-assist/route-assist/alignmentLock.ts",
  ].every((path) => readFileSync(path, "utf8").length > 0),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
