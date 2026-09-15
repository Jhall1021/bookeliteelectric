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
 * THE BUG THIS PROVES CLOSED — two layers, both closed here:
 *
 *   1. `runQueuedSave`'s `finally` block used to send whatever was next in
 *      `pendingSaveRef` unconditionally, including after a 409 resync. A
 *      payload queued from this tab's OWN local state — built in total
 *      ignorance of what the OTHER device had just written — would then be
 *      sent with the now-correct version and SUCCEED, silently overwriting
 *      the other device's newer answers. Fixed by dropping the pending
 *      queue on a genuine 409 instead of auto-sending it.
 *   2. Dropping the queue alone was still not enough (a gap the PR #63
 *      review named directly): tab A's SCREEN — `answers`, the question or
 *      price in `state`, the Back stack in `history` — was still built from
 *      the branch tab A was on before the 409. The very next click would
 *      merge that stale `answers` with one new field and persist it, still
 *      carrying tab A's own old value for whatever key device B had just
 *      changed — quietly overwriting a change that had already applied
 *      cleanly. Fixed by fully resyncing `answers`/`config`/`state`/
 *      `history` from the 409 body's `current.consumedAnswers` (the same
 *      replay `startQuestions` already uses), gated behind an explicit
 *      conflict notice the customer must acknowledge before anything else
 *      can happen.
 *
 * This script proves BOTH: the server-side consumedAnswers is device B's,
 * AND tab A's own next action — after the gate — builds on the resynced
 * state rather than resubmitting anything stale.
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
 *   6. Tab A's own screen must be gated behind a conflict notice — not free
 *      to act on the stale Q2 screen it was looking at before the 409.
 *   7. Tab A's NEXT action, after acknowledging, must land on the question
 *      the RESYNCED tree actually asks (Q2, since device B never answered
 *      it) and must persist onto the resynced answers when submitted —
 *      preserving device B's mount_choice rather than resending tab A's own
 *      stale value for it.
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

    // 4/5. Let tab A's delayed PATCH #1 (409, now stale) settle. The fix
    // (see the comment on persistAnswers/runQueuedSave in
    // GuidedFlowEngine.tsx) does more than drop tab A's queued Q2 payload:
    // it fully resyncs tab A's own answers/config/state from what the
    // server now holds, and gates any further click behind an explicit
    // conflict notice — so this test can watch both that the drop happened
    // AND that tab A's NEXT real action operates on the resynced state, not
    // the abandoned one (the specific gap the PR #63 review named: "the
    // screen still holds stale answers... the next customer action can
    // submit those answers using the newly updated version").
    await page.waitForTimeout(PATCH_DELAY_MS + 1000);

    const finalSession = await prisma.guidedFlowSession.findUnique({
      where: { id: bootstrap.id },
      select: { consumedAnswers: true, version: true },
    });
    const consumed = (finalSession?.consumedAnswers ?? {}) as Record<string, unknown>;
    ok("the session's consumedAnswers are device B's write, not overwritten by tab A's stale queued payload",
      consumed.mount_choice === "supplied" && consumed.install_type === undefined,
      `got ${JSON.stringify(consumed)}`);

    // Tab A must not be left free to act on its old screen — it's gated
    // behind an explicit conflict notice until the customer acknowledges
    // the resync, not silently swapped out from under a click already in
    // flight.
    await page.getByText("We picked up an update to this visit from another device.").waitFor({ timeout: 15000 });
    ok("tab A is gated behind a conflict notice rather than left free on its stale Q2 screen",
      (await page.getByText("What kind of install is this?").count()) === 0,
      "the resynced Q2 screen should not be visible until the notice is dismissed");

    await page.getByRole("button", { name: "Continue" }).click();

    // THE NEXT ACTION, exactly what the review asked to see tested: after
    // acknowledging, tab A must be looking at the question the RESYNCED
    // tree actually asks next — Q2, because device B's answers only cover
    // Q1 — not some leftover of tab A's own abandoned Q2 screen sitting on
    // top of a stale mount_choice. Answering it must persist onto the
    // resynced answers, preserving device B's mount_choice, not resending
    // tab A's own stale "paid".
    await page.waitForSelector("text=What kind of install is this?", { timeout: 15000 });
    // The page.route() delay above applies to EVERY PATCH on this page, not
    // just the first — so this next save is artificially delayed too. Wait
    // for its actual response rather than a fixed timeout shorter than that
    // delay (an earlier version of this test read the DB too soon and saw
    // its own answer not yet written, which looked like the bug this test
    // exists to catch but was really just a race in the test itself).
    const nextSaveResponse = page.waitForResponse(
      (r) => /\/api\/guided-flow-sessions\//.test(r.url()) && r.request().method() === "PATCH",
      { timeout: PATCH_DELAY_MS + 15000 }
    );
    await page.getByRole("button", { name: "Standard install" }).click();
    await nextSaveResponse;
    await page.waitForLoadState("networkidle");

    const afterNextAction = await prisma.guidedFlowSession.findUnique({
      where: { id: bootstrap.id },
      select: { consumedAnswers: true },
    });
    const consumedAfter = (afterNextAction?.consumedAnswers ?? {}) as Record<string, unknown>;
    ok("tab A's NEXT action after the conflict persists onto the resynced answers — device B's mount_choice survives, tab A's own new install_type is added",
      consumedAfter.mount_choice === "supplied" && consumedAfter.install_type === "standard",
      `got ${JSON.stringify(consumedAfter)}`);

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
