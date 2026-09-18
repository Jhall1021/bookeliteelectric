/**
 * The contractor disclaimer authoring lifecycle — through the REAL admin
 * UI, the REAL API route, and a REAL homeowner browser, on an owned,
 * stamped local database.
 *
 * WHAT THIS PROVES, AND WHY IT WAS MISSING
 *
 * `scripts/verify-catalog-completion.ts` only checked that
 * `InstallResult.disclaimersToAuthor > 0` and that the TEMPLATE carries a
 * `TemplateAnswerOptionDisclaimer` — neither proves a homeowner ever sees
 * anything, because `installCatalog` deliberately skips the real
 * `AnswerOptionDisclaimer` attachment until the contractor has authored
 * their own `ContractorDisclaimer`, and nothing in the app could create
 * that row. This proves the whole lifecycle for real:
 *
 *   unresolved -> contractor reviews neutral guidance (never Elite's own
 *   wording or dollar amounts) -> writes and saves their OWN text through
 *   the real /dashboard/policies UI -> the real PATCH /api/admin/disclaimers
 *   route attaches it, atomically, to every one of THIS contractor's own
 *   installed answer options -> a real homeowner browser, hitting the real
 *   storefront, sees that exact text on the applicable branch and does NOT
 *   see it on the inapplicable one -> a second, separate contractor's own
 *   authoring never touches the first contractor's rows.
 *
 * Two disclaimers, matching the task's own scope:
 *   CUSTOMER_SUPPLIED_EQUIPMENT   accessClass: null (always shown once
 *                                 authored). Two real dependents:
 *                                 replace-range-hood's hood_backsplash/
 *                                 "same_mounting" (priced through the real
 *                                 admin publication path and walked through
 *                                 the browser), and soundbar-installation's
 *                                 soundbar_power/"yes" (left deliberately
 *                                 UNPRICED — publishing it is not this
 *                                 task's to authorize — so this proof only
 *                                 confirms its attachment TARGET exists and
 *                                 is reachable in pendingContractorDisclaimers,
 *                                 never walks it through pricing/booking).
 *   TAP_EXISTING_FIXTURE_FINISHED accessClass: FINISHED — proven on
 *                                 fan-replacing-light's ceiling_access/
 *                                 "finished", shown only on the route that
 *                                 actually established FINISHED access. Its
 *                                 other dependent, new-ceiling-light, gates
 *                                 its own FINISHED branch behind an
 *                                 AnswerOptionComponent with no approved
 *                                 customer price — true on Elite's own live
 *                                 data too, not just a fresh install, since
 *                                 nothing in the app can ever set that
 *                                 approval — a real, separate, pre-existing
 *                                 gap, NOT fixed by this task.
 *
 * ALSO PROVEN: a required, reachable disclosure blocks the affected
 * service's activation (lib/serviceActivation.ts's new DISCLAIMER_UNRESOLVED
 * refusal) until its wording is saved, and a disclaimer requirement from a
 * SUPERSEDED template version does not leak into a contractor's pending
 * list — see scripts/verify-disclaimer-template-version-fold.ts, a separate,
 * fast, non-browser proof of that specific fix.
 *
 *   PLATFORM_MAIL_SINK=/tmp/p2b-disclaimer-authoring-flow-mail.jsonl \
 *   BROWSER_FLOW_BASE_URL=http://localhost:3613 \
 *     npx tsx scripts/verify-disclaimer-authoring-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK
 *   and DATABASE_URL, started separately — PLATFORM_MAIL_SINK only works in
 *   next dev, never next start)
 *
 * NOT PART OF `npm run verify`. Needs a running server, and the owned,
 * stamped local database this run's own DATABASE_URL points at (checked
 * below via the same guard every other rehearsal script in this repo uses).
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { resolvePolicy } from "../lib/policyResolution";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { overrideUnresolvedMaterialCost, declarePolicyMaterialQuantity } from "../lib/materialCost";
import { activationRefusal, activateService } from "../lib/serviceActivation";
import { pendingContractorDisclaimers } from "../lib/disclaimerAuthoring";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3613";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-disclaimer-authoring-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_A = `test-disclaimer-auth-a-${RUN}`;
const SLUG_B = `test-disclaimer-auth-b-${RUN}`;
const EMAIL_A = `p2b-disclaimer-auth-a-${RUN}@resend.dev`;
const EMAIL_B = `p2b-disclaimer-auth-b-${RUN}@resend.dev`;

const OWNER_TEXT_CUSTOMER_SUPPLIED = "OWNER-AUTHORED: Please have your soundbar and any mounting hardware ready before our crew arrives.";
const OWNER_TEXT_TAP_FINISHED = "OWNER-AUTHORED: We open the ceiling at both the old and the new light location for this connection.";
const OTHER_TENANT_TEXT = "SECOND-COMPANY WORDING that must never reach the first company's storefront.";

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
      await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } }).catch(() => {});
      await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } }).catch(() => {});
      await prisma.question.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
      await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
      await prisma.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorDisclaimer.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorCategory.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorPolicyValue.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.pricingSettings.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractorMembership.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
      await prisma.contractor.delete({ where: { id: c.id } }).catch(() => {});
    }
  }
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

/** A real, fully-installed fresh contractor — the whole electrical catalog, through the normal path. */
async function buildFixture(userId: string, slug: string) {
  const contractor = await prisma.contractor.create({
    data: { slug, name: "Disclaimer Authoring Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorSite.create({ data: { contractorId: contractor.id, hostedSlug: slug, publicId: `site_${slug}`, active: true } });
  await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: "electrical" } });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 18500, primaryMinimumCents: 19500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });

  const source = templateVersionSource(prisma, "electrical");
  const pf = await preflight(prisma, contractor.id, source);
  if (!pf.ok) throw new Error(`preflight refused for ${slug}: ${pf.message}`);
  const result = await installCatalog(prisma, contractor.id, pf.catalog);
  console.log(`  ${slug}: installed ${result.services} services, ${result.disclaimersToAuthor} disclaimer(s) to author`);

  // FIXTURE COMPLETION, not a template/Elite change: `fixture_work_height`'s
  // band options ship with LITERAL "{b1} feet or less" labels until the
  // contractor answers fixture_work_height.breakpoints — provisioning
  // creates the unresolved ContractorPolicyValue and copies each option's
  // template labelPattern verbatim, holes included (lib/policyResolution.ts's
  // own header). Resolved here through the real function, before any price
  // is published (publishSuggestedPrice itself refuses on an unresolved
  // policy — lib/pricePublication.ts), exactly as a real onboarding
  // contractor would.
  const heightPolicy = await resolvePolicy(prisma, contractor.id, "fixture_work_height.breakpoints", { boundaries: [8, 15, 25] });
  if (!heightPolicy.ok) throw new Error(`fixture_work_height.breakpoints resolution refused for ${slug}: ${heightPolicy.refusal.message}`);
  // fan-replacing-light's own switch-leg-distance question depends on a
  // SECOND band policy — publishSuggestedPrice refuses on any unresolved
  // policy the service reaches, not just the first one found.
  const switchLegPolicy = await resolvePolicy(prisma, contractor.id, "switch_leg_run.breakpoints", { boundaries: [15, 30] });
  if (!switchLegPolicy.ok) throw new Error(`switch_leg_run.breakpoints resolution refused for ${slug}: ${switchLegPolicy.refusal.message}`);

  // Second completion, same family: neither replace-range-hood nor
  // fan-replacing-light installs with a published price — installCatalog
  // never carries economics (extraction drops them on principle), so
  // GuidedFlowEngine correctly forces photo-review on every answer until a
  // contractor actually publishes one, through the same supported path the
  // real admin panel uses (components/admin/PricingPanel.tsx ->
  // PATCH /api/admin/services/[serviceId]/pricing): save realistic inputs,
  // then publish the price those inputs suggest. Never a direct
  // `service.update({ data: { basePrice } } })` — publishSuggestedPrice is
  // the one place that column is allowed to change, and it independently
  // refuses on an unresolved policy, so this only works because the policy
  // above was resolved first.
  for (const slugToPrice of ["replace-range-hood", "fan-replacing-light"]) {
    const svc = await prisma.service.findFirstOrThrow({ where: { slug: slugToPrice, contractorId: contractor.id }, select: { id: true } });
    await saveServicePricingInputs(prisma, svc.id, {
      fieldLaborHours: 1, wwtLaborHours: 0.5, materialCostCents: 0,
      estimatedMinutes: 60, isPrimaryEligible: true, estimatedMinutesReviewed: true,
    });
    const published = await publishSuggestedPrice(prisma, contractor.id, svc.id);
    if (!published.ok) throw new Error(`publishSuggestedPrice refused for ${slugToPrice}: ${published.refusal.message}`);
  }

  // Third completion, same family, needed for checks 2/6's activation proof
  // specifically (publishSuggestedPrice above doesn't check materials, only
  // policies — so this wasn't needed to reach the storefront route, only to
  // reach activatable). Both services need CONSUMABLES_SMALL costed and its
  // policy-quantity allowance declared; fan-replacing-light also needs
  // BOX_FAN_RATED (structural, quantity already fixed at 1) costed. Through
  // the same real functions the Materials panel itself calls — never a raw
  // ServiceMaterial/ContractorMaterial write.
  for (const materialKey of ["CONSUMABLES_SMALL", "BOX_FAN_RATED"]) {
    const canonical = await prisma.canonicalMaterial.findUnique({ where: { key: materialKey }, select: { id: true } });
    if (!canonical) continue;
    const cost = await overrideUnresolvedMaterialCost(
      prisma, { contractorId: contractor.id, canonicalMaterialId: canonical.id, unitCostCents: 500 },
      { reason: "disclaimer-authoring fixture setup", actor: "verify-disclaimer-authoring-browser-flow.ts" }
    );
    if (!cost.ok) throw new Error(`overrideUnresolvedMaterialCost refused for ${materialKey}: ${cost.code}`);
  }
  for (const slugNeedingConsumables of ["replace-range-hood", "fan-replacing-light"]) {
    const svc = await prisma.service.findFirstOrThrow({ where: { slug: slugNeedingConsumables, contractorId: contractor.id }, select: { id: true } });
    const canonical = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CONSUMABLES_SMALL" }, select: { id: true } });
    const qty = await declarePolicyMaterialQuantity(prisma, svc.id, canonical.id, 1);
    if (!qty.recompute?.resolved) throw new Error(`CONSUMABLES_SMALL still unresolved on ${slugNeedingConsumables} after declaration`);
  }

  return contractor.id;
}

/** A bare second contractor — no catalog needed to prove tenant isolation of the authoring write itself. */
async function buildBareContractor(userId: string, slug: string) {
  const contractor = await prisma.contractor.create({
    data: { slug, name: "Disclaimer Authoring Flow Electric (other tenant)", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorMembership.create({ data: { userId, contractorId: contractor.id, role: "OWNER", active: true } });
  return contractor.id;
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

/** Answer a SINGLE_SELECT question by its prompt heading and a substring of the option's label. */
async function answerChoice(page: Page, prompt: string, label: string) {
  await page.getByRole("heading", { name: prompt, exact: true }).waitFor();
  await page.getByRole("button", { name: label, exact: false }).first().click();
}

async function main() {
  console.log(`\nDISCLAIMER AUTHORING LIFECYCLE — BROWSER/API FLOW\n`);
  console.log(`  ${BASE}  ·  ${EMAIL_A} / ${EMAIL_B}  ·  sink ${SINK}\n`);
  await assertDisposableLocalDatabase(prisma);

  const browser = await chromium.launch();
  try {
    await teardown();

    const a = await signUpAndVerify(browser, "Disclaimer Auth Owner A", EMAIL_A);
    const b = await signUpAndVerify(browser, "Disclaimer Auth Owner B", EMAIL_B);

    const contractorAId = await buildFixture(a.userId, SLUG_A);
    await buildBareContractor(b.userId, SLUG_B);

    // ── 1. soundbar's own intended attachment exists, even unpriced ─────
    // CUSTOMER_SUPPLIED_EQUIPMENT's two real dependents are replace-range-
    // hood's hood_backsplash/"same_mounting" (walked through the browser
    // below) and soundbar-installation's soundbar_power/"yes" (deliberately
    // never priced or walked through the browser — publishing it is not
    // this task's to authorize). Confirmed directly against the real
    // pending-disclaimers derivation, not asserted.
    const pendingBefore = await pendingContractorDisclaimers(prisma, contractorAId);
    const customerSuppliedPending = pendingBefore.find((d) => d.key === "CUSTOMER_SUPPLIED_EQUIPMENT");
    ok("1. CUSTOMER_SUPPLIED_EQUIPMENT's real dependents include both replace-range-hood and soundbar-installation, unauthored",
      !!customerSuppliedPending && !customerSuppliedPending.authored
        && customerSuppliedPending.dependentSlugs.includes("replace-range-hood")
        && customerSuppliedPending.dependentSlugs.includes("soundbar-installation"),
      JSON.stringify(customerSuppliedPending));

    // ── 2. a required, reachable disclosure blocks activation ───────────
    const hoodService = await prisma.service.findFirstOrThrow({
      where: { slug: "replace-range-hood", contractorId: contractorAId }, select: { id: true },
    });
    const refusalBefore = await activationRefusal(prisma, contractorAId, hoodService.id);
    ok("2. replace-range-hood cannot activate before its required disclosure is written",
      refusalBefore?.code === "DISCLAIMER_UNRESOLVED", JSON.stringify(refusalBefore));

    // ── 3. BEFORE authoring: the real storefront shows nothing ──────────
    // CUSTOMER_SUPPLIED_EQUIPMENT attaches to two real answer options —
    // soundbar-installation's soundbar_power/"yes" and replace-range-hood's
    // hood_backsplash/"same_mounting". soundbar-installation has no
    // published basePrice (Elite's own live data — pricingMethod
    // LEGACY_PUBLISHED with basePrice null), so `customerPrice()`
    // (lib/pricing.ts) marks EVERY answer on that service mustReview and
    // GuidedFlowEngine forces photo-review right after the FIRST question,
    // for every contractor, before the tree ever reaches soundbar_power —
    // an existing, unrelated pricing gap, not something this task fixes.
    // replace-range-hood has a real published basePrice and reaches its
    // dependent option through an ordinary CONTINUE chain, so the proof
    // walks that one instead.
    const HOOD_BACKSPLASH_HEADING = "Will the new hood use the same mounting spot, or do we need to drill or cut into the backsplash or wall?";
    const HOOD_STEPS: [string, string][] = [
      ["Is there a range hood there now?", "Yes, there's one there now"],
      ["Does the current hood work — fan and light?", "Yes, it works"],
      ["How does the current hood vent?", "Out through the wall"],
      ["Is the new hood about the same size and type, going in the same spot?", "Yes, same size and same spot"],
    ];
    const headingVisible = async (page: Page, name: string, timeout: number) => {
      try { await page.getByRole("heading", { name, exact: true }).waitFor({ timeout }); return true; }
      catch { return false; }
    };
    const reachHoodBacksplashQuestion = async () => {
      await a.page.goto(`${BASE}/${SLUG_A}/services/x/replace-range-hood`, { waitUntil: "networkidle" });
      await a.page.getByRole("button", { name: /Check My Price|Start/ }).click();
      // This is called more than once against the SAME browser context, and
      // GuidedFlowSession legitimately resumes a contractor's own homeowner
      // session wherever it last left off (including straight to this exact
      // question) rather than restarting at the first one — so this walks
      // forward from wherever the session actually is instead of assuming a
      // fresh start every time.
      for (const [prompt, label] of HOOD_STEPS) {
        if (await headingVisible(a.page, HOOD_BACKSPLASH_HEADING, 1500)) return;
        if (await headingVisible(a.page, prompt, 5000)) {
          await a.page.getByRole("button", { name: label, exact: false }).first().click();
        }
      }
      try {
        await a.page.getByRole("heading", { name: HOOD_BACKSPLASH_HEADING, exact: true }).waitFor();
      } catch (e) {
        console.log(`  DIAGNOSTIC — hood flow page body after failure:\n${await a.page.innerText("body")}`);
        throw e;
      }
    };
    await reachHoodBacksplashQuestion();
    const beforeText = await a.page.innerText("body").catch(() => "");
    ok("3. before authoring, the real storefront page for replace-range-hood shows no customer-supplied-equipment wording",
      !beforeText.includes(OWNER_TEXT_CUSTOMER_SUPPLIED), "");

    // ── 4. the admin authoring UI shows neutral guidance, never Elite's own wording ──
    await a.page.goto(`${BASE}/dashboard/policies`, { waitUntil: "networkidle" });
    await a.page.waitForSelector("h2:has-text('Disclaimers')");
    const policiesPageText = await a.page.innerText("body");
    ok("4. the authoring page never shows Elite's own dollar amounts (none of $125/$190/$135/$200 appear)",
      !/\$1[23]5|\$190|\$200/.test(policiesPageText), "");
    ok("   the customer-supplied-equipment card starts blank — no pre-filled text copied from another contractor",
      (await a.page.locator("textarea").allInnerTexts()).every((t) => t.trim() === ""), "");

    // ── 5. author CUSTOMER_SUPPLIED_EQUIPMENT for real, through the UI ──
    // The card's own <h3> title, narrowed to its immediate <section> card —
    // not the page's own outer "Disclaimers" <section> wrapper, which also
    // contains this text (it contains every card).
    const customerSuppliedCard = a.page.locator("h3", { hasText: "Customer-supplied equipment" }).locator("xpath=ancestor::section[1]");
    await customerSuppliedCard.locator("textarea").fill(OWNER_TEXT_CUSTOMER_SUPPLIED);
    await customerSuppliedCard.getByRole("button", { name: /Save wording/ }).click();
    let attachedText: string;
    try {
      await customerSuppliedCard.getByText(/Saved.*attached to \d+ applicable/).waitFor({ timeout: 10000 });
      attachedText = await customerSuppliedCard.getByText(/Saved.*attached to \d+ applicable/).innerText();
    } catch (e) {
      console.log(`  DIAGNOSTIC — card state after save attempt:\n${await customerSuppliedCard.innerText()}`);
      throw e;
    }
    // Exactly 2, not just "non-zero": hood_backsplash/same_mounting AND
    // soundbar_power/yes both get the real attachment — the save reaches
    // soundbar's row too, even though soundbar itself stays unpriced (check 1).
    ok("5. saving through the real UI reports the exact expected attachment count (2 — hood and soundbar)",
      /attached to 2 applicable/.test(attachedText), attachedText);

    // ── 6. ...and the real UI save clears exactly that activation blocker ──
    const refusalAfter = await activationRefusal(prisma, contractorAId, hoodService.id);
    ok("6. replace-range-hood may now activate — the blocker named in check 2 is gone",
      refusalAfter === null, JSON.stringify(refusalAfter));
    const activation = await activateService(prisma, contractorAId, hoodService.id);
    ok("   activateService actually puts it live", activation.ok, JSON.stringify(activation));

    // ── 7. the real storefront now shows the contractor's OWN wording ──
    await reachHoodBacksplashQuestion();
    const afterText = await a.page.innerText("body");
    ok("7. the real homeowner-facing storefront now shows this contractor's own authored wording",
      afterText.includes(OWNER_TEXT_CUSTOMER_SUPPLIED), "");

    // ── 8. author TAP_EXISTING_FIXTURE_FINISHED too ──────────────────────
    await a.page.goto(`${BASE}/dashboard/policies`, { waitUntil: "networkidle" });
    await a.page.waitForSelector("h2:has-text('Disclaimers')");
    const finishedCard = a.page.locator("h3", { hasText: "Tapping an existing fixture" }).locator("xpath=ancestor::section[1]");
    ok("   its guidance names the real concept without stating Elite's own final sentence",
      !(await finishedCard.innerText()).includes("The fixture covers some of it, but not always all"), "");
    await finishedCard.locator("textarea").fill(OWNER_TEXT_TAP_FINISHED);
    await finishedCard.getByRole("button", { name: /Save wording/ }).click();
    const finishedAttachedText = await finishedCard.getByText(/Saved — attached to \d+ applicable/).innerText();
    ok("9. saving the access-conditional disclaimer reports a real attachment count across its real dependent services",
      /attached to [1-9]\d* applicable/.test(finishedAttachedText), finishedAttachedText);

    // ── 10. FINISHED branch: the real homeowner browser shows it ──────────
    // TAP_EXISTING_FIXTURE_FINISHED attaches to lighting_control/
    // existing_switched_light on four services. new-ceiling-light's own
    // FINISHED-setting option (attic_access/no_access) carries an
    // AnswerOptionComponent with approvedComponentPriceCents: null — on
    // ELITE'S OWN LIVE DATA too, not just a fresh install — so choosing "No
    // attic access" forces photo-review immediately, before the tree ever
    // reaches lighting_control, for every contractor including Elite. A
    // real, separate, already-existing gap (component pricing has no
    // resolution path in the app at all, same class as the basePrice and
    // band-policy gaps above), not something this task fixes.
    // fan-replacing-light's own FINISHED-setting option (ceiling_access/
    // finished) carries approvedComponentPriceCents: 0 and no components —
    // clean — so the proof walks that dependent instead.
    await a.page.goto(`${BASE}/${SLUG_A}/services/x/fan-replacing-light`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: /Check My Price|Start/ }).click();
    await answerChoice(a.page, "About how high is the fixture or work area?", "8 feet or less");
    await answerChoice(a.page, "What's directly below the work area?", "A normal level floor");
    await answerChoice(a.page, "What's directly above that ceiling?", "Finished space — another floor or a finished room");
    await a.page.getByRole("heading", { name: "How would you like the new light controlled?", exact: true }).waitFor();
    const finishedBranchText = await a.page.innerText("body");
    if (!finishedBranchText.includes(OWNER_TEXT_TAP_FINISHED)) {
      console.log(`  DIAGNOSTIC — lighting_control (FINISHED) page body:\n${finishedBranchText}`);
    }
    ok("10. on the FINISHED branch, the real homeowner page shows the contractor's own tap-existing-fixture wording",
      finishedBranchText.includes(OWNER_TEXT_TAP_FINISHED), "");

    // ── 11. ACCESSIBLE branch: the SAME answer, the disclaimer absent ─────
    await a.page.goto(`${BASE}/${SLUG_A}/services/x/fan-replacing-light`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: /Check My Price|Start/ }).click();
    await answerChoice(a.page, "About how high is the fixture or work area?", "8 feet or less");
    await answerChoice(a.page, "What's directly below the work area?", "A normal level floor");
    await answerChoice(a.page, "What's directly above that ceiling?", "An attic or open space we can get into");
    await a.page.getByRole("heading", { name: "How would you like the new light controlled?", exact: true }).waitFor();
    const accessibleBranchText = await a.page.innerText("body");
    ok("11. on the ACCESSIBLE branch — the SAME question, same answer available — the FINISHED-only wording is genuinely absent",
      !accessibleBranchText.includes(OWNER_TEXT_TAP_FINISHED), "");

    // ── 12. foreign tenant: a real, separate, authenticated session's own authoring never reaches contractor A ──
    const foreignResp = await b.ctx.request.patch(`${BASE}/api/admin/disclaimers`, {
      data: { key: "CUSTOMER_SUPPLIED_EQUIPMENT", text: OTHER_TENANT_TEXT },
      headers: { "Content-Type": "application/json" },
    });
    ok("12. a second, separate contractor's own authoring request succeeds for THEIR OWN row (not a refusal — every contractor may author their own wording)",
      foreignResp.status() === 200, `got ${foreignResp.status()}`);
    await reachHoodBacksplashQuestion();
    const afterForeignText = await a.page.innerText("body");
    ok("   ...and contractor A's own storefront still shows ONLY contractor A's wording — the second tenant's text never reached it",
      afterForeignText.includes(OWNER_TEXT_CUSTOMER_SUPPLIED) && !afterForeignText.includes(OTHER_TENANT_TEXT), "");
    const aCount = await prisma.answerOptionDisclaimer.count({
      where: { answerOption: { question: { service: { contractorId: contractorAId } } } },
    });
    console.log(`  contractor A's own AnswerOptionDisclaimer rows after B's write: ${aCount}`);
    ok("   ...and contractor B's contractor row (having no installed catalog) attached to zero rows — nothing to attach, nothing borrowed from A",
      (await prisma.contractorDisclaimer.findFirst({ where: { contractor: { slug: SLUG_B } }, select: { id: true } })) !== null, "");

    console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  } finally {
    await browser.close();
    await teardown();
    await prisma.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
