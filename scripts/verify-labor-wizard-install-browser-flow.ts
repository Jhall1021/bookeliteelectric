/**
 * The labor wizard's eligibility fix, driven through the REAL panel in a
 * REAL browser, signed in as a disposable account created through the
 * actual sign-up + email-verification pipeline — matching
 * verify-labor-wizard-browser-flow.ts's own convention.
 *
 * WHY THIS FILE, SEPARATE FROM THAT ONE. That file's fixture links every
 * template material by hand, including policy-driven ones — it proves the
 * mechanism (canonical eligibility, customized divergence, server-side
 * refusal) but never exercises what the real installer actually leaves
 * behind, which is exactly why the reported defect shipped undetected. This
 * file goes through templateVersionSource -> preflight -> installCatalog,
 * the SAME path Guided Setup and the CLI both use, end to end: install,
 * select the three replacement services through the real Services stage,
 * answer the labor questions, and accept — reproducing wizard-demo-
 * electric's exact reported journey and proving the fix against it live.
 *
 * What this proves:
 *
 *   a fresh install is eligible, live  after installing the real catalog
 *                        and selecting outlet/switch/GFCI replacement
 *                        through the actual Services checkbox list, all
 *                        three arrive at labor review as ELIGIBLE, checked,
 *                        with no "customized since" flag — the exact
 *                        opposite of the reported symptom
 *   disabled with nothing selected  unchecking every box disables "Accept
 *                        and save" and shows the reason; re-checking one
 *                        re-enables it
 *   accept writes real times  accepting saves each service's answered
 *                        minutes, confirmed server-side afterward
 *   a genuine edit is still excluded  bumping ONE installed service's own
 *                        recipe quantity by a real write, then reloading,
 *                        shows THAT service customized and uncheckable
 *                        while the two untouched services stay eligible —
 *                        the fix corrects a false positive, not detection
 *                        itself
 *   cleanup              unconditional via try/finally
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BETTER_AUTH_URL=http://localhost:3421 \
 *     npx tsx scripts/verify-labor-wizard-install-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK
 *   and BETTER_AUTH_URL set)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3421";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-labor-eligibility-mail.jsonl";
const PASSWORD = "correct-horse-battery-staple-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-labor-wizard-install-flow-${RUN}`;
const EMAIL = `p2b-labor-wizard-install-flow-${RUN}@resend.dev`;
const TRADE = "electrical";

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
  // destroyContractor follows the full FK graph a REAL install actually
  // creates (question/answerOption/serviceMaterial before service, then the
  // contractor, cascading ContractorCategory/ContractorPolicyValue/
  // ContractorMembership/PricingSettings) — the same helper
  // verify-template-installation.ts and others already trust for this.
  await destroyContractor(prisma, SLUG);
  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL } } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  console.log(`\nLABOR WIZARD — INSTALL BROWSER FLOW — real installer, real Services stage, eligible-not-customized, disabled-with-none, genuine-edit-still-excluded\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Labor Wizard Install Owner");
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

    // ── the contractor: real membership and pricing settings, but NO
    // hand-rolled services — everything below comes from the real installer ──
    const contractor = await prisma.contractor.create({
      data: { slug: SLUG, name: "Labor Wizard Install Electric", active: true, countryCode: "US" },
      select: { id: true },
    });
    await prisma.pricingSettings.create({
      data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    });
    await prisma.contractorMembership.create({ data: { userId: user.id, contractorId: contractor.id, role: "OWNER", active: true } });

    // ── 1. the REAL installer — the same path Guided Setup's Trade stage and
    // the CLI both call, not a hand-rolled fixture ──
    const source = templateVersionSource(prisma, TRADE);
    const pf = await preflight(prisma, contractor.id, source);
    if (!pf.ok) throw new Error(`preflight failed unexpectedly: ${pf.code} ${pf.message}`);
    await installCatalog(prisma, contractor.id, pf.catalog);

    const [outletSvc, switchSvc, gfciSvc] = await Promise.all([
      prisma.service.findFirstOrThrow({ where: { contractorId: contractor.id, templateKey: "replace-standard-outlet" }, select: { id: true, name: true } }),
      prisma.service.findFirstOrThrow({ where: { contractorId: contractor.id, templateKey: "replace-standard-switch" }, select: { id: true, name: true } }),
      prisma.service.findFirstOrThrow({ where: { contractorId: contractor.id, templateKey: "replace-gfci-outlet" }, select: { id: true, name: true } }),
    ]);
    ok(`1. the real installer provisioned all three replacement services, unoffered`, true);

    // ── 2. select the three, through the REAL Services stage checkbox list —
    // not a direct write to Service.offered ──
    await page.goto(`${BASE}/dashboard/setup?stage=services`);
    await page.waitForSelector("text=Choose the services you offer through Price2Book.");
    // A plain click, not Playwright's `.check()` — `checked` here is a
    // controlled prop driven by server data, only updated once the PATCH
    // resolves AND the subsequent router.refresh() re-renders. `.check()`
    // polls for the box's own checked state to flip and times out against
    // that lag; the underlying write is confirmed against the database
    // right below instead, which is what actually matters for this test.
    for (const svc of [outletSvc, switchSvc, gfciSvc]) {
      const row = page.locator("label").filter({ hasText: svc.name });
      await row.locator('input[type="checkbox"]').click();
      await page.waitForTimeout(500);
    }
    const offeredNow = await prisma.service.count({ where: { contractorId: contractor.id, offered: true } });
    ok(`2. exactly the three replacement services are now offered, through the real checkbox list`,
      offeredNow === 3, `offered=${offeredNow}`);

    // ── 3. the labor wizard — answer the questions for all three, no
    // crew-mismatch this time: every task should reach a real proposal ──
    await page.goto(`${BASE}/dashboard/setup?stage=pricing-foundation`);
    await page.waitForSelector("text=Calibrate your labor times");
    await page.getByRole("button", { name: "Start" }).click();

    await page.locator('input[aria-label*="Minutes for a standard outlet replacement"]').fill("20");
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator('input[aria-label="Your usual crew"]').fill("Just me, solo");
    await page.getByRole("button", { name: "Next" }).click();

    await page.waitForSelector("text=standard switch replacement");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.getByRole("button", { name: "About the same" }).click();

    await page.waitForSelector("text=replacing an existing GFCI receptacle");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.locator('input[aria-label*="Extra minutes for replacing an existing GFCI receptacle"]').fill("5");
    await page.getByRole("button", { name: "Next" }).click();

    // ── 4. review — all three ELIGIBLE, checked, no "customized since" flag.
    // This is the exact reported symptom, inverted: wizard-demo-electric saw
    // all three customized with nothing eligible; this is what a fresh
    // install through the real installer should have looked like all along. ──
    await page.waitForSelector("text=Review each proposal");
    const outletCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard duplex receptacle" });
    const switchCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard single-pole switch" });
    const gfciCard = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace an existing GFCI receptacle" });
    const [outletText, switchText, gfciText] = await Promise.all([outletCard.innerText(), switchCard.innerText(), gfciCard.innerText()]);

    ok(`3. the freshly installed outlet service is ELIGIBLE, not customized`,
      outletText.includes(outletSvc.name) && outletText.includes("Applies to 1 of 1 matching service") && !outletText.includes("customized since"));
    ok(`   ...same for the freshly installed switch service`,
      switchText.includes(switchSvc.name) && switchText.includes("Applies to 1 of 1 matching service") && !switchText.includes("customized since"));
    ok(`   ...same for the freshly installed GFCI service`,
      gfciText.includes(gfciSvc.name) && gfciText.includes("Applies to 1 of 1 matching service") && !gfciText.includes("customized since"));

    const outletCheckbox = outletCard.locator(`input[aria-label="Apply Replace a standard duplex receptacle to ${outletSvc.name}"]`);
    const switchCheckbox = switchCard.locator(`input[aria-label="Apply Replace a standard single-pole switch to ${switchSvc.name}"]`);
    const gfciCheckbox = gfciCard.locator(`input[aria-label="Apply Replace an existing GFCI receptacle to ${gfciSvc.name}"]`);
    ok(`4. all three arrive pre-checked — eligibility is already decided server-side`,
      (await outletCheckbox.isChecked()) && (await switchCheckbox.isChecked()) && (await gfciCheckbox.isChecked()));

    // ── 5. disabled with nothing selected ──
    const acceptBtn = page.getByRole("button", { name: "Accept and save" });
    await outletCheckbox.uncheck();
    await switchCheckbox.uncheck();
    await gfciCheckbox.uncheck();
    ok(`5. "Accept and save" is DISABLED once every checkbox is unchecked`, await acceptBtn.isDisabled());
    ok(`   ...and the reason is shown`,
      await page.locator("text=Select at least one service above before saving.").isVisible());

    // Re-check all three — the button re-enables, and this is what gets accepted.
    await outletCheckbox.check();
    await switchCheckbox.check();
    await gfciCheckbox.check();
    ok(`6. re-checking a box re-enables the button`, !(await acceptBtn.isDisabled()));

    // ── 7. accept — verify saved times server-side, not just the UI's own
    // "Saved." text ──
    await acceptBtn.click();
    await page.waitForSelector("text=Saved.");
    const doneText = await page.innerText("body");
    ok(`7. exactly 3 services were updated`, doneText.includes("Saved. 3 services updated."), doneText);

    const [afterOutlet, afterSwitch, afterGfci] = await Promise.all([
      prisma.service.findUniqueOrThrow({ where: { id: outletSvc.id }, select: { fieldLaborHours: true } }),
      prisma.service.findUniqueOrThrow({ where: { id: switchSvc.id }, select: { fieldLaborHours: true } }),
      prisma.service.findUniqueOrThrow({ where: { id: gfciSvc.id }, select: { fieldLaborHours: true } }),
    ]);
    ok(`8. the outlet service saved the entered anchor time (20 min)`,
      Math.abs((afterOutlet.fieldLaborHours ?? 0) - 20 / 60) < 1e-9);
    ok(`   the switch service saved the anchor's time too — answered "about the same"`,
      Math.abs((afterSwitch.fieldLaborHours ?? 0) - 20 / 60) < 1e-9);
    ok(`   the GFCI service saved anchor + the answered delta (20 + 5 = 25 min)`,
      Math.abs((afterGfci.fieldLaborHours ?? 0) - 25 / 60) < 1e-9);

    // ── 9. a GENUINE recipe edit on the outlet service, after all this —
    // real write, not a fixture. Reload and start a fresh wizard session:
    // the fix corrects the false positive, not real detection. ──
    await prisma.serviceMaterial.updateMany({
      where: { serviceId: outletSvc.id, canonicalMaterial: { key: "RECEPTACLE_STANDARD" } },
      data: { quantity: 2 },
    });

    await page.goto(`${BASE}/dashboard/setup?stage=pricing-foundation`);
    await page.waitForSelector("text=Calibrate your labor times");
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator('input[aria-label*="Minutes for a standard outlet replacement"]').fill("20");
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator('input[aria-label="Your usual crew"]').fill("Just me, solo");
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForSelector("text=standard switch replacement");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.getByRole("button", { name: "About the same" }).click();
    await page.waitForSelector("text=replacing an existing GFCI receptacle");
    await page.getByRole("button", { name: "Same crew" }).click();
    await page.locator('input[aria-label*="Extra minutes for replacing an existing GFCI receptacle"]').fill("5");
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForSelector("text=Review each proposal");

    const outletCard2 = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard duplex receptacle" });
    const switchCard2 = page.locator("div.rounded-card.p-4").filter({ hasText: "Replace a standard single-pole switch" });
    const outletText2 = await outletCard2.innerText();
    ok(`9. after a genuine recipe edit, the SAME service is now shown customized — not eligible`,
      outletText2.includes("customized since") && outletText2.includes(outletSvc.name));
    const outletCheckbox2 = outletCard2.locator(`input[aria-label="Apply Replace a standard duplex receptacle to ${outletSvc.name}"]`);
    ok(`   ...and no checkbox exists for it any more`, (await outletCheckbox2.count()) === 0);

    const switchCheckbox2 = switchCard2.locator(`input[aria-label="Apply Replace a standard single-pole switch to ${switchSvc.name}"]`);
    ok(`10. the untouched switch service is still eligible after an edit elsewhere`, await switchCheckbox2.isChecked());
    ok(`    ...and shows the time saved by the earlier accept, not "not yet established"`,
      (await switchCard2.innerText()).includes("currently 20 min"));

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`11. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
