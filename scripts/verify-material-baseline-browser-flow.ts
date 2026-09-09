/**
 * Material Baseline Pricing, driven through the REAL panel in a REAL
 * browser, signed in as a disposable account created through the actual
 * sign-up + email-verification pipeline — not a hand-built session, and not
 * a hand-built API call. This is the one thing a script cannot fake — a real
 * account, a real click, a real reload.
 *
 * RUN AND PASSING (2026-09-08), against a real dev server, a real sign-up,
 * real email verification through PLATFORM_MAIL_SINK, and production —
 * every check below observed to pass, not just written.
 *
 * What this proves:
 *
 *   accept        checking a baseline and clicking "Accept N selected"
 *                 writes a real ContractorMaterial, through the real
 *                 PATCH /api/portal/material-baselines route
 *   override      "Enter your own cost instead" resolves a role with NO
 *                 baseline offered, at the exact figure typed
 *   unit          the manual-entry label reads the real canonical purchasing
 *                 unit ("per each", "per ft") even with no baseline to have
 *                 offered one — never the ambiguous generic "per unit"
 *   partial batch  a batch accept where ONE role's offered baseline evaporates
 *                 between page load and the click still resolves every OTHER
 *                 role normally, names the vanished one's failure for what
 *                 it is (not "already resolved"), and leaves that one role
 *                 visible rather than silently removing it
 *   skip          clicking "Skip for now" writes NOTHING — the role is back,
 *                 unresolved, offering the SAME baseline, after a real
 *                 full-page reload (not client state papering over it)
 *   preservation  a role resolved BEFORE this test ever touches the panel is
 *                 untouched by everything the panel does around it
 *   cleanup       unconditional via try/finally — every fixture is gone at
 *                 the end of this run, on any exit path. NOT separately
 *                 proven under a deliberately interposed mid-run fault; that
 *                 would need its own injected seam, which this script does
 *                 not have. Say so rather than implying it from the shape of
 *                 the finally block alone.
 *
 * FIXTURE ISOLATION. The partial-batch-failure check needs a role whose
 * offered baseline can vanish out from under it — that role is created and
 * destroyed by this run alone (createFakeRole), NEVER a real catalog role.
 * A synthetic "newer" baseline attached to a real role like
 * BREAKER_SINGLE_POLE, even for the instant between creating and deleting
 * it, is what latestBaselineVersionsFor would offer to every OTHER
 * contractor's live unresolved role of that kind — a real cross-tenant leak
 * of a fake price. The finally block deletes the fake role's baseline (a
 * safety net — the real assertion already deletes it mid-run) and the fake
 * role itself, in that order, on every exit path including a throw before
 * either delete would otherwise have run.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BETTER_AUTH_URL=http://localhost:3421 \
 *     npx tsx scripts/verify-material-baseline-browser-flow.ts
 *   (needs a dev server on the SAME port, with the SAME PLATFORM_MAIL_SINK
 *   and BETTER_AUTH_URL set)
 *
 * NOT PART OF `npm run verify`. Needs a running server — run it separately.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3421";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-baseline-flow-mail.jsonl";
const PASSWORD = "correct-horse-battery-staple-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-baseline-browser-flow-${RUN}`;
const EMAIL = `p2b-baseline-flow-${RUN}@resend.dev`;

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
    await prisma.contractorMembership.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
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

/** Every REAL canonical role this run touches, resolved once so both the fixture builder and the assertions agree on ids. */
async function roles() {
  const [wire, fan, gfci, smoke] = await Promise.all([
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true, name: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "BATH_FAN_STANDARD" }, select: { id: true, name: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_WEATHER_RESISTANT" }, select: { id: true, name: true } }),
    prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "SMOKE_CO_COMBO" }, select: { id: true, name: true } }),
  ]);
  return { wire, fan, gfci, smoke };
}

/** Display name for the run-owned fake role — asserted against verbatim below, kept in one place. */
const FAKE_ROLE_NAME = "Test-only fixture role";

/**
 * A canonical role this run creates and destroys itself, used ONLY for the
 * partial-batch-failure check below. NEVER a real catalog role like
 * BREAKER_SINGLE_POLE — a synthetic "newer" baseline attached to a real role,
 * even for the instant between creating and deleting it, is what
 * latestBaselineVersionsFor would offer to every OTHER contractor's live
 * unresolved role of that kind. A role this run owns outright carries none
 * of that risk.
 */
async function createFakeRole() {
  return prisma.canonicalMaterial.create({
    data: { key: `TEST_BASELINE_BROWSER_ROLE_${RUN}`, name: FAKE_ROLE_NAME, unit: "each" },
  });
}

/**
 * Everything the browser test needs: a real verified account, an OWNER
 * membership on a throwaway contractor, and five services in five different
 * starting states — one to accept, one to override, one to skip, one
 * (`fakeRoleId`, a run-owned role — see createFakeRole) whose OWN baseline
 * offer evaporates between page load and the accept click (to prove a
 * batch-accept problem stays visible rather than vanishing as "already
 * resolved"), and one ALREADY resolved before the browser ever loads the
 * page, to prove the other four never touch it.
 */
async function buildFixture(userId: string, fakeRoleId: string) {
  const { wire, fan, gfci, smoke } = await roles();
  const cat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const contractor = await prisma.contractor.create({
    // active: true — the CONTRACTOR must be active for its OWNER to reach
    // their own /dashboard at all (resolveAdminContractor filters
    // memberships to active contractors). Its SERVICES stay inactive below;
    // nothing here is launched or public.
    data: { slug: SLUG, name: "Baseline Browser Flow Electric", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: { contractorId: contractor.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
  });
  await prisma.contractorMembership.create({
    data: { userId, contractorId: contractor.id, role: "OWNER", active: true },
  });

  for (const [slug, roleId] of [["bf-wire-service", wire.id], ["bf-fan-service", fan.id], ["bf-gfci-service", gfci.id], ["bf-fake-service", fakeRoleId], ["bf-smoke-service", smoke.id]] as const) {
    const svc = await prisma.service.create({
      data: {
        contractorId: contractor.id, categoryId: cat.id, slug, name: slug,
        bookingType: "INSTANT", photoState: "NONE", offered: true, active: false,
        materials: { create: [{ canonicalMaterialId: roleId, quantity: 5, order: 0 }] },
      },
      select: { id: true },
    });
    if (slug !== "bf-smoke-service") {
      // Discover the role as unresolved the same way production does — a
      // fresh Service defaults to materialCostResolved: true (so an existing
      // catalog is unaffected), so nothing shows as needing a cost until
      // this recompute actually looks at what the recipe requires.
      await recomputeServiceMaterialCost(prisma, svc.id);
    }
    if (slug === "bf-smoke-service") {
      // PRE-RESOLVED, before the browser ever opens the page — the fixture
      // this whole test is checking nothing else disturbs.
      const cm = await prisma.contractorMaterial.create({
        data: {
          contractorId: contractor.id, canonicalMaterialId: smoke.id,
          unitCostCents: 5000, costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
        },
      });
      await prisma.service.update({ where: { id: svc.id }, data: { materialCostResolved: true, materialCostCents: 25000 } });
      return { contractorId: contractor.id, preResolvedContractorMaterialId: cm.id };
    }
  }
  throw new Error("unreachable — bf-smoke-service always runs last and returns");
}

async function main() {
  console.log(`\nMATERIAL BASELINE PRICING — BROWSER FLOW — accept, override, skip and preservation, through the real panel\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  let fakeRoleId: string | null = null;
  let tempFakeBaselineId: string | null = null;
  try {
    await teardown();

    // ── 0. a real account, created and verified through the real pipeline ──
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Baseline Flow Owner");
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

    // A run-owned role, never a real catalog one — see createFakeRole.
    const fakeRole = await createFakeRole();
    fakeRoleId = fakeRole.id;

    // ── the fixture: attach OWNER membership + five services in five states ─
    const { contractorId, preResolvedContractorMaterialId } = await buildFixture(user.id, fakeRoleId);
    const preResolvedBefore = await prisma.contractorMaterial.findUniqueOrThrow({
      where: { id: preResolvedContractorMaterialId }, select: { unitCostCents: true, costSource: true, updatedAt: true },
    });

    // A throwaway, NEWER baseline for the run-owned fake role — offered to
    // the panel, then deleted out from under the batch between page load
    // and the accept click. Attached to a role nobody else can ever query,
    // never to a real catalog role.
    const tempFakeBaseline = await prisma.materialBaselineVersion.create({
      data: {
        canonicalMaterialId: fakeRoleId, unitCostCents: 999, unit: "each",
        sourceLabel: "verifier — throwaway, deleted before use", specNote: "test fixture only",
        sourcedAt: new Date(),
      },
    });
    tempFakeBaselineId = tempFakeBaseline.id;

    // ── 1. the panel, loaded as this real, signed-in OWNER ──────────────────
    await page.goto(`${BASE}/dashboard/setup?stage=pricing-foundation`);
    await page.waitForSelector("text=Starting costs for your materials");
    const rowsText = await page.innerText("body");
    ok(`1. the four unresolved roles are all shown`,
      !!rowsText?.includes("12/2 NM-B") && !!rowsText?.includes("Bathroom exhaust fan") &&
      !!rowsText?.includes("Weather-resistant GFCI") && !!rowsText?.includes(FAKE_ROLE_NAME));
    ok(`   the ALREADY-resolved role is not shown at all — nothing to review`,
      !rowsText?.includes("Smoke/CO combination detector"));

    // ── 2. accept — WIRE_12_2 and the run-owned fake role both checked by
    // default (both offer a baseline). GFCI is unchecked so it takes the
    // SKIP path instead. Right before the click, the fake role's OWN
    // offered baseline evaporates — proving a batch-accept problem for ONE
    // row never hides behind, or gets mislabeled as, another row's genuine
    // success. ───────────────────────────────────────────────────────────
    await page.locator('input[aria-label*="Weather-resistant GFCI"]').uncheck();
    await prisma.materialBaselineVersion.delete({ where: { id: tempFakeBaselineId } });
    const acceptButton = page.getByRole("button", { name: /Accept \d+ selected/ });
    await acceptButton.click();
    await page.waitForSelector("text=reference cost no longer exists");
    const afterAcceptBody = await page.innerText("body");
    ok(`2. accepting writes a real cost for the role that still had one`, afterAcceptBody.includes("Accepted 1 of 2"));
    ok(`   the OTHER role's vanished reference is named for what it is, not folded into "already resolved"`,
      afterAcceptBody.includes("reference cost no longer exists") && !afterAcceptBody.includes("already resolved by someone else"));
    ok(`   the failed row STAYS VISIBLE — a batch-accept problem is not silently discarded`,
      afterAcceptBody.includes(FAKE_ROLE_NAME));

    // ── 3. override — BATH_FAN_STANDARD, which has no baseline at all ──────
    // Scoped to FAN's OWN row, not `.first()` — the fake role's row is still
    // visible after its failed accept above, and both rows show this same
    // button, so position alone is no longer reliable.
    const fanRow = page.locator("div.rounded-card.p-4").filter({ hasText: "Bathroom exhaust fan" });
    await fanRow.getByRole("button", { name: "Enter your own cost instead" }).click();
    // The CANONICAL unit ("each"), shown even though this role has no
    // baseline offering one — never the old generic "per unit" fallback,
    // which is genuinely ambiguous for a measured material like wire.
    const overrideSectionText = await page.innerText("body");
    ok(`3. the manual-entry unit is the real canonical unit, not the ambiguous "per unit" fallback`,
      overrideSectionText.includes("per each") && !overrideSectionText.includes("per unit"));
    await page.locator('input[aria-label*="Bathroom exhaust fan"]').fill("42.00");
    await fanRow.getByRole("button", { name: "Save this cost instead" }).click();
    await page.waitForSelector("text=Saved your own cost");
    ok(`   overriding a no-baseline role writes the typed figure`, true);

    // ── 4. skip — GFCI, left unchecked above, never touched otherwise ──────
    // Scoped to GFCI's OWN row for the same reason as FAN's above — the
    // fake role's row, still visible after its failed accept, has its own
    // "Skip for now" button too.
    const gfciRow = page.locator("div.rounded-card.p-4").filter({ hasText: "Weather-resistant GFCI" });
    await gfciRow.getByRole("button", { name: "Skip for now" }).click();
    // Playwright's own auto-waiting, not a manual race against React's
    // render — the assertion is that this element BECOMES hidden, not that
    // it already is by the time the click handler returns.
    await page.locator("text=Weather-resistant GFCI receptacle").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    const afterSkipBody = await page.innerText("body");
    if (afterSkipBody?.includes("Weather-resistant GFCI") || afterSkipBody?.includes("GFCI_WEATHER_RESISTANT")) {
      const idx = afterSkipBody.search(/Weather-resistant GFCI|GFCI_WEATHER_RESISTANT/);
      console.log("DEBUG:", afterSkipBody.slice(Math.max(0, idx - 300), idx + 300));
    }
    ok(`4. skipping removes it from THIS view immediately (client-side only)`,
      !afterSkipBody?.includes("Weather-resistant GFCI") && !afterSkipBody?.includes("GFCI_WEATHER_RESISTANT"));

    // ── 5. reload — the real test. Client state cannot fake this. ──────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    const afterReload = await page.innerText("body");
    ok(`5. after a REAL reload: the accepted role is gone (resolved for real)`, !afterReload?.includes("12/2 NM-B"));
    ok(`   the overridden role is gone (resolved for real)`, !afterReload?.includes("Bathroom exhaust fan"));
    ok(`   the SKIPPED role is BACK — skip wrote nothing, it is still unresolved`, !!afterReload?.includes("Weather-resistant GFCI"));
    ok(`   ...still offering a baseline — nothing about the offer was consumed by being shown`,
      !!afterReload?.match(/Weather-resistant GFCI[\s\S]{0,300}Southwire|Leviton/) || !!afterReload?.includes("Leviton GFWT1"));

    // ── 6. server-side truth, not just what the DOM says ────────────────────
    const wireId = (await roles()).wire.id;
    const fanId = (await roles()).fan.id;
    const gfciId = (await roles()).gfci.id;
    const wireMaterial = await prisma.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId, canonicalMaterialId: wireId } },
      select: { costSource: true, acceptedBaselineVersionId: true },
    });
    ok(`6. WIRE_12_2 really is BASELINE-sourced in the database`, wireMaterial?.costSource === "BASELINE" && !!wireMaterial.acceptedBaselineVersionId);
    const fanMaterial = await prisma.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId, canonicalMaterialId: fanId } },
      select: { costSource: true, unitCostCents: true },
    });
    ok(`   BATH_FAN_STANDARD really is CUSTOM at exactly the typed figure`, fanMaterial?.costSource === "CUSTOM" && fanMaterial.unitCostCents === 4200);
    const gfciMaterial = await prisma.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId, canonicalMaterialId: gfciId } },
    });
    ok(`   GFCI_WEATHER_RESISTANT genuinely has NO ContractorMaterial row — skip wrote nothing at all`, gfciMaterial === null);
    const fakeRoleMaterial = await prisma.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId, canonicalMaterialId: fakeRoleId! } },
    });
    ok(`   the fake role genuinely has NO ContractorMaterial row either — its failed accept wrote nothing`, fakeRoleMaterial === null);

    // ── 7. preservation — the pre-existing cost, through all of the above ───
    const preResolvedAfter = await prisma.contractorMaterial.findUniqueOrThrow({
      where: { id: preResolvedContractorMaterialId }, select: { unitCostCents: true, costSource: true, updatedAt: true },
    });
    ok(`7. the cost that was already resolved before the panel ever loaded is byte-for-byte unchanged`,
      preResolvedAfter.unitCostCents === preResolvedBefore.unitCostCents &&
      preResolvedAfter.costSource === preResolvedBefore.costSource &&
      preResolvedAfter.updatedAt.getTime() === preResolvedBefore.updatedAt.getTime());

    await ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    // Safety net only — the real assertion deletes this mid-run. Catches the
    // case where an earlier step threw before that delete ever ran, so a
    // failure never leaves the fake baseline attached to anything.
    if (tempFakeBaselineId) {
      await prisma.materialBaselineVersion.delete({ where: { id: tempFakeBaselineId } }).catch(() => {});
    }
    await teardown();
    // The run-owned fake role itself, deleted only now that teardown() has
    // removed every Service and ContractorMaterial that could still
    // reference it (ContractorMaterial -> CanonicalMaterial is Restrict).
    // Any leftover MaterialBaselineVersion for it is swept first in case an
    // earlier throw skipped the explicit delete above.
    if (fakeRoleId) {
      await prisma.materialBaselineVersion.deleteMany({ where: { canonicalMaterialId: fakeRoleId } }).catch(() => {});
      await prisma.canonicalMaterial.delete({ where: { id: fakeRoleId } }).catch(() => {});
    }
    const residue = await prisma.contractor.count({ where: { slug: SLUG } });
    ok(`8. every fixture is gone at the end`, residue === 0);
    const roleResidue = fakeRoleId ? await prisma.canonicalMaterial.count({ where: { id: fakeRoleId } }) : 0;
    ok(`   ...and the run-owned fake role is gone too — never left attached to the real catalog`, roleResidue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
