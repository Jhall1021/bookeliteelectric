/**
 * The question editor's save path, driven through the REAL admin UI in a
 * REAL browser, signed in as a disposable account created through the
 * actual sign-up + email-verification pipeline — matching
 * verify-labor-wizard-browser-flow.ts's convention.
 *
 * Two code-review findings, each exercised for real rather than reasoned
 * about:
 *
 *   saved ids stay stable      add a question and an answer, save, then
 *                              (with NO page reload — this component stays
 *                              mounted, `router.refresh()` alone doesn't
 *                              reach its own React state) edit that SAME
 *                              question again and save a second time. Before
 *                              this fix, the client's local state still
 *                              carried the FIRST save's temporary "new-"
 *                              id — the server would see it as new all over
 *                              again and CREATE A DUPLICATE, leaving the
 *                              original row orphaned. Verified directly
 *                              against the database: exactly one row for
 *                              that question exists after the second save,
 *                              not two.
 *   routing survives           a CONTINUE answer on another question points
 *                              at the newly created one. After the second
 *                              save above, that reference is re-read from
 *                              the database and confirmed to still resolve
 *                              to the SAME (stable) id — not a duplicate's,
 *                              and not dangling.
 *   delete the final question  removing the only question in the tree used
 *                              to fall back to summary mode, which has no
 *                              Save or Cancel of its own — stranding a dirty,
 *                              un-actionable tree. Both controls now stay
 *                              available and are proven to actually work:
 *                              Cancel restores the deleted question, and a
 *                              second delete-then-Save actually removes it
 *                              from the database.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3423 \
 *     npx tsx scripts/verify-question-editor-save-integrity-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3423";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-save-integrity-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-save-integrity-flow-${RUN}`;
const EMAIL = `p2b-save-integrity-flow-${RUN}@resend.dev`;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function verificationLinkFor(email: string): Promise<string | null> {
  let raw = "";
  try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw.split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { to: string; subject: string; text: string }; } catch { return null; } })
    .filter((m): m is { to: string; subject: string; text: string } => m !== null && m.to === email && /confirm/i.test(m.subject));
  return mine.at(-1)?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

async function teardown() {
  const contractor = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (contractor) {
    await prisma.answerOption.deleteMany({ where: { question: { service: { contractorId: contractor.id } } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { service: { contractorId: contractor.id } } }).catch(() => {});
    await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorMembership.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
  }
  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL } } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

/** One contractor, two services, each with one question and one answer — just enough to add/edit/delete against. */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Save Integrity Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  const category = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonical.id, sortOrder: 0 },
    select: { id: true },
  });

  async function makeService(slugSuffix: string, name: string) {
    const service = await prisma.service.create({
      data: {
        contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
        slug: `save-integrity-${slugSuffix}`, name, bookingType: "INSTANT", photoState: "NONE",
        active: true, offered: true, fieldLaborHours: 1, requiresTechCount: 1,
        basePrice: 10000, publishedPriceApprovedAt: new Date(),
        questions: {
          create: [{
            key: "q1", prompt: slugSuffix === "a" ? "First question" : "Only question", inputType: "SINGLE_SELECT", order: 0,
            options: { create: [{ value: "a", label: slugSuffix === "a" ? "Proceed" : "OK", order: 0, routeAction: "RESOLVE_INSTANT", priceModifierCents: 0 }] },
          }],
        },
      },
      select: { id: true },
    });
    return service.id;
  }

  const serviceAId = await makeService("a", "Save Integrity Service A");
  const serviceBId = await makeService("b", "Save Integrity Service B");
  return { contractorId: contractor.id, serviceAId, serviceBId };
}

async function main() {
  console.log(`\nQUESTION EDITOR — SAVE INTEGRITY — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Save Integrity Owner");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector("h1:has-text('Confirm your email')");
    const verifyLink = await verificationLinkFor(EMAIL);
    ok(`0. a real confirmation email was sent`, verifyLink !== null, `nothing addressed to ${EMAIL} in ${SINK}`);
    if (!verifyLink) throw new Error("no verification link — aborting");
    await page.goto(verifyLink);
    const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL }, select: { id: true, emailVerified: true } });
    ok(`   the account is real and verified, not asserted`, user.emailVerified === true);

    const { serviceAId, serviceBId } = await buildFixture(user.id);

    // ── 1-3. add a question, save, edit it again with no reload, save again ──
    await page.goto(`${BASE}/dashboard/services/${serviceAId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');

    await page.getByRole("button", { name: "+ Add a question" }).click();
    await page.locator('input[placeholder="What do you want to ask the customer?"]').fill("Second question");
    // Switching to the new question collapses its one blank answer, same as
    // switching to any other question does — expand it before typing.
    await page.getByRole("button", { name: /unnamed answer/ }).click();
    await page.locator('textarea[placeholder="Answer the customer can pick"]').fill("Yes");
    ok(`1. a new question and answer can be added in the editor`, true);

    // Route Q1's answer to the new question, so a real CONTINUE reference
    // exists to check for survival later.
    await page.getByRole("button", { name: "First question" }).click();
    await page.getByRole("button", { name: /Proceed/ }).click(); // expand the collapsed answer
    const routeActionSelect = page.locator('label:has-text("What happens when they pick this")').locator("xpath=following-sibling::select");
    await routeActionSelect.selectOption({ label: "Continue to next question" });
    const nextQuestionSelect = page.locator('label:has-text("Next question")').locator("xpath=following-sibling::select");
    await nextQuestionSelect.selectOption({ index: 1 }); // the only real choice besides the placeholder
    ok(`2. an answer can be routed (CONTINUE) to the newly added question`, true);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    // "✓ Saved." only ever renders on the success path (setSaved(true) lives
    // exclusively inside `if (res.ok)`) — a failed save would instead show
    // the role="alert" error banner and never reach this text at all, so
    // finding it IS the success proof; a timeout here fails the whole run.
    await page.waitForSelector("text=✓ Saved.", { timeout: 10000 });
    const backToSummaryAfterFirstSave = await page.getByRole("button", { name: "Edit questions" }).isVisible();
    ok(`3. the first save succeeds with the new question and its routing`, backToSummaryAfterFirstSave);

    // No reload — this is the same mounted editor, still holding whatever
    // ids it had before the save resolved. A successful save returns to
    // the summary view, same as any other save; re-enter editing to reach
    // the question that needs a second round of changes.
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    await page.getByRole("button", { name: "Second question" }).click();
    await page.locator('input[placeholder="What do you want to ask the customer?"]').fill("Second question (edited)");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForSelector("text=✓ Saved.", { timeout: 10000 });
    const backToSummaryAfterSecondSave = await page.getByRole("button", { name: "Edit questions" }).isVisible();
    ok(`4. editing that SAME question again (no reload) and saving a second time succeeds`, backToSummaryAfterSecondSave);

    const dbQuestions = await prisma.question.findMany({
      where: { serviceId: serviceAId },
      select: { id: true, prompt: true },
    });
    ok(`5. exactly two questions exist afterward — the second save updated, it didn't duplicate`, dbQuestions.length === 2, `found ${dbQuestions.length}: ${dbQuestions.map((q) => q.prompt).join(", ")}`);
    const editedQuestion = dbQuestions.find((q) => q.prompt === "Second question (edited)");
    ok(`   ...the edited prompt landed on the ORIGINAL row, not a new one`, !!editedQuestion);

    const routedOption = await prisma.answerOption.findFirst({
      where: { question: { serviceId: serviceAId, prompt: "First question" } },
      select: { nextQuestionId: true },
    });
    ok(
      `6. the CONTINUE routing set up before the second save still resolves to the same, stable id`,
      !!editedQuestion && routedOption?.nextQuestionId === editedQuestion.id,
      `routes to ${routedOption?.nextQuestionId}, real id is ${editedQuestion?.id}`
    );

    // ── 7-11. delete the final question — Save and Cancel both stay available ──
    await page.goto(`${BASE}/dashboard/services/${serviceBId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');

    async function deleteTheOnlyQuestion() {
      await page.getByRole("button", { name: "Question actions" }).click();
      await page.getByRole("menuitem", { name: "Delete question" }).click();
    }

    await deleteTheOnlyQuestion();
    await page.waitForSelector("text=No questions left");
    const saveBtn1 = page.getByRole("button", { name: "Save", exact: true });
    const cancelBtn1 = page.getByRole("button", { name: "Cancel", exact: true });
    ok(`7. deleting the last question keeps Save visible and enabled`, (await saveBtn1.isVisible()) && !(await saveBtn1.isDisabled()));
    ok(`   ...and Cancel visible and enabled too`, (await cancelBtn1.isVisible()) && !(await cancelBtn1.isDisabled()));

    await cancelBtn1.click();
    await page.waitForSelector("text=Only question");
    ok(`8. Cancel restores the question that was about to be deleted`, true);

    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    await deleteTheOnlyQuestion();
    await page.waitForSelector("text=No questions left");
    const saveBtn2 = page.getByRole("button", { name: "Save", exact: true });
    const cancelBtn2 = page.getByRole("button", { name: "Cancel", exact: true });
    ok(`9. deleting it again still leaves Save and Cancel available`, (await saveBtn2.isVisible()) && !(await saveBtn2.isDisabled()) && (await cancelBtn2.isVisible()) && !(await cancelBtn2.isDisabled()));

    await saveBtn2.click();
    await page.waitForSelector("text=✓ Saved.", { timeout: 10000 });
    const remaining = await prisma.question.count({ where: { serviceId: serviceBId } });
    ok(`10. Save actually commits the deletion — zero questions remain in the database`, remaining === 0, `found ${remaining}`);

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`11. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
