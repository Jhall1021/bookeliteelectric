/**
 * Offline, injected-identity proof for checkGenuineProductionIdentity —
 * the corrected Finding 1 guard in scripts/release-electrical-catalog-
 * to-production.ts. No database, no network, no shared marker touched:
 * every case below is a synthetic ObservedIdentity compared against a
 * synthetic (not real) ExpectedIdentity, exactly per the review's
 * instruction to "test with injected identities and owned local
 * fixtures, not shared-marker edits."
 *
 *   npx tsx scripts/verify-release-identity-guard.ts
 */
import { checkGenuineProductionIdentity, type ExpectedIdentity, type ObservedIdentity } from "./release-electrical-catalog-to-production";

const EXPECTED: ExpectedIdentity = {
  endpoint: "ep-test-fixture-001",
  database: "test_db",
  project: "test-project-001",
  lineage: "1111111111111111111",
};

const GENUINE: ObservedIdentity = {
  endpoint: "ep-test-fixture-001",
  database: "test_db",
  lineage: "1111111111111111111",
  markerKey: "test-marker-key",
  markerEndpoint: "ep-test-fixture-001", // stamped for the SAME endpoint connected — the original
  project: "test-project-001",
};

type Case = { name: string; observed: ObservedIdentity; expectOk: boolean };

const cases: Case[] = [
  { name: "genuine production identity", observed: GENUINE, expectOk: true },
  {
    name: "a Preview/sibling branch — SAME marker key, but marker stamped for a DIFFERENT endpoint than connected",
    observed: { ...GENUINE, endpoint: "ep-preview-branch-002", markerEndpoint: "ep-test-fixture-001" },
    expectOk: false,
  },
  { name: "wrong endpoint entirely", observed: { ...GENUINE, endpoint: "ep-someone-else-003" }, expectOk: false },
  { name: "wrong database name", observed: { ...GENUINE, database: "other_db" }, expectOk: false },
  { name: "wrong lineage (different Neon project family)", observed: { ...GENUINE, lineage: "2222222222222222222" }, expectOk: false },
  { name: "unreadable lineage", observed: { ...GENUINE, lineage: null }, expectOk: false },
  { name: "no marker at all", observed: { ...GENUINE, markerKey: null, markerEndpoint: null }, expectOk: false },
  { name: "wrong project in the marker", observed: { ...GENUINE, project: "wrong-project" }, expectOk: false },
  { name: "no project readable", observed: { ...GENUINE, project: null }, expectOk: false },
];

let failures = 0;
for (const c of cases) {
  const verdict = checkGenuineProductionIdentity(c.observed, EXPECTED);
  const pass = verdict.ok === c.expectOk;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${c.name} -> ${verdict.ok ? "ACCEPTED" : `refused (${verdict.reason})`}`);
  if (!pass) failures++;
}

if (failures > 0) {
  console.error(`\n  ${failures}/${cases.length} case(s) failed.\n`);
  process.exit(1);
}
console.log(`\n  all ${cases.length} injected-identity cases behaved as expected.\n`);
