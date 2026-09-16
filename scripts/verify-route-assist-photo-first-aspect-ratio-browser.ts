/**
 * Browser-level proof that RouteAssistPhotoCapture.tsx's photo surface
 * represents the exact full captured image, at its own native aspect ratio,
 * for a non-4:3 capture -- the correction for the black-photo-crop bug
 * Joshua's real phone test surfaced (bottom of the image was cut off).
 *
 * Same tool and style as scripts/verify-route-assist-browser.ts: raw
 * `playwright` driven directly via `tsx`, no `playwright.config.ts`, no new
 * test-framework dependency.
 *
 * This can't be proven without a real browser: the bug was in CSS
 * (aspect-[4/3] + object-cover) and in how a normalized click coordinate
 * maps onto that box, not in any pure function this repo's other
 * non-browser Route Assist verify scripts could exercise. There is no
 * camera hardware in this environment, so getUserMedia is replaced with a
 * synthetic canvas.captureStream() at a controlled, non-4:3 resolution --
 * the same technique used to drive this flow manually during development.
 *
 *   npx tsx scripts/verify-route-assist-photo-first-aspect-ratio-browser.ts --base http://localhost:3611
 */
import { chromium, type Page } from "playwright";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3000";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok — ${name}`);
  } else {
    failures++;
    console.error(`  FAIL — ${name}${detail ? `: ${detail}` : ""}`);
  }
}

/** Replaces getUserMedia with a synthetic stream at an exact, controlled, non-4:3 resolution -- installed before any page script runs. */
async function installFakeCamera(page: Page, width: number, height: number) {
  await page.addInitScript(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#3a6ea5";
      ctx.fillRect(0, 0, width, height);
      setInterval(() => {
        ctx.fillStyle = `hsl(${Date.now() % 360}, 70%, 50%)`;
        ctx.fillRect(0, 0, width, height);
      }, 200);
      const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      navigator.mediaDevices.getUserMedia = async () => stream;
    },
    { width, height },
  );
}

function parseLeftTopPercent(style: string | null): { left: number; top: number } {
  const left = Number(style?.match(/left:\s*([\d.]+)%/)?.[1]);
  const top = Number(style?.match(/top:\s*([\d.]+)%/)?.[1]);
  return { left, top };
}

async function runNonFourThreeCase(page: Page, width: number, height: number, label: string) {
  console.log(`\n${label} capture (${width}x${height}) -- no cropping, exact aspect ratio, direct coordinate mapping`);
  await installFakeCamera(page, width, height);
  await page.goto(`${BASE}/dev-fixtures/route-assist-photo-first`);

  await page.click('[data-testid="route-assist-photo-open-camera"]');
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return !!video && video.readyState >= 2 && video.videoWidth > 0;
  });
  await page.click('[data-testid="route-assist-photo-take"]');
  await page.waitForSelector('[data-testid="route-assist-photo-surface"]');

  const surfaceBox = await page.locator('[data-testid="route-assist-photo-surface"]').boundingBox();
  const imgBox = await page.locator('[data-testid="route-assist-photo-surface"] img').boundingBox();
  if (!surfaceBox || !imgBox) throw new Error("photo surface or image not found");

  const expectedRatio = width / height;
  const surfaceRatio = surfaceBox.width / surfaceBox.height;
  check(
    `1. the marker surface preserves the native ${label} aspect ratio (not a hard-coded 4:3 box)`,
    Math.abs(surfaceRatio - expectedRatio) < 0.02,
    `expected ratio ${expectedRatio.toFixed(4)}, got ${surfaceRatio.toFixed(4)} (surface=${JSON.stringify(surfaceBox)})`,
  );

  const EDGE_TOLERANCE_PX = 1.5;
  check(
    "2. the full photo is visible edge-to-edge -- the <img> exactly fills the surface, no letterbox bars, nothing cropped top/bottom/left/right",
    Math.abs(imgBox.width - surfaceBox.width) < EDGE_TOLERANCE_PX &&
      Math.abs(imgBox.height - surfaceBox.height) < EDGE_TOLERANCE_PX &&
      Math.abs(imgBox.x - surfaceBox.x) < EDGE_TOLERANCE_PX &&
      Math.abs(imgBox.y - surfaceBox.y) < EDGE_TOLERANCE_PX,
    `surface=${JSON.stringify(surfaceBox)} img=${JSON.stringify(imgBox)}`,
  );

  // Tap two known normalized fractions of the surface. Because the surface
  // IS the full photo at its exact native aspect ratio (checks 1-2 above),
  // the tapped normalized fraction of the surface is, by construction, the
  // same normalized fraction of the original full-resolution photo the
  // provider receives -- no separate crop-coordinate translation exists in
  // this component for this check to detect the absence of.
  const targetSource = { xFrac: 0.18, yFrac: 0.82 };
  const targetDestination = { xFrac: 0.77, yFrac: 0.12 };
  await page.mouse.click(surfaceBox.x + surfaceBox.width * targetSource.xFrac, surfaceBox.y + surfaceBox.height * targetSource.yFrac);
  await page.mouse.click(surfaceBox.x + surfaceBox.width * targetDestination.xFrac, surfaceBox.y + surfaceBox.height * targetDestination.yFrac);

  const [styleA, styleB] = await Promise.all([
    page.locator('[data-testid="route-assist-marker-A"]').getAttribute("style"),
    page.locator('[data-testid="route-assist-marker-B"]').getAttribute("style"),
  ]);
  const posA = parseLeftTopPercent(styleA);
  const posB = parseLeftTopPercent(styleB);
  const PERCENT_TOLERANCE = 1.5;

  check(
    "3a. source marker A's rendered normalized position matches the exact tapped fraction of the full photo",
    Math.abs(posA.left - targetSource.xFrac * 100) < PERCENT_TOLERANCE && Math.abs(posA.top - targetSource.yFrac * 100) < PERCENT_TOLERANCE,
    `expected ~(${targetSource.xFrac * 100}, ${targetSource.yFrac * 100}), got (${posA.left}, ${posA.top})`,
  );
  check(
    "3b. destination marker B's rendered normalized position matches the exact tapped fraction of the full photo",
    Math.abs(posB.left - targetDestination.xFrac * 100) < PERCENT_TOLERANCE && Math.abs(posB.top - targetDestination.yFrac * 100) < PERCENT_TOLERANCE,
    `expected ~(${targetDestination.xFrac * 100}, ${targetDestination.yFrac * 100}), got (${posB.left}, ${posB.top})`,
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (err) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${err.message}`);
  });

  try {
    // 4. A 16:9 capture (1280x720) -- the exact non-4:3 shape a modern rear
    // camera actually produces, and the case the real phone test hit.
    await runNonFourThreeCase(page, 1280, 720, "16:9 landscape");
    // A portrait non-4:3 capture too, since Joshua's phone photo was
    // portrait-oriented -- proves this isn't landscape-specific.
    await runNonFourThreeCase(page, 720, 1600, "9:20 portrait");
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
});
