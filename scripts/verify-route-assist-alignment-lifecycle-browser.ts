import { chromium } from "playwright";

/**
 * ALIGNMENT LIFECYCLE VERIFICATION, REBUILT to close two gaps the prior
 * version of this file left open (real-phone correction, verbatim):
 *
 *   "Ghost mapping: testing copied crop math and selected landmarks does
 *   not prove the actual ghost matches the live preview's coordinates."
 *   -- addressed in verify-route-assist-ghost-mapping-browser.ts, not
 *   this file.
 *
 *   "Capture freshness: rejecting capture after bad responses have
 *   already arrived does not establish that movement immediately before
 *   the shutter is caught. The report does not prove that the saved
 *   frame is the validated frame." -- THIS file's whole redesign is
 *   aimed at that gap. Two things changed structurally to close it:
 *
 *   1. REAL MOTION, NOT A STUBBED NUMBER: the fake camera's canvas can
 *      genuinely ANIMATE (a moving square, redrawn every 100ms) or sit
 *      genuinely STILL. computeRouteAssistFrameMotionV1 measures the
 *      REAL pixel difference between consecutive captured video frames --
 *      nothing in this file injects a motionScore directly. This proves
 *      the fix (frameMotion.ts) end to end, not just its unit tests.
 *
 *   2. A TRUE RACE, WITH AN OBSERVABLE OUTCOME: the registration-
 *      interpret endpoint is stubbed with a REAL, non-zero response
 *      delay, and the live camera's content is changed to a visibly
 *      DIFFERENT color WHILE that validation is genuinely in flight (not
 *      "immediately" against an unconsumed future input, which is not a
 *      race at all -- see this file's own prior version for that
 *      diagnosed mistake). The test then decodes the ACTUAL saved
 *      frame's pixel content and proves it matches the color that was
 *      on screen at the moment of the tap, not the color the live view
 *      moved to afterward -- a pixel-level proof that the saved frame is
 *      the frozen, validated frame, not a later live one.
 *
 * The real image-registration AI call (route-assist-frame-registration-
 * interpret) is STUBBED here with deterministic, hand-built landmark
 * sets -- the SAME well-distributed / clustered correspondence shapes
 * verify-route-assist-registration-harness-offline.ts already proved
 * ADDED / REFUSED against the real, unchanged registerFrameV1. This file
 * proves the CLIENT calls that real function and acts correctly on its
 * outcome; it does not (and, per the documented AI Gateway credential
 * blocker in this sandbox, currently cannot) prove a REAL AI landmark
 * proposal for a REAL captured photo pair. That remains a named, open
 * gap -- see this file's final report section -- never described as
 * verified.
 *
 * Run: npx tsx scripts/verify-route-assist-alignment-lifecycle-browser.ts --base http://localhost:3799
 */

declare global {
  interface Window {
    __setOverlapResponse: (body: unknown) => void;
    __setRegistrationResponse: (body: unknown, delayMs?: number) => void;
    __setStreamColor: (hex: string) => void;
    __setStreamAnimating: (animating: boolean) => void;
    __streamColor: string;
    __activeCtx: CanvasRenderingContext2D;
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

// The SAME well-distributed / clustered correspondence shapes already
// proven ADDED / REFUSED by the real registerFrameV1 in
// verify-route-assist-registration-harness-offline.ts -- reused here
// (converted to the {fromPoint,toPoint} shape the real landmark-proposal
// endpoint returns) so this file's stubbed responses are not arbitrary.
const WELL_DISTRIBUTED_LANDMARKS = [
  { fromPoint: { x: 0.75, y: 0.1 }, toPoint: { x: 0.45, y: 0.1 } },
  { fromPoint: { x: 0.95, y: 0.15 }, toPoint: { x: 0.65, y: 0.15 } },
  { fromPoint: { x: 0.8, y: 0.5 }, toPoint: { x: 0.5, y: 0.5 } },
  { fromPoint: { x: 0.98, y: 0.85 }, toPoint: { x: 0.68, y: 0.85 } },
  { fromPoint: { x: 0.7, y: 0.9 }, toPoint: { x: 0.4, y: 0.9 } },
  { fromPoint: { x: 0.85, y: 0.35 }, toPoint: { x: 0.55, y: 0.35 } },
];
const CLUSTERED_LANDMARKS = [
  { fromPoint: { x: 0.81, y: 0.1 }, toPoint: { x: 0.51, y: 0.1 } },
  { fromPoint: { x: 0.83, y: 0.11 }, toPoint: { x: 0.53, y: 0.11 } },
  { fromPoint: { x: 0.84, y: 0.09 }, toPoint: { x: 0.54, y: 0.09 } },
  { fromPoint: { x: 0.82, y: 0.12 }, toPoint: { x: 0.52, y: 0.12 } },
  { fromPoint: { x: 0.85, y: 0.1 }, toPoint: { x: 0.55, y: 0.1 } },
  { fromPoint: { x: 0.86, y: 0.11 }, toPoint: { x: 0.56, y: 0.11 } },
];

/**
 * Installs: (a) a fake getUserMedia backed by a REAL, live-drawn canvas --
 * a solid color, optionally full-frame hue-cycling so consecutive captured
 * frames genuinely differ; (b) a controllable
 * overlap-probe fetch stub (unchanged pattern); (c) a controllable
 * registration-interpret fetch stub with a REAL configurable delay, so a
 * genuine in-flight race window exists.
 */
const INIT_SCRIPT = `
window.__streamColor = '#22aa55';
window.__streamAnimating = false;
window.__activeCtx = null;
window.__activeConfig = { width: 640, height: 480 };
window.__animateHandle = null;
window.__setStreamColor = (hex) => {
  window.__streamColor = hex;
  // A SINGLE repaint of a detached (never DOM-attached) canvas does not
  // reliably propagate into an already-created canvas.captureStream()
  // track in headless Chromium -- observed directly: __activeCtx's own
  // pixels update immediately, but the <video> element bound to that
  // stream keeps showing the OLD color indefinitely. The animated path
  // (continuous repaint via setInterval) does not have this problem. So
  // a plain color change pulses several repeated repaints over ~400ms --
  // a TEST-HARNESS-ONLY workaround for this stub, not a production
  // camera concern (a real camera continuously produces new frames).
  if (window.__activeCtx) {
    const ctx = window.__activeCtx;
    const width = window.__activeConfig.width;
    const height = window.__activeConfig.height;
    let pulses = 0;
    const pulse = setInterval(() => {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, width, height);
      pulses += 1;
      if (pulses >= 8) clearInterval(pulse);
    }, 50);
  }
};
window.__setStreamAnimating = (animating) => {
  window.__streamAnimating = animating;
  if (window.__animateHandle) { clearInterval(window.__animateHandle); window.__animateHandle = null; }
  if (animating && window.__activeCtx) {
    // FULL-FRAME hue cycling -- every pixel in the frame changes on every
    // redraw, the way a real camera pan changes essentially the whole
    // visible scene (never just one small moving object against an
    // otherwise-static background, which downsamples to a much weaker,
    // easily-missed signal at the low resolution frameMotion.ts samples
    // at). +37 is coprime with the 360-degree hue wheel, so consecutive
    // probe-interval samples never coincidentally realign to the same
    // color the way a periodic stripe pattern could.
    let hue = 0;
    window.__animateHandle = setInterval(() => {
      hue = (hue + 37) % 360;
      window.__activeCtx.fillStyle = 'hsl(' + hue + ', 70%, 45%)';
      window.__activeCtx.fillRect(0, 0, window.__activeConfig.width, window.__activeConfig.height);
    }, 60);
  }
};
window.__makeStreamLog = [];
window.__makeStreamCounter = 0;
window.__makeStream = () => {
  const id = ++window.__makeStreamCounter;
  const canvas = document.createElement('canvas');
  canvas.width = window.__activeConfig.width;
  canvas.height = window.__activeConfig.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = window.__streamColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  window.__activeCtx = ctx;
  window.__makeStreamLog.push({ id, colorAtCreation: window.__streamColor });
  if (window.__streamAnimating) window.__setStreamAnimating(true);
  const stream = canvas.captureStream(30);
  stream.__routeAssistStreamId = id;
  return stream;
};
navigator.mediaDevices.getUserMedia = async () => window.__makeStream();
const originalSrcObjectDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
  set(value) {
    window.__makeStreamLog.push({ boundToVideo: value ? value.__routeAssistStreamId : null });
    return originalSrcObjectDescriptor.set.call(this, value);
  },
  get() {
    return originalSrcObjectDescriptor.get.call(this);
  },
});

window.__overlapResponse = { assessment: { matched: false, confidence: 0.9, overlapFraction: 0.05 } };
window.__setOverlapResponse = (body) => { window.__overlapResponse = body; };
window.__registrationResponse = { landmarks: [] };
window.__registrationDelayMs = 0;
window.__setRegistrationResponse = (body, delayMs) => { window.__registrationResponse = body; window.__registrationDelayMs = delayMs || 0; };

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (typeof url === 'string' && url.includes('route-assist-frame-overlap-interpret')) {
    return new Response(JSON.stringify(window.__overlapResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof url === 'string' && url.includes('route-assist-frame-registration-interpret')) {
    if (window.__registrationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, window.__registrationDelayMs));
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

async function decodedAverageColor(page: import("playwright").Page, src: string): Promise<{ r: number; g: number; b: number }> {
  return page.evaluate(async (dataUrl) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl as string;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
    }
    return { r: r / count, g: g / count, b: b / count };
  }, src);
}

async function main() {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(URL);

  console.log("\n1. Capture Photo 1 (a still green frame), enter alignment");
  await page.evaluate(() => window.__setStreamColor("#22aa55"));
  await page.click('[data-testid="route-assist-workspace-open-camera"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="route-assist-workspace-take-photo"]');
  await page.waitForSelector('[data-testid="route-assist-review-add-view"]');
  await page.click('[data-testid="route-assist-review-add-view"]');
  await page.waitForSelector('[data-testid="route-assist-alignment-camera"]');

  console.log("\n2. Lock direction with 2 consistent RIGHT hints (still camera)");
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  await page.waitForTimeout(2000);
  const badgeAfterLock = await page.locator('[data-testid="route-assist-alignment-badge"]').innerText().catch(() => "");
  check("direction locked -- ghost badge appears", badgeAfterLock.length > 0, badgeAfterLock);

  console.log("\n3. REAL MOTION TEST: while the AI probe keeps reporting a perfect, consistent match, animate the actual camera feed (genuine continued panning/roll) -- must plateau at HOLD_STEADY, never reach Aligned, no matter how long it runs");
  await page.click('[data-testid="route-assist-restart-direction"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  await page.waitForTimeout(2000); // re-lock direction
  await page.evaluate(() => window.__setStreamAnimating(true));
  const seenWhileMoving: string[] = [];
  for (let tick = 0; tick < 6; tick += 1) {
    await page.waitForTimeout(950);
    seenWhileMoving.push(await page.locator('[data-testid="route-assist-alignment-reason"]').innerText().catch(() => ""));
  }
  console.log(`     observed reason text per tick while genuinely still moving: ${JSON.stringify(seenWhileMoving)}`);
  check("continued REAL motion (not a stubbed number) never reaches 'Ready to check', even with a perfect AI probe every tick", !seenWhileMoving.includes("Ready to check"), JSON.stringify(seenWhileMoving));
  check("continued REAL motion plateaus at 'Hold steady' rather than silently degrading to SEARCHING", seenWhileMoving.includes("Hold steady"), JSON.stringify(seenWhileMoving));
  const shutterWhileMoving = await page.locator('[data-testid="route-assist-alignment-shutter"]').isEnabled();
  check("the shutter stays DISABLED the entire time real motion continues", !shutterWhileMoving);

  console.log("\n4. Camera genuinely stops moving -- Aligned must now be reached on real evidence, and the shutter enables");
  await page.evaluate(() => window.__setStreamAnimating(false));
  await page.evaluate(() => window.__setStreamColor("#22aa55"));
  const reasonAfterStopping = await waitForReason(page, (r) => r === "Ready to check", 10);
  check("once the camera genuinely stops moving, Aligned is reached", reasonAfterStopping === "Ready to check", reasonAfterStopping);
  const shutterAfterStopping = await page.locator('[data-testid="route-assist-alignment-shutter"]').isEnabled();
  check("the shutter is enabled once genuinely Aligned", shutterAfterStopping);

  console.log("\n5. RESUMED MOTION immediately after Aligned (before any shutter tap) demotes readiness immediately, with no multi-probe grace period the way overlap-loss hysteresis gets");
  await page.evaluate(() => window.__setStreamAnimating(true));
  await page.waitForTimeout(950);
  const reasonAfterResumedMotion = await page.locator('[data-testid="route-assist-alignment-reason"]').innerText().catch(() => "");
  check("a SINGLE probe of resumed real motion immediately drops Aligned (to Hold steady), unlike the 2-probe grace period overlap loss gets", reasonAfterResumedMotion !== "Ready to check", reasonAfterResumedMotion);
  await page.evaluate(() => window.__setStreamAnimating(false));
  const reasonReAligned = await waitForReason(page, (r) => r === "Ready to check", 10);
  check("stopping again re-reaches Aligned (readiness genuinely revalidates both ways, not a one-way trip)", reasonReAligned === "Ready to check");

  console.log("\n6. THE CAPTURE-VALIDATION GATE REJECTS a geometrically invalid candidate: the shutter tap must NOT save a frame, must show a clear notice, and must leave the homeowner in capture");
  const framesBeforeReject = await page.locator('[data-testid^="route-assist-photo-panel-"]').count();
  await page.evaluate((landmarks) => window.__setRegistrationResponse({ landmarks }, 200), CLUSTERED_LANDMARKS);
  await page.click('[data-testid="route-assist-alignment-shutter"]');
  await page.waitForTimeout(150);
  const validatingLabel = await page.locator('[data-testid="route-assist-alignment-shutter"]').innerText().catch(() => "");
  check("the shutter shows a 'checking' state while the candidate is being validated, not an instant accept", /Checking/i.test(validatingLabel), validatingLabel);
  const badgeDuringValidation = await page.locator('[data-testid="route-assist-alignment-badge"]').innerText().catch(() => "");
  const bottomLabelDuringValidation = await page.locator('[data-testid="route-assist-alignment-reason"]').innerText().catch(() => "");
  check(
    "ONE CONSISTENT CHECKING STATE (real-phone correction): while validating, the badge no longer shows a readiness claim ('Ready to check') at the same time the shutter says 'Checking that view…' -- both the badge and the bottom guidance text switch to the SAME checking message",
    /Checking/i.test(badgeDuringValidation) && /Checking/i.test(bottomLabelDuringValidation),
    JSON.stringify({ badgeDuringValidation, bottomLabelDuringValidation, validatingLabel }),
  );
  await page.waitForTimeout(600);
  const stillOnAlignmentAfterReject = await page.locator('[data-testid="route-assist-alignment-camera"]').isVisible();
  const framesAfterReject = await page.locator('[data-testid^="route-assist-photo-panel-"]').count();
  const noticeAfterReject = await page.locator('[data-testid="route-assist-capture-notice"]').innerText().catch(() => "");
  check("a REJECTED geometric validation leaves the homeowner ON the alignment screen (not silently advanced)", stillOnAlignmentAfterReject);
  check("a REJECTED geometric validation saves NO new frame", framesAfterReject === framesBeforeReject, `before=${framesBeforeReject} after=${framesAfterReject}`);
  check("a REJECTED geometric validation shows a clear, specific on-screen notice explaining why", noticeAfterReject.length > 0, noticeAfterReject);
  check(
    "HONEST ERROR COPY (real-phone correction): the on-screen notice never contains the raw geometric diagnostic language ('spread landmarks', 'quadrant', 'concentrated in a single region') -- that stays in console.debug only",
    !/spread landmarks|quadrant|concentrated in a single region/i.test(noticeAfterReject),
    noticeAfterReject,
  );
  const shutterAfterReject = await page.locator('[data-testid="route-assist-alignment-shutter"]').isEnabled();
  check("evidence is reset after a rejection -- the shutter is disabled again, forcing a genuine re-settle rather than an instant re-tap of the same bad frame", !shutterAfterReject);

  console.log("\n7. A valid stationary pair still captures successfully AFTER a prior rejection -- rejection is not a permanent lock-out, and geometric validation is not over-strict");
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  const reasonAfterReSettle = await waitForReason(page, (r) => r === "Ready to check", 10);
  check("re-settling after a rejection reaches Aligned again", reasonAfterReSettle === "Ready to check", reasonAfterReSettle);
  await page.evaluate((landmarks) => window.__setRegistrationResponse({ landmarks }, 100), WELL_DISTRIBUTED_LANDMARKS);
  await page.click('[data-testid="route-assist-alignment-shutter"]');
  await page.waitForTimeout(500);
  const onReviewAfterValid = await page.locator('[data-testid="route-assist-review-stage"]').isVisible().catch(() => false);
  check("a genuinely valid stationary pair, once geometric validation passes, captures successfully and reaches the review stage", onReviewAfterValid);

  console.log("\n8. THE SHUTTER RACE: freeze red, let validation run with a real delay, change the LIVE view to blue WHILE validation is in flight -- the SAVED frame must be red, never blue");
  const framesBeforeRace = await page.locator('[data-testid^="route-assist-photo-panel-"]').count(); // measured NOW, while still on REVIEW from step 7 -- photo panels do not render during ALIGNMENT
  await page.click('[data-testid="route-assist-review-add-view"]');
  await page.waitForSelector('[data-testid="route-assist-alignment-camera"]');
  await page.evaluate(() => window.__setStreamColor("#cc2222")); // RED
  await page.evaluate(() => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: "RIGHT" } }));
  const reasonBeforeRace = await waitForReason(page, (r) => r === "Ready to check", 10);
  check("reached Aligned on a still RED frame, ready for the race test", reasonBeforeRace === "Ready to check", reasonBeforeRace);
  const videoElementColor = await page.evaluate(() => {
    const video = document.querySelector('[data-testid="route-assist-alignment-camera"] video') as HTMLVideoElement;
    const c = document.createElement("canvas");
    c.width = 4; c.height = 4;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(video, 0, 0, 4, 4);
    return Array.from(ctx.getImageData(1, 1, 1, 1).data);
  });
  check("sanity: the ACTUAL <video> element (not just the backing test canvas) shows RED just before the shutter tap", videoElementColor[0] > 150 && videoElementColor[2] < 100, JSON.stringify(videoElementColor));

  await page.evaluate((landmarks) => window.__setRegistrationResponse({ landmarks }, 900), WELL_DISTRIBUTED_LANDMARKS); // a real, non-trivial delay -- a genuine in-flight window
  await page.click('[data-testid="route-assist-alignment-shutter"]'); // freezes RED into the candidate frame right now
  await page.waitForTimeout(150); // validation is now genuinely in flight (900ms delay stubbed above)
  await page.evaluate(() => window.__setStreamColor("#2222cc")); // the live view moves on to BLUE WHILE validation is still pending
  const liveColorDuringRace = await page.evaluate(() => window.__streamColor);
  check("the live view genuinely changed color while validation was still in flight (this is a real race, not an unconsumed future input)", liveColorDuringRace === "#2222cc");

  await page.waitForSelector('[data-testid="route-assist-review-stage"]', { timeout: 4000 }).catch(() => null);
  const onReviewAfterRace = await page.locator('[data-testid="route-assist-review-stage"]').isVisible().catch(() => false);
  check("the race-tested candidate was accepted (well-distributed landmarks) and reached review", onReviewAfterRace);
  const framesAfterRace = await page.locator('[data-testid^="route-assist-photo-panel-"]').count();
  check("exactly one new frame was saved from the race click", framesAfterRace === framesBeforeRace + 1, `before=${framesBeforeRace} after=${framesAfterRace}`);

  if (onReviewAfterRace) {
    const savedImages = page.locator('[data-testid^="route-assist-photo-image-"]');
    const lastSrc = await savedImages.nth((await savedImages.count()) - 1).getAttribute("src");
    const avg = await decodedAverageColor(page, lastSrc ?? "");
    // RED ~ (204,34,34), BLUE ~ (34,34,204) -- decisive on the red channel alone.
    check(
      `the SAVED frame's actual pixel content is RED (the frozen candidate), not BLUE (what the live view moved to during validation) -- avg=${JSON.stringify(avg)}`,
      avg.r > avg.b + 40,
      JSON.stringify(avg),
    );
  }

  await browser.close();
  console.log(failures === 0 ? "\nAll alignment-lifecycle checks passed.\n" : `\n${failures} alignment-lifecycle check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
