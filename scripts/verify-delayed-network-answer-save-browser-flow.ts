/**
 * Overlapping answer saves under a DELAYED network — through the real
 * guided flow, a real browser, a real database, with `page.route()`
 * artificially slowing every `PATCH /api/guided-flow-sessions/:id` so a
 * prior save is still in flight when the customer clicks Back and
 * re-answers, on purpose, on every run — not hoping a fast script happens
 * to race itself.
 *
 * THE SCENARIO scripts/verify-back-navigation-config-browser-flow.ts's own
 * `clickAndSettle` helper was built to AVOID (pacing every click to let the
 * prior PATCH land first, so that script can prove Back navigation's
 * CONFIG restoration without a save race muddying the result). This script
 * deliberately does the opposite for one specific sequence: answer Q1
 * ("paid"), then — WHILE that PATCH is still artificially delayed and has
 * not yet returned — click Back and re-answer Q1 differently
 * ("customer_supplied") before continuing to a price.
 *
 * WHAT USED TO BREAK: `persistAnswers` fired a new PATCH per call with
 * whatever `expectedVersion` was in React state at that instant. Two calls
 * in quick succession both read the SAME (not-yet-advanced) version, so the
 * second one — carrying the customer's actual final intent — was rejected
 * with 409. Worse, the 409 handler checked `body.version` at the top level,
 * but the route nests it under `body.current.version`
 * (app/api/guided-flow-sessions/[id]/route.ts) — so the check never
 * matched, the local version never resynced, and every SUBSEQUENT save
 * would 409 forever too, since nothing ever advanced it. The customer's
 * final answer never reached the server; only a reload (which re-fetches
 * from scratch) would ever have shown correct state again, and only by
 * accident of what that reload found.
 *
 * FIXED: `persistAnswers` (components/guided-flow/GuidedFlowEngine.tsx) is
 * now an ORDERED, COALESCED queue — at most one PATCH in flight per tab,
 * later calls while one is pending just replace the pending payload and
 * wait their turn, and each queued save reads the version the PREVIOUS
 * queued save actually resolved with. A same-tab race can no longer 409
 * itself at all; this script's own 409-detecting console listener (the
 * same technique the back-navigation regression's header describes
 * catching a real one with) is asserted to see NONE during this sequence.
 *
 * HONEST, NAMED LIMITATION (also documented on persistAnswers itself): if a
 * 409 happens ANYWAY — because a genuinely different writer, not this tab,
 * moved the session forward — this code does NOT retry this tab's payload
 * on top of theirs; it resyncs the version and stops. This script does not
 * exercise that path (it has only one writer), and does not claim the
 * cross-device reconciliation problem is solved — only that this tab's own
 * requests can no longer manufacture a self-inflicted one.
 *
 * NOT PART OF `npm run verify`. Run against a PRODUCTION build for the same
 * reason scripts/verify-back-navigation-config-browser-flow.ts's header
 * gives — `next dev`'s React Strict Mode double-invokes the session
 * bootstrap effect and can surface an UNRELATED race this script isn't
 * about (see lib/guidedFlowSession.ts, separately fixed and separately
 * proven by scripts/verify-concurrent-session-creation-browser-flow.ts).
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const PATCH_DELAY_MS = 2500;

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CONTRACTOR_SLUG = `gf-delayedsave-flow-${RUN}`;
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
    data: { slug: CONTRACTOR_SLUG, name: "Delayed-Save Regression Electric", active: true },
    select: { id: true },
  });
  await prisma.contractorSite.create({
    data: {
      contractorId: contractor.id,
      hostedSlug: HOSTED_SLUG,
      publicId: `site_${randomBytes(16).toString("hex")}`,
      active: true,
    },
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

  const mount = await prisma.service.create({
    data: {
      slug: `gf-delayedsave-mount-${RUN}`,
      name: "Delayed-Save Regression Mount",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      isPrimaryEligible: false,
      active: false,
      basePrice: 8000, // $80.00
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true },
  });
  const target = await prisma.service.create({
    data: {
      slug: `gf-delayedsave-target-${RUN}`,
      name: "Delayed-Save Regression Target",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      basePrice: 40000, // $400.00
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
      {
        questionId: q1.id, label: "Yes, add the mount (paid)", value: "paid",
        routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1,
        requiredPhotoLabels: [], approvedComponentPriceCents: 0, referencedServiceId: mount.id,
      },
      {
        questionId: q1.id, label: "No, I'll supply my own", value: "customer_supplied",
        routeAction: "CONTINUE", nextQuestionId: q2.id, order: 2,
        requiredPhotoLabels: [], approvedComponentPriceCents: 0,
      },
    ],
  });
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q2.id, label: "Standard install", value: "standard",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0,
      },
    ],
  });

  return { contractorId: contractor.id, targetId: target.id };
}

async function priceText(page: Page): Promise<string> {
  const text = await page.locator("text=/^\\$[0-9,]+$/").first().innerText();
  return text.trim();
}

/** Order-independent equality — JSON key order is an implementation detail
 *  of whatever wrote the row, not a fact worth asserting on. */
function sameAnswers(actual: unknown, expected: Record<string, string>): boolean {
  if (typeof actual !== "object" || actual === null) return false;
  const a = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(expected)]);
  if (keys.size !== Object.keys(expected).length) return false;
  return [...keys].every((k) => a[k] === expected[k]);
}

async function main() {
  console.log(`\nDELAYED NETWORK — OVERLAPPING ANSWER SAVES — real guided flow, real database\n`);
  console.log(`  ${BASE}  ·  contractor ${CONTRACTOR_SLUG}  ·  PATCH delay ${PATCH_DELAY_MS}ms\n`);

  await teardown();
  const browser = await chromium.launch();
  try {
    const { targetId } = await buildFixture();
    const targetUrl = `${BASE}/${HOSTED_SLUG}/services/x/gf-delayedsave-target-${RUN}`;

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);

    let sawConflict = false;
    page.on("console", (m) => {
      if (m.type() === "error" && /409/.test(m.text())) sawConflict = true;
    });

    // Artificial network latency, PATCH only — the bare POST that bootstraps
    // the session is left alone so the page itself still loads promptly.
    await page.route("**/api/guided-flow-sessions/*", async (route) => {
      if (route.request().method() === "PATCH") {
        await new Promise((r) => setTimeout(r, PATCH_DELAY_MS));
      }
      await route.continue();
    });

    await page.goto(targetUrl);
    await page.getByRole("button", { name: /Check My Price|Start/ }).click();
    await page.waitForSelector("text=Do you want the mount added?");

    // Q1 = paid. Fires the FIRST (artificially delayed) PATCH. The client
    // state advances to Q2 immediately — it never awaits this request.
    await page.getByRole("button", { name: "Yes, add the mount (paid)" }).click();
    await page.waitForSelector("text=What kind of install is this?");

    // WHILE that PATCH is still in flight (well inside PATCH_DELAY_MS),
    // Back — this queues a second save (goBack's own persistAnswers) behind
    // the first, per the fix, rather than firing a second overlapping
    // request.
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForSelector("text=Do you want the mount added?");

    // Re-answer differently — the customer's actual final intent for Q1.
    // Still well inside the first PATCH's artificial delay window.
    await page.getByRole("button", { name: "No, I'll supply my own" }).click();
    await page.waitForSelector("text=What kind of install is this?");

    // Resolve Q2 normally.
    await page.getByRole("button", { name: "Standard install" }).click();
    await page.waitForSelector("text=Here's Your Price!", { timeout: PATCH_DELAY_MS * 4 });
    const price = await priceText(page);
    ok(
      "the terminal price reflects the FINAL answer (customer_supplied), not the abandoned first one (paid)",
      price === "$400",
      `got ${price}`
    );

    // Let every queued/delayed save actually land before doing anything
    // else — "verify reload after the latest save is acknowledged", not
    // before. `networkidle` waits for in-flight requests (including the
    // artificially delayed PATCHes) to finish.
    await page.waitForLoadState("networkidle");
    // A little more than the artificial delay again, defensively — the
    // COALESCED second save only starts once the first's response is
    // processed, so it finishes roughly one more delay window after the
    // first, not concurrently with it.
    await page.waitForTimeout(PATCH_DELAY_MS + 500);

    ok(
      "no 409 was ever logged — the fix means this tab cannot race its own saves",
      !sawConflict
    );

    const sessionBeforeReload = await prisma.guidedFlowSession.findFirst({
      where: { serviceId: targetId, status: "ACTIVE" },
      select: { consumedAnswers: true, version: true },
    });
    ok(
      "the server's persisted consumedAnswers hold the FINAL answers only, once acknowledged",
      sameAnswers(sessionBeforeReload?.consumedAnswers, { mount_choice: "customer_supplied", install_type: "standard" }),
      `got ${JSON.stringify(sessionBeforeReload?.consumedAnswers)}`
    );

    // NOW reload — after the latest save is acknowledged, as instructed.
    // Reload always lands back on the intro screen (GuidedFlowEngine's
    // mount effect resets `state` to `{ kind: "intro" }` unconditionally);
    // "Check My Price" is what calls startQuestions() -> advanceFrom(),
    // which auto-folds every question already answered server-side and only
    // pauses on one with none — see scripts/verify-back-navigation-config-
    // browser-flow.ts's own step D for the identical shape.
    await page.reload();
    await page.getByRole("button", { name: /Check My Price|Start/ }).click();
    try {
      await page.waitForSelector("text=Here's Your Price!", { timeout: 20000 });
      const priceAfterReload = await priceText(page);
      ok(
        "reloading AFTER the latest save is acknowledged resumes at the correct, final price with no re-asked question",
        priceAfterReload === "$400",
        `got ${priceAfterReload}`
      );
    } catch (e) {
      console.log("DIAGNOSTIC — actual page text at timeout:\n", await page.innerText("body").catch(() => "(unreadable)"));
      throw e;
    }

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
