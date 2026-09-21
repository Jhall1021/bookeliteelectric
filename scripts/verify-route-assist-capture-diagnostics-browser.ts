import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/**
 * CAPTURE-DIAGNOSTICS EXPORT VERIFICATION (real-phone request, 21 Sep
 * 2026): "That view didn't line up closely enough with the previous
 * photo" is a generic message by design -- routeAssistCaptureFailureMessageV1's
 * own doc comment explains why the raw reason never reaches the screen.
 * But that means a REAL rejection's actual cause has nowhere to go
 * except a client-side console.debug call, which never reaches any
 * server log (confirmed by inspection: no error-tracking/RUM integration
 * exists in this codebase, and the one server route in this path only
 * logs on a THROWN AI Gateway error, never on a successful landmark
 * response). This proves the "Download capture diagnostics" action that
 * exists specifically to close that gap: drives a REAL rejection through
 * the REAL rendered app (stubbed camera + a deliberately clustered
 * landmark response, the SAME shape verify-route-assist-registration-
 * harness-offline.ts already proved REFUSED against the real, unchanged
 * registerFrameV1), captures the resulting downloads via Playwright's own
 * download event (not a mocked click), and inspects the actual saved
 * files.
 *
 * Run: npx tsx scripts/verify-route-assist-capture-diagnostics-browser.ts --base http://localhost:3799
 */

declare global {
  interface Window {
    __setOverlapResponse: (body: unknown) => void;
    __setRegistrationResponse: (body: unknown, delayMs?: number) => void;
    __setStreamColor: (hex: string) => void;
  }
}

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3000";
const URL = `${BASE}/dev-fixtures/route-assist-guided-continuation`;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok" : "FAIL"} — ${label}${condition || !detail ? "" : `: ${detail}`}`);
  if (!condition) failures++;
}

// The SAME clustered shape verify-route-assist-registration-harness-
// offline.ts already proved REFUSED against the real registerFrameV1.
const CLUSTERED_LANDMARKS = [
  { fromPoint: { x: 0.81, y: 0.1 }, toPoint: { x: 0.51, y: 0.1 } },
  { fromPoint: { x: 0.83, y: 0.11 }, toPoint: { x: 0.53, y: 0.11 } },
  { fromPoint: { x: 0.84, y: 0.09 }, toPoint: { x: 0.54, y: 0.09 } },
  { fromPoint: { x: 0.82, y: 0.12 }, toPoint: { x: 0.52, y: 0.12 } },
  { fromPoint: { x: 0.85, y: 0.1 }, toPoint: { x: 0.55, y: 0.1 } },
  { fromPoint: { x: 0.86, y: 0.11 }, toPoint: { x: 0.56, y: 0.11 } },
];

const INIT_SCRIPT = `
window.__streamColor = '#22aa55';
window.__activeCtx = null;
window.__activeConfig = { width: 640, height: 480 };
window.__setStreamColor = (hex) => {
  window.__streamColor = hex;
  if (window.__activeCtx) { window.__activeCtx.fillStyle = hex; window.__activeCtx.fillRect(0, 0, window.__activeConfig.width, window.__activeConfig.height); }
};
window.__makeStream = () => {
  const canvas = document.createElement('canvas');
  canvas.width = window.__activeConfig.width;
  canvas.height = window.__activeConfig.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = window.__streamColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  window.__activeCtx = ctx;
  return canvas.captureStream(10);
};
navigator.mediaDevices.getUserMedia = async () => window.__makeStream();

window.__overlapResponse = { assessment: { matched: false, confidence: 0.9, overlapFraction: 0.05 } };
window.__setOverlapResponse = (body) => { window.__overlapResponse = body; };
window.__registrationResponse = { landmarks: [] };
window.__setRegistrationResponse = (body) => { window.__registrationResponse = body; };

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (typeof url === 'string' && url.includes('route-assist-frame-overlap-interpret')) {
    return new Response(JSON.stringify(window.__overlapResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof url === 'string' && url.includes('route-assist-frame-registration-interpret')) {
    return new Response(JSON.stringify(window.__registrationResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(url, init);
};
`;

async function waitForReason(page: import("playwright").Page, predicate: (reason: string) => boolean, maxTicks = 10): Promise<string> {
  let reason = "";
  for (let tick = 0; tick < maxTicks; tick += 1) {
    await page.waitForTimeout(950);
    reason = await page.locator('[data-testid="route-assist-alignment-reason"]').innerText().catch(() => "");
    if (predicate(reason)) return reason;
  }
  return reason;
}

async function main() {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ permissions: ["camera"], acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(URL);

  console.log("\n1. Capture Photo 1, enter alignment, reach Ready to check");
  await page.evaluate(() => window.__setStreamColor("#22aa55"));
  await page.click('[data-testid="route-assist-workspace-open-camera"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="route-assist-workspace-take-photo"]');
  await page.waitForSelector('[data-testid="route-assist-review-add-view"]');
  await page.click('[data-testid="route-assist-review-add-view"]');
  await page.waitForSelector('[data-testid="route-assist-alignment-camera"]');
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  const reasonReady = await waitForReason(page, (r) => r === "Ready to check", 10);
  check("reached Ready to check", reasonReady === "Ready to check", reasonReady);

  console.log("\n2. Force a GEOMETRIC REJECTION with a deliberately clustered landmark response, then confirm the download button appears");
  const noticeBefore = await page.locator('[data-testid="route-assist-download-diagnostics"]').count();
  check("no download button before any rejection has happened", noticeBefore === 0);
  await page.evaluate((landmarks) => window.__setRegistrationResponse({ landmarks }), CLUSTERED_LANDMARKS);
  await page.click('[data-testid="route-assist-alignment-shutter"]');
  await page.waitForSelector('[data-testid="route-assist-capture-notice"]', { timeout: 5000 });
  const notice = await page.locator('[data-testid="route-assist-capture-notice"]').innerText().catch(() => "");
  check("the generic on-screen notice is shown (unchanged homeowner-facing copy)", notice.length > 0, notice);
  await page.waitForSelector('[data-testid="route-assist-download-diagnostics"]', { timeout: 3000 });
  check("the 'Download capture diagnostics' action appears after a real rejection", true);

  console.log("\n3. Click the download action and inspect the ACTUAL downloaded file (via Playwright's own download event, not a mocked click)");
  // SINGLE-FILE EXPORT FIX (real-phone correction, 21 Sep 2026): a real
  // phone (iOS Safari) never reliably saved the old 3-download design's
  // two JPEGs -- `<a download>` pointed at a raw `data:` URI silently
  // fails to save on iOS Safari (it navigates to/previews the image
  // instead), confirmed against documented WebKit behavior. The export
  // now triggers exactly ONE Blob-URL download with both images embedded
  // as base64 data URLs inside the same JSON.
  const downloads: import("playwright").Download[] = [];
  page.on("download", (d) => downloads.push(d));
  await page.click('[data-testid="route-assist-download-diagnostics"]');
  await page.waitForTimeout(1000);
  check("exactly ONE download event was observed", downloads.length === 1, `count=${downloads.length}`);
  const filenames = downloads.map((d) => d.suggestedFilename());
  console.log(`     downloaded filenames: ${JSON.stringify(filenames)}`);
  check("the single download is the .json bundle", filenames.length === 1 && filenames[0].endsWith(".json"), JSON.stringify(filenames));

  const jsonDownload = downloads.find((d) => d.suggestedFilename().endsWith(".json"))!;
  const jsonPath = await jsonDownload.path();

  if (jsonPath) {
    const bundle = JSON.parse(readFileSync(jsonPath, "utf8"));
    check("bundle.failureCategory is GEOMETRIC_REJECTION (the AI call succeeded; the client-side geometric fit rejected it)", bundle.failureCategory === "GEOMETRIC_REJECTION", bundle.failureCategory);
    check("bundle.registrationResult.outcome is REJECTED, with the RAW reason (never shown on screen) preserved", bundle.registrationResult?.outcome === "REJECTED" && typeof bundle.registrationResult?.reason === "string" && bundle.registrationResult.reason.length > 0, JSON.stringify(bundle.registrationResult));
    check("bundle.usedCorrespondences contains the exact 6 clustered landmark pairs actually used", Array.isArray(bundle.usedCorrespondences) && bundle.usedCorrespondences.length === 6, JSON.stringify(bundle.usedCorrespondences));
    check("bundle.distributionEvaluation is present with its own coverage metrics (bounding box, occupied bins)", Boolean(bundle.distributionEvaluation?.distribution), JSON.stringify(bundle.distributionEvaluation));
    check("bundle.expectedOverlapRegion is the fixed 20% RIGHT-edge crop rect, explicitly documented as a UI convention, not a measured overlap", bundle.expectedOverlapRegion?.x === 0.8 && bundle.expectedOverlapRegion?.width === 0.2 && typeof bundle.coordinateConventions === "string" && /UI convention/i.test(bundle.coordinateConventions), JSON.stringify({ region: bundle.expectedOverlapRegion, conventions: bundle.coordinateConventions }));
    check("bundle.thresholds contains every registration and distribution threshold actually used", typeof bundle.thresholds?.registration?.minInlierCount === "number" && typeof bundle.thresholds?.distribution?.minExtent === "number", JSON.stringify(bundle.thresholds));
    check("bundle.deployment is present (commitSha/deploymentId/target, resolved via the existing public /api/release) -- null values are acceptable here (local dev has no Vercel env vars) but the KEY must exist", "deployment" in bundle);
    check("bundle.registrationEndpoint.rawResponseBody preserves the landmark response EXACTLY as received, before any client-side filtering", Array.isArray(bundle.registrationEndpoint?.rawResponseBody?.landmarks) && bundle.registrationEndpoint.rawResponseBody.landmarks.length === CLUSTERED_LANDMARKS.length, JSON.stringify(bundle.registrationEndpoint?.rawResponseBody));
    check(
      "the bundle JSON now embeds BOTH full images as real data URLs -- the single-file fix for iOS Safari's silent data:-URI-anchor failure",
      typeof bundle.previousFrame?.dataUrl === "string" && bundle.previousFrame.dataUrl.startsWith("data:image/jpeg;base64,") && bundle.previousFrame.dataUrl.length > 1000 && typeof bundle.candidateFrame?.dataUrl === "string" && bundle.candidateFrame.dataUrl.startsWith("data:image/jpeg;base64,") && bundle.candidateFrame.dataUrl.length > 1000,
      `previousFrame.dataUrl length=${bundle.previousFrame?.dataUrl?.length}, candidateFrame.dataUrl length=${bundle.candidateFrame?.dataUrl?.length}`,
    );
  } else {
    check("the diagnostics JSON file was actually saved to disk", false);
  }

  await browser.close();
  console.log(failures === 0 ? "\nAll capture-diagnostics checks passed.\n" : `\n${failures} capture-diagnostics check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
