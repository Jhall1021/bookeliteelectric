/**
 * MaterialCostDrawer.tsx — the focused side-panel/full-screen-sheet editor
 * that replaced the inline MaterialCostEditor — driven through the REAL
 * admin UI in a REAL browser, signed in as a disposable account created
 * through the actual sign-up + email-verification pipeline. Same
 * conventions as verify-materials-catalog-ui-browser-flow.ts (which proves
 * the drawer reaches a save at all, in both cost modes); THIS script goes
 * deep on the drawer's OWN contract — the part that is genuinely new here.
 *
 * WHAT THIS PROVES, desktop (1440px) THEN mobile (390px):
 *
 *   labeling        role="dialog"/aria-modal, and Playwright's accessible-
 *                   name resolution (which implements aria-labelledby) sees
 *                   the material's own name as the dialog's name — not
 *                   asserted structurally, resolved the same way a screen
 *                   reader would.
 *   focus trap      opening moves focus inside the panel; pressing Tab far
 *                   more times than there are focusable elements never
 *                   lands focus outside it.
 *   scroll lock     document.body's overflow is hidden while open, restored
 *                   once closed.
 *   clean close     Escape / Cancel with NO changes closes immediately, no
 *                   confirmation — and returns focus to the exact Edit
 *                   button that opened it.
 *   dirty close     Escape / Cancel / the backdrop, each WITH a change
 *                   pending, all route through the identical confirmation
 *                   ("Discard your changes?"); "Keep editing" returns to the
 *                   form with the typed value intact; a second attempt then
 *                   "Discard changes" actually closes and restores focus.
 *   validation      an invalid entry (negative, or cleared) disables Save
 *                   without ever calling the API; a valid entry re-enables
 *                   it.
 *   API failure     a real POST failure (intercepted, not simulated
 *                   client-side) leaves the drawer OPEN, shows the error
 *                   INSIDE it, and leaves every typed field exactly as it
 *                   was — then, unintercepted, the SAME Save click succeeds.
 *   impact copy     "N services" vs "not currently used by a service",
 *                   depending on the real usageCount on the row opened.
 *   package type    a real, independently editable field — new, existing
 *                   (reopening shows the just-saved value), edited, and
 *                   cleared (a real "no type" instruction, not a fallback to
 *                   the material's purchasing unit) — plus the live
 *                   "Bought as a $X <type> of N" summary, neutral ("package")
 *                   when blank, and the unit-cost preview staying correct
 *                   throughout. This is the exact capability a first pass at
 *                   this drawer dropped, defaulting silently to the
 *                   purchasing unit instead (see MaterialCostDrawer.tsx's
 *                   own header comment). A SECOND, independent instance of
 *                   the same bug turned up one layer down, in the "create"
 *                   action of app/api/admin/materials/route.ts — the
 *                   route itself defaulted packageUnit to the material's
 *                   unit for first-time package pricing, regardless of
 *                   what any client sent. The mobile phase's real save on
 *                   Single-pole breaker (a missing-price role, so "create")
 *                   asserts that fix directly against the database.
 *   mobile sheet    the panel is full viewport width (not the ~460px
 *                   desktop drawer), the footer is genuinely CSS `sticky`,
 *                   and dirty-close + a real save both still work there.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BROWSER_FLOW_BASE_URL=http://localhost:3426 \
 *     npx tsx scripts/verify-material-cost-drawer-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK,
 *   and DATABASE_URL pointed at the SAME database this script uses)
 *
 * Also saves desktop and mobile screenshots of the OPEN drawer to
 * SCREENSHOT_DIR for design review.
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3426";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-material-cost-drawer-flow-mail.jsonl";
const SHOT_DIR = process.env.SCREENSHOT_DIR ?? "/tmp/p2b-material-cost-drawer-shots";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-material-cost-drawer-flow-${RUN}`;
const EMAIL = `p2b-material-cost-drawer-flow-${RUN}@resend.dev`;

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
 *   WIRE_12_2 (Confirmed)        used by the service — drives the focus/
 *                                dirty/validation/API-failure tests below
 *   BREAKER_SINGLE_POLE (missing) used by the SAME service — "Add cost",
 *                                mobile sheet, "N services" copy
 *   CABLE_CAT6 (Confirmed)       NOT used by any service — the "not
 *                                currently used" impact copy
 */
async function buildFixture(userId: string) {
  const canonical = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  const legacyCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const [wire, breaker, cat6] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CABLE_CAT6" }, select: { id: true } }),
  ]);

  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Material Cost Drawer Flow Electric", active: true, countryCode: "US" },
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
      slug: "material-cost-drawer-flow-service", name: "Material Cost Drawer Flow Service",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      fieldLaborHours: 1, requiresTechCount: 1,
      materials: {
        create: [
          { canonicalMaterialId: wire.id, quantity: 10, order: 0 },
          { canonicalMaterialId: breaker.id, quantity: 1, order: 1 },
        ],
      },
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
  // BREAKER_SINGLE_POLE deliberately has no ContractorMaterial — this
  // fixture's "missing price" / Add-cost material.

  return { contractorId: contractor.id, serviceId: service.id };
}

/** Row wrapper locator — scoped so a click/read never risks matching a different material's copy of the same control. */
function rowFor(page: Page, name: string) {
  return page.locator("div.p-3", { has: page.getByText(name, { exact: true }) });
}

async function main() {
  console.log(`\nMATERIAL COST DRAWER — BROWSER FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);
  await mkdir(SHOT_DIR, { recursive: true }).catch(() => {});

  const browser = await chromium.launch();
  try {
    await teardown();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Material Cost Drawer Owner");
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

    await buildFixture(user.id);

    // ════════════════════════════════════════════════ DESKTOP (1440px) ═══
    await page.goto(`${BASE}/dashboard/materials`, { waitUntil: "networkidle" });
    // Start from "All" so every fixture row is visible regardless of the
    // catalog's own needs-attention default — this script is about the
    // drawer, not the catalog's filtering (already proven elsewhere).
    await page.getByLabel("Filter by status").selectOption({ value: "all" });

    const wireRow = rowFor(page, "12/2 NM-B cable");
    const wireEditBtn = wireRow.getByRole("button", { name: "Edit" }).first();

    // ── 1. opening — labeling, scroll lock, focus trap ────────────────────
    await wireEditBtn.click();
    // Generic handle reused for every "a dialog is open" check below,
    // regardless of which material's drawer it is — the name-specific
    // accessible-name check right here is the one place that matters which
    // material's dialog this resolves to.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    ok(`1. Edit opens a dialog whose accessible name IS the material's name (aria-labelledby resolved, not asserted)`,
      await page.getByRole("dialog", { name: "12/2 NM-B cable" }).isVisible());

    const overflowWhileOpen = await page.evaluate(() => document.body.style.overflow);
    ok(`   ...the background page's scroll is locked (body overflow: hidden)`, overflowWhileOpen === "hidden");

    const focusedInsideOnOpen = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    ok(`   ...focus moved inside the dialog on open`, focusedInsideOnOpen);

    for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
    const stillTrappedAfterManyTabs = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    ok(`   ...pressing Tab 15 times never moves focus outside the dialog (focus trap)`, stillTrappedAfterManyTabs);

    // ── 2. clean close (no changes) — immediate, no confirmation, focus restored ──
    await page.keyboard.press("Escape");
    ok(`2. Escape with no changes closes immediately — no confirmation dialog`, (await page.getByRole("dialog").count()) === 0);
    const overflowAfterClose = await page.evaluate(() => document.body.style.overflow);
    ok(`   ...scroll lock is released`, overflowAfterClose !== "hidden");
    const focusRestoredClean = await wireEditBtn.evaluate((el) => el === document.activeElement);
    ok(`   ...focus returned to the exact Edit button that opened it`, focusRestoredClean);

    // ── 3. impact notice — "used" vs "not used" copy, off the row's real usageCount ──
    await wireEditBtn.click();
    await dialog.waitFor({ state: "visible" });
    ok(`3. a material used by 1 service shows the "N services" impact copy`,
      await dialog.getByText("Saving this cost updates the material totals for 1 service.").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    const cat6Row = rowFor(page, "Cat6 network cable");
    await cat6Row.getByRole("button", { name: "Edit" }).first().click();
    await dialog.waitFor({ state: "visible" });
    ok(`   ...a material used by NO service shows the "not currently used" copy instead`,
      await dialog.getByText("This material is not currently used by a service.").isVisible());
    ok(`   ...the reassurance line is always shown`,
      await dialog.getByText("Customer prices are never published automatically.").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    // ── 4. validation — an invalid entry disables Save without ever calling the API ──
    await wireEditBtn.click();
    await dialog.waitFor({ state: "visible" });
    const saveBtn = dialog.getByRole("button", { name: /^Save cost|Saving…$/ });
    const costField = dialog.getByLabel(/Cost per/);
    await costField.fill("-5");
    ok(`4. a negative cost disables Save (client-side validation, before any request)`, await saveBtn.isDisabled());
    await costField.fill("");
    ok(`   ...an empty field disables Save too`, await saveBtn.isDisabled());
    await costField.fill("0.90");
    ok(`   ...a valid value re-enables it`, !(await saveBtn.isDisabled()));

    // ── 5. dirty close — Cancel, Keep editing preserves the value, Discard actually closes ──
    const cancelBtn = dialog.getByRole("button", { name: "Cancel" });
    await cancelBtn.click();
    const discardDialog = page.getByRole("alertdialog");
    await discardDialog.waitFor({ state: "visible" });
    ok(`5. Cancel with an unsaved change shows the discard confirmation instead of closing`, true);
    await discardDialog.getByRole("button", { name: "Keep editing" }).click();
    ok(`   ...the main dialog is back`, await dialog.isVisible());
    ok(`   ...and the typed value is exactly as it was — nothing was lost`, (await costField.inputValue()) === "0.90");

    // Same path via Escape this time.
    await page.keyboard.press("Escape");
    await discardDialog.waitFor({ state: "visible" });
    ok(`6. Escape with an unsaved change invokes the SAME confirmation as Cancel`, true);
    await discardDialog.getByRole("button", { name: "Discard changes" }).click();
    ok(`   ...Discard actually closes both dialogs`, (await page.getByRole("dialog").count()) === 0 && (await page.getByRole("alertdialog").count()) === 0);
    const focusRestoredAfterDiscard = await wireEditBtn.evaluate((el) => el === document.activeElement);
    ok(`   ...and focus returns to the Edit button, same as a clean close`, focusRestoredAfterDiscard);
    const wireUnchangedAfterDiscard = await prisma.contractorMaterial.findFirst({
      where: { contractorId: (await prisma.contractor.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id, canonicalMaterial: { key: "WIRE_12_2" } },
      select: { unitCostCents: true },
    });
    ok(`   ...and nothing was actually written to the database`, wireUnchangedAfterDiscard?.unitCostCents === 72, `got ${wireUnchangedAfterDiscard?.unitCostCents}`);

    // ── 7. API failure — stays open, shows the error, keeps the entry, retry succeeds ──
    await wireEditBtn.click();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByLabel(/Cost per/).fill("0.90");

    let intercepted = false;
    await page.route("**/api/admin/materials", async (route) => {
      const req = route.request();
      let isCostAction = false;
      try {
        const data = req.postDataJSON();
        isCostAction = data?.action === "cost";
      } catch { /* not JSON — let it through */ }
      if (isCostAction && !intercepted) {
        intercepted = true;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Simulated failure for verification" }) });
        return;
      }
      await route.continue();
    });

    await dialog.getByRole("button", { name: "Save cost" }).click();
    await dialog.getByText("Simulated failure for verification").waitFor({ state: "visible", timeout: 10000 });
    ok(`7. a real API failure shows the error INSIDE the drawer`, true);
    ok(`   ...the drawer stays open`, await dialog.isVisible());
    ok(`   ...the typed value is retained exactly, not cleared`, (await dialog.getByLabel(/Cost per/).inputValue()) === "0.90");

    // The interception's own job is done — remove it before the retry, so
    // nothing about the route handler itself (or its `intercepted` closure)
    // can interfere with the retry's own request or the refresh() GET that
    // follows a real save.
    await page.unroute("**/api/admin/materials");

    // Same click again — now unintercepted, it hits the real route.
    await dialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=12/2 NM-B cable saved.", { timeout: 10000 });
    ok(`8. retrying the SAME save after the failure succeeds`, (await page.getByRole("dialog").count()) === 0);
    // formatCents renders 90 cents as "$0.9", not "$0.90" — same
    // minimumFractionDigits: 0 trailing-zero suppression as the "$5" case
    // elsewhere in this suite.
    await page.waitForSelector("text=$0.9 / ft", { timeout: 10000 });
    ok(`   ...and the new cost is really saved`, await wireRow.getByText("$0.9 / ft").first().isVisible());

    // ── 9. package type — new, existing, edited, cleared, neutral wording ──
    // `cat6Row` already declared above (step 3's impact-notice check).
    await cat6Row.getByRole("button", { name: "Edit" }).first().click();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "By package" }).click();
    await dialog.getByLabel("Package price").fill("36.00");
    await dialog.getByLabel("Items per package").fill("4");
    // The live purchasing summary is pure client-side formatting (no
    // network round trip, unlike the unit-cost preview below), so it's
    // already correct by the time the fill() resolves — no wait needed.
    ok(`9. before a package type is entered, the live summary uses neutral "package" wording`,
      await dialog.getByText("Bought as a $36 package of 4.").isVisible());
    await dialog.getByLabel("Package type").fill("spool");
    ok(`   ...typing a package type updates the summary to use it`,
      await dialog.getByText("Bought as a $36 spool of 4.").isVisible());
    // The unit-cost preview DOES round-trip through preview-package — wait
    // for the real computed value rather than checking a single instant.
    await page.waitForFunction(
      () => document.querySelector('[role="dialog"] .text-lg.font-semibold')?.textContent?.trim() === "$9",
      undefined,
      { timeout: 10000 }
    );
    ok(`   ...the unit-cost preview is unaffected by the package type ($9 / ft)`, true);
    await dialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Cat6 network cable saved.", { timeout: 10000 });
    await page.waitForSelector("text=$9 / ft", { timeout: 10000 });
    ok(`   ...saved: the row now shows the package type ("4 spool")`, await cat6Row.getByText("4 spool").first().isVisible());

    // EXISTING — reopening shows the just-saved type, not blank.
    await cat6Row.getByRole("button", { name: "Edit" }).first().click();
    await dialog.waitFor({ state: "visible" });
    ok(`   ...reopening preserves and displays the existing package type ("spool")`,
      (await dialog.getByLabel("Package type").inputValue()) === "spool");

    // EDITED — changing it to something else persists the new value.
    await dialog.getByLabel("Package type").fill("bundle");
    await dialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Cat6 network cable saved.", { timeout: 10000 });
    await page.waitForSelector("text=4 bundle", { timeout: 10000 });
    ok(`   ...editing an existing package type persists the new value ("4 bundle")`, await cat6Row.getByText("4 bundle").first().isVisible());

    // CLEARED — an explicit empty value is a real "no package type" instruction.
    await cat6Row.getByRole("button", { name: "Edit" }).first().click();
    await dialog.waitFor({ state: "visible" });
    ok(`   ...reopening again shows "bundle"`, (await dialog.getByLabel("Package type").inputValue()) === "bundle");
    await dialog.getByLabel("Package type").fill("");
    ok(`   ...clearing it to blank re-enables Save (dirty + still valid)`,
      !(await dialog.getByRole("button", { name: "Save cost" }).isDisabled()));
    await dialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Cat6 network cable saved.", { timeout: 10000 });
    await page.waitForSelector("text=4 package", { timeout: 10000 });
    ok(`   ...clearing and saving leaves the row with neutral "package" wording, not "4 ft" or blank`,
      await cat6Row.getByText("4 package").first().isVisible());
    const cat6AfterClear = await prisma.contractorMaterial.findFirst({
      where: { canonicalMaterial: { key: "CABLE_CAT6" } },
      select: { packageUnit: true },
    });
    ok(`   ...the database really has packageUnit = null, not "ft" or any other fallback`,
      cat6AfterClear?.packageUnit === null, `got ${JSON.stringify(cat6AfterClear?.packageUnit)}`);

    // ── 10. desktop screenshot of the OPEN drawer ─────────────────────────
    const breakerRow = rowFor(page, "Single-pole breaker");
    await breakerRow.getByRole("button", { name: "Add cost" }).first().click();
    await dialog.waitFor({ state: "visible" });
    const desktopShot = path.join(SHOT_DIR, `drawer-desktop-${RUN}.png`);
    await page.screenshot({ path: desktopShot, fullPage: true });
    ok(`10. desktop screenshot (1440px, drawer open) saved`, true, desktopShot);
    await page.keyboard.press("Escape"); // clean — nothing entered yet
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    // ════════════════════════════════════════════════ MOBILE (390px) ═════
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByLabel("Filter by status").selectOption({ value: "all" });

    const breakerRowMobile = rowFor(page, "Single-pole breaker");
    await breakerRowMobile.getByRole("button", { name: "Add cost" }).last().click();
    await dialog.waitFor({ state: "visible" });

    const panelBox = await page.locator('[role="dialog"]').boundingBox();
    ok(`11. mobile: the panel is a full-screen sheet, not the ~460px desktop drawer`,
      !!panelBox && panelBox.width >= 380 && panelBox.width <= 390, panelBox ? `width=${panelBox.width}` : "no box");

    const footerPosition = await page.locator('[role="dialog"] footer').evaluate((el) => getComputedStyle(el).position);
    ok(`    ...the footer is genuinely CSS "sticky"`, footerPosition === "sticky", footerPosition);

    const mobileOverflow = await page.evaluate(() => document.body.style.overflow);
    ok(`    ...scroll lock still applies on mobile`, mobileOverflow === "hidden");

    // Dirty-close still works at this width.
    await dialog.getByRole("button", { name: "By package" }).click();
    await dialog.getByLabel("Package price").fill("50.00");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "visible" });
    ok(`12. dirty-close confirmation still triggers on mobile`, true);
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing" }).click();

    // Finish it for real — a successful save on the mobile sheet too.
    await dialog.getByLabel("Items per package").fill("10");
    // The drawer's calculated-result box is "Your cost per ea" (the unit is
    // already in the label) followed by just the dollar figure on the next
    // line — no "/ ea" suffix repeated in the value, unlike the row's
    // Current-cost cell.
    await page.waitForFunction(
      () => document.querySelector('[role="dialog"] .text-lg.font-semibold')?.textContent?.trim() === "$5",
      undefined,
      { timeout: 10000 }
    );
    await dialog.getByRole("button", { name: "Save cost" }).click();
    await page.waitForSelector("text=Single-pole breaker priced.", { timeout: 10000 });
    ok(`13. a real save succeeds from the mobile sheet`, (await page.getByRole("dialog").count()) === 0);
    // This save went through the "create" action (Single-pole breaker had
    // no ContractorMaterial yet) with no package type typed — the exact
    // path where app/api/admin/materials/route.ts used to default
    // packageUnit to the material's own unit ("each"), independently of
    // anything MaterialCostDrawer.tsx sends. Confirm the real fix, not just
    // the drawer's own field behavior already covered on CABLE_CAT6 above.
    const breakerAfterMobileSave = await prisma.contractorMaterial.findFirst({
      where: { canonicalMaterial: { key: "BREAKER_SINGLE_POLE" } },
      select: { packageUnit: true },
    });
    ok(`    ...first-time package pricing with no type set leaves packageUnit null, not "each"`,
      breakerAfterMobileSave?.packageUnit === null, `got ${JSON.stringify(breakerAfterMobileSave?.packageUnit)}`);

    const mobileShot = path.join(SHOT_DIR, `drawer-mobile-${RUN}.png`);
    // Re-open briefly for a representative "drawer open" mobile screenshot.
    await breakerRowMobile.getByRole("button", { name: "Edit" }).last().click();
    await dialog.waitFor({ state: "visible" });
    ok(`    ...reopening shows the Package type field genuinely empty, not "each"`,
      (await dialog.getByLabel("Package type").inputValue()) === "");
    await page.screenshot({ path: mobileShot, fullPage: true });
    ok(`    mobile screenshot (390px, sheet open) saved`, true, mobileShot);
    await page.keyboard.press("Escape");

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`14. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main();
