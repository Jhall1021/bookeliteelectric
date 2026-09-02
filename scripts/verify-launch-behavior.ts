/**
 * Launch, exercised rather than asserted.
 *
 *   npx tsx scripts/verify-launch-behavior.ts
 *
 * These are the three things Contractor #2 will actually do, run against a
 * contractor built the way they will be built: enrolled, catalog installed
 * from the canonical template, nothing priced. Source assertions prove the
 * code SAYS the right thing; these prove it DOES it.
 *
 * Every activation below goes through `activateService` — the same function
 * the admin route calls. There is no bulk path and no second authority, so a
 * contractor putting seven services live gets seven independent decisions.
 */

import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { activationRefusal, activateService } from "../lib/serviceActivation";
import { assessOnboarding } from "../lib/onboardingReadiness";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
/**
 * RUN-UNIQUE, because the worktree and the database are shared.
 *
 * A fixed slug races whenever two runs overlap — a Vercel build (npm run
 * verify runs inside next build) and a local run, or two workstreams. The
 * second starter's teardown deletes the first's fixture mid-assertion.
 *
 * Same shape as verify-activation-dependencies and
 * verify-template-installation, deliberately — copied, not reinvented.
 * The prefix stays fixed so a fixture from a crashed run is still sweepable.
 */
const PREFIX = "test-launch-behavior";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const inTenant = <T>(id: string, fn: () => Promise<T>) =>
  withTenant({ contractorId: id, source: "test" }, fn);

/**
 * Only what is genuinely abandoned.
 *
 * Sweeping every sibling would delete a CONCURRENT run's live fixture
 * mid-assertion — the exact collision the unique slug exists to prevent,
 * reintroduced by the cleanup. Age separates "crashed" from "running".
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorTrade.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: {
      slug: { startsWith: PREFIX },
      NOT: { slug: SLUG },
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function teardown() {
  await removeContractor(SLUG);
}

async function main() {
  console.log(`\nLAUNCH — the three things a new contractor actually does\n`);
  await teardown();
  await sweepStale();

  // ── a contractor built the way Contractor #2 will be ──────────────────
  const c = await raw.contractor.create({
    data: {
      slug: SLUG, name: "Launch behavior probe", active: false,
      countryCode: "US", schedulingAuthority: "NATIVE",
    },
    select: { id: true },
  });
  await raw.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  const pre = await preflight(raw, c.id, templateVersionSource(raw, "electrical"));
  if (!pre.ok) throw new Error(pre.code);
  await installCatalog(raw, c.id, pre.catalog);
  console.log(`  installed ${pre.preview.services} services, nothing priced\n`);

  // ── 1. activation refusal ─────────────────────────────────────────────
  //
  // A service whose tree can quote a homeowner a fixed price, with no approved
  // price behind it. Its material costs are made resolvable first, so the only
  // thing standing in the way is the missing approval — otherwise the
  // materials guard would fire and prove nothing about §1.4.
  const promising = await raw.service.findFirstOrThrow({
    where: { contractorId: c.id, bookingType: { not: "REMOTE_QUOTE" } },
    select: { id: true, slug: true },
  });
  await raw.service.update({
    where: { id: promising.id },
    data: { materialCostResolved: true, unresolvedMaterialKeys: [], offered: true },
  });

  const refusal = await inTenant(c.id, () => activationRefusal(guarded, c.id, promising.id));
  ok(`1. a fixed-price promise with no approved price is refused`,
    refusal?.code === "PRICE_NOT_APPROVED", refusal?.code ?? "allowed");

  const attempt = await inTenant(c.id, () => activateService(guarded, c.id, promising.id));
  const afterRefusal = await raw.service.findUniqueOrThrow({
    where: { id: promising.id }, select: { active: true },
  });
  ok(`   and the refusal leaves it inactive`,
    attempt.ok === false && afterRefusal.active === false);

  const stillUnpriced = await raw.service.findUniqueOrThrow({
    where: { id: promising.id },
    select: { basePrice: true, publishedPriceApprovedAt: true },
  });
  ok(`   without inventing a price to get past itself`,
    stillUnpriced.basePrice === null && stillUnpriced.publishedPriceApprovedAt === null);

  // ── 2. readiness recomputes from what was persisted ───────────────────
  //
  // A quote-only service owes no price, so it can go live on its own merits —
  // which makes it the honest way to prove activation moves readiness.
  const quoteOnly = await raw.service.findFirst({
    where: { contractorId: c.id, bookingType: "REMOTE_QUOTE" },
    select: { id: true, slug: true },
  });
  if (!quoteOnly) {
    console.log(`  (no REMOTE_QUOTE service in the catalog to launch)`);
  } else {
    // Every blocker that is NOT about price is cleared first, because the
    // claim under test is only that a quote-only service needs no price. The
    // material keys were always cleared here; the policy keys joined them
    // when activation started refusing undecided policies, and leaving them
    // would make this assert "nothing else is wrong either" — which is a
    // different, and much more brittle, claim.
    await raw.service.update({
      where: { id: quoteOnly.id },
      data: {
        offered: true, materialCostResolved: true,
        unresolvedMaterialKeys: [], unresolvedPolicyKeys: [],
      },
    });

    const before = await inTenant(c.id, () => assessOnboarding(guarded, c.id));
    const beforeLive = await raw.service.count({ where: { contractorId: c.id, active: true } });

    const live = await inTenant(c.id, () => activateService(guarded, c.id, quoteOnly.id));
    ok(`2. a quote-only service goes live without a manufactured price`, live.ok,
      live.ok ? "" : live.refusal.code);

    const persisted = await raw.service.findUniqueOrThrow({
      where: { id: quoteOnly.id },
      select: { active: true, basePrice: true, publishedPriceApprovedAt: true },
    });
    ok(`   and the activation is actually persisted`, persisted.active === true);
    ok(`   with no price written or approved by launching`,
      persisted.basePrice === null && persisted.publishedPriceApprovedAt === null);

    const after = await inTenant(c.id, () => assessOnboarding(guarded, c.id));
    const afterLive = await raw.service.count({ where: { contractorId: c.id, active: true } });
    ok(`   readiness reflects the persisted state, not a cached one`,
      afterLive === beforeLive + 1 &&
        after.intended.some((i) => i.slug === quoteOnly.slug && i.reason === "offered and live"),
      `${beforeLive} -> ${afterLive}`);
    ok(`   and nothing was stored to make that true`,
      (await raw.contractorOnboarding.count({ where: { contractorId: c.id } })) === 0,
      "readiness is derived; no onboarding row exists");

    // Launching one service must not drag others live with it.
    const others = await raw.service.count({
      where: { contractorId: c.id, active: true, id: { not: quoteOnly.id } },
    });
    ok(`   and only the chosen service went live`, others === 0, `${others} others active`);

    void before;
  }

  // ── 3. the storefront shows only what is live ─────────────────────────
  //
  // Queried exactly as the storefront catalog queries it — `active: true` —
  // rather than through a preview helper that could drift from the page.
  const storefront = await raw.service.findMany({
    where: { contractorId: c.id, active: true },
    select: { slug: true, basePrice: true, publishedPriceApprovedAt: true },
  });
  const offeredNotLive = await raw.service.count({
    where: { contractorId: c.id, offered: true, active: false },
  });

  console.log(`\n  storefront would show ${storefront.length} service(s); ` +
    `${offeredNotLive} offered but not live\n`);

  ok(`3. the storefront shows only services that are actually live`,
    storefront.every((s) => s.slug !== promising.slug));
  ok(`   an offered-but-unready service cannot leak through`, offeredNotLive > 0);
  ok(`   and nothing on the storefront shows an unapproved price`,
    storefront.every((s) => s.basePrice === null || s.publishedPriceApprovedAt !== null));

  await teardown();
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Refused, recomputed, and only what was chosen is visible.\n`);
  await raw.$disconnect();
  await (guarded as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
