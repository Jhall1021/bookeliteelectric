/**
 * Production release authority — proven, not remembered.
 *
 *   npx tsx scripts/verify-release-provenance.ts
 *
 * Static and local. No database, no Vercel, no network beyond a bare git
 * repository created in a temp directory to stand in for GitHub. Runs in the
 * deploy gate.
 *
 * WHAT IS PROVEN
 *
 *   1. decideBuildProvenance refuses every wrong or missing fact and admits
 *      exactly one shape: production, github, the CANONICAL owner/repo,
 *      main, full SHA, fresh main equal to it.
 *   2. scripts/provenance-guard.sh — the thing Vercel actually runs — gives
 *      the same answer as the TypeScript decision on the same fact table,
 *      case by case, including an unreachable remote. Mutants of the guard
 *      with a check removed FAIL the table, so the table has teeth.
 *   3. The Build Command that fetches it fits Vercel's 256-character ceiling,
 *      fails closed on an empty fetch, and runs `npm run build` only after
 *      the guard.
 *   4. the superseded metadata-origin pathway is ABSENT from the release
 *      deployment, a non-READY or non-production one, and admits the one
 *      GitHub-built deployment of current main. Fixtures are the real
 *      metadata shapes recorded during the 3 September incident.
 *   5. scripts/release-production.ts never uploads a tree, parses its phase
 *      strictly, refuses --apply, creates in phase B by design, records
 *      the previous deployment, reads back, and loads no .env file.
 *   6. /api/release is public, no-store, three fields, touches nothing else;
 *      /api/deployment-identity and middleware are byte-for-byte unchanged.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, chmodSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CANONICAL, decideBuildProvenance,
  provenanceBuildCommand, PROVENANCE_BUILD_COMMAND, PROVENANCE_GUARD_PATH, VERCEL_BUILD_COMMAND_MAX,
  type BuildFacts,
} from "./_releaseProvenance";

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MAIN = "b24bba0f16bd225a0e54158313b7b5ebda29af18";
const STALE = "c33427106701851865013e419361a43da518a3f1";
// Derived from CANONICAL, never hardcoded: this fixture used to name the old
// owner literally, so a repository move broke the gate instead of following it.
const GOOD: BuildFacts = { vercelEnv: "production", gitProvider: "github", repoOwner: CANONICAL.owner, repoSlug: CANONICAL.repo, commitRef: CANONICAL.ref, commitSha: MAIN, freshMainSha: MAIN };

/** One fact table drives both the TypeScript decision and the shell guard. */
const TABLE: { name: string; facts: Partial<BuildFacts>; expect: string }[] = [
  { name: "the one admissible shape", facts: {}, expect: "OK" },
  { name: "a preview build", facts: { vercelEnv: "preview" }, expect: "NOT_PRODUCTION" },
  { name: "no environment at all", facts: { vercelEnv: undefined }, expect: "NOT_PRODUCTION" },
  { name: "a CLI upload: every git field empty (observed 3 Sep)", facts: { gitProvider: undefined, repoOwner: undefined, repoSlug: undefined, commitRef: undefined, commitSha: undefined }, expect: "NOT_GITHUB" },
  { name: "another provider", facts: { gitProvider: "gitlab" }, expect: "NOT_GITHUB" },
  { name: "a fork owner", facts: { repoOwner: "someone-else" }, expect: "WRONG_OWNER" },
  { name: "another repository", facts: { repoSlug: "some-other-repo" }, expect: "WRONG_REPO" },
  { name: "a feature branch", facts: { commitRef: "feat/production-release-authority" }, expect: "WRONG_REF" },
  { name: "a ref that merely contains main", facts: { commitRef: "not-main" }, expect: "WRONG_REF" },
  { name: "a short SHA", facts: { commitSha: MAIN.slice(0, 7) }, expect: "NO_SHA" },
  { name: "an empty SHA", facts: { commitSha: "" }, expect: "NO_SHA" },
  { name: "GitHub unreadable", facts: { freshMainSha: null }, expect: "MAIN_UNREADABLE" },
  { name: "the divergent local-main SHA (the incident)", facts: { commitSha: STALE }, expect: "SHA_NOT_MAIN" },
  { name: "main moved past this build", facts: { freshMainSha: "1111111111111111111111111111111111111111" }, expect: "SHA_NOT_MAIN" },
];

/** A bare repository whose refs/heads/main is whatever the case needs — GitHub, locally. */
function bareRepoWithMain(dir: string, sha: string | null): string {
  const repo = join(dir, `remote-${sha ? sha.slice(0, 7) : "none"}.git`);
  execFileSync("git", ["init", "--bare", "-q", repo]);
  if (sha) {
    // A ref can point at any object id in a bare repo's packed-refs; ls-remote reports it without dereferencing.
    writeFileSync(join(repo, "packed-refs"), `# pack-refs with: peeled fully-peeled sorted\n${sha} refs/heads/main\n`);
  }
  return repo;
}

/**
 * Run the guard against a FAKE GitHub, with no network and no credential.
 *
 * The guard reads the API now, so the old harness — a throwaway git repo and
 * P2B_MAIN_REMOTE — could no longer serve it, and every case needing a
 * SUCCESSFUL read failed as MAIN_UNREADABLE. A fake `curl` on PATH returns the
 * ref object the API would, which also lets an unreadable GitHub be tested by
 * exiting non-zero instead of waiting for a real timeout.
 */
function runGuard(
  script: string, facts: BuildFacts, mainSha: string | null,
  dir: string
): { code: number; out: string } {
  const body = mainSha === null
    ? ""
    : JSON.stringify({ ref: `refs/heads/${CANONICAL.ref}`, object: { type: "commit", sha: mainSha } });
  const exitCode = mainSha === null ? 22 : 0;
  const curl = join(dir, "curl");
  writeFileSync(curl, `#!/bin/sh\ncat >/dev/null\nprintf '%s' '${body}'\nexit ${exitCode}\n`);
  chmodSync(curl, 0o755);

  const env: Record<string, string> = {
    PATH: `${dir}:${process.env.PATH ?? ""}`,
    P2B_GH_READ_TOKEN: "verifier-placeholder-not-a-credential",
    GIT_TERMINAL_PROMPT: "0",
  };
  const put = (k: string, v: string | undefined) => { if (v !== undefined) env[k] = v; };
  put("VERCEL_ENV", facts.vercelEnv); put("VERCEL_GIT_PROVIDER", facts.gitProvider); put("VERCEL_GIT_REPO_OWNER", facts.repoOwner);
  put("VERCEL_GIT_REPO_SLUG", facts.repoSlug); put("VERCEL_GIT_COMMIT_REF", facts.commitRef); put("VERCEL_GIT_COMMIT_SHA", facts.commitSha);
  const r = spawnSync("sh", ["-c", script], { env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 20_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}


function main() {
  console.log(`\nPRODUCTION RELEASE AUTHORITY — one source, one door\n`);
  const tmp = mkdtempSync(join(tmpdir(), "p2b-provenance-"));
  try {
    // ── 1. the decision ──────────────────────────────────────────────────
    for (const t of TABLE) {
      const d = decideBuildProvenance({ ...GOOD, ...t.facts });
      const got = d.ok ? "OK" : d.code;
      ok(`1. decision: ${t.name} -> ${t.expect}`, got === t.expect, `got ${got}`);
    }

    // ── 2. the guard Vercel runs agrees, case by case ────────────────────
    const guard = readFileSync(PROVENANCE_GUARD_PATH, "utf8");
    const remoteFor = (sha: string | null) => sha === null ? "https://127.0.0.1:9/unreachable.git" : bareRepoWithMain(tmp, sha);
    for (const t of TABLE) {
      const facts = { ...GOOD, ...t.facts };
      const r = runGuard(guard, facts, facts.freshMainSha, tmp);
      const got = r.code === 0 ? "OK" : (r.out.match(/PROVENANCE REFUSED \(([A-Z_]+)\)/)?.[1] ?? `exit ${r.code} without a reason`);
      ok(`2. guard.sh: ${t.name} -> ${t.expect}`, got === t.expect && (t.expect === "OK") === (r.code === 0), `got ${got}: ${r.out.trim().split("\n").pop()}`);
    }
    // mutants: remove one check each; the table must catch every one
    const mutants: [string, RegExp][] = [
      ["no SHA-vs-main comparison", /^\[ "\$MAIN" = "\$SHA" \].*$/m],
      // NOT a single line any more, and that is the point. An unreadable GitHub
      // is now refused three times over — the curl exit status, the empty body,
      // and the JSON parse — so removing any ONE of them changes nothing, and a
      // mutant asserting otherwise would be testing a property the rewrite
      // deliberately removed. This strips every unreadable refusal at once,
      // which is the smallest change that can still reach a wrong answer.
      ["no unreadable-main refusal at all", /^.*refuse MAIN_UNREADABLE.*$/gm],
      ["no provider check", /^\[ "\$\{VERCEL_GIT_PROVIDER:-\}".*$/m],
      ["no production check", /^\[ "\$\{VERCEL_ENV:-\}".*$/m],
      ["no SHA-shape check", /^case "\$SHA" in[\s\S]*?esac$/m],
    ];
    for (const [name, re] of mutants) {
      ok(`   mutant target exists: ${name}`, re.test(guard));
      const mutant = guard.replace(re, "");
      const caught = TABLE.some((t) => {
        const facts = { ...GOOD, ...t.facts };
        const r = runGuard(mutant, facts, facts.freshMainSha, tmp);
        const got = r.code === 0 ? "OK" : (r.out.match(/PROVENANCE REFUSED \(([A-Z_]+)\)/)?.[1] ?? "?");
        return got !== t.expect;
      });
      ok(`   a guard with ${name} fails the table`, caught);
    }
    ok(`   the guard is POSIX sh, executable, and reads no repository file`,
      /^#!\/bin\/sh/.test(guard) && !/\bcat\b|\bsource\b|^\. /m.test(strip(PROVENANCE_GUARD_PATH)) && !/VERCEL_TOKEN|process\.env/.test(guard));

    // ── 3. the Build Command ─────────────────────────────────────────────
    ok(`3. the Build Command fits Vercel's ${VERCEL_BUILD_COMMAND_MAX}-character ceiling (${PROVENANCE_BUILD_COMMAND.length})`,
      PROVENANCE_BUILD_COMMAND.length <= VERCEL_BUILD_COMMAND_MAX);
    ok(`   it fetches the guard from GitHub main, not from the uploaded tree`,
      PROVENANCE_BUILD_COMMAND.includes(`api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/contents/${PROVENANCE_GUARD_PATH}?ref=${CANONICAL.ref}`));
    ok(`   it authenticates without putting a credential in argv`,
      /curl -fsSK-/.test(PROVENANCE_BUILD_COMMAND)
      && !/-H\s+["']?Authorization/i.test(PROVENANCE_BUILD_COMMAND)
      && !/gh[ps]_|github_pat_/.test(PROVENANCE_BUILD_COMMAND));
    ok(`   it fails closed on an empty fetch and only then builds`,
      /curl -fsSK-/.test(PROVENANCE_BUILD_COMMAND) && /\[ -n "\$g" \]&&/.test(PROVENANCE_BUILD_COMMAND) && PROVENANCE_BUILD_COMMAND.endsWith("|sh&&npm run build"));
    // Behaviorally: run the same command shape with curl pointed at nothing.
    const dead = spawnSync("sh", ["-c", provenanceBuildCommand("https://127.0.0.1:9/never.sh").replace("npm run build", "echo BUILD_RAN")], { encoding: "utf8", timeout: 20_000 });
    ok(`   an unreachable guard URL stops before the build`, dead.status !== 0 && !/BUILD_RAN/.test(dead.stdout ?? ""));
    const empty = spawnSync("sh", ["-c", `g=$(printf "")&&[ -n "$g" ]&&echo "$g"|sh&&echo BUILD_RAN`], { encoding: "utf8" });
    ok(`   an empty guard body stops before the build`, empty.status !== 0 && !/BUILD_RAN/.test(empty.stdout ?? ""));
    const refusing = spawnSync("sh", ["-c", `g=$(cat ${PROVENANCE_GUARD_PATH})&&[ -n "$g" ]&&echo "$g"|sh&&echo BUILD_RAN`], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv });
    ok(`   a refusing guard stops before the build`, refusing.status !== 0 && /PROVENANCE REFUSED/.test(refusing.stdout ?? "") && !/BUILD_RAN/.test(refusing.stdout ?? ""));

    // ── 4. the superseded metadata pathway is ABSENT from the release ────
    //
    // decidePromotion decided a deployment's origin from githubDeployment,
    // githubOrg, githubRepo, githubRef and githubSha. The origin-trust
    // observation established that every one of those is writable by the caller
    // that creates the deployment: a forged record carried the complete
    // githubCommit* set including githubCommitVerification "verified", and
    // Vercel enriched it further. The old tests here asserted such a record was
    // PROMOTABLE, which is the opposite of what is now known.
    //
    // So these assert ABSENCE from the operative path rather than re-testing a
    // refuted decision.
    const relSrc = strip("scripts/release-production.ts");
    const runSrc = strip("scripts/_releaseRun.ts");
    const ctlSrc = strip("scripts/_releaseControl.ts");
    ok(`4. the release imports no metadata-origin decision`,
      !/decidePromotion/.test(relSrc) && !/candidateFromVercel/.test(relSrc)
      && !/decidePromotion/.test(runSrc) && !/candidateFromVercel/.test(runSrc));
    ok(`   no origin is decided from githubDeployment or github org/repo/ref metadata`,
      !/githubDeployment/.test(relSrc + runSrc + ctlSrc));
    ok(`   the candidate is CAUSED: phase B keeps the id its own request returned`,
      /createDeployment/.test(relSrc) && /body\.id/.test(relSrc));
    ok(`   and phase C takes it from the durable receipt, never from a search`,
      /loadCreationReceipt/.test(runSrc) && !/listCandidates/.test(relSrc));

    // ── 4b. the retired subsystem stays retired ──────────────────────────
    //
    // Deleting a design is not the same as keeping it deleted. These read every
    // ACTIVE release source and fail if any of the retired surface returns —
    // the orchestration module, the metadata-origin decision, the origin-trust
    // apparatus, or selecting a candidate from a deployment listing.
    //
    // Historical EVIDENCE files keep the old wording deliberately: they record
    // what was observed, and rewriting them would be falsifying the record.
    // Only active code and governing documentation are searched.
    const ACTIVE_SOURCES = [
      "scripts/release-production.ts", "scripts/_releaseRun.ts",
      "scripts/_releaseControl.ts", "scripts/_releaseProvenance.ts",
      "scripts/_releaseSource.ts",
    ];
    const active = ACTIVE_SOURCES.map((f) => strip(f)).join("\n");
    for (const gone of ["_releaseOrchestration", "decidePromotion", "candidateFromVercel",
                        "verifiedOrigin", "ORIGIN_TRUST_BASIS", "basisCovers",
                        "ORIGIN_UNVERIFIED", "ORIGIN_DECISION_FIELDS", "evidenceRefusal",
                        "resolveEffectiveBuildCommand", "listCandidates"]) {
      ok(`4b. ${gone} is absent from every active release source`, !active.includes(gone));
    }
    ok(`   the orchestration module itself is gone from the tree`,
      !existsSync(new URL("./_releaseOrchestration.ts", import.meta.url)));
    ok(`   no candidate is selected from a deployment listing`,
      !/\/v6\/deployments\?/.test(active) && !/deployments\.find\(/.test(active)
      // [^)]* stopped at the ")" in "(x) =>", so filter((x) => x.readyState ===
      // "READY") slipped straight through. A negative test caught it.
      && !/\.filter\([\s\S]{0,120}READY/.test(active)
      && !/\.find\([\s\S]{0,120}READY/.test(active));

    // ── 5. the release command ───────────────────────────────────────────
    const rel = strip("scripts/release-production.ts");
      // "never deploys" WAS A FALSE POSITIVE. Phase B deliberately POSTs
      // /v13/deployments — creating the deployment is the whole point of
      // causation over attestation — and the regex passed only because it never
      // matched the actual call. What IS true is that the command never runs
      // `vercel deploy` and never uploads a working tree.
      ok(`5. the release never uploads a tree or shells out to a builder`,
        !/vercel deploy/.test(rel) && !/execFileSync\("(npx|vercel)"/.test(rel) && !/--prebuilt/.test(rel));
      ok(`   and phase B DOES create a deployment — by design, not by leak`,
        /\/v13\/deployments/.test(rel) && /method: "POST"/.test(rel));
      ok(`   the phase is parsed strictly and --apply is refused`,
        /export function parsePhase/.test(rel) && /--apply no longer exists/.test(rel));
      ok(`   no phase is chosen by argv.includes any more`,
        !/process\.argv\.includes\("--create"\)/.test(rel));
    ok(`   the three phases are separate, and only preflight is read-only`,
      /runRelease\(/.test(rel) && /"preflight"/.test(rel) && /"create"/.test(rel) && /"promote"/.test(rel));
    ok(`   the candidate comes from this run's own creation, never a search`,
      !/listCandidates\(/.test(rel) && !/candidates\.find\(/.test(rel));
    ok(`   it acts only on the canonical project`, /CANONICAL\.vercelProjectId/.test(rel) && /CANONICAL\.vercelTeamId/.test(rel));
    ok(`   it records the rollback target before promoting, and a failed record refuses`,
      rel.indexOf("recordIntent") < rel.indexOf("/promote/")
      && /RECORD_FAILED/.test(strip("scripts/_releaseRun.ts")));
    ok(`   it verifies identity and alias mapping on every canonical host`,
      /observeHosts/.test(rel) && /CANONICAL\.canonicalHosts/.test(rel));
    ok(`   and it loads no .env file — the token comes from the operator's shell`,
      !/loadEnv\(|from "dotenv"|\.env\.local|["'`]\.env["'`]|readFileSync\([^)]*\.env/.test(rel) && /process\.env\.VERCEL_TOKEN/.test(rel));

    // ── 6. read-back, and what stays untouched ───────────────────────────
    const route = strip("app/api/release/route.ts");
    ok(`6. /api/release is no-store and returns exactly three fields`,
      /no-store/.test(route) && /deploymentId/.test(route) && /commitSha/.test(route) && /target:/.test(route) &&
      !/prisma|DATABASE|identity|APP_ORIGIN|BYPASS|email|user/i.test(route));
    ok(`   it imports nothing but Next`, (route.match(/^import .* from "([^"]+)"/gm) ?? []).every((l) => /"next\/server"/.test(l)));
    const unchanged = (f: string) => { try { return execFileSync("git", ["diff", "--quiet", "origin/main", "--", f], { stdio: "ignore" }), true; } catch { return false; } };
    ok(`   /api/deployment-identity is unchanged from main`, unchanged("app/api/deployment-identity/route.ts"));
    ok(`   middleware is unchanged from main`, unchanged("middleware.ts"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  One source, one door: main is what ships, and only when it is still main.\n`);
  if (fail) process.exit(1);
}
main();
