import { chromium } from "playwright";

/**
 * CLASSICAL-CV REGISTRATION, END-TO-END, NO OVERRIDE (real-phone
 * architecture change, 22 Sep 2026): drives the REAL rendered app with
 * the REAL OpenCV.js ORB feature-matching pipeline running -- never sets
 * window.__routeAssistFeatureMatchOverrideV1. Two scenarios:
 *
 *  1. A genuinely overlapping pair (the same rich textured scene, panned
 *     by a real pixel offset between photo 1 and the candidate) must
 *     REGISTER -- proving real ORB matches on real image content survive
 *     registerFrameV1's own distribution + RANSAC gates and a frame
 *     actually gets saved.
 *  2. A genuinely non-overlapping pair (two unrelated random-noise
 *     scenes, sharing no real feature) must be REJECTED -- proving the
 *     pipeline doesn't fabricate a pass when there's nothing to match.
 *
 * Together these are the load-bearing proof for the whole architecture
 * change: not "does OpenCV.js's ORB implementation work" (already proven
 * separately against a controlled synthetic translation before this
 * integration existed) but "does swapping it in for the AI-landmark step,
 * wired through this exact client, actually let a real capture succeed
 * and a real non-overlap actually get rejected."
 *
 * Run: npx tsx scripts/verify-route-assist-classical-cv-registration-browser.ts --base http://localhost:3000
 */

declare global {
  interface Window {
    __setOverlapResponse: (body: unknown) => void;
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

const INIT_SCRIPT = `
window.__sceneOffsetX = 0;
window.__sceneMode = 'textured';
window.__activeCtx = null;
window.__activeConfig = { width: 480, height: 640 };

// UNIQUE, NON-REPEATING TEXTURE, NOT A CHECKERBOARD (real-phone test-
// design correction, 22 Sep 2026): a checkerboard is the canonical
// pathological case for feature matching -- every corner is visually
// identical to every other corner, so roughly half of ORB's real matches
// are genuinely ambiguous (correctly indistinguishable, not a bug), which
// pulled a real registration attempt's inlier ratio below threshold on
// this exact scene. A seeded field of randomly placed, randomly colored,
// randomly sized blobs spanning a WIDE virtual area (so a real pixel
// shift still leaves plenty of overlap) gives each region genuinely
// unique local content -- closer to a real photo's actual variety, and
// disambiguates ORB's matches the way a checkerboard structurally cannot.
function drawTexturedScene(ctx, w, h, offsetX) {
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, w, h);
  let state = 424242;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#f39c12'];
  for (let i = 0; i < 140; i++) {
    const x = rand() * (w + 240) - 120;
    const y = rand() * h;
    const r = 6 + rand() * 16;
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.arc(x + offsetX, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNoiseScene(ctx, w, h, seed) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = 'rgb(' + Math.floor(rand() * 255) + ',' + Math.floor(rand() * 255) + ',' + Math.floor(rand() * 255) + ')';
    ctx.fillRect(rand() * w, rand() * h, 3, 3);
  }
}

window.__redraw = () => {
  if (!window.__activeCtx) return;
  const { width, height } = window.__activeConfig;
  if (window.__sceneMode === 'textured') {
    drawTexturedScene(window.__activeCtx, width, height, window.__sceneOffsetX);
  } else {
    drawNoiseScene(window.__activeCtx, width, height, window.__sceneMode === 'noiseA' ? 12345 : 99991);
  }
};

window.__setSceneOffsetV1 = (x) => { window.__sceneOffsetX = x; window.__redraw(); };
window.__setSceneModeV1 = (mode) => { window.__sceneMode = mode; window.__redraw(); };

window.__makeStream = () => {
  const canvas = document.createElement('canvas');
  canvas.width = window.__activeConfig.width;
  canvas.height = window.__activeConfig.height;
  const ctx = canvas.getContext('2d');
  window.__activeCtx = ctx;
  window.__redraw();
  return canvas.captureStream(10);
};
navigator.mediaDevices.getUserMedia = async () => window.__makeStream();

window.__overlapResponse = { assessment: { matched: false, confidence: 0.9, overlapFraction: 0.05 } };
window.__setOverlapResponse = (body) => { window.__overlapResponse = body; };

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (typeof url === 'string' && url.includes('route-assist-frame-overlap-interpret')) {
    return new Response(JSON.stringify(window.__overlapResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof url === 'string' && url.includes('route-assist-frame-registration-interpret')) {
    throw new Error('TEST FAILURE: the AI landmark endpoint was called -- classical-CV registration should never hit this route');
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

async function reachAlignedAndCapture(page: import("playwright").Page) {
  await page.click('[data-testid="route-assist-workspace-open-camera"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="route-assist-workspace-take-photo"]');
  await page.waitForSelector('[data-testid="route-assist-review-add-view"]');
  await page.click('[data-testid="route-assist-review-add-view"]');
  await page.waitForSelector('[data-testid="route-assist-alignment-camera"]');
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  const reasonReady = await waitForReason(page, (r) => r === "Ready to check", 10);
  return reasonReady;
}

async function main() {
  const browser = await chromium.launch();

  console.log("\n=== Scenario 1: real overlapping pair (panned texture) -- must REGISTER via real ORB matches ===");
  {
    const context = await browser.newContext({ permissions: ["camera"], acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      failures++;
      console.error(`  FAIL — uncaught page error: ${error.message}`);
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(URL);

    await page.evaluate(() => {
      (window as any).__setSceneModeV1("textured");
      (window as any).__setSceneOffsetV1(0);
    });
    const reasonReady = await reachAlignedAndCapture(page);
    check("reached Ready to check on the textured scene", reasonReady === "Ready to check", reasonReady);

    // Simulate a real rightward pan: the candidate photo shows the SAME
    // scene shifted left on screen (camera panned right), a real,
    // recoverable translation for ORB to find.
    await page.evaluate(() => (window as any).__setSceneOffsetV1(-60));
    await page.waitForTimeout(200);

    const shutter = page.locator('[data-testid="route-assist-alignment-shutter"]');
    await shutter.click();
    await page.waitForTimeout(4000); // real ORB matching + WASM load takes real time, unlike the instant mocked response

    const reachedReview = await page.locator('[data-testid="route-assist-review-add-view"]').count();
    const notice = await page.locator('[data-testid="route-assist-capture-notice"]').innerText().catch(() => "");
    const passed = reachedReview > 0 && notice === "";
    check(
      "a real overlapping pair actually REGISTERS -- reaches the review stage, no rejection notice",
      passed,
      `reachedReview=${reachedReview}, notice="${notice}"`,
    );

    if (!passed) {
      const downloadBtn = page.locator('[data-testid="route-assist-download-diagnostics"]');
      if (await downloadBtn.count()) {
        const downloads: import("playwright").Download[] = [];
        page.on("download", (d) => downloads.push(d));
        await downloadBtn.click();
        await page.waitForTimeout(500);
        const jsonDownload = downloads.find((d) => d.suggestedFilename().endsWith(".json"));
        const jsonPath = jsonDownload ? await jsonDownload.path() : null;
        if (jsonPath) {
          const { readFileSync } = await import("node:fs");
          const bundle = JSON.parse(readFileSync(jsonPath, "utf8"));
          console.log("     real rejection diagnostics:", JSON.stringify({
            failureCategory: bundle.failureCategory,
            featureMatching: bundle.featureMatching,
            usedCorrespondencesCount: bundle.usedCorrespondences?.length,
            usedCorrespondences: bundle.usedCorrespondences,
            distributionEvaluation: bundle.distributionEvaluation,
            registrationResult: bundle.registrationResult,
          }, null, 2));
        }
      }
    }

    await context.close();
  }

  console.log("\n=== Scenario 2: real non-overlapping pair (unrelated noise) -- must be REJECTED, not fabricated ===");
  {
    const context = await browser.newContext({ permissions: ["camera"], acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      failures++;
      console.error(`  FAIL — uncaught page error: ${error.message}`);
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(URL);

    await page.evaluate(() => (window as any).__setSceneModeV1("noiseA"));
    const reasonReady = await reachAlignedAndCapture(page);
    check("reached Ready to check on the first noise scene", reasonReady === "Ready to check", reasonReady);

    await page.evaluate(() => (window as any).__setSceneModeV1("noiseB")); // a totally unrelated scene, zero true correspondence
    await page.waitForTimeout(200);

    await page.click('[data-testid="route-assist-alignment-shutter"]');
    await page.waitForTimeout(4000);

    const notice = await page.locator('[data-testid="route-assist-capture-notice"]').innerText().catch(() => "");
    check("a real non-overlapping pair is honestly REJECTED with an on-screen notice, not silently accepted", notice.length > 0, notice);

    await context.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nAll classical-CV registration checks passed.\n" : `\n${failures} classical-CV registration check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
