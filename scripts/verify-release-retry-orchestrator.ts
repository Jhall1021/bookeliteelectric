/**
 * Orchestrator-level proof for REVIEW OF 5322b70's core fix: the release
 * script's retry contract. Two owned, uniquely-named scratch databases on
 * the local disposable cluster (dropped at the end) — never the shared
 * `p2b_integration_seeded` database, never a real Neon target. Identity
 * is INJECTED (a synthetic `ExpectedIdentity` matching each scratch DB's
 * own real, freshly-stamped marker — never the shared marker, never
 * `PRODUCTION_LINEAGE`), so this proves the ORCHESTRATOR's control flow
 * — `main`'s sequencing of real dependencies — without touching real
 * production or the shared fixture. Schema classify/apply run for REAL
 * against these fixtures (the actual `prisma migrate diff`/`db execute`
 * commands). Catalog construction is STUBBED, per instruction — no
 * 82-service rebuild, no browser rerun.
 *
 *   npx tsx scripts/verify-release-retry-orchestrator.ts
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { probe } from "./_lineage";
import {
  main,
  classifyLiveSchema,
  applyReviewedSchemaSql,
  installPriceApprovalConstraint,
  checkGenuineProductionIdentity,
  type Deps,
  type ExpectedIdentity,
} from "./release-electrical-catalog-to-production";

const HOST = "127.0.0.1", PORT = "5544", USER = "rehearsal_admin";

function psql(dbName: string, sql: string): void {
  execFileSync("psql", ["-h", HOST, "-p", PORT, "-U", USER, "-d", dbName, "-c", sql], { stdio: "pipe" });
}
function psqlAdmin(sql: string): void {
  execFileSync("psql", ["-h", HOST, "-p", PORT, "-U", USER, "-d", "postgres", "-c", sql], { stdio: "pipe" });
}
function urlFor(dbName: string): string {
  return `postgresql://${USER}@${HOST}:${PORT}/${dbName}?schema=public`;
}
function pushSchema(dbName: string, schemaPath: string): void {
  execFileSync("npx", ["prisma", "db", "push", `--schema=${schemaPath}`, "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: "pipe",
  });
}

/** Stamps a scratch database's OWN marker with injected, test-only values — never the shared fixture. */
async function stampMarker(dbName: string, key: string, neonProject: string, neonEndpoint: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: urlFor(dbName) } } });
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO database_identity (id, key, "neonProject", "neonEndpoint") VALUES ('singleton', $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET key = $1, "neonProject" = $2, "neonEndpoint" = $3`,
      key, neonProject, neonEndpoint
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** A real identity check, exactly like the shipped one, but against an INJECTED expected checkpoint instead of the real production constants. */
function makeInjectedIdentityCheck(expected: ExpectedIdentity): (targetUrl: string) => Promise<void> {
  return async (targetUrl: string) => {
    const p = await probe(targetUrl);
    const observedDatabase = new URL(targetUrl).pathname.replace(/^\//, "");
    const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
    let observedProject: string | null;
    try {
      const rows = await prisma.$queryRawUnsafe<{ neonProject: string | null }[]>('select "neonProject" from database_identity limit 1');
      observedProject = rows[0]?.neonProject ?? null;
    } finally {
      await prisma.$disconnect();
    }
    const verdict = checkGenuineProductionIdentity(
      { endpoint: p.endpoint, database: observedDatabase, lineage: p.lineage, markerKey: p.markerKey, markerEndpoint: p.markerEndpoint, project: observedProject },
      expected
    );
    if (!verdict.ok) throw new Error(`refusing: ${verdict.reason}`);
  };
}

function spyOn<A extends unknown[], R>(fn: (...a: A) => R): { fn: (...a: A) => R; calls: number } {
  const spy = { calls: 0, fn: undefined as unknown as (...a: A) => R };
  spy.fn = (...a: A) => { spy.calls++; return fn(...a); };
  return spy;
}

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

async function main_() {
  const stamp = Date.now();
  const dbPending = `p2b_retrytest_pending_${stamp}`;
  const dbDrift = `p2b_retrytest_drift_${stamp}`;

  try {
    console.log("\nSetting up owned scratch fixtures (local disposable cluster only)...\n");
    psqlAdmin(`CREATE DATABASE ${dbPending};`);
    psqlAdmin(`CREATE DATABASE ${dbDrift};`);
    pushSchema(dbPending, "/tmp/main_schema.prisma");
    // dbDrift starts from main's schema (so database_identity exists to
    // stamp) then gets ONE unrelated, unreviewed column added — neither
    // "matches the reviewed pending migration" nor "already candidate,"
    // the "unrelated drift" case.
    pushSchema(dbDrift, "/tmp/main_schema.prisma");
    psql(dbDrift, `ALTER TABLE canonical_materials ADD COLUMN completely_unexpected_test_column TEXT;`);

    const expectedPending: ExpectedIdentity = { endpoint: "127", database: dbPending, project: "test-retry-orchestrator", lineage: "" };
    const expectedDrift: ExpectedIdentity = { endpoint: "127", database: dbDrift, project: "test-retry-orchestrator", lineage: "" };
    // Lineage is the local cluster's own real, measured system identifier —
    // shared by both scratch DBs since they're on the same local server;
    // this is what real production's own lineage constant plays in the
    // shipped script, just measured instead of hardcoded for this fixture.
    const measured = await probe(urlFor(dbPending));
    expectedPending.lineage = measured.lineage ?? "";
    expectedDrift.lineage = measured.lineage ?? "";

    await stampMarker(dbPending, "test-retry-marker", expectedPending.project, expectedPending.endpoint);
    await stampMarker(dbDrift, "test-retry-marker", expectedDrift.project, expectedDrift.endpoint);

    console.log("1. Force a failure AFTER successful schema application; retry; assert migration skipped, rebuild reached\n");

    const applySpy1 = spyOn(applyReviewedSchemaSql);
    const constraintSpy1 = spyOn(installPriceApprovalConstraint);
    let rebuildCalls1 = 0;
    const depsRun1: Deps = {
      checkIdentity: makeInjectedIdentityCheck(expectedPending),
      classifySchema: classifyLiveSchema,
      applySchema: applySpy1.fn,
      installConstraint: constraintSpy1.fn,
      rebuildCatalog: async () => { rebuildCalls1++; throw new Error("simulated catalog-construction failure — AFTER schema application succeeded"); },
    };

    let run1Threw = false;
    try {
      await main({ targetUrl: urlFor(dbPending), apply: true, confirmProduction: true, recoveryPointConfirmed: "test" }, depsRun1);
    } catch {
      run1Threw = true;
    }
    check("run 1 throws (simulated rebuild failure)", run1Threw);
    check("run 1: applySchema called exactly once", applySpy1.calls === 1, `actual: ${applySpy1.calls}`);
    check("run 1: installConstraint called exactly once", constraintSpy1.calls === 1, `actual: ${constraintSpy1.calls}`);
    check("run 1: rebuildCatalog reached exactly once (then threw)", rebuildCalls1 === 1, `actual: ${rebuildCalls1}`);

    const stateAfterRun1 = classifyLiveSchema(urlFor(dbPending));
    check("target is at the candidate schema after run 1 (schema application persisted despite the later failure)", stateAfterRun1 === "already-candidate", `actual: ${stateAfterRun1}`);

    const applySpy2 = spyOn(applyReviewedSchemaSql);
    const constraintSpy2 = spyOn(installPriceApprovalConstraint);
    let rebuildCalls2 = 0;
    const depsRun2: Deps = {
      checkIdentity: makeInjectedIdentityCheck(expectedPending),
      classifySchema: classifyLiveSchema,
      applySchema: applySpy2.fn,
      installConstraint: constraintSpy2.fn,
      rebuildCatalog: async () => { rebuildCalls2++; },
    };

    let run2Threw = false;
    try {
      await main({ targetUrl: urlFor(dbPending), apply: true, confirmProduction: true, recoveryPointConfirmed: "test" }, depsRun2);
    } catch (e) {
      run2Threw = true;
      console.error("  (unexpected) retry threw:", e);
    }
    check("retry does NOT throw (this is the bug this round fixes)", !run2Threw);
    check("retry: applySchema is SKIPPED (zero calls — this is the fix)", applySpy2.calls === 0, `actual: ${applySpy2.calls}`);
    check("retry: installConstraint still called (idempotent)", constraintSpy2.calls === 1, `actual: ${constraintSpy2.calls}`);
    check("retry: rebuildCatalog dependency IS reached", rebuildCalls2 === 1, `actual: ${rebuildCalls2}`);

    console.log("\n2. Unexpected drift invokes zero writes\n");

    const applySpy3 = spyOn(applyReviewedSchemaSql);
    const constraintSpy3 = spyOn(installPriceApprovalConstraint);
    let rebuildCalls3 = 0;
    const depsDrift: Deps = {
      checkIdentity: makeInjectedIdentityCheck(expectedDrift),
      classifySchema: classifyLiveSchema,
      applySchema: applySpy3.fn,
      installConstraint: constraintSpy3.fn,
      rebuildCatalog: async () => { rebuildCalls3++; },
    };
    let driftThrew = false;
    try {
      await main({ targetUrl: urlFor(dbDrift), apply: true, confirmProduction: true, recoveryPointConfirmed: "test" }, depsDrift);
    } catch {
      driftThrew = true;
    }
    check("drift target refuses (throws)", driftThrew);
    check("drift: zero calls to applySchema", applySpy3.calls === 0, `actual: ${applySpy3.calls}`);
    check("drift: zero calls to installConstraint", constraintSpy3.calls === 0, `actual: ${constraintSpy3.calls}`);
    check("drift: zero calls to rebuildCatalog", rebuildCalls3 === 0, `actual: ${rebuildCalls3}`);

    console.log("\n3. Atomicity of schema application — a poisoned copy of the reviewed SQL leaves zero DDL applied\n");
    const dbAtomic = `p2b_retrytest_atomic_${stamp}`;
    psqlAdmin(`CREATE DATABASE ${dbAtomic};`);
    try {
      pushSchema(dbAtomic, "/tmp/main_schema.prisma");
      const fs = await import("node:fs");
      const full = fs.readFileSync("docs/design/electrical-atomic-labor-production-schema-release.sql", "utf8");
      const i = full.indexOf("-- BEGIN REVIEWED DIFF");
      const blank = full.indexOf("\n\n", i);
      const body = full.slice(blank + 2);
      const poisonedPath = "/tmp/_verify_retry_poisoned.sql";
      fs.writeFileSync(poisonedPath, body + `\n\nALTER TABLE "this_table_does_not_exist_at_all" ADD COLUMN "x" TEXT;\n`);
      let applyThrew = false;
      try {
        execFileSync("npx", ["prisma", "db", "execute", "--url", urlFor(dbAtomic), "--file", poisonedPath], { stdio: "pipe" });
      } catch {
        applyThrew = true;
      }
      fs.unlinkSync(poisonedPath);
      check("poisoned apply exits nonzero", applyThrew);
      const stateAfterPoison = classifyLiveSchema(urlFor(dbAtomic));
      check("target is still at pending-migration after the poisoned apply (nothing partially persisted)", stateAfterPoison === "pending-migration", `actual: ${stateAfterPoison}`);
    } finally {
      psqlAdmin(`DROP DATABASE IF EXISTS ${dbAtomic};`);
    }

    if (failures > 0) {
      console.error(`\n  ${failures} check(s) FAILED.\n`);
      process.exitCode = 1;
    } else {
      console.log("\n  all retry-orchestrator checks passed.\n");
    }
  } finally {
    console.log("\nDropping owned scratch fixtures...");
    psqlAdmin(`DROP DATABASE IF EXISTS ${dbPending};`);
    psqlAdmin(`DROP DATABASE IF EXISTS ${dbDrift};`);
  }
}

main_();
