/**
 * CAPTURE-UX ISOLATION PASS: proves the storyboard capture interaction in
 * isolation from geometric registration, WebGL/CSS composite rendering,
 * workspace bounds, markers, and route evaluation -- none of which this
 * pass invokes (the underlying modules are untouched; this file proves
 * they are simply not called from the simplified client). Combines a
 * direct unit-test of the pure functions this file exports
 * (routeAssistAlignmentGuidanceLabelV1) with source-contract checks
 * against the actual client, following this repo's established
 * "-source.ts" pattern (see verify-route-assist-camera-shell-source.ts)
 * for guarantees that are about component wiring rather than pure math.
 *
 * EXTENDED for the POLISH PASS: ghost-strip width/opacity treatment, the
 * ghost/live boundary divider, the aligned-state messaging fix, shutter
 * emphasis, and the progress-review grid/filmstrip layout.
 *
 * EXTENDED AGAIN for the GHOST-MAPPING / FOUR-DIRECTION / EVIDENCE-BASED
 * ALIGNMENT pass: the client no longer hardcodes RIGHT -- direction is
 * inferred and locked (alignmentEvidence.ts, tested independently in
 * verify-route-assist-alignment-evidence.ts) -- and the ghost strip uses
 * object-fit "cover" rather than "contain" to eliminate letterbox-induced
 * positional drift. This file's own checks were updated to match; the
 * PURE alignment-evidence and direction-lock logic itself is proven in
 * its own dedicated suite, not duplicated here.
 *
 * REDEFINED for the confirmed-false-alignment-gap fix: "capture
 * isolation" no longer means "never call geometric registration" -- it
 * means "never render a stitched/composited view in the plain review
 * UI." Geometric validation (imageRegistration.ts's registerFrameV1,
 * plus the route-assist-frame-registration-interpret landmark endpoint)
 * is now EXPLICITLY AUTHORIZED behind the capture gate, as the actual
 * authority over whether a tapped frame gets saved. This file's checks
 * were updated to assert the NEW, narrower boundary: stitchedWorkspace.ts
 * (the persistent multi-frame workspace/marker/route-intent model) and
 * projectiveRenderer.ts's WebGL compositor remain untouched and uncalled,
 * but imageRegistration.ts's pure geometry is now a real dependency.
 *
 * Run: npx tsx scripts/verify-route-assist-capture-isolation.ts
 */
import { readFileSync } from "node:fs";
import { routeAssistAlignmentGuidanceLabelV1, routeAssistCaptureFailureMessageV1 } from "../app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient";
import { ghostEdgeCropRectV1, ghostEdgeDisplayEdgeV1 } from "../lib/visual-assist/route-assist/alignmentLock";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST CAPTURE-UX ISOLATION — TESTS\n");

const client = readFileSync("app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient.tsx", "utf8");
const cameraComponent = client.slice(client.indexOf("function RouteAssistGhostAlignmentCameraV1"), client.indexOf("function RouteAssistPlainPhotoPanelV1"));
const panelComponent = client.slice(client.indexOf("function RouteAssistPlainPhotoPanelV1"), client.indexOf("export default function"));

// --- guidance-label pure function: pre-lock, per-direction, and aligned ----

check(
  "guidance-1. before a direction locks, every state reads as the same generic prompt (nothing to align against yet)",
  routeAssistAlignmentGuidanceLabelV1("UNCERTAIN", null) === "Pan slowly to continue capturing the work area." &&
    routeAssistAlignmentGuidanceLabelV1("SLOW_DOWN", null) === "Pan slowly to continue capturing the work area." &&
    routeAssistAlignmentGuidanceLabelV1("ALIGNED", null) === "Pan slowly to continue capturing the work area.",
);
check(
  "guidance-2. once locked, KEEP_MOVING reads as the direction-specific prompt for all four directions",
  routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", "RIGHT") === "Move right →" &&
    routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", "LEFT") === "Move left ←" &&
    routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", "UP") === "Move up ↑" &&
    routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", "DOWN") === "Move down ↓",
);
check(
  "guidance-3. the full locked progression reads Move ___ -> Slow down -> Stop here — hold steady -> Ready to check -- MOVEMENT-GUIDANCE FIX: a distinct 'Slow down' step now precedes the explicit stop instruction, and the terminal live label still never claims a confirmed 'Aligned' before geometric validation has run",
  [
    routeAssistAlignmentGuidanceLabelV1("KEEP_MOVING", "RIGHT"),
    routeAssistAlignmentGuidanceLabelV1("SLOW_DOWN", "RIGHT"),
    routeAssistAlignmentGuidanceLabelV1("HOLD_STEADY", "RIGHT"),
    routeAssistAlignmentGuidanceLabelV1("ALIGNED", "RIGHT"),
  ].join(" -> ") === "Move right → -> Slow down -> Stop here — hold steady -> Ready to check",
);
check("guidance-4. the live ALIGNED state reads as 'Ready to check' (never a checkmark) regardless of which direction is locked -- a checkmark is reserved for after capture validation actually passes", (["RIGHT", "LEFT", "UP", "DOWN"] as const).every((d) => routeAssistAlignmentGuidanceLabelV1("ALIGNED", d) === "Ready to check"));
check(
  "guidance-5. MOVEMENT-GUIDANCE FIX: the two NEW correction states read distinct, actionable, direction-agnostic copy -- 'Move back slightly' for confident-but-too-little overlap, and an honest 'can't confirm' message when the match itself is not confident, for all four directions equally",
  (["RIGHT", "LEFT", "UP", "DOWN"] as const).every(
    (d) => routeAssistAlignmentGuidanceLabelV1("MOVE_BACK", d) === "Move back slightly" && routeAssistAlignmentGuidanceLabelV1("UNCERTAIN", d) === "Can't confirm overlap yet — keep part of the previous view visible",
  ),
);

// --- 1/2: Photo 1 displays, never enters WebGL/composite rendering ---------

check(
  "1. CAPTURE_FIRST and REVIEW render captured photos via the plain photo panel, never a canvas or projective component",
  /stage === "CAPTURE_FIRST"/.test(client) && /RouteAssistPlainPhotoPanelV1/.test(client) && !/<canvas/.test(client),
);
check(
  "2. this file never imports or references WebGL, the projective drawer, CSS-affine composite math, or the persistent multi-frame workspace/marker model -- registerFrameV1 (pure geometric validation, explicitly authorized behind the capture gate) is the one deliberate exception",
  !/drawRouteAssistProjectiveFrameV1|isAffineRepresentableV1|getContext\(.webgl|addRouteAssistStitchedWorkspaceFrameV1/.test(client),
);
check(
  "2b. registerFrameV1 is called from exactly ONE place -- the capture-validation gate (handleCandidateFrame) -- never from anything that renders or composites the review UI",
  (client.match(/registerFrameV1\(/g) ?? []).length === 1 && /async function handleCandidateFrame[\s\S]{0,3000}registerFrameV1\(/.test(client),
);

// --- ghost mapping: symmetric 4-direction crop/display, raw crop, cover fit --

check(
  "3/4/5. all four directions crop the correct source edge and display on the correct opposite live edge, using the shared 18-22% strip fraction",
  (
    [
      ["RIGHT", "LEFT"],
      ["LEFT", "RIGHT"],
      ["UP", "DOWN"],
      ["DOWN", "UP"],
    ] as const
  ).every(([direction, expectedDisplayEdge]) => {
    const display = ghostEdgeDisplayEdgeV1(direction);
    const sourceRect = ghostEdgeCropRectV1(direction);
    const fraction = direction === "RIGHT" || direction === "LEFT" ? sourceRect.width : sourceRect.height;
    return display === expectedDisplayEdge && fraction >= 0.18 && fraction <= 0.22;
  }),
);

check(
  "6. ghost-strip crop is a raw drawImage sub-rectangle with no rotate/scale/skew beyond the crop itself, for whichever direction is locked",
  /async function cropRouteAssistGhostStripV1[\s\S]{0,600}context\.drawImage\(image, rect\.x \* sourceWidth, rect\.y \* sourceHeight, rect\.width \* sourceWidth, rect\.height \* sourceHeight, 0, 0, canvas\.width, canvas\.height\);/.test(client),
);

check(
  "7. GHOST-MAPPING FIX: the ghost strip uses object-fit \"cover\", not \"contain\" -- eliminates letterbox-induced positional drift between the strip's own crop aspect ratio and the live camera's rendered aspect ratio",
  /className="pointer-events-none absolute object-cover"/.test(cameraComponent) && !/className="pointer-events-none absolute object-contain"/.test(cameraComponent),
);

check(
  "8. the ghost strip is computed via computeGhostStrip, called ONLY at the moment direction locks -- never recomputed afterward, never repositioned mid-attempt",
  (client.match(/void computeGhostStrip\(/g) ?? []).length === 1 && /if \(nextLock\.locked\) \{[\s\S]{0,400}void computeGhostStrip\(nextLock\.locked, previousFrame\);/.test(client),
);
check(
  "8b. setGhostStripUrl is only ever called from inside computeGhostStrip (success/catch) or resetAlignmentAttempt, never from the post-lock alignment-evidence branch",
  (client.match(/setGhostStripUrl\(/g) ?? []).length === 3 && /function resetAlignmentAttempt\(\)[\s\S]{0,400}setGhostStripUrl\(null\);/.test(client),
);

// --- direction inference: locked from initial movement, jitter-resistant, restartable --

check(
  "9. direction is no longer hardcoded -- there is no CONTINUATION_DIRECTION constant, and the client imports the direction-lock engine",
  !/const CONTINUATION_DIRECTION/.test(client) && /advanceRouteAssistDirectionLockV1/.test(client) && /initialRouteAssistDirectionLockStateV1/.test(client),
);
check(
  "10. an unmatched probe (no evidence) contributes a null hint to direction inference, never a guessed direction",
  /const hint = assessment\.matched \? assessment\.relativeDirection : null;/.test(client),
);
check("11. a 'Restart direction' control exists and is wired to a full attempt reset (direction unlocked, evidence cleared, ghost cleared)", /route-assist-restart-direction/.test(cameraComponent) && /function restartDirection\(\)[\s\S]{0,80}resetAlignmentAttempt\(\);/.test(client));
check(
  "12. restarting an attempt (fresh 'Add another view' OR 'Restart direction') always goes through the SAME resetAlignmentAttempt helper -- one reset path, not two independently-maintained ones",
  (client.match(/resetAlignmentAttempt\(\);/g) ?? []).length === 2,
);

// --- evidence-based alignment: no auto-capture, continuous revalidation, recheck at capture --

check(
  "13. the shutter button is disabled unless captureEnabled AND not mid-validation, and takePhoto is the only call site invoked by its onClick",
  /disabled=\{!captureEnabled \|\| validating\}/.test(cameraComponent) && /onClick=\{takePhoto\}/.test(cameraComponent) && (cameraComponent.match(/takePhoto\(\)/g) ?? []).length === 1,
);
{
  const probeEffectBody = cameraComponent.slice(cameraComponent.indexOf("setInterval"), cameraComponent.indexOf("}, PROBE_INTERVAL_MS);") + 22);
  check(
    "13b. the probe-interval effect computes a REAL motion score (computeRouteAssistFrameMotionV1, from consecutive live frames) and calls only onProbeFrame -- never takePhoto -- so capture never fires from the probe loop",
    /computeRouteAssistFrameMotionV1\(/.test(probeEffectBody) && /onProbeFrame\(\{ downscaledDataUrl: downscaled, motionScore \}\)/.test(probeEffectBody) && !/takePhoto/.test(probeEffectBody),
  );
}
check(
  "14. captureEnabled requires BOTH alignmentState === 'ALIGNED' AND a locked direction -- never true before direction resolves, even if evidence data happens to look good",
  /const captureEnabled = alignmentState === "ALIGNED" && lockedDirection !== null;/.test(client),
);
check(
  "15. RECHECK AT CAPTURE: takePhoto calls isCaptureEligibleNow() -- a fresh, ref-backed check -- before doing anything else, not solely trusting the button's own (possibly stale) disabled attribute",
  /async function takePhoto\(\) \{\s*\n\s*if \(!isCaptureEligibleNow\(\)\) return;/.test(cameraComponent),
);
check(
  "15b. isCaptureEligibleNow reads directly from refs (alignmentStateRef, directionLockRef, validatingRef), not from React state that could lag one render behind",
  /function isCaptureEligibleNow\(\): boolean \{\s*\n\s*return alignmentStateRef\.current === "ALIGNED" && directionLockRef\.current\.locked !== null && !validatingRef\.current;/.test(client),
);
check(
  "15c. THE SHUTTER RACE FIX: takePhoto freezes the video frame into a canvas (drawImage) BEFORE it ever calls onCandidateFrame -- validation and the eventual save both act on that SAME frozen dataUrl, never a later, different live frame",
  /async function takePhoto\(\) \{[\s\S]{0,900}context\.drawImage\(video, 0, 0, canvas\.width, canvas\.height\);[\s\S]{0,400}const accepted = await onCandidateFrame\(\{ dataUrl, width, height \}\);/.test(cameraComponent),
);
check(
  "15d. the stream is only stopped when onCandidateFrame reports the frame was accepted -- a rejected candidate leaves the live camera (and probe loop) running so the homeowner can try again",
  /const accepted = await onCandidateFrame\(\{ dataUrl, width, height \}\);\s*\n\s*if \(accepted\) \{\s*\n\s*streamRef\.current\?\.getTracks/.test(cameraComponent),
);
check(
  "16. the alignment-evidence engine is continuously fed every probe (not a one-shot latch) -- advanceRouteAssistAlignmentEvidenceV1 is called from the probe handler itself",
  /const advanced = advanceRouteAssistAlignmentEvidenceV1\(\{ previous: evidenceRef\.current, probe \}\);/.test(client),
);
check(
  "16b. THE CAPTURE-VALIDATION GATE, CLASSICAL-CV (real-phone architecture change): handleCandidateFrame runs classical-CV feature matching (or the test override) and only saves the frame (setFrames/setStage REVIEW) when registerFrameV1 reports REGISTERED -- a REJECTED/failed check sets a capture notice and resets evidence instead of saving anything",
  /async function handleCandidateFrame[\s\S]{0,2000}proposeCorrespondencesViaFeatureMatchingV1[\s\S]{0,2200}if \(registration\.outcome !== "REGISTERED"\) \{[\s\S]{0,2000}resetEvidenceAfterValidationFailureV1\(\);\s*\n\s*return false;/.test(client),
);
check(
  "16c. HONEST ERROR COPY (real-phone correction): the raw geometric diagnostic (registration.reason, e.g. correspondenceDistribution.ts's own internal 'spread landmarks across more of the shared view' language) is never interpolated into the on-screen capture notice -- it is only ever logged via console.debug -- and the on-screen notice instead comes from routeAssistCaptureFailureMessageV1, a short, actionable mapping",
  !/setCaptureNotice\(`[^`]*\$\{registration\.reason\}/.test(client) &&
    /console\.debug\("Route Assist capture validation rejected:", registration\.reason, registration\);/.test(client) &&
    /setCaptureNotice\(routeAssistCaptureFailureMessageV1\(correspondences\.length\)\);/.test(client),
);
check(
  "16d. routeAssistCaptureFailureMessageV1 distinguishes 'insufficient usable overlap' (too few matched landmarks) from 'the matches didn't geometrically line up' -- two different, both non-technical, actionable messages, never the same generic string for both",
  routeAssistCaptureFailureMessageV1(0) !== routeAssistCaptureFailureMessageV1(10) &&
    !/spread landmarks|quadrant|homography|inlier|reprojection/i.test(routeAssistCaptureFailureMessageV1(0)) &&
    !/spread landmarks|quadrant|homography|inlier|reprojection/i.test(routeAssistCaptureFailureMessageV1(10)),
);
check(
  "16e. REGION-AWARE DISTRIBUTION FIX: handleCandidateFrame passes the locked direction's own expected overlap rectangle (ghostEdgeCropRectV1) into registerFrameV1 as expectedOverlapRegion -- the distribution guard is evaluated against the ACTUAL known overlap region, not blindly against the whole image",
  /const expectedOverlapRegion = lockedDirection \? ghostEdgeCropRectV1\(lockedDirection\) : null;/.test(client) && /expectedOverlapRegion: expectedOverlapRegion \?\? undefined,/.test(client),
);

// --- Photo 2/3 progress: plain img, no canvas, aspect preserved, most-recent chaining --

check(
  "17/18. the review/progress grid renders every captured frame as a plain <img src={frame.dataUrl}>, and there is no <canvas> anywhere in the panel component",
  /<img\s+src=\{frame\.dataUrl\}/.test(client) && !/<canvas/.test(panelComponent),
);
check("19. RouteAssistPlainPhotoPanelV1 never sets a CSS transform style", !/transform:/.test(panelComponent));
check(
  "20. the NEXT ghost strip always sources from frames[frames.length - 1] (the most recently accepted photo) -- Photo 3 references Photo 2, never Photo 1",
  /const previousFrame = frames\[frames\.length - 1\];\s*\n\s*if \(!previousFrame\) return;/.test(client),
);
check(
  "21. progress images preserve aspect ratio exactly -- the grid layout constrains width only (height follows naturally) and the filmstrip layout constrains height only (width follows naturally)",
  /className=\{layout === "filmstrip" \? "rounded-xl border border-slate-200 object-contain" : "w-full rounded-xl border border-slate-200 object-contain"\}/.test(panelComponent) &&
    /style=\{layout === "filmstrip" \? \{ height: 240, width: "auto" \} : undefined\}/.test(panelComponent),
);

// --- no PERSISTENT workspace/device/routing/compositing code runs here -----
//
// The confirmed-false-alignment-gap fix explicitly authorizes ONE crossing
// of the prior "never call registration" boundary: registerFrameV1, as a
// pass/fail gate behind manual capture, never as a renderer. Everything
// else this section originally forbade is still forbidden.

check(
  "22. CLASSICAL-CV REGISTRATION (real-phone architecture change): this file imports nothing from stitchedWorkspace.ts, frameRegistrationAiGateway.ts, factModel.ts, livePhotoFactAdapter.ts, taxonomy.ts, or visualSceneSemantics.ts -- correspondences come from featureMatchingCv.ts (client-side ORB feature matching, no AI Gateway, no network round trip for this step) -- imageRegistration.ts and featureMatchingCv.ts are the two explicitly authorized exceptions, and the old AI-landmark endpoint is never fetched from here anymore",
  !/from "@\/lib\/visual-assist\/route-assist\/(stitchedWorkspace|frameRegistrationAiGateway|factModel|livePhotoFactAdapter|taxonomy|visualSceneSemantics)"/.test(client) &&
    /from "@\/lib\/visual-assist\/route-assist\/imageRegistration"/.test(client) &&
    /from "@\/lib\/visual-assist\/route-assist\/featureMatchingCv"/.test(client) &&
    !/fetch\("\/api\/dev-fixtures\/route-assist-frame-registration-interpret"/.test(client),
);
check(
  "22b. no PERSISTENT-workspace or marker/route-intent function names appear anywhere in this file's source -- registerFrameV1 is the only geometry function referenced, and only as the capture gate's pass/fail check",
  !/placeRouteAssistWorkspaceMarkerV1|deriveRouteAssistWorkspaceLegIntentsV1|evaluateRouteAssistWorkspaceLegV1|addRouteAssistStitchedWorkspaceFrameV1/.test(client),
);
check(
  "22c. the underlying modules are NOT deleted -- they still exist on disk, untouched, ready to be reconnected",
  [
    "lib/visual-assist/route-assist/stitchedWorkspace.ts",
    "lib/visual-assist/route-assist/imageRegistration.ts",
    "lib/visual-assist/route-assist/projectiveRenderer.ts",
    "lib/visual-assist/route-assist/alignmentLock.ts",
  ].every((path) => readFileSync(path, "utf8").length > 0),
);
check(
  "22d. the review UI (RouteAssistPlainPhotoPanelV1 and the REVIEW-stage grid/filmstrip) contains no reference to registration, workspace, or transform output -- an ACCEPTED photo is rendered exactly like before, with no visible sign the gate ever ran",
  !/registerFrameV1|transformType|inlierCount|meanReprojectionError/.test(panelComponent),
);

// --- theme/divider/opacity treatment preserved from the polish pass --------

check(
  "23. the ghost strip's opacity is an explicit inline style below 0.5, not a nonexistent Tailwind utility class",
  (() => {
    const match = client.match(/const GHOST_STRIP_OPACITY = (0\.\d+);/);
    const value = match ? Number(match[1]) : 1;
    return value > 0 && value < 0.5;
  })(),
);
check("24. a ghost/live boundary divider element exists, oriented to the LOCKED continuation direction", /route-assist-ghost-divider/.test(cameraComponent) && /const dividerIsVertical = displayEdge === "LEFT" \|\| displayEdge === "RIGHT";/.test(cameraComponent));
check("25. the divider's colors route through the semantic token layer (rgb(var(--t-…))), not hex literals", /DIVIDER_LIGHT = "rgb\(var\(--t-surface\)\)"/.test(client) && /DIVIDER_DARK = "rgb\(var\(--t-ink-strong\)\)"/.test(client));
check(
  "26. the aligned-state badge and bottom guidance can never disagree with each other OR with the shutter -- all three are driven by the SAME `aligned`/`validating` state, and the badge is honestly 'Ready to check' (no checkmark) rather than a pre-validation 'Aligned' claim",
  /const aligned = captureEnabled;/.test(cameraComponent) &&
    /const badgeLabel = validating \? "Checking…" : aligned \? "Ready to check" : "Match this edge";/.test(cameraComponent) &&
    /const bottomLabel = validating \? "Checking that view…" : guidanceLabel;/.test(cameraComponent),
);
check(
  "26b. ONE CONSISTENT CHECKING STATE (real-phone correction): while validating, the badge and bottom guidance text stop showing the live 'Ready to check'/'Hold steady'/etc. label and instead show the SAME checking message the shutter button already shows -- never two different claims about what's happening on screen at once",
  /\{badgeLabel\}/.test(cameraComponent) && /\{bottomLabel\}/.test(cameraComponent) && !/\{aligned \? "Ready to check" : "Match this edge"\}/.test(cameraComponent),
);
check(
  "27. the shutter gets a single, brief scale pulse the instant it first becomes enabled, not a continuous/looping animation",
  /setJustAligned\(true\)/.test(cameraComponent) && /setTimeout\(\(\) => setJustAligned\(false\), 350\)/.test(cameraComponent) && !/animate-pulse|animate-bounce|animate-spin/.test(cameraComponent),
);
check(
  "28. a capture-notice element (route-assist-capture-notice) exists on the ALIGNMENT stage and is cleared on both a fresh validation attempt and any full attempt reset",
  /route-assist-capture-notice/.test(client) && /setCaptureNotice\(null\)/.test(client) && /function resetAlignmentAttempt\(\)[\s\S]{0,400}setCaptureNotice\(null\);/.test(client),
);
check(
  "29. CAPTURE-DIAGNOSTICS EXPORT (real-phone request): a route-assist-download-diagnostics action exists, rendered only when captureDiagnostics is set, and is cleared on a full attempt reset alongside the notice",
  /route-assist-download-diagnostics/.test(client) &&
    /\{captureDiagnostics && \(/.test(client) &&
    /function resetAlignmentAttempt\(\)[\s\S]{0,450}setCaptureDiagnostics\(null\);/.test(client),
);
check(
  "29b. a diagnostics bundle is built on EVERY rejection path (matching-service failure, geometric rejection, and network/catch failure) -- never only the one this pass was reported for",
  (client.match(/buildRouteAssistCaptureDiagnosticsV1\(\{/g) ?? []).length === 3,
);
check(
  "29c. the diagnostics bundle resolves the deployed SHA via the EXISTING, already-public /api/release endpoint -- no new env-var plumbing, no new gated route",
  /fetch\("\/api\/release"\)/.test(client),
);
check(
  "29d. the downloadable bundle documents the FIXED 20% ghost-crop region as a storyboard/UI convention, never a measured true overlap -- the exact question this pass's task asked to check for",
  /STORYBOARD\/UI[\s\S]{0,20}CONVENTION,\s*NOT A MEASUREMENT OF THE TRUE PHYSICAL OVERLAP/.test(client),
);
const downloadFnBody = /function downloadRouteAssistCaptureDiagnosticsV1\(bundle: RouteAssistCaptureDiagnosticsV1\) \{([\s\S]{0,400}?)\n\}/.exec(client)?.[1] ?? "";
check(
  "29e. SINGLE-FILE EXPORT FIX (real-phone correction): the export triggers exactly ONE download -- a Blob-URL JSON with both images embedded as data URLs -- never separate `<a download>` targets pointed at raw data: URIs, which iOS Safari silently fails to save",
  (downloadFnBody.match(/triggerBrowserBlobDownloadV1\(/g) ?? []).length === 1 && /JSON\.stringify\(bundle, null, 2\)/.test(downloadFnBody) && !/withoutImageBytes/.test(client),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
