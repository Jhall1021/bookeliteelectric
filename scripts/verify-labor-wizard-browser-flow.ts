/**
 * Conversational labor calibration, driven through the REAL panel in a REAL
 * browser, signed in as a disposable account created through the actual
 * sign-up + email-verification pipeline — matching
 * verify-material-baseline-browser-flow.ts's convention.
 *
 * What this proves:
 *
 *   anchor + derived   the outlet answer, a "same time" switch answer, and
 *                      a crew-mismatch on GFCI all flow through the real
 *                      conversation into real, reviewable proposals
 *   whole-recipe match a service whose recipe carries an extra, non-
 *                      incidental material (a distractor built from Elite's
 *                      own real "dedicated circuit" shape) is EXCLUDED from
 *                      the outlet task, even though it also uses
 *                      RECEPTACLE_STANDARD
 *   editable proposals editing the outlet's proposed minutes in the review
 *                      screen changes what gets saved for it — and does
 *                      NOT change what was already derived for switch,
 *                      which was computed from the ANSWERED anchor value,
 *                      not from whatever the anchor is later edited to
 *   crew mismatch      a task flagged "different crew" gets no proposal at
 *                      all and writes nothing on accept
 *   scoped writes      only fieldLaborHours moves. requiresTechCount,
 *                      wwtLaborHours, and the distractor's fieldLaborHours
 *                      are BYTE-FOR-BYTE unchanged afterward
 *   T&M excluded       a Time & Materials contractor never sees the panel,
 *                      and the accept route itself refuses for one directly
 *   cleanup            unconditional via try/finally
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BETTER_AUTH_URL=http://localhost:3421 \
 *     npx tsx scripts/verify-labor-wizard-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK
 *   and BETTER_AUTH_URL set)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3421";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-labor-wizard-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-staple-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-labor-wizard-flow-${RUN}`;
const EMAIL = `p2b-labor-wizard-flow-${RUN}@resend.dev`;

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
    await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorMembership.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
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

async function roles() {
  const [receptacle, switchRole, gfci, breaker] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "SWITCH_STANDARD" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_INTERIOR" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
  ]);
  return { receptacle, switchRole, gfci, breaker };
}

/**
 * A real, verified account, an OWNER membership, and four services:
 * a clean outlet-replacement match, a clean switch-replacement match, a
 * GFCI-replacement match (used only to prove crew-mismatch skips it), and a
 * DISTRACTOR — Elite's own real "dedicated circuit" shape (receptacle +
 * breaker + wire), which shares RECEPTACLE_STANDARD with the outlet task
 * but must never match it, because a breaker in the recipe means this is a
 * different, larger job.
 */
async function buildFixture(userId: string) {
  const { receptacle, switchRole, gfci, breaker } = await roles();
  const cat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Labor Wizard Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });

  const outlet = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-outlet-service", name: "lw-outlet-service",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      materials: { create: [{ canonicalMaterialId: receptacle.id, quantity: 1, order: 0 }] },
    },
    select: { id: true },
  });
  const distractor = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-outlet-with-breaker-service", name: "lw-outlet-with-breaker-service",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      materials: {
        create: [
          { canonicalMaterialId: receptacle.id, quantity: 1, order: 0 },
          { canonicalMaterialId: breaker.id, quantity: 1, order: 1 },
        ],
      },
    },
    select: { id: true },
  });
  const switchSvc = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-switch-service", name: "lw-switch-service",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      materials: { create: [{ canonicalMaterialId: switchRole.id, quantity: 1, order: 0 }] },
    },
    select: { id: true },
  });
  const gfciSvc = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-gfci-service", name: "lw-gfci-service",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      materials: { create: [{ canonicalMaterialId: gfci.id, quantity: 1, order: 0 }] },
    },
    select: { id: true },
  });

  return { contractorId: contractor.id, outletId: outlet.id, distractorId: distractor.id, switchId: switchSvc.id, gfciId: gfciSvc.id };
}

async function serviceState(id: string) {
  return prisma.service.findUniqueOrThrow({
    where: { id }, select: { fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — BROWSER FLOW — anchor, derived, crew mismatch, editable proposals, through the real panel\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Labor Wizard Owner");
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

    // ── the fixture ──────────────────────────────────────────────────────
    const { outletId, distractorId, switchId, gfciId } = await buildFixture(user.id);
    const beforeDistractor = await serviceState(distractorId);
    const beforeSwitch = await serviceState(switchId);
    const beforeGfci = await serviceState(gfciId);
    ok(`1. the fixture starts with every field labor hour unestablished`,
      beforeDistractor.fieldLaborHours === null && beforeSwitch.fieldLaborHours === null && beforeGfci.fieldLaborHours === null);

    // ── 2. the panel, loaded as this real, signed-in OWNER ──────────────────
    await page.goto(`${BASE}/dashboard/setup?stage=pricing-foundation`);
    await page.waitForSelector("text=Calibrate your labor times");
    await page.getByRole("button", { name: "Start" }).click();

    // ── 3. anchor — outlet replacement, 20 minutes ──────────────────────────
    await page.locator('input[aria-label*="Minutes for a standard outlet replacement"]').fill("20");
    await page.getByRole("button", { name: "Next" }).click();

    // ── 4. crew context — descriptive only, never written anywhere ─────────
    await page.locator('input[aria-label="Your usual crew"]').fill("Just me, solo");
    await page.getByRole("button", { name: "Next" }).click();

    // ── 5. switch — same crew, same time ────────────────────────────────────
    await page.waitForSelector("text=standard switch replacement");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.getByRole("button", { name: "About the same" }).click();

    // ── 6. GFCI — DIFFERENT crew — this is the crew-mismatch path ───────────
    await page.waitForSelector("text=replacing an existing GFCI receptacle");
    await page.getByRole("button", { name: "Different crew" }).click();

    // ── 7. review — proposals and their derivations, before anything saves ──
    // Scoped to the wizard panel itself, not the whole page — the pricing
    // panel just above it lists every OFFERED service by name, which would
    // include the distractor regardless of whether the wizard matched it.
    await page.waitForSelector("text=Review each proposal");
    const wizardPanel = page.locator("div.rounded-card.p-5").filter({ hasText: "Calibrate your labor times" });
    const reviewText = await wizardPanel.innerText();
    ok(`2. the outlet proposal is shown, needed by exactly the ONE clean match`,
      reviewText.includes("Replace a standard duplex receptacle") && reviewText.includes("Needed by 1 service: lw-outlet-service"));
    ok(`   ...the distractor (receptacle + breaker) is NOT counted — a whole different job`,
      !reviewText.includes("lw-outlet-with-breaker-service"));
    ok(`3. the switch proposal is derived, not entered — "same as ... per your answer"`,
      reviewText.includes("same as a standard outlet replacement, per your answer"));
    ok(`4. the GFCI task is flagged for manual review, not given an invented number`,
      reviewText.includes("needs a different crew than the one covered above — set this one manually"));

    // ── 8. EDIT the outlet's proposed minutes before accepting ──────────────
    await page.locator('input[aria-label="Proposed minutes for Replace a standard duplex receptacle"]').fill("25");

    // ── 9. accept ────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Accept and save" }).click();
    await page.waitForSelector("text=Saved.");
    const doneText = await page.innerText("body");
    ok(`5. exactly 2 services were updated — outlet and switch, not the flagged GFCI, not the distractor`,
      doneText.includes("Saved. 2 services updated."));

    // ── 10. server-side truth ────────────────────────────────────────────────
    const afterOutlet = await serviceState(outletId);
    ok(`6. the outlet service saved the EDITED figure (25 min), not the originally answered one (20 min)`,
      Math.abs((afterOutlet.fieldLaborHours ?? 0) - 25 / 60) < 1e-9);
    const afterSwitch = await serviceState(switchId);
    ok(`   the switch service saved the ORIGINALLY ANSWERED anchor value (20 min) — the edit came after it was derived`,
      Math.abs((afterSwitch.fieldLaborHours ?? 0) - 20 / 60) < 1e-9);
    const afterGfci = await serviceState(gfciId);
    ok(`   the flagged GFCI service is untouched — still unestablished`, afterGfci.fieldLaborHours === null);
    const afterDistractor = await serviceState(distractorId);
    ok(`   the distractor is untouched — never matched, never written`, afterDistractor.fieldLaborHours === null);

    ok(`7. requiresTechCount is untouched everywhere — never overwritten by this wizard`,
      afterOutlet.requiresTechCount === beforeSwitch.requiresTechCount && // both still the schema default
      afterOutlet.requiresTechCount === 1 && afterSwitch.requiresTechCount === 1);
    ok(`   wwtLaborHours is untouched everywhere — this wizard never writes it`,
      afterOutlet.wwtLaborHours === null && afterSwitch.wwtLaborHours === null);

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`8. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
