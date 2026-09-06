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
  baselineRefusal, receiptRefusal,
  type ApprovedBuild, type PreflightFacts, type PromotionFacts,
  type HostObservation, type Read, type CandidateRecord, type CreationReceipt,
  type AliasMapping,
} from "./_releaseControl";

export type IntentRecord = {
  at: string;
  candidateId: string;
  sha: string;
  outgoingDeploymentId: string;
  outgoingAliases: readonly AliasMapping[];
  runId: string;
};

export type ReleaseIO = {
  /* phase A — reads only */
  readGithubRepoId: () => Promise<Read<number>>;
  readProjectLink: () => Promise<Read<number>>;
  readFreshMain: () => Promise<string | null>;
  readCommitTree: (sha: string) => Promise<Read<{ truncated: boolean; paths: readonly string[] }>>;
  readProjectSettings: () => Promise<Read<ApprovedBuild>>;
  /** Current-project fact, not candidate evidence. See PreflightFacts. */
  readAutoAssignCustomDomains: () => Promise<Read<boolean>>;
  readCurrentProduction: () => Promise<Read<{ deploymentId: string; aliases: readonly string[] }>>;

  /**
   * Per-host alias mappings — the run's recovery baseline.
   *
   * Returns a Read: a failed alias API call must NOT arrive as a list of nulls
   * that looks like "nothing is mapped".
   */
  readAliasMappings: () => Promise<Read<readonly AliasMapping[]>>;
  /** The production target, re-read after promoting. */
  readProductionTarget: () => Promise<Read<string>>;

  /* phase B — writes */
  createDeployment: (sha: string) => Promise<{ id?: string | null; error?: unknown }>;
  /** MUST throw on any failure to persist. Phase C refuses without it. */
  recordCreation: (r: CreationReceipt) => Promise<void>;

  /* phase C — reads then the one mutation */
  readCandidate: (id: string) => Promise<Read<CandidateRecord>>;
  loadCreationReceipt: (candidateId: string) => Promise<Read<CreationReceipt>>;
  acquireLock: (info: { sha: string; runId: string }) => Promise<{ ok: true } | { ok: false; heldBy: string }>;
  /** Which run holds the lock. Phase C may act only if it is this one. */
  readLockOwner: () => Promise<Read<string>>;
  /**
   * ATOMICALLY claim the promotion of this candidate, once.
   *
   * Two concurrent phase-C processes both promoted, and a receipt could be
   * promoted a second time after the lock was gone. This is the one-shot claim
   * that makes both impossible.
   */
  claimPromotion: (runId: string, candidateId: string) => Promise<{ ok: true } | { ok: false; why: string }>;
  /** Releases ONLY if this run owns it. Never another run's lock. */
  releaseLock: (runId: string) => Promise<void>;
  /** MUST throw on any failure to persist. A refusal depends on it. */
  recordIntent: (r: IntentRecord) => Promise<void>;
  promoteDeployment: (id: string) => Promise<void>;
  /** The promotion was ACCEPTED. Not the same as the release being verified. */
  recordPromotionAccepted: (r: IntentRecord) => Promise<void>;
  /** The release was VERIFIED. Only written when all three checks agree. */
  recordReleaseVerified: (r: IntentRecord) => Promise<void>;
  /** Verification could not complete. The run stays blocked for a person. */
  recordRecoveryRequired: (r: IntentRecord, why: string) => Promise<void>;
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
  | { ok: false; phase: "promote"; code: "INCOMPLETE"; detail: string; problems: readonly string[] }
  | { ok: false; phase: "promote"; code: "RECOVERY_REQUIRED"; detail: string;
      candidateId: string; outgoing: string; outgoingAliases: readonly AliasMapping[] };

export async function runRelease(
  opts: { phase: "preflight" | "create" | "promote"; approvedSha?: string; candidateId?: string },
  approved: ApprovedBuild,
  approvedRedirectHosts: readonly string[],
  io: ReleaseIO,
  canonical: { projectId: string; target: string; repoId: number },
  /** The hosts a recovery baseline must cover. Defaults to the redirect set. */
  requiredHosts: readonly string[] = approvedRedirectHosts
): Promise<RunResult> {
  /* ── A ─────────────────────────────────────────────────────────────── */
  const facts: PreflightFacts = {
    canonicalRepoId: canonical.repoId,
    githubRepoId: await io.readGithubRepoId(),
    vercelLinkRepoId: await io.readProjectLink(),
    freshMainSha: await io.readFreshMain(),
    commitTree: { read: false, why: "not read" },
    projectSettings: await io.readProjectSettings(),
    autoAssignCustomDomains: await io.readAutoAssignCustomDomains(),
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
    // THE APPROVAL NAMES A COMMIT, AND IT IS NOT OPTIONAL.
    //
    // This was `if (opts.approvedSha && ...)`, so omitting it skipped the check
    // entirely and phase B built whatever main happened to be. An absent
    // approval is not an approval of anything.
    if (!opts.approvedSha || !/^[0-9a-f]{40}$/.test(opts.approvedSha))
      return { ok: false, phase: "create", code: "NO_APPROVED_SHA",
        detail: "phase B requires an explicit approved commit sha; it does not build whatever main is now" };
    if (opts.approvedSha !== pre.sha)
      return { ok: false, phase: "create", code: "MAIN_MOVED",
        detail: `approved ${opts.approvedSha.slice(0, 7)}, main is now ${pre.sha.slice(0, 7)} — approve again` };

    // THE LOCK STARTS HERE, not at promotion. A build is already a write, and
    // two concurrent creates are two builds nobody asked for. It is NOT
    // released by this phase: it is held across processes until phase C reaches
    // a definite outcome.
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const lock = await io.acquireLock({ sha: pre.sha, runId });
    if (!lock.ok) return { ok: false, phase: "create", code: "LOCKED", detail: lockedDetail(lock.heldBy) };

    // THE RECOVERY BASELINE IS CAPTURED BEFORE ANYTHING IS CREATED.
    //
    // It used to be read after the deployment existed and defaulted to [] on
    // failure, so a run could create a build and only then discover it had no
    // way back — or record whatever the aliases had drifted to during the build
    // as the thing it was replacing. A release that cannot describe its rollback
    // does not start.
    const baseline = await io.readAliasMappings().catch(
      (e): Read<readonly AliasMapping[]> => ({ read: false, why: `alias read threw: ${String(e).slice(0, 80)}` }));
    const bad = baselineRefusal(pre.outgoing.deploymentId, baseline, requiredHosts);
    if (bad) {
      // The lock is released: nothing was created, so nothing is in doubt.
        // Nothing was created, so nothing is in doubt — but whether the LOCK came
        // off is its own fact. This swallowed the failure and then told the
        // operator the lock was released, which is the sentence they act on. A
        // held lock nobody knows about blocks the next release and reads as a
        // stuck run.
        let lockOff = true;
        await io.releaseLock(runId).catch(() => { lockOff = false; });
        return { ok: false, phase: "create", code: bad.code,
          detail: lockOff
            ? `${bad.detail}. Nothing was created and the lock was released.`
            : `${bad.detail}. Nothing was created, but THE LOCK COULD NOT BE RELEASED and is still ` +
              `held by run ${runId}. Clear it deliberately; it will not clear itself.` };
    }

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
    // The baseline belongs to THIS run and travels with the receipt, so phase C
    // compares against what phase B saw rather than against itself.
    const receipt: CreationReceipt = {
      runId, candidateId: out.candidateId, sha: pre.sha, createdAt: new Date().toISOString(),
      operator: io.operator(), host: io.host(),
      outgoingDeploymentId: pre.outgoing.deploymentId,
      outgoingAliases: baseline.read ? baseline.value : [],
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

  // The lock was taken by phase B. This process must prove it owns that run
  // before it may promote — and must NOT release a lock it does not own.
  const receipt = await io.loadCreationReceipt(candidateId);
  const lockOwner = await io.readLockOwner();

  const pf: PromotionFacts = {
    candidateId, approvedSha,
    receipt, lockOwner,
    candidate: await io.readCandidate(candidateId),
    freshMainSha: await io.readFreshMain(),
    currentProductionId: await io.readCurrentProduction().then(
      (r) => (r.read ? { read: true as const, value: r.value.deploymentId } : r)
    ),
    outgoingAtCreation: receipt.read ? receipt.value.outgoingDeploymentId : "",
  };
  // A receipt whose recovery baseline is incomplete is not a receipt. Checked
  // here rather than trusted from the file, because readReceipt cannot know
  // which hosts this release requires.
  if (receipt.read) {
    const rb = receiptRefusal(receipt.value, requiredHosts);
    if (rb) return { ok: false, phase: "promote", code: rb.code, detail: rb.detail };
  }

  const decision = promotionDecision(pf, approved, canonical);
  // Deliberately OUTSIDE the try/finally: a run that is not the owner leaves
  // without touching the lock at all.
  if (!decision.ok) return { ok: false, phase: "promote", code: decision.code, detail: decision.detail };

  const runId = receipt.read ? receipt.value.runId : "";

  // ONE SHOT. Atomic, so two concurrent phase-C processes cannot both proceed,
  // and a receipt cannot be promoted twice.
  const claim = await io.claimPromotion(runId, candidateId);
  if (!claim.ok)
    return { ok: false, phase: "promote", code: "ALREADY_CLAIMED",
      detail: `${claim.why}. A candidate is promoted once; re-promoting is a new run.` };

  let released = false;
  try {

    // DURABLE INTENT BEFORE ANY MUTATION. A failed write refuses: a promotion
    // whose rollback target was never recorded is the failure this exists for.
    const record: IntentRecord = {
      at: new Date().toISOString(), candidateId, sha: approvedSha,
      outgoingDeploymentId: receipt.read ? receipt.value.outgoingDeploymentId : "",
      outgoingAliases: receipt.read ? receipt.value.outgoingAliases : [],
      runId,
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
    // PROMOTION ACCEPTED — distinct from the release being verified. The
    // journal must be able to say which of the two happened.
    // AFTER THE MUTATION, A FAILED RECORD IS NOT A DETAIL.
    //
    // Intent-before-mutation was already mandatory; everything after it was
    // best-effort. So a promotion could succeed while the journal never said so
    // — and recovery is read FROM the journal. A run that promoted and cannot
    // record it needs a person, not a success code.
    let acceptedUnrecorded = "";
    await io.recordPromotionAccepted(record)
      .catch((e) => { acceptedUnrecorded = String(e).slice(0, 120); });
    if (acceptedUnrecorded) {
      released = true; // the promotion happened; the lock stays for reconciliation
      return { ok: false, phase: "promote", code: "RECOVERY_REQUIRED",
        detail: `the promotion was accepted by Vercel but could not be recorded ` +
          `(${acceptedUnrecorded}). The lock is deliberately still held and nothing was remediated. ` +
          `Reconcile by hand: the candidate and the outgoing baseline are below.`,
        candidateId, outgoing: record.outgoingDeploymentId, outgoingAliases: record.outgoingAliases };
    }

    // VERIFICATION MAY FAIL BY THROWING, and that used to escape runRelease
    // entirely: the lock was released on the way out, a "completed" record had
    // already been written, and the caller saw an exception rather than a
    // recovery outcome. A promotion that happened and cannot be verified is the
    // state that most needs to be reported precisely.
    let v: { complete: boolean; problems: readonly string[] };
    try {
      v = verifyHosts(
        await io.observeHosts({ deploymentId: candidateId, sha: approvedSha }),
        { deploymentId: candidateId, sha: approvedSha }, approvedRedirectHosts,
        await io.readProductionTarget());
    } catch (e) {
      released = true; // the lock stays: the release is unresolved.
      let recNote = "";
      await io.recordRecoveryRequired(record, String(e).slice(0, 160))
        .catch((re) => { recNote = ` The recovery-required record ALSO failed to write (${String(re).slice(0, 80)}). ` +
          `The intent record written before the promotion is unaffected and still holds the rollback target; ` +
          `what the journal lacks is any description of THIS outcome, and this message is the only record of it.`; });
      return { ok: false, phase: "promote", code: "RECOVERY_REQUIRED",
        detail: `the promotion was accepted but verification could not complete ` +
          `(${String(e).slice(0, 120)}).${recNote} The lock is deliberately still held and nothing was ` +
          `remediated. Reconcile by hand: the candidate and the outgoing baseline are below.`,
        candidateId, outgoing: record.outgoingDeploymentId, outgoingAliases: record.outgoingAliases };
    }
    if (!v.complete) {
      // The target moved and routing did not follow. NOT a failure: the
      // rollback record stands and the operator decides. Nothing is remediated
      // automatically.
      released = true; // unresolved: the lock stays until a person decides.
      let incNote = "";
      await io.recordRecoveryRequired(record, v.problems.join("; "))
        // WHAT FAILED IS THE OUTCOME RECORD, NOT THE ROLLBACK TARGET.
        //
        // This said the rollback target was NOT in the journal. It is: the intent
        // record is written before the promotion and a failure to write it
        // returns RECORD_FAILED, so reaching here means it succeeded. Telling an
        // operator mid-incident that their rollback target is missing sends them
        // looking for something that is already on disk.
        .catch((re) => { incNote = ` The recovery-required outcome could not be written (${String(re).slice(0, 80)}). ` +
          `The rollback target remains in the earlier intent record; this message is the only record of ` +
          `the failed verification and the failed recovery write.`; });
      return { ok: false, phase: "promote", code: "INCOMPLETE",
        // The sentence must not say the target both is and is not recorded.
        detail: (incNote
          ? "promoted, but routing did not verify. The lock is still held and nothing was " +
            "remediated automatically." + incNote
          : "promoted, but routing did not verify. The rollback target is in the intent record and the " +
            "recovery-required outcome is recorded, the lock is still held, and nothing was remediated " +
            "automatically."),
        problems: v.problems };
    }
    let verifiedUnrecorded = "";
    await io.recordReleaseVerified(record).catch((e) => { verifiedUnrecorded = String(e).slice(0, 120); });
    if (verifiedUnrecorded) {
      // Routing verified, but the journal cannot say the release completed.
      // Ordinary success here would promise a record that is not there.
      released = true;
      return { ok: false, phase: "promote", code: "RECOVERY_REQUIRED",
        detail: `the release promoted and VERIFIED, but the completion record could not be written ` +
          `(${verifiedUnrecorded}). Routing is correct; the journal is incomplete. The lock is still ` +
          `held so the discrepancy is reconciled deliberately rather than discovered later.`,
        candidateId, outgoing: record.outgoingDeploymentId, outgoingAliases: record.outgoingAliases };
    }
    return { ok: true, phase: "promote", candidateId, sha: approvedSha,
      replaced: receipt.read ? receipt.value.outgoingDeploymentId : "" };
  } finally {
    // A REFUSAL USED TO SAY THE LOCK WAS RELEASED WHEN THAT WRITE FAILED. The
    // message is what an operator acts on, so it is emitted only when the
    // release actually happened.
    if (!released) {
      await io.releaseLock(runId).catch((e) => {
        io.log(`WARNING: the run lock could not be released (${String(e).slice(0, 100)}). ` +
          `It must be cleared deliberately; it will not clear itself.`);
      });
    }
  }
}

function lockedDetail(heldBy: string): string {
  return `a release is already in progress on the designated release machine: ${heldBy}. ` +
    `A lock file coordinates ONE machine and has no authority over the dashboard, another token, ` +
    `or the Git integration. Stale locks are never cleared automatically — establish what happened ` +
    `to that run first.`;
}
