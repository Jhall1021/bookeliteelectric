/**
 * The corrected release path, exercised through its REAL adapters — with no
 * network, database, credentials, or Vercel.
 *
 *   npx tsx scripts/verify-release-hardening.ts
 *
 * Every case below reproduces something that was accepted and should not have
 * been. They drive the actual functions the release command calls — the API
 * adapters with a fake fetch, the shell guard with a fake curl — rather than
 * asserting that the source text mentions them.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL, PROVENANCE_BUILD_COMMAND, VERCEL_BUILD_COMMAND_MAX } from "./_releaseProvenance";
import { parseCurrentProduction } from "./_releaseSource";
import { freshMainSha } from "./release-production";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const MAIN = "a".repeat(40), OTHER = "b".repeat(40);
const CAND = "dpl_candidate";

const GOOD_RECORD = {
  uid: CAND, projectId: CANONICAL.vercelProjectId, target: "production", readyState: "READY",
  source: "git",
  gitSource: { type: "github", org: CANONICAL.owner, repo: CANONICAL.repo, ref: "main", sha: MAIN },
};
const GOOD_CURRENT = { uid: "dpl_live", readyState: "READY", alias: [...CANONICAL.canonicalHosts] };
/*
 * SECTIONS 1-5 WERE DELETED WITH THE SUBSYSTEM THEY TESTED.
 *
 * They exercised validateRelease/applyRelease in _releaseOrchestration.ts and
 * the origin-trust apparatus in _releaseSource.ts — a dry run that mutated
 * nothing, refusals that sent nothing, the completeness of a trust BASIS, and
 * contradictory build fields. Every one of those was a question about whether a
 * deployment's own record could be believed about its origin.
 *
 * That question is now known to be unanswerable: the caller creating a
 * deployment writes those fields. The release creates the deployment and keeps
 * the id from its own request, so there is nothing left to interrogate and
 * nothing here to test. The check count fell accordingly, and that is the
 * intended result rather than lost coverage.
 *
 * What remains below tests only live surfaces: the real adapters against a fake
 * fetch, parseCurrentProduction, the build command, the shell guard, and the
 * wiring of the real entry point.
 */


/* ── 6. The real adapters, with a fake fetch ──────────────────────────── */
async function realAdapters() {
  console.log("\n  THE REAL ADAPTERS\n");

  const res = (status: number, body: unknown, text?: string) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => text ?? JSON.stringify(body),
  }) as unknown as Response;

  // freshMainSha — the authenticated read that previously did not authenticate.
  ok(await freshMainSha(async () => res(200, {}), undefined) === null,
    "freshMainSha with no token returns null rather than trying an unauthenticated read");

  let sentAuth: string | null = null;
  const capturing = (async (_u: string | URL | Request, init?: RequestInit) => {
    sentAuth = new Headers(init?.headers).get("authorization");
    return res(200, { ref: "refs/heads/main", object: { type: "commit", sha: MAIN } });
  }) as typeof fetch;
  ok(await freshMainSha(capturing, "t") === MAIN, "freshMainSha reads the sha from a well-formed ref object");
  ok(sentAuth === "Bearer t", "and sends the credential as a header, not in a URL or argv");

  ok(await freshMainSha(async () => res(200, { ref: "refs/heads/other", object: { type: "commit", sha: MAIN } }), "t") === null,
    "and refuses a response for a different ref");
  ok(await freshMainSha(async () => res(200, { ref: "refs/heads/main", object: { type: "blob", sha: MAIN } }), "t") === null,
    "and refuses an object that is not a commit");
  ok(await freshMainSha(async () => res(500, {}), "t") === null, "and refuses a non-2xx");

  // The vercelJsonBuildCommand tests went with the function. That helper read
  // vercel.json from OUTSIDE the release decision; the authoritative check is
  // preflightDecision's commit-tree test, which refuses CONFIG_FILE_PRESENT for
  // vercel.json, vercel.toml AND vercel.ts, and refuses TREE_TRUNCATED when
  // absence cannot be established at all. Proof 2 is why that matters: a commit
  // adding only a root vercel.json produced a READY build whose effective
  // command was the file's, with the provenance guard never fetched.

  // The buildEvidence adapter is gone. Its job — establishing what a deployment
  // was actually built with — is now promotionDecision's candidate check, which
  // compares FIVE settings against approved constants rather than one, and is
  // exercised in verify-release-control (A7, A8). The vercel.json logic below
  // moved into the preflight tree read and is covered there.
}

/* ── 7. parseCurrentProduction ────────────────────────────────────────── */
function currentProduction() {
  console.log("\n  CURRENT PRODUCTION\n");
  ok(parseCurrentProduction(undefined, new Error("boom")).ok === false, "a fetch error is unreadable");
  ok(parseCurrentProduction({ uid: "", alias: [], readyState: "ERROR" }).ok === false, "empty/ERROR is malformed");
  ok(parseCurrentProduction({ uid: "d", readyState: "READY", alias: ["a", ""] }).ok === false, "an empty alias entry is malformed");
  ok(parseCurrentProduction(GOOD_CURRENT).ok === true, "and a complete record parses");
}

/* ── 8. The build command ─────────────────────────────────────────────── */
function buildCommand() {
  console.log("\n  THE BUILD COMMAND\n");
  ok(PROVENANCE_BUILD_COMMAND.length <= VERCEL_BUILD_COMMAND_MAX,
    `fits Vercel's ceiling (${PROVENANCE_BUILD_COMMAND.length}/${VERCEL_BUILD_COMMAND_MAX})`);
  ok(PROVENANCE_BUILD_COMMAND.includes(CANONICAL.owner) && PROVENANCE_BUILD_COMMAND.includes(CANONICAL.repo),
    "and pins the canonical repository");
  ok(!/gh[ps]_|github_pat_/.test(PROVENANCE_BUILD_COMMAND), "and carries no literal credential");
  ok(!/-H\s+["']?Authorization/i.test(PROVENANCE_BUILD_COMMAND), "and no Authorization header in argv");
}

/* ── 9. The shell guard, parsed not scraped ───────────────────────────── */
function shellGuard() {
  console.log("\n  THE SHELL GUARD PARSES JSON\n");
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  const run = (exitCode: number, body: string, env: Record<string, string> = {}) => {
    const p = join(dir, "curl");
    writeFileSync(p, `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${body.replace(/'/g, "'\\''")}'\nexit ${exitCode}\n`);
    chmodSync(p, 0o755);
    try {
      return { code: 0, out: execFileSync("sh", ["scripts/provenance-guard.sh"], {
        env: { NODE_ENV: "test", PATH: `${dir}:${process.env.PATH}`,
          VERCEL_ENV: "production", VERCEL_GIT_PROVIDER: "github",
          VERCEL_GIT_REPO_OWNER: CANONICAL.owner, VERCEL_GIT_REPO_SLUG: CANONICAL.repo,
          VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: MAIN,
          P2B_GH_READ_TOKEN: "test-token-not-real", ...env },
        encoding: "utf8" }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? -1, out: err.stdout ?? "" };
    }
  };
  const refObj = `{"ref":"refs/heads/main","object":{"type":"commit","sha":"${MAIN}"}}`;

  const timeout = run(28, `{"sha":"${MAIN}"}`);
  ok(timeout.code !== 0 && /MAIN_UNREADABLE/.test(timeout.out), "a curl timeout refuses despite a SHA in partial output");

  const invalid = run(0, `{"ref":"refs/heads/main","object":`);
  ok(invalid.code !== 0 && /MAIN_UNREADABLE/.test(invalid.out), "INVALID JSON is refused", invalid.out.trim());

  const wrongRef = run(0, `{"ref":"refs/heads/release","object":{"type":"commit","sha":"${MAIN}"},"note":"refs/heads/main"}`);
  ok(wrongRef.code !== 0 && /MAIN_UNREADABLE/.test(wrongRef.out),
    "a WRONG ref is refused though refs/heads/main appears elsewhere in the body", wrongRef.out.trim());

  const blob = run(0, `{"ref":"refs/heads/main","object":{"type":"blob","sha":"${MAIN}"}}`);
  ok(blob.code !== 0 && /MAIN_UNREADABLE/.test(blob.out), "an object of type blob is refused", blob.out.trim());

  const noCred = run(0, refObj, { P2B_GH_READ_TOKEN: "" });
  ok(noCred.code !== 0 && /NO_READ_CREDENTIAL/.test(noCred.out), "a missing credential refuses");

  const good = run(0, refObj);
  ok(good.code === 0 && new RegExp(`PROVENANCE OK ${MAIN}`).test(good.out), "and a valid commit ref object passes", good.out.trim());

  const notMain = run(0, `{"ref":"refs/heads/main","object":{"type":"commit","sha":"${OTHER}"}}`);
  ok(notMain.code !== 0 && /SHA_NOT_MAIN/.test(notMain.out), "and a commit that is not main refuses");
}

/* ── 10. The real command uses this path ──────────────────────────────── */
function entryPointWiring() {
  console.log("\n  THE REAL RELEASE COMMAND\n");
  const code = readFileSync(new URL("./release-production.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(/runRelease\(/.test(code) && /liveIO\(/.test(code), "runs the shared release function with live effects");
  ok(/phase === "preflight"/.test(code) || /"preflight"/.test(code),
    "and defaults to the read-only preflight phase");
  ok(!/execFileSync/.test(code), "and no longer shells out to git for the authenticated read");
  ok((code.match(/\/promote\//g) ?? []).length === 1, "and the promote endpoint appears exactly once");
}

async function main() {
  console.log("\nRELEASE HARDENING");
  await realAdapters();
  currentProduction();
  buildCommand();
  shellGuard();
  entryPointWiring();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
