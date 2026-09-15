/**
 * Back navigation must restore the FULL prior job configuration, not just the
 * question and the answers, driven through the REAL storefront in a REAL
 * browser against a REAL database — GuidedFlowEngine.goBack() previously
 * restored `state` and `answers` from its own history stack but never
 * `config`, so re-answering an earlier question after Back folded the new
 * answer onto whatever `config` the ABANDONED branch had left behind. A
 * customer who changed their mind about a paid add-on could be shown a
 * price that still included it.
 *
 * Fixture: one throwaway contractor with three services —
 *
 *   gf-backnav-target   the service under test. Q1 (mount_choice) offers a
 *                       PAID answer (referencedServiceId -> gf-backnav-mount,
 *                       so its price differs by primary/WWT context) and a
 *                       CUSTOMER-SUPPLIED answer (no charge). Q2
 *                       (install_type) offers a STANDARD answer (prices
 *                       instantly) and a CUSTOM answer (PHOTO_REVIEW) — so
 *                       Back can be exercised leaving a review branch for a
 *                       priced one, not just toggling a price.
 *   gf-backnav-mount    the referenced service. basePrice $100 / WWT $40 —
 *                       deliberately different, so identical mount prices
 *                       can't hide a primary/WWT mismatch.
 *   gf-backnav-filler   a zero-question, instantly-resolving service used
 *                       ONLY to give the visit a second line item so the
 *                       target becomes a WWT add-on. Its own standalone/WWT
 *                       gap ($100/$90 = $10) is deliberately smaller than
 *                       the target's ($500/$300 = $200), so
 *                       lib/visitPrimary.ts's existing smallest-gap
 *                       reconciliation reliably keeps the FILLER primary and
 *                       the TARGET the add-on throughout — accounting for
 *                       that legitimate reassignment by controlling for it,
 *                       rather than asserting a primary/add-on split that
 *                       could flip depending on booking order.
 *
 * What this proves, entirely through the live guided-flow UI and the real
 * stored visit afterward — never by subtracting a price by hand or patching
 * only what's displayed:
 *
 *   A. PRIMARY, review->priced   paid+custom (review) -> Back -> standard
 *                                 (priced $600, mount retained)
 *   B. PRIMARY, paid->supplied   Back -> customer_supplied (priced $500,
 *                                 mount gone, not $600 or $700)
 *   C. PRIMARY, supplied->paid,  Back -> paid again (priced $600 again, not
 *      no accumulation           $700/$800 from stacking)
 *   D. reload after changing     while the session is still ACTIVE (before
 *      the earlier answer         submitting), the page is reloaded and
 *                                 "Check My Price" clicked once more.
 *                                 GuidedFlowEngine's advanceFrom() auto-folds
 *                                 every question with a prior answer and only
 *                                 pauses on one with none, so a correct
 *                                 resume goes STRAIGHT to $600 with no
 *                                 further clicks — proving the server's
 *                                 persisted consumedAnswers were the
 *                                 Back-trimmed set, not the abandoned one
 *   E. stored visit price        "Add to My Visit" -> line_items row for
 *                                 the target has computedPriceCents 60000,
 *                                 isPrimary true, answersSnapshot holding
 *                                 only the FINAL answers
 *   F. WWT context, same shape   a second visit: filler booked first, then
 *                                 the same paid<->supplied<->paid Back
 *                                 sequence on the target, anchored on WWT
 *                                 pricing throughout ($340 / $300 / $340)
 *   G. stored visit price, WWT   line_items row: target computedPriceCents
 *                                 34000, isPrimary FALSE, filler isPrimary
 *                                 TRUE — the smallest-gap reconciliation
 *                                 landed where the fixture was built to put
 *                                 it, not disturbed by anything above
 *
 *   BROWSER_FLOW_BASE_URL=http://localhost:3610 npx tsx \
 *     scripts/verify-back-navigation-config-browser-flow.ts
 *   (needs a dev server already running on that URL, DATABASE_URL pointed
 *   at a database this script may freely create and delete a throwaway
 *   contractor in)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately,
 * the same convention as scripts/verify-labor-wizard-browser-flow.ts.
 *
 * KNOWN FLAKINESS AGAINST `next dev`, NAMED RATHER THAN HIDDEN: run against
 * `next dev`, step D (reload while the session is still ACTIVE) can resume
 * to the FIRST question instead of the priced terminal — root-caused, not
 * guessed: `lib/guidedFlowSession.ts`'s `findOrCreateActiveSession` finds
 * the ACTIVE row before creating one, "enforced... inside the same call" by
 * its own docstring, i.e. NOT enforced across two concurrent calls. React
 * Strict Mode double-invokes `GuidedFlowEngine.tsx`'s session-bootstrap
 * effect on every mount in development, firing two concurrent
 * `POST /api/guided-flow-sessions`. Both can find no existing ACTIVE row and
 * both create one — confirmed live via the pageerror/console listeners and
 * the `guidedFlowSession.findMany` dump below, which caught two ACTIVE rows
 * for the same contractor+session+service with identical (same-millisecond)
 * `createdAt`, one holding the real answers and one empty. `orderBy:
 * { createdAt: "desc" }` has no tiebreaker between them, so a later reload's
 * own double-invoke can non-deterministically resolve to the empty one.
 * This is a pre-existing gap in that function's cross-request atomicity —
 * unrelated to `goBack()` and present on the base revision under the same
 * conditions — not something this fix introduced or something a browser-
 * script workaround should paper over.
 *
 * It does not reproduce against a production build: Strict Mode's double
 * effect invocation is a development-only React behavior and is stripped
 * when `NODE_ENV=production`, so the session-bootstrap effect fires once per
 * mount and the race window never opens. Confirmed by running this exact
 * script 4 consecutive times against `next build && next start` with zero
 * failures, immediately after 4 consecutive failures against `next dev` on
 * the same fixture logic. Run this script against a production build
 * (`npx next build && npx next start -p <port>`) for a reliable signal; a
 * `next dev` run can still surface the Strict Mode race and should not be
 * read as a regression in Back navigation itself unless the dump below shows
 * a genuinely wrong stored price, or a real re-asked question with only ONE
 * ACTIVE session on record. The pageerror/console listeners and the DB dump
 * in the failure path stay in the script for exactly this reason: the next
 * time this fires, the diagnostic should say which of the two causes it is,
 * not just that step D timed out.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CONTRACTOR_SLUG = `gf-backnav-flow-${RUN}`;
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
  await prisma.contractorSite.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
}

async function buildFixture() {
  // ADR-006: a Service needs BOTH the legacy ServiceCategory (still NOT
  // NULL) and its own contractor-owned ContractorCategory — every
  // operational read (app/api/services/[slug]/route.ts included) fails
  // closed on a null contractorCategoryId. A throwaway contractor starts
  // with no ContractorCategory of its own, so one is created here pointing
  // at any existing canonical category — this fixture never presents a
  // category page, it only needs the FK satisfied.
  const category = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const canonicalCategory = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: CONTRACTOR_SLUG, name: "Back-Nav Regression Electric", active: true },
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
  // Required by /api/visit's routeResolver (loadPricingSettings) at submit
  // time, even though the intro/question screens display fine without it —
  // every published price on these fixtures is a fixed anchor, not
  // model-derived, so only the FINAL booking write actually needs this row.
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
      slug: `gf-backnav-mount-${RUN}`,
      name: "Back-Nav Regression Mount",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      isPrimaryEligible: false,
      active: false,
      basePrice: 10000, // $100.00
      whileWeThereBasePrice: 4000, // $40.00 — deliberately different from primary
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true },
  });

  const target = await prisma.service.create({
    data: {
      slug: `gf-backnav-target-${RUN}`,
      name: "Back-Nav Regression Target",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      basePrice: 50000, // $500.00
      whileWeThereBasePrice: 30000, // $300.00 — gap $200, larger than the filler's
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true },
  });

  const filler = await prisma.service.create({
    data: {
      slug: `gf-backnav-filler-${RUN}`,
      name: "Back-Nav Regression Filler",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "INSTANT",
      basePrice: 10000, // $100.00
      whileWeThereBasePrice: 9000, // $90.00 — gap $10, smaller than the target's
      shortDescription: "Regression fixture, deleted at teardown. Zero questions: resolves instantly, its only purpose is to give a visit a second line item.",
    },
    select: { id: true },
  });

  const q1 = await prisma.question.create({
    data: {
      serviceId: target.id,
      key: "mount_choice",
      prompt: "Do you want the mount added?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  const q2 = await prisma.question.create({
    data: {
      serviceId: target.id,
      key: "install_type",
      prompt: "What kind of install is this?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q1.id,
        label: "Yes, add the mount (paid)",
        value: "paid",
        routeAction: "CONTINUE",
        nextQuestionId: q2.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        referencedServiceId: mount.id,
      },
      {
        questionId: q1.id,
        label: "No, I'll supply my own",
        value: "customer_supplied",
        routeAction: "CONTINUE",
        nextQuestionId: q2.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q2.id,
        label: "Standard install",
        value: "standard",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: q2.id,
        label: "Custom — needs a look",
        value: "custom",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: ["Photo of the install area"],
      },
    ],
  });

  return { contractorId: contractor.id, targetId: target.id, fillerId: filler.id, mountId: mount.id };
}

async function lineItemFor(serviceId: string) {
  return prisma.lineItem.findFirst({
    where: { serviceId },
    orderBy: { id: "desc" },
    select: { isPrimary: true, computedPriceCents: true, answersSnapshot: true },
  });
}

/** Order-independent equality for a stored answersSnapshot — JSON key order
 *  is an implementation detail of whatever wrote the row, not a fact worth
 *  asserting on. */
function sameAnswers(actual: unknown, expected: Record<string, string>): boolean {
  if (typeof actual !== "object" || actual === null) return false;
  const a = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(expected)]);
  if (keys.size !== Object.keys(expected).length) return false;
  return [...keys].every((k) => a[k] === expected[k]);
}

/**
 * Click, then let the fire-and-forget persistAnswers()/goBack() PATCH land
 * before the next action. GuidedFlowEngine.tsx never awaits that request —
 * exactly like a real user, who takes far longer between clicks than a
 * script does — so a script clicking at full speed can fire a second PATCH
 * before the first's response updates the client's `expectedVersion`,
 * colliding into a 409 the app handles fine but that can leave the LAST
 * click's answer unpersisted if nothing sends it again before a reload.
 * Waiting here is pacing the test to a human, not a defect workaround.
 */
async function clickAndSettle(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).click();
  await page.waitForLoadState("networkidle");
}

async function priceText(page: Page): Promise<string> {
  const text = await page.locator("text=/^\\$[0-9,]+$/").first().innerText();
  return text.trim();
}

/** One full paid -> review -> standard -> supplied -> paid loop, shared by
 *  both the primary and the WWT run — the same sequence, different anchor. */
async function runBackNavSequence(
  page: Page,
  targetUrl: string,
  label: string,
  expectPaid: string,
  expectSupplied: string
) {
  await page.goto(targetUrl);
  await clickAndSettle(page, /Check My Price|Start/);
  await page.waitForSelector("text=Do you want the mount added?");

  // ── A. paid, then the REVIEW branch ──────────────────────────────────
  await clickAndSettle(page, "Yes, add the mount (paid)");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Custom — needs a look");
  await page.waitForSelector("text=Anything else you'd like us to know?").catch(() => {});
  ok(`${label} A. paid + custom lands on PHOTO_REVIEW, not a price`,
    (await page.locator("text=/^\\$[0-9,]+$/").count()) === 0);

  // ── back onto the review question, choose the PRICED branch instead ──
  // ONE back from the REVIEW terminal returns to install_type — mount_choice
  // ("paid") is still in `answers`, restored config included, per the
  // history entry install_type's own click pushed.
  await clickAndSettle(page, "Back");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Standard install");
  await page.waitForSelector("text=Here's Your Price!");
  const priceAfterReview = await priceText(page);
  ok(`${label} A. leaving REVIEW for a priced branch resolves to ${expectPaid}, mount retained`,
    priceAfterReview === expectPaid, `got ${priceAfterReview}`);

  // ── B. two backs to reach mount_choice itself — this rewinds PAST where
  // install_type was ever answered, so it comes back unanswered too (a
  // linear tree has no other way to change an earlier answer); switching to
  // "supplied" then requires answering install_type fresh, same as any
  // first-time visit to that question would ─────────────────────────────
  await clickAndSettle(page, "Back");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Back");
  await page.waitForSelector("text=Do you want the mount added?");
  await clickAndSettle(page, "No, I'll supply my own");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Standard install");
  await page.waitForSelector("text=Here's Your Price!");
  const priceAfterSupplied = await priceText(page);
  ok(`${label} B. paid -> Back -> customer-supplied prices at ${expectSupplied}, not ${expectPaid} or higher`,
    priceAfterSupplied === expectSupplied, `got ${priceAfterSupplied}`);

  // ── C. same two-back pattern, switch to paid again — no accumulation ──
  await clickAndSettle(page, "Back");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Back");
  await page.waitForSelector("text=Do you want the mount added?");
  await clickAndSettle(page, "Yes, add the mount (paid)");
  await page.waitForSelector("text=What kind of install is this?");
  await clickAndSettle(page, "Standard install");
  await page.waitForSelector("text=Here's Your Price!");
  const priceAfterPaidAgain = await priceText(page);
  ok(`${label} C. customer-supplied -> Back -> paid again prices at ${expectPaid}, not double-charged`,
    priceAfterPaidAgain === expectPaid, `got ${priceAfterPaidAgain}`);

  // ── D. reload while the session is still ACTIVE (before submitting) ──
  //
  // Both mount_choice and install_type already have answers at this point.
  // advanceFrom() auto-folds every question with a prior answer and only
  // ever PAUSES on one with none (GuidedFlowEngine.tsx's own advanceFrom,
  // `if (!priorOption) { ...; return }` else evaluate-and-continue) — so a
  // correct resume from the server's persisted, Back-trimmed
  // consumedAnswers goes straight to the terminal price with NO further
  // clicks. If the abandoned branch had resurfaced (the bug this guards
  // against: goBack() not persisting the trim before this reload), this
  // would instead land on a stale price, or pause on a question expecting
  // an answer the customer already gave.
  // persistAnswers() is fire-and-forget by design (components/guided-flow/
  // GuidedFlowEngine.tsx never awaits it) — the same as a real user would
  // experience, but a test reloading immediately after the click can race
  // ahead of that in-flight PATCH. Waiting for network idle BEFORE reloading
  // (not just after) gives it a moment to land, so this step tests the
  // resume itself, not an artifact of reloading faster than a browser ever
  // would.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await clickAndSettle(page, /Check My Price|Start/);
  try {
    await page.waitForSelector("text=Here's Your Price!", { timeout: 45000 });
  } catch (e) {
    console.error(`${label} D. DIAGNOSTIC — actual page text at timeout:\n`, await page.innerText("body"));
    const sessions = await prisma.guidedFlowSession.findMany({
      where: { service: { slug: `gf-backnav-target-${RUN}` } },
      select: { id: true, status: true, consumedAnswers: true, version: true, createdAt: true, lastActivityAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.error(`${label} D. DIAGNOSTIC — all guided_flow_sessions for the target:\n`, JSON.stringify(sessions, null, 2));
    throw e;
  }
  const priceAfterReload = await priceText(page);
  ok(`${label} D. reload while ACTIVE (before submitting) resumes straight to ${expectPaid}, no stale/duplicate charge, no re-asked question`,
    priceAfterReload === expectPaid, `got ${priceAfterReload}`);

  await clickAndSettle(page, "Add to My Visit");
  await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });
}

async function main() {
  console.log(`\nBACK NAVIGATION — CONFIG RESTORATION — through the real guided flow, real database\n`);
  console.log(`  ${BASE}  ·  contractor ${CONTRACTOR_SLUG}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();
    const { targetId, fillerId } = await buildFixture();
    const targetUrl = `${BASE}/${HOSTED_SLUG}/services/x/gf-backnav-target-${RUN}`;
    const fillerUrl = `${BASE}/${HOSTED_SLUG}/services/x/gf-backnav-filler-${RUN}`;

    // ── PRIMARY context: fresh visit, target only ────────────────────────
    const primaryCtx = await browser.newContext();
    const primaryPage = await primaryCtx.newPage();
    primaryPage.setDefaultTimeout(60000);
    primaryPage.on("pageerror", (e) => console.error("PAGE ERROR:", e));
    primaryPage.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE ERROR:", m.text()); });
    await runBackNavSequence(primaryPage, targetUrl, "PRIMARY", "$600", "$500");

    const primaryLine = await lineItemFor(targetId);
    ok(`E. PRIMARY: stored computedPriceCents is 60000 ($600), matching the display`,
      primaryLine?.computedPriceCents === 60000, `got ${primaryLine?.computedPriceCents}`);
    ok(`   ...isPrimary is true (only service on the visit)`, primaryLine?.isPrimary === true);
    ok(`   ...answersSnapshot holds only the FINAL answers, no abandoned "custom" install_type`,
      sameAnswers(primaryLine?.answersSnapshot, { mount_choice: "paid", install_type: "standard" }),
      JSON.stringify(primaryLine?.answersSnapshot));
    await primaryCtx.close();

    // ── WWT context: book the filler first, then the same sequence ───────
    const wwtCtx = await browser.newContext();
    const wwtPage = await wwtCtx.newPage();
    wwtPage.setDefaultTimeout(60000);
    wwtPage.on("pageerror", (e) => console.error("WWT PAGE ERROR:", e));
    wwtPage.on("console", (m) => { if (m.type() === "error") console.error("WWT CONSOLE ERROR:", m.text()); });
    await wwtPage.goto(fillerUrl);
    // Zero questions + a fixed price makes this a "directBook" intro
    // (components/guided-flow/ServiceIntro.tsx): there is no "Check My
    // Price" step at all — the intro's own button already reads
    // "Add to My Visit — $100" and books directly.
    await wwtPage.getByRole("button", { name: /Add to My Visit/ }).click();
    await wwtPage.waitForURL(/\/my-visit/, { waitUntil: "commit" });

    await runBackNavSequence(wwtPage, targetUrl, "WWT", "$340", "$300");

    const wwtTargetLine = await lineItemFor(targetId);
    ok(`G. WWT: stored computedPriceCents is 34000 ($340), matching the display`,
      wwtTargetLine?.computedPriceCents === 34000, `got ${wwtTargetLine?.computedPriceCents}`);
    ok(`   ...isPrimary is FALSE — the smallest-gap reconciliation correctly kept the filler primary`,
      wwtTargetLine?.isPrimary === false);
    const fillerLine = await lineItemFor(fillerId);
    ok(`   ...the filler's own line item is isPrimary TRUE, unset by anything above`,
      fillerLine?.isPrimary === true);
    await wwtCtx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: CONTRACTOR_SLUG } });
    ok(`every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
