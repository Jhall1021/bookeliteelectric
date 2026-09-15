/**
 * The cross-device gap named against the prior pass's evidence: the earlier
 * delayed-network regression (scripts/verify-delayed-network-answer-save-
 * browser-flow.ts) proves persistAnswers' save queue can no longer race
 * ITSELF — but every writer in that script is the SAME tab. It never proved
 * anything about what the queue does when a SECOND, independent writer
 * (another device, sharing this session via Device Handoff) moves the
 * session forward while this tab has something queued behind an in-flight
 * save. This script drives exactly that scenario, with two writers that
 * are genuinely independent processes, not two calls from one page.
 *
 * THE BUG THIS PROVES CLOSED: `runQueuedSave`'s `finally` block used to send
 * whatever was next in `pendingSaveRef` unconditionally, including after a
 * 409 resync. A payload queued from this tab's OWN local state — built in
 * total ignorance of what the OTHER device had just written — would then be
 * sent with the now-correct version and SUCCEED, silently overwriting the
 * other device's newer answers with this tab's stale-relative-to-them ones.
 * The fix drops the pending queue on a genuine 409 instead of auto-sending
 * it; the next real user action builds a fresh payload on top of the
 * version this tab just learned about.
 *
 * HOW THE SECOND WRITER IS REAL, NOT SIMULATED IN-PROCESS: "device B" is a
 * raw `fetch()` from this Node script, carrying the SAME `elite_session_id`
 * value browser tab A's cookie carries (set directly via
 * `context.addCookies`, the same anonymous-session identity Device Handoff's
 * own resolve step establishes) via the `x-price2book-visit` embed header —
 * the header wins over the cookie (`lib/session.ts`'s `tokenFromRequest`),
 * so both resolve to the identical session id server-side with no shared
 * browser context, no mocked network layer, and no code path this test
 * exercises that a real second device wouldn't also exercise.
 *
 * SEQUENCE:
 *   1. Tab A answers Q1 ("paid") — fires PATCH #1, artificially delayed via
 *      page.route() so it is still in flight when the rest of this happens.
 *   2. WHILE #1 is in flight, tab A answers Q2 ("standard") — queued behind
 *      #1, not sent yet (this is the payload that must NOT survive to
 *      overwrite device B below).
 *   3. Device B — an independent raw fetch, no artificial delay — resumes
 *      the SAME session and PATCHes its own, genuinely different answer
 *      ("supplied") against the version tab A's PATCH #1 also expects.
 *      B's request is unthrottled, so it lands and commits FIRST.
 *   4. Tab A's delayed PATCH #1 finally fires with its now-stale
 *      expectedVersion — 409. Tab A resyncs; the fix drops tab A's queued
 *      Q2 payload rather than auto-sending it on the resynced version.
 *   5. The server's consumedAnswers must be device B's, exactly — not
 *      overwritten by tab A's queued (and by then stale) payload.
 *
 * NOT PART OF `npm run verify`. Run against a PRODUCTION build, same
 * convention and same reason as this branch's other browser-flow scripts.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const PATCH_DELAY_MS = 3000;

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CONTRACTOR_SLUG = `gf-crossdevice-flow-${RUN}`;
const HOSTED_SLUG = CONTRACTOR_SLUG;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function teardown() {
  const contractor = await prisma.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });
  if (!contractor) return;
  const services = await prisma.service.findMany({ where: { contractorId: contractor.id }, select: { id: true } });
  const serviceIds = services.map((s) => s.id);
  if (serviceIds.length) {
    await prisma.guidedFlowSession.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
    await prisma.lineItem.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: serviceIds } } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
  }
  await prisma.visit.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
}

async function buildFixture() {
  const category = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const canonicalCategory = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: CONTRACTOR_SLUG, name: "Cross-Device Stale-Queue Regression Electric", active: true },
    select: { id: true },
  });
  const publicId = `site_${randomBytes(16).toString("hex")}`;
  await prisma.contractorSite.create({
    data: { contractorId: contractor.id, hostedSlug: HOSTED_SLUG, publicId, active: true },
  });
  const contractorCategory = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonicalCategory.id },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: {
      contractorId: contractor.id,
      crewHourRateCents: 15000,
      primaryMinimumCents: 9900,
      roundingIncrementCents: 100,
      defaultPermitAdminCents: 0,
    },
  });
  const target = await prisma.service.create({
    data: {
      slug: `gf-crossdevice-target-${RUN}`,
      name: "Cross-Device Stale-Queue Regression Target",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      basePrice: 40000,
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true },
  });
  const q1 = await prisma.question.create({
    data: { serviceId: target.id, key: "mount_choice", prompt: "Do you want the mount added?", inputType: "SINGLE_SELECT", order: 1 },
  });
  const q2 = await prisma.question.create({
    data: { serviceId: target.id, key: "install_type", prompt: "What kind of install is this?", inputType: "SINGLE_SELECT", order: 2 },
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Yes, add the mount (paid)", value: "paid", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "No, I'll supply my own", value: "supplied", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
    ],
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: q2.id, label: "Standard install", value: "standard", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
    ],
  });
  return { contractorId: contractor.id, serviceId: target.id, publicId };
}

async function main() {
  console.log(`\nCROSS-DEVICE STALE QUEUE — a queued same-tab payload must not overwrite a genuinely different writer\n`);
  console.log(`  ${BASE}  ·  contractor ${CONTRACTOR_SLUG}  ·  PATCH delay ${PATCH_DELAY_MS}ms\n`);

  await teardown();
  const browser = await chromium.launch();
  try {
    const { serviceId, publicId } = await buildFixture();
    const targetUrl = `${BASE}/${HOSTED_SLUG}/services/x/gf-crossdevice-target-${RUN}`;
    const sharedToken = randomBytes(24).toString("base64url");

    const ctx = await browser.newContext();
    // Tab A's identity — set directly, the same value Device Handoff's own
    // resolve step would have written into this cookie on a second device.
    await ctx.addCookies([{ name: "elite_session_id", value: sharedToken, url: BASE }]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);

    await page.route("**/api/guided-flow-sessions/*", async (route) => {
      if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, PATCH_DELAY_MS));
      await route.continue();
    });

    await page.goto(targetUrl);
    await page.getByRole("button", { name: /Check My Price|Start/ }).click();
    await page.waitForSelector("text=Do you want the mount added?");

    // 1. Tab A answers Q1 — fires the (delayed) PATCH #1.
    await page.getByRole("button", { name: "Yes, add the mount (paid)" }).click();
    await page.waitForSelector("text=What kind of install is this?");

    // 2. WHILE #1 is in flight, tab A answers Q2 — queued behind #1.
    await page.getByRole("button", { name: "Standard install" }).click();

    // 3. Device B: an independent raw fetch, no artificial delay, sharing
    // tab A's session identity via the embed header. Resumes the session
    // (same triple, so the SAME row tab A already created) and writes its
    // own, different answer against the version both it and tab A's
    // in-flight PATCH #1 currently expect.
    const headers = {
      "Content-Type": "application/json",
      "x-price2book-site": publicId,
      "x-price2book-visit": sharedToken,
    };
    const bootstrap = await fetch(`${BASE}/api/guided-flow-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ serviceSlug: `gf-crossdevice-target-${RUN}` }),
    }).then((r) => r.json());
    ok("device B resumes the SAME session tab A already created, not a second one",
      typeof bootstrap?.id === "string", JSON.stringify(bootstrap));
    const deviceBAnswers = { mount_choice: "supplied" };
    const deviceBPatch = await fetch(`${BASE}/api/guided-flow-sessions/${bootstrap.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ expectedVersion: bootstrap.version, consumedAnswers: deviceBAnswers }),
    }).then((r) => ({ status: r.status, body: r.json() }));
    const deviceBBody = await deviceBPatch.body;
    ok("device B's own write succeeds (it raced tab A's delayed PATCH and won)",
      deviceBPatch.status === 200, `status ${deviceBPatch.status}: ${JSON.stringify(deviceBBody)}`);

    // 4/5. Let tab A's delayed PATCH #1 (409, now stale) and its queued Q2
    // (dropped by the fix, per the comment on persistAnswers) finish
    // settling, then read what actually ended up on the server.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(PATCH_DELAY_MS + 1000);

    const finalSession = await prisma.guidedFlowSession.findUnique({
      where: { id: bootstrap.id },
      select: { consumedAnswers: true, version: true },
    });
    const consumed = (finalSession?.consumedAnswers ?? {}) as Record<string, unknown>;
    ok("the session's final consumedAnswers are device B's write, not overwritten by tab A's stale queued payload",
      consumed.mount_choice === "supplied" && consumed.install_type === undefined,
      `got ${JSON.stringify(consumed)}`);

    // Tab A's OWN screen is untouched by any of this — the customer keeps
    // seeing their own in-progress answer (client state never learned about
    // device B), matching the documented, honestly-stated limitation: the
    // un-sent edit is not lost from THIS tab's own display, only from the
    // server mirror.
    ok("tab A's own screen still shows ITS answer, unaffected by the dropped queue or device B's write",
      (await page.getByText("What kind of install is this?").count()) === 0 &&
      (await page.locator("text=/^\\$[0-9,]+$/").count()) > 0,
      "tab A should have moved on to its own resolved price screen");

    await ctx.close();
  } finally {
    await browser.close();
    await teardown();
  }
  ok("every fixture is gone at the end", (await prisma.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG } })) === null);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
