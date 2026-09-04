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
import { CANONICAL, PROVENANCE_BUILD_COMMAND, VERCEL_BUILD_COMMAND_MAX, type Candidate } from "./_releaseProvenance";
import {
  parseCurrentProduction, verifiedOrigin, evidenceRefusal, resolveEffectiveBuildCommand,
  basisCovers, ORIGIN_TRUST_BASIS, ORIGIN_DECISION_FIELDS,
  type BuildEvidence, type OriginTrustBasis,
} from "./_releaseSource";
import { validateRelease, applyRelease, type ReleaseEffects, type ReleasePlan } from "./_releaseOrchestration";
import { freshMainSha, vercelJsonBuildCommand } from "./release-production";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const MAIN = "a".repeat(40), OTHER = "b".repeat(40);
const CAND = "dpl_candidate";

/** A basis that is complete — dated, and covering every decision field. */
const OBSERVED: OriginTrustBasis = {
  state: "OBSERVED", observedOn: "2026-09-04",
  trustedFields: [...ORIGIN_DECISION_FIELDS],
  note: "test fixture — not a real observation",
};

const candidate: Candidate = {
  id: CAND, url: "x.vercel.app", readyState: "READY", target: "production",
  projectId: CANONICAL.vercelProjectId, githubDeployment: false,
  githubOrg: undefined, githubRepo: undefined, githubRef: undefined, githubSha: undefined,
  clientSha: undefined, createdAt: 1,
};

const GOOD_RECORD = {
  uid: CAND, projectId: CANONICAL.vercelProjectId, target: "production", readyState: "READY",
  source: "git",
  gitSource: { type: "github", org: CANONICAL.owner, repo: CANONICAL.repo, ref: "main", sha: MAIN },
};
const GOOD_CURRENT = { uid: "dpl_live", readyState: "READY", alias: [...CANONICAL.canonicalHosts] };
const GOOD_EVIDENCE: BuildEvidence = {
  effectiveBuildCommand: { read: true, value: PROVENANCE_BUILD_COMMAND },
  commitVercelJsonBuildCommand: { read: true, value: null },
  guardLineSha: MAIN,
  projectBuildCommandNow: { read: true, value: PROVENANCE_BUILD_COMMAND },
};

function effects(over: Partial<ReleaseEffects> = {}) {
  const promotes: string[] = [], intents: ReleasePlan[] = [];
  const fx: ReleaseEffects = {
    readCurrentProduction: async () => ({ raw: GOOD_CURRENT }),
    readFreshMain: async () => MAIN,
    readDeployment: async () => GOOD_RECORD,
    readBuildEvidence: async () => GOOD_EVIDENCE,
    recordIntent: async (p) => { intents.push(p); },
    promoteDeployment: async (d) => { promotes.push(d); },
    recordCompletion: async () => {},
    ...over,
  };
  return { fx, promotes, intents };
}

async function refuses(over: Partial<ReleaseEffects>, code: string, label: string) {
  const { fx, promotes } = effects(over);
  const v = await validateRelease(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
  ok(!v.ok && v.code === code && promotes.length === 0, label,
    `got ${v.ok ? "OK" : v.code}, ${promotes.length} promote request(s)`);
}

/* ── 1. A valid dry run succeeds, and mutates nothing ─────────────────── */
async function dryRunCanSucceed() {
  console.log("\n  A VALID DRY RUN SUCCEEDS\n");
  // The regression: validation always called promoteDeployment, and the real
  // dry run's promote effect throws, so a valid dry run could never succeed.
  const { fx, promotes, intents } = effects({
    recordIntent: async () => { throw new Error("must not be reached in a dry run"); },
    promoteDeployment: async () => { throw new Error("must not be reached in a dry run"); },
  });
  const v = await validateRelease(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
  ok(v.ok === true, "validation succeeds without touching any write effect", v.ok ? "" : `${v.code}: ${v.detail}`);
  ok(promotes.length === 0 && intents.length === 0, "and issues zero promote and zero record calls");
  if (v.ok) ok(v.plan.replaced === "dpl_live", "and names the rollback target it would replace");
}

/* ── 2. Refusals send nothing ─────────────────────────────────────────── */
async function refusalsSendNothing() {
  console.log("\n  EVERY REFUSAL IS A NO-OP\n");
  await refuses({ readCurrentProduction: async () => ({ error: new Error("502") }) }, "CURRENT_PRODUCTION_UNREADABLE", "an unreadable current production");
  await refuses({ readCurrentProduction: async () => ({ raw: { uid: "", alias: [], readyState: "ERROR" } }) }, "CURRENT_PRODUCTION_MALFORMED", "empty id, empty aliases, ERROR state");
  await refuses({ readFreshMain: async () => null }, "MAIN_UNREADABLE", "an unreadable fresh main");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, source: undefined }) }, "ORIGIN_UNVERIFIED", "a record with NO source field");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, gitSource: { ...GOOD_RECORD.gitSource, type: "gitlab" } }) }, "ORIGIN_UNVERIFIED", "a gitlab provider");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, uid: "dpl_someone_else" }) }, "ORIGIN_UNVERIFIED", "a record for a DIFFERENT deployment id");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, projectId: "prj_other" }) }, "ORIGIN_UNVERIFIED", "a record for a different project");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, target: "preview" }) }, "ORIGIN_UNVERIFIED", "a record whose target is preview");
  await refuses({ readDeployment: async () => ({ ...GOOD_RECORD, readyState: "BUILDING" }) }, "ORIGIN_UNVERIFIED", "a record that is not READY");
  await refuses({ readDeployment: async () => ({ meta: { githubCommitSha: MAIN, githubOrg: CANONICAL.owner } }) }, "ORIGIN_UNVERIFIED", "self-asserted meta alone");
  await refuses({ readBuildEvidence: async () => null }, "BUILD_CONFIG_UNKNOWN", "no build evidence");
  await refuses({ readBuildEvidence: async () => ({ ...GOOD_EVIDENCE, commitVercelJsonBuildCommand: { read: false, why: "not read" } }) }, "BUILD_CONFIG_UNKNOWN", "vercel.json never read");
  await refuses({ readBuildEvidence: async () => ({ ...GOOD_EVIDENCE, effectiveBuildCommand: { read: true, value: "npm run build" } }) }, "BUILD_COMMAND_NOT_APPROVED", "built without the guard, log line notwithstanding");
  await refuses({ readBuildEvidence: async () => ({ ...GOOD_EVIDENCE, commitVercelJsonBuildCommand: { read: true, value: "next build" } }) }, "BUILD_COMMAND_OVERRIDDEN", "a vercel.json override at the built commit");
}

/* ── 2b. Unreadable tree evidence reaches no promotion ────────────────── */
/**
 * The finding was found at the adapter. This asserts the consequence at the
 * only level that matters: an unreadable tree must send zero promote requests.
 */
async function unreadableTreePromotesNothing() {
  console.log("\n  UNREADABLE TREE EVIDENCE PROMOTES NOTHING\n");
  const cases: [string, BuildEvidence["commitVercelJsonBuildCommand"]][] = [
    ["a truncated tree", { read: false, why: "commit tree is truncated" }],
    ["malformed tree entries", { read: false, why: "commit tree contains entries without a readable path" }],
    ["an unreachable tree", { read: false, why: "commit tree 404" }],
  ];
  for (const [label, vj] of cases) {
    const { fx, promotes, intents } = effects({
      readBuildEvidence: async () => ({ ...GOOD_EVIDENCE, commitVercelJsonBuildCommand: vj }),
    });
    const v = await validateRelease(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
    ok(!v.ok && v.code === "BUILD_CONFIG_UNKNOWN" && promotes.length === 0 && intents.length === 0,
      `${label}: refused, with zero promote and zero record calls`,
      `got ${v.ok ? "OK" : v.code}, ${promotes.length} promote(s)`);
  }
}

/* ── 3. The trust basis must be complete ──────────────────────────────── */
function basisMustBeComplete() {
  console.log("\n  THE TRUST BASIS MUST ACTUALLY SAY SOMETHING\n");
  const bare: OriginTrustBasis = { state: "OBSERVED", observedOn: null, trustedFields: [], note: "" };
  ok(!basisCovers(bare), "an OBSERVED basis with no date and no fields is not a basis");
  ok(!verifiedOrigin(GOOD_RECORD, bare).ok, "and it verifies nothing");
  const partial: OriginTrustBasis = { state: "OBSERVED", observedOn: "2026-09-04", trustedFields: ["gitSource.sha"], note: "" };
  ok(!basisCovers(partial), "a basis covering only some decision fields is not enough");
  ok(basisCovers(OBSERVED), "a dated basis covering every decision field is");
  // The adapter used to fall back to provider/owner/branch/commitSha, none of
  // which the basis names — so a record supplying ONLY those verified against a
  // basis that had never observed them.
  const fallbackOnly = {
    uid: CAND, projectId: CANONICAL.vercelProjectId, target: "production", readyState: "READY",
    source: "git",
    gitSource: { provider: "github", owner: CANONICAL.owner, repo: CANONICAL.repo, branch: "main", commitSha: MAIN },
  };
  ok(!verifiedOrigin(fallbackOnly, OBSERVED).ok,
    "a record using only unobserved field names verifies nothing");
  ok(ORIGIN_TRUST_BASIS.state === "UNVERIFIED" && !basisCovers(ORIGIN_TRUST_BASIS),
    "and the shipped default still refuses everything");
}

/* ── 4. Contradictory build fields are not silently reconciled ────────── */
function contradictionsRefuse() {
  console.log("\n  CONTRADICTORY BUILD EVIDENCE\n");
  const r = resolveEffectiveBuildCommand("npm run build", PROVENANCE_BUILD_COMMAND);
  ok(!r.read, "two disagreeing build-command fields are unread, not reconciled by preference");
  ok(resolveEffectiveBuildCommand(null, null).read === false, "and neither present is also unread");
  ok(resolveEffectiveBuildCommand(PROVENANCE_BUILD_COMMAND, PROVENANCE_BUILD_COMMAND).read === true,
    "while two agreeing fields are read");
  const bad = evidenceRefusal({ ...GOOD_EVIDENCE, effectiveBuildCommand: r }, PROVENANCE_BUILD_COMMAND, MAIN);
  ok(bad?.code === "BUILD_CONFIG_UNKNOWN", "and a contradiction refuses rather than picking a side");
}

/* ── 5. Ordering: main re-read, and the record before the mutation ────── */
async function orderingHoles() {
  console.log("\n  ORDERING\n");

  // main moves during the slow reads; apply must catch it.
  const { fx, promotes } = effects();
  const v = await validateRelease(candidate, MAIN, PROVENANCE_BUILD_COMMAND, fx, OBSERVED);
  ok(v.ok, "validated at main");
  if (v.ok) {
    const moved = effects({ readFreshMain: async () => OTHER });
    const out = await applyRelease(v.plan, moved.fx);
    ok(!out.ok && out.code === "MAIN_MOVED" && moved.promotes.length === 0,
      "main moving between validation and apply refuses, promoting nothing",
      `got ${out.ok ? "OK" : out.code}, ${moved.promotes.length} promote(s)`);
  }

  // A failed intent record must stop the release.
  if (v.ok) {
    const noLog = effects({ recordIntent: async () => { throw new Error("disk full"); } });
    const out = await applyRelease(v.plan, noLog.fx);
    ok(!out.ok && out.code === "RECORD_FAILED" && noLog.promotes.length === 0,
      "a rollback record that cannot be written prevents the promotion",
      `got ${out.ok ? "OK" : out.code}, ${noLog.promotes.length} promote(s)`);
  }

  // And the record genuinely precedes the mutation.
  if (v.ok) {
    const order: string[] = [];
    const seq = effects({
      recordIntent: async () => { order.push("record"); },
      promoteDeployment: async () => { order.push("promote"); },
    });
    const out = await applyRelease(v.plan, seq.fx);
    ok(out.ok && order.join(",") === "record,promote",
      `the rollback target is recorded before the promote request (${order.join(" -> ")})`);
  }
  ok(promotes.length === 0, "and validation itself never promoted");
}

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

  // vercelJsonBuildCommand — ABSENCE MUST BE PROVED, not inferred from a 404.
  //
  // GitHub answers 404 for a private resource the credential cannot see, so a
  // bare 404 was indistinguishable from a revoked token. The root tree at the
  // exact commit is read first; only a successful tree read makes absence mean
  // anything.
  const tree = (paths: string[]) => ({ tree: paths.map((p) => ({ path: p, type: "blob" })) });
  const route = (h: { tree?: () => Response; file?: () => Response }) =>
    (async (u: string | URL | Request) =>
      String(u).includes("/git/trees/") ? (h.tree ?? (() => res(200, tree([]))))()
                                        : (h.file ?? (() => res(404, {})))()) as typeof fetch;

  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(404, {}) }), "t")).read === false,
    "a 404 on the commit tree is UNREAD — access to the exact commit was never established");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, {}) }), "t")).read === false,
    "a tree response with no tree array is unread");
  // A TRUNCATED TREE IS NOT A LISTING — GitHub says so explicitly, and
  // "not in this array" then stops meaning "not in the commit".
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, { tree: [], truncated: true }) }), "t")).read === false,
    "a TRUNCATED tree cannot establish absence, even with an empty entry list");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, { tree: [{ path: "package.json" }], truncated: true }) }), "t")).read === false,
    "and a truncated tree with entries is still not a complete listing");
  // Entries that were never understood cannot support a conclusion about them.
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, { tree: [null, 42, {}], truncated: false }) }), "t")).read === false,
    "malformed tree entries are unread, not absence");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, { tree: [{ path: "a" }, { path: 7 }] }) }), "t")).read === false,
    "one entry without a string path spoils the listing");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, { tree: [{ path: "" }] }) }), "t")).read === false,
    "and an empty path is not a readable entry");

  const absent = await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["package.json"])) }), "t");
  ok(absent.read === true && absent.value === null,
    "absence is READ only when the commit's own tree was listed and does not contain it");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["vercel.json"])), file: () => res(200, {}, "") }), "t")).read === false,
    "a file listed in the tree that comes back EMPTY is unread, not an empty config");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["vercel.json"])), file: () => res(200, {}, "[]") }), "t")).read === false,
    "vercel.json containing [] is not a configuration object");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["vercel.json"])), file: () => res(200, {}, '"next build"') }), "t")).read === false,
    "and a bare JSON string is not one either");
  ok((await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["vercel.json"])), file: () => res(200, {}, "{not json") }), "t")).read === false,
    "and unparseable content is unread");
  const vSet = await vercelJsonBuildCommand(MAIN, route({ tree: () => res(200, tree(["vercel.json"])), file: () => res(200, {}, '{"buildCommand":"next build"}') }), "t");
  ok(vSet.read === true && vSet.value === "next build", "while a real override is read as one");
  ok((await vercelJsonBuildCommand(MAIN, route({}), undefined)).read === false,
    "and with no credential nothing is read, never assumed absent");

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
  await dryRunCanSucceed();
  await refusalsSendNothing();
  await unreadableTreePromotesNothing();
  basisMustBeComplete();
  contradictionsRefuse();
  await orderingHoles();
  await realAdapters();
  currentProduction();
  buildCommand();
  shellGuard();
  entryPointWiring();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
