import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/**
 * OUT-OF-RANGE LANDMARK FIX VERIFICATION (real-phone diagnostic, 21 Sep
 * 2026): a real rejected capture's downloaded diagnostics bundle showed
 * usedCorrespondences like {x: 997, y: 437} -- nowhere near the [0,1] space
 * frameRegistrationAiGateway.ts's prompt and JSON schema both require.
 * isFiniteLocalPointV1 (RouteAssistGuidedContinuationPreviewClient.tsx)
 * previously only checked "is a finite number," so those out-of-range
 * points passed straight through and got misdiagnosed by
 * correspondenceDistribution.ts's clamping bin math as "concentrated in a
 * single region" -- reproduced by hand against the real captured JSON in
 * scripts/_scratch-verify-real-diagnostic.ts (deleted after use, not part
 * of this suite) before the fix landed.
 *
 * This drives the REAL landmark payload from that real rejected attempt
 * through the REAL rendered app (stubbed camera + registration-interpret
 * response) and confirms:
 *  - the raw response is still preserved exactly (rawResponseBody keeps
 *    all 8 out-of-range landmarks, untouched -- this fix is a CONSUMPTION
 *    guard, not a response mutation)
 *  - usedCorrespondences is now empty (every out-of-range point dropped)
 *  - the rejection reason is the HONEST "not enough matched landmarks",
 *    never the false "concentrated in a single region" diagnosis
 *  - the on-screen homeowner message changes accordingly (an observable,
 *    real behavior change, not just an internal reason string)
 *
 * Run: npx tsx scripts/verify-route-assist-out-of-range-landmarks-browser.ts --base http://localhost:3000
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

// The EXACT rawResponseBody.landmarks from the real downloaded diagnostic
// bundle (route-assist-diagnostic-2026-09-21T18-05-44-790Z.json), pasted
// verbatim by the user from an actual rejected phone capture. NOT
// synthetic or representative data.
const REAL_OUT_OF_RANGE_LANDMARKS = [
  { kind: "CORNER", fromPoint: { x: 482, y: 578 }, toPoint: { x: 339, y: 516 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 435, y: 361 }, toPoint: { x: 252, y: 242 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 997, y: 437 }, toPoint: { x: 262, y: 427 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 999, y: 313 }, toPoint: { x: 262, y: 305 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 782, y: 313 }, toPoint: { x: 4, y: 303 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 781, y: 441 }, toPoint: { x: 4, y: 431 }, confidence: 0.95 },
  { kind: "CORNER", fromPoint: { x: 659, y: 535 }, toPoint: { x: 341, y: 535 }, confidence: 0.9 },
  { kind: "CORNER", fromPoint: { x: 658, y: 662 }, toPoint: { x: 341, y: 668 }, confidence: 0.9 },
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

  console.log("\n2. Force the REAL out-of-range landmark response from the actual rejected phone capture, then capture");
  await page.evaluate((landmarks) => window.__setRegistrationResponse({ landmarks }), REAL_OUT_OF_RANGE_LANDMARKS);
  await page.click('[data-testid="route-assist-alignment-shutter"]');
  await page.waitForSelector('[data-testid="route-assist-capture-notice"]', { timeout: 5000 });
  const notice = await page.locator('[data-testid="route-assist-capture-notice"]').innerText().catch(() => "");
  check(
    "the on-screen notice is now the HONEST 'not enough shared detail' message, not the misleading 'didn't line up' one",
    /couldn.?t find enough shared detail/i.test(notice),
    notice,
  );
  check(
    "the on-screen notice is NOT the previous misdiagnosis ('didn't line up')",
    !/didn.?t line up/i.test(notice),
    notice,
  );
  await page.waitForSelector('[data-testid="route-assist-download-diagnostics"]', { timeout: 3000 });

  console.log("\n3. Download diagnostics and inspect the bundle");
  const downloads: import("playwright").Download[] = [];
  page.on("download", (d) => downloads.push(d));
  await page.click('[data-testid="route-assist-download-diagnostics"]');
  await page.waitForTimeout(1000);
  check("exactly 3 distinct download events were observed", downloads.length === 3, `count=${downloads.length}`);

  const jsonDownload = downloads.find((d) => d.suggestedFilename().endsWith(".json"));
  const jsonPath = jsonDownload ? await jsonDownload.path() : null;
  if (jsonPath) {
    const bundle = JSON.parse(readFileSync(jsonPath, "utf8"));
    check(
      "rawResponseBody.landmarks still preserves all 8 real out-of-range landmarks EXACTLY as received -- this fix guards consumption, not the raw record",
      Array.isArray(bundle.registrationEndpoint?.rawResponseBody?.landmarks) && bundle.registrationEndpoint.rawResponseBody.landmarks.length === 8,
      JSON.stringify(bundle.registrationEndpoint?.rawResponseBody?.landmarks?.length),
    );
    check(
      "the raw landmark values in the preserved response are still the real out-of-range pixel-scale numbers (e.g. x > 1), confirming nothing upstream silently rescaled them",
      bundle.registrationEndpoint?.rawResponseBody?.landmarks?.[2]?.fromPoint?.x === 997,
      JSON.stringify(bundle.registrationEndpoint?.rawResponseBody?.landmarks?.[2]),
    );
    check(
      "usedCorrespondences is now EMPTY -- every out-of-[0,1]-range landmark was dropped before reaching registerFrameV1",
      Array.isArray(bundle.usedCorrespondences) && bundle.usedCorrespondences.length === 0,
      JSON.stringify(bundle.usedCorrespondences),
    );
    check(
      "registrationResult.reason is the HONEST 'not enough matched landmarks', never the false 'concentrated in a single region' diagnosis",
      bundle.registrationResult?.reason === "not enough matched landmarks to attempt registration",
      bundle.registrationResult?.reason,
    );
    check("registrationResult.candidateCount is 0 (all 8 real landmarks were out of contract)", bundle.registrationResult?.candidateCount === 0, String(bundle.registrationResult?.candidateCount));
    check("failureCategory is still GEOMETRIC_REJECTION (the AI call itself succeeded structurally)", bundle.failureCategory === "GEOMETRIC_REJECTION", bundle.failureCategory);
    check(
      "homeownerFacingMessage recorded in the bundle matches the honest on-screen notice",
      /couldn.?t find enough shared detail/i.test(bundle.homeownerFacingMessage ?? ""),
      bundle.homeownerFacingMessage,
    );
  } else {
    check("the diagnostics JSON file was actually saved to disk", false);
  }

  await browser.close();
  console.log(failures === 0 ? "\nAll out-of-range-landmark fix checks passed.\n" : `\n${failures} out-of-range-landmark fix check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
