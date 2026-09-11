/**
 * Regression proof for docs/design/anonymous-session-bootstrap.md — the
 * exact defect reproduced against a real guided-flow page on main before
 * this fix (session cookie race, PR context): a genuinely first-time
 * visitor's Header.tsx and GuidedFlowEngine.tsx independently minted
 * competing `elite_session_id` cookies, and whichever `Set-Cookie` landed
 * last silently orphaned any GuidedFlowSession created under a different one.
 *
 * Same tool and style as the rest of this repo's browser-level scripts: raw
 * `playwright` via `tsx`, no test-runner framework.
 *
 *   npx tsx scripts/verify-anonymous-session-bootstrap.ts --base http://localhost:3512 [--runs 10]
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3000";
const RUNS = Number(arg("runs") ?? "10");
const SERVICE_PATH = "/elite-electric/services/outlets-switches/replace-gfci-outlet";
const SECOND_PATH = "/elite-electric/how-it-works";
const SERVICE_SLUG = "replace-gfci-outlet";
const COOKIE_NAME = "elite_session_id";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "ok" : "FAIL"} — ${name}${!cond && detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

type Ev = { t: number; kind: "request" | "response"; method: string; url: string; cookieSent?: string; setCookies: string[] };

function attach(page: Page, t0: number, events: Ev[]) {
  page.on("request", async (req) => {
    if (!req.url().includes("/api/")) return;
    const all = await req.headersArray().catch(() => []);
    const cookieSent = all.find((h) => h.name.toLowerCase() === "cookie")?.value;
    events.push({ t: Date.now() - t0, kind: "request", method: req.method(), url: req.url(), cookieSent, setCookies: [] });
  });
  page.on("response", async (res) => {
    if (!res.url().includes("/api/")) return;
    const all = await res.headersArray().catch(() => []);
    const setCookies = all.filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.includes(COOKIE_NAME)).map((h) => h.value);
    events.push({ t: Date.now() - t0, kind: "response", method: res.request().method(), url: res.url(), setCookies });
  });
}

function cookieValue(setCookie: string): string {
  return setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1] ?? "";
}

async function cookieOf(ctx: BrowserContext): Promise<string | undefined> {
  return (await ctx.cookies()).find((c) => c.name === COOKIE_NAME)?.value;
}

/** One fresh-visitor run: navigate, capture the full timeline, assert the invariant. */
async function freshVisitRun(browser: Awaited<ReturnType<typeof chromium.launch>>, i: number, label: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const events: Ev[] = [];
  const t0 = Date.now();
  attach(page, t0, events);

  const nav = await page.goto(`${BASE}${SERVICE_PATH}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const navSetCookies = (await nav!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.includes(COOKIE_NAME));
  console.log(`\n  [${label} run ${i + 1}] document response Set-Cookie count: ${navSetCookies.length}`);
  check(`${label} run ${i + 1}: document response establishes the session`, navSetCookies.length === 1, `saw ${navSetCookies.length}`);
  const establishedId = navSetCookies[0] ? cookieValue(navSetCookies[0].value) : undefined;

  // No API response during the initial load should mint a COMPETING id —
  // the original defect. (The document nav's own Set-Cookie is excluded;
  // we're checking the client-side API calls that follow it.)
  const apiMints = events.filter((e) => e.kind === "response" && e.setCookies.length > 0);
  check(`${label} run ${i + 1}: no API response mints a competing session id`, apiMints.length === 0, JSON.stringify(apiMints));

  // Every API request fired during the initial load must already carry the
  // pre-established id.
  const apiReqs = events.filter((e) => e.kind === "request");
  const allCarriedIt = apiReqs.every((e) => e.cookieSent?.includes(`${COOKIE_NAME}=${establishedId}`));
  check(
    `${label} run ${i + 1}: all ${apiReqs.length} concurrent API requests carried the pre-established id`,
    apiReqs.length > 0 && allCarriedIt,
    apiReqs.map((e) => `${e.method} ${e.url.replace(BASE, "")} cookie=${e.cookieSent ?? "(none)"}`).join(" | ")
  );

  // Specifically the original three-request scenario.
  const visitReqs = apiReqs.filter((e) => e.url.includes("/api/visit"));
  const postSession = apiReqs.find((e) => e.url.includes("/api/guided-flow-sessions") && e.method === "POST");
  check(
    `${label} run ${i + 1}: original 3-request scenario (2x GET /api/visit + POST /api/guided-flow-sessions) all observed the same id`,
    visitReqs.length >= 2 &&
      !!postSession &&
      visitReqs.every((e) => e.cookieSent?.includes(`${COOKIE_NAME}=${establishedId}`)) &&
      postSession.cookieSent?.includes(`${COOKIE_NAME}=${establishedId}`) === true,
    `visit reqs=${visitReqs.length} postSession cookie=${postSession?.cookieSent}`
  );

  const finalCookie = await cookieOf(ctx);
  check(`${label} run ${i + 1}: final browser cookie equals the document-established id`, finalCookie === establishedId, `final=${finalCookie} established=${establishedId}`);

  await ctx.close();
  return { establishedId, ctx };
}

/** Reload + normal navigation retain identity; no new Set-Cookie on either. */
async function reloadAndNavigateRun(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const events: Ev[] = [];
  const t0 = Date.now();
  attach(page, t0, events);

  await page.goto(`${BASE}${SERVICE_PATH}`, { waitUntil: "networkidle" });
  const afterFirstLoad = await cookieOf(ctx);
  check("existing-cookie: identity established on first load", !!afterFirstLoad);

  events.length = 0;
  const reloadResp = await page.reload({ waitUntil: "networkidle" });
  const reloadSetCookies = (await reloadResp!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.includes(COOKIE_NAME));
  check("reload: middleware issues no new Set-Cookie when one already exists", reloadSetCookies.length === 0, JSON.stringify(reloadSetCookies));
  const afterReload = await cookieOf(ctx);
  check("reload: identity unchanged", afterReload === afterFirstLoad, `before=${afterFirstLoad} after=${afterReload}`);

  const navResp = await page.goto(`${BASE}${SECOND_PATH}`, { waitUntil: "networkidle" });
  const navSetCookies = (await navResp!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.includes(COOKIE_NAME));
  check("normal navigation to a second qualifying page: no new Set-Cookie", navSetCookies.length === 0, JSON.stringify(navSetCookies));
  const afterNav = await cookieOf(ctx);
  check("normal navigation: identity unchanged", afterNav === afterFirstLoad, `before=${afterFirstLoad} after=${afterNav}`);

  await ctx.close();
}

/**
 * Device Handoff regression: middleware's mint-only-if-absent must never
 * fight the resolve step's own unconditional identity assignment.
 *
 *   desktop session A
 *        |
 *   QR handoff created
 *        |
 *   phone's FIRST navigation to a [site] page — middleware mints B (no
 *   cookie yet), exactly like any other first-time visitor
 *        |
 *   phone resolves the handoff — server overwrites the cookie to A
 *   unconditionally, regardless of what the phone had (app/api/
 *   device-handoffs/resolve/route.ts)
 *        |
 *   phone navigates again — middleware sees A present and leaves it alone
 *
 * Driven directly against the API (this branch predates Route Assist's
 * landing page), which is exactly the surface this interaction goes through
 * regardless of which UI sits on top of it.
 */
async function deviceHandoffRun(browser: Awaited<ReturnType<typeof chromium.launch>>, publicId: string) {
  const prisma = new PrismaClient();

  const desktopCtx = await browser.newContext();
  const desktop = await desktopCtx.newPage();
  await desktop.goto(`${BASE}${SERVICE_PATH}`, { waitUntil: "networkidle" });
  const desktopId = await cookieOf(desktopCtx);
  check("device handoff: desktop established session A", !!desktopId);

  const sessionResp = await desktop.evaluate(
    async ({ publicId, serviceSlug }) => {
      const res = await fetch("/api/guided-flow-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-price2book-site": publicId },
        body: JSON.stringify({ serviceSlug }),
      });
      return res.json();
    },
    { publicId, serviceSlug: SERVICE_SLUG }
  );
  const guidedFlowSessionId = sessionResp.id as string;
  check("device handoff: desktop's GuidedFlowSession created", !!guidedFlowSessionId, JSON.stringify(sessionResp));

  const handoffResp = await desktop.evaluate(
    async ({ publicId, guidedFlowSessionId }) => {
      const res = await fetch("/api/device-handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-price2book-site": publicId },
        body: JSON.stringify({ guidedFlowSessionId, taskType: "ROUTE_ASSIST" }),
      });
      return res.json();
    },
    { publicId, guidedFlowSessionId }
  );
  check("device handoff: QR handoff created", !!handoffResp.url, JSON.stringify(handoffResp));
  const token = decodeURIComponent(new URL(handoffResp.url).pathname.split("/").pop()!);

  await desktopCtx.close();

  // Phone: genuinely fresh context, no cookie.
  const phoneCtx = await browser.newContext();
  const phone = await phoneCtx.newPage();
  await phone.goto(`${BASE}${SERVICE_PATH}`, { waitUntil: "networkidle" });
  const phonePreResolve = await cookieOf(phoneCtx);
  check("device handoff: phone's first [site] navigation gets a middleware-minted id (B)", !!phonePreResolve && phonePreResolve !== desktopId, `phone=${phonePreResolve} desktop=${desktopId}`);

  const resolveResp = await phone.evaluate(
    async ({ publicId, token }) => {
      const res = await fetch(`/api/device-handoffs/resolve?token=${encodeURIComponent(token)}`, {
        headers: { "x-price2book-site": publicId },
      });
      return { ok: res.ok, body: await res.json() };
    },
    { publicId, token }
  );
  check("device handoff: resolve succeeds", resolveResp.ok, JSON.stringify(resolveResp));

  const phonePostResolve = await cookieOf(phoneCtx);
  check("device handoff: resolve overwrites the phone's id to the desktop's (A)", phonePostResolve === desktopId, `phone=${phonePostResolve} desktop=${desktopId}`);

  const navResp = await phone.goto(`${BASE}${SECOND_PATH}`, { waitUntil: "networkidle" });
  const navSetCookies = (await navResp!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.includes(COOKIE_NAME));
  check("device handoff: subsequent middleware navigation does not touch the assigned identity", navSetCookies.length === 0, JSON.stringify(navSetCookies));
  const phoneAfterNav = await cookieOf(phoneCtx);
  check("device handoff: identity A survives navigation", phoneAfterNav === desktopId, `after nav=${phoneAfterNav} desktop=${desktopId}`);

  await phoneCtx.close();

  const dbSession = await prisma.guidedFlowSession.findUnique({ where: { id: guidedFlowSessionId } });
  check("device handoff: GuidedFlowSession.sessionId is still the desktop's original id", dbSession?.sessionId === desktopId, `db=${dbSession?.sessionId} desktop=${desktopId}`);
  await prisma.$disconnect();
}

/**
 * The created GuidedFlowSession's sessionId matches the browser cookie, and
 * a subsequent Visual Assist task access succeeds — proving the original
 * 404 (visual-assist-tasks POST against an orphaned session) is fixed.
 */
async function sessionOwnershipRun(browser: Awaited<ReturnType<typeof chromium.launch>>, publicId: string) {
  const prisma = new PrismaClient();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}${SERVICE_PATH}`, { waitUntil: "networkidle" });
  const cookie = await cookieOf(ctx);
  check("session ownership: browser has an established id", !!cookie);

  const recent = await prisma.guidedFlowSession.findFirst({
    where: { serviceSlug: SERVICE_SLUG, sessionId: cookie },
    orderBy: { createdAt: "desc" },
  });
  check("session ownership: GuidedFlowSession.sessionId matches the browser cookie", !!recent, `cookie=${cookie}`);

  if (recent) {
    const taskResp = await page.evaluate(
      async ({ publicId, id }) => {
        const res = await fetch(`/api/guided-flow-sessions/${id}/visual-assist-tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-price2book-site": publicId },
          body: JSON.stringify({ taskType: "ROUTE_ASSIST" }),
        });
        return { status: res.status, body: await res.json() };
      },
      { publicId, id: recent.id }
    );
    check("session ownership: subsequent Visual Assist task creation succeeds (not 404)", taskResp.status === 200, JSON.stringify(taskResp));
  }

  await ctx.close();
  await prisma.$disconnect();
}

async function main() {
  const browser = await chromium.launch();
  const prisma = new PrismaClient();
  const site = await prisma.contractorSite.findUnique({ where: { hostedSlug: "elite-electric" }, select: { publicId: true } });
  await prisma.$disconnect();
  if (!site) throw new Error("elite-electric ContractorSite not found in this database");
  const publicId = site.publicId;

  console.log(`\n========== Fresh-visit single-identity proof (${RUNS} runs) ==========`);
  for (let i = 0; i < RUNS; i++) {
    await freshVisitRun(browser, i, "fresh");
  }

  console.log(`\n========== Existing-cookie / reload / navigation proof ==========`);
  await reloadAndNavigateRun(browser);

  console.log(`\n========== GuidedFlowSession ownership + Visual Assist task access ==========`);
  await sessionOwnershipRun(browser, publicId);

  console.log(`\n========== Device Handoff regression ==========`);
  await deviceHandoffRun(browser, publicId);

  await browser.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
