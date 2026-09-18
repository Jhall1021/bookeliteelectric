/**
 * Materials & Costs — the redesigned /dashboard/materials catalog surface,
 * driven through the REAL admin UI in a REAL browser, signed in as a
 * disposable account created through the actual sign-up + email-verification
 * pipeline — matching verify-question-editor-save-integrity-browser-flow.ts's
 * convention.
 *
 * WHY THIS EXISTS
 *
 * The catalog page was restyled from a dot-separated stat line into a
 * compact cost-health card with a progress bar, its Active view now defaults
 * to "Needs attention" whenever unresolved materials exist, a "Clear
 * filters" action appears only while filtering, and the desktop row grew
 * from three loosely-grouped cells into seven explicit columns (Material,
 * Current cost, Used in, Source, Updated, Status, action) — all layout and
 * copy only. This proves the NEW behavior actually works, and that
 * everything the redesign was not supposed to touch — filtering, the
 * usage-link expand, Active/Retired, and the read-only Retired view — still
 * does.
 *
 * Editing itself now opens MaterialCostDrawer.tsx (Edit is no longer
 * inline) — this script proves the edit flow still reaches a save through
 * it, in both cost modes; verify-material-cost-drawer-browser-flow.ts is
 * where the drawer's OWN behavior (accessibility, dirty-close confirmation,
 * validation/API failure retention, focus restoration, scroll lock) is
 * proven in depth.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3425 \
 *     npx tsx scripts/verify-materials-catalog-ui-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK,
 *   and DATABASE_URL pointed at the SAME database this script uses)
 *
 * Also saves two screenshots (desktop ~1440px, mobile ~390px) to
 * SCREENSHOT_DIR (default: this session's scratchpad materials-ui-shots/)
 * for design review — taken mid-run, against the fixture below, before
 * teardown.
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3425";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-materials-ui-flow-mail.jsonl";
const SHOT_DIR = process.env.SCREENSHOT_DIR ?? "/tmp/p2b-materials-ui-shots";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-materials-ui-flow-${RUN}`;
const EMAIL = `p2b-materials-ui-flow-${RUN}@resend.dev`;

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

/**
 * One contractor, one service, and a deliberately mixed catalog:
 *   WIRE_12_2 (Wire & Cable)        confirmed, manual, used by the service
 *   BREAKER_SINGLE_POLE (Breakers)  missing price, used by the service —
 *                                   priced mid-run, through the package editor
 *   CABLE_CAT6 (Low Voltage/Media)  needs confirmation (ASSUMED), unused —
 *                                   proves needsAttention covers BOTH buckets
 *   BOX_CEILING_STANDARD (Boxes)    retired — Retired tab only
 */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const [wire, breaker, cat6, box] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CABLE_CAT6" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_CEILING_STANDARD" }, select: { id: true } }),
  ]);

  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Materials UI Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  const category = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonical.id, sortOrder: 0 },
    select: { id: true },
  });

  const service = await prisma.service.create({
    data: {
      contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
      slug: "materials-ui-flow-service", name: "Materials UI Flow Service",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      fieldLaborHours: 1, requiresTechCount: 1,
      materials: {
        create: [
          { canonicalMaterialId: wire.id, quantity: 10, order: 0 },
          { canonicalMaterialId: breaker.id, quantity: 1, order: 1 },
        ],
      },
    },
    select: { id: true, name: true },
  });

  await prisma.contractorMaterial.create({
    data: {
      contractorId: contractor.id, canonicalMaterialId: wire.id,
      unitCostCents: 72, unitCostMilliCents: 72000,
      costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
    },
  });
  await prisma.contractorMaterial.create({
    data: {
      contractorId: contractor.id, canonicalMaterialId: cat6.id,
      unitCostCents: 45, unitCostMilliCents: 45000,
      costSource: "CUSTOM", costConfidence: "ASSUMED", costStatus: "OK",
    },
  });
  await prisma.contractorMaterial.create({
    data: {
      contractorId: contractor.id, canonicalMaterialId: box.id,
      unitCostCents: 310, unitCostMilliCents: 310000,
      costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
      active: false,
    },
  });
  // BREAKER_SINGLE_POLE deliberately has NO ContractorMaterial yet — the
  // "missing price" row this fixture's flow prices mid-run.

  return { contractorId: contractor.id, serviceId: service.id, serviceName: service.name };
}

async function main() {
  console.log(`\nMATERIALS & COSTS — CATALOG UI — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);
  await mkdir(SHOT_DIR, { recursive: true }).catch(() => {});

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Materials UI Flow Owner");
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

    const { contractorId, serviceId, serviceName } = await buildFixture(user.id);

    // ── 1. header, cost-health card, default filter ─────────────────────────
    await page.goto(`${BASE}/dashboard/materials`, { waitUntil: "networkidle" });
    ok(`1. page header reads "Materials & Costs"`, await page.getByRole("heading", { name: "Materials & Costs" }).isVisible());
    ok(`   ...subtitle is the plain-language one from the spec`,
      await page.getByText("Keep the material costs used in your service prices accurate and up to date.").isVisible());

    // Readiness, not mere presence of a cost: WIRE_12_2 is the only truly
    // ready material here — CABLE_CAT6 has a real cost (ASSUMED confidence)
    // but still needs confirmation, so it must NOT count toward "ready".
    ok(`2. cost-health card: 1 of 3 material costs ready`, await page.getByText("1 of 3 material costs ready").isVisible());
    ok(`   ...33% shown`, await page.getByText("33%").isVisible());
    const needsAttentionText = page.getByText(/2 needs? attention/);
    ok(`   ...needsAttention combines missing-price AND needs-confirmation (2)`, await needsAttentionText.isVisible());
    ok(`   ...0 supplier linked`, await page.getByText("0 supplier linked").isVisible());
    ok(`   ...1 used in services (one service, even though it uses two of these materials)`,
      await page.getByText("1 used in services").isVisible());

    const statusSelect = page.getByLabel("Filter by status");
    ok(`3. Active view defaults to "Needs attention" because unresolved materials exist`,
      (await statusSelect.inputValue()) === "needs_attention");
    ok(`   ...only the two unresolved rows show by default`,
      (await page.getByText("Single-pole breaker").count()) > 0 && (await page.getByText("Cat6 network cable").count()) > 0);
    ok(`   ...the confirmed row (12/2 NM-B cable) is hidden by that default`,
      (await page.getByText("12/2 NM-B cable").count()) === 0);
    ok(`4. "Clear filters" is showing (the default itself counts as filtering)`,
      await page.getByRole("button", { name: "Clear filters" }).isVisible());

    // ── 5. desktop column header ─────────────────────────────────────────────
    for (const col of ["Material", "Current cost", "Used in", "Source", "Updated", "Status"]) {
      ok(`5. desktop column header shows "${col}"`, await page.getByText(col, { exact: true }).first().isVisible());
    }

    // ── 6. clear filters -> everything active shows ──────────────────────────
    await page.getByRole("button", { name: "Clear filters" }).click();
    ok(`6. clearing filters shows the confirmed row again`, await page.getByText("12/2 NM-B cable").first().isVisible());
    ok(`   ...status reset to "All"`, (await statusSelect.inputValue()) === "all");
    ok(`   ...and "Clear filters" is gone now that nothing is filtering`,
      (await page.getByRole("button", { name: "Clear filters" }).count()) === 0);

    // ── 7. Add material — platform catalog + contractor-private custom ───
    const addMaterialButton = page.getByRole("button", { name: "Add material" });
    ok(`7. the catalog has a prominent Add material action`, await addMaterialButton.isVisible());
    await addMaterialButton.click();
    const catalogDialog = page.getByRole("dialog", { name: "Add material" });
    await catalogDialog.waitFor({ state: "visible" });
    ok(`   ...the picker offers the wider Price2Book material catalog`,
      await catalogDialog.getByText("Choose a Price2Book material or create your own.").isVisible());
    await catalogDialog.getByLabel("Search available materials").fill("Weather-resistant GFCI");
    const gfciChoice = catalogDialog.getByRole("listitem").filter({ hasText: "Weather-resistant GFCI receptacle" });
    ok(`   ...an unused Price2Book material can be found`, await gfciChoice.isVisible());
    await gfciChoice.getByRole("button", { name: "Add cost" }).click();
    const gfciDrawer = page.getByRole("dialog");
    await gfciDrawer.getByLabel(/Cost per/).fill("25.00");
    await gfciDrawer.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Weather-resistant GFCI receptacle priced.", { timeout: 10000 });
    await page.waitForSelector("text=$25.00 / ea", { timeout: 10000 });
    ok(`   ...pricing it adds it to this contractor's active catalog`,
      await page.getByText("Weather-resistant GFCI receptacle").first().isVisible());

    const customName = `Fixture connector ${RUN}`;
    await addMaterialButton.click();
    const customDialog = page.getByRole("dialog", { name: "Add material" });
    await customDialog.getByRole("button", { name: "Create custom material" }).click();
    await customDialog.getByLabel("Material name").fill(customName);
    await customDialog.getByLabel("Recipe unit").fill("each");
    await customDialog.getByLabel(/Cost per/).fill("12.34");
    await customDialog.getByRole("button", { name: "Create material" }).click();
    await page.waitForSelector(`text=${customName} was added to your material catalog.`, { timeout: 10000 });
    await page.waitForSelector("text=$12.34 / ea", { timeout: 10000 });
    ok(`   ...a custom material can be created with its first cost`,
      await page.getByText(customName).first().isVisible());

    const storedCustom = await prisma.canonicalMaterial.findFirst({
      where: { ownerContractorId: contractorId, ownerNormalizedName: customName.toLowerCase() },
      select: { id: true, ownerContractorId: true },
    });
    ok(`   ...its identity is private to this contractor in the database`,
      storedCustom?.ownerContractorId === contractorId);

    await addMaterialButton.click();
    const duplicateDialog = page.getByRole("dialog", { name: "Add material" });
    await duplicateDialog.getByRole("button", { name: "Create custom material" }).click();
    await duplicateDialog.getByLabel("Material name").fill(`  ${customName.toUpperCase()}  `);
    await duplicateDialog.getByLabel("Recipe unit").fill("each");
    await duplicateDialog.getByLabel(/Cost per/).fill("9.99");
    await duplicateDialog.getByRole("button", { name: "Create material" }).click();
    ok(`   ...case/spacing variants cannot create a duplicate`,
      await duplicateDialog.getByRole("alert").getByText("A custom material with that name already exists.").isVisible());
    await duplicateDialog.getByRole("button", { name: "Close" }).click();
    ok(`   ...only one matching private identity exists`,
      await prisma.canonicalMaterial.count({ where: { ownerContractorId: contractorId, ownerNormalizedName: customName.toLowerCase() } }) === 1);

    // A custom material is a first-class recipe option for its owner.
    await page.goto(`${BASE}/dashboard/services/${serviceId}`, { waitUntil: "networkidle" });
    await page.getByRole("tablist", { name: "Service editor sections" }).getByRole("tab", { name: "Materials" }).click();
    await page.getByRole("button", { name: "Add material" }).click();
    const recipeDialog = page.getByRole("dialog", { name: "Add material" });
    await recipeDialog.getByLabel("Search materials").fill(customName);
    ok(`   ...the owner's custom material appears in the service recipe picker`,
      await recipeDialog.getByText(customName).isVisible());
    await recipeDialog.getByRole("button", { name: "Close" }).click();

    await page.goto(`${BASE}/dashboard/materials`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Clear filters" }).click();

    // ── 8. category filter ───────────────────────────────────────────────────
    const categorySelect = page.getByLabel("Filter by category");
    await categorySelect.selectOption({ label: "Wire & Cable" });
    // Each material's name renders twice per row (the desktop layout and the
    // mobile stack both carry it — only one is CSS-visible per breakpoint,
    // see MaterialRow.tsx), so "present" is a count of 2, not 1.
    ok(`7. category filter narrows to Wire & Cable only`,
      (await page.getByText("12/2 NM-B cable").count()) === 2 &&
      (await page.getByText("Single-pole breaker").count()) === 0 &&
      (await page.getByText("Cat6 network cable").count()) === 0);
    ok(`   ...and "Clear filters" reappears`, await page.getByRole("button", { name: "Clear filters" }).isVisible());
    await page.getByRole("button", { name: "Clear filters" }).click();

    // ── 8. search ─────────────────────────────────────────────────────────────
    await page.getByLabel("Search materials").fill("cat6");
    ok(`8. search narrows to the matching material`,
      (await page.getByText("Cat6 network cable").count()) === 2 && (await page.getByText("12/2 NM-B cable").count()) === 0);
    await page.getByRole("button", { name: "Clear filters" }).click();
    ok(`   ...clear filters empties the search box too`, (await page.getByLabel("Search materials").inputValue()) === "");

    // ── 9. usage expand ───────────────────────────────────────────────────────
    const wireRow = page.locator("div.p-3", { has: page.getByText("12/2 NM-B cable", { exact: true }) });
    await wireRow.getByRole("button", { name: /service/ }).first().click();
    ok(`9. usage expand shows the linked service as a link to it`,
      await wireRow.getByRole("link", { name: serviceName }).isVisible());

    // ── 10. edit an already-priced (Confirmed) material — via the drawer, flat mode ──
    await wireRow.getByRole("button", { name: "Edit" }).first().click();
    const editDrawer = page.getByRole("dialog");
    await editDrawer.waitFor({ state: "visible" });
    ok(`10. Edit opens the cost drawer for the right material`,
      await editDrawer.getByRole("heading", { name: "12/2 NM-B cable" }).isVisible());
    await editDrawer.getByLabel(/Cost per/).fill("0.85");
    await editDrawer.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=12/2 NM-B cable saved.", { timeout: 10000 });
    ok(`    ...saving (flat mode) closes the drawer and shows a page-level success notice`,
      (await page.getByRole("dialog").count()) === 0);
    // The success notice fires before the parent's async refresh() (a real
    // re-fetch of /api/admin/materials) resolves and re-renders the row —
    // wait for the new value rather than checking a single instant.
    await page.waitForSelector("text=$0.85 / ft", { timeout: 10000 });
    ok(`    ...the new cost is reflected in the row`, await wireRow.getByText("$0.85 / ft").first().isVisible());
    ok(`    ...Source now reads Manual`, await wireRow.getByText("Manual").first().isVisible());

    // ── 11. price a missing-price material — via the drawer, package mode + preview ──
    const breakerRow = page.locator("div.p-3", { has: page.getByText("Single-pole breaker", { exact: true }) });
    await breakerRow.getByRole("button", { name: "Add cost" }).first().click();
    const addDrawer = page.getByRole("dialog");
    await addDrawer.waitFor({ state: "visible" });
    await addDrawer.getByRole("button", { name: "By package" }).click();
    await addDrawer.getByLabel("Package price").fill("50.00");
    await addDrawer.getByLabel("Items per package").fill("10");
    // The drawer's calculated-result box is "Your cost per ea" (the unit is
    // already in the label) followed by just the dollar figure — no "/ ea"
    // suffix repeated in the value the way the row's Current-cost cell has.
    // Materials-scoped components use components/admin/materials/format.ts's
    // formatMoney (always two decimals), not lib/flow-types.ts's formatCents
    // (which drops trailing zeros) — a whole-dollar amount renders as
    // "$5.00", not "$5".
    await page.waitForFunction(
      () => document.querySelector('[role="dialog"] .text-lg.font-semibold')?.textContent?.trim() === "$5.00",
      undefined,
      { timeout: 10000 }
    );
    ok(`11. package mode computes and previews a real unit cost ($5.00 / ea)`,
      await addDrawer.getByText("Your cost per ea").isVisible());
    await addDrawer.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Single-pole breaker priced.", { timeout: 10000 });
    ok(`    ...saving a missing-price role succeeds with its own notice`,
      (await page.getByRole("dialog").count()) === 0);
    await page.waitForSelector("text=$5.00 / ea", { timeout: 10000 }); // same async refresh() race as the flat-mode save above
    ok(`    ...the row now shows a real cost instead of "Not priced"`, await breakerRow.getByText("$5.00 / ea").first().isVisible());

    // ── 12. Retired tab — read only, separate from Active ────────────────────
    ok(`12. before switching tabs, the retired material is NOT in the Active view`,
      (await page.getByText("Standard ceiling box").count()) === 0);
    await page.getByRole("button", { name: "Retired" }).click();
    ok(`    ...Retired tab shows the retired material`, await page.getByText("Standard ceiling box").first().isVisible());
    const retiredRow = page.locator("div.p-3", { has: page.getByText("Standard ceiling box", { exact: true }) });
    ok(`    ...retired rows have no Edit / Add cost action (read-only)`,
      (await retiredRow.getByRole("button", { name: /Edit|Add cost/ }).count()) === 0);
    ok(`    ...active materials are not shown on the Retired tab`, (await page.getByText("12/2 NM-B cable").count()) === 0);
    await page.getByRole("button", { name: "Active" }).click();
    ok(`13. switching back to Active shows the active materials again`, await page.getByText("12/2 NM-B cable").first().isVisible());

    // ── 14. desktop screenshot ────────────────────────────────────────────────
    const desktopShot = path.join(SHOT_DIR, `materials-desktop-${RUN}.png`);
    await page.screenshot({ path: desktopShot, fullPage: true });
    ok(`14. desktop screenshot (1440px) saved`, true, desktopShot);

    // ── 15. mobile: stacked rows, no desktop header, combined source/updated line ──
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    // A reload is a fresh page load — CABLE_CAT6 is still unresolved
    // (ASSUMED confidence), so the "defaults to Needs attention" behavior
    // correctly re-applies and narrows the view again. Switch back to "All"
    // for a representative mobile view/screenshot, same as a contractor
    // would by picking it from the dropdown.
    await page.getByLabel("Filter by status").selectOption({ value: "all" });
    ok(`15. mobile: the desktop column header is hidden`, !(await page.getByText("Current cost", { exact: true }).first().isVisible()));
    // .last(): MaterialRow.tsx renders the desktop copy of each row FIRST in
    // the DOM and the mobile stack second — at this viewport the desktop
    // copy is the one CSS-hidden, so .last() is the visible mobile copy.
    ok(`    ...the material name is still readable`, await page.getByText("12/2 NM-B cable").last().isVisible());
    ok(`    ...combined Source · Updated caption is shown in the stacked card`, await page.getByText(/Manual · /).first().isVisible());
    const mobileShot = path.join(SHOT_DIR, `materials-mobile-${RUN}.png`);
    await page.screenshot({ path: mobileShot, fullPage: true });
    ok(`    mobile screenshot (390px) saved`, true, mobileShot);

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`16. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
