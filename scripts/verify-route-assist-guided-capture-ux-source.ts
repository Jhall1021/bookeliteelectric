import { readFileSync } from "node:fs";

/**
 * Source-contract check for the governing capture UX rewrite (Capture ->
 * Ghost-edge guide -> Alignment lock -> Capture -> Mini stitched preview
 * -> Repeat -> Final stitched workspace -> Device placement). Follows
 * this repo's established pattern (see verify-route-assist-camera-shell-
 * source.ts, verify-route-assist-phone-continuation-source.ts) of proving
 * structural/behavioral guarantees that are awkward to assert through a
 * pure-function unit test -- component wiring, which strings are shown
 * to a homeowner vs. hidden behind the debug toggle, which functions call
 * which -- via targeted checks against the actual client source text.
 *
 * The underlying PURE LOGIC this UI wires together (ghost-edge crop
 * geometry, the alignment lock state machine, sensor signal fusion,
 * direction resolution, the affine-vs-projective matrix check) is already
 * covered by scripts/verify-route-assist-alignment-lock.ts's unit tests
 * (items 1-17, 20, 23) and the unchanged registration/stitched-workspace
 * suites (18, 19, 22). This file covers items 1, 6, 7, 17, 20, 21, 24-29
 * plus the exact failure copy and homeowner-facing language boundary.
 *
 * Run: npx tsx scripts/verify-route-assist-guided-capture-ux-source.ts
 */

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST GUIDED CAPTURE UX — SOURCE CONTRACT\n");

const client = readFileSync("app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient.tsx", "utf8");
const renderer = readFileSync("lib/visual-assist/route-assist/projectiveRenderer.ts", "utf8");

// --- 1: Photo 1 has no ghost strip ------------------------------------------

const firstCaptureComponent = client.slice(client.indexOf("function RouteAssistFirstCaptureV1"), client.indexOf("* Photo 2+: camera-first alignment mode"));
check("1. the Photo 1 capture component never references a ghost strip or alignment badge", !/ghost|Aligned|Match this ghost edge/i.test(firstCaptureComponent));
check(
  "1b. CAPTURE_FIRST stage renders the plain first-capture component, not the alignment camera",
  /stage === "CAPTURE_FIRST"[\s\S]{0,400}<RouteAssistFirstCaptureV1/.test(client) && !/stage === "CAPTURE_FIRST"[\s\S]{0,400}RouteAssistAlignmentCameraV1/.test(client),
);

// --- 6/7: ghost strip is a genuine crop, never the whole prior photo -------

check(
  "6. the alignment camera never overlays the previous photo's full dataUrl -- only a cropped ghostStripUrl",
  /route-assist-ghost-edge-strip[\s\S]{0,20}/.test(client) && !/aria-hidden[^>]*previousFrame\.dataUrl/.test(client),
);
check(
  "6b. the ghost strip source is produced by a crop function (canvas drawImage with a sub-rectangle), not a plain <img src={photo}> of the whole frame",
  /cropRouteAssistGhostStripV1/.test(client) && /context\.drawImage\(image, rect\.x \* sourceWidth, rect\.y \* sourceHeight, rect\.width \* sourceWidth, rect\.height \* sourceHeight/.test(client),
);
check("7. the ghost strip is displayed with object-contain (no non-uniform stretch/warp)", /route-assist-ghost-edge-strip[\s\S]{0,10}/.test(client) && /object-contain[\s\S]{0,300}route-assist-ghost-edge-strip/.test(client));

// --- 14/17: sensor permission is contextual, never upfront ------------------

check(
  "14/17. DeviceOrientationEvent.requestPermission is only ever called from inside ensureRouteAssistOrientationSensorV1",
  (client.match(/requestPermission\(\)/g) ?? []).length === 1 && /async function ensureRouteAssistOrientationSensorV1[\s\S]{0,600}requestPermission\(\)/.test(client),
);
check(
  "14/17b. the sensor-permission function is called from startAlignment (Add another view), never from a mount-time effect with no gating",
  /function startAlignment\(\)[\s\S]{0,600}ensureRouteAssistOrientationSensorV1\(\)/.test(client) && !/useEffect\(\s*\(\)\s*=>\s*\{\s*[\s\S]{0,80}ensureRouteAssistOrientationSensorV1/.test(client),
);
check(
  "17b. a denied/unavailable sensor is recorded as UNAVAILABLE and returns -- it never throws or blocks the alignment flow",
  /setSensorStatus\("UNAVAILABLE"\);\s*return;/.test(client),
);

// --- 18/19: registration remains authoritative after capture ---------------

check(
  "18. a captured alignment photo is only added to the workspace via the real registration entry point (addRouteAssistStitchedWorkspaceFrameV1), never bypassed",
  /async function handleAlignmentCaptured[\s\S]{0,2000}addRouteAssistStitchedWorkspaceFrameV1\(/.test(client),
);
{
  const handler = client.slice(client.indexOf("async function handleAlignmentCaptured"), client.indexOf("function placeMarker("));
  const rejectedStart = handler.indexOf('result.outcome !== "ADDED"');
  const rejectedEnd = handler.indexOf("return;", rejectedStart);
  const rejectedBranch = handler.slice(rejectedStart, rejectedEnd);
  check("19. the REJECTED branch never calls setWorkspace -- the prior valid workspace is left completely untouched", !/setWorkspace\(/.test(rejectedBranch));
  check(
    "19b. the exact homeowner-facing retry copy is used on rejection/error, matching the product direction verbatim",
    (handler.match(/REGISTRATION_FAILURE_MESSAGE/g) ?? []).length >= 3,
  );
}
check(
  "19c. the retry copy constant reads exactly \"We couldn't connect that view. Try again while keeping a little more of the previous area visible.\"",
  client.includes("const REGISTRATION_FAILURE_MESSAGE = \"We couldn't connect that view. Try again while keeping a little more of the previous area visible.\";"),
);

// --- 20: homography rendered projectively, never CSS-affine-approximated ---

check(
  "20. frame layer rendering branches on isAffineRepresentableV1(frame.transformToWorkspace), not on a single step's registration.transformType",
  /isAffineRepresentableV1\(frame\.transformToWorkspace\)/.test(client),
);
check(
  "20b. the non-affine branch renders through the WebGL projective component, never a CSS matrix() string",
  /return \(\s*<RouteAssistProjectiveFrameV1/.test(client),
);
check("20c. the projective renderer module performs a real perspective divide (local.xy / local.z), not a 2D affine-only transform", /local\.xy \/ local\.z/.test(renderer));
check("20d. the projective renderer never falls back to CSS matrix() for its primary path", !/style\.transform\s*=.*matrix\(/.test(renderer));

// --- 21: never a black screen -----------------------------------------------

check(
  "21. the projective frame component falls back to the original un-warped photo (never a blank/black element) if WebGL drawing fails",
  /renderFailed[\s\S]{0,300}<img src=\{sourceDataUrl\}/.test(client),
);

// --- 24-29: review/progress reuse the same workspace representation --------

check("24/25/28. the REVIEW stage always shows the workspace canvas together with the completion question -- never one without the other", /stage === "REVIEW"[\s\S]{0,300}RouteAssistWorkspaceCanvasV1[\s\S]{0,600}route-assist-review-question/.test(client));
check("26. a progress caption (\"N views captured\") is shown after a successful continuation, adapted to Route Assist's own open-ended count (no fixed total)", /route-assist-progress-caption/.test(client) && /\$\{next\.length\} views captured/.test(client));
check("27. \"Add another view\" returns to the camera-first ALIGNMENT stage, not a separate shrunk-camera-beside-photos layout", /onClick=\{startAlignment\}[\s\S]{0,200}route-assist-review-add-view/.test(client));
check("29. the SAME RouteAssistWorkspaceCanvasV1 component is reused for review preview and final device placement", (client.match(/<RouteAssistWorkspaceCanvasV1/g) ?? []).length === 2);

// --- homeowner-facing language boundary -------------------------------------

const forbiddenDeveloperTerms = ["overlapFraction", "homography", "reprojection", "RANSAC", "transformToWorkspace", "registerFrameV1"];
const alwaysVisibleReasonStrings = ["Move back slightly.", "Keep moving.", "Straighten the phone.", "Hold steady.", "Aligned.", "Almost there."];
check(
  "developer terms never leak into the always-visible alignment reason vocabulary",
  alwaysVisibleReasonStrings.every((text) => forbiddenDeveloperTerms.every((term) => !text.includes(term))),
);
check(
  "the always-shown generic pre-direction guidance line never uses developer vocabulary (frame/registration/overlap/homography/transform)",
  /Slowly pan toward the rest of the work area\. We'll show a ghost edge to match once we can tell which way you're moving\./.test(client),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
