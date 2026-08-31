/**
 * Does the readiness engine tell a live contractor from an unfinished one?
 *
 *   npx tsx scripts/verify-onboarding-readiness.ts
 *
 * Guided Setup orchestrates systems that already exist. The one way it can do
 * real harm is by disagreeing with them — telling a contractor they are ready
 * when §1.4, `connectReadiness` or the scheduling rules would refuse a real
 * homeowner. So the engine is checked against two contractors that genuinely
 * disagree:
 *
 *   Elite            fully configured and live. Must be launchable.
 *   fresh provision  the template installed and nothing else. Must be blocked,
 *                    on exactly the things provisioning deliberately leaves
 *                    unresolved — it refuses to write a single economic value.
 *
 * An engine that cannot separate those two is wrong, whatever its rules say.
 */

import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { assessOnboarding, type OnboardingReadiness } from "../lib/onboardingReadiness";
import { readFileSync } from "node:fs";
import { provision, destroyContractor } from "./_throwaway";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
const FRESH = "test-onboarding-fresh";
const PROBE = "test-onboarding-probe";

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const codes = (r: OnboardingReadiness, s: "blocker" | "warning") =>
  (s === "blocker" ? r.blockers : r.warnings).map((f) => f.code);
const assess = (id: string) =>
  withTenant({ contractorId: id, source: "test" }, () => assessOnboarding(guarded, id));

async function main() {
  console.log(`\nGUIDED SETUP — READINESS ENGINE\n`);

  // ── fixture 1: Elite, live ─────────────────────────────────────────────
  const elite = await raw.contractor.findFirstOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const e = await assess(elite.id);
  console.log(`  ELITE   canLaunch=${e.canLaunch}  blockers=${e.blockers.length}  warnings=${e.warnings.length}  intended=${e.intended.length}`);
  ok(`1. a fully configured contractor can launch`, e.canLaunch, codes(e, "blocker").join(", "));
  ok(`   with no blockers at all`, e.blockers.length === 0);
  ok(`2. and warnings do not stop them`, e.warnings.length > 0 && e.canLaunch,
    `${e.warnings.length} warning(s)`);
  ok(`3. its live services are the intended set`, e.intended.length > 0);

  // ── fixture 2: freshly provisioned, nothing decided ────────────────────
  await destroyContractor(raw, FRESH);
  await raw.contractor.create({ data: { slug: FRESH, name: "Fresh electrical", active: false } });
  provision(FRESH);
  const fresh = await raw.contractor.findFirstOrThrow({ where: { slug: FRESH }, select: { id: true } });
  const f = await assess(fresh.id);
  console.log(`\n  FRESH   canLaunch=${f.canLaunch}  blockers=${f.blockers.length}  warnings=${f.warnings.length}  intended=${f.intended.length}`);
  for (const x of f.blockers) console.log(`            ${x.code}${x.serviceSlug ? ` (${x.serviceSlug})` : ""}`);

  ok(`4. a freshly provisioned contractor cannot launch`, !f.canLaunch);
  ok(`   and it has services to work with`,
    (await raw.service.count({ where: { contractorId: fresh.id } })) > 0);
  // provision-from-template refuses to write any economic value, so the price
  // foundation is exactly what it leaves behind.
  ok(`5. blocked on the economics provisioning deliberately did not write`,
    codes(f, "blocker").includes("PRICING_SETTINGS_MISSING"),
    codes(f, "blocker").join(", "));
  ok(`6. and on having nothing it could actually sell`,
    codes(f, "blocker").includes("NOTHING_ACTIVATABLE"));
  ok(`   because every provisioned service starts UNSELECTED`,
    (await raw.service.count({ where: { contractorId: fresh.id, offered: true } })) === 0,
    `${await raw.service.count({ where: { contractorId: fresh.id, offered: true } })} offered`);
  ok(`7. the two fixtures disagree, which is the point`,
    e.canLaunch && !f.canLaunch);

  // ── derived, not stored ────────────────────────────────────────────────
  //
  // No onboarding row exists for either contractor. Changing a domain fact
  // must move readiness on the next call, with nothing to invalidate.
  const before = codes(await assess(fresh.id), "blocker").includes("COUNTRY_MISSING");
  await raw.contractor.update({ where: { id: fresh.id }, data: { countryCode: "US" } });
  const after = codes(await assess(fresh.id), "blocker").includes("COUNTRY_MISSING");
  ok(`8. changing a domain fact changes readiness immediately`, before && !after,
    `before=${before} after=${after}`);
  ok(`   with no onboarding row involved at all`,
    (await raw.contractorOnboarding.count({ where: { contractorId: fresh.id } })) === 0);

  // ── conditional rules ──────────────────────────────────────────────────
  await destroyContractor(raw, PROBE);
  const probe = await raw.contractor.create({
    data: {
      slug: PROBE, name: "Readiness probe", active: false, countryCode: "US",
      // Declared, so the crew rules below are exercised deliberately.
      schedulingAuthority: "NATIVE",
    },
    select: { id: true },
  });
  try {
    const cat = await raw.service.findFirstOrThrow({ select: { categoryId: true } });
    // Priced and approved, no tree: promises a price on the first tap, so it
    // is unambiguously intended.
    const svc = await raw.service.create({
      data: {
        slug: `${PROBE}-svc`, name: "Probe service", contractorId: probe.id,
        categoryId: cat.categoryId, bookingType: "ADJUSTED", active: false,
        basePrice: 50000, publishedPriceApprovedAt: new Date(),
        // Intent is a decision now, not an inference from having a price.
        offered: true,
      },
      select: { id: true },
    });

    const noDeposit = await assess(probe.id);
    ok(`9. Stripe does NOT block a contractor who takes no deposits`,
      !codes(noDeposit, "blocker").some((c) => c.startsWith("STRIPE_")),
      codes(noDeposit, "blocker").join(", "));

    await raw.service.update({ where: { id: svc.id }, data: { depositCents: 24900 } });
    const withDeposit = await assess(probe.id);
    ok(`10.  and DOES once a service actually asks for one`,
      codes(withDeposit, "blocker").includes("STRIPE_NOT_CONNECTED"));

    // Zero crew: legitimate standalone, a configuration failure with Jobber.
    const standalone = await assess(probe.id);
    ok(`11. zero crew is fine when Price2Book schedules`,
      !codes(standalone, "blocker").includes("NO_ELIGIBLE_CREW"));

    await raw.contractor.update({ where: { id: probe.id }, data: { schedulingAuthority: "EXTERNAL" } });
    await raw.jobberConnection.create({
      data: {
        contractorId: probe.id, accessToken: "probe", refreshToken: "probe",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const external = await assess(probe.id);
    ok(`12.  and blocks once Jobber is the authority`,
      codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));
  } finally {
    await raw.jobberConnection.deleteMany({ where: { contractorId: probe.id } });
    await destroyContractor(raw, PROBE);
  }

  // ── selection is a decision, and only a decision ───────────────────────
  const fixed = await raw.service.findFirstOrThrow({
    where: { contractorId: fresh.id, bookingType: { not: "REMOTE_QUOTE" } },
    select: { id: true, slug: true },
  });
  const quoteOnly = await raw.service.findFirst({
    where: { contractorId: fresh.id, bookingType: "REMOTE_QUOTE" },
    select: { id: true, slug: true },
  });

  await raw.service.update({ where: { id: fixed.id }, data: { offered: true } });
  const afterSelect = await raw.service.findUniqueOrThrow({
    where: { id: fixed.id },
    select: { active: true, basePrice: true, publishedPriceApprovedAt: true },
  });
  ok(`13. selecting a service does not publish a price`,
    afterSelect.basePrice === null && afterSelect.publishedPriceApprovedAt === null);
  ok(`14.  and does not put it on the storefront`, afterSelect.active === false);

  const withFixed = await assess(fresh.id);
  ok(`15. selecting a fixed-price service surfaces its real requirements`,
    withFixed.intended.some((i) => i.slug === fixed.slug) &&
      withFixed.blockers.some((x) => x.serviceSlug === fixed.slug),
    withFixed.blockers.filter((x) => x.serviceSlug === fixed.slug).map((x) => x.code).join(", "));

  if (quoteOnly) {
    await raw.service.update({ where: { id: fixed.id }, data: { offered: false } });
    await raw.service.update({ where: { id: quoteOnly.id }, data: { offered: true } });
    const withQuote = await assess(fresh.id);
    ok(`16. a quote-only service is included WITHOUT a manufactured price`,
      withQuote.intended.some((i) => i.slug === quoteOnly.slug) &&
        !withQuote.blockers.some((x) => x.serviceSlug === quoteOnly.slug && x.code === "PRICE_NOT_APPROVED"),
      withQuote.blockers.filter((x) => x.serviceSlug === quoteOnly.slug).map((x) => x.code).join(", "));
    await raw.service.update({ where: { id: quoteOnly.id }, data: { offered: false } });
  } else {
    console.log(`  (no REMOTE_QUOTE service in the template to probe with)`);
  }

  await raw.service.update({ where: { id: fixed.id }, data: { offered: true } });
  const selected = await assess(fresh.id);
  await raw.service.update({ where: { id: fixed.id }, data: { offered: false } });
  const deselected = await assess(fresh.id);
  ok(`17. deselecting removes that service's requirements`,
    selected.blockers.some((x) => x.serviceSlug === fixed.slug) &&
      !deselected.blockers.some((x) => x.serviceSlug === fixed.slug));

  // ── scheduling authority is declared, and changes the rules ────────────
  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: null } });
  const undeclared = await assess(fresh.id);
  ok(`18. an undeclared calendar owner is a blocker, not a default`,
    codes(undeclared, "blocker").includes("SCHEDULING_AUTHORITY_UNDECLARED"));

  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: "NATIVE" } });
  const native = await assess(fresh.id);
  ok(`19. native scheduling with no crew is legitimate`,
    !codes(native, "blocker").includes("NO_ELIGIBLE_CREW") &&
      !codes(native, "blocker").includes("SCHEDULING_AUTHORITY_UNDECLARED"));

  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: "EXTERNAL" } });
  const external = await assess(fresh.id);
  ok(`20. switching to an external calendar blocks on zero bookable crew`,
    codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));
  ok(`    and on there being no calendar connected`,
    codes(external, "blocker").includes("PROVIDER_NOT_CONNECTED"));
  ok(`21. the switch took effect with nothing to invalidate`,
    !codes(native, "blocker").includes("NO_ELIGIBLE_CREW") &&
      codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));

  // ── onboarding state survives, and holds nothing derived ──────────────
  await raw.contractorOnboarding.create({
    data: { contractorId: fresh.id, currentStage: "scheduling", acknowledged: { services: "2026-08-31T00:00:00.000Z" } },
  });
  const resumed = await raw.contractorOnboarding.findUniqueOrThrow({ where: { contractorId: fresh.id } });
  ok(`22. onboarding can be left and resumed with choices intact`,
    resumed.currentStage === "scheduling" &&
      (resumed.acknowledged as Record<string, string>).services !== undefined &&
      (await raw.contractor.findUniqueOrThrow({ where: { id: fresh.id }, select: { schedulingAuthority: true } }))
        .schedulingAuthority === "EXTERNAL");
  const cols = await raw.$queryRawUnsafe<{ column_name: string }[]>(
    `select column_name from information_schema.columns where table_name = 'contractor_onboarding'`
  );
  ok(`23. and stores no readiness, blockers or launchability`,
    !cols.some((c) => /ready|blocker|warning|launch/i.test(c.column_name)),
    cols.map((c) => c.column_name).join(","));

  // ── no write path can approve or activate ─────────────────────────────
  const routes = ["selection", "scheduling-authority", "progress"].map((r) =>
    readFileSync(`app/api/admin/setup/${r}/route.ts`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  );
  ok(`24. no Guided Setup write path can stamp a price approval`,
    !routes.some((r) => /publishedPriceApprovedAt|basePrice/.test(r)));
  // The earlier form matched `select: { active: true }`, which reads rather
  // than writes — a check that would have failed for looking at the field.
  ok(`25.  or put a service on the storefront`,
    !routes.some((r) => /data:\s*\{[^}]*\bactive\b/.test(r)));

  await destroyContractor(raw, FRESH);
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Live and unfinished are told apart, by the systems that already know.\n`);
  await raw.$disconnect();
  await (guarded as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await destroyContractor(raw, FRESH).catch(() => {});
  await destroyContractor(raw, PROBE).catch(() => {});
  process.exit(1);
});
