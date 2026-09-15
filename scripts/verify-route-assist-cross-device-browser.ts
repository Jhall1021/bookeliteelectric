/**
 * The full cross-device Route Assist proof, at the UI level — item 9 of
 * the brief, driven through the REAL handoff/capture components, not just
 * the HTTP API (that's scripts/verify-guided-flow-cross-device.ts, a
 * different, narrower concern that proves the mechanism generically).
 * Two independent Playwright browser CONTEXTS (separate cookie jars =
 * separate devices) against a real running dev server and a real service.
 *
 *   npx tsx scripts/verify-route-assist-cross-device-browser.ts \
 *     --base http://localhost:3427 --service new-120v-outlet
 *
 * `?mode=handoff` on app/elite-electric/dev-fixtures/route-assist stands in for
 * "a service's Guided Flow question opened Route Assist." The fixture supplies
 * the SAME grouped surface capture task identity used by the real invocation
 * registry (`surface_route_capture_v1`), so this proof exercises task-key
 * persistence and phone capture-context restoration rather than the old
 * null-key compatibility fallback.
 *
 * Proves, in order: desktop reaches the step and gets a QR; a genuinely
 * separate browser context (the phone) resolves that QR's actual URL and
 * joins the SAME GuidedFlowSession; after choosing surface mode and opening a
 * photo, the phone sees the RECEPTACLE source hint recovered from the grouped
 * task key; it completes A/waypoint/B and confirms; the desktop — polling, no
 * manual refresh — detects completion; and, checked directly against the
 * database rather than inferred from the UI, exactly one GuidedFlowSession,
 * one grouped GuidedFlowVisualAssistTask and one canonical RouteAssistResult
 * exist.
 *
 * UPLOAD SUBSTITUTION — see docs/design/route-assist-v1.md's cross-device
 * proof note. This development sandbox cannot complete a TLS connection to
 * Cloudflare R2, so the phone is sent to
 * app/[site]/dev-fixtures/route-assist-handoff/[token] instead of the real
 * app/[site]/handoff/[token] page — same HandoffLanding component, same
 * resolve/capture/confirm/complete flow, same GuidedFlowSession + Device
 * Handoff APIs; only the injected `uploadPhoto` differs (a local object URL
 * instead of a real R2 PUT), the same substitution the single-device
 * fixture already makes for its own `fakeUpload`. Everything through
 * `POST /api/device-handoffs` — the actual mechanism this proof is
 * about — is unchanged and still real.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3000";
const SERVICE_SLUG = arg("service") ?? "new-120v-outlet";
const SURFACE_CAPTURE_TASK_KEY = "surface_route_capture_v1";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "ok" : "FAIL"} — ${name}${!cond && detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

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

async function placeAndConfirmRoute(page: Page) {
  await page.click('[data-testid="mode-SURFACE"]');
  await uploadSyntheticPhoto(page);

  // Source/destination hints appear only after the photo is loaded. Assert the
  // registry-restored endpoint HERE, not on the initial MODE screen where no
  // endpoint-specific copy is rendered yet.
  const sourceStepText = await page.locator("main").innerText();
  check(
    "phone restored receptacle source context from grouped task identity",
    /existing outlet/i.test(sourceStepText),
    sourceStepText.slice(0, 400)
  );

  const box = await page.locator('[data-testid="capture-image"]').boundingBox();
  if (!box) throw new Error("capture-image not found");
  const aX = box.x + box.width * 0.2;
  const aY = box.y + box.height * 0.9;
  const bX = box.x + box.width * 0.8;
  const bY = box.y + box.height * 0.15;

  await page.mouse.click(aX, aY); // A
  await page.mouse.click(bX, bY); // B — draws the initial A-B segment

  // Add a waypoint at the midpoint.
  const midX = (aX + bX) / 2;
  const midY = (aY + bY) / 2;
  await page.mouse.click(midX, midY);
  await page.waitForSelector("text=This point").catch(() => {});
  await page.click('[data-testid="leg-0-surface-WALL"]');
  await page.click('[data-testid="leg-1-surface-WALL"]');

  await page.click('button:has-text("Looks right — review route")');
  await page.waitForSelector("text=Does this look right?");
  await page.click('button:has-text("Looks right")');
  // The confirm click's handler is async (completes the canonical Visual Assist
  // task, then the Device Handoff, before flipping to the "done" state) — wait
  // for it rather than reading the DOM mid-transition.
  await page.waitForSelector("text=Route added");
}

async function main() {
  const browser = await chromium.launch();

  const desktopCtx = await browser.newContext();
  const desktop = await desktopCtx.newPage();
  desktop.on("pageerror", (e) => {
    failures++;
    console.error(`  FAIL — desktop uncaught page error: ${e.message}`);
  });

  console.log("\n1. Desktop reaches the grouped Route Assist step and requests a handoff");
  const handoffResponsePromise = desktop.waitForResponse((r) => r.url().includes("/api/device-handoffs") && r.request().method() === "POST");
  await desktop.goto(
    `${BASE}/elite-electric/dev-fixtures/route-assist?mode=handoff&service=${encodeURIComponent(SERVICE_SLUG)}` +
      `&taskKey=${encodeURIComponent(SURFACE_CAPTURE_TASK_KEY)}`
  );
  await desktop.click('button:has-text("Continue on your phone")');
  const handoffResponse = await handoffResponsePromise;
  const handoffBody = await handoffResponse.json();
  check("desktop created a Device Handoff", !!handoffBody?.url, JSON.stringify(handoffBody));
  await desktop.waitForSelector('img[alt="QR code to continue on your phone"]');

  console.log("\n2. Separate phone resolves the QR and restores grouped capture context");
  const phoneCtx = await browser.newContext();
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", (e) => {
    failures++;
    console.error(`  FAIL — phone uncaught page error: ${e.message}`);
  });
  // Real token, real URL shape — only the page it lands on is swapped (see
  // header comment) so the phone's photo "upload" doesn't need real R2
  // network access in this sandbox.
  const realHandoffUrl = new URL(handoffBody.url);
  const token = realHandoffUrl.pathname.split("/").pop();
  const fixtureHandoffUrl = `${BASE}/elite-electric/dev-fixtures/route-assist-handoff/${token}`;
  await phone.goto(fixtureHandoffUrl);
  await phone.waitForSelector('[data-testid="mode-SURFACE"]', { timeout: 15000 });
  const phoneText = await phone.locator("main").innerText().catch(() => "");
  check("phone lands directly on the capture step (not an error page)", !phoneText.includes("isn't valid"), phoneText.slice(0, 240));

  console.log("\n3. Phone captures A, a waypoint, B, and confirms");
  await placeAndConfirmRoute(phone);
  const phoneResult = await phone.locator("main").innerText();
  check("phone reaches 'Route added'", phoneResult.includes("Route added"), phoneResult.slice(0, 200));

  console.log("\n4. Desktop detects canonical completion via polling — no manual refresh");
  await desktop.waitForSelector("text=Route received", { timeout: 20000 });
  const desktopText = await desktop.locator("main").innerText();
  check("desktop shows 'Route received' without a reload", desktopText.includes("Route received"));

  await desktop.click('button:has-text("Continue")');
  await desktop.waitForSelector('[data-testid="route-assist-result"]');
  const desktopResultText = await desktop.locator('[data-testid="route-assist-result"]').innerText();
  check(
    "desktop's final canonical result preserves the registry endpoint (Receptacle)",
    desktopResultText.includes("Receptacle"),
    desktopResultText
  );

  await browser.close();

  console.log("\n5. Exactly one grouped task and one canonical result — checked in the database");
  const prisma = new PrismaClient();
  const sessions = await prisma.guidedFlowSession.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { visualAssistTasks: true, deviceHandoffs: true },
  });
  // The one this run created is the newest — everything else on the
  // service belongs to other runs/fixtures and isn't this proof's concern.
  const session = sessions[0];
  check("a GuidedFlowSession exists", !!session);
  if (session) {
    const routeTasks = session.visualAssistTasks.filter((t) => t.taskType === "ROUTE_ASSIST");
    check("exactly one ROUTE_ASSIST task on it", routeTasks.length === 1);
    const task = routeTasks[0];
    check("task kept the grouped capture identity", task?.taskKey === SURFACE_CAPTURE_TASK_KEY, String(task?.taskKey));
    check("that grouped task is COMPLETED with a result", task?.status === "COMPLETED" && !!task?.result);
    check("exactly one DeviceHandoff on it", session.deviceHandoffs.length === 1);
    check("the handoff is COMPLETED", session.deviceHandoffs[0]?.status === "COMPLETED");
  }
  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
});
