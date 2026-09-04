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
  /** The PINNED constant. Must be a real id, agreed by both services. */
  canonicalRepoId: number;
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
  // THE PIN MUST EXIST. Comparing GitHub against Vercel and calling it pinned
  // was the defect: both could agree on a repository that is not ours, and the
  // creation request then sent CANONICAL.repoId anyway — which was 0. All THREE
  // must agree, and the constant must be a real id.
  if (!Number.isInteger(f.canonicalRepoId) || f.canonicalRepoId <= 0)
    return { ok: false, code: "REPO_ID_UNPINNED",
      detail: `CANONICAL.repoId is ${f.canonicalRepoId}; the canonical repository id has not been established` };
  if (!f.githubRepoId.read)
    return { ok: false, code: "REPO_ID_UNREADABLE", detail: f.githubRepoId.why };
  if (!f.vercelLinkRepoId.read)
    return { ok: false, code: "PROJECT_LINK_UNREADABLE", detail: f.vercelLinkRepoId.why };
  if (f.githubRepoId.value !== f.canonicalRepoId)
    return { ok: false, code: "REPO_MISMATCH",
      detail: `GitHub reports repo id ${f.githubRepoId.value}, pinned is ${f.canonicalRepoId}` };
  if (f.vercelLinkRepoId.value !== f.canonicalRepoId)
    return { ok: false, code: "REPO_MISMATCH",
      detail: `project is linked to repo id ${f.vercelLinkRepoId.value}, pinned is ${f.canonicalRepoId}` };

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
  /** From the RECEIPT — what this run saw in phase B, not what C sees now. */
  outgoingAtCreation: string;
  /** Proof this process owns the lock the run took in phase B. */
  lockOwner: Read<string>;
  /**
   * The candidate's whole record, read back from Vercel.
   *
   * Reading only its build settings and sha was insufficient: a response
   * describing a DIFFERENT deployment, in another project, at `target:
   * "preview"` and still building, satisfied both and reached the promote
   * effect. Identity, ownership, readiness and target are checked here because
   * nothing downstream checks them.
   */
  candidate: Read<CandidateRecord>;
  /** A receipt proving THIS tool created it — see requireReceipt. */
  receipt: Read<CreationReceipt>;
};

export type CandidateRecord = {
  id: string;
  projectId: string;
  readyState: string;
  target: string | null;
  sha: string | null;
  build: ApprovedBuild | null;
};

/**
 * Written by phase B, read by phase C.
 *
 * Without it, phase C accepted any id the operator supplied — so a deployment
 * this tool never created could be promoted by passing its id in an environment
 * variable, which is the metadata search returning under another name. A
 * caller-supplied variable is not a receipt.
 */
/**
 * Where one canonical host currently points.
 *
 * THREE STATES, NOT TWO. `deploymentId: string | null` collapsed "this host is
 * verifiably unmapped" into "the alias API answered 503", and both became a
 * usable-looking baseline of nulls. A recovery target you cannot read is not a
 * recovery target.
 *
 *   { read: true,  value: "dpl_x" }  mapped, and to what
 *   { read: true,  value: null    }  verifiably unmapped
 *   { read: false, why }             not established — refuses
 */
export type AliasMapping = { host: string; destination: Read<string | null> };

/**
 * Is this baseline good enough to recover from?
 *
 * Every canonical host must have been READ. An unread host means the rollback
 * cannot be described, and a release whose rollback cannot be described must not
 * start — which is why this runs BEFORE the deployment is created, not after.
 */
export function baselineRefusal(
  outgoingDeploymentId: string,
  mappings: Read<readonly AliasMapping[]>,
  requiredHosts: readonly string[]
): Refusal | null {
  if (!outgoingDeploymentId)
    return { code: "BASELINE_INCOMPLETE", detail: "the outgoing production deployment is not established" };
  if (!mappings.read)
    return { code: "BASELINE_INCOMPLETE", detail: `alias mappings could not be read: ${mappings.why}` };

  const byHost = new Map(mappings.value.map((m) => [m.host, m]));
  const missing = requiredHosts.filter((h) => !byHost.has(h));
  if (missing.length)
    return { code: "BASELINE_INCOMPLETE", detail: `no alias reading for ${missing.join(", ")}` };

  const unread = requiredHosts
    .map((h) => byHost.get(h)!)
    .filter((m) => !m.destination.read)
    .map((m) => `${m.host} (${(m.destination as { why: string }).why})`);
  if (unread.length)
    return { code: "BASELINE_INCOMPLETE",
      detail: `alias destinations not established for ${unread.join(", ")}; a rollback target that ` +
        `cannot be read is not one` };

  // AND `read: true` MUST CARRY A USABLE VALUE.
  //
  // The flag was taken as proof on its own, so a persisted receipt carrying
  // `destination: { read: true, value: 42 }` validated — a recovery baseline
  // that cannot be promoted back to. A destination is either a real deployment
  // id or an explicitly established null; nothing else is a destination.
  const invalid = requiredHosts
    .map((h) => byHost.get(h)!)
    .filter((m) => {
      if (!m.destination.read) return false;
      const v = m.destination.value;
      return !(v === null || (typeof v === "string" && v !== ""));
    })
    .map((m) => `${m.host} (${JSON.stringify((m.destination as { value: unknown }).value)})`);
  if (invalid.length)
    return { code: "BASELINE_INCOMPLETE",
      detail: `alias destinations are not deployment ids for ${invalid.join(", ")}; ` +
        `a read flag is not a value` };

  return null;
}

/** A receipt is only a receipt if its recovery baseline is intact. */
export function receiptRefusal(r: CreationReceipt, requiredHosts: readonly string[]): Refusal | null {
  if (typeof r.runId !== "string" || r.runId === "")
    return { code: "RECEIPT_INCOMPLETE", detail: "receipt carries no run id" };
  if (typeof r.candidateId !== "string" || r.candidateId === "")
    return { code: "RECEIPT_INCOMPLETE", detail: "receipt carries no candidate id" };
  if (typeof r.sha !== "string" || !SHA.test(r.sha))
    return { code: "RECEIPT_INCOMPLETE", detail: "receipt carries no valid sha" };
  return baselineRefusal(r.outgoingDeploymentId, { read: true, value: r.outgoingAliases ?? [] }, requiredHosts)
    ? { code: "RECEIPT_INCOMPLETE",
        detail: `the receipt's recovery baseline is incomplete: ` +
          `${baselineRefusal(r.outgoingDeploymentId, { read: true, value: r.outgoingAliases ?? [] }, requiredHosts)!.detail}` }
    : null;
}

export type CreationReceipt = {
  runId: string;
  candidateId: string;
  sha: string;
  createdAt: string;
  operator: string;
  host: string;
  /**
   * THE BASELINE THIS RUN IS REPLACING, captured in phase B.
   *
   * Phase C used to re-run preflight and adopt whatever production was THEN,
   * comparing current against current — which is always equal, so a deployment
   * that appeared between the phases became the recorded rollback target. The
   * baseline belongs to the run, so it travels with the receipt.
   */
  outgoingDeploymentId: string;
  /**
   * Per-host mappings, not alias names, and captured BEFORE the deployment is
   * created — reading them afterwards recorded whatever the aliases had become
   * during the build as the thing this run was replacing.
   */
  outgoingAliases: readonly AliasMapping[];
};

export function promotionDecision(
  f: PromotionFacts, approved: ApprovedBuild,
  canonical: { projectId: string; target: string }
): { ok: true } | ({ ok: false } & Refusal) {
  // THE RECEIPT FIRST. Everything after it is about a deployment this tool
  // created; without one there is nothing to reason about.
  // THE LOCK MUST BE THIS RUN'S. A process that does not hold it may not
  // promote, and — just as important — may not release it. A phase C with no
  // receipt used to refuse and then delete the legitimate run's lock on its way
  // out, which is worse than doing nothing.
  if (!f.lockOwner.read)
    return { ok: false, code: "LOCK_UNREADABLE", detail: f.lockOwner.why };

  if (!f.receipt.read)
    return { ok: false, code: "NO_CREATION_RECEIPT",
      detail: `${f.receipt.why}. Only a deployment this tool created in phase B may be promoted.` };
  if (f.receipt.value.candidateId !== f.candidateId)
    return { ok: false, code: "RECEIPT_MISMATCH",
      detail: `the receipt is for ${f.receipt.value.candidateId}, not ${f.candidateId}` };
  if (f.receipt.value.sha !== f.approvedSha)
    return { ok: false, code: "RECEIPT_MISMATCH",
      detail: `the receipt records sha ${f.receipt.value.sha.slice(0, 7)}, approval names ${f.approvedSha.slice(0, 7)}` };
  if (f.lockOwner.value !== f.receipt.value.runId)
    return { ok: false, code: "NOT_LOCK_OWNER",
      detail: `the release lock is held by run ${f.lockOwner.value}, this candidate belongs to run ` +
        `${f.receipt.value.runId}. Only the run that took the lock may promote or release it.` };

  if (!f.freshMainSha || !SHA.test(f.freshMainSha))
    return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub main unreadable at promotion time" };
  if (f.freshMainSha !== f.approvedSha)
    return { ok: false, code: "MAIN_MOVED",
      detail: `approved ${f.approvedSha.slice(0, 7)}, main is now ${f.freshMainSha.slice(0, 7)} — approve again` };

  if (!f.currentProductionId.read)
    return { ok: false, code: "CURRENT_PRODUCTION_UNREADABLE", detail: f.currentProductionId.why };
  if (f.currentProductionId.value !== f.outgoingAtCreation)
    return { ok: false, code: "PRODUCTION_MOVED",
      detail: `production was ${f.outgoingAtCreation} when this run created its candidate ` +
        `and is ${f.currentProductionId.value} now — something else promoted in between` };

  if (!f.candidate.read)
    return { ok: false, code: "CANDIDATE_UNREADABLE", detail: f.candidate.why };
  const c = f.candidate.value;

  // The response must describe the deployment we asked about, in our project,
  // ready, and targeting production. None of this was checked before.
  if (c.id !== f.candidateId)
    return { ok: false, code: "CANDIDATE_IDENTITY_MISMATCH",
      detail: `asked for ${f.candidateId}, the record describes ${c.id}` };
  if (c.projectId !== canonical.projectId)
    return { ok: false, code: "WRONG_PROJECT", detail: `candidate belongs to project ${c.projectId}` };
  if (c.readyState !== "READY")
    return { ok: false, code: "NOT_READY", detail: `candidate is ${c.readyState}` };
  if (c.target !== canonical.target)
    return { ok: false, code: "NOT_PRODUCTION_TARGET", detail: `candidate target is ${c.target ?? "none"}` };

  if (!c.sha || !SHA.test(c.sha))
    return { ok: false, code: "CANDIDATE_SHA_UNREADABLE", detail: "candidate record carries no commit sha" };
  if (c.sha !== f.approvedSha)
    return { ok: false, code: "CANDIDATE_SHA_MISMATCH",
      detail: `candidate was built from ${c.sha.slice(0, 7)}, approved ${f.approvedSha.slice(0, 7)}` };

  if (!c.build)
    return { ok: false, code: "CANDIDATE_BUILD_UNKNOWN", detail: "candidate record carries no build settings" };
  const drift = compareBuild(c.build, approved);
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
  approvedRedirectHosts: readonly string[],
  /**
   * The production target, RE-READ after promoting.
   *
   * Three questions, not two: aliases and served identity both reported the
   * candidate while the target was still the incumbent, and the run returned
   * success. Success requires all three to agree.
   */
  productionTarget?: Read<string>
): VerificationResult {
  const problems: string[] = [];
  if (!productionTarget) problems.push("the production target was not re-read after promoting");
  else if (!productionTarget.read) problems.push(`production target unreadable after promoting (${productionTarget.why})`);
  else if (productionTarget.value !== expected.deploymentId)
    problems.push(`production target is ${productionTarget.value}, expected ${expected.deploymentId}`);
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
