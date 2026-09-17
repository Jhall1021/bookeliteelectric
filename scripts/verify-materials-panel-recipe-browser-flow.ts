/**
 * MaterialsPanel.tsx — the redesigned service-level "Materials for this
 * service" recipe workspace, driven through the REAL admin UI in a REAL
 * browser, signed in as a disposable account created through the actual
 * sign-up + email-verification pipeline. Same conventions as
 * verify-materials-catalog-ui-browser-flow.ts and
 * verify-material-cost-drawer-browser-flow.ts.
 *
 * WHY THIS EXISTS
 *
 * The dense inline panel (quantity inputs + a bottom-of-panel error string +
 * a collapsed "Change what a part costs" <details> section) is replaced by:
 * a header with a catalog link and "Add material"; a summary card (Direct
 * material cost / Material markup / "Material amount in price", "Incomplete"
 * plus a banner when any line lacks a cost); a five-column recipe list with
 * PER-ROW quantity validation (not a bottom-of-panel string) and Enter-or-
 * blur commit; a searchable "Add material" picker (AddMaterialDialog.tsx)
 * that stays open across several adds; and a confirmed, service-scoped
 * Remove. Editing an existing line's COST still goes through the same
 * MaterialCostDrawer.tsx the catalog page uses — proven in depth by
 * verify-material-cost-drawer-browser-flow.ts; this script only proves THIS
 * panel reaches it correctly (narrowed row prop, correct trigger/focus) and
 * that the shared-cost impact is real, not that the drawer itself works.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3431 \
 *     npx tsx scripts/verify-materials-panel-recipe-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK,
 *   and DATABASE_URL pointed at the SAME database this script uses)
 *
 * Also saves desktop (1440px) and mobile (390px) screenshots of the
 * finished panel, the add-material picker open, and a missing-cost state,
 * to SCREENSHOT_DIR — six screenshots total.
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3431";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-materials-panel-recipe-flow-mail.jsonl";
const SHOT_DIR = process.env.SCREENSHOT_DIR ?? "/tmp/p2b-materials-panel-recipe-shots";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-materials-panel-recipe-flow-${RUN}`;
const EMAIL = `p2b-materials-panel-recipe-flow-${RUN}@resend.dev`;

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
 *   EMPTY service            — zero ServiceMaterial rows: the empty state.
 *   RECIPE service           — WIRE_12_2 (priced, qty 10) + BREAKER_SINGLE_POLE
 *                              (canonicalMaterialId set, deliberately NO
 *                              ContractorMaterial — a missing-price role, the
 *                              same "legacy/imported line with no cost yet"
 *                              shape prior slices' fixtures use) — starts
 *                              Incomplete.
 *   COMPANION service        — CABLE_CAT6 itemized (qty 5), using the SAME
 *                              costed ContractorMaterial RECIPE will later
 *                              add — the shared-repricing witness.
 *   Catalog: WIRE_12_2 and CABLE_CAT6 costed+active (pickable); BOX_CEILING_STANDARD
 *   costed+active (a second pickable item, so the picker can add two in one
 *   sitting); BREAKER_SINGLE_POLE and GFCI_INTERIOR deliberately NOT costed
 *   (never appear in the picker at all — only priced, active materials do).
 */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const [wire, breaker, cat6, box, gfci] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CABLE_CAT6" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_CEILING_STANDARD" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_INTERIOR" }, select: { id: true } }),
  ]);

  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Materials Panel Recipe Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  const category = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonical.id, sortOrder: 0 },
    select: { id: true },
  });

  const baseServiceData = {
    contractorId: contractor.id, categoryId: legacyCategory.id, contractorCategoryId: category.id,
    bookingType: "INSTANT" as const, photoState: "NONE" as const, active: true, offered: true,
    fieldLaborHours: 1, requiresTechCount: 1,
  };

  const emptyService = await prisma.service.create({
    data: { ...baseServiceData, slug: "recipe-flow-empty-service", name: "Empty Recipe Service" },
    select: { id: true },
  });

  const recipeService = await prisma.service.create({
    data: {
      ...baseServiceData, slug: "recipe-flow-recipe-service", name: "Recipe Workspace Service",
      materials: {
        create: [
          { canonicalMaterialId: wire.id, quantity: 10, order: 0 },
          { canonicalMaterialId: breaker.id, quantity: 1, order: 1 },
        ],
      },
    },
    select: { id: true },
  });

  const companionService = await prisma.service.create({
    data: {
      ...baseServiceData, slug: "recipe-flow-companion-service", name: "Shared Cost Companion Service",
      materials: { create: [{ canonicalMaterialId: cat6.id, quantity: 5, order: 0 }] },
    },
    select: { id: true },
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
      costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
    },
  });
  await prisma.contractorMaterial.create({
    data: {
      contractorId: contractor.id, canonicalMaterialId: box.id,
      unitCostCents: 310, unitCostMilliCents: 310000,
      costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
    },
  });
  // BREAKER_SINGLE_POLE and GFCI_INTERIOR deliberately have no
  // ContractorMaterial — one drives the initial Incomplete/missing-cost
  // state, the other is added directly (bypassing the picker, which never
  // lists an unpriced role) as a fresh missing-cost row for the mobile shot.

  return { contractorId: contractor.id, emptyServiceId: emptyService.id, recipeServiceId: recipeService.id, companionServiceId: companionService.id, gfciId: gfci.id };
}

async function openMaterialsTab(page: Page, base: string, serviceId: string) {
  await page.goto(`${base}/dashboard/services/${serviceId}`, { waitUntil: "networkidle" });
  await page
    .getByRole("tablist", { name: "Service editor sections" })
    .getByRole("tab", { name: "Materials" })
    .click();
  await page.waitForSelector("h2:has-text('Materials for this service')");
}

/** Row wrapper locator, scoped by material name — same convention as the drawer script. */
function rowFor(page: Page, name: string) {
  return page.locator("div.p-3", { has: page.getByText(name, { exact: true }) });
}

async function verifyMaterialsIsOnlyActiveTab(page: Page, label: string) {
  const tablist = page.getByRole("tablist", { name: "Service editor sections" });
  const selected = tablist.locator('[role="tab"][aria-selected="true"]');
  ok(`${label}: Materials is the only selected service-editor tab`,
    await selected.count() === 1 && await selected.getAttribute("id") === "service-editor-tab-materials");
  ok(`${label}: every other service-editor tab is explicitly inactive`,
    await tablist.locator('[role="tab"][aria-selected="false"]').count() === 3);
}

async function captureFullPage(page: Page, shotPath: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: shotPath, fullPage: true });
}

async function main() {
  console.log(`\nMATERIALS PANEL — SERVICE RECIPE WORKSPACE — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);
  await mkdir(SHOT_DIR, { recursive: true }).catch(() => {});

  const browser = await chromium.launch();
  try {
    await teardown();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Materials Panel Recipe Owner");
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

    const fixture = await buildFixture(user.id);

    // ════════════════════════════════════════════════ DESKTOP (1440px) ═══

    // ── 1. empty state ─────────────────────────────────────────────────
    await openMaterialsTab(page, BASE, fixture.emptyServiceId);
    ok(`1. an unitemized service shows the empty state, not a blank list`,
      await page.getByText("Not itemized yet — this service uses a single material figure.").isVisible());
    ok(`   ...the empty state explains itemizing replaces the single allowance`,
      await page.getByText(/Adding your first material replaces it with a real, itemized list/).isVisible());
    const addFirstBtn = page.getByRole("button", { name: "Add first material" });
    ok(`   ...and offers "Add first material" as the primary action`, await addFirstBtn.isVisible());

    // ── 2. the recipe workspace, header + missing-cost initial state ──────
    await openMaterialsTab(page, BASE, fixture.recipeServiceId);
    ok(`2. header title is "Materials for this service"`,
      await page.getByRole("heading", { name: "Materials for this service" }).isVisible());
    ok(`   ...supporting text explains what this computes`,
      await page.getByText(/Parts and quantities used to calculate this service.s material cost\./).isVisible());
    const catalogLink = page.getByRole("link", { name: "Manage all material costs" });
    ok(`   ...a "Manage all material costs" link points at /dashboard/materials`,
      (await catalogLink.getAttribute("href")) === "/dashboard/materials");
    ok(`   ...and "Add material" is the primary action in the header`,
      await page.getByRole("button", { name: "Add material" }).isVisible());

    ok(`3. one unpriced line (Single-pole breaker) makes the summary Incomplete`,
      (await page.getByText("Incomplete").count()) >= 1);
    ok(`   ...the banner names WHICH material needs a cost, not just a count`,
      await page.getByText(/Missing cost: Single-pole breaker\./).isVisible());
    ok(`   ...the summary card labels the sell figure "Material amount in price", not "sells at"`,
      await page.getByText("Material amount in price").isVisible());
    ok(`   ...and there is no vague "sells at" wording left anywhere on the panel`,
      (await page.getByText("sells at", { exact: false }).count()) === 0);
    ok(`   ...the retired inline cost editor ("Change what a part costs") is gone`,
      (await page.getByText("Change what a part costs").count()) === 0);
    await verifyMaterialsIsOnlyActiveTab(page, "desktop");

    const missingCostDesktopShot = path.join(SHOT_DIR, `missing-cost-desktop-${RUN}.png`);
    await captureFullPage(page, missingCostDesktopShot);
    ok(`   missing-cost desktop screenshot saved`, true, missingCostDesktopShot);

    // ── 4. quantity — per-row inline validation, Enter AND blur commit ────
    const wireRow = rowFor(page, "12/2 NM-B cable");
    // Both the desktop row and the mobile stacked row are always in the DOM
    // (one hidden by CSS at this viewport) — .first() is the desktop input.
    const wireQtyInput = wireRow.getByLabel(/Quantity of/).first();
    await wireQtyInput.fill("-3");
    await wireQtyInput.blur();
    ok(`4. an invalid quantity shows its error BESIDE that row`,
      await wireRow.getByRole("alert").first().isVisible());
    ok(`   ...not as a single error string at the bottom of the panel`,
      (await page.locator("form, div").filter({ hasText: /^Quantity must be/ }).count()) === 0);
    ok(`   ...and the field reverts to the last valid quantity`, (await wireQtyInput.inputValue()) === "10");

    await wireQtyInput.fill("25");
    await wireQtyInput.press("Enter");
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".text-sm.font-medium.text-navy")).some((el) => el.textContent?.trim() === "$18.00"),
      undefined,
      { timeout: 10000 }
    );
    ok(`5. pressing Enter commits a valid quantity (25 × $0.72 = $18.00 line total)`,
      await wireRow.getByText("$18.00").first().isVisible());
    ok(`   ...the row's own error is cleared`, (await wireRow.getByRole("alert").count()) === 0);

    // ── 6. add-material picker — search, multiple adds, stays open ────────
    const addBtn = page.getByRole("button", { name: "Add material" });
    await addBtn.click();
    const dialog = page.getByRole("dialog", { name: "Add material" });
    await dialog.waitFor({ state: "visible" });
    ok(`6. "Add material" opens a labeled, focused search dialog`, await dialog.isVisible());
    const focusedInDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    ok(`   ...focus moved inside it on open`, focusedInDialog);
    ok(`   ...it never shows a raw canonical id anywhere in its text`,
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test((await dialog.innerText())));

    await dialog.getByLabel("Search materials").fill("zzz-no-such-material");
    ok(`   ...an unmatched search shows a real no-results state`,
      await dialog.getByText(/No materials match/).isVisible());
    await dialog.getByLabel("Search materials").fill("");

    const addPickerDesktopShot = path.join(SHOT_DIR, `add-picker-desktop-${RUN}.png`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: addPickerDesktopShot, fullPage: true });
    ok(`   add-picker desktop screenshot saved`, true, addPickerDesktopShot);

    await dialog.getByRole("listitem").filter({ hasText: "Cat6 network cable" }).getByRole("button", { name: "Add" }).click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent?.includes("Adding…"));
    ok(`7. adding Cat6 network cable keeps the dialog open`, await dialog.isVisible());
    ok(`   ...and the just-added material drops out of the list (never offered twice)`,
      (await dialog.getByText("Cat6 network cable").count()) === 0);

    await dialog.getByRole("listitem").filter({ hasText: "Standard ceiling box" }).getByRole("button", { name: "Add" }).click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent?.includes("Adding…"));
    ok(`   ...a second add in the same visit also succeeds without reopening`,
      (await dialog.getByText("Standard ceiling box").count()) === 0);

    await dialog.getByRole("button", { name: "Done" }).click();
    await dialog.waitFor({ state: "detached" });
    const addTriggerRestored = await addBtn.evaluate((el) => el === document.activeElement);
    ok(`   ...closing returns focus to the "Add material" button`, addTriggerRestored);

    ok(`8. both newly added materials now appear in the recipe list`,
      await rowFor(page, "Cat6 network cable").isVisible() && await rowFor(page, "Standard ceiling box").isVisible());
    ok(`   ...the summary is STILL Incomplete (Single-pole breaker is still unpriced)`,
      await page.getByText(/Missing cost: Single-pole breaker\./).isVisible());

    // ── 9. confirmed removal — cancel keeps it, confirm removes it ────────
    const boxRow = rowFor(page, "Standard ceiling box");
    // Desktop and mobile rows both exist in the DOM (one CSS-hidden) — .first() is the desktop one, visible at this viewport.
    await boxRow.getByRole("button", { name: "Remove Standard ceiling box" }).first().click();
    const removeDialog = page.getByRole("alertdialog");
    await removeDialog.waitFor({ state: "visible" });
    ok(`9. Remove opens a confirmation naming the material`,
      await removeDialog.getByText("Remove Standard ceiling box?").isVisible());
    ok(`   ...explaining this only detaches it from THIS service`,
      await removeDialog.getByText(/only removes Standard ceiling box from this service’s recipe/).isVisible());
    await removeDialog.getByRole("button", { name: "Cancel" }).click();
    await page.waitForSelector('[role="alertdialog"]', { state: "detached" });
    ok(`   ...Cancel leaves the row in place`, await boxRow.isVisible());

    await boxRow.getByRole("button", { name: "Remove Standard ceiling box" }).first().click();
    await removeDialog.waitFor({ state: "visible" });
    await removeDialog.getByRole("button", { name: "Remove" }).click();
    await page.waitForSelector('[role="alertdialog"]', { state: "detached" });
    await page.waitForFunction(() => !document.body.textContent?.includes("Standard ceiling box"));
    ok(`   ...confirming actually removes it`, (await page.getByText("Standard ceiling box").count()) === 0);
    const boxStillCosted = await prisma.contractorMaterial.findFirst({
      where: { contractorId: fixture.contractorId, canonicalMaterial: { key: "BOX_CEILING_STANDARD" } },
      select: { unitCostCents: true },
    });
    ok(`   ...removal is recipe-only — the catalog cost itself is untouched`,
      boxStillCosted?.unitCostCents === 310, `got ${boxStillCosted?.unitCostCents}`);

    // ── 10. missing-cost pricing — "Set cost" reaches the SAME drawer ─────
    const breakerRow = rowFor(page, "Single-pole breaker");
    const setCostBtn = breakerRow.getByRole("button", { name: "Set cost" }).first();
    await setCostBtn.click();
    const costDialog = page.getByRole("dialog", { name: "Single-pole breaker" });
    await costDialog.waitFor({ state: "visible" });
    ok(`10. "Set cost" on an unpriced line opens MaterialCostDrawer, labeled with the material's name`,
      await costDialog.isVisible());
    await costDialog.getByLabel(/Cost per/).fill("4.25");
    await costDialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 10000 });
    // Same fire-and-forget load() race as the shared-cost-edit check below —
    // the drawer can detach a beat before the panel's own refetch lands.
    await page.waitForFunction(() => !document.body.textContent?.includes("Incomplete"), undefined, { timeout: 10000 });
    ok(`    ...saving closes the drawer and the summary clears Incomplete`,
      (await page.getByText("Incomplete").count()) === 0);
    ok(`    ...the readiness banner is gone`,
      (await page.getByText(/material needs a cost/).count()) === 0);

    // ── 11. shared-cost editing/repricing — via "Edit cost" on Cat6 ───────
    const cat6Row = rowFor(page, "Cat6 network cable");
    await cat6Row.getByRole("button", { name: "Edit cost" }).first().click();
    const editDialog = page.getByRole("dialog", { name: "Cat6 network cable" });
    await editDialog.waitFor({ state: "visible" });
    ok(`11. "Edit cost" on an already-priced line opens the SAME drawer`, await editDialog.isVisible());
    ok(`    ...the impact copy is real, off this material's actual usage (2 services: this one + the companion)`,
      await editDialog.getByText("Saving this cost updates the material totals for 2 services.").isVisible());
    const companionBefore = await prisma.service.findUniqueOrThrow({
      where: { id: fixture.companionServiceId }, select: { materialCostCents: true },
    });
    await editDialog.getByLabel(/Cost per/).fill("0.60");
    await editDialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 10000 });
    const companionAfter = await prisma.service.findUniqueOrThrow({
      where: { id: fixture.companionServiceId }, select: { materialCostCents: true },
    });
    ok(`    ...a DIFFERENT service using the same material really was repriced ($${(companionBefore.materialCostCents ?? 0) / 100} -> $${(companionAfter.materialCostCents ?? 0) / 100})`,
      companionAfter.materialCostCents === 300, `got ${companionAfter.materialCostCents}`);
    // The drawer's onSaved fires this panel's own load() without awaiting
    // it (see MaterialsPanel.tsx) — the dialog can detach a beat before the
    // refetch lands, so poll for the refreshed row rather than asserting
    // the instant the dialog is gone.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("div.p-3")).some((row) => row.textContent?.includes("Cat6") && row.textContent?.includes("$0.60")),
      undefined,
      { timeout: 10000 }
    );
    ok(`    ...and this panel's own line total reflects the new cost (1 x $0.60 = $0.60)`, true);

    // ── 12. summary recalculation + finished-panel desktop screenshot ─────
    const summaryCard = page.locator("div.rounded-card.border.border-cardline.bg-warmwhite");
    ok(`12. the summary card now shows a real Direct material cost (fully priced recipe)`,
      !(await summaryCard.getByText("Incomplete").isVisible().catch(() => false)));

    const panelDesktopShot = path.join(SHOT_DIR, `panel-desktop-${RUN}.png`);
    await captureFullPage(page, panelDesktopShot);
    ok(`    finished-panel desktop screenshot saved`, true, panelDesktopShot);

    // ── 13. tenant isolation — the catalog/picker never leaks another contractor's data ──
    const otherContractor = await prisma.contractor.findFirst({
      where: { slug: { not: SLUG }, active: true },
      select: { id: true, slug: true },
    });
    if (otherContractor) {
      const otherCmIds = new Set(
        (await prisma.contractorMaterial.findMany({
          where: { contractorId: otherContractor.id, active: true },
          select: { id: true },
        })).map((r) => r.id)
      );
      const apiResponse = await page.evaluate(
        async (serviceId) => {
          const res = await fetch(`/api/admin/materials?serviceId=${serviceId}`);
          return res.json();
        },
        fixture.recipeServiceId
      );
      const returnedCmIds: string[] = (apiResponse.catalog ?? []).map((c: { id: string }) => c.id);
      const leaked = returnedCmIds.filter((id) => otherCmIds.has(id));
      ok(`13. the picker's catalog never includes another contractor's (${otherContractor.slug}) ContractorMaterial rows`,
        leaked.length === 0, `${leaked.length} leaked id(s)`);
    } else {
      console.log(`  13. · only one contractor on this database — tenant-isolation check skipped`);
    }

    // ════════════════════════════════════════════════ MOBILE (390px) ═════
    // A fresh missing-cost row, added directly (the picker never lists an
    // unpriced role) — the mobile missing-cost shot needs its own unpriced
    // line since Single-pole breaker was already priced above.
    const gfciRow = await prisma.serviceMaterial.create({
      data: { serviceId: fixture.recipeServiceId, canonicalMaterialId: fixture.gfciId, quantity: 2, order: 9 },
    });

    await page.setViewportSize({ width: 390, height: 844 });
    // A full reload resets ServiceWorkspace's own tab state back to
    // "Overview" (initialTab has no query-param wiring) — re-select
    // Materials, same as openMaterialsTab does on first load.
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("tablist", { name: "Service editor sections" })
      .getByRole("tab", { name: "Materials" })
      .click();
    await page.waitForSelector("h2:has-text('Materials for this service')");
    ok(`14. mobile: Incomplete returns the instant a line has no cost`,
      await page.getByText(/Missing cost: Interior GFCI receptacle\./).isVisible());
    await verifyMaterialsIsOnlyActiveTab(page, "mobile");

    const mobileHeader = page.locator("header").first();
    await page.evaluate(() => window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight - window.innerHeight)));
    const mobileHeaderBoxAfterScroll = await mobileHeader.boundingBox();
    ok(`    ...the mobile admin header scrolls away instead of overlaying service-editor content`,
      !!mobileHeaderBoxAfterScroll && mobileHeaderBoxAfterScroll.y + mobileHeaderBoxAfterScroll.height <= 0,
      mobileHeaderBoxAfterScroll
        ? `header bottom=${mobileHeaderBoxAfterScroll.y + mobileHeaderBoxAfterScroll.height}`
        : "missing layout box");

    const missingCostMobileShot = path.join(SHOT_DIR, `missing-cost-mobile-${RUN}.png`);
    await captureFullPage(page, missingCostMobileShot);
    ok(`    missing-cost mobile screenshot saved`, true, missingCostMobileShot);

    ok(`15. material names wrap on mobile rather than truncating`,
      await page.evaluate(() => Array.from(document.querySelectorAll(".break-words")).some((el) => el.textContent?.includes("network cable"))));
    ok(`    ...no material name is CSS-truncated (no "truncate" class left on a name)`,
      (await page.locator(".truncate", { hasText: "Cat6 network cable" }).count()) === 0);

    // Resolve the fresh line so the mobile "finished panel" shot is Ready.
    const gfciRowLoc = rowFor(page, "Interior GFCI receptacle");
    // Mobile viewport now — .last() is the mobile-stacked row's own button, the one actually visible here.
    await gfciRowLoc.getByRole("button", { name: "Set cost" }).last().click();
    const gfciDialog = page.getByRole("dialog", { name: "Interior GFCI receptacle" });
    await gfciDialog.waitFor({ state: "visible" });
    const gfciPanelBox = await page.locator('[role="dialog"]').boundingBox();
    ok(`16. mobile: the cost drawer is a full-width sheet (not the ~460px desktop drawer)`,
      !!gfciPanelBox && gfciPanelBox.width >= 380, gfciPanelBox ? `width=${gfciPanelBox.width}` : "no box");
    await gfciDialog.getByLabel(/Cost per/).fill("22.00");
    await gfciDialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 10000 });
    await page.waitForFunction(() => !document.body.textContent?.includes("Incomplete"), undefined, { timeout: 10000 });
    ok(`    ...saving from the mobile sheet succeeds and clears Incomplete`,
      (await page.getByText("Incomplete").count()) === 0);

    const panelMobileShot = path.join(SHOT_DIR, `panel-mobile-${RUN}.png`);
    await captureFullPage(page, panelMobileShot);
    ok(`    finished-panel mobile screenshot saved`, true, panelMobileShot);

    // ── 17. mobile add-material picker is a full-screen sheet ─────────────
    await page.getByRole("button", { name: "Add material" }).click();
    const mobileDialog = page.getByRole("dialog", { name: "Add material" });
    await mobileDialog.waitFor({ state: "visible" });
    const mobileDialogBox = await page.locator('[role="dialog"]').boundingBox();
    ok(`17. mobile: "Add material" opens a full-screen sheet`,
      !!mobileDialogBox && mobileDialogBox.width >= 380 && mobileDialogBox.height >= 800,
      mobileDialogBox ? `${mobileDialogBox.width}x${mobileDialogBox.height}` : "no box");

    const addPickerMobileShot = path.join(SHOT_DIR, `add-picker-mobile-${RUN}.png`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: addPickerMobileShot, fullPage: true });
    ok(`    add-picker mobile screenshot saved`, true, addPickerMobileShot);
    await page.keyboard.press("Escape");
    await mobileDialog.waitFor({ state: "detached" });

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`18. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
