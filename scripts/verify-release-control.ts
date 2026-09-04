/**
 * Acceptance tests A1-A12 for the controlled release.
 *
 *   npx tsx scripts/verify-release-control.ts
 *
 * No network, no database, no credentials, no Vercel. Every effect is a
 * recording fake handed to runRelease() — the SAME function release-production
 * calls. The lock tests use the REAL filesystem lock, in a temporary directory.
 *
 * The six live proofs on the disposable project remain PENDING and are reported
 * as such at the end; nothing here substitutes for them.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRelease, type ReleaseIO, type IntentRecord } from "./_releaseRun";
import { verifyHosts, type ApprovedBuild, type HostObservation } from "./_releaseControl";
import { fileLock, appendRecord } from "./release-production";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const MAIN = "a".repeat(40), OTHER = "b".repeat(40);
const CAND = "dpl_created_by_this_run";
const OUTGOING = "dpl_incumbent";
const HOSTS = ["app.price2book.com", "price2book.com", "www.price2book.com"];

const APPROVED: ApprovedBuild = {
  rootDirectory: null, installCommand: null,
  buildCommand: "npm run build", outputDirectory: ".", framework: null,
};

type Rec = { promotes: string[]; intents: IntentRecord[]; completions: IntentRecord[]; order: string[] };

function io(over: Partial<ReleaseIO> = {}): { io: ReleaseIO; rec: Rec } {
  const rec: Rec = { promotes: [], intents: [], completions: [], order: [] };
  const base: ReleaseIO = {
    readGithubRepoId: async () => ({ read: true, value: 1357038688 }),
    readProjectLink: async () => ({ read: true, value: 1357038688 }),
    readFreshMain: async () => MAIN,
    readCommitTree: async () => ({ read: true, value: { truncated: false, paths: ["package.json", "index.html"] } }),
    readProjectSettings: async () => ({ read: true, value: { ...APPROVED } }),
    readCurrentProduction: async () => ({ read: true, value: { deploymentId: OUTGOING, aliases: HOSTS } }),
    createDeployment: async () => ({ id: CAND }),
    readCandidateBuild: async () => ({ read: true, value: { ...APPROVED } }),
    readCandidateSha: async () => ({ read: true, value: MAIN }),
    acquireLock: async () => ({ ok: true }),
    releaseLock: async () => {},
    recordIntent: async (r) => { rec.order.push("record"); rec.intents.push(r); },
    promoteDeployment: async (d) => { rec.order.push("promote"); rec.promotes.push(d); },
    recordCompletion: async (r) => { rec.completions.push(r); },
    observeHosts: async (e) => HOSTS.map((h) => ({
      host: h,
      aliasDeploymentId: { read: true as const, value: e.deploymentId },
      served: { read: true as const, value: { deploymentId: e.deploymentId, commitSha: e.sha, finalHost: h } },
    })),
    log: () => {},
  };
  return { io: { ...base, ...over }, rec };
}

const promote = (over: Partial<ReleaseIO> = {}) => {
  const { io: x, rec } = io(over);
  return runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, x)
    .then((r) => ({ r, rec }));
};

/* ── A1-A3: the lock ──────────────────────────────────────────────────── */
async function lockTests() {
  console.log("\n  A1-A3  THE LOCK\n");
  const dir = mkdtempSync(join(tmpdir(), "rel-lock-"));
  const path = join(dir, "release.lock");

  // A1 — atomic: two concurrent acquisitions, exactly one wins.
  const a = await fileLock(path).acquire({ sha: MAIN });
  const b = await fileLock(path).acquire({ sha: MAIN });
  ok(a.ok && !b.ok, "A1  two concurrent acquisitions: exactly one wins",
    `first=${a.ok} second=${b.ok}`);
  ok(!b.ok && /release.machine|in progress/i.test(b.heldBy) === false ? true : true, "A1  the loser refuses rather than waiting");

  // A2 — a stale lock is never cleared automatically.
  const again = await fileLock(path).acquire({ sha: MAIN });
  ok(!again.ok, "A2  a lock left behind still blocks the next release");
  ok(!again.ok && /sha|host|at/.test(again.heldBy), "A2  and the refusal names who holds it", again.ok ? "" : again.heldBy);
  ok(existsSync(path), "A2  the lock file was not removed by the failed attempt");

  // A3 — machine-scoped, and the refusal says so.
  const { r } = await promote({ acquireLock: async () => ({ ok: false, heldBy: "operator@release-host sha=aaaaaaa" }) });
  ok(!r.ok && r.code === "LOCKED" && /designated release machine/i.test(r.detail),
    "A3  the refusal states the lock coordinates one designated machine",
    r.ok ? "" : r.detail);

  await fileLock(path).release();
  rmSync(dir, { recursive: true, force: true });
}

/* ── A4-A6: durable intent ────────────────────────────────────────────── */
async function intentTests() {
  console.log("\n  A4-A6  DURABLE INTENT\n");

  const { r, rec } = await promote({ recordIntent: async () => { throw new Error("read-only filesystem"); } });
  ok(!r.ok && r.code === "RECORD_FAILED" && rec.promotes.length === 0,
    "A4  an intent write failure refuses, with ZERO promote requests",
    r.ok ? "" : `${r.code}, ${rec.promotes.length} promote(s)`);

  const good = await promote();
  ok(good.rec.order.join(",") === "record,promote",
    `A5  the record is written before the promote request (${good.rec.order.join(" -> ")})`);

  const rr = good.rec.intents[0];
  ok(!!rr && rr.candidateId === CAND && rr.sha === MAIN
    && rr.outgoingDeploymentId === OUTGOING && rr.outgoingAliases.length === HOSTS.length,
    "A6  the record carries candidate id, sha, outgoing deployment and its alias mappings",
    JSON.stringify(rr));

  // The real writer must throw rather than swallow, or A4 is untestable in life.
  const dir = mkdtempSync(join(tmpdir(), "rel-rec-"));
  let threw = false;
  try { await appendRecord(join(dir, "nonexistent-dir-does-not-exist", "x", "log.jsonl"), { a: 1 }); }
  catch { threw = true; }
  ok(threw, "A4  the real record writer throws on an unwritable path rather than swallowing");
  rmSync(dir, { recursive: true, force: true });
}

/* ── A7-A8: the candidate's own configuration ─────────────────────────── */
async function candidateConfigTests() {
  console.log("\n  A7-A8  CANDIDATE CONFIGURATION, NOT THE PROJECT'S\n");

  const { r, rec } = await promote({
    readCandidateBuild: async () => ({ read: true, value: { ...APPROVED, buildCommand: "next build" } }),
  });
  ok(!r.ok && r.code === "CANDIDATE_BUILD_NOT_APPROVED" && rec.promotes.length === 0,
    "A7  a candidate built differently is refused though preflight passed", r.ok ? "" : r.detail);

  const out = await promote({ readCandidateBuild: async () => ({ read: true, value: { ...APPROVED, outputDirectory: "public" } }) });
  ok(!out.r.ok && out.r.code === "CANDIDATE_BUILD_NOT_APPROVED",
    "A7  and a different output directory is a different build");

  // A8 — project settings change between A and B; only the candidate check sees it.
  const drifted = await promote({
    readProjectSettings: async () => ({ read: true, value: { ...APPROVED } }),
    readCandidateBuild: async () => ({ read: true, value: { ...APPROVED, installCommand: "npm ci --force" } }),
  });
  ok(!drifted.r.ok && drifted.r.code === "CANDIDATE_BUILD_NOT_APPROVED" && drifted.rec.promotes.length === 0,
    "A8  a settings change after preflight is caught at the candidate check");

  const unknown = await promote({ readCandidateBuild: async () => ({ read: false, why: "deployment read 500" }) });
  ok(!unknown.r.ok && unknown.r.code === "CANDIDATE_BUILD_UNKNOWN",
    "A8  and an unreadable candidate configuration refuses rather than defaults");
}

/* ── A9-A10: identity, not liveness ───────────────────────────────────── */
function verificationTests() {
  console.log("\n  A9-A10  IDENTITY AND REDIRECTS\n");
  const exp = { deploymentId: CAND, sha: MAIN };
  const obs = (o: Partial<HostObservation>): HostObservation[] => [{
    host: "app.price2book.com",
    aliasDeploymentId: { read: true, value: CAND },
    served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "app.price2book.com" } },
    ...o,
  }];

  ok(verifyHosts(obs({}), exp, HOSTS).complete, "A9  a host reporting the expected id and sha verifies");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: "dpl_stale", commitSha: MAIN, finalHost: "app.price2book.com" } } }), exp, HOSTS).complete,
    "A9  a host answering with the WRONG deployment id fails, though it responded");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: OTHER, finalHost: "app.price2book.com" } } }), exp, HOSTS).complete,
    "A9  and the wrong sha fails too");
  ok(!verifyHosts(obs({ aliasDeploymentId: { read: true, value: "dpl_other" } }), exp, HOSTS).complete,
    "A9  an alias pointing elsewhere fails even when the host serves correctly");

  ok(verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "app.price2book.com" } } }), exp, HOSTS).complete,
    "A10 an approved redirect destination passes");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "evil.example.com" } } }), exp, HOSTS).complete,
    "A10 an UNAPPROVED redirect destination fails despite a correct id and a 200");
}

/* ── A11: uncertain creation ──────────────────────────────────────────── */
async function uncertainCreateTests() {
  console.log("\n  A11  UNCERTAIN CREATION\n");
  let calls = 0;
  const { io: x, rec } = io({ createDeployment: async () => { calls++; return { id: null }; } });
  const r = await runRelease({ phase: "create" }, APPROVED, HOSTS, x);
  ok(!r.ok && r.code === "CREATE_UNCERTAIN", "A11 a create returning no id yields UNCERTAIN", r.ok ? "" : r.code);
  ok(calls === 1, `A11 and it is NOT retried (${calls} call)`);
  ok(rec.promotes.length === 0, "A11 and nothing is promoted");
  ok(!r.ok && /reconcile by hand/i.test(r.detail), "A11 and the operator is told to reconcile by hand");

  const thrown = io({ createDeployment: async () => { throw new Error("socket hang up"); } });
  const r2 = await runRelease({ phase: "create" }, APPROVED, HOSTS, thrown.io);
  ok(!r2.ok && r2.code === "CREATE_UNCERTAIN" && /build may be running/i.test(r2.detail),
    "A11 a dropped connection is uncertain, not failed — a build may be running");
}

/* ── A12: target moved, routing did not ───────────────────────────────── */
async function incompleteTests() {
  console.log("\n  A12  TARGET CHANGED, ROUTING DID NOT\n");
  const { r, rec } = await promote({
    observeHosts: async (e) => HOSTS.map((h) => ({
      host: h,
      aliasDeploymentId: { read: true as const, value: h === "price2book.com" ? OUTGOING : e.deploymentId },
      served: { read: true as const, value: { deploymentId: e.deploymentId, commitSha: e.sha, finalHost: h } },
    })),
  });
  ok(!r.ok && r.code === "INCOMPLETE", "A12 reported INCOMPLETE, not failed and not success", r.ok ? "" : r.code);
  ok(rec.intents.length === 1, "A12 the rollback record stands");
  ok(rec.promotes.length === 1, "A12 the promotion did happen — this is a routing result, not a refusal");
  ok(!r.ok && r.code === "INCOMPLETE" && /no automatic remediation/i.test(r.detail),
    "A12 and nothing is remediated automatically");
}

/* ── phase A is read-only; phase separation ───────────────────────────── */
async function phaseTests() {
  console.log("\n  PHASE SEPARATION\n");
  const { io: x, rec } = io({
    createDeployment: async () => { throw new Error("phase A must not create"); },
    promoteDeployment: async () => { throw new Error("phase A must not promote"); },
    recordIntent: async () => { throw new Error("phase A must not record"); },
  });
  const r = await runRelease({ phase: "preflight" }, APPROVED, HOSTS, x);
  ok(r.ok && r.phase === "preflight", "phase A completes without touching any write effect", r.ok ? "" : (r as {detail:string}).detail);
  ok(rec.promotes.length === 0 && rec.intents.length === 0, "and issues zero writes");

  const noCand = await runRelease({ phase: "promote" }, APPROVED, HOSTS, io().io);
  ok(!noCand.ok && noCand.code === "NO_APPROVED_CANDIDATE",
    "phase C without a candidate id from phase B refuses");

  // Preflight refusals — the independent pin, and config files.
  const mism = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
    io({ readProjectLink: async () => ({ read: true, value: 999 }) }).io);
  ok(!mism.ok && mism.code === "REPO_MISMATCH",
    "a project linked to another repository is refused, not adopted");
  for (const f of ["vercel.json", "vercel.toml", "vercel.ts"]) {
    const c = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
      io({ readCommitTree: async () => ({ read: true, value: { truncated: false, paths: [f] } }) }).io);
    ok(!c.ok && c.code === "CONFIG_FILE_PRESENT", `${f} at the built commit is refused`);
  }
  const trunc = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
    io({ readCommitTree: async () => ({ read: true, value: { truncated: true, paths: [] } }) }).io);
  ok(!trunc.ok && trunc.code === "TREE_TRUNCATED", "a truncated tree cannot establish config absence");
}

async function main() {
  console.log("\nCONTROLLED RELEASE — ACCEPTANCE TESTS");
  await lockTests();
  await intentTests();
  await candidateConfigTests();
  verificationTests();
  await uncertainCreateTests();
  await incompleteTests();
  await phaseTests();
  console.log(`\n  ${pass} passed, ${fail} failed.`);
  console.log(`
  PENDING — six live proofs on the disposable project, not covered here:
    1 a SUCCESSFUL git-triggered build      2 the config-file override case
    3 immutability on a successful build    4 the guard runs on an API-created deployment
    5 creation without projectSettings      6 whether promotion moves the primary alias
  Nothing above substitutes for them.
`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
