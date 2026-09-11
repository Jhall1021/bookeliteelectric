/**
 * Browser-level regression coverage for RouteAssistCapture's interactive
 * geometry editor — photo, mark A/B, add/drag/tag a waypoint, confirm.
 *
 * Same tool and style as scripts/capture-marketing-shots.ts: raw
 * `playwright` driven directly via `tsx`, no `playwright.config.ts`, no new
 * test-framework dependency — this repo's established pattern for
 * browser-driven scripts, followed rather than replaced.
 *
 * Domain correctness (the four proof scenarios, invariants, confirmation
 * flow) is already proven with no browser at all by
 * scripts/verify-route-assist-domain.ts. This script exists for the one
 * thing that can't be proven that way: whether the on-screen interaction —
 * clicking, dragging, tagging — actually drives that domain code. It exists
 * because exactly this kind of defect was found manually during this
 * feature's first browser pass: a stale-closure bug where dragging a
 * waypoint silently did nothing (see RouteAssistCapture.tsx's
 * `startDrag` comment). A domain-only test suite cannot catch that class of
 * bug by construction — there is no domain function called "drag."
 *
 * Requires a running dev server serving app/elite-electric/dev-fixtures/route-assist
 * (a committed test fixture, not a product route — see that file's header).
 *
 *   npx tsx scripts/verify-route-assist-browser.ts --base http://localhost:3424
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

/** Injects a synthetic PNG into the hidden file input — there is no OS file
 * dialog in a headless/CI browser, so the upload is synthesized the same
 * way a real browser session would receive one: a File wrapped in a
 * DataTransfer, assigned to the input, with a real `change` event. */
async function uploadSyntheticPhoto(page: Page) {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#d9d2c5";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#8b6f47";
    ctx.fillRect(0, 500, 800, 100);
    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        const file = new File([blob!], "route-photo.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.querySelector<HTMLInputElement>('[data-testid="photo-input"]')!;
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        resolve();
      }, "image/png");
    });
  });
  await page.waitForSelector('[data-testid="capture-image"]');
}

async function imageBox(page: Page) {
  const box = await page.locator('[data-testid="capture-image"]').boundingBox();
  if (!box) throw new Error("capture-image not found");
  return box;
}

async function runSurfaceReceptacle(page: Page) {
  console.log("\nSurface receptacle — full interaction pass");
  await page.goto(`${BASE}/elite-electric/dev-fixtures/route-assist?case=surface-receptacle`);
  await page.click('[data-testid="mode-SURFACE"]');
  await uploadSyntheticPhoto(page);

  let box = await imageBox(page);
  const aX = box.x + box.width * 0.2;
  const aY = box.y + box.height * 0.9;
  const bX = box.x + box.width * 0.8;
  const bY = box.y + box.height * 0.15;

  // Each segment renders two <line>s (a wide invisible tap target plus the
  // thin visible one) — see RouteAssistCapture.tsx's onLineClick comment.
  // Count only the visible ones so this assertion doesn't depend on that
  // rendering detail.
  const visibleLines = () => page.locator('svg line[stroke="#2563eb"]');

  await page.mouse.click(aX, aY);
  check("point A placed", (await page.locator('button:has-text("A")').count()) > 0);

  await page.mouse.click(bX, bY);
  check("point B placed", (await page.locator('button:has-text("B")').count()) > 0);
  check("a single A-B segment is drawn", (await visibleLines().count()) === 1);

  // Add a waypoint by clicking the drawn line's midpoint.
  const midX = (aX + bX) / 2;
  const midY = (aY + bY) / 2;
  await page.mouse.click(midX, midY);
  await page.waitForSelector("text=This point").catch(() => {});
  const segmentCountAfterAdd = await visibleLines().count();
  check("waypoint split the segment into two", segmentCountAfterAdd === 2, `saw ${segmentCountAfterAdd}`);

  // Drag the waypoint — this is the exact interaction the stale-closure bug broke.
  const beforeDrag = await visibleLines().evaluateAll((lines) => lines.map((l) => l.getAttribute("x2")));
  await page.mouse.move(midX, midY);
  await page.mouse.down();
  await page.mouse.move(aX, bY, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await visibleLines().evaluateAll((lines) => lines.map((l) => l.getAttribute("x2")));
  check(
    "dragging the waypoint actually moves it (regression check for the stale-closure bug)",
    JSON.stringify(beforeDrag) !== JSON.stringify(afterDrag),
    `before=${beforeDrag} after=${afterDrag}`
  );

  // Tag both legs as WALL and give them lengths, matching Proof A (5 + 12 = 17 ft).
  await page.click('[data-testid="leg-0-surface-WALL"]');
  await page.click('[data-testid="leg-1-surface-WALL"]');
  await page.fill('[data-testid="leg-0-length"]', "5");
  await page.fill('[data-testid="leg-1-length"]', "12");

  await page.click('button:has-text("Looks right — review route")');
  const confirmText = await page.locator("text=Does this look right?").isVisible();
  check("reached the confirmation screen", confirmText);
  const bodyText = await page.locator("main").innerText();
  check("shows the correct total length (17 ft)", bodyText.includes("17 ft"), bodyText);
  check("shows one turn", bodyText.includes("1 turn"), bodyText);

  await page.click('button:has-text("Looks right")');
  const resultText = await page.locator('[data-testid="route-assist-result"]').innerText();
  check("contractor summary names the RECEPTACLE destination", resultText.includes("Receptacle"), resultText);
  check("review not required for a confirmed simple surface route", resultText.includes("Review:\n  Not required"), resultText);
}

async function runConcealed(page: Page) {
  console.log("\nConcealed — doorway + different-wall + complexity");
  await page.goto(`${BASE}/elite-electric/dev-fixtures/route-assist?case=concealed`);
  await page.click('[data-testid="mode-CONCEALED"]');
  await page.click('[data-testid="drywall-yes"]');
  await uploadSyntheticPhoto(page);

  const box = await imageBox(page);
  const aX = box.x + box.width * 0.15;
  const aY = box.y + box.height * 0.6;
  const bX = box.x + box.width * 0.85;
  const bY = box.y + box.height * 0.2;
  await page.mouse.click(aX, aY);
  await page.mouse.click(bX, bY);
  await page.mouse.click((aX + bX) / 2, (aY + bY) / 2);
  await page.waitForSelector("text=This point").catch(() => {});

  await page.click('[data-testid="point-tag-doorway"]');
  await page.click('[data-testid="point-tag-different-wall"]');
  await page.click('[data-testid="leg-0-surface-WALL"]');
  await page.click('[data-testid="leg-1-surface-WALL"]');

  await page.click('button:has-text("Looks right — review route")');
  const summary = await page.locator("main").innerText();
  check("summary reads 'Different walls'", summary.includes("Different walls"), summary);
  check("summary reports one doorway between locations", summary.includes("doorway between locations"), summary);
  check("summary states a routing complexity, never a hidden-path claim", /routing complexity/i.test(summary), summary);
  check(
    "never claims to know what's behind the wall",
    !/we determined the wire path|no obstacles are inside|can be tapped/i.test(summary)
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  page.on("pageerror", (err) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${err.message}`);
  });

  try {
    await runSurfaceReceptacle(page);
    await runConcealed(page);
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
