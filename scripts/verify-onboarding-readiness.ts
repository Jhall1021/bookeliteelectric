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
  ok(`   with no onboarding state to update`,
    !(await raw.$queryRawUnsafe<unknown[]>(
      `select 1 from information_schema.tables where table_name = 'contractor_onboarding'`
    )).length);

  // ── conditional rules ──────────────────────────────────────────────────
  await destroyContractor(raw, PROBE);
  const probe = await raw.contractor.create({
    data: { slug: PROBE, name: "Readiness probe", active: false, countryCode: "US" },
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

  // ── the honest gap ─────────────────────────────────────────────────────
  ok(`13. intent stays outcome-aware, not "has a price"`,
    f.intended.every((i) => i.reason !== "priced and approved, not yet live") ||
      f.intended.some((i) => i.reason.includes("quote")),
    f.intended.map((i) => i.reason).join("; ") || "none intended");

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
