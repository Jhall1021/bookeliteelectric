/**
 * The release, as a sequence — with every side effect injected.
 *
 * WHY AN ORCHESTRATOR EXISTS AT ALL
 *
 * The decisions were already pure and already tested. What was NOT tested was
 * the thing that actually matters operationally: that when a decision refuses,
 * NO PROMOTION REQUEST IS SENT. A refusal that is computed and then ignored by
 * the caller is not a guard, and no test of a pure function can see that.
 *
 * So the effects are parameters. The tests hand in recording fakes and assert
 * `assignAlias` was called zero times — an assertion about the network that
 * needs no network.
 */

import { CANONICAL, decidePromotion, type Candidate } from "./_releaseProvenance";
import {
  parseCurrentProduction, verifiedOrigin, evidenceRefusal,
  ORIGIN_TRUST_BASIS, type BuildEvidence, type OriginTrustBasis,
} from "./_releaseSource";

export type ReleaseEffects = {
  /** Raw current-production record, or a thrown/returned error. */
  readCurrentProduction: () => Promise<{ raw?: unknown; error?: unknown }>;
  /** Fresh refs/heads/main, authenticated. Null = unreadable. */
  readFreshMain: () => Promise<string | null>;
  /** The candidate's raw deployment record, for origin. */
  readDeployment: (id: string) => Promise<unknown>;
  /** This deployment's own build evidence. */
  readBuildEvidence: (id: string) => Promise<BuildEvidence | null>;
  /**
   * THE ONLY MUTATION, and it is the one the real release performs:
   * POST /v10/projects/{id}/promote/{deployment}. Modelled as it actually is,
   * because an orchestrator that mutates differently from the entry point is a
   * second implementation wearing the first one's tests.
   */
  promoteDeployment: (deploymentId: string) => Promise<void>;
};

export type ReleaseOutcome =
  | { ok: true; promoted: string; sha: string; replaced: string; aliases: readonly string[] }
  | { ok: false; code: string; detail: string };

/**
 * Promote a candidate, or refuse and touch nothing.
 *
 * ORDER IS THE DESIGN. Everything that can refuse runs before the first
 * mutation, so a refusal is always a no-op rather than a partial release. The
 * current-production read comes FIRST: a promotion that cannot say what it
 * replaces has no rollback target, and finding that out after reassigning the
 * first alias is finding out too late.
 */
export async function promote(
  candidate: Candidate,
  mainAtSelection: string | null,
  approvedBuildCommand: string,
  fx: ReleaseEffects,
  /** Defaults to the module constant, so forgetting it fails closed. */
  basis: OriginTrustBasis = ORIGIN_TRUST_BASIS
): Promise<ReleaseOutcome> {
  // 1. What are we replacing? Unreadable or malformed stops everything.
  const cur = await fx.readCurrentProduction().then(
    (r) => parseCurrentProduction(r.raw, r.error),
    (e) => parseCurrentProduction(undefined, e)
  );
  if (!cur.ok) {
    return {
      ok: false,
      code: cur.reason === "unreadable" ? "CURRENT_PRODUCTION_UNREADABLE" : "CURRENT_PRODUCTION_MALFORMED",
      detail: cur.detail,
    };
  }

  // 2. Fresh main, authenticated.
  const fresh = await fx.readFreshMain().catch(() => null);

  // 3. Origin — from platform fields, never from meta.
  const rawDeployment = await fx.readDeployment(candidate.id).catch(() => null);
  const origin = verifiedOrigin(rawDeployment, basis);
  if (!origin.ok) {
    return {
      ok: false,
      code: "ORIGIN_UNVERIFIED",
      detail:
        origin.reason === "no_trust_basis"
          ? "origin trust basis is UNVERIFIED — record an adversarial observation before releasing"
          : `git origin could not be established (${origin.reason})`,
    };
  }

  // 4. The existing decision, with origin supplied by the verified adapter.
  const decision = decidePromotion(
    { ...candidate,
      githubDeployment: true,
      githubOrg: origin.origin.owner,
      githubRepo: origin.origin.repo,
      githubRef: origin.origin.ref,
      githubSha: origin.origin.sha,
    },
    mainAtSelection,
    fresh
  );
  if (!decision.ok) return { ok: false, code: decision.code, detail: decision.detail };

  // 5. How was THIS deployment actually built?
  const evidence = await fx.readBuildEvidence(candidate.id).catch(() => null);
  const bad = evidenceRefusal(evidence, approvedBuildCommand, origin.origin.sha);
  if (bad) return { ok: false, code: bad.code, detail: bad.detail };

  // 6. Only now does anything change.
  await fx.promoteDeployment(candidate.id);

  return {
    ok: true,
    promoted: candidate.id,
    sha: decision.sha,
    replaced: cur.current.deploymentId,
    aliases: cur.current.aliases,
  };
}
