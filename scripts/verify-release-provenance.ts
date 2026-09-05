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
import { join, resolve } from "node:path";
import * as ts from "typescript";
import { createHash } from "node:crypto";
import {
  CANONICAL, decideBuildProvenance,
  provenanceBuildCommand, PROVENANCE_BUILD_COMMAND, PROVENANCE_GUARD_PATH, VERCEL_BUILD_COMMAND_MAX, GUARD_DIGEST,
  type BuildFacts,
} from "./_releaseProvenance";

let fail = 0;
let pass = 0;
const ok = (l: string, c: boolean, d?: string) => { if (c) pass++; else fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
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
    ok(`   it fetches the guard from GitHub ${CANONICAL.ref}, not from the uploaded tree`,
      PROVENANCE_BUILD_COMMAND.includes(
        `raw.githubusercontent.com/${CANONICAL.owner}/${CANONICAL.repo}/${CANONICAL.ref}/${PROVENANCE_GUARD_PATH}`));
    ok(`   and it asks for the FILE, not the Contents API's JSON description of it`,
      !/api\.github\.com\/repos\/[^"']*\/contents\//.test(PROVENANCE_BUILD_COMMAND));
    // NO CREDENTIAL AT ALL, AND THE BYTES ARE PINNED.
    //
    // A header file stopped injected curl DIRECTIVES but not injected HTTP
    // HEADERS: a token carrying a newline could add `Range: bytes=…`, and a
    // range request succeeds with 206 and only the requested bytes — piping a
    // FRAGMENT of the guard into sh, which can omit the checks while still
    // looking like a guard. The repository is public and the guard does its own
    // authenticated read, so the bootstrap needs no credential and now sends
    // none. There is nothing left to inject into.
    ok(`   the bootstrap sends no credential and no headers at all`,
      !/P2B_GH|Authorization|-H |-K/.test(PROVENANCE_BUILD_COMMAND));
    ok(`   and it verifies the guard's BYTES before executing them`,
      /shasum -a 256/.test(PROVENANCE_BUILD_COMMAND)
      && PROVENANCE_BUILD_COMMAND.includes(GUARD_DIGEST)
      && GUARD_DIGEST.length === 32);
    // DERIVED, NOT TYPED IN. This is not a tautology about two identical
    // expressions: it fails if GUARD_DIGEST is ever replaced by a hex literal or
    // computed from some other file, which is how a pin quietly stops tracking
    // the thing it pins.
    ok(`   the digest is computed from the guard file, not hand-written`,
      GUARD_DIGEST === createHash("sha256").update(readFileSync(PROVENANCE_GUARD_PATH)).digest("hex").slice(0, 32)
      && !/GUARD_DIGEST\s*=\s*["'`][0-9a-f]{8}/.test(readFileSync("scripts/_releaseProvenance.ts", "utf8")));

    // Behaviorally: serve BYTES THAT ARE NOT THE GUARD and prove they never run.
    // The positive control re-runs the identical command against the identical
    // bytes with only the pinned digest changed — so a refusal in the first case
    // is attributable to the digest and to nothing else.
    {
      const tamperedPath = join(mkdtempSync(join(tmpdir(), "p2b-digest-")), "tampered.sh");
      writeFileSync(tamperedPath, "echo TAMPERED_RAN\n");
      const tamperedDigest = createHash("sha256").update(readFileSync(tamperedPath)).digest("hex").slice(0, 32);
      const sandbox = mkdtempSync(join(tmpdir(), "p2b-bootstrap-"));
      const run = (digest: string) => spawnSync("sh", ["-c",
        provenanceBuildCommand(`file://${tamperedPath}`, digest).replace("npm run build", "echo BUILD_RAN")],
        { encoding: "utf8", timeout: 20_000, cwd: sandbox });
      const pinned = run(GUARD_DIGEST);
      ok(`   bytes that do not match the pinned digest are never executed`,
        pinned.status !== 0
        && !/TAMPERED_RAN/.test(pinned.stdout ?? "")
        && !/BUILD_RAN/.test(pinned.stdout ?? ""));
      const control = run(tamperedDigest);
      ok(`   and the same bytes DO run once the digest names them (control)`,
        control.status === 0
        && /TAMPERED_RAN/.test(control.stdout ?? "")
        && /BUILD_RAN/.test(control.stdout ?? ""));
      ok(`   the two runs differed only in the pinned digest`,
        GUARD_DIGEST !== tamperedDigest);
    }
    ok(`   it fails closed and only then builds`,
      /curl -fsS/.test(PROVENANCE_BUILD_COMMAND)
      && PROVENANCE_BUILD_COMMAND.endsWith("]&&sh .p2bguard&&npm run build"));

    // ── 3. the Build Command ─────────────────────────────────────────────
    ok(`3. the Build Command fits Vercel's ${VERCEL_BUILD_COMMAND_MAX}-character ceiling (${PROVENANCE_BUILD_COMMAND.length})`,
      PROVENANCE_BUILD_COMMAND.length <= VERCEL_BUILD_COMMAND_MAX);
    ok(`   it fetches the guard from GitHub ${CANONICAL.ref}, not from the uploaded tree`,
      PROVENANCE_BUILD_COMMAND.includes(
        `raw.githubusercontent.com/${CANONICAL.owner}/${CANONICAL.repo}/${CANONICAL.ref}/${PROVENANCE_GUARD_PATH}`));
    ok(`   and it asks for the FILE, not the Contents API's JSON description of it`,
      !/api\.github\.com\/repos\/[^"']*\/contents\//.test(PROVENANCE_BUILD_COMMAND));
    // Behaviorally: the bootstrap must refuse to execute bytes it cannot
    // verify, and must stop before the build when it cannot fetch them.
    const probeDir = mkdtempSync(join(tmpdir(), "p2b-probe-"));
    const dead = spawnSync("sh", ["-c", provenanceBuildCommand("https://127.0.0.1:9/never.sh").replace("npm run build", "echo BUILD_RAN")], { encoding: "utf8", timeout: 20_000, cwd: probeDir });
    ok(`   an unreachable guard URL stops before the build`, dead.status !== 0 && !/BUILD_RAN/.test(dead.stdout ?? ""));
    ok(`   and it leaves no guard file behind to be executed later`,
      !existsSync(join(probeDir, ".p2bguard")));
    const emptyPath = join(probeDir, "empty.sh");
    writeFileSync(emptyPath, "");
    const empty = spawnSync("sh", ["-c", provenanceBuildCommand(`file://${emptyPath}`).replace("npm run build", "echo BUILD_RAN")], { encoding: "utf8", timeout: 20_000, cwd: probeDir });
    ok(`   an empty guard body stops before the build`, empty.status !== 0 && !/BUILD_RAN/.test(empty.stdout ?? ""));
    // The REAL guard, fetched and digest-checked exactly as a build would do it,
    // then refusing on its own terms. This is also the end-to-end proof that the
    // pinned digest MATCHES the guard in the tree: a mismatch stops before `sh`
    // and no refusal would be printed at all.
    const refusing = spawnSync("sh", ["-c", provenanceBuildCommand(`file://${resolve(PROVENANCE_GUARD_PATH)}`).replace("npm run build", "echo BUILD_RAN")], { encoding: "utf8", timeout: 20_000, cwd: probeDir, env: { PATH: process.env.PATH ?? "", VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv });
    ok(`   the pinned digest ACCEPTS the guard in the tree, which then refuses on its own terms`,
      refusing.status !== 0 && /PROVENANCE REFUSED/.test(refusing.stdout ?? "") && !/BUILD_RAN/.test(refusing.stdout ?? ""));

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

    // ── 4c. the review findings stay fixed ───────────────────────────────
    const provSrc = strip("scripts/verify-release-provenance.ts");
    const guardSrc = strip("scripts/provenance-guard.sh");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as
      { scripts: Record<string, string> };

    // F1 — nothing this BUILD runs may depend on git metadata. A Vercel build
    // container has no origin/main ref, and the old helper returned false on
    // any throw, so "could not look" was indistinguishable from "changed".
    // Narrowed deliberately. One fixture still runs `git init --bare` on a
    // TEMPORARY repository it creates and deletes; that needs the git binary but
    // no repository metadata, and it works in any container that has git. What
    // must never come back is a dependency on THIS checkout's refs — origin/main
    // does not exist in a build, and the old helper read its absence as "changed".
    ok(`4c. the build-running verifier depends on no repository metadata`,
      !/git["'\`\s,\]]*diff/.test(provSrc) && !/origin\/main/.test(provSrc));

    // F4 — the build command must not interpolate a curl CONFIG fragment.
    ok(`   the build command carries no curl-config environment fragment`,
      !/P2B_GH_HDR/.test(relSrc) && !/P2B_GH_HDR/.test(strip("scripts/_releaseProvenance.ts")));
    ok(`   and the guard pins its endpoint in production`,
      /VERCEL_ENV:-\}" = "production"/.test(guardSrc) && /OVERRIDE_IN_PRODUCTION/.test(guardSrc));
    ok(`   and refuses a credential that could break out of the config line`,
      /MALFORMED_CREDENTIAL/.test(guardSrc));

    // F6 — the 180-case suite is actually gated on.
    ok(`   verify-release-control.ts is in the verification chain`,
      /verify-release-control\.ts/.test(pkg.scripts.verify ?? ""));

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
    // THESE WERE `git diff --quiet origin/main`, AND THEY DO NOT BELONG IN A BUILD.
    //
    // package.json runs this suite inside `npm run build`. A Vercel build
    // container has no origin/main ref — often no .git at all — and the helper
    // returned FALSE on any throw, so "I could not look" was indistinguishable
    // from "it changed" and the production build could not complete.
    //
    // Skipping them would have been worse: green without the guarantee. They
    // were review-time provenance comparisons, so what a BUILD can check is the
    // property each file must hold, deterministically and without git.
    const identity = strip("app/api/deployment-identity/route.ts");
    ok(`   /api/deployment-identity is force-dynamic, never statically evaluated`,
      /export const dynamic = "force-dynamic"/.test(identity));
    ok(`   and it is protected by the automation bypass secret`,
      /VERCEL_AUTOMATION_BYPASS_SECRET/.test(identity) && /x-vercel-protection-bypass/.test(identity));
    // PARSED, NOT PATTERN-MATCHED.
    //
    // Two earlier versions of this check were defeated by ordinary TypeScript.
    // A regex over the file passed
    //   connectionString: process.env.DATABASE_URL ?? ""
    // and a key-allowlist that scanned for `name:` passed
    //   const connectionString = process.env.DATABASE_URL ?? "";
    //   return NextResponse.json({ connectionString, ...rest });
    // because a SHORTHAND property has no colon and the secret was read above
    // the payload. Spread properties hide arbitrary keys the same way.
    //
    // So the file is parsed with the TypeScript compiler and the response object
    // is walked as a tree. Shorthand, spread and computed keys are all visible to
    // an AST and none of them can be spelled around.
    const src = ts.createSourceFile("route.ts",
      readFileSync(new URL("../app/api/deployment-identity/route.ts", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest, true);

    // WHAT EVERY LEAF OF THE RESPONSE IS ALLOWED TO BE, character for character.
    //
    // The names were allow-listed; the VALUES were not, which is the gap that let
    // `key: (key)` through. Reviewing a payload means reviewing what it computes,
    // so each leaf is recorded here as the exact normalized source that was read.
    // Adding a field, or changing how one is derived, fails until it is read again.
    const VALUES: Record<string, string> = {
      "error": '"Not found"',
      "deployment.vercelEnv": "process.env.VERCEL_ENV ?? null",
      "deployment.productionUrl": "process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null",
      "deployment.branchUrl": "process.env.VERCEL_BRANCH_URL ?? null",
      "deployment.deploymentUrl": "process.env.VERCEL_URL ?? null",
      "deployment.writeFreeze": "process.env.WRITE_FREEZE ?? null",
      "database.host": "dbHost",
      "database.identity": "identity",
      "database.expectedIdentity": "process.env.EXPECTED_DATABASE_IDENTITY ?? null",
      "database.matches": "identity && process.env.EXPECTED_DATABASE_IDENTITY ? identity.key === process.env.EXPECTED_DATABASE_IDENTITY : null",
      "destinations.authBaseUrl": "authBase",
      "destinations.appOrigin": "process.env.APP_ORIGIN ?? null",
      "destinations.storefrontOrigin": "process.env.STOREFRONT_ORIGIN ?? null",
      "destinations.platformOrigin": "process.env.PLATFORM_WEB_ORIGIN ?? null",
      "destinations.legacySiteUrl": "process.env.NEXT_PUBLIC_SITE_URL ?? null",
      "destinations.jobberCallback": "(() => { try { return jobberRedirectUri(); } catch (e) { return `ERROR: ${(e as Error).message}`; } })()",
      "configured.betterAuthSecret": "!!process.env.BETTER_AUTH_SECRET",
      "configured.platformResend": "!!process.env.PLATFORM_RESEND_API_KEY",
      "configured.transactionalResend": "!!process.env.RESEND_API_KEY",
      "configured.jobber": "!!process.env.JOBBER_CLIENT_ID && !!process.env.JOBBER_CLIENT_SECRET",
      "configured.r2": "!!process.env.R2_ACCOUNT_ID && !!process.env.R2_BUCKET_NAME",
      "configured.stripeLegacy": "!!process.env.STRIPE_SECRET_KEY || !!process.env.STRIPE_PUBLISHABLE_KEY",
    };

    const ALLOWED = new Set([
      "deployment", "vercelEnv", "productionUrl", "branchUrl", "deploymentUrl", "writeFreeze",
      "database", "host", "identity", "expectedIdentity", "matches",
      "destinations", "authBaseUrl", "appOrigin", "jobberRedirectUri", "resendFrom", "stripeMode",
      "storefrontOrigin", "platformOrigin", "legacySiteUrl", "jobberCallback",
      "configured", "betterAuthSecret", "platformResend", "transactionalResend",
      "jobber", "r2", "stripeLegacy",
      "key", "neonProject", "neonEndpoint", "stampedAt",
      "error",
    ]);

    // EVERY NextResponse.json CALL, NOT THE LAST ONE THAT HAPPENED TO PARSE.
    //
    // Selecting the last call whose first argument is an object literal meant a
    // payload rewritten as `NextResponse.json(body)` was not examined at all —
    // the check silently fell back to the 404 branch above it and passed.
    const jsonCalls: ts.CallExpression[] = [];
    const findCalls = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && n.expression.getText(src) === "NextResponse.json") jsonCalls.push(n);
      n.forEachChild(findCalls);
    };
    findCalls(src);
    ok(`   every NextResponse.json call in the route is examined (${jsonCalls.length} found)`,
      jsonCalls.length >= 2);

    // AND NOTHING ELSE MAY BUILD A RESPONSE. Counting NextResponse.json calls
    // says nothing about a fourth return that goes around them — an alias
    // (`const R = NextResponse; R.json(secret)`), a bare `Response`, or a
    // NextResponse constructed some other way. So every return in the exported
    // handler must BE one of the calls above.
    const handler = src.statements.find(
      (st): st is ts.FunctionDeclaration => ts.isFunctionDeclaration(st) && st.name?.getText(src) === "GET");
    const returns: ts.ReturnStatement[] = [];
    const findReturns = (n: ts.Node): void => {
      if (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) return;  // IIFEs compute values, not responses
      if (ts.isReturnStatement(n)) returns.push(n);
      n.forEachChild(findReturns);
    };
    if (handler?.body) findReturns(handler.body);
    const foreign = returns
      .filter((r) => !(r.expression && ts.isCallExpression(r.expression) && jsonCalls.includes(r.expression)))
      .map((r) => r.getText(src).replace(/\s+/g, " ").slice(0, 50));
    ok(`   and every return in GET is one of them (${returns.length} returns)`,
      handler !== undefined && returns.length >= 2 && foreign.length === 0,
      handler ? foreign.join(" | ") : "no GET handler found");

    // The object must be written AT THE CALL. A variable argument moves the
    // payload out of reach of everything below.
    const indirect = jsonCalls
      .filter((c) => c.arguments.length === 0 || !ts.isObjectLiteralExpression(c.arguments[0]))
      .map((c) => c.getText(src).replace(/\s+/g, " ").slice(0, 60));
    ok(`   and each hands back an object literal written inline, never a variable`,
      indirect.length === 0, indirect.join(" | "));

    // THE WHOLE CALL SIGNATURE, NOT ARGUMENT ZERO.
    //
    // Only the payload was inspected, so a second argument was free to carry
    // anything: `{ headers: { "x-debug-token": process.env.VERCEL_TOKEN } }`
    // leaves the payload spotless and ships the secret in a response header.
    // ResponseInit is where status, headers and cookies live — all of it visible
    // to a caller. So the approved shapes are enumerated and everything else is
    // refused: the 404 branch takes `{ status: 404 }`, the payload takes nothing.
    const NOT_FOUND_PAYLOAD = '{ error: "Not found" }';
    const badSignature = jsonCalls.map((c) => {
      const first = c.arguments[0]?.getText(src).replace(/\s+/g, " ").trim() ?? "";
      const rest = c.arguments.slice(1).map((x) => x.getText(src).replace(/\s+/g, " ").trim());
      if (first === NOT_FOUND_PAYLOAD) {
        return rest.length === 1 && rest[0] === "{ status: 404 }"
          ? "" : `404 branch takes (payload, { status: 404 }), got [${rest.join(", ")}]`;
      }
      return rest.length === 0 ? "" : `payload call takes ONE argument, got a second: ${rest[0].slice(0, 50)}`;
    }).filter((x) => x !== "");
    ok(`   and no call carries a ResponseInit beyond the approved \`{ status: 404 }\``,
      badSignature.length === 0, badSignature.join(" | "));

    // ONLY `name: value`. EVERY OTHER PROPERTY FORM IS REFUSED BY NAME.
    //
    // Shorthand was collected and then never asserted on, so `{ key }` with
    // `const key = process.env.VERCEL_TOKEN ?? ""` above it passed: the name is
    // allow-listed and the secret is nowhere in the literal's text. A getter was
    // not even collected — it matched none of the three branches and was skipped
    // in silence. Rather than teach the walker every form, the walker now
    // REFUSES every form it cannot evaluate, and the route is written to suit.
    const keys: string[] = [];
    const badForms: string[] = [];
    const identifierValues: string[] = [];
    const valuePaths: string[] = [];
    const unpinnedValues: string[] = [];
    const driftedValues: string[] = [];
    const walk = (o: ts.ObjectLiteralExpression, prefix: string): void => {
      for (const prop of o.properties) {
        if (!ts.isPropertyAssignment(prop)) {
          badForms.push(`${ts.SyntaxKind[prop.kind]} ${prop.getText(src).replace(/\s+/g, " ").slice(0, 40)}`);
          continue;
        }
        if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) {
          badForms.push(`computed key ${prop.name.getText(src).slice(0, 40)}`);
          continue;
        }
        const name = prop.name.getText(src).replace(/["']/g, "");
        const path = prefix ? `${prefix}.${name}` : name;
        keys.push(name);
        const v = prop.initializer;
        if (ts.isObjectLiteralExpression(v)) { walk(v, path); continue; }
        // EVERY OTHER VALUE IS PINNED BY ITS SOURCE TEXT.
        //
        // Tracing only bare identifiers left every wrapper unevaluated:
        // `key: (key)` is a ParenthesizedExpression and never entered the
        // identifier set, and neither did `key as string`, `readSecret()`,
        // `secrets.token` or `process.env["VERCEL_TOKEN"]`. There is no end to
        // the list of forms, so the check stopped enumerating forms and pinned
        // the TEXT instead: anything that is not the exact normalized source
        // text that was reviewed is refused, whatever shape it takes. Normalized
        // means runs of whitespace collapsed to one space and the ends trimmed,
        // so reformatting is tolerated and every other edit is not.
        const text = v.getText(src).replace(/\s+/g, " ").trim();
        valuePaths.push(path);
        if (!(path in VALUES)) unpinnedValues.push(`${path} = ${text.slice(0, 60)}`);
        else if (VALUES[path] !== text) driftedValues.push(`${path} = ${text.slice(0, 60)}`);
        if (ts.isIdentifier(v)) identifierValues.push(text);
      }
    };
    const payloadLiterals = jsonCalls
      .map((c) => c.arguments[0])
      .filter((a): a is ts.ObjectLiteralExpression => a !== undefined && ts.isObjectLiteralExpression(a));
    for (const o of payloadLiterals) walk(o, "");
    const payloadText = payloadLiterals.map((o) => o.getText(src)).join("\n");

    ok(`   every property is a plain \`name: value\` pair`,
      badForms.length === 0 && keys.length > 5,
      badForms.length ? badForms.join(" | ") : `only ${keys.length} keys read`);

    ok(`   every value is the exact normalized source text that was reviewed (${valuePaths.length} leaves)`,
      unpinnedValues.length === 0 && driftedValues.length === 0,
      [...unpinnedValues.map((x) => `NOT PINNED ${x}`), ...driftedValues.map((x) => `CHANGED ${x}`)].join(" | "));
    const missing = Object.keys(VALUES).filter((k) => !valuePaths.includes(k));
    ok(`   and every pinned leaf is still present, under the same path`,
      missing.length === 0, missing.join(", "));

    const unexpected = keys.filter((k) => !ALLOWED.has(k));
    ok(`   and only allow-listed keys are returned (${keys.length} read, AST)`,
      unexpected.length === 0, unexpected.join(", "));

    // AN IDENTIFIER AS A VALUE CARRIES ITS MEANING FROM SOMEWHERE ELSE, so
    // allow-listing its NAME proves nothing: `key: alias` reads the same whether
    // alias is a row field or a token. Each one is resolved to every initializer
    // and assignment it has in the file, and pinned. Changing how one of these is
    // computed is a deliberate act that has to come back through here.
    const originOf = (name: string): string => {
      const parts: string[] = [];
      const visit = (n: ts.Node): void => {
        if (ts.isVariableDeclaration(n) && n.name.getText(src) === name && n.initializer)
          parts.push(n.initializer.getText(src));
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && n.left.getText(src) === name)
          parts.push(n.right.getText(src));
        n.forEachChild(visit);
      };
      visit(src);
      return parts.join(" ;; ").replace(/\s+/g, " ").trim();
    };
    const PINNED: Record<string, string> = {
      dbHost: 'null ;; new URL(process.env.DATABASE_URL ?? "").host || null ;; null',
      identity: "null ;; row ? { key: row.key, neonProject: row.neonProject, neonEndpoint: row.neonEndpoint, stampedAt: row.stampedAt.toISOString() } : null ;; null",
      authBase: 'process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)',
    };
    const unpinned = [...new Set(identifierValues)].filter((n) => !(n in PINNED));
    ok(`   and every identifier used as a value is one this check has pinned`,
      unpinned.length === 0, unpinned.join(", "));
    const drifted = [...new Set(identifierValues)]
      .filter((n) => n in PINNED && originOf(n) !== PINNED[n]);
    ok(`   and none of them has changed how it is computed`,
      drifted.length === 0, drifted.map((n) => `${n} -> ${originOf(n).slice(0, 70)}`).join(" | "));

    // The connection string must not be in the payload, nor reach it by alias.
    const reachable = payloadText + "\n"
      + [...new Set(identifierValues)].filter((n) => n in PINNED).map(originOf).join("\n");
    ok(`   and the connection string never appears in the payload`,
      !/DATABASE_URL/.test(payloadText));

    // `.host` is the whole point of dbHost, so DATABASE_URL is expected in its
    // origin — a secret-SHAPED variable read for its value is not.
    const bare = [...reachable.matchAll(/(!!\s*)?process\.env\.([A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*)/g)]
      .filter((m) => !m[1]).map((m) => m[2]);
    ok(`   and every secret-shaped variable is reported as presence, never value`,
      bare.length === 0, bare.join(", "));

    const mw = strip("middleware.ts");
    ok(`   middleware lets read-only methods through before any freeze response`,
      /READ_ONLY\.has\(req\.method\)/.test(mw) && mw.indexOf("READ_ONLY.has(req.method)") < mw.indexOf("WRITE_FROZEN"));
    ok(`   so a write freeze cannot make the release surface unreadable`,
      /NextResponse\.next\(\)/.test(mw) && /WRITE_FROZEN/.test(mw));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.` : `  One source, one door: main is what ships, and only when it is still main.`);
  // A MACHINE-READABLE LAST LINE, ALWAYS. The mutation sweep treats a missing
  // summary as a broken harness rather than a clean run, which only works if
  // this suite prints one on the way out of BOTH paths.
  console.log(`  ${pass} passed, ${fail} failed.\n`);
  if (fail) process.exit(1);
}
main();
