import { chromium } from "playwright";

/**
 * GHOST-COORDINATE VERIFICATION, REBUILT to exercise the PRODUCTION render
 * path (real-phone correction: "testing copied crop math and selected
 * landmarks does not prove the actual ghost matches the live preview's
 * coordinates"). The PRIOR version of this file replicated
 * cropRouteAssistGhostStripV1's drawImage call verbatim inside a
 * page.evaluate sandbox -- proving the FORMULA was internally consistent,
 * never that the ACTUAL, WIRED, running component produces that same
 * output when a real user captures a real Photo 1 and locks a real
 * direction.
 *
 * This version drives the ACTUAL dev-fixture client end to end against a
 * real (headless) Next.js dev server: it captures a REAL Photo 1 from a
 * stubbed camera whose canvas carries a distinctly colored landmark at a
 * KNOWN position, locks a REAL direction via the stubbed overlap-probe
 * fetch, waits for the REAL ghost-strip <img> element
 * (route-assist-ghost-edge-strip) that RouteAssistGhostAlignmentCameraV1
 * actually renders, and reads its ACTUAL src attribute -- the exact data
 * URL cropRouteAssistGhostStripV1 produced in production -- decoding it
 * with a canvas and checking the landmark lands at its expected
 * crop-local pixel position. No formula is replicated anywhere in this
 * file; the crop is exercised, not re-derived.
 *
 * All four directions are covered (RIGHT/LEFT on an 800x600 landscape
 * Photo 1, UP/DOWN on a 600x800 portrait Photo 1), each with an INSIDE
 * landmark (must appear in the crop) and an OUTSIDE landmark (must be
 * completely absent). The live alignment camera is given a DELIBERATELY
 * DIFFERENT resolution/aspect ratio (500x500) than Photo 1's own capture
 * resolution for every case -- proving the real rendered <img
 * object-fit:cover> band sizes correctly and the ghost strip's own
 * decoded pixel content is unaffected by the live view's resolution,
 * without needing the live camera to depict anything in particular.
 *
 * Run (server must already be running): npx tsx scripts/verify-route-assist-ghost-mapping-browser.ts --base http://localhost:3799
 */

declare global {
  interface Window {
    __setOverlapResponse: (body: unknown) => void;
    __setStreamConfig: (config: unknown) => void;
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

/**
 * Installs a fake getUserMedia (a canvas.captureStream carrying whatever
 * __streamConfig currently says) and a controllable overlap-probe fetch
 * response. __setStreamConfig lets the test change what the NEXT
 * getUserMedia() call renders -- used to give Photo 1 a landmark-bearing
 * canvas and the live alignment camera a completely different one.
 */
const INIT_SCRIPT = `
window.__streamConfig = { width: 640, height: 480, bg: '#111111', landmarks: [] };
window.__setStreamConfig = (config) => { window.__streamConfig = config; };
window.__overlapResponse = { assessment: { matched: false, confidence: 0.9, overlapFraction: 0.05 } };
window.__setOverlapResponse = (body) => { window.__overlapResponse = body; };
window.__makeStream = () => {
  const config = window.__streamConfig;
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = config.bg;
  ctx.fillRect(0, 0, config.width, config.height);
  for (const landmark of config.landmarks) {
    ctx.fillStyle = landmark.color;
    ctx.fillRect(landmark.x, landmark.y, landmark.w, landmark.h);
  }
  return canvas.captureStream(5);
};
navigator.mediaDevices.getUserMedia = async () => window.__makeStream();
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (typeof url === 'string' && url.includes('route-assist-frame-overlap-interpret')) {
    return new Response(JSON.stringify(window.__overlapResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(url, init);
};
`;

type DirectionCase = {
  direction: "RIGHT" | "LEFT" | "UP" | "DOWN";
  sourceWidth: number;
  sourceHeight: number;
  inside: { x: number; y: number; w: number; h: number };
  outside: { x: number; y: number; w: number; h: number };
  expectedCropWidth: number;
  expectedCropHeight: number;
  expectedCropLocalInside: { x: number; y: number };
};

const CASES: DirectionCase[] = [
  {
    direction: "RIGHT",
    sourceWidth: 800,
    sourceHeight: 600,
    inside: { x: 770, y: 290, w: 20, h: 20 }, // center (780,300) -- inside x in [640,800]
    outside: { x: 90, y: 290, w: 20, h: 20 }, // center (100,300) -- well outside
    expectedCropWidth: 160,
    expectedCropHeight: 600,
    expectedCropLocalInside: { x: 140, y: 300 }, // 780 - 640
  },
  {
    direction: "LEFT",
    sourceWidth: 800,
    sourceHeight: 600,
    inside: { x: 10, y: 290, w: 20, h: 20 }, // center (20,300) -- inside x in [0,160]
    outside: { x: 690, y: 290, w: 20, h: 20 }, // center (700,300) -- well outside
    expectedCropWidth: 160,
    expectedCropHeight: 600,
    expectedCropLocalInside: { x: 20, y: 300 },
  },
  {
    direction: "UP",
    sourceWidth: 600,
    sourceHeight: 800,
    inside: { x: 290, y: 10, w: 20, h: 20 }, // center (300,20) -- inside y in [0,160]
    outside: { x: 290, y: 770, w: 20, h: 20 }, // center (300,780) -- well outside
    expectedCropWidth: 600,
    expectedCropHeight: 160,
    expectedCropLocalInside: { x: 300, y: 20 },
  },
  {
    direction: "DOWN",
    sourceWidth: 600,
    sourceHeight: 800,
    inside: { x: 290, y: 770, w: 20, h: 20 }, // center (300,780) -- inside y in [640,800]
    outside: { x: 290, y: 10, w: 20, h: 20 }, // center (300,20) -- well outside
    expectedCropWidth: 600,
    expectedCropHeight: 160,
    expectedCropLocalInside: { x: 300, y: 140 }, // 780 - 640
  },
];

const INSIDE_COLOR = "#ff0000";
const OUTSIDE_COLOR = "#0000ff";
// Deliberately a different resolution AND aspect ratio than every Photo 1
// case above (both 4:3 and 3:4) -- the live view must never need to match
// Photo 1's own resolution for the ghost crop to be correct.
const LIVE_VIEW_CONFIG = { width: 500, height: 500, bg: "#004400", landmarks: [] };

async function runCase(browser: import("playwright").Browser, testCase: DirectionCase) {
  console.log(`\n${testCase.direction} continuation on a ${testCase.sourceWidth}x${testCase.sourceHeight} source -- exercising the REAL rendered component`);
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(URL);

  // Photo 1: the fake camera renders the INSIDE and OUTSIDE landmarks at
  // their known positions.
  await page.evaluate(
    ({ config, inside, outside }) => {
      window.__setStreamConfig({
        ...config,
        landmarks: [
          { ...inside, color: "#ff0000" },
          { ...outside, color: "#0000ff" },
        ],
      });
    },
    { config: { width: testCase.sourceWidth, height: testCase.sourceHeight, bg: "#222222" }, inside: testCase.inside, outside: testCase.outside },
  );
  await page.click('[data-testid="route-assist-workspace-open-camera"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="route-assist-workspace-take-photo"]');
  await page.waitForSelector('[data-testid="route-assist-review-add-view"]');

  // Enter alignment: the live camera now gets a COMPLETELY DIFFERENT
  // resolution/aspect ratio -- proving the ghost crop's pixel content
  // never depends on what the live view itself looks like.
  await page.evaluate((config) => window.__setStreamConfig(config), LIVE_VIEW_CONFIG);
  await page.click('[data-testid="route-assist-review-add-view"]');
  await page.waitForSelector('[data-testid="route-assist-alignment-camera"]');

  // Lock the direction under test with 2 consistent matched probes.
  await page.evaluate(
    (direction) => window.__setOverlapResponse({ assessment: { matched: true, confidence: 0.9, overlapFraction: 0.5, relativeDirection: direction } }),
    testCase.direction,
  );
  await page.waitForSelector('[data-testid="route-assist-ghost-edge-strip"]', { timeout: 6000 }).catch(() => null);
  await page.waitForTimeout(300);

  const ghostVisible = await page.locator('[data-testid="route-assist-ghost-edge-strip"]').isVisible().catch(() => false);
  check(`${testCase.direction}: the real ghost-edge-strip <img> rendered after direction locked`, ghostVisible);
  if (!ghostVisible) {
    await context.close();
    return;
  }

  const src = await page.locator('[data-testid="route-assist-ghost-edge-strip"]').getAttribute("src");
  check(`${testCase.direction}: the ghost <img> has a real data URL src`, Boolean(src && src.startsWith("data:image/jpeg")), src?.slice(0, 40));

  // Decode the ACTUAL src the production component produced -- never a
  // replicated formula -- and inspect its real pixel content.
  const pixelCheck = await page.evaluate(
    async ({ src, expected, expectedCropLocalInside, insideColor, outsideColor }) => {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src as string;
      });
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const insidePixel = Array.from(ctx.getImageData(expectedCropLocalInside.x, expectedCropLocalInside.y, 1, 1).data);
      const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let outsideColorFound = false;
      const outsideRgb = [parseInt((outsideColor as string).slice(1, 3), 16), parseInt((outsideColor as string).slice(3, 5), 16), parseInt((outsideColor as string).slice(5, 7), 16)];
      for (let i = 0; i < fullData.length; i += 4) {
        if (Math.abs(fullData[i] - outsideRgb[0]) < 30 && Math.abs(fullData[i + 1] - outsideRgb[1]) < 30 && Math.abs(fullData[i + 2] - outsideRgb[2]) < 30) {
          outsideColorFound = true;
          break;
        }
      }
      const insideRgb = [parseInt((insideColor as string).slice(1, 3), 16), parseInt((insideColor as string).slice(3, 5), 16), parseInt((insideColor as string).slice(5, 7), 16)];
      const insideMatches = Math.abs(insidePixel[0] - insideRgb[0]) < 30 && Math.abs(insidePixel[1] - insideRgb[1]) < 30 && Math.abs(insidePixel[2] - insideRgb[2]) < 30;
      return { naturalWidth, naturalHeight, insidePixel, insideMatches, outsideColorFound };
    },
    { src, expected: { w: testCase.expectedCropWidth, h: testCase.expectedCropHeight }, expectedCropLocalInside: testCase.expectedCropLocalInside, insideColor: INSIDE_COLOR, outsideColor: OUTSIDE_COLOR },
  );

  check(`${testCase.direction}: decoded crop dimensions match the expected ${testCase.expectedCropWidth}x${testCase.expectedCropHeight} strip`, pixelCheck.naturalWidth === testCase.expectedCropWidth && pixelCheck.naturalHeight === testCase.expectedCropHeight, JSON.stringify(pixelCheck));
  check(`${testCase.direction}: the INSIDE landmark is present at its exact expected crop-local position ${JSON.stringify(testCase.expectedCropLocalInside)}`, pixelCheck.insideMatches, JSON.stringify(pixelCheck.insidePixel));
  check(`${testCase.direction}: the OUTSIDE landmark is completely absent from the crop`, !pixelCheck.outsideColorFound);

  // The real rendered DOM band (object-fit: cover) sizes correctly
  // relative to the alignment panel, regardless of the live view's own
  // (deliberately mismatched) resolution.
  const box = await page.locator('[data-testid="route-assist-ghost-edge-strip"]').boundingBox();
  const panelBox = await page.locator('[data-testid="route-assist-alignment-camera"]').boundingBox();
  if (box && panelBox) {
    const isVertical = testCase.direction === "LEFT" || testCase.direction === "RIGHT";
    const expectedFraction = 0.2;
    const actualFraction = isVertical ? box.width / panelBox.width : box.height / panelBox.height;
    check(`${testCase.direction}: the real rendered band occupies ~${expectedFraction * 100}% of the alignment panel regardless of the live view's mismatched resolution`, Math.abs(actualFraction - expectedFraction) < 0.03, `actualFraction=${actualFraction}`);
  } else {
    check(`${testCase.direction}: both the ghost strip and alignment panel report a bounding box`, false);
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  for (const testCase of CASES) {
    await runCase(browser, testCase);
  }
  await browser.close();
  console.log(failures === 0 ? "\nAll production-path ghost-mapping checks passed.\n" : `\n${failures} production-path ghost-mapping check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
