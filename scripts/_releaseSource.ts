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
  | { ok: false; reason: OriginRefusal };

export type OriginRefusal =
  | "no_trust_basis"      // basis UNVERIFIED, undated, or missing a field this decision uses
  | "absent"              // no record, or no gitSource on it
  | "malformed"           // a required field missing or wrongly shaped
  | "not_git_source"      // source is absent or is not "git"
  | "wrong_provider"      // gitSource names something other than GitHub
  | "record_mismatch";    // the record is not the candidate we asked about

/** Every field verifiedOrigin() decides on. The basis must cover all of them. */
export const ORIGIN_DECISION_FIELDS = [
  "source", "gitSource.type", "gitSource.org", "gitSource.repo", "gitSource.ref", "gitSource.sha",
] as const;

/**
 * Is this basis usable AT ALL?
 *
 * An OBSERVED state on its own means nothing: `{state:"OBSERVED"}` with no date
 * and no fields asserts that someone looked, without saying when or at what. So
 * the basis must be dated, must list fields, and must cover EVERY field the
 * decision reads — a basis that vouches for `gitSource.sha` while the decision
 * also reads `source` is not a basis for this decision.
 */
export function basisCovers(basis: OriginTrustBasis, fields: readonly string[] = ORIGIN_DECISION_FIELDS): boolean {
  if (basis.state !== "OBSERVED") return false;
  if (!basis.observedOn || basis.observedOn.trim() === "") return false;
  if (basis.trustedFields.length === 0) return false;
  return fields.every((f) => basis.trustedFields.includes(f));
}

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
/** What the record must prove it IS, before anything it says is read. */
export type ExpectedRecord = {
  deploymentId: string;
  projectId: string;
  target: string;
  provider: string;
};

export function verifiedOrigin(
  raw: unknown,
  /**
   * Injectable ONLY so the downstream checks can be exercised before an
   * observation exists. Defaults to the module constant, so production and any
   * caller that forgets the argument get the fail-closed behavior.
   */
  basis: OriginTrustBasis = ORIGIN_TRUST_BASIS,
  /**
   * The candidate this record is supposed to describe. Without it, a record for
   * SOME OTHER deployment satisfies every field check — which is how a valid
   * record for a different, canonical deployment could vouch for the one being
   * promoted.
   */
  expected?: ExpectedRecord
): OriginResult {
  if (!basisCovers(basis)) return { ok: false, reason: "no_trust_basis" };
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "absent" };

  const d = raw as Record<string, unknown>;

  // IS THIS EVEN THE RIGHT RECORD? Checked before anything it asserts is read.
  if (expected) {
    const id = str(d.uid) ?? str(d.id);
    if (id !== expected.deploymentId) return { ok: false, reason: "record_mismatch" };
    if (str(d.projectId) !== expected.projectId) return { ok: false, reason: "record_mismatch" };
    if (str(d.target) !== expected.target) return { ok: false, reason: "record_mismatch" };
    const rs = str(d.readyState) ?? str(d.state);
    if (rs !== "READY") return { ok: false, reason: "record_mismatch" };
  }

  // A CLI upload is never canonical, and NEITHER IS A RECORD THAT DECLINES TO
  // SAY. The earlier version let a missing `source` through, so the field that
  // exists to identify a Git-integration build could simply be omitted.
  const source = str(d.source);
  if (source !== "git") return { ok: false, reason: "not_git_source" };

  const gs = d.gitSource;
  if (typeof gs !== "object" || gs === null) return { ok: false, reason: "absent" };
  const g = gs as Record<string, unknown>;

  // EXACTLY THE FIELDS THE BASIS NAMES — no alternatives.
  //
  // These used to fall back to provider/owner/branch/commitSha, none of which
  // the basis covers. A record supplying only the fallbacks verified against a
  // basis that had never observed them, so the coverage check was decorative:
  // it vouched for one schema while the adapter read another. The observation
  // must establish THE schema; until it does there is nothing to fall back to.
  const provider = str(g.type);
  const owner = str(g.org);
  const repo = str(g.repo);
  const ref = str(g.ref);
  const sha = str(g.sha);

  if (!provider || !owner || !repo || !ref || !sha) return { ok: false, reason: "malformed" };
  if (!SHA.test(sha)) return { ok: false, reason: "malformed" };
  // The provider is DECIDED, not merely recorded. "gitlab" is a Git source and
  // is not this repository's host.
  if (expected && provider !== expected.provider) return { ok: false, reason: "wrong_provider" };

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
/**
 * A value that was READ, versus one that was never looked up.
 *
 * The adapter used to hardcode `commitVercelJsonBuildCommand: null` — meaning
 * "no override" — without reading anything. Null cannot carry both "we looked
 * and there is none" and "we never looked", because the first permits and the
 * second must refuse. So the distinction is in the type and the adapter cannot
 * express the absence by accident.
 */
export type Read<T> = { read: true; value: T } | { read: false; why: string };

export type BuildEvidence = {
  /**
   * The command Vercel ACTUALLY built this deployment with.
   *
   * `read:false` when the record did not carry it, or when two fields disagreed
   * about it — a contradiction is not something to pick a winner from.
   */
  effectiveBuildCommand: Read<string | null>;
  /** `buildCommand` in vercel.json AT THE BUILT COMMIT. Must be genuinely read. */
  commitVercelJsonBuildCommand: Read<string | null>;
  /** SHA on the guard's line in this deployment's build log. Corroboration only. */
  guardLineSha: string | null;
  /** The project's command NOW. Drift detection only. */
  projectBuildCommandNow: Read<string | null>;
};

export type EvidenceRefusal =
  | "BUILD_CONFIG_UNKNOWN"
  | "BUILD_COMMAND_NOT_APPROVED"
  | "BUILD_COMMAND_OVERRIDDEN"
  | "BUILD_COMMAND_CONTRADICTORY"
  | "GUARD_SHA_MISMATCH"
  | "BUILD_COMMAND_CHANGED";

/**
 * Refuse unless this deployment was built by the approved command.
 *
 * Configuration is the authority; the log line may only CONTRADICT. Anything
 * unread is a refusal rather than a default, because every default here is a
 * permission granted by an adapter that did no work.
 */
export function evidenceRefusal(
  e: BuildEvidence | null | undefined,
  approvedCommand: string,
  deploymentSha: string
): { code: EvidenceRefusal; detail: string } | null {
  if (!e) return { code: "BUILD_CONFIG_UNKNOWN", detail: "no build evidence collected" };

  if (!e.commitVercelJsonBuildCommand.read)
    return { code: "BUILD_CONFIG_UNKNOWN",
      detail: `vercel.json at the built commit was not read: ${e.commitVercelJsonBuildCommand.why}` };
  if (e.commitVercelJsonBuildCommand.value !== null)
    return { code: "BUILD_COMMAND_OVERRIDDEN",
      detail: "vercel.json at the built commit overrides the project Build Command" };

  if (!e.effectiveBuildCommand.read)
    return { code: "BUILD_CONFIG_UNKNOWN",
      detail: `effective build command not established: ${e.effectiveBuildCommand.why}` };
  if (e.effectiveBuildCommand.value === null)
    return { code: "BUILD_CONFIG_UNKNOWN", detail: "deployment record carries no build command" };
  if (e.effectiveBuildCommand.value !== approvedCommand)
    return { code: "BUILD_COMMAND_NOT_APPROVED",
      detail: "this deployment was not built by the approved provenance command" };

  if (e.guardLineSha !== null && e.guardLineSha !== deploymentSha)
    return { code: "GUARD_SHA_MISMATCH",
      detail: `guard line names ${e.guardLineSha.slice(0, 7)}, deployment is ${deploymentSha.slice(0, 7)}` };

  if (!e.projectBuildCommandNow.read)
    return { code: "BUILD_CONFIG_UNKNOWN",
      detail: `project Build Command could not be read for drift: ${e.projectBuildCommandNow.why}` };
  if (e.projectBuildCommandNow.value !== approvedCommand)
    return { code: "BUILD_COMMAND_CHANGED",
      detail: "project Build Command has since changed — investigate before releasing again" };

  return null;
}

/**
 * Resolve the effective build command from a deployment record.
 *
 * Two fields can carry it. Preferring one silently is how a contradictory
 * fixture passed: the record said `buildCommand: "npm run build"` and
 * `projectSettings.buildCommand: <approved>`, and the adapter took the one that
 * agreed with it. If both are present and differ, nothing here is entitled to
 * choose — that is a refusal.
 */
export function resolveEffectiveBuildCommand(
  deploymentBuildCommand: string | null | undefined,
  projectSettingsBuildCommand: string | null | undefined
): Read<string | null> {
  const a = deploymentBuildCommand ?? null;
  const b = projectSettingsBuildCommand ?? null;
  if (a !== null && b !== null && a !== b)
    return { read: false, why: "deployment.buildCommand and projectSettings.buildCommand disagree" };
  const v = a ?? b;
  return v === null
    ? { read: false, why: "neither deployment.buildCommand nor projectSettings.buildCommand is present" }
    : { read: true, value: v };
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
