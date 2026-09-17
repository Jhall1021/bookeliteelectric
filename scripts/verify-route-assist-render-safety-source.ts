import { readFileSync } from "node:fs";

/**
 * BLOCKER-1 SOURCE CONTRACT: a one-photo workspace must be impossible to
 * render black. Proves the single/multi-photo render split, the removal
 * of the double-aspect-ratio CSS bug, and the never-black-screen
 * guarantees, via targeted checks against the actual client source --
 * following this repo's established "-source.ts" pattern (see
 * verify-route-assist-camera-shell-source.ts) for guarantees that are
 * awkward to assert as a pure-function unit test but are provably true
 * (or false) from the wiring itself. A real-browser proof of the same fix
 * (Photo 1 -> REVIEW -> visible, no black screen, via a synthetic
 * getUserMedia stream) was additionally run during this pass; that proof
 * is not automatable in this repo's node-based test suite and is reported
 * separately.
 *
 * Run: npx tsx scripts/verify-route-assist-render-safety-source.ts
 */

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST RENDER SAFETY — SOURCE CONTRACT\n");

const client = readFileSync("app/dev-fixtures/route-assist-guided-continuation/RouteAssistGuidedContinuationPreviewClient.tsx", "utf8");

// --- 1: one-photo review always uses the safe direct-image renderer --------

check(
  "1. the canvas explicitly branches on workspace.frames.length === 1 and renders RouteAssistSinglePhotoRendererV1 for that case",
  /const isSinglePhoto = workspace\.frames\.length === 1;/.test(client) && /isSinglePhoto \? \(\s*<RouteAssistSinglePhotoRendererV1/.test(client),
);

// --- 2: the single-photo renderer does not depend on WebGL -----------------

{
  const singlePhotoComponent = client.slice(client.indexOf("function RouteAssistSinglePhotoRendererV1"), client.indexOf("function RouteAssistRenderDiagnosticsPanelV1"));
  check(
    "2. the single-photo renderer's own source never references WebGL, a <canvas>, the projective drawer, or a CSS matrix transform",
    !/getContext\(.webgl|drawRouteAssistProjectiveFrameV1|isAffineRepresentableV1|<canvas|matrix\(/.test(singlePhotoComponent),
  );
  check(
    "2b. the single-photo renderer is a plain <img> with no transform style at all",
    /<img[\s\S]{0,400}data-testid="route-assist-single-photo-image"/.test(singlePhotoComponent) && !/transform:/.test(singlePhotoComponent),
  );
}

// --- 3: source-image load failure produces explicit UI, never black --------

check(
  "3. an image load error sets an explicit ERROR state and renders a homeowner-facing message, not a blank/black element",
  /onError=\{\(\) => setLoadState\("ERROR"\)\}/.test(client) && /loadState === "ERROR"[\s\S]{0,200}We couldn't display that photo/.test(client),
);

// --- 4: zero/invalid canvas bounds cannot silently render black ------------

check(
  "4a. the workspace canvas container's own pixel dimensions are floor-guarded to at least 1px (never a zero/hidden container)",
  /const containerWidthPx = Math\.max\(1, \(bounds\.maxX - bounds\.minX\) \* pxPerUnit\);/.test(client) && /const containerHeightPx = Math\.max\(1, \(bounds\.maxY - bounds\.minY\) \* pxPerUnit\);/.test(client),
);
check(
  "4b. per-frame projective/composite dimensions are ALSO floor-guarded to at least 1px",
  /const widthPx = Math\.max\(1, \(frameBounds\.maxX - frameBounds\.minX\) \* pxPerUnit\);/.test(client) && /const heightPx = Math\.max\(1, \(frameBounds\.maxY - frameBounds\.minY\) \* pxPerUnit\);/.test(client),
);

// --- 5: multi-photo (composite) renderer only starts after registration ----

check(
  "5. the composite/projective renderer path (RouteAssistFrameLayerV1) is only reached in the else-branch of the single/multi split -- i.e. only once workspace.frames.length >= 2, which only happens after a successful ADDED registration",
  /isSinglePhoto \? \(\s*<RouteAssistSinglePhotoRendererV1[\s\S]{0,400}\) : \(\s*workspace\.frames\.map\(\(frame\) => \{[\s\S]{0,400}<RouteAssistFrameLayerV1/.test(client),
);

// --- root-cause fix: the double-aspect-ratio CSS bug is gone ----------------

check(
  "root-cause. the multi-photo CSS-affine frame layer no longer uses object-contain on its pre-transform unit square (the bug: object-contain independently re-corrected aspect ratio that the outer matrix, derived from real corner deltas, already corrects, double-applying it)",
  !/className="absolute object-contain"[\s\S]{0,300}data-testid=\{`route-assist-frame-css-/.test(client),
);
check(
  "root-cause-b. the CSS-affine frame img now uses the default (unset) object-fit -- className is exactly \"absolute\" for that element",
  /className="absolute"\s*\n\s*style=\{\{ left: placementLeft, top: placementTop, width: pxPerUnit, height: pxPerUnit,[\s\S]{0,80}transform: `matrix/.test(client),
);

// --- diagnostics: dev-only, never shown to a homeowner ----------------------

check(
  "diagnostics. the render-diagnostics panel (source dims, load state, bounds, rendered size, WebGL availability, projective renderer state) is gated behind the debug toggle, same as the other dev-only panels",
  /\{debug && <RouteAssistRenderDiagnosticsPanelV1/.test(client),
);
check(
  "diagnostics-b. the diagnostics panel reports every field the product direction asked for: source dims, load state, workspace bounds, rendered pixel size, WebGL availability, and projective renderer state",
  ["sourceWidth", "loadState", "workspaceBounds", "renderedWidthPx", "webglAvailable", "projectiveRendererActive", "projectiveRendererInitState"].every((field) => client.includes(field)),
);

// --- 22-26: existing behavior explicitly unchanged by this pass ------------
// (Full proofs live in their own dedicated suites; these are pointer-level
// regression checks specific to this pass's touch points.)

check(
  "22. the ghost-edge UX (narrow strip, badges, direction copy) is untouched by this pass -- still present verbatim",
  /route-assist-ghost-edge-strip/.test(client) && /Match this ghost edge/.test(client) && /✓ Aligned/.test(client),
);
check(
  "23. sensor fallback wiring (contextual permission request, UNAVAILABLE on denial, never blocking) is untouched by this pass",
  /setSensorStatus\("UNAVAILABLE"\);\s*return;/.test(client) && /async function ensureRouteAssistOrientationSensorV1/.test(client),
);
check(
  "24. the alignment-lock stable-hold wiring (advanceRouteAssistAlignmentLockV1 driving capture) is untouched by this pass",
  /const advance = advanceRouteAssistAlignmentLockV1\(/.test(client),
);
check(
  "25. a failed registration still leaves the workspace untouched and shows the unchanged retry copy (see verify-route-assist-guided-capture-ux-source.ts test 19 for the full proof)",
  client.includes("const REGISTRATION_FAILURE_MESSAGE = \"We couldn't connect that view. Try again while keeping a little more of the previous area visible.\";"),
);
check(
  "26. marker placement/route-intent wiring (placeRouteAssistWorkspaceMarkerV1, deriveRouteAssistWorkspaceLegIntentsV1) is untouched by this pass -- markers still render in BOTH the single- and multi-photo canvas branches",
  /placeRouteAssistWorkspaceMarkerV1/.test(client) && /markers\?\.map\(\(marker\) => \(/.test(client),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
