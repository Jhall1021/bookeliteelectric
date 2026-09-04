/**
 * The corrected release guard, exercised end to end — without a network,
 * a database, credentials, or Vercel.
 *
 *   npx tsx scripts/verify-release-hardening.ts
 *
 * Every effect is injected and recorded, so the assertion that matters can
 * actually be made: ON EVERY REFUSAL, ZERO PROMOTION REQUESTS ARE SENT. A
 * refusal that is computed and then ignored by its caller is not a guard, and
 * no test of a pure function can see the difference.
 *
 * The shell cases run the real guard with a FAKE curl on PATH, which is how a
 * timeout is tested without waiting for one.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL, PROVENANCE_BUILD_COMMAND, VERCEL_BUILD_COMMAND_MAX, type Candidate } from "./_releaseProvenance";
import { parseCurrentProduction, verifiedOrigin, evidenceRefusal, ORIGIN_TRUST_BASIS, type BuildEvidence, type OriginTrustBasis } from "./_releaseSource";

/**
 * A basis that pretends the observation has been done, ONLY so the checks
 * downstream of origin can be exercised. Production uses the module constant,
 * which is UNVERIFIED and refuses everything — proved in trustBasisFailsClosed().
 */
const OBSERVED: OriginTrustBasis = {
  state: "OBSERVED", observedOn: "TEST-ONLY",
  trustedFields: ["source", "gitSource.org", "gitSource.repo", "gitSource.ref", "gitSource.sha"],
  note: "test fixture — not a real observation",
};
import { promote, type ReleaseEffects } from "./_releaseOrchestration";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const MAIN = "a".repeat(40), OTHER = "b".repeat(40);

const candidate: Candidate = {
  id: "dpl_candidate", url: "x.vercel.app", readyState: "READY", target: "production",
  projectId: CANONICAL.vercelProjectId, githubDeployment: false,
  githubOrg: undefined, githubRepo: undefined, githubRef: undefined, githubSha: undefined,
  clientSha: undefined, createdAt: 1,
};

const GOOD_DEPLOYMENT = {
  source: "git",
  gitSource: { type: "github", org: CANONICAL.owner, repo: CANONICAL.repo, ref: "main", sha: MAIN },
};
const GOOD_CURRENT = { uid: "dpl_live", readyState: "READY", alias: [...CANONICAL.canonicalHosts] };
const GOOD_EVIDENCE: BuildEvidence = {
  effectiveBuildCommand: PROVENANCE_BUILD_COMMAND,
  commitVercelJsonBuildCommand: null,
  guardLineSha: MAIN,
  projectBuildCommandNow: PROVENANCE_BUILD_COMMAND,
};

/** Recording fakes. `assigned` is the whole point. */
function effects(over: Partial<ReleaseEffects> = {}) {
  const assigned: string[] = [];
  const fx: ReleaseEffects = {
    readCurrentProduction: async () => ({ raw: GOOD_CURRENT }),
    readFreshMain: async () => MAIN,
    readDeployment: async () => GOOD_DEPLOYMENT,
    readBuildEvidence: async () => GOOD_EVIDENCE,
    assignAlias: async (_d, a) => { assigned.push(a); },
    ...over,
  };
  return { fx, assigned };
}

async function refusesWithNoRequests(over: Partial<ReleaseEffects>, code: string, label: string) {
  const { fx, assigned } = effects(over);
  const r = await promote(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
  ok(!r.ok && r.code === code && assigned.length === 0, label,
    `got ${r.ok ? "OK" : r.code}, ${assigned.length} alias request(s)`);
}

/* ── 1. A refusal must send nothing ──────────────────────────────────── */
async function refusalsSendNothing() {
  console.log("\n  EVERY REFUSAL IS A NO-OP\n");

  await refusesWithNoRequests({ readCurrentProduction: async () => ({ error: new Error("502") }) },
    "CURRENT_PRODUCTION_UNREADABLE", "an unreadable current production promotes nothing");

  await refusesWithNoRequests({ readCurrentProduction: async () => { throw new Error("timeout"); } },
    "CURRENT_PRODUCTION_UNREADABLE", "a THROWN read is caught and promotes nothing");

  // The exact shape that slipped through the earlier version.
  await refusesWithNoRequests(
    { readCurrentProduction: async () => ({ raw: { uid: "", alias: [], readyState: "ERROR" } }) },
    "CURRENT_PRODUCTION_MALFORMED", "empty id, empty aliases and ERROR state promotes nothing");

  await refusesWithNoRequests({ readCurrentProduction: async () => ({ raw: { uid: "d", readyState: "READY", alias: ["a", ""] } }) },
    "CURRENT_PRODUCTION_MALFORMED", "an alias list with an empty entry promotes nothing");

  await refusesWithNoRequests({ readFreshMain: async () => null },
    "MAIN_UNREADABLE", "an unreadable fresh main promotes nothing");

  await refusesWithNoRequests({ readDeployment: async () => ({ source: "cli", gitSource: null }) },
    "ORIGIN_UNVERIFIED", "a CLI-sourced deployment promotes nothing");

  // The original defect: meta says all the right things and proves nothing.
  await refusesWithNoRequests({ readDeployment: async () => ({
      meta: { githubDeployment: "1", githubOrg: CANONICAL.owner, githubRepo: CANONICAL.repo,
              githubCommitRef: "main", githubCommitSha: MAIN } }) },
    "ORIGIN_UNVERIFIED", "self-asserted meta alone promotes nothing");

  await refusesWithNoRequests({ readDeployment: async () => ({
      source: "git", gitSource: { type: "github", org: "someone-else", repo: "fork", ref: "main", sha: MAIN } }) },
    "WRONG_REPOSITORY", "a verified origin naming another repository promotes nothing");

  await refusesWithNoRequests({ readBuildEvidence: async () => null },
    "BUILD_CONFIG_UNKNOWN", "unknown build configuration promotes nothing");

  // THE CASE THE LOG LINE USED TO WAVE THROUGH.
  await refusesWithNoRequests({ readBuildEvidence: async () => ({
      ...GOOD_EVIDENCE, effectiveBuildCommand: "npm run build" }) },
    "BUILD_COMMAND_NOT_APPROVED",
    "a deployment built WITHOUT the guard promotes nothing, though its log line says PROVENANCE OK");

  await refusesWithNoRequests({ readBuildEvidence: async () => ({
      ...GOOD_EVIDENCE, commitVercelJsonBuildCommand: "next build" }) },
    "BUILD_COMMAND_OVERRIDDEN", "a vercel.json override at the built commit promotes nothing");
}

/* ── 2. The happy path still promotes ────────────────────────────────── */
async function theHappyPathWorks() {
  console.log("\n  AND A VERIFIED CANDIDATE IS PROMOTED\n");
  const { fx, assigned } = effects();
  const r = await promote(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
  ok(r.ok === true, "a fully verified candidate promotes", r.ok ? "" : `${r.code}: ${r.detail}`);
  ok(assigned.length === CANONICAL.canonicalHosts.length,
    `and every canonical host is assigned (${assigned.length})`);
  ok(r.ok === true && r.replaced === "dpl_live",
    "and the replaced deployment is recorded as the rollback target");
}

/* ── 3. The log line is corroboration, never authority ───────────────── */
function logLineIsNotAuthority() {
  console.log("\n  THE GUARD LOG LINE IS NOT AUTHORITY\n");
  ok(evidenceRefusal({ ...GOOD_EVIDENCE, effectiveBuildCommand: "npm run build" },
      PROVENANCE_BUILD_COMMAND, MAIN)?.code === "BUILD_COMMAND_NOT_APPROVED",
    "a printed PROVENANCE OK line cannot substitute for the approved build command");
  ok(evidenceRefusal({ ...GOOD_EVIDENCE, guardLineSha: OTHER }, PROVENANCE_BUILD_COMMAND, MAIN)?.code
      === "GUARD_SHA_MISMATCH",
    "but a CONTRADICTING line still refuses — it may veto, not permit");
  ok(evidenceRefusal({ ...GOOD_EVIDENCE, guardLineSha: null }, PROVENANCE_BUILD_COMMAND, MAIN) === null,
    "and an absent line does not block an otherwise correctly built deployment");
}

/* ── 4. Origin trust basis fails closed until observed ───────────────── */
function trustBasisFailsClosed() {
  console.log("\n  THE ORIGIN TRUST BASIS IS DECLARED, NOT ASSUMED\n");
  const r = verifiedOrigin(GOOD_DEPLOYMENT);
  if (ORIGIN_TRUST_BASIS.state === "UNVERIFIED") {
    ok(!r.ok && r.reason === "no_trust_basis",
      "while the trust basis is UNVERIFIED even a well-formed origin is refused");
    ok(ORIGIN_TRUST_BASIS.trustedFields.length === 0,
      "and no field is claimed trustworthy without an adversarial observation");
  } else {
    ok(r.ok === true, "with an OBSERVED basis a well-formed git origin verifies");
    ok(ORIGIN_TRUST_BASIS.trustedFields.length > 0 && ORIGIN_TRUST_BASIS.observedOn !== null,
      "and OBSERVED requires recorded fields and a date");
  }
}

/* ── 5. The build command ────────────────────────────────────────────── */
function buildCommand() {
  console.log("\n  THE BUILD COMMAND\n");
  ok(PROVENANCE_BUILD_COMMAND.length <= VERCEL_BUILD_COMMAND_MAX,
    `fits Vercel's ceiling (${PROVENANCE_BUILD_COMMAND.length}/${VERCEL_BUILD_COMMAND_MAX})`);
  ok(PROVENANCE_BUILD_COMMAND.includes(CANONICAL.owner) && PROVENANCE_BUILD_COMMAND.includes(CANONICAL.repo),
    "and still pins the canonical repository, so the approved string means something");
  ok(!/gh[ps]_|github_pat_/.test(PROVENANCE_BUILD_COMMAND), "and carries no literal credential");
  ok(!/-H\s+["']?Authorization/i.test(PROVENANCE_BUILD_COMMAND),
    "and passes no Authorization header as an argument");
}

/* ── 6. The shell guard, with a fake curl ────────────────────────────── */
function shellGuard() {
  console.log("\n  THE SHELL GUARD FAILS CLOSED\n");

  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  const fakeCurl = (exitCode: number, body: string) => {
    const p = join(dir, "curl");
    writeFileSync(p, `#!/bin/sh\ncat >/dev/null\n[ -n '${body}' ] && printf '%s' '${body}'\nexit ${exitCode}\n`);
    chmodSync(p, 0o755);
    return dir;
  };

  const run = (exitCode: number, body: string, env: Record<string, string> = {}) => {
    const bin = fakeCurl(exitCode, body);
    try {
      const out = execFileSync("sh", ["scripts/provenance-guard.sh"], {
        // A DELIBERATELY MINIMAL ENVIRONMENT. The guard must decide from the
        // facts it is given, so it gets exactly those and nothing inherited.
        env: {
          NODE_ENV: process.env.NODE_ENV ?? "test",
          PATH: `${bin}:${process.env.PATH}`,
          VERCEL_ENV: "production", VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: CANONICAL.owner, VERCEL_GIT_REPO_SLUG: CANONICAL.repo,
          VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: MAIN,
          P2B_GH_READ_TOKEN: "test-token-not-real", ...env,
        },
        encoding: "utf8",
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? -1, out: err.stdout ?? "" };
    }
  };

  const refObj = `{"ref":"refs/heads/main","object":{"sha":"${MAIN}","type":"commit"}}`;

  // THE BUG THIS FIXES: curl exited 28 and the pipeline still reported success.
  const timeout = run(28, `{"sha":"${MAIN}"}`);
  ok(timeout.code !== 0 && /MAIN_UNREADABLE/.test(timeout.out),
    "a curl timeout refuses even though its partial output contains a SHA",
    `exit ${timeout.code}: ${timeout.out.trim()}`);

  const http404 = run(22, "");
  ok(http404.code !== 0 && /MAIN_UNREADABLE/.test(http404.out),
    "a non-2xx response refuses", `exit ${http404.code}: ${http404.out.trim()}`);

  const empty = run(0, "");
  ok(empty.code !== 0 && /MAIN_UNREADABLE/.test(empty.out),
    "an empty body refuses", `exit ${empty.code}: ${empty.out.trim()}`);

  // A 40-hex string inside an error page is not a ref object.
  const errorPage = run(0, `{"message":"Not Found","documentation_url":"${MAIN}"}`);
  ok(errorPage.code !== 0 && /MAIN_UNREADABLE/.test(errorPage.out),
    "a SHA-shaped string in an error body is not accepted as main",
    `exit ${errorPage.code}: ${errorPage.out.trim()}`);

  const noCred = run(0, refObj, { P2B_GH_READ_TOKEN: "" });
  ok(noCred.code !== 0 && /NO_READ_CREDENTIAL/.test(noCred.out),
    "a missing read credential refuses rather than producing an empty main",
    `exit ${noCred.code}: ${noCred.out.trim()}`);

  const good = run(0, refObj);
  ok(good.code === 0 && new RegExp(`PROVENANCE OK ${MAIN}`).test(good.out),
    "and a well-formed ref object passes", `exit ${good.code}: ${good.out.trim()}`);

  const wrongSha = run(0, `{"ref":"refs/heads/main","object":{"sha":"${OTHER}"}}`);
  ok(wrongSha.code !== 0 && /SHA_NOT_MAIN/.test(wrongSha.out),
    "and a commit that is not main still refuses", `exit ${wrongSha.code}: ${wrongSha.out.trim()}`);
}

async function main() {
  console.log("\nRELEASE HARDENING");
  await refusalsSendNothing();
  await theHappyPathWorks();
  logLineIsNotAuthority();
  trustBasisFailsClosed();
  buildCommand();
  shellGuard();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
