/**
 * The release, as three phases, with every effect injected.
 *
 * THIS IS THE REAL ENTRY POINT'S BODY. release-production.ts builds the live
 * effects and calls runRelease(); the tests build recording fakes and call the
 * SAME function. There is deliberately no test-only variant — the previous round
 * proved that an orchestrator only its own tests exercise can pass everything
 * while the real command keeps every defect.
 *
 * PHASE A IS THE ONLY READ-ONLY ONE. Creating a deployment is a write that
 * starts a build; calling everything before promotion a "dry run" was wrong.
 */

import {
  preflightDecision, createOutcome, promotionDecision, verifyHosts,
  type ApprovedBuild, type PreflightFacts, type PromotionFacts,
  type HostObservation, type Read, type CandidateRecord, type CreationReceipt,
} from "./_releaseControl";

export type IntentRecord = {
  at: string;
  candidateId: string;
  sha: string;
  outgoingDeploymentId: string;
  outgoingAliases: readonly string[];
};

export type ReleaseIO = {
  /* phase A — reads only */
  readGithubRepoId: () => Promise<Read<number>>;
  readProjectLink: () => Promise<Read<number>>;
  readFreshMain: () => Promise<string | null>;
  readCommitTree: (sha: string) => Promise<Read<{ truncated: boolean; paths: readonly string[] }>>;
  readProjectSettings: () => Promise<Read<ApprovedBuild>>;
  readCurrentProduction: () => Promise<Read<{ deploymentId: string; aliases: readonly string[] }>>;

  /* phase B — writes */
  createDeployment: (sha: string) => Promise<{ id?: string | null; error?: unknown }>;
  /** MUST throw on any failure to persist. Phase C refuses without it. */
  recordCreation: (r: CreationReceipt) => Promise<void>;

  /* phase C — reads then the one mutation */
  readCandidate: (id: string) => Promise<Read<CandidateRecord>>;
  loadCreationReceipt: (candidateId: string) => Promise<Read<CreationReceipt>>;
  acquireLock: (info: { sha: string }) => Promise<{ ok: true } | { ok: false; heldBy: string }>;
  releaseLock: () => Promise<void>;
  /** MUST throw on any failure to persist. A refusal depends on it. */
  recordIntent: (r: IntentRecord) => Promise<void>;
  promoteDeployment: (id: string) => Promise<void>;
  recordCompletion: (r: IntentRecord) => Promise<void>;
  observeHosts: (expected: { deploymentId: string; sha: string }) => Promise<readonly HostObservation[]>;

  operator: () => string;
  host: () => string;
  log: (line: string) => void;
};

export type RunResult =
  | { ok: true; phase: "preflight"; sha: string; outgoing: string }
  | { ok: true; phase: "create"; candidateId: string; sha: string }
  | { ok: true; phase: "promote"; candidateId: string; sha: string; replaced: string }
  | { ok: false; phase: string; code: string; detail: string }
  | { ok: false; phase: "promote"; code: "INCOMPLETE"; detail: string; problems: readonly string[] };

export async function runRelease(
  opts: { phase: "preflight" | "create" | "promote"; approvedSha?: string; candidateId?: string },
  approved: ApprovedBuild,
  approvedRedirectHosts: readonly string[],
  io: ReleaseIO,
  canonical: { projectId: string; target: string; repoId: number }
): Promise<RunResult> {
  /* ── A ─────────────────────────────────────────────────────────────── */
  const facts: PreflightFacts = {
    canonicalRepoId: canonical.repoId,
    githubRepoId: await io.readGithubRepoId(),
    vercelLinkRepoId: await io.readProjectLink(),
    freshMainSha: await io.readFreshMain(),
    commitTree: { read: false, why: "not read" },
    projectSettings: await io.readProjectSettings(),
    currentProduction: await io.readCurrentProduction(),
  };
  if (facts.freshMainSha) facts.commitTree = await io.readCommitTree(facts.freshMainSha);

  const pre = preflightDecision(facts, approved);
  if (!pre.ok) return { ok: false, phase: "preflight", code: pre.code, detail: pre.detail };
  io.log(`  preflight OK — main ${pre.sha.slice(0, 7)}, replacing ${pre.outgoing.deploymentId}`);
  if (opts.phase === "preflight") {
    return { ok: true, phase: "preflight", sha: pre.sha, outgoing: pre.outgoing.deploymentId };
  }

  /* ── B ─────────────────────────────────────────────────────────────── */
  if (opts.phase === "create") {
    // THE APPROVAL NAMES A COMMIT. Creating a build of a different one is not
    // the release that was approved, however current that other commit is.
    if (opts.approvedSha && opts.approvedSha !== pre.sha)
      return { ok: false, phase: "create", code: "MAIN_MOVED",
        detail: `approved ${opts.approvedSha.slice(0, 7)}, main is now ${pre.sha.slice(0, 7)} — approve again` };

    // THE LOCK STARTS HERE, not at promotion. A build is already a write, and
    // two concurrent creates are two builds nobody asked for. It is NOT
    // released by this phase: it is held across processes until phase C reaches
    // a definite outcome.
    const lock = await io.acquireLock({ sha: pre.sha });
    if (!lock.ok) return { ok: false, phase: "create", code: "LOCKED", detail: lockedDetail(lock.heldBy) };

    const r = await io.createDeployment(pre.sha).catch((e) => ({ error: e }));
    const out = createOutcome((r as { id?: string | null }).id, (r as { error?: unknown }).error);
    if (!out.ok) {
      // The lock is deliberately NOT released: a build may be running and its
      // outcome is unknown, which is exactly when another release must not start.
      return { ok: false, phase: "create", code: out.code,
        detail: `${out.detail} The release lock is deliberately still held.` };
    }

    // THE RECEIPT. Phase C promotes only what phase B created, and a
    // caller-supplied environment variable is not evidence of that.
    const receipt: CreationReceipt = {
      runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      candidateId: out.candidateId, sha: pre.sha, createdAt: new Date().toISOString(),
      operator: io.operator(), host: io.host(),
    };
    try { await io.recordCreation(receipt); }
    catch (e) {
      return { ok: false, phase: "create", code: "RECEIPT_NOT_RECORDED",
        detail: `deployment ${out.candidateId} was created but its receipt could not be written ` +
          `(${String(e).slice(0, 120)}). It cannot be promoted without one. The lock is still held.` };
    }
    io.log(`  created ${out.candidateId} from ${pre.sha.slice(0, 7)}`);
    return { ok: true, phase: "create", candidateId: out.candidateId, sha: pre.sha };
  }

  /* ── C ─────────────────────────────────────────────────────────────── */
  const candidateId = opts.candidateId;
  const approvedSha = opts.approvedSha;
  if (!candidateId || !approvedSha)
    return { ok: false, phase: "promote", code: "NO_APPROVED_CANDIDATE",
      detail: "promotion requires the candidate id and sha that phase B returned" };

  // The lock was taken by phase B and is still held. It is not re-acquired.
  let released = false;
  try {
    // Re-read AFTER approval and evidence, not once at the start.
    const pf: PromotionFacts = {
      candidateId, approvedSha,
      receipt: await io.loadCreationReceipt(candidateId),
      candidate: await io.readCandidate(candidateId),
      freshMainSha: await io.readFreshMain(),
      currentProductionId: await io.readCurrentProduction().then(
        (r) => (r.read ? { read: true as const, value: r.value.deploymentId } : r)
      ),
      outgoingAtPreflight: pre.outgoing.deploymentId,
    };
    const decision = promotionDecision(pf, approved, canonical);
    if (!decision.ok) return { ok: false, phase: "promote", code: decision.code, detail: decision.detail };

    // DURABLE INTENT BEFORE ANY MUTATION. A failed write refuses: a promotion
    // whose rollback target was never recorded is the failure this exists for.
    const record: IntentRecord = {
      at: new Date().toISOString(), candidateId, sha: approvedSha,
      outgoingDeploymentId: pre.outgoing.deploymentId, outgoingAliases: pre.outgoing.aliases,
    };
    try { await io.recordIntent(record); }
    catch (e) {
      return { ok: false, phase: "promote", code: "RECORD_FAILED",
        detail: `rollback target could not be recorded, so nothing was promoted: ${String(e).slice(0, 160)}` };
    }

    try { await io.promoteDeployment(candidateId); }
    catch (e) {
      // A DEFINITE refusal releases the lock; an AMBIGUOUS one does not.
      //
      // A 4xx means the promotion did not happen. A dropped connection or a
      // timeout means nobody knows, and releasing the lock then invites a second
      // release into an unknown state.
      const definite = (e as { definite?: boolean }).definite === true;
      if (!definite) {
        released = true; // suppress the finally; the lock stays.
        return { ok: false, phase: "promote", code: "PROMOTE_UNCERTAIN",
          detail: `the promote request did not complete: ${String(e).slice(0, 160)}. ` +
            `The outcome is unknown and the lock is deliberately still held — establish what happened before retrying.` };
      }
      return { ok: false, phase: "promote", code: "PROMOTE_FAILED", detail: String(e).slice(0, 200) };
    }
    await io.recordCompletion(record).catch(() => undefined);

    const v = verifyHosts(await io.observeHosts({ deploymentId: candidateId, sha: approvedSha }),
      { deploymentId: candidateId, sha: approvedSha }, approvedRedirectHosts);
    if (!v.complete) {
      // The target moved and routing did not follow. NOT a failure: the
      // rollback record stands and the operator decides. Nothing is remediated
      // automatically.
      return { ok: false, phase: "promote", code: "INCOMPLETE",
        detail: "promoted, but routing did not verify. The rollback target is recorded; no automatic remediation.",
        problems: v.problems };
    }
    return { ok: true, phase: "promote", candidateId, sha: approvedSha, replaced: pre.outgoing.deploymentId };
  } finally {
    if (!released) await io.releaseLock().catch(() => undefined);
  }
}

function lockedDetail(heldBy: string): string {
  return `a release is already in progress on the designated release machine: ${heldBy}. ` +
    `A lock file coordinates ONE machine and has no authority over the dashboard, another token, ` +
    `or the Git integration. Stale locks are never cleared automatically — establish what happened ` +
    `to that run first.`;
}
