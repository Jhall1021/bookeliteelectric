/**
 * The release, as two phases — with every side effect injected.
 *
 * VALIDATION AND APPLICATION ARE SEPARATE, and that is the correction that
 * matters most here. They were one function that always called
 * `promoteDeployment`, so the real command's dry run — whose promote effect
 * throws on purpose — could never reach its own success path. A dry run that
 * cannot succeed is not a dry run; it is a way of never testing the thing you
 * are about to do.
 *
 *   validateRelease   reads everything, decides, MUTATES NOTHING. A dry run
 *                     stops here and can succeed.
 *   applyRelease      re-checks what may have moved, records the rollback
 *                     target, and only then promotes.
 *
 * Effects are parameters so the tests can hand in recording fakes and assert
 * the thing that actually matters: on every refusal, zero promotion requests.
 */

import { CANONICAL, decidePromotion, type Candidate } from "./_releaseProvenance";
import {
  parseCurrentProduction, verifiedOrigin, evidenceRefusal,
  ORIGIN_TRUST_BASIS, type BuildEvidence, type OriginTrustBasis,
} from "./_releaseSource";

/** Everything the release intends to do, written down before it does any of it. */
export type ReleasePlan = {
  candidateId: string;
  sha: string;
  /** The deployment being replaced — the rollback target. */
  replaced: string;
  replacedAliases: readonly string[];
  hosts: readonly string[];
};

export type ReadEffects = {
  readCurrentProduction: () => Promise<{ raw?: unknown; error?: unknown }>;
  readFreshMain: () => Promise<string | null>;
  readDeployment: (id: string) => Promise<unknown>;
  readBuildEvidence: (id: string) => Promise<BuildEvidence | null>;
};

export type WriteEffects = {
  /**
   * Persist the intent and the rollback target BEFORE anything changes.
   *
   * A throw here must stop the release. The record used to be written after the
   * promote request, so the one failure mode it exists for — a promotion whose
   * outcome nobody can undo — was the one it could not cover.
   */
  recordIntent: (plan: ReleasePlan) => Promise<void>;
  /** THE ONLY MUTATION: POST /v10/projects/{id}/promote/{deployment}. */
  promoteDeployment: (deploymentId: string) => Promise<void>;
  /** Completion, recorded separately so the log distinguishes intended from done. */
  recordCompletion: (plan: ReleasePlan) => Promise<void>;
};

export type ReleaseEffects = ReadEffects & WriteEffects;

export type ValidationResult =
  | { ok: true; plan: ReleasePlan }
  | { ok: false; code: string; detail: string };

export type ReleaseOutcome =
  | { ok: true; plan: ReleasePlan }
  | { ok: false; code: string; detail: string };

/**
 * Decide whether this candidate may be promoted. READS ONLY.
 *
 * Nothing in here can mutate, which is what lets a dry run exercise the real
 * decision path rather than a parallel one that resembles it.
 */
export async function validateRelease(
  candidate: Candidate,
  mainAtSelection: string | null,
  approvedBuildCommand: string,
  fx: ReadEffects,
  basis: OriginTrustBasis = ORIGIN_TRUST_BASIS
): Promise<ValidationResult> {
  // 1. What are we replacing? Unreadable or malformed stops everything, because
  //    a promotion that cannot name its rollback target has none.
  const cur = await fx.readCurrentProduction().then(
    (r) => parseCurrentProduction(r.raw, r.error),
    (e) => parseCurrentProduction(undefined, e)
  );
  if (!cur.ok)
    return { ok: false,
      code: cur.reason === "unreadable" ? "CURRENT_PRODUCTION_UNREADABLE" : "CURRENT_PRODUCTION_MALFORMED",
      detail: cur.detail };

  // 2. Origin — platform fields only, and the record must BE this candidate's.
  const rawDeployment = await fx.readDeployment(candidate.id).catch(() => null);
  const origin = verifiedOrigin(rawDeployment, basis, {
    deploymentId: candidate.id,
    projectId: CANONICAL.vercelProjectId,
    target: CANONICAL.target,
    provider: CANONICAL.provider,
  });
  if (!origin.ok)
    return { ok: false, code: "ORIGIN_UNVERIFIED",
      detail: origin.reason === "no_trust_basis"
        ? "origin trust basis is UNVERIFIED, undated, or does not cover every field this decision reads"
        : `git origin could not be established (${origin.reason})` };

  // 3. How was THIS deployment actually built? Before the main re-read, so the
  //    re-read is the LAST thing before a decision rather than the middle of it.
  const evidence = await fx.readBuildEvidence(candidate.id).catch(() => null);
  const bad = evidenceRefusal(evidence, approvedBuildCommand, origin.origin.sha);
  if (bad) return { ok: false, code: bad.code, detail: bad.detail };

  // 4. Fresh main LAST, so nothing slow happens between reading it and deciding
  //    on it. main moved during evidence collection and the old order promoted
  //    anyway, because it had read main before doing the slow work.
  const fresh = await fx.readFreshMain().catch(() => null);
  const decision = decidePromotion(
    { ...candidate, githubDeployment: true,
      githubOrg: origin.origin.owner, githubRepo: origin.origin.repo,
      githubRef: origin.origin.ref, githubSha: origin.origin.sha },
    mainAtSelection, fresh
  );
  if (!decision.ok) return { ok: false, code: decision.code, detail: decision.detail };

  return { ok: true, plan: {
    candidateId: candidate.id, sha: decision.sha,
    replaced: cur.current.deploymentId, replacedAliases: cur.current.aliases,
    hosts: CANONICAL.canonicalHosts,
  } };
}

/**
 * Carry out a validated plan.
 *
 * RE-READS MAIN IMMEDIATELY BEFORE MUTATING. Validation involved several
 * network round trips, and `main` can move across them; a plan is a decision
 * about a moment, and this is the check that the moment still holds.
 *
 * RECORDS THE ROLLBACK TARGET BEFORE PROMOTING. If the record cannot be
 * written, the release does not happen — an unrecoverable promotion is worse
 * than a delayed one.
 */
export async function applyRelease(plan: ReleasePlan, fx: ReleaseEffects): Promise<ReleaseOutcome> {
  const fresh = await fx.readFreshMain().catch(() => null);
  if (!fresh) return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub main unreadable at apply time" };
  if (fresh !== plan.sha)
    return { ok: false, code: "MAIN_MOVED",
      detail: `main was ${plan.sha.slice(0, 7)} when validated and is ${fresh.slice(0, 7)} now — validate again` };

  try {
    await fx.recordIntent(plan);
  } catch (e) {
    return { ok: false, code: "RECORD_FAILED",
      detail: `rollback target could not be recorded, so nothing was promoted: ${String(e).slice(0, 160)}` };
  }

  try {
    await fx.promoteDeployment(plan.candidateId);
  } catch (e) {
    return { ok: false, code: "PROMOTE_FAILED", detail: String(e).slice(0, 200) };
  }

  // Completion is recorded separately: the intent record already carries the
  // rollback target, so a failure here loses bookkeeping rather than recovery.
  await fx.recordCompletion(plan).catch(() => undefined);
  return { ok: true, plan };
}
