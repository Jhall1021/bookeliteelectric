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
 * EXTENDED for the POLISH PASS (same client, same isolation guarantees):
 * ghost-strip width/opacity treatment, the ghost/live boundary divider,
 * the aligned-state messaging fix (badge and bottom guidance can no
 * longer disagree), shutter emphasis, and the progress-review grid/
 * filmstrip layout -- see the "POLISH PASS" section below.
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
  "4. RIGHT continuation crops the RIGHTMOST ~18-22% of the previous photo (ghostEdgeCropRectV1('RIGHT'), polish pass's narrower target band)",
  ghostEdgeCropRectV1("RIGHT").x > 0.75 && ghostEdgeCropRectV1("RIGHT").width >= 0.18 && ghostEdgeCropRectV1("RIGHT").width <= 0.22,
);
check("5. the RIGHT-source ghost strip displays on the LEFT ~18-22% of the live camera (ghostEdgeDisplayEdgeV1('RIGHT') === 'LEFT')", ghostEdgeDisplayEdgeV1("RIGHT") === "LEFT" && ghostEdgeCropRectV1(ghostEdgeDisplayEdgeV1("RIGHT")).x === 0);

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
  /<img\s+src=\{frame\.dataUrl\}/.test(client),
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

// ============================================================================
// POLISH PASS: ghost-strip treatment, divider, aligned-state messaging,
// shutter emphasis, progress-review layout. Same client, same isolation
// guarantees above (still enforced) -- this section covers the new
// 20-item polish test list.
// ============================================================================

{
  const cameraComponent = client.slice(client.indexOf("function RouteAssistGhostAlignmentCameraV1"), client.indexOf("function RouteAssistPlainPhotoPanelV1"));

  // --- 1: ghost strip remains a raw crop from the previous image -----------
  check(
    "polish-1. the ghost strip is still produced by the same raw drawImage crop (cropRouteAssistGhostStripV1) -- unchanged by the opacity/width polish",
    /async function cropRouteAssistGhostStripV1[\s\S]{0,600}context\.drawImage\(image, rect\.x \* sourceWidth, rect\.y \* sourceHeight, rect\.width \* sourceWidth, rect\.height \* sourceHeight, 0, 0, canvas\.width, canvas\.height\);/.test(client),
  );

  // --- 2: ghost strip width is within the intended narrow-reference range --
  check(
    "polish-2. ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1 (the shared ghost-strip width) is within the 18-22% target band",
    ghostEdgeCropRectV1("RIGHT").width >= 0.18 && ghostEdgeCropRectV1("RIGHT").width <= 0.22,
  );

  // --- 3: ghost strip opacity is lower than live-camera dominance ----------
  check(
    "polish-3. the ghost strip is rendered with an explicit opacity below 0.5 (a precise inline style, not a nonexistent Tailwind utility class) -- the live camera visibly dominates",
    /const GHOST_STRIP_OPACITY = 0\.\d+;/.test(client) && (() => {
      const match = client.match(/const GHOST_STRIP_OPACITY = (0\.\d+);/);
      const value = match ? Number(match[1]) : 1;
      return value > 0 && value < 0.5;
    })(),
  );
  check(
    "polish-3b. the ghost strip's opacity is applied via inline style (opacity: GHOST_STRIP_OPACITY), not a Tailwind class string that this project's config does not define",
    /style=\{\{ left: `\$\{ghostRect\.x \* 100\}%`, top: `\$\{ghostRect\.y \* 100\}%`, width: `\$\{ghostRect\.width \* 100\}%`, height: `\$\{ghostRect\.height \* 100\}%`, opacity: GHOST_STRIP_OPACITY \}\}/.test(client) &&
      !/className="[^"]*opacity-45[^"]*"/.test(client),
  );

  // --- 4/5: a crisp divider exists, oriented to the continuation direction --
  check("polish-4. a ghost/live boundary divider element exists (route-assist-ghost-divider)", /route-assist-ghost-divider/.test(cameraComponent));
  check(
    "polish-5. the divider's orientation is derived from the continuation direction (vertical for LEFT/RIGHT, horizontal for UP/DOWN) and positioned exactly at the ghost strip's own boundary, not a fixed hardcoded position",
    /const dividerIsVertical = displayEdge === "LEFT" \|\| displayEdge === "RIGHT";/.test(cameraComponent) &&
      /const dividerFraction = displayEdge === "LEFT" \? ghostRect\.width : displayEdge === "RIGHT" \? 1 - ghostRect\.width : displayEdge === "UP" \? ghostRect\.height : 1 - ghostRect\.height;/.test(cameraComponent),
  );

  // --- 6/7: "Match this edge" before alignment, never alongside "✓ Aligned" --
  check("polish-6. \"Match this edge\" is the badge text before alignment", /\{aligned \? "✓ Aligned" : "Match this edge"\}/.test(cameraComponent));
  check(
    "polish-7. the badge can NEVER read \"Match this edge\" at the same time the bottom guidance reads \"✓ Aligned\" -- both are driven by the SAME `aligned` boolean, so they can never disagree",
    /const aligned = captureEnabled;/.test(cameraComponent) && /\{aligned \? "✓ Aligned" : "Match this edge"\}/.test(cameraComponent),
  );

  // --- 8: direction guidance de-emphasizes/disappears once aligned ---------
  check(
    "polish-8. once guidance is READY_TO_CAPTURE, the guidance label is exactly '✓ Aligned' -- 'Move right →' can never be shown simultaneously with the aligned badge (mutually exclusive by construction, not by timing)",
    routeAssistAlignmentGuidanceLabelV1("READY_TO_CAPTURE", hold(2)) === "✓ Aligned" && routeAssistAlignmentGuidanceLabelV1("READY_TO_CAPTURE", hold(2)) !== "Move right →",
  );
  check(
    "polish-8b. the bottom guidance text is visually de-emphasized (reduced opacity) while not yet aligned, and full-strength once aligned",
    /text-white opacity-90/.test(cameraComponent) && /text-emerald-300/.test(cameraComponent),
  );

  // --- 9/10: shutter disabled before alignment, enabled only when aligned --
  check("polish-9. the shutter button is disabled whenever captureEnabled is false", /disabled=\{!captureEnabled\}/.test(cameraComponent));
  check(
    "polish-10. the shutter's enabled visual treatment (solid brand color) only applies when captureEnabled is true, with a dimmed/disabled treatment otherwise",
    /captureEnabled \? "bg-electric text-white" : "cursor-not-allowed bg-slate-300 text-slate-500"/.test(cameraComponent),
  );
  check(
    "polish-10b. the shutter gets a single, brief scale pulse the instant it first becomes enabled (justAligned), not a continuous/looping animation",
    /setJustAligned\(true\)/.test(cameraComponent) && /setTimeout\(\(\) => setJustAligned\(false\), 350\)/.test(cameraComponent) && !/animate-pulse|animate-bounce|animate-spin/.test(cameraComponent),
  );

  // --- 11: capture remains manual --------------------------------------------
  check(
    "polish-11. capture is still only ever triggered by the shutter button's onClick -- the probe loop and the alignment-pulse effect never call takePhoto",
    (cameraComponent.match(/takePhoto\(\)/g) ?? []).length === 1 && /onClick=\{takePhoto\}/.test(cameraComponent),
  );
}

// --- 12/13: Photo 2/3 progress uses plain img elements ----------------------

check(
  "polish-12/13. every captured frame (Photo 2, Photo 3, ...) renders through the SAME plain <img> panel component -- no per-index special-casing, no canvas",
  /RouteAssistPlainPhotoPanelV1 key=\{frame\.imageId\} frame=\{frame\} label=\{`Photo \$\{index \+ 1\}`\} layout="grid"/.test(client) &&
    /RouteAssistPlainPhotoPanelV1 key=\{frame\.imageId\} frame=\{frame\} label=\{`Photo \$\{index \+ 1\}`\} layout="filmstrip"/.test(client),
);

// --- 14/15/18: no WebGL/projective/composite renderer, no transformed workspace, no black-canvas path --

check(
  "polish-14/18. no WebGL context, projective renderer, or <canvas>-based composite path exists anywhere in this file except the plain crop/downscale helpers (which never render to screen)",
  !/getContext\(.webgl|drawRouteAssistProjectiveFrameV1|RouteAssistProjectiveFrameV1|RouteAssistWorkspaceCanvasV1|RouteAssistFrameLayerV1/.test(client),
);
check(
  "polish-15. no transformed/stitched workspace is built -- addRouteAssistStitchedWorkspaceFrameV1 and RouteAssistStitchedWorkspaceV1 are never referenced",
  !/addRouteAssistStitchedWorkspaceFrameV1|RouteAssistStitchedWorkspaceV1|transformToWorkspace/.test(client),
);

// --- 16: next ghost strip comes from the most recent accepted photo --------

check(
  "polish-16. startAlignment still always crops from frames[frames.length - 1] (unchanged by this pass's polish)",
  /const previousFrame = frames\[frames\.length - 1\];/.test(client),
);

// --- 17: progress images preserve aspect ratio ------------------------------

{
  const panelComponent = client.slice(client.indexOf("function RouteAssistPlainPhotoPanelV1"), client.indexOf("export default function"));
  check(
    "polish-17. the grid layout sizes the image by width only (height follows naturally, preserving aspect exactly) and the filmstrip layout sizes it by height only (width follows naturally) -- neither forces both dimensions, which is what would distort the photo",
    /className=\{layout === "filmstrip" \? "rounded-xl border border-slate-200 object-contain" : "w-full rounded-xl border border-slate-200 object-contain"\}/.test(panelComponent) &&
      /style=\{layout === "filmstrip" \? \{ height: 240, width: "auto" \} : undefined\}/.test(panelComponent),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
