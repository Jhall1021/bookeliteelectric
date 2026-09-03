/**
 * A service cannot go live leading a homeowner somewhere that isn't there.
 *
 *   npx tsx scripts/verify-activation-dependencies.ts
 *
 * THE DEFECT THIS CLOSES
 *
 * Several trees hand the homeowner off. "It stopped working" and "I'm not sure
 * what's wrong" route to the contractor's diagnostic; some answers reroute to a
 * different service entirely. Those destinations have to be live, and nothing
 * checked. BrightPath launched outlet replacement while its diagnostic was
 * still held back, so the two commonest answers anyone gives reached nothing —
 * and the only way to avoid it was to know that troubleshooting had to be
 * activated first, which is an ordering rule no contractor could be expected
 * to learn.
 *
 * Proved by DOING it, on a contractor built the way a new one is built:
 * enrolled, catalog installed from the canonical template, nothing priced.
 * Every activation goes through `activateService` — the same function the
 * admin route calls. There is no bulk path and no second authority.
 */

import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { activationRefusal, activateService } from "../lib/serviceActivation";
import { activationMaterialRoles } from "../lib/materialResolution";
import { catalogPromises, promiseFor } from "../lib/onboardingReadiness";
import { loadPricingSettings } from "../lib/routeResolver";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
/**
 * RUN-UNIQUE, because the worktree is shared.
 *
 * A fixed slug means two runs of this verifier — one per workstream, both
 * exercising the same shared foundation — race on the same throwaway
 * contractor: the second run's teardown deletes the first run's fixture
 * mid-assertion, and the failure reads as a product defect. That happened once
 * in this repo and passed on rerun, which is the worst version: a flake nobody
 * can reproduce and everybody learns to re-run past.
 *
 * The prefix stays fixed so stale fixtures from a crashed run are still
 * sweepable — the self-healing the fixed slug gave us is kept, without the
 * collision it cost.
 */
const PREFIX = "test-activation-dependencies";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const inTenant = <T>(id: string, fn: () => Promise<T>) =>
  withTenant({ contractorId: id, source: "test" }, fn);

/**
 * Fixtures left by a run that died before its own teardown.
 *
 * Sweeping siblings is what makes the unique slug safe — without it a crash
 * leaks a contractor nobody will ever name again — but it has to sweep only
 * what is genuinely abandoned. A first draft deleted every sibling, which
 * would take out a CONCURRENT run's live fixture mid-assertion: the exact
 * cross-workstream collision the unique slug exists to prevent, reintroduced
 * by the cleanup. Two parallel runs passed anyway, on timing.
 *
 * So: old enough that no run could still be using it. This verifier takes
 * about a minute; an hour is far past any plausible run and well short of
 * leaving rubbish around.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

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

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorTrade.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function teardown() {
  await removeContractor(SLUG);
}

/** Everything except the dependency, so only the dependency can refuse. */
async function clearUnrelatedBlockers(contractorId: string, serviceId: string, hours: number) {
  await raw.service.update({
    where: { id: serviceId },
    data: {
      offered: true, fieldLaborHours: hours,
      materialCostResolved: true, unresolvedMaterialKeys: [], unresolvedPolicyKeys: [],
    },
  });
  // Material readiness is DERIVED as of the B1 fix — from the roles a
  // reachable priceable path consumes, not the cached fields above. Clearing
  // the cache no longer clears it, so every reachable role is costed here.
  // Without this the dependency check never runs: the service refuses with
  // MATERIALS_UNRESOLVED first, truthfully, and this file is about a different
  // rule.
  for (const role of await activationMaterialRoles(raw as never, serviceId)) {
    await raw.contractorMaterial.upsert({
      where: { contractorId_canonicalMaterialId: { contractorId, canonicalMaterialId: role.canonicalMaterialId } },
      update: { unitCostCents: 1000 },
      create: { contractorId, canonicalMaterialId: role.canonicalMaterialId, unitCostCents: 1000 },
    });
  }
  const svc = await raw.service.findUniqueOrThrow({
    where: { id: serviceId }, select: { id: true, bookingType: true },
  });
  const settings = await loadPricingSettings(raw as never, contractorId);
  const promise = await promiseFor(raw as never, svc as never, settings);
  // Only a service that can reach a price owes one. A quote-only service is
  // left alone deliberately — see check 3.
  if (promise.promisesFixedPrice) {
    const { publishSuggestedPrice } = await import("../lib/pricePublication");
    await inTenant(contractorId, () => publishSuggestedPrice(guarded, contractorId, serviceId));
  }
}

async function main() {
  console.log(`\nACTIVATION DEPENDENCIES — where the answers lead\n`);
  await sweepStale();
  await teardown();

  const c = await raw.contractor.create({
    data: {
      slug: SLUG, name: "Activation dependency probe", active: false,
      countryCode: "US", schedulingAuthority: "NATIVE", nativeConcurrentJobs: 1,
    },
    select: { id: true },
  });
  await raw.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  const pre = await preflight(raw, c.id, templateVersionSource(raw, "electrical"));
  if (!pre.ok) throw new Error(pre.code);
  await installCatalog(raw, c.id, pre.catalog);
  await raw.pricingSettings.create({
    data: {
      contractorId: c.id, crewHourRateCents: 21500, primaryMinimumCents: 21500,
      roundingIncrementCents: 500, defaultPermitAdminCents: 0,
    },
  });
  console.log(`  installed ${pre.preview.services} services, nothing priced\n`);

  // ── the two ends of a real dependency ─────────────────────────────────
  const diagnostic = await raw.service.findFirstOrThrow({
    where: { contractorId: c.id, bookingType: "TROUBLESHOOT_ONLY" },
    select: { id: true, slug: true, name: true },
  });

  // MATERIAL COSTS FIRST, across the catalog.
  //
  // Not fixture convenience — it is the order a contractor works in, and the
  // dependency is invisible before it. An uncosted material makes EVERY route
  // resolve to review ("a material this service needs has no cost recorded"),
  // which short-circuits the walk before it ever reaches a hand-off. So a
  // freshly installed catalog reports no dependencies at all, and only starts
  // reporting them once the contractor has done the costing — which is
  // exactly when they are about to launch.
  await raw.service.updateMany({
    where: { contractorId: c.id },
    data: { materialCostResolved: true, unresolvedMaterialKeys: [], unresolvedPolicyKeys: [] },
  });

  // A service whose tree actually hands off to the diagnostic. Found by
  // walking, not by naming a slug: the point is the rule, not this service.
  //
  // DETERMINISTIC, and with the diagnostic as its ONLY dependency. The catalog
  // map comes back in storage order, which is not stable between runs, and
  // some services hand off to another service AS WELL as to the diagnostic —
  // launching the diagnostic alone can never clear those, so picking one of
  // them fails check 2 for a reason this file is not about. The lowest slug
  // among services whose sole unmet destination is the diagnostic is chosen,
  // so two runs pick the same service and the rule under test is the only
  // rule in play.
  const promises = await catalogPromises(raw as never, c.id);
  const candidates = await raw.service.findMany({
    where: { id: { in: [...promises.entries()].filter(([, p]) => p.needsDiagnostic && p.handoffTargets.length === 0).map(([id]) => id) } },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  const dependent = candidates[0];
  if (!dependent) throw new Error("no service in the catalog hands off only to the diagnostic");
  console.log(`  "${dependent.slug}" hands off to "${diagnostic.slug}"\n`);

  // ── 1. the dependent cannot go live while its destination is not ──────
  await clearUnrelatedBlockers(c.id, dependent.id, 0.75);
  const blocked = await inTenant(c.id, () => activationRefusal(guarded, c.id, dependent.id));
  ok(`1. a service whose hand-off isn't live is refused`,
    blocked?.code === "DEPENDENCY_UNAVAILABLE", blocked?.code ?? "allowed");
  ok(`   and the refusal names the prerequisite, not the rule`,
    !!blocked?.message.includes(diagnostic.name), blocked?.message ?? "");

  const attempted = await inTenant(c.id, () => activateService(guarded, c.id, dependent.id));
  const afterAttempt = await raw.service.findUniqueOrThrow({
    where: { id: dependent.id }, select: { active: true },
  });
  ok(`   refusing actually leaves it inactive`, !attempted.ok && afterAttempt.active === false);

  // ── 2. launching the prerequisite lets the same service through ───────
  await clearUnrelatedBlockers(c.id, diagnostic.id, 1.0);
  const diagLive = await inTenant(c.id, () => activateService(guarded, c.id, diagnostic.id));
  ok(`2. the prerequisite itself goes live on its own merits`, diagLive.ok,
    diagLive.ok ? "" : diagLive.refusal.code);

  const nowAllowed = await inTenant(c.id, () => activationRefusal(guarded, c.id, dependent.id));
  ok(`   and the SAME service is then allowed, unchanged`, nowAllowed === null,
    nowAllowed?.code ?? "");
  const second = await inTenant(c.id, () => activateService(guarded, c.id, dependent.id));
  ok(`   it activates and is persisted`, second.ok &&
    (await raw.service.findUniqueOrThrow({ where: { id: dependent.id }, select: { active: true } })).active);

  // ── 3. outcomes have DIFFERENT availability requirements ──────────────
  //
  // A hand-off needs a live destination. A review outcome needs nobody: the
  // contractor comes back with a number, and there is no second service to
  // launch. Treating every outcome as a dependency would refuse quote-only
  // services forever.
  const quoteOnly = await raw.service.findFirst({
    where: { contractorId: c.id, bookingType: "REMOTE_QUOTE", active: false },
    select: { id: true, slug: true },
  });
  if (!quoteOnly) {
    console.log(`  (no REMOTE_QUOTE service in the catalog to check)`);
  } else {
    await clearUnrelatedBlockers(c.id, quoteOnly.id, 1.0);
    const r = await inTenant(c.id, () => activationRefusal(guarded, c.id, quoteOnly.id));
    ok(`3. a review outcome is not treated as a missing dependency`,
      r === null || r.code !== "DEPENDENCY_UNAVAILABLE", r?.code ?? "");
  }

  // A reroute to a service that exists but is NOT live is refused for the
  // same reason as the diagnostic — it is the destination's availability that
  // matters, never which of the two reroute actions carried it.
  const withHandoff = [...promises.entries()].find(([id, p]) =>
    p.handoffTargets.length > 0 && id !== dependent.id);
  if (withHandoff) {
    const [hid, hp] = withHandoff;
    const targetsLive = await raw.service.count({
      where: { id: { in: hp.handoffTargets }, active: true },
    });
    if (targetsLive < hp.handoffTargets.length) {
      await clearUnrelatedBlockers(c.id, hid, 1.0);
      const r = await inTenant(c.id, () => activationRefusal(guarded, c.id, hid));
      ok(`   a reroute to an unlaunched service is refused too`,
        r?.code === "DEPENDENCY_UNAVAILABLE", r?.code ?? "allowed");
    }
  }

  // ── 4. the standing claim: nothing live leads nowhere ─────────────────
  //
  // Asked of every active service rather than of the ones this script
  // launched, because the guarantee is about the storefront as a whole.
  const settings = await loadPricingSettings(raw as never, c.id);
  const active = await raw.service.findMany({
    where: { contractorId: c.id, active: true },
    select: { id: true, slug: true, bookingType: true },
  });
  const withDead: string[] = [];
  for (const s of active) {
    const p = await promiseFor(raw as never, s as never, settings);
    if (p.routes.dead > 0) withDead.push(`${s.slug}: ${p.deadReasons[0]}`);
  }
  ok(`4. no active service leads a homeowner into a dead route (${active.length} live)`,
    withDead.length === 0, withDead.slice(0, 2).join(" | "));

  await teardown();
  console.log();
  console.log(fail
    ? `  ${fail} check(s) failed.\n`
    : `  Activation knows where the answers go, so the contractor doesn't have to.\n`);
  await raw.$disconnect();
  await (guarded as unknown as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await teardown().catch(() => {});
  process.exit(1);
});
