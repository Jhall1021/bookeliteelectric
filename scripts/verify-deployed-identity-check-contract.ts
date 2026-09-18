/**
 * Proves scripts/_deployedIdentityCheck.ts's `checkDeploymentIdentityResponse`
 * — the ONE shared comparison the orchestrator and the manual-routing
 * harness both call — against every boundary named in review: pooled/
 * direct host equivalence, a wrong host, a wrong database name, a missing
 * identity payload, missing/non-boolean sending flags, and an explicitly
 * enabled sending flag. Pure source; no network call, no real deployment.
 *
 *   npx tsx scripts/verify-deployed-identity-check-contract.ts
 */
import { checkDeploymentIdentityResponse, normalizeReportedHost, targetDatabaseName } from "./_deployedIdentityCheck";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const TARGET_URL = "postgresql://user@ep-designated-branch-pooler.c-5.us-east-2.aws.neon.tech:5432/rehearsal";
const SAFE_CONFIGURED = { transactionalResend: false, platformResend: false };

console.log("\nDEPLOYED-IDENTITY CHECK — injected-response contract\n");

// ── pure helpers, directly ─────────────────────────────────────────────
ok("normalizeReportedHost strips a port", normalizeReportedHost("ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432") === "ep-designated-branch.c-5.us-east-2.aws.neon.tech");
ok("normalizeReportedHost strips -pooler", normalizeReportedHost("ep-designated-branch-pooler.c-5.us-east-2.aws.neon.tech") === "ep-designated-branch.c-5.us-east-2.aws.neon.tech");
ok("normalizeReportedHost strips both, together", normalizeReportedHost("ep-designated-branch-pooler.c-5.us-east-2.aws.neon.tech:5432") === "ep-designated-branch.c-5.us-east-2.aws.neon.tech");
ok("targetDatabaseName reads the connection string's own path segment", targetDatabaseName(TARGET_URL) === "rehearsal");

// ── 1. pooled deployment host (with -pooler AND a port) matches a direct --target-url ──
{
  const body = { database: { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432", name: "rehearsal" }, configured: SAFE_CONFIGURED };
  const r = checkDeploymentIdentityResponse(body, TARGET_URL);
  ok("1. a pooled deployment host (port, no -pooler here) matches the direct --target-url after normalization", r.ok, JSON.stringify(r));
}
{
  // The reverse direction: --target-url itself is the pooled string (declared above), the deployment reports the bare direct host.
  const body = { database: { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech", name: "rehearsal" }, configured: SAFE_CONFIGURED };
  const r = checkDeploymentIdentityResponse(body, TARGET_URL);
  ok("1b. a direct deployment host matches a pooled --target-url after normalization", r.ok, JSON.stringify(r));
}

// ── 2. wrong host ───────────────────────────────────────────────────────
{
  const body = { database: { host: "ep-some-other-branch.c-5.us-east-2.aws.neon.tech:5432", name: "rehearsal" }, configured: SAFE_CONFIGURED };
  const r = checkDeploymentIdentityResponse(body, TARGET_URL);
  ok("2. a genuinely different host refuses", !r.ok, JSON.stringify(r));
}

// ── 3. right host, wrong database name ──────────────────────────────────
{
  const body = { database: { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432", name: "some_other_db" }, configured: SAFE_CONFIGURED };
  const r = checkDeploymentIdentityResponse(body, TARGET_URL);
  ok("3. the right host but a different database name still refuses (a host can serve several databases)", !r.ok, JSON.stringify(r));
}

// ── 4. missing identity payload entirely ────────────────────────────────
{
  const r1 = checkDeploymentIdentityResponse(null, TARGET_URL);
  ok("4a. a null body refuses", !r1.ok, JSON.stringify(r1));
  const r2 = checkDeploymentIdentityResponse({}, TARGET_URL);
  ok("4b. an empty object (no database field at all) refuses", !r2.ok, JSON.stringify(r2));
  const r3 = checkDeploymentIdentityResponse({ database: {} }, TARGET_URL);
  ok("4c. a database object with neither host nor name refuses", !r3.ok, JSON.stringify(r3));
}

// ── 5. missing or non-boolean sending flags ─────────────────────────────
{
  const goodDb = { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432", name: "rehearsal" };
  const r1 = checkDeploymentIdentityResponse({ database: goodDb }, TARGET_URL);
  ok("5a. a correct database match with NO configured object at all still refuses (cannot confirm no-send)", !r1.ok, JSON.stringify(r1));
  const r2 = checkDeploymentIdentityResponse({ database: goodDb, configured: { transactionalResend: false } }, TARGET_URL);
  ok("5b. platformResend missing entirely (transactionalResend present) still refuses", !r2.ok, JSON.stringify(r2));
  const r3 = checkDeploymentIdentityResponse({ database: goodDb, configured: { transactionalResend: "false", platformResend: false } }, TARGET_URL);
  ok("5c. a STRING \"false\" instead of the boolean still refuses — truthiness is not accepted", !r3.ok, JSON.stringify(r3));
}

// ── 6. explicitly enabled sending ────────────────────────────────────────
{
  const goodDb = { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432", name: "rehearsal" };
  const r1 = checkDeploymentIdentityResponse({ database: goodDb, configured: { transactionalResend: true, platformResend: false } }, TARGET_URL);
  ok("6a. transactionalResend explicitly true refuses", !r1.ok, JSON.stringify(r1));
  const r2 = checkDeploymentIdentityResponse({ database: goodDb, configured: { transactionalResend: false, platformResend: true } }, TARGET_URL);
  ok("6b. platformResend explicitly true refuses", !r2.ok, JSON.stringify(r2));
}

// ── 7. the genuinely correct, fully-populated case accepts ──────────────
{
  const body = { database: { host: "ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432", name: "rehearsal" }, configured: SAFE_CONFIGURED };
  const r = checkDeploymentIdentityResponse(body, TARGET_URL);
  ok("7. a genuinely matching, fully-populated, no-send response is accepted", r.ok, JSON.stringify(r));
}

console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
if (fail > 0) process.exitCode = 1;
