/**
 * The question editor's unsaved-changes guard, driven through the REAL
 * admin UI in a REAL browser, signed in as a disposable account created
 * through the actual sign-up + email-verification pipeline — matching
 * verify-labor-wizard-browser-flow.ts's convention.
 *
 * What this proves — the three genuinely different leaving mechanisms
 * components/admin/questions/useUnsavedChangesGuard.ts documents, each
 * exercised for real, not asserted:
 *
 *   internal link, Stay        clicking an internal link (the breadcrumb)
 *                              while dirty shows the prompt, and choosing
 *                              Stay leaves the edit exactly as typed, on
 *                              the same page — nothing was lost
 *   internal link, Discard     choosing "Discard changes and leave" on
 *                              the SAME prompt actually completes the
 *                              original navigation
 *   Save clears the guard      after a successful save, the same link
 *                              click that used to prompt now navigates
 *                              immediately — dirty genuinely cleared,
 *                              not just visually reset
 *   Cancel clears the guard    same proof, via Cancel instead of Save
 *   browser back, Stay         pressing the browser's own back button
 *                              while dirty is intercepted too — the URL
 *                              stays put, the edit survives, Stay leaves
 *                              it there
 *   browser back, Discard      the second back-then-discard cycle
 *                              actually lands on the real previous page
 *   browser FORWARD is safe    pressing forward while dirty no longer
 *                              misdirects backward the way the previous
 *                              version of this guard did — it's simply
 *                              inert (nothing to traverse to; see the
 *                              hook's own header for why), URL and edit
 *                              both completely undisturbed
 *   no phantom stops           after a clean Save (or Cancel) with no
 *                              back/forward press in between, a single
 *                              Back or Forward press moves exactly one
 *                              real step — nothing was ever pushed onto
 *                              history in the first place
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3423 \
 *     npx tsx scripts/verify-question-editor-navigation-guard-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3423";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-nav-guard-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-nav-guard-flow-${RUN}`;
const EMAIL = `p2b-nav-guard-flow-${RUN}@resend.dev`;

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

/** One contractor, one category, one service with a single question — just enough to make a field dirty. */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Nav Guard Flow Electric", active: true, countryCode: "US" },
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
  const service = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
      slug: "nav-guard-test-service", name: "Nav Guard Test Service", bookingType: "INSTANT", photoState: "NONE",
      active: true, offered: true, fieldLaborHours: 1, requiresTechCount: 1,
      basePrice: 10000, publishedPriceApprovedAt: new Date(),
      questions: {
        create: [{
          key: "q1", prompt: "A question", inputType: "SINGLE_SELECT", order: 0,
          options: { create: [{ value: "a", label: "An answer", order: 0, routeAction: "RESOLVE_INSTANT", priceModifierCents: 0 }] },
        }],
      },
    },
    select: { id: true },
  });
  return { contractorId: contractor.id, serviceId: service.id };
}

async function main() {
  console.log(`\nQUESTION EDITOR — UNSAVED-CHANGES GUARD — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Nav Guard Owner");
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

    const { serviceId } = await buildFixture(user.id);
    const serviceUrl = `${BASE}/dashboard/services/${serviceId}`;
    const catalogUrl = `${BASE}/dashboard/services`;

    async function openEditor() {
      await page.goto(serviceUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Customer questions" }).click();
      await page.getByRole("button", { name: "Edit questions" }).click();
      await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    }

    async function makeEdit(text: string) {
      const help = page.locator('input[placeholder="Optional helper text shown under the question"]');
      await help.fill(text);
      return help;
    }

    const servicesLink = () => page.getByRole("link", { name: "Services & Pricing" }).first();

    // ── 1. internal link, Stay — the edit survives, nothing navigated ──────
    await openEditor();
    const help1 = await makeEdit("edit one — should survive Stay");
    await servicesLink().click();
    await page.waitForSelector("text=Leave without saving?", { timeout: 5000 });
    ok(`1. an internal link click while dirty shows the Stay/Discard prompt`, true);
    await page.getByRole("button", { name: "Stay" }).click();
    ok(`   ...Stay leaves the URL unchanged`, page.url() === serviceUrl, page.url());
    ok(`   ...and the edit is still exactly what was typed — nothing was lost`, (await help1.inputValue()) === "edit one — should survive Stay");

    // ── 2. internal link, Discard — the SAME click now actually navigates ──
    await servicesLink().click();
    await page.waitForSelector("text=Leave without saving?", { timeout: 5000 });
    await page.getByRole("button", { name: "Discard changes and leave" }).click();
    await page.waitForURL((u) => u.pathname === "/dashboard/services", { timeout: 5000 });
    ok(`2. Discard completes the original navigation`, page.url().endsWith("/dashboard/services"), page.url());

    // ── 3. Save clears the guard — the next link click gets no prompt ──────
    await openEditor();
    await makeEdit("edit two — will be saved");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForSelector("text=✓ Saved.", { timeout: 10000 });
    await servicesLink().click();
    const noPromptAfterSave = await page.waitForSelector("text=Leave without saving?", { timeout: 1500 }).then(() => false).catch(() => true);
    await page.waitForURL((u) => u.pathname === "/dashboard/services", { timeout: 5000 });
    ok(`3. after Save, the same link navigates immediately — no prompt`, noPromptAfterSave && page.url().endsWith("/dashboard/services"));

    // ── 4. Cancel clears the guard too ──────────────────────────────────────
    await openEditor();
    await makeEdit("edit three — will be canceled");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await servicesLink().click();
    const noPromptAfterCancel = await page.waitForSelector("text=Leave without saving?", { timeout: 1500 }).then(() => false).catch(() => true);
    await page.waitForURL((u) => u.pathname === "/dashboard/services", { timeout: 5000 });
    ok(`4. after Cancel, the same link navigates immediately — no prompt`, noPromptAfterCancel && page.url().endsWith("/dashboard/services"));

    // ── 5. browser back/forward — Stay, then Discard ────────────────────────
    // Real history: catalog -> service editor, via an actual click, so a
    // real back-press has somewhere genuine to go.
    await page.goto(catalogUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Nav Guard Test Service" }).click();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    const help2 = await makeEdit("edit four — survives a back-button Stay");

    await page.goBack();
    await page.waitForSelector("text=Leave without saving?", { timeout: 5000 });
    ok(`5. the browser's own back button is intercepted too`, true);
    ok(`   ...the URL never actually left the service editor`, page.url() === serviceUrl, page.url());
    await page.getByRole("button", { name: "Stay" }).click();
    ok(`   ...Stay leaves the edit intact`, (await help2.inputValue()) === "edit four — survives a back-button Stay");

    await page.goBack();
    await page.waitForSelector("text=Leave without saving?", { timeout: 5000 });
    await page.getByRole("button", { name: "Discard changes and leave" }).click();
    await page.waitForURL((u) => u.pathname === "/dashboard/services", { timeout: 5000 });
    ok(`6. Discard on a back-button prompt lands on the REAL previous page`, page.url().endsWith("/dashboard/services"), page.url());

    // ── 7. browser FORWARD while dirty is a safe no-op — never misdirected ──
    // Real Catalog → Service → Overview, so stepping back onto the editor
    // leaves a genuine forward target (Overview). Making Back safe requires
    // arming a same-url guard entry the instant an edit starts, and the
    // History API has no way to insert an entry ahead of the current one
    // without destroying whatever real page was already there — so that
    // arming unavoidably discards the Overview forward-entry the moment the
    // field is edited, before Forward is ever pressed. The fix this round
    // is not "Forward reaches Overview" (the browser has nothing left to
    // traverse to, through no fault of the guard's direction logic) — it's
    // that Forward no longer does the WRONG thing the way it used to
    // (silently landing one step backward). It now does nothing at all:
    // the edit and the URL are both completely undisturbed.
    const dashboardUrl = `${BASE}/dashboard`;
    await page.goto(catalogUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Nav Guard Test Service" }).click();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    await page.getByRole("link", { name: "Overview" }).click();
    await page.waitForURL(dashboardUrl, { timeout: 5000 });

    await page.goBack();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    const help3 = await makeEdit("edit five — untouched by a forward press while dirty");

    await page.goForward();
    const noPromptOnForward = await page.waitForSelector("text=Leave without saving?", { timeout: 1500 }).then(() => false).catch(() => true);
    ok(`7. pressing FORWARD while dirty is a safe no-op — not misdirected backward`, noPromptOnForward, "a Stay/Discard prompt appeared for a press with nothing to traverse to");
    ok(`   ...the URL is exactly where it was`, page.url() === serviceUrl, page.url());
    ok(`   ...and the edit is completely undisturbed`, (await help3.inputValue()) === "edit five — untouched by a forward press while dirty");

    // ── 8. after Save with no detour, Back/Forward move exactly one step ──
    // Nothing was ever pushed onto history (no back/forward was pressed
    // while dirty), so there is no extra stop for the guard to introduce.
    await page.goto(catalogUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Nav Guard Test Service" }).click();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    await makeEdit("edit seven — saved, no detour");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForSelector("text=✓ Saved.", { timeout: 10000 });

    await page.goBack();
    await page.waitForURL(catalogUrl, { timeout: 5000 });
    ok(`8. after Save, one Back press lands directly on the catalog — no phantom stop`, page.url() === catalogUrl, page.url());
    await page.goForward();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    ok(`   ...and one Forward press returns directly to the service editor`, page.url() === serviceUrl, page.url());

    // ── 9. Cancel behaves the same way ──
    await page.goto(catalogUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Nav Guard Test Service" }).click();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    await page.getByRole("button", { name: "Customer questions" }).click();
    await page.getByRole("button", { name: "Edit questions" }).click();
    await page.waitForSelector('input[placeholder="Optional helper text shown under the question"]');
    await makeEdit("edit eight — canceled, no detour");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.goBack();
    await page.waitForURL(catalogUrl, { timeout: 5000 });
    ok(`9. after Cancel, one Back press lands directly on the catalog — no phantom stop`, page.url() === catalogUrl, page.url());
    await page.goForward();
    await page.waitForURL(serviceUrl, { timeout: 5000 });
    ok(`   ...and one Forward press returns directly to the service editor`, page.url() === serviceUrl, page.url());

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`10. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
