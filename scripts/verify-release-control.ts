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

import { mkdtempSync, rmSync, existsSync, readFileSync, writeSync, fsyncSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRelease, type ReleaseIO, type IntentRecord } from "./_releaseRun";
import { verifyHosts, type ApprovedBuild, type HostObservation,
  type CandidateRecord, type CreationReceipt, type AliasMapping } from "./_releaseControl";
import { fileLock, appendRecord, readReceipt, promotionClaim, isDefiniteFailure } from "./release-production";

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
const REPO_ID = 1357038688;
const CANON = { projectId: "prj_canonical", target: "production", repoId: REPO_ID };
const RECORD: CandidateRecord = {
  id: CAND, projectId: CANON.projectId, readyState: "READY",
  target: "production", sha: MAIN, build: { ...APPROVED },
};
const MAPPINGS: AliasMapping[] = HOSTS.map((h) => ({ host: h, deploymentId: OUTGOING }));
const RECEIPT: CreationReceipt = {
  runId: "run1", candidateId: CAND, sha: MAIN,
  createdAt: "2026-09-04T00:00:00Z", operator: "op", host: "release-host",
  outgoingDeploymentId: OUTGOING, outgoingAliases: MAPPINGS,
};

type Rec = { promotes: string[]; intents: IntentRecord[]; completions: IntentRecord[];
  order: string[]; creates: string[]; receipts: CreationReceipt[]; locks: number; unlocks: number };

function io(over: Partial<ReleaseIO> = {}): { io: ReleaseIO; rec: Rec } {
  const rec: Rec = { promotes: [], intents: [], completions: [], order: [],
    creates: [], receipts: [], locks: 0, unlocks: 0 };
  const base: ReleaseIO = {
    readGithubRepoId: async () => ({ read: true, value: REPO_ID }),
    readProjectLink: async () => ({ read: true, value: REPO_ID }),
    readFreshMain: async () => MAIN,
    readCommitTree: async () => ({ read: true, value: { truncated: false, paths: ["package.json", "index.html"] } }),
    readProjectSettings: async () => ({ read: true, value: { ...APPROVED } }),
    readCurrentProduction: async () => ({ read: true, value: { deploymentId: OUTGOING, aliases: HOSTS } }),
    createDeployment: async (sha) => { rec.order.push("create"); rec.creates.push(sha); return { id: CAND }; },
    recordCreation: async (r) => { rec.order.push("receipt"); rec.receipts.push(r); },
    readCandidate: async () => ({ read: true, value: { ...RECORD } }),
    loadCreationReceipt: async () => ({ read: true, value: { ...RECEIPT } }),
    readAliasMappings: async () => MAPPINGS,
    readProductionTarget: async () => ({ read: true, value: CAND }),
    acquireLock: async () => { rec.locks++; rec.order.push("lock"); return { ok: true }; },
    readLockOwner: async () => ({ read: true, value: "run1" }),
    claimPromotion: async () => { rec.order.push("claim"); return { ok: true }; },
    releaseLock: async () => { rec.unlocks++; rec.order.push("unlock"); },
    recordIntent: async (r) => { rec.order.push("record"); rec.intents.push(r); },
    promoteDeployment: async (d) => { rec.order.push("promote"); rec.promotes.push(d); },
    recordCompletion: async (r) => { rec.completions.push(r); },
    operator: () => "op",
    host: () => "release-host",
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
  return runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, x, CANON)
    .then((r) => ({ r, rec }));
};

/* ── A1-A3: the lock ──────────────────────────────────────────────────── */
async function lockTests() {
  console.log("\n  A1-A3  THE LOCK\n");
  const dir = mkdtempSync(join(tmpdir(), "rel-lock-"));
  const path = join(dir, "release.lock");

  // A1 — atomic: two concurrent acquisitions, exactly one wins.
  const a = await fileLock(path).acquire({ sha: MAIN, runId: "runA" });
  const b = await fileLock(path).acquire({ sha: MAIN, runId: "runB" });
  ok(a.ok && !b.ok, "A1  two concurrent acquisitions: exactly one wins",
    `first=${a.ok} second=${b.ok}`);
  ok(!b.ok && typeof b.heldBy === "string" && b.heldBy.includes("sha"),
    "A1  and the loser is told who holds it", b.ok ? "" : "no heldBy detail");

  // A2 — a stale lock is never cleared automatically.
  const again = await fileLock(path).acquire({ sha: MAIN, runId: "runC" });
  ok(!again.ok, "A2  a lock left behind still blocks the next release");
  ok(!again.ok && /sha|host|at/.test(again.heldBy), "A2  and the refusal names who holds it", again.ok ? "" : again.heldBy);
  ok(existsSync(path), "A2  the lock file was not removed by the failed attempt");

  // A3 — machine-scoped, and the refusal says so.
  const held = io({ acquireLock: async () => ({ ok: false, heldBy: "operator@release-host sha=aaaaaaa" }) });
  const r = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, held.io, CANON);
  ok(!r.ok && r.code === "LOCKED" && /ONE machine/i.test(r.detail),
    "A3  the refusal states the lock coordinates one designated machine", r.ok ? "" : r.detail);
  ok(!r.ok && held.rec.creates.length === 0,
    "A3  and a held lock stops phase B before it creates anything");

  await fileLock(path).release("runA");
  rmSync(dir, { recursive: true, force: true });
}

/* ── A1b: two REAL concurrent phase-B runs ────────────────────────────── */
/**
 * A1 exercised the lock helper. This exercises the thing the lock exists for:
 * two phase-B runs, started together, against one real lock file.
 */
async function concurrentPhaseBTests() {
  console.log("\n  A1b TWO CONCURRENT PHASE-B RUNS\n");
  const dir = mkdtempSync(join(tmpdir(), "rel-conc-"));
  const lockPath = join(dir, "release.lock");

  const mk = () => {
    const rec = { creates: [] as string[] };
    const x = io().io;
    x.acquireLock = (info) => fileLock(lockPath).acquire(info);
    x.readLockOwner = () => fileLock(lockPath).owner();
    x.releaseLock = (runId) => fileLock(lockPath).release(runId);
    x.createDeployment = async (sha) => { rec.creates.push(sha); return { id: `dpl_${rec.creates.length}` }; };
    return { x, rec };
  };
  const one = mk(), two = mk();
  const [r1, r2] = await Promise.all([
    runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, one.x, CANON),
    runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, two.x, CANON),
  ]);

  const winners = [r1, r2].filter((r) => r.ok).length;
  const losers = [r1, r2].filter((r) => !r.ok && r.code === "LOCKED").length;
  ok(winners === 1 && losers === 1,
    "A1b exactly one concurrent phase-B run proceeds; the other is LOCKED",
    `winners=${winners} losers=${losers}`);
  ok(one.rec.creates.length + two.rec.creates.length === 1,
    "A1b and only ONE deployment is created — two builds of one commit is the thing this prevents",
    `creates=${one.rec.creates.length + two.rec.creates.length}`);
  ok(existsSync(lockPath), "A1b and the lock is still held afterwards, for phase C");

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
  const oi = good.rec.order.indexOf("record"), op = good.rec.order.indexOf("promote");
  ok(oi >= 0 && op >= 0 && oi < op,
    `A5  the record is written before the promote request (${good.rec.order.join(" -> ")})`);

  const rr = good.rec.intents[0];
  ok(!!rr && rr.candidateId === CAND && rr.sha === MAIN
    && rr.outgoingDeploymentId === OUTGOING && rr.outgoingAliases.length === HOSTS.length,
    "A6  the record carries candidate id, sha, outgoing deployment and its alias mappings",
    JSON.stringify(rr));

  // The real writer must throw rather than swallow, or A4 is untestable in life.
  const dir = mkdtempSync(join(tmpdir(), "rel-rec-"));
  let threw = false;
  try { await appendRecord("/dev/full/impossible/log.jsonl", { a: 1 }); } catch { threw = true; }
  ok(threw, "A4  the real record writer throws on an unwritable path rather than swallowing");

  // A SHORT WRITE MUST NOT PERSIST A PARTIAL RECORD.
  //
  // The defect was one writeSync whose return value was ignored, so `{` was
  // persisted, fsynced, and reported as recorded. The fix is not to throw on
  // any short write — a write that makes progress is retried — but to guarantee
  // the record is COMPLETE or the call fails. Both halves are asserted.
  const dribble = join(dir, "dribble.jsonl");
  let syncedAt = -1;
  await appendRecord(dribble, { candidateId: CAND, sha: MAIN },
    (fd, b, o, l) => writeSync(fd, b, o, Math.min(1, l)),   // one byte at a time
    (fd) => { syncedAt = statSync(dribble).size; fsyncSync(fd); });
  const written = readFileSync(dribble, "utf8");
  ok(written.trim().endsWith("}") && JSON.parse(written.trim()).candidateId === CAND,
    "A4  a dribbling writer still persists the WHOLE record, not a fragment", written.slice(0, 40));
  ok(syncedAt === Buffer.byteLength(written), "A4  and it is fsynced only once complete");

  // A writer making NO progress must fail rather than loop or truncate.
  let stalled = false, stalledSync = false;
  try {
    await appendRecord(join(dir, "stalled.jsonl"), { candidateId: CAND },
      () => 0, () => { stalledSync = true; });
  } catch { stalled = true; }
  ok(stalled, "A4  a writer that makes no progress throws rather than persisting a fragment");
  ok(!stalledSync, "A4  and nothing is fsynced when the record is incomplete");

  const whole = join(dir, "whole.jsonl");
  await appendRecord(whole, { candidateId: CAND, sha: MAIN });
  ok(readFileSync(whole, "utf8").trim().endsWith("}"), "A4  a complete record is written whole");
  rmSync(dir, { recursive: true, force: true });
}

/* ── R1: promotion requires a receipt from phase B ────────────────────── */
async function receiptTests() {
  console.log("\n  R1  ONLY WHAT PHASE B CREATED\n");

  const none = await promote({ loadCreationReceipt: async () => ({ read: false, why: "no creation receipt for dpl_x" }) });
  ok(!none.r.ok && none.r.code === "NO_CREATION_RECEIPT" && none.rec.promotes.length === 0,
    "R1  a candidate with no creation receipt promotes nothing — an env var is not a receipt",
    none.r.ok ? "" : none.r.code);

  const other = await promote({ loadCreationReceipt: async () => ({ read: true, value: { ...RECEIPT, candidateId: "dpl_someone_else" } }) });
  ok(!other.r.ok && other.r.code === "RECEIPT_MISMATCH" && other.rec.promotes.length === 0,
    "R1  a receipt for a different deployment promotes nothing");

  const wrongSha = await promote({ loadCreationReceipt: async () => ({ read: true, value: { ...RECEIPT, sha: OTHER } }) });
  ok(!wrongSha.r.ok && wrongSha.r.code === "RECEIPT_MISMATCH",
    "R1  and a receipt recording a different sha promotes nothing");

  // The receipt store, for real.
  const dir = mkdtempSync(join(tmpdir(), "rel-rcpt-"));
  const path = join(dir, "receipts.jsonl");
  await appendRecord(path, RECEIPT);
  const back = await readReceipt(path, CAND);
  ok(back.read && back.value.sha === MAIN, "R1  a written receipt reads back for its candidate");
  const missing = await readReceipt(path, "dpl_never_created");
  ok(!missing.read, "R1  and an id that was never created has none");
  rmSync(dir, { recursive: true, force: true });
}

/* ── R2: phase B locks, checks the sha, and records ───────────────────── */
async function phaseBTests() {
  console.log("\n  R2  PHASE B IS A WRITE, AND BEHAVES LIKE ONE\n");

  const good = io();
  const r = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, good.io, CANON);
  ok(r.ok && good.rec.locks === 1, "R2  phase B acquires the lock before creating", `locks=${good.rec.locks}`);
  const li = good.rec.order.indexOf("lock"), ci = good.rec.order.indexOf("create");
  ok(li >= 0 && ci >= 0 && li < ci, `R2  and it locks BEFORE the create call (${good.rec.order.join(" -> ")})`);
  ok(good.rec.receipts.length === 1 && good.rec.receipts[0].candidateId === CAND,
    "R2  and records a receipt for what it created");
  ok(good.rec.unlocks === 0, "R2  and does NOT release the lock — phase C holds it across processes");

  // AN ABSENT APPROVAL IS NOT AN APPROVAL. The check used to be conditional on
  // the value being present, so omitting it skipped the check entirely.
  const noSha = io();
  const ns = await runRelease({ phase: "create" }, APPROVED, HOSTS, noSha.io, CANON);
  ok(!ns.ok && ns.code === "NO_APPROVED_SHA" && noSha.rec.creates.length === 0 && noSha.rec.locks === 0,
    "R2  phase B without an approved sha creates nothing and takes no lock",
    ns.ok ? "it created one" : ns.code);

  const badSha = io();
  const bs = await runRelease({ phase: "create", approvedSha: "not-a-sha" }, APPROVED, HOSTS, badSha.io, CANON);
  ok(!bs.ok && bs.code === "NO_APPROVED_SHA" && badSha.rec.creates.length === 0,
    "R2  and a malformed approved sha is refused rather than compared");

  const moved = io();
  const mr = await runRelease({ phase: "create", approvedSha: OTHER }, APPROVED, HOSTS, moved.io, CANON);
  ok(!mr.ok && mr.code === "MAIN_MOVED" && moved.rec.creates.length === 0,
    "R2  a create for a sha that is no longer main is refused, and creates nothing",
    mr.ok ? "" : mr.code);

  const noReceipt = io({ recordCreation: async () => { throw new Error("disk full"); } });
  const nr = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, noReceipt.io, CANON);
  ok(!nr.ok && nr.code === "RECEIPT_NOT_RECORDED" && noReceipt.rec.unlocks === 0,
    "R2  a deployment created without a recordable receipt refuses, and keeps the lock");

  const uncertain = io({ createDeployment: async () => ({ id: null }) });
  const ur = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, uncertain.io, CANON);
  ok(!ur.ok && ur.code === "CREATE_UNCERTAIN" && uncertain.rec.unlocks === 0,
    "R2  an uncertain create keeps the lock — a build may be running");
}

/* ── R3: an ambiguous promote must not release the lock ───────────────── */
async function promoteUncertaintyTests() {
  console.log("\n  R3  AMBIGUOUS PROMOTION KEEPS THE LOCK\n");

  const net = await promote({ promoteDeployment: async () => { throw new Error("socket hang up"); } });
  ok(!net.r.ok && net.r.code === "PROMOTE_UNCERTAIN" && net.rec.unlocks === 0,
    "R3  a dropped connection is UNCERTAIN and the lock is kept",
    net.r.ok ? "" : `${net.r.code}, unlocks=${net.rec.unlocks}`);

  const definite = await promote({
    promoteDeployment: async () => { throw Object.assign(new Error("promote 403"), { definite: true }); },
  });
  ok(!definite.r.ok && definite.r.code === "PROMOTE_FAILED" && definite.rec.unlocks === 1,
    "R3  a definite refusal releases it — the promotion certainly did not happen");
}

/* ── R4: the pin must exist and all three must agree ──────────────────── */
async function repoPinTests() {
  console.log("\n  R4  THE REPOSITORY PIN\n");

  const unpinned = await runRelease({ phase: "preflight" }, APPROVED, HOSTS, io().io,
    { ...CANON, repoId: 0 });
  ok(!unpinned.ok && unpinned.code === "REPO_ID_UNPINNED",
    "R4  an unset CANONICAL.repoId refuses — it cannot be a pin",
    unpinned.ok ? "" : unpinned.code);

  // The defect: GitHub and Vercel agreed with each other and not with us.
  const agreedElsewhere = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
    io({ readGithubRepoId: async () => ({ read: true, value: 77 }),
         readProjectLink: async () => ({ read: true, value: 77 }) }).io, CANON);
  ok(!agreedElsewhere.ok && agreedElsewhere.code === "REPO_MISMATCH",
    "R4  GitHub and Vercel agreeing on a repository that is not the pinned one is refused");

  const created = io();
  await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, created.io, CANON);
  ok(created.rec.creates.length === 1, "R4  and a pinned run reaches creation");
}

/* ── R5: the candidate record must be the candidate ───────────────────── */
async function candidateIdentityTests() {
  console.log("\n  R5  THE CANDIDATE RECORD IS CHECKED\n");
  const cases: [string, Partial<CandidateRecord>, string][] = [
    ["a record describing another deployment", { id: "dpl_other" }, "CANDIDATE_IDENTITY_MISMATCH"],
    ["a record in another project", { projectId: "prj_other" }, "WRONG_PROJECT"],
    ["a deployment still building", { readyState: "BUILDING" }, "NOT_READY"],
    ["a preview-target deployment", { target: "preview" }, "NOT_PRODUCTION_TARGET"],
    ["a record with no sha", { sha: null }, "CANDIDATE_SHA_UNREADABLE"],
    ["a record with no build settings", { build: null }, "CANDIDATE_BUILD_UNKNOWN"],
  ];
  for (const [label, patch, code] of cases) {
    const { r, rec } = await promote({ readCandidate: async () => ({ read: true, value: { ...RECORD, ...patch } }) });
    ok(!r.ok && r.code === code && rec.promotes.length === 0,
      `R5  ${label} promotes nothing (${code})`, r.ok ? "OK" : r.code);
  }
}

/* ── L1: phase C owns the lock, claims once, and releases only its own ── */
async function lifecycleLockTests() {
  console.log("\n  L1  PHASE C OWNS WHAT IT RELEASES\n");

  const dir = mkdtempSync(join(tmpdir(), "rel-life-"));
  const lockPath = join(dir, "release.lock");
  const claimDir = join(dir, "claims");

  // Phase B took the lock as run1.
  await fileLock(lockPath).acquire({ sha: MAIN, runId: "run1" });

  const withReal = (over: Partial<ReleaseIO> = {}) => {
    const { io: x, rec } = io(over);
    x.readLockOwner = () => fileLock(lockPath).owner();
    x.releaseLock = (runId) => fileLock(lockPath).release(runId);
    x.claimPromotion = (runId, cand) => promotionClaim(claimDir).claim(runId, cand);
    return { x, rec };
  };

  // A run that is NOT the owner must refuse — and must not touch the lock.
  const foreign = withReal({ loadCreationReceipt: async () => ({ read: true, value: { ...RECEIPT, runId: "run999" } }) });
  const fr = await runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, foreign.x, CANON);
  ok(!fr.ok && fr.code === "NOT_LOCK_OWNER", "L1  a run that does not hold the lock refuses", fr.ok ? "" : fr.code);
  ok(existsSync(lockPath), "L1  and it does NOT delete the legitimate run's lock");

  // No receipt at all: refuse, and still leave the lock alone.
  const orphan = withReal({ loadCreationReceipt: async () => ({ read: false, why: "no creation receipt" }) });
  const orr = await runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, orphan.x, CANON);
  ok(!orr.ok && orr.code === "NO_CREATION_RECEIPT", "L1  a promote with no receipt refuses");
  ok(existsSync(lockPath), "L1  and the lock survives that refusal too");

  // TWO CONCURRENT PHASE-C RUNS, both legitimate owners of run1.
  const c1 = withReal(), c2 = withReal();
  const [p1, p2] = await Promise.all([
    runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, c1.x, CANON),
    runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, c2.x, CANON),
  ]);
  const promoted = c1.rec.promotes.length + c2.rec.promotes.length;
  ok(promoted === 1, "L1  two concurrent phase-C runs promote exactly ONCE", `promotes=${promoted}`);
  const claimed = [p1, p2].filter((r) => !r.ok && r.code === "ALREADY_CLAIMED").length;
  ok(claimed === 1, "L1  and the loser is refused as ALREADY_CLAIMED", `claimed=${claimed}`);

  // The same receipt again, after the lock is gone: still refused.
  await fileLock(lockPath).release("run1");
  await fileLock(lockPath).acquire({ sha: MAIN, runId: "run1" });
  const again = withReal();
  const ar = await runRelease({ phase: "promote", approvedSha: MAIN, candidateId: CAND }, APPROVED, HOSTS, again.x, CANON);
  ok(!ar.ok && ar.code === "ALREADY_CLAIMED" && again.rec.promotes.length === 0,
    "L1  and the same receipt cannot be promoted a second time", ar.ok ? "" : ar.code);

  // THE RELEASE PRIMITIVE ITSELF must refuse a foreign run id. The checks above
  // pass without this because a non-owner now refuses before the finally block
  // ever runs — so the primitive needs its own test, or the guard inside it is
  // uncovered and a later refactor could drop it silently.
  const lp2 = join(dir, "owned.lock");
  await fileLock(lp2).acquire({ sha: MAIN, runId: "ownerA" });
  await fileLock(lp2).release("someoneElse");
  ok(existsSync(lp2), "L1  release() with a foreign run id leaves the lock alone");
  await fileLock(lp2).release("ownerA");
  ok(!existsSync(lp2), "L1  and the owner can release it");

  rmSync(dir, { recursive: true, force: true });
}

/* ── L2: the baseline belongs to the run ──────────────────────────────── */
async function baselineTests() {
  console.log("\n  L2  THE OUTGOING BASELINE IS PHASE B'S, NOT PHASE C'S\n");

  // Production moved between B and C. C used to adopt what it saw and record
  // the intervening deployment as the thing it replaced.
  const intervening = "dpl_someone_else_promoted";
  const { r, rec } = await promote({
    readCurrentProduction: async () => ({ read: true, value: { deploymentId: intervening, aliases: HOSTS } }),
  });
  ok(!r.ok && r.code === "PRODUCTION_MOVED" && rec.promotes.length === 0,
    "L2  production moving between B and C is refused against the RECEIPT's baseline",
    r.ok ? "" : r.code);

  const good = await promote();
  ok(good.r.ok && good.r.phase === "promote" && good.r.replaced === OUTGOING,
    "L2  and a clean run records the baseline phase B captured");
  const rec0 = good.rec.intents[0];
  ok(!!rec0 && Array.isArray(rec0.outgoingAliases) && rec0.outgoingAliases.length === HOSTS.length
     && typeof rec0.outgoingAliases[0].host === "string"
     && "deploymentId" in rec0.outgoingAliases[0],
    "L2  and the intent stores per-host MAPPINGS, not alias names",
    JSON.stringify(rec0?.outgoingAliases));
}

/* ── L3: the adapter's own failure classification ─────────────────────── */
async function classificationTests() {
  console.log("\n  L3  WHICH HTTP ANSWERS ESTABLISH THAT NOTHING HAPPENED\n");
  const cases: [number, boolean, string][] = [
    [403, true,  "a 403 is a refusal — the promotion definitely did not happen"],
    [404, true,  "a 404 likewise"],
    [409, true,  "and a 409"],
    [500, false, "a 500 says nothing about what the server did"],
    [502, false, "nor a 502"],
    [503, false, "nor a 503 — this released the lock before"],
    [504, false, "nor a 504"],
    [408, false, "a request timeout is not a refusal"],
    [429, false, "and neither is a rate limit"],
  ];
  for (const [status, definite, label] of cases)
    ok(isDefiniteFailure(status) === definite, `L3  ${label}`, `isDefiniteFailure(${status})=${isDefiniteFailure(status)}`);

  // Through the run, not just the classifier.
  const five = await promote({
    promoteDeployment: async () => { throw Object.assign(new Error("promote 503"), { definite: isDefiniteFailure(503) }); },
  });
  ok(!five.r.ok && five.r.code === "PROMOTE_UNCERTAIN" && five.rec.unlocks === 0,
    "L3  a 503 through the run is UNCERTAIN and keeps the lock");
}

/* ── L4: success needs the production target too ──────────────────────── */
async function targetVerificationTests() {
  console.log("\n  L4  SUCCESS REQUIRES ALL THREE\n");

  // Aliases and HTTP both report the candidate; the TARGET is still the incumbent.
  const { r, rec } = await promote({ readProductionTarget: async () => ({ read: true, value: OUTGOING }) });
  ok(!r.ok && r.code === "INCOMPLETE", "L4  aliases and HTTP agreeing is not enough if the target did not move",
    r.ok ? "OK — the target was never checked" : r.code);
  const probs = !r.ok && "problems" in r ? r.problems : [];
  ok(probs.some((x: string) => /production target/.test(x)),
    "L4  and the problem names the production target", JSON.stringify(probs));
  ok(rec.promotes.length === 1, "L4  the promotion still happened — this is a verification result");

  const unread = await promote({ readProductionTarget: async () => ({ read: false, why: "project read 500" }) });
  ok(!unread.r.ok && unread.r.code === "INCOMPLETE",
    "L4  an unreadable target after promoting does not verify either");
}

/* ── A7-A8: the candidate's own configuration ─────────────────────────── */
async function candidateConfigTests() {
  console.log("\n  A7-A8  CANDIDATE CONFIGURATION, NOT THE PROJECT'S\n");

  const { r, rec } = await promote({
    readCandidate: async () => ({ read: true, value: { ...RECORD, build: { ...APPROVED, buildCommand: "next build" } } }),
  });
  ok(!r.ok && r.code === "CANDIDATE_BUILD_NOT_APPROVED" && rec.promotes.length === 0,
    "A7  a candidate built differently is refused though preflight passed", r.ok ? "" : r.detail);

  const out = await promote({ readCandidate: async () => ({ read: true, value: { ...RECORD, build: { ...APPROVED, outputDirectory: "public" } } }) });
  ok(!out.r.ok && out.r.code === "CANDIDATE_BUILD_NOT_APPROVED",
    "A7  and a different output directory is a different build");

  // A8 — project settings change between A and B; only the candidate check sees it.
  const drifted = await promote({
    readProjectSettings: async () => ({ read: true, value: { ...APPROVED } }),
    readCandidate: async () => ({ read: true, value: { ...RECORD, build: { ...APPROVED, installCommand: "npm ci --force" } } }),
  });
  ok(!drifted.r.ok && drifted.r.code === "CANDIDATE_BUILD_NOT_APPROVED" && drifted.rec.promotes.length === 0,
    "A8  a settings change after preflight is caught at the candidate check");

  const unknown = await promote({ readCandidate: async () => ({ read: false, why: "deployment read 500" }) });
  ok(!unknown.r.ok && unknown.r.code === "CANDIDATE_UNREADABLE",
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

  ok(verifyHosts(obs({}), exp, HOSTS, { read: true, value: CAND }).complete, "A9  a host reporting the expected id and sha verifies");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: "dpl_stale", commitSha: MAIN, finalHost: "app.price2book.com" } } }), exp, HOSTS, { read: true, value: CAND }).complete,
    "A9  a host answering with the WRONG deployment id fails, though it responded");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: OTHER, finalHost: "app.price2book.com" } } }), exp, HOSTS, { read: true, value: CAND }).complete,
    "A9  and the wrong sha fails too");
  ok(!verifyHosts(obs({ aliasDeploymentId: { read: true, value: "dpl_other" } }), exp, HOSTS, { read: true, value: CAND }).complete,
    "A9  an alias pointing elsewhere fails even when the host serves correctly");

  ok(verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "app.price2book.com" } } }), exp, HOSTS, { read: true, value: CAND }).complete,
    "A10 an approved redirect destination passes");
  ok(!verifyHosts(obs({ served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "evil.example.com" } } }), exp, HOSTS, { read: true, value: CAND }).complete,
    "A10 an UNAPPROVED redirect destination fails despite a correct id and a 200");
}

/* ── R6: alias mapping is not the production target ───────────────────── */
function aliasMappingTests() {
  console.log("\n  R6  ALIAS MAPPING IS ITS OWN QUESTION\n");
  const exp = { deploymentId: CAND, sha: MAIN };

  // The defect: observeHosts assigned the PRODUCTION TARGET id as every host's
  // alias mapping, so "the alias points where we expect" only restated "the
  // target moved" — which is the confusion the observation corrected.
  const unmapped: HostObservation[] = HOSTS.map((h) => ({
    host: h,
    aliasDeploymentId: { read: false, why: `no alias record maps ${h} to a deployment` },
    served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: h } },
  }));
  const v = verifyHosts(unmapped, exp, HOSTS, { read: true, value: CAND });
  ok(!v.complete && v.problems.every((p) => /alias mapping unreadable/.test(p)),
    "R6  hosts serving correctly but with NO alias mapping do not verify",
    v.problems.join(" | ").slice(0, 100));

  const stale: HostObservation[] = [{
    host: "price2book.com",
    aliasDeploymentId: { read: true, value: "dpl_incumbent" },
    served: { read: true, value: { deploymentId: CAND, commitSha: MAIN, finalHost: "price2book.com" } },
  }];
  ok(!verifyHosts(stale, exp, HOSTS, { read: true, value: CAND }).complete,
    "R6  an alias still mapped to the outgoing deployment fails, even while the host serves the new one");
}

/* ── A11: uncertain creation ──────────────────────────────────────────── */
async function uncertainCreateTests() {
  console.log("\n  A11  UNCERTAIN CREATION\n");
  let calls = 0;
  const { io: x, rec } = io({ createDeployment: async () => { calls++; return { id: null }; } });
  const r = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, x, CANON);
  ok(!r.ok && r.code === "CREATE_UNCERTAIN", "A11 a create returning no id yields UNCERTAIN", r.ok ? "" : r.code);
  ok(calls === 1, `A11 and it is NOT retried (${calls} call)`);
  ok(rec.promotes.length === 0, "A11 and nothing is promoted");
  ok(!r.ok && /reconcile by hand/i.test(r.detail), "A11 and the operator is told to reconcile by hand");

  const thrown = io({ createDeployment: async () => { throw new Error("socket hang up"); } });
  const r2 = await runRelease({ phase: "create", approvedSha: MAIN }, APPROVED, HOSTS, thrown.io, CANON);
  ok(!r2.ok && r2.code === "CREATE_UNCERTAIN" && /build may be running/i.test(r2.detail),
    "A11 a dropped connection is uncertain, not failed — a build may be running");
}

/* ── A12: target moved, routing did not ───────────────────────────────── */
async function incompleteTests() {
  console.log("\n  A12  TARGET CHANGED, ROUTING DID NOT\n");
  const { r, rec } = await promote({
    operator: () => "op",
    host: () => "release-host",
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
  const r = await runRelease({ phase: "preflight" }, APPROVED, HOSTS, x, CANON);
  ok(r.ok && r.phase === "preflight", "phase A completes without touching any write effect", r.ok ? "" : (r as {detail:string}).detail);
  ok(rec.promotes.length === 0 && rec.intents.length === 0, "and issues zero writes");

  const noCand = await runRelease({ phase: "promote" }, APPROVED, HOSTS, io().io, CANON);
  ok(!noCand.ok && noCand.code === "NO_APPROVED_CANDIDATE",
    "phase C without a candidate id from phase B refuses");

  // Preflight refusals — the independent pin, and config files.
  const mism = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
    io({ readProjectLink: async () => ({ read: true, value: 999 }) }).io, CANON);
  ok(!mism.ok && mism.code === "REPO_MISMATCH",
    "a project linked to another repository is refused, not adopted");
  for (const f of ["vercel.json", "vercel.toml", "vercel.ts"]) {
    const c = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
      io({ readCommitTree: async () => ({ read: true, value: { truncated: false, paths: [f] } }) }).io, CANON);
    ok(!c.ok && c.code === "CONFIG_FILE_PRESENT", `${f} at the built commit is refused`);
  }
  const trunc = await runRelease({ phase: "preflight" }, APPROVED, HOSTS,
    io({ readCommitTree: async () => ({ read: true, value: { truncated: true, paths: [] } }) }).io, CANON);
  ok(!trunc.ok && trunc.code === "TREE_TRUNCATED", "a truncated tree cannot establish config absence");
}

async function main() {
  console.log("\nCONTROLLED RELEASE — ACCEPTANCE TESTS");
  await lockTests();
  await concurrentPhaseBTests();
  await intentTests();
  await lifecycleLockTests();
  await baselineTests();
  await classificationTests();
  await targetVerificationTests();
  await receiptTests();
  await phaseBTests();
  await promoteUncertaintyTests();
  await repoPinTests();
  await candidateIdentityTests();
  await candidateConfigTests();
  verificationTests();
  aliasMappingTests();
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
