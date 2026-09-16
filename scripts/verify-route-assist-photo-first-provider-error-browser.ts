/**
 * Browser-level proof that the preview-only photo-first UI now surfaces the
 * REAL underlying AI Gateway provider error, not just the generic "provider
 * failed without producing semantics" problem runRouteAssistVisibleSceneProviderV1
 * always returns to production-safe callers.
 *
 * Deliberately does NOT mock the interpret endpoint or the AI Gateway call --
 * this dev environment has no AI_GATEWAY_API_KEY/VERCEL_OIDC_TOKEN, so
 * hitting the REAL /api/dev-fixtures/route-assist-photo-first-interpret
 * route exercises the actual failure path end to end: provider.analyze()
 * throws "AI Gateway authentication unavailable" -> the new onProviderError
 * hook in visibleSceneProviderAdapter.ts captures it -> the error is
 * rethrown unchanged and swallowed by runRouteAssistVisibleSceneProviderV1's
 * own catch, which still returns the same generic problem -> the route
 * appends the sanitized captured message as a second diagnostic problem ->
 * the client renders both.
 *
 * Same tool/style as the sibling aspect-ratio browser script: raw
 * `playwright` via `tsx`, no new test-framework dependency.
 *
 *   npx tsx scripts/verify-route-assist-photo-first-provider-error-browser.ts --base http://localhost:3611
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

async function installFakeCamera(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#446688";
    ctx.fillRect(0, 0, 640, 480);
    setInterval(() => {
      ctx.fillStyle = `hsl(${Date.now() % 360}, 70%, 50%)`;
      ctx.fillRect(0, 0, 640, 480);
    }, 200);
    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    navigator.mediaDevices.getUserMedia = async () => stream;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (err) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${err.message}`);
  });

  try {
    await installFakeCamera(page);
    await page.goto(`${BASE}/dev-fixtures/route-assist-photo-first`);

    await page.click('[data-testid="route-assist-photo-open-camera"]');
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return !!video && video.readyState >= 2 && video.videoWidth > 0;
    });
    await page.click('[data-testid="route-assist-photo-take"]');

    const surfaceBox = await page.locator('[data-testid="route-assist-photo-surface"]').boundingBox();
    if (!surfaceBox) throw new Error("photo surface not found");
    await page.mouse.click(surfaceBox.x + surfaceBox.width * 0.2, surfaceBox.y + surfaceBox.height * 0.8);
    await page.mouse.click(surfaceBox.x + surfaceBox.width * 0.8, surfaceBox.y + surfaceBox.height * 0.2);
    await page.click('[data-testid="route-assist-photo-confirm"]');

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/dev-fixtures/route-assist-photo-first-interpret"));
    await page.click('[data-testid="route-assist-photo-interpret"]');
    const response = await responsePromise;

    check("5. the interpret request still fails closed with a non-2xx status -- no silently-accepted semantics", !response.ok(), `status=${response.status()}`);

    await page.waitForSelector('[data-testid="route-assist-photo-interpret-error"]');
    const errorText = await page.locator('[data-testid="route-assist-photo-interpret-error"]').innerText();
    check(
      "the generic error is still shown, unchanged, as the first line",
      errorText.includes("Route Assist could not validate the provider's interpretation"),
      errorText,
    );

    await page.waitForSelector('[data-testid="route-assist-photo-interpret-problems"]');
    const problemsText = await page.locator('[data-testid="route-assist-photo-interpret-problems"]').innerText();
    check("6a. the diagnostic panel is labeled 'Provider validation problems'", problemsText.includes("Provider validation problems"), problemsText);
    check(
      "6b. the diagnostic panel now shows the REAL underlying provider error (AI Gateway authentication unavailable in this credential-less dev environment), not just the generic problem",
      problemsText.includes("provider error:") && problemsText.includes("AI Gateway authentication unavailable"),
      problemsText,
    );
    check(
      "6c. the diagnostic never leaks the photo/data URL into the page",
      !problemsText.includes("data:image"),
      problemsText,
    );

    const debugPanelText = await page.locator('[data-testid="route-assist-photo-debug-panel"]').innerText();
    check(
      "5b. because validation never produced semantics, the fact ledger is untouched -- still 'not yet observed' / 'not confirmed', not a fabricated result",
      debugPanelText.includes("not yet observed") || debugPanelText.includes("not confirmed"),
      debugPanelText,
    );
    const escalationText = await page.locator('[data-testid="route-assist-photo-escalation-summary"]').innerText();
    check(
      "5c. the leg escalation is NOT PHOTO_SUFFICIENT on a failed provider call",
      !escalationText.includes("PHOTO_SUFFICIENT"),
      escalationText,
    );
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
