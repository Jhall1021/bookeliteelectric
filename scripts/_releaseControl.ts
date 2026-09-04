/**
 * The controlled release — decisions, pure.
 *
 * Every function here is a decision about facts handed in. The effects that
 * gather those facts live in release-production.ts and are injected, so the
 * tests drive the REAL entry point rather than a second implementation that
 * resembles it.
 *
 * WHAT THE OBSERVATION CHANGED
 *
 * On 4 September a project-scoped Vercel token produced a deployment record
 * indistinguishable from a genuine git push: `source`, every `gitSource.*` and
 * every `meta.github*` were accepted from the request body, and the promote
 * endpoint took it with HTTP 201 and no origin validation.
 *
 * So nothing here reads a record to decide WHICH deployment is ours. The
 * release creates the deployment and keeps the id its own request returned.
 * Identity comes from causation, not attestation.
 *
 * THE BOUNDARY, STATED WHERE IT CANNOT BE MISSED. This controls releases made
 * through this tool. It does not stop anyone holding promotion credentials from
 * calling Vercel directly. Credential custody is the primary control; this is
 * second.
 */

/** Settings a build must have been made with. Compared TWICE — see below. */
export type ApprovedBuild = {
  rootDirectory: string | null;
  installCommand: string | null;
  buildCommand: string;
  outputDirectory: string;
  framework: string | null;
};

/**
 * Every filename Vercel honors as project configuration.
 *
 * Checking `vercel.json` alone was insufficient: a `vercel.toml` or `vercel.ts`
 * at the built commit overrides the project settings just as effectively, and
 * absence has to mean absence of all of them.
 */
export const CONFIG_FILENAMES = ["vercel.json", "vercel.toml", "vercel.ts"] as const;

export type Read<T> = { read: true; value: T } | { read: false; why: string };

/* ───────────────────────────── phase A: preflight ───────────────────────── */

export type PreflightFacts = {
  /** Numeric repository id resolved from GitHub — the independent pin. */
  githubRepoId: Read<number>;
  /** What Vercel says the project is linked to. Must MATCH, never be adopted. */
  vercelLinkRepoId: Read<number>;
  /** Fresh refs/heads/main. */
  freshMainSha: string | null;
  /** The commit's root tree: complete, and which config files it carries. */
  commitTree: Read<{ truncated: boolean; paths: readonly string[] }>;
  /** The PROJECT's current settings — a precondition, not evidence. */
  projectSettings: Read<ApprovedBuild>;
  /** Current production target, already validated. */
  currentProduction: Read<{ deploymentId: string; aliases: readonly string[] }>;
};

export type Refusal = { code: string; detail: string };
export type PreflightResult =
  | { ok: true; sha: string; outgoing: { deploymentId: string; aliases: readonly string[] } }
  | { ok: false } & Refusal;

const SHA = /^[0-9a-f]{40}$/;

export function preflightDecision(f: PreflightFacts, approved: ApprovedBuild): PreflightResult {
  // THE REPOSITORY IS PINNED BY US. Adopting whatever Vercel currently links
  // would let a project re-pointed at another repository pass silently — which
  // is exactly the condition this is meant to catch.
  if (!f.githubRepoId.read)
    return { ok: false, code: "REPO_ID_UNREADABLE", detail: f.githubRepoId.why };
  if (!f.vercelLinkRepoId.read)
    return { ok: false, code: "PROJECT_LINK_UNREADABLE", detail: f.vercelLinkRepoId.why };
  if (f.githubRepoId.value !== f.vercelLinkRepoId.value)
    return { ok: false, code: "REPO_MISMATCH",
      detail: `project is linked to repo id ${f.vercelLinkRepoId.value}, canonical is ${f.githubRepoId.value}` };

  if (!f.freshMainSha || !SHA.test(f.freshMainSha))
    return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub main could not be read" };

  if (!f.commitTree.read)
    return { ok: false, code: "TREE_UNREADABLE", detail: f.commitTree.why };
  const tree = f.commitTree.value;
  if (tree.truncated)
    return { ok: false, code: "TREE_TRUNCATED",
      detail: "the commit tree is truncated; absence of configuration cannot be established from it" };
  const present = CONFIG_FILENAMES.filter((n) => tree.paths.includes(n));
  if (present.length > 0)
    return { ok: false, code: "CONFIG_FILE_PRESENT",
      detail: `the built commit carries ${present.join(", ")}, which overrides the project settings` };

  if (!f.projectSettings.read)
    return { ok: false, code: "PROJECT_SETTINGS_UNREADABLE", detail: f.projectSettings.why };
  const drift = compareBuild(f.projectSettings.value, approved);
  if (drift) return { ok: false, code: "PROJECT_SETTINGS_NOT_APPROVED", detail: drift };

  if (!f.currentProduction.read)
    return { ok: false, code: "CURRENT_PRODUCTION_UNREADABLE", detail: f.currentProduction.why };

  return { ok: true, sha: f.freshMainSha, outgoing: f.currentProduction.value };
}

/** Field-by-field, so the refusal says which one moved. */
export function compareBuild(actual: ApprovedBuild, approved: ApprovedBuild): string | null {
  const keys: (keyof ApprovedBuild)[] = [
    "rootDirectory", "installCommand", "buildCommand", "outputDirectory", "framework",
  ];
  const bad = keys.filter((k) => actual[k] !== approved[k]);
  return bad.length === 0 ? null
    : bad.map((k) => `${k}: ${JSON.stringify(actual[k])} != approved ${JSON.stringify(approved[k])}`).join("; ");
}

/* ───────────────────────── phase B: create / stage ──────────────────────── */

export type CreateOutcome =
  | { ok: true; candidateId: string }
  | { ok: false; code: "CREATE_REFUSED"; detail: string }
  | {
      /**
       * The request went out and no id came back. NOT a failure, and NOT
       * retryable: a build may be running. An automatic retry here is how two
       * builds of one commit appear and one gets chosen by guesswork — which is
       * the metadata search this design exists to remove, wearing a new name.
       */
      ok: false; code: "CREATE_UNCERTAIN"; detail: string;
    };

export function createOutcome(id: string | null | undefined, error?: unknown): CreateOutcome {
  if (error) return { ok: false, code: "CREATE_UNCERTAIN", detail:
    `the create request did not complete: ${String(error).slice(0, 160)}. A build may be running. ` +
    `Reconcile by hand; do not re-run this phase.` };
  if (!id) return { ok: false, code: "CREATE_UNCERTAIN", detail:
    "the create request returned no deployment id. A build may be running. Reconcile by hand." };
  return { ok: true, candidateId: id };
}

/* ─────────────────────────── phase C: promotion ─────────────────────────── */

export type PromotionFacts = {
  candidateId: string;
  /** The SHA phase B was authorized for. */
  approvedSha: string;
  /** Re-read immediately before promoting — not at the start of the run. */
  freshMainSha: string | null;
  /** Re-read immediately before promoting. */
  currentProductionId: Read<string>;
  /** What preflight recorded, to detect a promotion by someone else. */
  outgoingAtPreflight: string;
  /**
   * The CANDIDATE'S OWN recorded configuration. Not the project's.
   *
   * Preflight can pass and the deployment still be built differently — a
   * settings change between phases, or a value the creation request carried. The
   * project's settings are a precondition; this is the evidence.
   */
  candidateBuild: Read<ApprovedBuild>;
  /** The candidate's own recorded commit. */
  candidateSha: Read<string>;
};

export function promotionDecision(f: PromotionFacts, approved: ApprovedBuild): { ok: true } | ({ ok: false } & Refusal) {
  if (!f.freshMainSha || !SHA.test(f.freshMainSha))
    return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub main unreadable at promotion time" };
  if (f.freshMainSha !== f.approvedSha)
    return { ok: false, code: "MAIN_MOVED",
      detail: `approved ${f.approvedSha.slice(0, 7)}, main is now ${f.freshMainSha.slice(0, 7)} — approve again` };

  if (!f.currentProductionId.read)
    return { ok: false, code: "CURRENT_PRODUCTION_UNREADABLE", detail: f.currentProductionId.why };
  if (f.currentProductionId.value !== f.outgoingAtPreflight)
    return { ok: false, code: "PRODUCTION_MOVED",
      detail: `production was ${f.outgoingAtPreflight} at preflight and is ${f.currentProductionId.value} now` };

  if (!f.candidateSha.read)
    return { ok: false, code: "CANDIDATE_SHA_UNREADABLE", detail: f.candidateSha.why };
  if (f.candidateSha.value !== f.approvedSha)
    return { ok: false, code: "CANDIDATE_SHA_MISMATCH",
      detail: `candidate was built from ${f.candidateSha.value.slice(0, 7)}, approved ${f.approvedSha.slice(0, 7)}` };

  if (!f.candidateBuild.read)
    return { ok: false, code: "CANDIDATE_BUILD_UNKNOWN", detail: f.candidateBuild.why };
  const drift = compareBuild(f.candidateBuild.value, approved);
  if (drift) return { ok: false, code: "CANDIDATE_BUILD_NOT_APPROVED", detail: drift };

  return { ok: true };
}

/* ───────────────────────── post-promotion verification ──────────────────── */

export type HostObservation = {
  host: string;
  /** Which deployment the API says this alias is assigned to. */
  aliasDeploymentId: Read<string>;
  /** What the host itself reports, after following redirects. */
  served: Read<{ deploymentId: string | null; commitSha: string | null; finalHost: string }>;
};

export type VerificationResult = {
  /** Every host reports the expected deployment and sha. */
  complete: boolean;
  problems: readonly string[];
};

/**
 * Verify routing and target SEPARATELY, because the observation showed a
 * promotion can move the production target while an alias does not follow.
 *
 * A 200 is not the check. A stale deployment answers 200 perfectly well, so
 * each host must report the deployment id and sha THIS run created, and any
 * redirect must land on an approved destination.
 */
export function verifyHosts(
  obs: readonly HostObservation[],
  expected: { deploymentId: string; sha: string },
  approvedRedirectHosts: readonly string[]
): VerificationResult {
  const problems: string[] = [];
  for (const o of obs) {
    if (!o.aliasDeploymentId.read) problems.push(`${o.host}: alias mapping unreadable (${o.aliasDeploymentId.why})`);
    else if (o.aliasDeploymentId.value !== expected.deploymentId)
      problems.push(`${o.host}: alias points at ${o.aliasDeploymentId.value}, expected ${expected.deploymentId}`);

    if (!o.served.read) { problems.push(`${o.host}: unreadable (${o.served.why})`); continue; }
    const s = o.served.value;
    if (s.finalHost !== o.host && !approvedRedirectHosts.includes(s.finalHost))
      problems.push(`${o.host}: redirected to ${s.finalHost}, which is not an approved destination`);
    if (s.deploymentId !== expected.deploymentId)
      problems.push(`${o.host}: serving ${s.deploymentId ?? "unknown"}, expected ${expected.deploymentId}`);
    if (s.commitSha !== expected.sha)
      problems.push(`${o.host}: serving sha ${s.commitSha ?? "unknown"}, expected ${expected.sha.slice(0, 7)}`);
  }
  return { complete: problems.length === 0, problems };
}
