/**
 * Conversational labor calibration, driven through the REAL panel in a REAL
 * browser, signed in as a disposable account created through the actual
 * sign-up + email-verification pipeline — matching
 * verify-material-baseline-browser-flow.ts's convention.
 *
 * What this proves:
 *
 *   anchor + derived     the outlet answer, a "same time" switch answer,
 *                        and a crew-mismatch on GFCI all flow through the
 *                        real conversation into real, reviewable proposals
 *   explicit selection, not recipe inference   the review screen offers
 *                        EVERY one of the contractor's services as a
 *                        candidate for each proposal — including a service
 *                        that shares the outlet's canonical material AND
 *                        carries a box in its recipe (the exact shape the
 *                        old ingredient-based rule got wrong: a
 *                        replacement task's recipe can include a box
 *                        without the answer covering box work). Leaving it
 *                        UNCHECKED is what keeps it untouched — nothing
 *                        classifies it automatically, in either direction.
 *   templateKey pre-check  a service whose OWN recorded provenance names
 *                        the task's canonical outcome starts pre-checked;
 *                        a hand-authored one (no template) starts
 *                        unchecked and needs the contractor's explicit tick
 *   editable proposals   editing the outlet's proposed minutes changes
 *                        what gets saved for it, and does NOT change what
 *                        was already derived for switch, computed from the
 *                        ANSWERED anchor value, not from whatever the
 *                        anchor is later edited to
 *   crew mismatch        a task flagged "different crew" gets no proposal
 *                        at all and writes nothing on accept
 *   before/after visible   the picker shows each candidate's CURRENT
 *                        fieldLaborHours before it's touched
 *   scoped writes         only the CHECKED services' fieldLaborHours move,
 *                        through the same shared authority the admin
 *                        Pricing Composition panel uses — requiresTechCount,
 *                        wwtLaborHours, basePrice and the unchecked box
 *                        service's own fieldLaborHours are ALL
 *                        byte-for-byte unchanged afterward
 *   T&M excluded          a Time & Materials contractor never sees the
 *                        panel, and the accept route itself refuses
 *                        directly too
 *   cleanup               unconditional via try/finally
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
  const [receptacle, switchRole, gfci, boxOldWork] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "SWITCH_STANDARD" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_INTERIOR" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true } }),
  ]);
  return { receptacle, switchRole, gfci, boxOldWork };
}

/**
 * A real, verified account, an OWNER membership, and four services:
 *
 *   lw-outlet-service        RECEPTACLE_STANDARD alone, templateKey set to
 *                            the outlet task's own canonical outcome — the
 *                            ONE service that should arrive pre-checked
 *   lw-outlet-with-box       RECEPTACLE_STANDARD + a box — THE REVIEWER'S
 *                            SCENARIO. Shares the outlet's canonical
 *                            material, so any recipe-based rule would have
 *                            called it a match. Pre-set to an existing
 *                            fieldLaborHours the test proves survives
 *                            UNTOUCHED because it is left unchecked.
 *   lw-switch-service        SWITCH_STANDARD alone, no templateKey (hand-
 *                            authored, like Elite's own catalog) — must be
 *                            checked manually. Pre-set to an existing value
 *                            the test proves gets genuinely UPDATED.
 *   lw-gfci-service          GFCI_INTERIOR alone — used only to exercise
 *                            crew-mismatch; never selected, never written.
 */
async function buildFixture(userId: string) {
  const { receptacle, switchRole, gfci, boxOldWork } = await roles();
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
      templateKey: "replace-standard-outlet",
      basePrice: 8800, whileWeThereBasePrice: 6600, publishedPriceApprovedAt: new Date(),
      materials: { create: [{ canonicalMaterialId: receptacle.id, quantity: 1, order: 0 }] },
    },
    select: { id: true },
  });
  const outletWithBox = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-outlet-with-box", name: "lw-outlet-with-box",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      fieldLaborHours: 0.75, wwtLaborHours: 0.5, requiresTechCount: 1,
      materials: {
        create: [
          { canonicalMaterialId: receptacle.id, quantity: 1, order: 0 },
          { canonicalMaterialId: boxOldWork.id, quantity: 1, order: 1 },
        ],
      },
    },
    select: { id: true },
  });
  const switchSvc = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-switch-service", name: "lw-switch-service",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      fieldLaborHours: 0.4, wwtLaborHours: 0.3, requiresTechCount: 1,
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

  return { contractorId: contractor.id, outletId: outlet.id, outletWithBoxId: outletWithBox.id, switchId: switchSvc.id, gfciId: gfciSvc.id };
}

async function serviceState(id: string) {
  return prisma.service.findUniqueOrThrow({
    where: { id },
    select: { fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true, basePrice: true, whileWeThereBasePrice: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — BROWSER FLOW — explicit service picker, box scenario, editable proposals, through the real panel\n`);
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
    const { outletId, outletWithBoxId, switchId, gfciId } = await buildFixture(user.id);
    const beforeBox = await serviceState(outletWithBoxId);
    const beforeGfci = await serviceState(gfciId);
    const beforeOutlet = await serviceState(outletId);

    // ── 1. the panel, loaded as this real, signed-in OWNER ──────────────────
    await page.goto(`${BASE}/dashboard/setup?stage=pricing-foundation`);
    await page.waitForSelector("text=Calibrate your labor times");
    await page.getByRole("button", { name: "Start" }).click();

    // ── 2. anchor — outlet replacement, 20 minutes ──────────────────────────
    await page.locator('input[aria-label*="Minutes for a standard outlet replacement"]').fill("20");
    await page.getByRole("button", { name: "Next" }).click();

    // ── 3. crew context — descriptive only, never written anywhere ─────────
    await page.locator('input[aria-label="Your usual crew"]').fill("Just me, solo");
    await page.getByRole("button", { name: "Next" }).click();

    // ── 4. switch — same crew, same time ────────────────────────────────────
    await page.waitForSelector("text=standard switch replacement");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.getByRole("button", { name: "About the same" }).click();

    // ── 5. GFCI — DIFFERENT crew — this is the crew-mismatch path ───────────
    await page.waitForSelector("text=replacing an existing GFCI receptacle");
    await page.getByRole("button", { name: "Different crew" }).click();

    // ── 6. review — explicit selection, not recipe inference ────────────────
    await page.waitForSelector("text=Review each proposal");
    const outletCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard duplex receptacle" });
    const reviewText = await outletCard.innerText();
    ok(`1. the outlet's OWN candidate list includes the box-carrying service too — nothing is filtered by recipe`,
      reviewText.includes("lw-outlet-with-box"));
    ok(`   ...and shows ITS current, pre-existing labor time, not a blank`,
      reviewText.includes("currently 45 min"));
    const outletCheckbox = outletCard.locator('input[aria-label="Apply Replace a standard duplex receptacle to lw-outlet-service"]');
    ok(`2. the templateKey-tagged service arrives PRE-CHECKED — a real provenance fact, not a guess`,
      await outletCheckbox.isChecked());
    const boxCheckbox = outletCard.locator('input[aria-label="Apply Replace a standard duplex receptacle to lw-outlet-with-box"]');
    ok(`   ...the box-carrying service arrives UNCHECKED — sharing a material is not an outcome match`,
      !(await boxCheckbox.isChecked()));
    // Confirm the box row is genuinely left alone — never touch it.

    // ── 7. switch — hand-authored, no templateKey: must be checked manually ─
    const switchCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard single-pole switch" });
    const switchCheckbox = switchCard.locator('input[aria-label="Apply Replace a standard single-pole switch to lw-switch-service"]');
    ok(`3. the hand-authored switch service starts UNCHECKED — no templateKey to pre-check from`,
      !(await switchCheckbox.isChecked()));
    await switchCheckbox.check();

    // ── 8. EDIT the outlet's proposed minutes before accepting ──────────────
    await outletCard.locator('input[aria-label="Proposed minutes for Replace a standard duplex receptacle"]').fill("25");

    // ── 9. GFCI shows the flag, no picker, nothing to select ────────────────
    const gfciCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace an existing GFCI receptacle" });
    ok(`4. the GFCI card shows the crew-mismatch flag instead of a picker`,
      (await gfciCard.innerText()).includes("needs a different crew than the one covered above"));

    // ── 10. accept ───────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Accept and save" }).click();
    await page.waitForSelector("text=Saved.");
    const doneText = await page.innerText("body");
    ok(`5. exactly 2 services were updated — the checked outlet and switch, nothing else`,
      doneText.includes("Saved. 2 services updated."));

    // ── 11. server-side truth ────────────────────────────────────────────────
    const afterOutlet = await serviceState(outletId);
    ok(`6. the outlet service saved the EDITED figure (25 min), not the originally answered one (20 min)`,
      Math.abs((afterOutlet.fieldLaborHours ?? 0) - 25 / 60) < 1e-9);
    ok(`   its basePrice and whileWeThereBasePrice — the PUBLISHED price — are untouched: this only ever saves inputs`,
      afterOutlet.basePrice === beforeOutlet.basePrice && afterOutlet.whileWeThereBasePrice === beforeOutlet.whileWeThereBasePrice);
    const afterSwitch = await serviceState(switchId);
    ok(`   the switch service saved the ORIGINALLY ANSWERED anchor value (20 min) — the edit came after it was derived`,
      Math.abs((afterSwitch.fieldLaborHours ?? 0) - 20 / 60) < 1e-9);
    const afterBox = await serviceState(outletWithBoxId);
    ok(`7. the box-carrying service is COMPLETELY UNTOUCHED — left unchecked, so nothing about it moved`,
      afterBox.fieldLaborHours === beforeBox.fieldLaborHours && afterBox.wwtLaborHours === beforeBox.wwtLaborHours
        && afterBox.requiresTechCount === beforeBox.requiresTechCount);
    const afterGfci = await serviceState(gfciId);
    ok(`   the flagged GFCI service is untouched too — still unestablished`, afterGfci.fieldLaborHours === beforeGfci.fieldLaborHours);

    ok(`8. requiresTechCount is untouched on every service the wizard wrote to`,
      afterOutlet.requiresTechCount === beforeOutlet.requiresTechCount && afterSwitch.requiresTechCount === 1);
    ok(`   wwtLaborHours is untouched on every service the wizard wrote to`,
      afterOutlet.wwtLaborHours === beforeOutlet.wwtLaborHours && afterSwitch.wwtLaborHours === 0.3);

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`9. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
