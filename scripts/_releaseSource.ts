/**
 * Where a deployment actually came from, and what its build actually did.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * _releaseProvenance decided origin from `meta.github*`. Vercel's `meta` is
 * CALLER-SUPPLIED — `vercel deploy --meta githubCommitRef=main` sets exactly the
 * fields that check read — so a CLI upload could assert canonical origin. That
 * is a defect in the UNMERGED release tool, not a live production exploit; the
 * tool has never gated a real promotion.
 *
 * THE TRUST BASIS IS DECLARED, NOT ASSUMED
 *
 * Replacing `meta` with `gitSource` is only an improvement if `gitSource` is
 * actually platform-populated. Diffing one ordinary Git deployment against one
 * ordinary CLI deployment shows *differences*; it does not show which fields a
 * caller CANNOT influence. So this module fails closed on an undeclared basis:
 * ORIGIN_TRUST_BASIS records what has been established by observation, and
 * verifiedOrigin() refuses everything while it is UNVERIFIED.
 *
 * The effect is deliberate. Until someone does the observation and records it,
 * the release tool refuses every promotion rather than granting one on an
 * assumption. That is the safe direction for a check whose entire job is to
 * distrust the caller.
 */

/**
 * What has actually been established about Vercel's deployment record.
 *
 * "UNVERIFIED" until an operator has captured a Git-triggered deployment AND a
 * CLI deployment that ATTEMPTS to forge each field below, and recorded which
 * fields the forgery could not reach. Not a diff of two ordinary deployments —
 * an adversarial one.
 */
export type OriginTrustBasis = {
  state: "UNVERIFIED" | "OBSERVED";
  observedOn: string | null;
  trustedFields: readonly string[];
  note: string;
};

export const ORIGIN_TRUST_BASIS: OriginTrustBasis = {
  state: "UNVERIFIED",
  observedOn: null,
  trustedFields: [],
  note:
    "Set state to OBSERVED only after an adversarial capture: a `vercel deploy` " +
    "that tries to set gitSource/source and the recorded result. List only the " +
    "fields the attempt could NOT set.",
};

export type VerifiedOrigin = {
  provider: string;
  owner: string;
  repo: string;
  ref: string;
  sha: string;
};

export type OriginResult =
  | { ok: true; origin: VerifiedOrigin }
  | { ok: false; reason: "no_trust_basis" | "absent" | "malformed" | "not_git_source" };

const SHA = /^[0-9a-f]{40}$/;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * Read origin from the platform's own fields — never from `meta`.
 *
 * `raw` is the deployment record as the API returned it. Anything absent,
 * empty, wrongly typed, or not a Git-integration source is a refusal. There is
 * deliberately no fallback to `meta`: a fallback would restore the defect on
 * exactly the deployments that most need refusing.
 */
export function verifiedOrigin(
  raw: unknown,
  /**
   * Injectable ONLY so the downstream checks can be exercised before an
   * observation exists. It defaults to the module constant, so production and
   * any caller that forgets the argument get the fail-closed behavior.
   */
  basis: OriginTrustBasis = ORIGIN_TRUST_BASIS
): OriginResult {
  if (basis.state !== "OBSERVED") return { ok: false, reason: "no_trust_basis" };
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "absent" };

  const d = raw as Record<string, unknown>;
  const source = str(d.source);
  // A CLI upload is never canonical, whatever it says about itself.
  if (source !== null && source !== "git") return { ok: false, reason: "not_git_source" };

  const gs = d.gitSource;
  if (typeof gs !== "object" || gs === null) return { ok: false, reason: "absent" };
  const g = gs as Record<string, unknown>;

  const provider = str(g.type) ?? str(g.provider);
  const owner = str(g.org) ?? str(g.owner);
  const repo = str(g.repo);
  const ref = str(g.ref) ?? str(g.branch);
  const sha = str(g.sha) ?? str(g.commitSha);

  if (!provider || !owner || !repo || !ref || !sha) return { ok: false, reason: "malformed" };
  if (!SHA.test(sha)) return { ok: false, reason: "malformed" };

  return { ok: true, origin: { provider, owner, repo, ref, sha } };
}

/* ────────────────────────────────────────────────────────────────────────
   BUILD EVIDENCE
   ──────────────────────────────────────────────────────────────────────── */

/**
 * What a deployment's own build did.
 *
 * `guardLineSha` is SUPPORTING EVIDENCE, NOT AUTHORITY. Any script can print
 * "PROVENANCE OK <sha>"; the line proves a string was emitted, not that the
 * approved guard ran. So it corroborates and it can REFUSE, but on its own it
 * may never permit. Authority comes from the effective build configuration —
 * the command the deployment was actually built with, and whether the built
 * commit overrode it.
 */
export type BuildEvidence = {
  /** Effective build command for THIS deployment, from its own record. Null = unknown. */
  effectiveBuildCommand: string | null;
  /** `buildCommand` in vercel.json AT THE BUILT COMMIT, if any. */
  commitVercelJsonBuildCommand: string | null;
  /** SHA on the guard's line in THIS deployment's build log. Corroboration only. */
  guardLineSha: string | null;
  /** The project's command NOW. Drift detection only — says nothing about a past build. */
  projectBuildCommandNow: string | null;
};

export type EvidenceRefusal =
  | "BUILD_CONFIG_UNKNOWN"
  | "BUILD_COMMAND_NOT_APPROVED"
  | "BUILD_COMMAND_OVERRIDDEN"
  | "GUARD_SHA_MISMATCH"
  | "BUILD_COMMAND_CHANGED";

/**
 * Refuse unless this deployment was built by the approved command.
 *
 * Order matters: configuration first, because that is the authority. The log
 * line is checked afterwards and only ever to CONTRADICT — a matching line adds
 * nothing that the configuration did not already establish.
 */
export function evidenceRefusal(
  e: BuildEvidence | null | undefined,
  approvedCommand: string,
  deploymentSha: string
): { code: EvidenceRefusal; detail: string } | null {
  if (!e) return { code: "BUILD_CONFIG_UNKNOWN", detail: "no build evidence collected" };

  if (e.commitVercelJsonBuildCommand !== null)
    return {
      code: "BUILD_COMMAND_OVERRIDDEN",
      detail: "vercel.json at the built commit overrides the project Build Command",
    };

  if (e.effectiveBuildCommand === null)
    return {
      code: "BUILD_CONFIG_UNKNOWN",
      detail: "this deployment's effective build command could not be established",
    };

  if (e.effectiveBuildCommand !== approvedCommand)
    return {
      code: "BUILD_COMMAND_NOT_APPROVED",
      detail: "this deployment was not built by the approved provenance command",
    };

  // Corroboration. A mismatched or absent line refuses; a matching one permits
  // nothing on its own.
  if (e.guardLineSha !== null && e.guardLineSha !== deploymentSha)
    return {
      code: "GUARD_SHA_MISMATCH",
      detail: `guard line names ${e.guardLineSha.slice(0, 7)}, deployment is ${deploymentSha.slice(0, 7)}`,
    };

  if (e.projectBuildCommandNow !== null && e.projectBuildCommandNow !== approvedCommand)
    return {
      code: "BUILD_COMMAND_CHANGED",
      detail: "project Build Command has since changed — investigate before releasing again",
    };

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   CURRENT PRODUCTION
   ──────────────────────────────────────────────────────────────────────── */

export type CurrentProduction = {
  deploymentId: string;
  aliases: readonly string[];
  readyState: string;
};

export type CurrentProductionResult =
  | { ok: true; current: CurrentProduction }
  | { ok: false; reason: "unreadable" | "malformed"; detail: string };

/**
 * Validate the API's ACTUAL response before any trusted value exists.
 *
 * The earlier version took an already-constructed `{ok:true, ...}` and inspected
 * its discriminant, so `{ok:true, deploymentId:"", aliases:[], readyState:"ERROR"}`
 * passed — the caller had already asserted the thing being checked. Validation
 * has to happen where the untrusted data enters.
 *
 * FAILS CLOSED. An unreadable current production is never "no current
 * production": that conflation makes a broken API call indistinguishable from a
 * first deploy, and it is the difference between a rollback target and none.
 */
export function parseCurrentProduction(
  raw: unknown,
  fetchError?: unknown
): CurrentProductionResult {
  if (fetchError) return { ok: false, reason: "unreadable", detail: String(fetchError).slice(0, 200) };
  if (typeof raw !== "object" || raw === null)
    return { ok: false, reason: "unreadable", detail: "no response body" };

  const d = raw as Record<string, unknown>;
  const id = str(d.uid) ?? str(d.id) ?? str(d.deploymentId);
  if (!id) return { ok: false, reason: "malformed", detail: "no deployment id" };

  const rs = str(d.readyState) ?? str(d.state);
  if (!rs) return { ok: false, reason: "malformed", detail: "no readyState" };
  if (rs !== "READY")
    return { ok: false, reason: "malformed", detail: `current production is ${rs}, not READY` };

  const rawAliases = d.alias ?? d.aliases;
  if (!Array.isArray(rawAliases) || rawAliases.length === 0)
    return { ok: false, reason: "malformed", detail: "no aliases on current production" };
  const aliases = rawAliases.map(str).filter((a): a is string => a !== null);
  if (aliases.length !== rawAliases.length)
    return { ok: false, reason: "malformed", detail: "alias list contains empty or non-string entries" };

  return { ok: true, current: { deploymentId: id, aliases, readyState: rs } };
}
