/**
 * PricingPanel, driven through the REAL admin UI in a REAL browser, signed
 * in as a disposable account created through the actual sign-up +
 * email-verification pipeline — matching
 * verify-question-editor-save-integrity-browser-flow.ts's convention.
 *
 * WHY THIS EXISTS
 *
 * lib/servicePricingInputs.ts's saveServicePricingInputs() refuses any
 * pricing-inputs save that even mentions materialCostCents for an itemized
 * service (see scripts/verify-service-pricing-material-guard.ts). Before
 * this fix, PricingPanel (components/admin/PricingPanel.tsx) sent that key
 * on EVERY save regardless of itemization — and the pricing route
 * (app/api/admin/services/[serviceId]/pricing/route.ts) always included it
 * in `overrides` even when a caller's body omitted it — so saving ANYTHING
 * through the real admin form for an already-itemized service was refused,
 * not just an attempt to touch material cost specifically.
 *
 * This proves the compatibility fix from the actual browser, not just at
 * the domain layer: an itemized service's admin sees the material total as
 * read-only and calculated, never as an editable field; can still save and
 * publish every OTHER pricing input; and a non-itemized service's material
 * allowance remains exactly as editable as before.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3424 \
 *     npx tsx scripts/verify-pricing-panel-material-mode-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK,
 *   and DATABASE_URL pointed at the SAME database this script uses)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3424";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-pricing-material-mode-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-pricing-material-mode-flow-${RUN}`;
const EMAIL = `p2b-pricing-material-mode-flow-${RUN}@resend.dev`;

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
    await prisma.materialCostEvent.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorMaterial.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
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

/** One contractor: an ALLOWANCE service and an ITEMIZED one, so the two modes sit side by side. */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const wire122 = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } });

  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Pricing Material Mode Flow Electric", active: true, countryCode: "US" },
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

  const allowanceService = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
      slug: "pricing-material-mode-allowance", name: "Pricing Material Mode — Allowance",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      fieldLaborHours: 1, requiresTechCount: 1, isPrimaryEligible: true,
      materialCostCents: 500,
    },
    select: { id: true },
  });

  const contractorMaterial = await prisma.contractorMaterial.create({
    data: {
      contractorId: contractor.id, canonicalMaterialId: wire122.id,
      unitCostCents: 72, unitCostMilliCents: 72000,
      costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
    },
    select: { id: true },
  });
  const itemizedService = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
      slug: "pricing-material-mode-itemized", name: "Pricing Material Mode — Itemized",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      fieldLaborHours: 1, requiresTechCount: 1, isPrimaryEligible: true,
      materials: { create: [{ canonicalMaterialId: wire122.id, quantity: 10, order: 0 }] },
    },
    select: { id: true },
  });
  await recomputeServiceMaterialCost(prisma, itemizedService.id); // 72c * 10 = 720c

  return { contractorId: contractor.id, allowanceServiceId: allowanceService.id, itemizedServiceId: itemizedService.id, contractorMaterialId: contractorMaterial.id };
}

async function main() {
  console.log(`\nPRICING PANEL — MATERIAL COST MODE — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Pricing Material Mode Owner");
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

    const { itemizedServiceId, allowanceServiceId, contractorMaterialId } = await buildFixture(user.id);

    // ── 1-4. ITEMIZED service: read-only total, no input, other fields still save ──
    await page.goto(`${BASE}/dashboard/services/${itemizedServiceId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Pricing & labor" }).click();
    await page.waitForSelector('label:has-text("Direct material cost")');
    const materialLabel = page.locator('label:has-text("Direct material cost")');
    const materialInput = materialLabel.locator("xpath=following-sibling::input");
    ok(`1. itemized service: no editable material-cost input is rendered`, (await materialInput.count()) === 0);
    ok(`   ...the calculated total is shown instead ($7.20)`, await page.getByText("$7.20").isVisible());
    ok(`   ...labeled as calculated from the recipe`, await page.getByText("Calculated from this service’s materials recipe", { exact: false }).isVisible().catch(() => false)
      || await page.getByText("Calculated from this service's materials recipe", { exact: false }).isVisible().catch(() => false));

    await page.locator('input[placeholder="not established"]').fill("3");
    await page.getByRole("button", { name: "Save inputs" }).click();
    await page.waitForSelector("text=Inputs saved. Published price unchanged.", { timeout: 10000 });
    ok(`2. itemized service: saving an UNRELATED field (field labor hours) succeeds with no error`, true);
    const errorBanner = page.locator("p.text-red-700");
    ok(`   ...no error banner is shown`, (await errorBanner.count()) === 0);

    const afterUnrelatedSave = await prisma.service.findUniqueOrThrow({
      where: { id: itemizedServiceId }, select: { fieldLaborHours: true, materialCostCents: true },
    });
    ok(`3. fieldLaborHours actually updated in the database (1 -> 3)`, afterUnrelatedSave.fieldLaborHours === 3, `got ${afterUnrelatedSave.fieldLaborHours}`);
    ok(`   ...materialCostCents is untouched (still 720)`, afterUnrelatedSave.materialCostCents === 720, `got ${afterUnrelatedSave.materialCostCents}`);

    const publishBtn = page.getByRole("button", { name: /^Publish/ });
    ok(`   ...Publish is enabled (a suggested price exists)`, !(await publishBtn.isDisabled()));
    await publishBtn.click();
    await page.waitForSelector("text=Published — customers now see this price.", { timeout: 10000 });
    ok(`4. itemized service: Publish ALSO succeeds through the same guard`, true);
    const afterPublish = await prisma.service.findUniqueOrThrow({
      where: { id: itemizedServiceId }, select: { basePrice: true, materialCostCents: true },
    });
    ok(`   ...basePrice was actually published (non-null)`, afterPublish.basePrice !== null, `got ${afterPublish.basePrice}`);
    ok(`   ...materialCostCents is STILL untouched (still 720)`, afterPublish.materialCostCents === 720, `got ${afterPublish.materialCostCents}`);

    // ── 5-6. ALLOWANCE service: material input remains editable, as before ──
    await page.goto(`${BASE}/dashboard/services/${allowanceServiceId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Pricing & labor" }).click();
    await page.waitForSelector('label:has-text("Direct material cost")');
    const allowanceLabel = page.locator('label:has-text("Direct material cost")');
    const allowanceInput = allowanceLabel.locator("xpath=following-sibling::input");
    ok(`5. non-itemized service: the material-cost input IS still rendered and editable`, (await allowanceInput.count()) === 1);
    await allowanceInput.fill("12.34");
    await page.getByRole("button", { name: "Save inputs" }).click();
    await page.waitForSelector("text=Inputs saved. Published price unchanged.", { timeout: 10000 });
    const afterAllowanceSave = await prisma.service.findUniqueOrThrow({
      where: { id: allowanceServiceId }, select: { materialCostCents: true },
    });
    ok(`6. the hand-entered allowance actually saved ($12.34 -> 1234c)`, afterAllowanceSave.materialCostCents === 1234, `got ${afterAllowanceSave.materialCostCents}`);

    // sanity: the fixture's ContractorMaterial row exists and was never mutated by this flow
    const cmStillThere = await prisma.contractorMaterial.findUnique({ where: { id: contractorMaterialId }, select: { unitCostCents: true } });
    ok(`   (sanity) the fixture's ContractorMaterial is unchanged (72c)`, cmStillThere?.unitCostCents === 72);

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`7. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
