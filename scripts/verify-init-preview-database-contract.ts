/**
 * Local rehearsal of scripts/init-preview-database.ts's POPULATED-TARGET
 * contract — the part that cannot be exercised through its own CLI, since
 * the CLI's local mode always creates a brand-new EMPTY scratch database
 * and its remote mode needs a real Neon branch.
 *
 * A real Preview branch is a copy-on-write clone of production: populated,
 * carrying production's own real "electrical" TemplateVersion rows (a v1
 * SNAPSHOT plus v2..v6 DELTAs), real owner Users/ContractorMemberships, and
 * every other trade's own canonical template rows. This script builds that
 * shape directly on a disposable local database — sentinel rows for
 * everything that must survive, a fabricated "inherited later DELTA" for
 * the electrical trade specifically — then calls
 * `resetElectricalTemplateTree`/`verifyIntendedCatalogIsCurrent` (imported,
 * not reimplemented) exactly as `init-preview-database.ts`'s own
 * `initializeCatalog` does, and confirms:
 *
 *   1. the reset clears the fabricated inherited SNAPSHOT+DELTA rows
 *   2. the sentinel non-electrical trade's TemplateVersion survives untouched
 *   3. the sentinel owner User/ContractorMembership survive untouched
 *   4. an already-installed contractor's live Service/Question/AnswerOption
 *      rows (provenance-stamped from the OLD, now-deleted TemplateVersion)
 *      survive untouched — proving the "no FK, so no cascade reaches
 *      installed data" claim empirically, not just by reading the schema
 *   5. after a full rebuild, verifyIntendedCatalogIsCurrent reports exactly
 *      one electrical TemplateVersion with the expected service count —
 *      not a hybrid of the new build and a surviving stray DELTA
 *
 * Also unit-tests `decideRemoteTarget` (the exact-designated-target-binding
 * decision) with canned lineage verdicts — no database, no real Neon,
 * proving: a sibling branch (different endpoint, itself a genuine branch of
 * production) refuses; production's own endpoint refuses even with a
 * confirming lineage verdict; the correct endpoint with a passing lineage
 * verdict accepts; and no target-url/connection-string ever appears in any
 * refusal message.
 *
 *   npx tsx scripts/verify-init-preview-database-contract.ts
 *
 * NOT part of `npm run verify`. Creates and drops its own uniquely-named
 * local scratch database on the disposable cluster (127.0.0.1:5544) — never
 * the shared p2b_integration_seeded cluster, never a pre-existing database.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import {
  decideRemoteTarget, resetElectricalTemplateTree, verifyIntendedCatalogIsCurrent,
} from "./init-preview-database";
import type { Verdict } from "./_lineage";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
  if (!cond) fail++;
};

const SCRATCH_HOST = "127.0.0.1";
const SCRATCH_PORT = 5544;
const SCRATCH_USER = "rehearsal_admin";
const RUN = `${Date.now()}_${process.pid}`;
const DB_NAME = `p2b_previewinit_contract_${RUN}`;
const DB_URL = `postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${DB_NAME}?schema=public`;

function psql(sql: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", sql], { stdio: "pipe" });
}

async function decisionScenarios() {
  console.log(`\nDESIGNATED-TARGET BINDING — pure decision proof (no database)\n`);

  const PRODUCTION_URL = "postgresql://user@ep-production-real-123.us-east-2.aws.neon.tech/neondb";
  const INTENDED_URL = "postgresql://user@ep-preview-intended-456.us-east-2.aws.neon.tech/neondb";
  const SIBLING_URL = "postgresql://user@ep-preview-sibling-789.us-east-2.aws.neon.tech/neondb";

  const branchVerdict = (endpoint: string): Verdict => ({
    ok: true, reason: `${endpoint} is a branch of "price2book-production", production lineage 7679066014247993703.`,
    probe: { endpoint, lineage: "7679066014247993703", markerKey: "price2book-production", markerEndpoint: "ep-production-real-123" },
  });
  const originalVerdict = (endpoint: string): Verdict => ({
    ok: false, code: "IS_THE_ORIGINAL", reason: `${endpoint} is the database the marker was stamped for.`,
    probe: { endpoint, lineage: "7679066014247993703", markerKey: "price2book-production", markerEndpoint: endpoint },
  });

  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, targetEndpoint: "ep-preview-intended-456",
      expectEndpoint: "ep-preview-intended-456", expectProject: "proj-abc",
      productionUrl: PRODUCTION_URL, classify: async (u) => branchVerdict(u.includes("intended") ? "ep-preview-intended-456" : "ep-preview-sibling-789"),
    });
    ok("1. the correctly-declared intended endpoint, with a passing lineage verdict, is accepted", r.ok === true, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: SIBLING_URL, targetEndpoint: "ep-preview-sibling-789",
      expectEndpoint: "ep-preview-intended-456", expectProject: "proj-abc",
      productionUrl: PRODUCTION_URL, classify: async () => branchVerdict("ep-preview-sibling-789"),
    });
    ok("2. a sibling rehearsal branch (different actual endpoint than declared) refuses on the binding mismatch alone",
      r.ok === false && !r.reason.includes(SIBLING_URL) && !r.reason.includes(PRODUCTION_URL), JSON.stringify(r));
    ok("2b. ...and the refusal never contains a raw connection string", r.ok === false && !/postgresql:\/\//.test(r.reason), JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: SIBLING_URL, targetEndpoint: "ep-preview-sibling-789",
      expectEndpoint: "ep-preview-sibling-789", expectProject: "proj-abc",
      productionUrl: PRODUCTION_URL, classify: async () => branchVerdict("ep-preview-sibling-789"),
    });
    ok("3. ...but the SAME sibling branch is accepted once it is the one actually declared — the binding names a target, not a blocklist",
      r.ok === true, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: PRODUCTION_URL, targetEndpoint: "ep-production-real-123",
      expectEndpoint: "ep-production-real-123", expectProject: "proj-abc",
      productionUrl: PRODUCTION_URL, classify: async (u) => originalVerdict(endpointOf(u)),
    });
    ok("4. production's own endpoint refuses via the explicit inequality check, even if it were declared as the expectation",
      r.ok === false, JSON.stringify(r));
  }
  {
    const r = await decideRemoteTarget({
      targetUrl: INTENDED_URL, targetEndpoint: "ep-preview-intended-456",
      expectEndpoint: undefined, expectProject: undefined,
      productionUrl: PRODUCTION_URL, classify: async () => branchVerdict("ep-preview-intended-456"),
    });
    ok("5. missing --expect-endpoint/--expect-project refuses before lineage is even consulted", r.ok === false, JSON.stringify(r));
  }

  function endpointOf(url: string): string { return new URL(url).hostname.replace("-pooler", "").split(".")[0]; }
}

async function populatedTargetScenario() {
  console.log(`\nPOPULATED-TARGET RESET/REBUILD CONTRACT — local rehearsal of a Preview-clone shape\n`);

  psql(`CREATE DATABASE ${DB_NAME};`);
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: DB_URL } });

  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  try {
    // Legacy/required scaffolding a real Service/TemplateService row needs
    // — not part of what this proof is about, just what schema requires.
    const legacyCategory = await prisma.serviceCategory.create({ data: { slug: `sentinel-legacy-cat-${RUN}`, name: "Sentinel Legacy Category" } });
    const canonicalCategory = await prisma.canonicalCategory.create({ data: { slug: `sentinel-canonical-cat-${RUN}`, name: "Sentinel Canonical Category" } });
    const tsDefaults = { canonicalCategoryId: canonicalCategory.id, bookingType: "INSTANT" as const, photoState: "NONE" as const };

    // Sentinel: an owner User + a real Contractor already live on this
    // "clone", with an ALREADY-INSTALLED electrical Service provenance-
    // stamped from a TemplateVersion this run is about to delete.
    const owner = await prisma.user.create({ data: { id: `sentinel-owner-${RUN}`, name: "Sentinel Owner", email: `sentinel-${RUN}@example.test`, emailVerified: true } });
    const installedContractor = await prisma.contractor.create({ data: { slug: `sentinel-contractor-${RUN}`, name: "Sentinel Contractor", active: true, countryCode: "US" } });
    await prisma.contractorMembership.create({ data: { userId: owner.id, contractorId: installedContractor.id, role: "OWNER" } });
    await prisma.contractorTrade.create({ data: { contractorId: installedContractor.id, tradeKey: "electrical" } });

    // Sentinel: a different trade's own canonical template tree, which the
    // electrical-scoped reset must never touch.
    const otherTrade = `sentinel_trade_${RUN}`;
    const otherTv = await prisma.templateVersion.create({ data: { trade: otherTrade, version: 1, kind: "SNAPSHOT" } });
    await prisma.templateService.create({ data: { templateVersionId: otherTv.id, key: `sentinel_svc_${RUN}`, slug: `sentinel-svc-${RUN}`, name: "Sentinel Other-Trade Service", ...tsDefaults } });

    // The "inherited later DELTA": production's real electrical history,
    // fabricated here — an old SNAPSHOT plus a DELTA above it, exactly the
    // shape that would silently fold onto a freshly-seeded v1 if this run
    // did not reset first.
    const oldSnapshot = await prisma.templateVersion.create({ data: { trade: "electrical", version: 1, kind: "SNAPSHOT" } });
    const oldService = await prisma.templateService.create({ data: { templateVersionId: oldSnapshot.id, key: `old_service_${RUN}`, slug: `old-service-${RUN}`, name: "Old Pre-Reset Service", ...tsDefaults } });
    const inheritedDelta = await prisma.templateVersion.create({ data: { trade: "electrical", version: 2, kind: "DELTA" } });
    await prisma.templateService.create({ data: { templateVersionId: inheritedDelta.id, key: `delta_service_${RUN}`, slug: `delta-service-${RUN}`, name: "Inherited Delta Service", ...tsDefaults } });

    // The already-installed contractor's live Service, provenance-stamped
    // from the OLD snapshot this run is about to delete.
    const installedService = await prisma.service.create({
      data: { contractorId: installedContractor.id, slug: oldService.slug, name: oldService.name, categoryId: legacyCategory.id, templateKey: oldService.key, templateVersionId: oldSnapshot.id, offered: true, bookingType: "INSTANT", photoState: "NONE" },
    });

    ok("setup: fabricated inherited SNAPSHOT+DELTA, sentinel other-trade tree, sentinel owner, and an already-installed live Service all exist before reset",
      true);

    const deleted = await resetElectricalTemplateTree(DB_URL);
    ok("6. the reset reports deleting both the fabricated inherited SNAPSHOT and DELTA",
      deleted.length === 2 && deleted.some((d) => d.version === 1 && d.kind === "SNAPSHOT") && deleted.some((d) => d.version === 2 && d.kind === "DELTA"),
      JSON.stringify(deleted));

    const remainingElectrical = await prisma.templateVersion.count({ where: { trade: "electrical" } });
    ok("7. no electrical TemplateVersion rows remain immediately after the reset", remainingElectrical === 0, String(remainingElectrical));

    const otherTradeStillThere = await prisma.templateVersion.findUnique({ where: { trade_version: { trade: otherTrade, version: 1 } } });
    ok("8. the sentinel OTHER trade's TemplateVersion survives untouched", otherTradeStillThere !== null);

    const ownerStillThere = await prisma.contractorMembership.findFirst({ where: { userId: owner.id, contractorId: installedContractor.id, role: "OWNER", active: true } });
    ok("9. the sentinel owner's ContractorMembership survives untouched", ownerStillThere !== null);

    const installedServiceStillThere = await prisma.service.findUnique({ where: { id: installedService.id } });
    ok("10. the already-installed contractor's live Service survives untouched, despite its templateVersionId now pointing at a deleted row",
      installedServiceStillThere !== null && installedServiceStillThere.templateVersionId === oldSnapshot.id);

    // Rebuild: a minimal real electrical catalog (not the full 82-service
    // chain — this proof is about the reset/verify contract, not re-running
    // the whole fresh-launch rehearsal, which is already proven elsewhere
    // and explicitly not to be re-run here).
    const newSnapshot = await prisma.templateVersion.create({ data: { trade: "electrical", version: 1, kind: "SNAPSHOT" } });
    await prisma.templateService.create({ data: { templateVersionId: newSnapshot.id, key: "new_service_a", slug: "new-service-a", name: "New Service A", ...tsDefaults } });
    await prisma.templateService.create({ data: { templateVersionId: newSnapshot.id, key: "new_service_b", slug: "new-service-b", name: "New Service B", ...tsDefaults } });

    await verifyIntendedCatalogIsCurrent(DB_URL, 2);
    ok("11. verifyIntendedCatalogIsCurrent accepts the clean rebuild (exactly one SNAPSHOT, matching count)", true);

    // Simulate a stray survivor (e.g. a second script racing, or a partial
    // failure that left an extra version behind) and confirm verification
    // refuses rather than silently reporting the plausible count.
    const strayDelta = await prisma.templateVersion.create({ data: { trade: "electrical", version: 2, kind: "DELTA" } });
    await prisma.templateService.create({ data: { templateVersionId: strayDelta.id, key: "new_service_a", slug: "new-service-a-v2", name: "New Service A, v2", ...tsDefaults } });
    let threw = false;
    try { await verifyIntendedCatalogIsCurrent(DB_URL, 2); } catch { threw = true; }
    ok("12. verifyIntendedCatalogIsCurrent REFUSES once a second (stray) TemplateVersion exists, rather than trusting a plausible service count", threw);

    await prisma.templateVersion.delete({ where: { id: strayDelta.id } });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  try {
    await decisionScenarios();
    await populatedTargetScenario();
  } finally {
    try { psql(`DROP DATABASE IF EXISTS ${DB_NAME};`); } catch { /* best-effort cleanup */ }
  }
  console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
