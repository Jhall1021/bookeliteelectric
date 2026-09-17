/**
 * Local rehearsal of scripts/init-preview-database.ts's corrected
 * contracts — the parts that cannot be exercised through its own CLI, since
 * the CLI's local mode always creates a brand-new EMPTY scratch database and
 * its remote mode needs a real Neon branch:
 *
 *   A. DESIGNATED-TARGET BINDING (`decideRemoteTarget`, pure, no database):
 *      a sibling branch, a wrong project, a wrong database name, an
 *      unreadable/unmarked project, production's own endpoint, and missing
 *      declarations all refuse — proving each of `--expect-endpoint`/
 *      `--expect-project`/`--expect-database` is checked against something
 *      actually OBSERVED (an injectable `readIdentity`), never merely
 *      accepted because it was supplied.
 *   B. RESET MECHANICS (`resetElectricalTemplateTree`,
 *      `verifyIntendedCatalogIsCurrent`, real local Postgres): a fabricated
 *      inherited SNAPSHOT+DELTA and sentinel owner/other-trade/already-
 *      installed rows prove the trade-scoped reset clears the right thing
 *      and nothing else; a fabricated non-cascading FK into `services`
 *      proves `resetEliteSourceData` refuses BEFORE touching anything, not
 *      partway through, when it meets a dependency it doesn't know how to
 *      clear.
 *   C. POPULATED-TARGET REBUILD AND RETRY (`rebuildElectricalCatalog`, the
 *      REAL construction chain — not synthetic inserts): a clean control
 *      build, then the SAME real chain run again against that SAME database
 *      after dirtying it (an altered surviving Elite field, a stale extra
 *      Elite service, a later fabricated electrical DELTA, and a real
 *      disposable Quote/LineItem/PricingRule fixture — the explicitly
 *      authorized test-booking dependency `resetEliteSourceData` now
 *      clears) and again after a simulated partial failure (only the first
 *      half of SEED_STEPS ran) — both converge on the control's own
 *      normalized fold content.
 *   D. CREDENTIAL-SAFE ERROR OUTPUT: a real child process that fails with a
 *      credential embedded in its own stdout/stderr, proving
 *      `sanitizeSecrets`/`runCaptured` strip it before anything is logged.
 *   E. COMPARISON SEMANTICS — fast, no database: hand-built fold-shaped
 *      fixtures prove the corrected `normalizeForComparison`/
 *      `resolveSemanticIds` pipeline actually distinguishes a changed
 *      component/disclaimer/question-sequence/routing-or-access difference
 *      (each must FAIL equivalence) from harmless id churn and unordered-set
 *      reordering (each must PASS) — the exact blind spot code review found
 *      in the first version, which stripped every `*Id` field generically
 *      and sorted every array including `questions`.
 *
 *   npx tsx scripts/verify-init-preview-database-contract.ts
 *
 * NOT part of `npm run verify`. Creates and drops two uniquely-named local
 * scratch databases on the disposable cluster (127.0.0.1:5544) — never the
 * shared p2b_integration_seeded cluster, never a pre-existing database.
 * Cleanup failures are tracked and REPORTED, never silently swallowed.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import {
  decideRemoteTarget, resetElectricalTemplateTree, resetEliteSourceData,
  verifyIntendedCatalogIsCurrent, rebuildElectricalCatalog,
  sanitizeSecrets, runCaptured, fullEndpoint,
  normalizeForComparison, resolveSemanticIds, type SemanticKeyMaps,
  type TargetIdentity,
} from "./init-preview-database";
import { run, SEED_STEPS, NEEDS_APPLY, TOLERATE_NONZERO, bootstrapContractor, addMissingCoverRaised4sRole } from "./rehearse-fresh-electrical-launch";
import type { Verdict } from "./_lineage";

const ELITE_SLUG = "elite-electric";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
  if (!cond) fail++;
};

const SCRATCH_HOST = "127.0.0.1";
const SCRATCH_PORT = 5544;
const SCRATCH_USER = "rehearsal_admin";
const RUN = `${Date.now()}_${process.pid}`;

function psql(sql: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", sql], { stdio: "pipe" });
}
function dbUrlFor(name: string): string {
  return `postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${name}?schema=public`;
}
/** CREATE only — kept separate so the caller can record ownership right after this succeeds, before schema setup. */
function createDatabase(name: string): void {
  psql(`CREATE DATABASE ${name};`);
}
function pushSchema(name: string): void {
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: dbUrlFor(name) } });
}

// ===========================================================================
// A. DESIGNATED-TARGET BINDING — pure decision proof, no database
// ===========================================================================
async function decisionScenarios() {
  console.log(`\nA. DESIGNATED-TARGET BINDING — pure decision proof (no database)\n`);

  const PRODUCTION_URL = "postgresql://user@ep-production-real-123.us-east-2.aws.neon.tech/neondb";
  const INTENDED_URL = "postgresql://user@ep-preview-intended-456.us-east-2.aws.neon.tech/neondb";
  const SIBLING_URL = "postgresql://user@ep-preview-sibling-789.us-east-2.aws.neon.tech/neondb";

  const INTENDED_ENDPOINT = fullEndpoint(INTENDED_URL);
  const SIBLING_ENDPOINT = fullEndpoint(SIBLING_URL);
  const PRODUCTION_ENDPOINT = fullEndpoint(PRODUCTION_URL);

  const branchVerdict = (endpoint: string): Verdict => ({
    ok: true, reason: `${endpoint} is a branch of "price2book-production", production lineage 7679066014247993703.`,
    probe: { endpoint, lineage: "7679066014247993703", markerKey: "price2book-production", markerEndpoint: PRODUCTION_ENDPOINT },
  });
  const identityOf = (endpoint: string, project: string | null, database = "neondb"): TargetIdentity => ({ endpoint, database, project });
  const neverCalled = (name: string) => async () => { throw new Error(`${name} must never be called on this path`); };

  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, expectEndpoint: INTENDED_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(INTENDED_ENDPOINT, "proj-abc"),
      classify: async () => branchVerdict(INTENDED_ENDPOINT),
    });
    ok("1. correctly-declared endpoint/project/database, passing lineage, is accepted", r.ok === true, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: SIBLING_URL, expectEndpoint: INTENDED_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(SIBLING_ENDPOINT, "proj-abc"),
      classify: async () => branchVerdict(SIBLING_ENDPOINT),
    });
    ok("2. a sibling rehearsal branch (different OBSERVED endpoint than declared) refuses on the binding mismatch alone",
      r.ok === false && !r.reason.includes(SIBLING_URL) && !r.reason.includes(PRODUCTION_URL), JSON.stringify(r));
    ok("2b. ...and the refusal never contains a raw connection string", r.ok === false && !/postgresql:\/\//.test(r.reason), JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: SIBLING_URL, expectEndpoint: SIBLING_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(SIBLING_ENDPOINT, "proj-abc"),
      classify: async () => branchVerdict(SIBLING_ENDPOINT),
    });
    ok("3. ...but the SAME sibling branch IS accepted once it is the one actually declared — the binding names a target, not a blocklist", r.ok === true, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: PRODUCTION_URL, expectEndpoint: PRODUCTION_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: neverCalled("readIdentity"), classify: neverCalled("classify"),
    });
    ok("4. production's own endpoint refuses via the explicit inequality check BEFORE any identity read or lineage call, even if declared as the expectation", r.ok === false, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, expectEndpoint: undefined, expectProject: undefined, expectDatabase: undefined,
      productionUrl: PRODUCTION_URL,
      readIdentity: neverCalled("readIdentity"), classify: neverCalled("classify"),
    });
    ok("5. missing --expect-endpoint/--expect-project/--expect-database refuses before identity is even read", r.ok === false, JSON.stringify(r));
  }
  {
    // The bug this round fixes: --expect-project was checked only for
    // presence. Endpoint and database both match; only the OBSERVED
    // project (from the target's own marker) differs.
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, expectEndpoint: INTENDED_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(INTENDED_ENDPOINT, "proj-WRONG"),
      classify: async () => branchVerdict(INTENDED_ENDPOINT),
    });
    ok("6. an OBSERVED project that differs from --expect-project refuses, even though the endpoint matches exactly", r.ok === false, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, expectEndpoint: INTENDED_ENDPOINT, expectProject: "proj-abc", expectDatabase: "wrong-db-name",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(INTENDED_ENDPOINT, "proj-abc", "neondb"),
      classify: async () => branchVerdict(INTENDED_ENDPOINT),
    });
    ok("7. an OBSERVED database name that differs from --expect-database refuses", r.ok === false, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, expectEndpoint: INTENDED_ENDPOINT, expectProject: "proj-abc", expectDatabase: "neondb",
      productionUrl: PRODUCTION_URL,
      readIdentity: async () => identityOf(INTENDED_ENDPOINT, null),
      classify: async () => branchVerdict(INTENDED_ENDPOINT),
    });
    ok("8. an unreadable/unmarked project refuses rather than being treated as a pass", r.ok === false, JSON.stringify(r));
  }
}

// ===========================================================================
// B. RESET MECHANICS — real local Postgres, fabricated inherited history
// ===========================================================================
async function resetMechanicsScenario(dbName: string) {
  console.log(`\nB. RESET MECHANICS — trade-scoped delete, sentinel survival, unsupported-dependency refusal\n`);
  const dbUrl = dbUrlFor(dbName);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const legacyCategory = await prisma.serviceCategory.create({ data: { slug: `sentinel-legacy-cat-${RUN}`, name: "Sentinel Legacy Category" } });
    const canonicalCategory = await prisma.canonicalCategory.create({ data: { slug: `sentinel-canonical-cat-${RUN}`, name: "Sentinel Canonical Category" } });
    const tsDefaults = { canonicalCategoryId: canonicalCategory.id, bookingType: "INSTANT" as const, photoState: "NONE" as const };

    const owner = await prisma.user.create({ data: { id: `sentinel-owner-${RUN}`, name: "Sentinel Owner", email: `sentinel-${RUN}@example.test`, emailVerified: true } });
    const installedContractor = await prisma.contractor.create({ data: { slug: `sentinel-contractor-${RUN}`, name: "Sentinel Contractor", active: true, countryCode: "US" } });
    await prisma.contractorMembership.create({ data: { userId: owner.id, contractorId: installedContractor.id, role: "OWNER" } });
    await prisma.contractorTrade.create({ data: { contractorId: installedContractor.id, tradeKey: "electrical" } });

    const otherTrade = `sentinel_trade_${RUN}`;
    const otherTv = await prisma.templateVersion.create({ data: { trade: otherTrade, version: 1, kind: "SNAPSHOT" } });
    await prisma.templateService.create({ data: { templateVersionId: otherTv.id, key: `sentinel_svc_${RUN}`, slug: `sentinel-svc-${RUN}`, name: "Sentinel Other-Trade Service", ...tsDefaults } });

    const oldSnapshot = await prisma.templateVersion.create({ data: { trade: "electrical", version: 1, kind: "SNAPSHOT" } });
    const oldService = await prisma.templateService.create({ data: { templateVersionId: oldSnapshot.id, key: `old_service_${RUN}`, slug: `old-service-${RUN}`, name: "Old Pre-Reset Service", ...tsDefaults } });
    const inheritedDelta = await prisma.templateVersion.create({ data: { trade: "electrical", version: 2, kind: "DELTA" } });
    await prisma.templateService.create({ data: { templateVersionId: inheritedDelta.id, key: `delta_service_${RUN}`, slug: `delta-service-${RUN}`, name: "Inherited Delta Service", ...tsDefaults } });

    const installedService = await prisma.service.create({
      data: { contractorId: installedContractor.id, slug: oldService.slug, name: oldService.name, categoryId: legacyCategory.id, templateKey: oldService.key, templateVersionId: oldSnapshot.id, offered: true, bookingType: "INSTANT", photoState: "NONE" },
    });

    ok("setup: fabricated inherited SNAPSHOT+DELTA, sentinel other-trade tree, sentinel owner, and an already-installed live Service all exist before reset", true);

    // A dependency resetEliteSourceData does NOT know how to clear: a
    // throwaway table with a non-cascading FK into services. Proves the
    // refusal fires BEFORE anything is touched, not partway through a
    // half-finished delete.
    await prisma.$executeRawUnsafe(`create table if not exists _test_unsupported_service_dependency (id serial primary key, service_id text references services(id))`);
    let refusedOnUnsupportedDependency = false;
    let refusalMessage = "";
    try {
      await resetEliteSourceData(dbUrl);
    } catch (e) {
      refusedOnUnsupportedDependency = true;
      refusalMessage = String(e);
    }
    const serviceStillThereAfterRefusal = await prisma.service.findUnique({ where: { id: installedService.id } });
    ok("9. resetEliteSourceData refuses BEFORE deleting anything once an unsupported non-cascading dependency into services exists",
      refusedOnUnsupportedDependency && refusalMessage.includes("_test_unsupported_service_dependency") && serviceStillThereAfterRefusal !== null,
      refusalMessage);
    await prisma.$executeRawUnsafe(`drop table _test_unsupported_service_dependency`);

    const deleted = await resetElectricalTemplateTree(dbUrl);
    ok("10. the reset reports deleting both the fabricated inherited SNAPSHOT and DELTA",
      deleted.length === 2 && deleted.some((d) => d.version === 1 && d.kind === "SNAPSHOT") && deleted.some((d) => d.version === 2 && d.kind === "DELTA"),
      JSON.stringify(deleted));

    const remainingElectrical = await prisma.templateVersion.count({ where: { trade: "electrical" } });
    ok("11. no electrical TemplateVersion rows remain immediately after the reset", remainingElectrical === 0, String(remainingElectrical));

    const otherTradeStillThere = await prisma.templateVersion.findUnique({ where: { trade_version: { trade: otherTrade, version: 1 } } });
    ok("12. the sentinel OTHER trade's TemplateVersion survives untouched", otherTradeStillThere !== null);

    const ownerStillThere = await prisma.contractorMembership.findFirst({ where: { userId: owner.id, contractorId: installedContractor.id, role: "OWNER", active: true } });
    ok("13. the sentinel owner's ContractorMembership survives untouched", ownerStillThere !== null);

    const installedServiceStillThere = await prisma.service.findUnique({ where: { id: installedService.id } });
    ok("14. the already-installed contractor's live Service ROW survives untouched (still pointing at a now-deleted TemplateVersion id — see this file's own header on why that is not the same as staying functional)",
      installedServiceStillThere !== null && installedServiceStillThere.templateVersionId === oldSnapshot.id);

    const newSnapshot = await prisma.templateVersion.create({ data: { trade: "electrical", version: 1, kind: "SNAPSHOT" } });
    await prisma.templateService.create({ data: { templateVersionId: newSnapshot.id, key: "new_service_a", slug: "new-service-a", name: "New Service A", ...tsDefaults } });
    await prisma.templateService.create({ data: { templateVersionId: newSnapshot.id, key: "new_service_b", slug: "new-service-b", name: "New Service B", ...tsDefaults } });

    await verifyIntendedCatalogIsCurrent(dbUrl, 2);
    ok("15. verifyIntendedCatalogIsCurrent accepts a clean rebuild (exactly one SNAPSHOT, matching count, real fold)", true);

    const strayDelta = await prisma.templateVersion.create({ data: { trade: "electrical", version: 2, kind: "DELTA" } });
    await prisma.templateService.create({ data: { templateVersionId: strayDelta.id, key: "new_service_a", slug: "new-service-a-v2", name: "New Service A, v2", ...tsDefaults } });
    let threw = false;
    try { await verifyIntendedCatalogIsCurrent(dbUrl, 2); } catch { threw = true; }
    ok("16. verifyIntendedCatalogIsCurrent REFUSES once a second (stray) TemplateVersion exists, rather than trusting a plausible service count", threw);
  } finally {
    await prisma.$disconnect();
  }
}

// ===========================================================================
// C. POPULATED-TARGET REBUILD AND RETRY — the REAL construction chain
// ===========================================================================
async function populatedRebuildAndRetryScenario(dbName: string) {
  console.log(`\nC. POPULATED-TARGET REBUILD AND RETRY — real construction chain, dirtied and partially-failed\n`);
  const dbUrl = dbUrlFor(dbName);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    // Sentinel data that must survive every rebuild below, exactly as in B.
    const otherTrade = `sentinel_trade_c_${RUN}`;
    const owner = await prisma.user.create({ data: { id: `sentinel-owner-c-${RUN}`, name: "Sentinel Owner C", email: `sentinel-c-${RUN}@example.test`, emailVerified: true } });
    const sentinelContractor = await prisma.contractor.create({ data: { slug: `sentinel-contractor-c-${RUN}`, name: "Sentinel Contractor C", active: true, countryCode: "US" } });
    await prisma.contractorMembership.create({ data: { userId: owner.id, contractorId: sentinelContractor.id, role: "OWNER" } });
    const sentinelCanonicalCategory = await prisma.canonicalCategory.create({ data: { slug: `sentinel-canonical-cat-c-${RUN}`, name: "Sentinel Canonical Category C" } });
    const otherTv = await prisma.templateVersion.create({ data: { trade: otherTrade, version: 1, kind: "SNAPSHOT" } });
    await prisma.templateService.create({ data: { templateVersionId: otherTv.id, key: `sentinel_svc_c_${RUN}`, slug: `sentinel-svc-c-${RUN}`, name: "Sentinel Other-Trade Service C", canonicalCategoryId: sentinelCanonicalCategory.id, bookingType: "INSTANT", photoState: "NONE" } });

    const assertSentinelsSurvive = async (label: string) => {
      const tv = await prisma.templateVersion.findUnique({ where: { trade_version: { trade: otherTrade, version: 1 } } });
      const membership = await prisma.contractorMembership.findFirst({ where: { userId: owner.id, contractorId: sentinelContractor.id, role: "OWNER", active: true } });
      ok(`${label}: sentinel other-trade TemplateVersion and owner ContractorMembership both survive`, tv !== null && membership !== null);
    };

    console.log(`\n  --- control build (clean) ---`);
    const control = await rebuildElectricalCatalog(dbUrl);
    ok("17. control build produces the expected 82 services and a normalized fingerprint", typeof control.fingerprint === "string" && control.fingerprint.length > 0);
    await assertSentinelsSurvive("18");

    console.log(`\n  --- dirtying the now-populated target ---`);
    const elite = await prisma.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
    const dirtyOption = await prisma.answerOption.findFirstOrThrow({ where: { question: { service: { contractorId: elite.id } } }, select: { id: true } });
    await prisma.answerOption.update({ where: { id: dirtyOption.id }, data: { label: "DIRTY-ALTERED-LABEL-MUST-NOT-SURVIVE" } });
    const anyServiceCategory = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
    const staleService = await prisma.service.create({
      data: { contractorId: elite.id, slug: `stale-leftover-service-${RUN}`, name: "Stale Leftover Service", categoryId: anyServiceCategory.id, offered: true, bookingType: "INSTANT", photoState: "NONE" },
    });
    const anyCanonicalCategory = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
    const strayDelta = await prisma.templateVersion.create({ data: { trade: "electrical", version: 99, kind: "DELTA" } });
    await prisma.templateService.create({
      data: { templateVersionId: strayDelta.id, key: `stray_delta_service_${RUN}`, slug: `stray-delta-service-${RUN}`, name: "Stray Delta Service", canonicalCategoryId: anyCanonicalCategory.id, bookingType: "INSTANT", photoState: "NONE" },
    });

    // The explicitly-authorized disposable-booking dependency
    // resetEliteSourceData now clears: a real Visit/Customer/LineItem/Quote/
    // PricingRule against one of Elite's own live services. Not "active
    // customer records" — a disposable test fixture proving the reset
    // handles the actual scoped dependency instead of failing closed on it.
    const anyEliteService = await prisma.service.findFirstOrThrow({ where: { contractorId: elite.id }, select: { id: true } });
    const visit = await prisma.visit.create({ data: { contractorId: elite.id } });
    const customer = await prisma.customer.create({ data: { contractorId: elite.id } });
    const lineItem = await prisma.lineItem.create({ data: { visitId: visit.id, serviceId: anyEliteService.id, answersSnapshot: {} } });
    await prisma.quote.create({ data: { customerId: customer.id, serviceId: anyEliteService.id, lineItemId: lineItem.id, answersSnapshot: {} } });
    await prisma.pricingRule.create({ data: { serviceId: anyEliteService.id, condition: "sentinel test condition" } });
    ok("setup: an altered surviving field, a stale extra Elite service, a later fabricated electrical DELTA, and a disposable Quote/LineItem/PricingRule fixture all exist on the populated target", true);

    console.log(`\n  --- rebuild against the DIRTY, already-populated target (the real chain, not a synthetic stand-in) ---`);
    const rebuilt = await rebuildElectricalCatalog(dbUrl, { expectedFingerprint: control.fingerprint });
    ok("19. rebuilding against a dirty, populated target — including the disposable booking fixture — converges on the SAME normalized fold content as the clean control", rebuilt.fingerprint === control.fingerprint);

    const dirtyOptionGone = await prisma.answerOption.findUnique({ where: { id: dirtyOption.id } });
    ok("20. the altered AnswerOption row is gone entirely (Elite's tree was reset, not patched in place)", dirtyOptionGone === null);
    const staleServiceGone = await prisma.service.findUnique({ where: { id: staleService.id } });
    ok("21. the stale extra Elite service is gone", staleServiceGone === null);
    const strayDeltaGone = await prisma.templateVersion.findFirst({ where: { trade: "electrical", version: 99 } });
    ok("22. the later fabricated electrical DELTA is gone", strayDeltaGone === null);
    const lineItemGone = await prisma.lineItem.findUnique({ where: { id: lineItem.id } });
    const quoteGone = await prisma.quote.count({ where: { serviceId: anyEliteService.id } });
    const pricingRuleGone = await prisma.pricingRule.count({ where: { serviceId: anyEliteService.id } });
    ok("23. the disposable Quote/LineItem/PricingRule fixture is gone (rebuild succeeded rather than failing closed on it)",
      lineItemGone === null && quoteGone === 0 && pricingRuleGone === 0);
    await assertSentinelsSurvive("24");

    console.log(`\n  --- simulating a partial failure: reset, bootstrap, then only the FIRST HALF of SEED_STEPS ---`);
    await resetElectricalTemplateTree(dbUrl);
    await resetEliteSourceData(dbUrl);
    await bootstrapContractor(dbUrl);
    await addMissingCoverRaised4sRole(dbUrl);
    const halfway = Math.floor(SEED_STEPS.length / 2);
    for (const step of SEED_STEPS.slice(0, halfway)) {
      if (step === "__CONDITIONAL_DISCLAIMERS__") { run("prisma/seed-conditional-disclaimers.ts", [], {}, dbUrl); continue; }
      const stepArgs = NEEDS_APPLY.has(step) ? ["--apply"] : [];
      run(step, stepArgs, TOLERATE_NONZERO[step] ? { allowFailure: TOLERATE_NONZERO[step] } : {}, dbUrl);
    }
    // No extraction ran (POST_SEED_STEPS never reached) — genuinely no
    // electrical TemplateVersion exists yet, a real "died partway through
    // seeding" state, not a hand-crafted approximation of one.
    const midFailureVersionCount = await prisma.templateVersion.count({ where: { trade: "electrical" } });
    ok("setup: the simulated partial failure left no electrical TemplateVersion at all (extraction never ran)", midFailureVersionCount === 0, String(midFailureVersionCount));

    console.log(`\n  --- retry: run the REAL chain again against this SAME half-seeded target ---`);
    const retried = await rebuildElectricalCatalog(dbUrl, { expectedFingerprint: control.fingerprint });
    ok("25. a same-target retry after a partial failure converges on the SAME normalized fold content as the clean control", retried.fingerprint === control.fingerprint);
    await assertSentinelsSurvive("26");
  } finally {
    // A failed assertion above must not prevent this — an earlier version
    // only disconnected at the very end of the function body, so a thrown
    // `ok()`-adjacent assertion (or any await above) left the connection
    // open, which is exactly what made this database's own DROP fail with
    // "being accessed by other users" the first few times this was rehearsed.
    await prisma.$disconnect();
  }
}

// ===========================================================================
// D. CREDENTIAL-SAFE ERROR OUTPUT — a real child process, a real secret
// ===========================================================================
async function credentialSanitizationScenario() {
  console.log(`\nD. CREDENTIAL-SAFE ERROR OUTPUT — injected secret through the real subprocess wrapper\n`);
  const fakeSecret = "sup3rSecretPassw0rd";
  const fakeConnString = `postgresql://produser:${fakeSecret}@ep-fake-production.us-east-2.aws.neon.tech/neondb`;
  const script =
    `console.log(${JSON.stringify(`connecting to ${fakeConnString}`)});` +
    `console.error(${JSON.stringify(`FATAL: can't reach database server at ${fakeConnString}`)});` +
    `process.exit(7);`;
  const result = runCaptured("node", ["-e", script], process.env);

  ok("27. the injected child process really did fail with the credential embedded in its own raw output (this is a real test, not a vacuous one)",
    result.code === 7 && (result.stdout.includes(fakeSecret) || result.stderr.includes(fakeSecret)));

  const sanitizedOut = sanitizeSecrets(result.stdout);
  const sanitizedErr = sanitizeSecrets(result.stderr);
  ok("28. sanitizeSecrets strips the credential from stdout", !sanitizedOut.includes(fakeSecret), sanitizedOut);
  ok("29. sanitizeSecrets strips the credential from stderr", !sanitizedErr.includes(fakeSecret), sanitizedErr);
  ok("30. a redaction marker stands in place of the credential in both streams", sanitizedOut.includes("[redacted]") && sanitizedErr.includes("[redacted]"));
}

// ===========================================================================
// E. COMPARISON SEMANTICS — fast, no database. Hand-built fold-shaped
// fixtures, matching templateVersionSource's own raw output shape (opaque
// row ids, unresolved canonical*Id fields, order columns) so this exercises
// the REAL pipeline (resolveSemanticIds + normalizeForComparison), not a
// simplified stand-in.
// ===========================================================================
function fingerprintOf(services: unknown[], maps: SemanticKeyMaps): string {
  return JSON.stringify(normalizeForComparison(resolveSemanticIds({ services, policies: [] }, maps)));
}

const BASE_MAPS: SemanticKeyMaps = {
  component: new Map([["compIdA", "COMPONENT_A"], ["compIdB", "COMPONENT_B"]]),
  material: new Map([["matIdA", "MATERIAL_A"]]),
  disclaimer: new Map([["discIdA", "DISCLAIMER_A"], ["discIdB", "DISCLAIMER_B"]]),
  photoGroup: new Map(),
  category: new Map([["catA", "category-a"]]),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hand-built fixture data, matching templateVersionSource's raw output shape; precise typing adds no safety here
function baseServices(): any[] {
  return [{
    id: "svcRowA", key: "svc_a", name: "Service A", canonicalCategoryId: "catA",
    bookingType: "INSTANT", photoState: "NONE",
    materials: [{ id: "matRowA", templateServiceId: "svcRowA", canonicalMaterialId: "matIdA", quantity: 1, quantityIsPolicy: false, order: 0 }],
    questions: [
      {
        id: "qRow1", templateServiceId: "svcRowA", key: "q1", prompt: "Question One?", inputType: "SINGLE_SELECT", order: 0,
        options: [
          {
            id: "optRow1", templateQuestionId: "qRow1", value: "opt1", label: "Option One", routeAction: "CONTINUE", nextQuestionKey: "q2", order: 0,
            accessClassification: null,
            components: [{ id: "compRowA", templateAnswerOptionId: "optRow1", canonicalComponentId: "compIdA", quantity: 1 }],
            materials: [{ id: "optMatRowA", templateAnswerOptionId: "optRow1", canonicalMaterialId: "matIdA", quantity: 1, order: 0 }],
            disclaimers: [{ id: "discRowA", templateAnswerOptionId: "optRow1", canonicalDisclaimerId: "discIdA" }],
            photoGroups: [],
          },
        ],
      },
      {
        id: "qRow2", templateServiceId: "svcRowA", key: "q2", prompt: "Question Two?", inputType: "SINGLE_SELECT", order: 1,
        options: [
          { id: "optRow2", templateQuestionId: "qRow2", value: "opt2", label: "Option Two", routeAction: "RESOLVE_INSTANT", nextQuestionKey: null, order: 0, accessClassification: null, components: [], materials: [], disclaimers: [], photoGroups: [] },
        ],
      },
    ],
    policies: [],
  }];
}

/** Deep clone + apply a mutation, without disturbing the base fixture other tests share. */
function withChange(mutate: (s: any[]) => void): unknown[] {
  const clone = JSON.parse(JSON.stringify(baseServices()));
  mutate(clone);
  return clone;
}

async function comparisonSemanticsScenarios() {
  console.log(`\nE. COMPARISON SEMANTICS — fast, no database\n`);
  const control = fingerprintOf(baseServices(), BASE_MAPS);

  // --- must FAIL equivalence -------------------------------------------
  const componentSwapped = withChange((s) => { (s[0].questions[0].options[0].components[0] as any).canonicalComponentId = "compIdB"; });
  ok("31. swapping a referenced component's canonical key changes the fingerprint", fingerprintOf(componentSwapped, BASE_MAPS) !== control);

  const disclaimerSwapped = withChange((s) => { (s[0].questions[0].options[0].disclaimers[0] as any).canonicalDisclaimerId = "discIdB"; });
  ok("32. swapping a referenced disclaimer's canonical key changes the fingerprint", fingerprintOf(disclaimerSwapped, BASE_MAPS) !== control);

  const questionsSwapped = withChange((s) => { s[0].questions.reverse(); });
  ok("33. swapping which question comes first (entry/sequence) changes the fingerprint — questions are compared BY POSITION, never re-sorted",
    fingerprintOf(questionsSwapped, BASE_MAPS) !== control);

  const routingChanged = withChange((s) => { (s[0].questions[0].options[0] as any).routeAction = "RESOLVE_INSTANT"; });
  ok("34. a routing change (routeAction) changes the fingerprint", fingerprintOf(routingChanged, BASE_MAPS) !== control);

  const accessChanged = withChange((s) => { (s[0].questions[0].options[0] as any).accessClassification = "FINISHED"; });
  ok("35. an access-condition change (accessClassification) changes the fingerprint", fingerprintOf(accessChanged, BASE_MAPS) !== control);

  const categorySwapped = withChange((s) => { (s[0] as any).canonicalCategoryId = "catB"; });
  const mapsWithCatB: SemanticKeyMaps = { ...BASE_MAPS, category: new Map([...BASE_MAPS.category, ["catB", "category-b"]]) };
  ok("36. swapping a service's canonical category changes the fingerprint", fingerprintOf(categorySwapped, mapsWithCatB) !== fingerprintOf(baseServices(), mapsWithCatB));

  // --- must PASS equivalence (regenerated ids, harmless reordering) ----
  const idsChurned = withChange((s) => {
    s[0].id = "svcRowZZZ"; s[0].questions[0].id = "qRowZZZ1"; s[0].questions[0].options[0].id = "optRowZZZ1";
    s[0].questions[0].options[0].components[0].id = "compRowZZZ"; s[0].questions[0].options[0].materials[0].id = "optMatRowZZZ";
    s[0].questions[0].options[0].disclaimers[0].id = "discRowZZZ"; s[0].questions[1].id = "qRowZZZ2"; s[0].questions[1].options[0].id = "optRowZZZ2";
    s[0].materials[0].id = "matRowZZZ";
  });
  ok("37. regenerated opaque row ids (identical semantic content) leave the fingerprint unchanged", fingerprintOf(idsChurned, BASE_MAPS) === control);

  const materialsReordered = withChange((s) => {
    s[0].questions[0].options[0].materials = [
      { id: "optMatRowB", templateAnswerOptionId: "optRow1", canonicalMaterialId: "matIdA", quantity: 1, order: 5 },
    ];
    s[0].materials.reverse();
  });
  ok("38. a harmless order-VALUE difference on an unordered material line (same key/quantity) leaves the fingerprint unchanged",
    fingerprintOf(materialsReordered, BASE_MAPS) === control);

  const questionOrderTieBrokenDifferently = withChange((s) => {
    // Same SEQUENCE (q1 still first, q2 still second) — only the literal
    // `order` NUMBER differs, exactly the non-deterministic-tie shape
    // rehearsal found in prisma/seed-conditional-disclaimers.ts and
    // prisma/seed-content-fixes.ts (both fixed this round). Rank
    // normalization must absorb this; array position is what carries the
    // real sequence.
    s[0].questions[0].order = 7; s[0].questions[1].order = 7;
  });
  ok("39. a question order-VALUE tie broken differently, with the SAME actual sequence, leaves the fingerprint unchanged (rank, not raw number, is compared)",
    fingerprintOf(questionOrderTieBrokenDifferently, BASE_MAPS) === control);
}

async function main() {
  const createdDatabases: string[] = [];
  let cleanupFailed = false;
  try {
    await decisionScenarios();
    await credentialSanitizationScenario();
    await comparisonSemanticsScenarios();

    const dbB = `p2b_previewinit_contract_b_${RUN}`;
    createDatabase(dbB);
    createdDatabases.push(dbB); // ownership recorded only after CREATE succeeds, before schema setup
    pushSchema(dbB);
    await resetMechanicsScenario(dbB);

    const dbC = `p2b_previewinit_contract_c_${RUN}`;
    createDatabase(dbC);
    createdDatabases.push(dbC);
    pushSchema(dbC);
    await populatedRebuildAndRetryScenario(dbC);
  } finally {
    for (const name of createdDatabases) {
      try {
        psql(`DROP DATABASE IF EXISTS ${name};`);
        console.log(`  Cleaned up ${name}.`);
      } catch (e) {
        cleanupFailed = true;
        console.error(`  WARNING: failed to drop scratch database ${name}: ${sanitizeSecrets(String(e))} — a human must drop this manually.`);
      }
    }
  }
  console.log(`\n${fail === 0 && !cleanupFailed ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED${cleanupFailed ? " (plus at least one cleanup failure reported above)" : ""}`}\n`);
  if (fail > 0 || cleanupFailed) process.exit(1);
}

main().catch((e) => { console.error(sanitizeSecrets(e instanceof Error ? (e.stack ?? e.message) : String(e))); process.exit(1); });
