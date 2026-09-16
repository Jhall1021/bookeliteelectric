/**
 * The Materials panel's quantity input — through the REAL admin UI, a REAL
 * signed-up account, and the REAL API route, on an owned, stamped local
 * database. Two code-review findings, each exercised for real:
 *
 *   blank stays blank    components/admin/MaterialsPanel.tsx used to convert
 *                         a blank quantity field to Number("") === 0 on blur
 *                         and POST it — an untouched policy-quantity field
 *                         silently declared "zero" the moment a contractor's
 *                         cursor left it. Now: blank on blur sends nothing;
 *                         an explicit "0" still sends a real, distinct
 *                         declaration.
 *   the shared helper     app/api/admin/materials/route.ts's "quantity"
 *   actually backs this   action used to update the row and recompute in
 *                         two separate statements, never calling
 *                         lib/materialCost.ts's declarePolicyMaterialQuantity
 *                         despite that function's own (false, now corrected)
 *                         claim that it did. Now wired through for real, and
 *                         atomic — proven here with an injected fault.
 *
 * Also proves, on this same fixture: the incomplete-state copy names the
 * actual gap (an undeclared allowance, not always "no cost"); a policy-only
 * and a mixed structural/policy recipe both stay blocked until the
 * allowance is declared, then resolve to the exact expected total; a later
 * quantity edit recomputes correctly; and a foreign tenant's authenticated
 * request against another contractor's material line is refused, unchanged.
 *
 *   PLATFORM_MAIL_SINK=/tmp/p2b-materials-quantity-flow-mail.jsonl \
 *   BROWSER_FLOW_BASE_URL=http://localhost:3612 \
 *     npx tsx scripts/verify-materials-panel-quantity-browser-flow.ts
 *   (needs a dev/production server on the SAME port, with the SAME
 *   PLATFORM_MAIL_SINK and DATABASE_URL, started separately)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately,
 * against the owned, stamped local database this suite's own DATABASE_URL
 * points at (checked below via the same guard every other rehearsal script
 * in this repo uses).
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { declarePolicyMaterialQuantity, recomputeServiceMaterialCost } from "../lib/materialCost";
import { withContractor } from "../lib/tenantRoute";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3612";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-materials-quantity-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_A = `test-materials-qty-a-${RUN}`;
const SLUG_B = `test-materials-qty-b-${RUN}`;
const EMAIL_A = `p2b-materials-qty-a-${RUN}@resend.dev`;
const EMAIL_B = `p2b-materials-qty-b-${RUN}@resend.dev`;
const ROLE_PREFIX = `TEST_QTY_${RUN}_`;

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
  for (const slug of [SLUG_A, SLUG_B]) {
    const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
    if (c) {
      const ids = (await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
      await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
      await prisma.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorMaterial.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorCategory.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.pricingSettings.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorMembership.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractor.delete({ where: { id: c.id } }).catch(() => {});
    }
  }
  await prisma.canonicalMaterial.deleteMany({ where: { key: { startsWith: ROLE_PREFIX } } }).catch(() => {});
  await prisma.serviceCategory.deleteMany({ where: { slug: `materials-qty-flow-${RUN}` } }).catch(() => {});
  await prisma.canonicalCategory.deleteMany({ where: { slug: `materials-qty-flow-${RUN}` } }).catch(() => {});
  for (const email of [EMAIL_A, EMAIL_B]) {
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.verification.deleteMany({ where: { identifier: { contains: email } } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
}

/**
 * One contractor, two services — a wholly policy-quantity recipe and a
 * mixed structural/policy one — each linked exactly the way installCatalog
 * links them: every role present, quantity null until declared. Fresh,
 * uniquely-keyed canonical roles, never the real catalog's, so this suite
 * cannot collide with anything else reading or writing it.
 */
async function buildFixtureA(userId: string) {
  // Upserted rather than required to pre-exist: this suite runs on a bare,
  // freshly `db push`'d database with no seed data at all, and these two
  // legacy/canonical category rows are otherwise-inert platform reference
  // rows Service.create merely requires a foreign key to.
  const legacyCategory = await prisma.serviceCategory.upsert({
    where: { slug: `materials-qty-flow-${RUN}` },
    update: {}, create: { slug: `materials-qty-flow-${RUN}`, name: "Materials Quantity Flow" },
    select: { id: true },
  });
  const canonicalCategory = await prisma.canonicalCategory.upsert({
    where: { slug: `materials-qty-flow-${RUN}` },
    update: {}, create: { slug: `materials-qty-flow-${RUN}`, name: "Materials Quantity Flow" },
    select: { id: true },
  });
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG_A, name: "Materials Quantity Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  const category = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonicalCategory.id, sortOrder: 0 },
    select: { id: true },
  });

  const policyRole = await prisma.canonicalMaterial.create({
    data: { key: `${ROLE_PREFIX}CONSUMABLES`, name: "Test consumables allowance", unit: "each" } });
  const structRole = await prisma.canonicalMaterial.create({
    data: { key: `${ROLE_PREFIX}RECEPTACLE`, name: "Test receptacle", unit: "each" } });
  const policyRole2 = await prisma.canonicalMaterial.create({
    data: { key: `${ROLE_PREFIX}WIRE`, name: "Test wire allowance", unit: "ft" } });
  const policyRole3 = await prisma.canonicalMaterial.create({
    data: { key: `${ROLE_PREFIX}ATOMICITY`, name: "Test atomicity allowance", unit: "each" } });

  await prisma.contractorMaterial.create({ data: { contractorId: contractor.id, canonicalMaterialId: policyRole.id, unitCostCents: 300 } });
  await prisma.contractorMaterial.create({ data: { contractorId: contractor.id, canonicalMaterialId: structRole.id, unitCostCents: 200 } });
  await prisma.contractorMaterial.create({ data: { contractorId: contractor.id, canonicalMaterialId: policyRole2.id, unitCostCents: 50 } });
  await prisma.contractorMaterial.create({ data: { contractorId: contractor.id, canonicalMaterialId: policyRole3.id, unitCostCents: 400 } });

  async function makeService(slugSuffix: string, name: string) {
    return prisma.service.create({
      data: {
        contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
        slug: `materials-qty-${slugSuffix}-${RUN}`, name, bookingType: "INSTANT", photoState: "NONE",
        active: true, offered: true, fieldLaborHours: 1, requiresTechCount: 1,
      },
      select: { id: true },
    });
  }
  const policyOnly = await makeService("policy-only", "Policy-Only Test Service");
  const mixed = await makeService("mixed", "Mixed Test Service");
  const atomicity = await makeService("atomicity", "Atomicity Test Service");

  await prisma.serviceMaterial.create({
    data: { serviceId: policyOnly.id, canonicalMaterialId: policyRole.id, quantity: null, quantityIsPolicy: true, order: 0 } });
  await prisma.serviceMaterial.create({
    data: { serviceId: mixed.id, canonicalMaterialId: structRole.id, quantity: 2, quantityIsPolicy: false, order: 0 } });
  await prisma.serviceMaterial.create({
    data: { serviceId: mixed.id, canonicalMaterialId: policyRole2.id, quantity: null, quantityIsPolicy: true, order: 1 } });
  await prisma.serviceMaterial.create({
    data: { serviceId: atomicity.id, canonicalMaterialId: policyRole3.id, quantity: null, quantityIsPolicy: true, order: 0 } });

  // installCatalog always derives materialCostResolved/unresolvedMaterialKeys
  // immediately after linking a service's materials (lib/templateProvisioning.ts)
  // — Service.materialCostResolved defaults to true, so a fixture that
  // creates ServiceMaterial rows directly, as this one does, must ask the
  // same real readiness question itself rather than leave the cache at its
  // default and silently misrepresent the very state this suite exists to
  // prove.
  for (const id of [policyOnly.id, mixed.id, atomicity.id]) await recomputeServiceMaterialCost(prisma, id);

  return {
    contractorId: contractor.id,
    policyOnlyServiceId: policyOnly.id, mixedServiceId: mixed.id, atomicityServiceId: atomicity.id,
    policyRoleId: policyRole.id, structRoleId: structRole.id, policyRole2Id: policyRole2.id, policyRole3Id: policyRole3.id,
  };
}

/** A second, unrelated contractor — nothing but a membership, to test cross-tenant refusal for real, authenticated. */
async function buildFixtureB(userId: string) {
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG_B, name: "Materials Quantity Flow Electric (other tenant)", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  return { contractorId: contractor.id };
}

async function signUpAndVerify(browser: import("playwright").Browser, name: string, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-up`);
  await page.locator("#name").fill(name);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForSelector("h1:has-text('Confirm your email')");
  const verifyLink = await verificationLinkFor(email);
  ok(`a real confirmation email was sent to ${email}`, verifyLink !== null, `nothing addressed to ${email} in ${SINK}`);
  if (!verifyLink) throw new Error("no verification link — aborting");
  await page.goto(verifyLink);
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true, emailVerified: true } });
  ok(`   the account is real and verified, not asserted`, user.emailVerified === true);
  return { ctx, page, userId: user.id };
}

async function main() {
  console.log(`\nMATERIALS PANEL — QUANTITY INPUT — BROWSER/API FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL_A} / ${EMAIL_B}  ·  sink ${SINK}\n`);
  await assertDisposableLocalDatabase(prisma);

  const browser = await chromium.launch();
  try {
    await teardown();

    const a = await signUpAndVerify(browser, "Materials Quantity Owner", EMAIL_A);
    const b = await signUpAndVerify(browser, "Materials Quantity Owner B", EMAIL_B);

    const fixtureA = await buildFixtureA(a.userId);
    await buildFixtureB(b.userId);

    // ── 1. POLICY-ONLY SERVICE, real browser ────────────────────────────
    await a.page.goto(`${BASE}/dashboard/services/${fixtureA.policyOnlyServiceId}`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Materials" }).click();
    await a.page.waitForSelector("h2:has-text('Materials')");

    ok("1. incomplete banner names the ALLOWANCE, not a missing cost (cost is already set)",
      (await a.page.locator("text=/allowance you set yourself/").count()) > 0
      && (await a.page.locator("text=/does not have a cost/").count()) === 0);

    const qtyInputPolicyOnly = a.page.getByLabel("Quantity of Test consumables allowance");

    // Focus and blur with nothing typed — must send nothing.
    await qtyInputPolicyOnly.click();
    await a.page.keyboard.press("Tab");
    await a.page.waitForTimeout(400);
    let row = await prisma.serviceMaterial.findFirstOrThrow({ where: { serviceId: fixtureA.policyOnlyServiceId, canonicalMaterialId: fixtureA.policyRoleId } });
    ok("2. focusing and blurring a blank policy quantity sends NO request — quantity stays null, not 0",
      row.quantity === null, `got ${row.quantity}`);

    // An explicit "0" is a real, different decision, and is sent.
    await qtyInputPolicyOnly.fill("0");
    await qtyInputPolicyOnly.blur();
    await a.page.waitForTimeout(400);
    row = await prisma.serviceMaterial.findFirstOrThrow({ where: { serviceId: fixtureA.policyOnlyServiceId, canonicalMaterialId: fixtureA.policyRoleId } });
    ok("3. an explicitly typed \"0\" IS sent and declared — distinguishable from blank", row.quantity === 0);

    // Now declare the real allowance: 2 x $3.00 = $6.00.
    await a.page.reload({ waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Materials" }).click();
    await a.page.getByLabel("Quantity of Test consumables allowance").fill("2");
    await a.page.getByLabel("Quantity of Test consumables allowance").blur();
    await a.page.waitForTimeout(400);
    const svc1 = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.policyOnlyServiceId }, select: { materialCostResolved: true, materialCostCents: true } });
    ok("4. declaring 2 resolves the wholly policy-quantity service to the exact total ($6.00)",
      svc1.materialCostResolved === true && svc1.materialCostCents === 600, JSON.stringify(svc1));
    await a.page.waitForFunction(() => !document.body.innerText.includes("Incomplete"));
    ok("   ...and the browser itself no longer shows \"Incomplete\" once resolved", true);

    // ── 5. MIXED SERVICE, real browser ───────────────────────────────────
    await a.page.goto(`${BASE}/dashboard/services/${fixtureA.mixedServiceId}`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Materials" }).click();
    await a.page.waitForSelector("h2:has-text('Materials')");
    ok("5. a mixed recipe (structural role visible, policy role blank) reports Incomplete, not a false total",
      (await a.page.locator("text=Incomplete").count()) > 0);
    const svc2Before = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.mixedServiceId }, select: { materialCostResolved: true } });
    ok("   ...and materialCostResolved is genuinely false, not silently true", svc2Before.materialCostResolved === false);

    await a.page.getByLabel("Quantity of Test wire allowance").click();
    await a.page.keyboard.press("Tab");
    await a.page.waitForTimeout(400);
    row = await prisma.serviceMaterial.findFirstOrThrow({ where: { serviceId: fixtureA.mixedServiceId, canonicalMaterialId: fixtureA.policyRole2Id } });
    ok("6. same blank-blur guard on the mixed recipe's policy role — stays null", row.quantity === null);

    await a.page.getByLabel("Quantity of Test wire allowance").fill("5");
    await a.page.getByLabel("Quantity of Test wire allowance").blur();
    await a.page.waitForTimeout(400);
    // 2 x $2.00 (structural) + 5 x $0.50 (policy) = $6.50, exactly once each.
    const svc2After = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.mixedServiceId }, select: { materialCostResolved: true, materialCostCents: true } });
    ok("7. declaring the mixed recipe's policy quantity resolves BOTH roles into one exact total ($6.50) — no silent omission",
      svc2After.materialCostResolved === true && svc2After.materialCostCents === 650, JSON.stringify(svc2After));

    // ── 8. SUBSEQUENT EDIT recomputes correctly ──────────────────────────
    await a.page.getByLabel("Quantity of Test wire allowance").fill("10");
    await a.page.getByLabel("Quantity of Test wire allowance").blur();
    await a.page.waitForTimeout(400);
    // 2 x $2.00 + 10 x $0.50 = $9.00.
    const svc2Edited = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.mixedServiceId }, select: { materialCostCents: true } });
    ok("8. a later quantity edit recomputes to the new exact total ($9.00), not left stale or doubled",
      svc2Edited.materialCostCents === 900, JSON.stringify(svc2Edited));

    // ── 9. ATOMICITY — an injected fault leaves BOTH quantity and cache unchanged ──
    const rowBefore = await prisma.serviceMaterial.findFirstOrThrow({ where: { serviceId: fixtureA.atomicityServiceId, canonicalMaterialId: fixtureA.policyRole3Id } });
    const svcBefore = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.atomicityServiceId }, select: { materialCostCents: true, materialCostResolved: true, unresolvedMaterialKeys: true } });
    let threw = false;
    try {
      await withContractor(fixtureA.contractorId, "test", (db) =>
        declarePolicyMaterialQuantity(db, fixtureA.atomicityServiceId, fixtureA.policyRole3Id, 4, async () => {
          throw new Error("INJECTED_FAULT_BETWEEN_QUANTITY_AND_RECOMPUTE");
        }));
    } catch (e) {
      threw = e instanceof Error && e.message === "INJECTED_FAULT_BETWEEN_QUANTITY_AND_RECOMPUTE";
    }
    ok("9. an injected fault between the quantity write and the recompute propagates (nothing swallows it)", threw);
    const rowAfter = await prisma.serviceMaterial.findFirstOrThrow({ where: { id: rowBefore.id } });
    const svcAfter = await prisma.service.findUniqueOrThrow({ where: { id: fixtureA.atomicityServiceId }, select: { materialCostCents: true, materialCostResolved: true, unresolvedMaterialKeys: true } });
    ok("   ...and the quantity itself was rolled back — still undeclared, not left at 4", rowAfter.quantity === rowBefore.quantity, `before ${rowBefore.quantity}, after ${rowAfter.quantity}`);
    ok("   ...and the cached readiness/total was rolled back too — the two never diverge",
      svcAfter.materialCostCents === svcBefore.materialCostCents && svcAfter.materialCostResolved === svcBefore.materialCostResolved,
      JSON.stringify({ before: svcBefore, after: svcAfter }));

    // Prove the SAME declaration succeeds cleanly with no fault injected,
    // so check 9 above is a real fault test and not just a permanently
    // broken path.
    const recovered = await withContractor(fixtureA.contractorId, "test", (db) =>
      declarePolicyMaterialQuantity(db, fixtureA.atomicityServiceId, fixtureA.policyRole3Id, 4));
    ok("   ...and the same declaration succeeds without the injected fault ($16.00 = 4 x $4.00)",
      recovered.recompute?.afterCents === 1600, JSON.stringify(recovered));

    // ── 10. FOREIGN TENANT — a real, authenticated request from contractor B's own session ──
    const foreignRoleRow = await prisma.serviceMaterial.findFirstOrThrow({ where: { serviceId: fixtureA.policyOnlyServiceId, canonicalMaterialId: fixtureA.policyRoleId } });
    const beforeForeign = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id: foreignRoleRow.id } });
    const resp = await b.ctx.request.post(`${BASE}/api/admin/materials`, {
      data: { action: "quantity", id: foreignRoleRow.id, quantity: 999 },
      headers: { "Content-Type": "application/json" },
    });
    ok("10. a real, authenticated request from a DIFFERENT contractor's own session is refused (not 200)", resp.status() !== 200, `got ${resp.status()}`);
    const afterForeign = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id: foreignRoleRow.id } });
    ok("   ...and contractor A's row is completely unchanged", afterForeign.quantity === beforeForeign.quantity, `before ${beforeForeign.quantity}, after ${afterForeign.quantity}`);

    console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  } finally {
    await browser.close();
    await teardown();
    await prisma.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
