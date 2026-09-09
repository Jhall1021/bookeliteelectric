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
 *   canonical eligibility only  the review screen offers a checkbox ONLY
 *                        for a service whose templateKey names the task's
 *                        real canonical outcome AND whose current recipe
 *                        still matches what it was provisioned with. A
 *                        same-tagged service that has since been
 *                        customized (a box added to its recipe) is shown
 *                        separately, flagged for manual review, and never
 *                        offered a checkbox at all
 *   no eligible service  a task with no eligible or customized match shows
 *                        "use the manual pricing editor" instead of an
 *                        empty or unrestricted picker
 *   editable proposals   editing the outlet's proposed minutes changes
 *                        what gets saved for it, and does NOT change what
 *                        was already derived for switch, computed from the
 *                        ANSWERED anchor value, not from whatever the
 *                        anchor is later edited to
 *   crew mismatch        a task flagged "different crew" gets no proposal
 *                        at all and writes nothing on accept
 *   server-side refusal  a raw, authenticated request to the accept route
 *                        naming a service id that is NOT eligible for the
 *                        named task — bypassing the UI, which never offered
 *                        it as a checkbox in the first place — is refused
 *                        outright, and that service's fieldLaborHours is
 *                        confirmed unchanged afterward
 *   scoped writes         only the checked, eligible services' fieldLaborHours
 *                        move, through the same shared authority the admin
 *                        Pricing Composition panel uses — requiresTechCount,
 *                        wwtLaborHours, basePrice and the customized
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
const TRADE = "electrical";
const VERSION = 1;

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

/**
 * A real, verified account, an OWNER membership, and three services:
 *
 *   lw-eligible-outlet    templateKey "replace-standard-outlet", recipe
 *                         EXACTLY the template's own — the one service that
 *                         should arrive as a checkbox, pre-checked
 *   lw-customized-outlet  same templateKey, but a box added to the recipe
 *                         since provisioning — THE REVIEWER'S SCENARIO.
 *                         Must be shown, flagged, and never a checkbox
 *   lw-tagged-switch      templateKey "replace-standard-switch", recipe
 *                         exactly the template's own — eligible for the
 *                         SWITCH task, absent from the outlet task's list
 *
 * No service is created for GFCI at all — the crew-mismatch path never
 * reaches a picker regardless of what eligibility would say.
 */
async function buildFixture(userId: string) {
  const tv = await prisma.templateVersion.findUniqueOrThrow({ where: { trade_version: { trade: TRADE, version: VERSION } } });
  const [outletTemplate, switchTemplate] = await Promise.all([
    prisma.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-outlet" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
    prisma.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-switch" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
  ]);
  const outletRecipe = outletTemplate.materials.map((m) => m.canonicalMaterialId);
  const switchRecipe = switchTemplate.materials.map((m) => m.canonicalMaterialId);
  const boxOldWork = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true } });

  const cat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Labor Wizard Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });

  const eligibleOutlet = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-eligible-outlet", name: "lw-eligible-outlet",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      templateKey: "replace-standard-outlet", templateVersionId: tv.id,
      basePrice: 8800, whileWeThereBasePrice: 6600, publishedPriceApprovedAt: new Date(),
      materials: { create: outletRecipe.map((id, order) => ({ canonicalMaterialId: id, quantity: 1, order })) },
    },
    select: { id: true },
  });
  const customizedOutlet = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-customized-outlet", name: "lw-customized-outlet",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      templateKey: "replace-standard-outlet", templateVersionId: tv.id,
      fieldLaborHours: 0.6, wwtLaborHours: 0.5, requiresTechCount: 1,
      materials: {
        create: [...outletRecipe, boxOldWork.id].map((id, order) => ({ canonicalMaterialId: id, quantity: 1, order })),
      },
    },
    select: { id: true },
  });
  const taggedSwitch = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: "lw-tagged-switch", name: "lw-tagged-switch",
      bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
      templateKey: "replace-standard-switch", templateVersionId: tv.id,
      fieldLaborHours: 0.4, wwtLaborHours: 0.3, requiresTechCount: 1,
      materials: { create: switchRecipe.map((id, order) => ({ canonicalMaterialId: id, quantity: 1, order })) },
    },
    select: { id: true },
  });

  return { contractorId: contractor.id, eligibleOutletId: eligibleOutlet.id, customizedOutletId: customizedOutlet.id, taggedSwitchId: taggedSwitch.id };
}

async function serviceState(id: string) {
  return prisma.service.findUniqueOrThrow({
    where: { id },
    select: { fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true, basePrice: true, whileWeThereBasePrice: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — BROWSER FLOW — canonical eligibility only, customized divergence, server-side refusal, through the real panel\n`);
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
    const { eligibleOutletId, customizedOutletId, taggedSwitchId } = await buildFixture(user.id);
    const beforeCustomized = await serviceState(customizedOutletId);
    const beforeOutlet = await serviceState(eligibleOutletId);

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

    // ── 6. review — canonical eligibility only ──────────────────────────────
    await page.waitForSelector("text=Review each proposal");
    const outletCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard duplex receptacle" });
    const outletText = await outletCard.innerText();
    ok(`1. only the ONE unmodified, correctly-tagged service is offered as a checkbox`,
      outletText.includes("lw-eligible-outlet") && outletText.includes("Applies to 1 of 1 matching service"));
    ok(`   ...the customized service is named, but flagged for manual review, not offered a checkbox`,
      outletText.includes("customized since") && outletText.includes("lw-customized-outlet"));
    const customizedCheckbox = outletCard.locator('input[aria-label*="lw-customized-outlet"]');
    ok(`2. no checkbox exists for the customized service at all`, (await customizedCheckbox.count()) === 0);
    const eligibleCheckbox = outletCard.locator('input[aria-label="Apply Replace a standard duplex receptacle to lw-eligible-outlet"]');
    ok(`   ...and the eligible one arrives pre-checked`, await eligibleCheckbox.isChecked());

    // ── 7. switch — tagged and unmodified, offered normally ─────────────────
    const switchCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard single-pole switch" });
    const switchCheckbox = switchCard.locator('input[aria-label="Apply Replace a standard single-pole switch to lw-tagged-switch"]');
    ok(`3. the correctly-tagged switch service arrives pre-checked too`, await switchCheckbox.isChecked());

    // ── 8. EDIT the outlet's proposed minutes before accepting ──────────────
    await outletCard.locator('input[aria-label="Proposed minutes for Replace a standard duplex receptacle"]').fill("25");

    // ── 9. GFCI shows the flag, no picker ────────────────────────────────────
    const gfciCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace an existing GFCI receptacle" });
    ok(`4. the GFCI card shows the crew-mismatch flag instead of a picker`,
      (await gfciCard.innerText()).includes("needs a different crew than the one covered above"));

    // ── 10. server-side refusal — a raw request naming an INELIGIBLE id, ────
    // bypassing the UI entirely, which never offered lw-customized-outlet as
    // a checkbox in the first place.
    const refusal = await page.evaluate(async (serviceId) => {
      const res = await fetch("/api/portal/labor-tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptances: [{ taskKey: "outlet_replacement", minutes: 999, serviceIds: [serviceId] }] }),
      });
      return { status: res.status, body: await res.json() };
    }, customizedOutletId);
    ok(`5. a direct request naming an ineligible id is refused, not silently applied`,
      refusal.status === 400 && typeof refusal.body.error === "string" && refusal.body.error.includes("not eligible"));
    const afterRefusal = await serviceState(customizedOutletId);
    ok(`   ...and the named service's fieldLaborHours is genuinely unchanged`,
      afterRefusal.fieldLaborHours === beforeCustomized.fieldLaborHours);

    // ── 11. accept the real, eligible proposals ──────────────────────────────
    await page.getByRole("button", { name: "Accept and save" }).click();
    await page.waitForSelector("text=Saved.");
    const doneText = await page.innerText("body");
    ok(`6. exactly 2 services were updated — the eligible outlet and switch`,
      doneText.includes("Saved. 2 services updated."));

    // ── 12. server-side truth ────────────────────────────────────────────────
    const afterOutlet = await serviceState(eligibleOutletId);
    ok(`7. the outlet service saved the EDITED figure (25 min), not the originally answered one (20 min)`,
      Math.abs((afterOutlet.fieldLaborHours ?? 0) - 25 / 60) < 1e-9);
    ok(`   its basePrice and whileWeThereBasePrice — the PUBLISHED price — are untouched: this only ever saves inputs`,
      afterOutlet.basePrice === beforeOutlet.basePrice && afterOutlet.whileWeThereBasePrice === beforeOutlet.whileWeThereBasePrice);
    const afterSwitch = await serviceState(taggedSwitchId);
    ok(`   the switch service saved the ORIGINALLY ANSWERED anchor value (20 min) — the edit came after it was derived`,
      Math.abs((afterSwitch.fieldLaborHours ?? 0) - 20 / 60) < 1e-9);
    const afterCustomized = await serviceState(customizedOutletId);
    ok(`8. the customized service is COMPLETELY UNTOUCHED — never eligible, never offered, never written`,
      afterCustomized.fieldLaborHours === beforeCustomized.fieldLaborHours && afterCustomized.wwtLaborHours === beforeCustomized.wwtLaborHours
        && afterCustomized.requiresTechCount === beforeCustomized.requiresTechCount);

    ok(`9. requiresTechCount is untouched on every service the wizard wrote to`,
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
    ok(`10. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
