/**
 * Production release authority — the decisions, pure.
 *
 * WHAT WENT WRONG, ONCE
 *
 * On 3 September 2026 a CLI production deployment built from a divergent local
 * `main` finished four minutes after the approved release and took every
 * canonical domain, because Vercel assigns production domains to whichever
 * production deployment reaches READY, and nothing asked where the source
 * came from. Its client-supplied metadata truthfully said `main` — the wrong
 * `main`. See docs/design/production-release-authority.md.
 *
 * THE INVARIANT
 *
 * Only a deployment that IS the current GitHub `main` of
 * Jhall1021/bookeliteelectric may become canonical Price2Book production.
 * "Is" means: the deployment's commit SHA equals a FRESH read of
 * `refs/heads/main` from GitHub, taken at the moment the decision is made.
 * Not a branch name, not a commit message, not creation order.
 *
 * TWO DECISIONS, ONE MODULE
 *
 *   decideBuildProvenance   at build time, inside Vercel, from the system
 *                           environment: may this source build as production?
 *   decidePromotion         at release time, from the operator's machine:
 *                           may this READY deployment be promoted?
 *
 * Both are pure functions of facts handed in, so the verifier runs the real
 * thing rather than a mirror of it, and both FAIL CLOSED: a missing fact is a
 * refusal, never a pass. The build-time decision is also mirrored as a shell
 * one-liner (PROVENANCE_BUILD_COMMAND) because the project-level Build
 * Command in Vercel is what an old checkout cannot bypass — a check that
 * lives only in this file protects only trees that contain this file.
 */

export const CANONICAL = {
  owner: "Jhall1021",
  repo: "bookeliteelectric",
  /**
   * The repository's NUMERIC id, as GitHub reports it.
   *
   * gitSource identifies a repository by this, not by owner/name — and the
   * release verifies GitHub's value against Vercel's project link rather than
   * adopting whatever the project happens to be linked to. A project re-pointed
   * at another repository must refuse, not pass quietly.
   *
   * PENDING: the canonical value is unset until read from GitHub. The probe
   * repository's was 1357038688; the canonical one has not been read.
   */
  repoId: 0,
  ref: "main",
  provider: "github",
  target: "production",
  /** Vercel team `price2-book` and project `price2book` — the only canonical home. */
  vercelTeamId: "team_dAw8VA0u1R3VuwiPMP97otvK",
  vercelProjectId: "prj_zB0QVq80340s2dVt7X3c1ewKgHtT",
  vercelProjectName: "price2book",
  canonicalHosts: ["app.price2book.com", "price2book.com", "www.price2book.com"],
  /** Public repository, so the fresh main SHA can be read without credentials. */
  gitRemote: "https://github.com/Jhall1021/bookeliteelectric.git",
} as const;

export type BuildFacts = {
  vercelEnv: string | undefined;
  gitProvider: string | undefined;
  repoOwner: string | undefined;
  repoSlug: string | undefined;
  commitRef: string | undefined;
  commitSha: string | undefined;
  /** A fresh `git ls-remote` read of refs/heads/main. `null` = could not be read. */
  freshMainSha: string | null;
};

export type ProvenanceDecision =
  | { ok: true; sha: string }
  | { ok: false; code: ProvenanceRefusal; detail: string };

export type ProvenanceRefusal =
  | "NOT_PRODUCTION" | "NOT_GITHUB" | "WRONG_OWNER" | "WRONG_REPO" | "WRONG_REF"
  | "NO_SHA" | "MAIN_UNREADABLE" | "SHA_NOT_MAIN";

/** Read the facts the build-time decision needs from a Vercel build environment. */
export function buildFactsFromEnv(env: Record<string, string | undefined>, freshMainSha: string | null): BuildFacts {
  return {
    vercelEnv: env.VERCEL_ENV,
    gitProvider: env.VERCEL_GIT_PROVIDER,
    repoOwner: env.VERCEL_GIT_REPO_OWNER,
    repoSlug: env.VERCEL_GIT_REPO_SLUG,
    commitRef: env.VERCEL_GIT_COMMIT_REF,
    commitSha: env.VERCEL_GIT_COMMIT_SHA,
    freshMainSha,
  };
}

const SHA = /^[0-9a-f]{40}$/;

/**
 * May this source build as production? Every fact must hold; the first that
 * does not is the reason. Order is deliberate: the cheap local facts first,
 * the network read last, and an unreadable network read is a refusal.
 */
export function decideBuildProvenance(f: BuildFacts): ProvenanceDecision {
  if (f.vercelEnv !== CANONICAL.target) return { ok: false, code: "NOT_PRODUCTION", detail: `target is "${f.vercelEnv ?? ""}", not production` };
  if (f.gitProvider !== CANONICAL.provider) return { ok: false, code: "NOT_GITHUB", detail: `git provider is "${f.gitProvider ?? ""}" — not a GitHub-triggered build` };
  if (f.repoOwner !== CANONICAL.owner) return { ok: false, code: "WRONG_OWNER", detail: `repository owner is "${f.repoOwner ?? ""}"` };
  if (f.repoSlug !== CANONICAL.repo) return { ok: false, code: "WRONG_REPO", detail: `repository is "${f.repoSlug ?? ""}"` };
  if (f.commitRef !== CANONICAL.ref) return { ok: false, code: "WRONG_REF", detail: `ref is "${f.commitRef ?? ""}"` };
  if (!f.commitSha || !SHA.test(f.commitSha)) return { ok: false, code: "NO_SHA", detail: "no full commit SHA on this deployment" };
  if (!f.freshMainSha || !SHA.test(f.freshMainSha)) return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub refs/heads/main could not be read; refusing rather than guessing" };
  if (f.freshMainSha !== f.commitSha) return { ok: false, code: "SHA_NOT_MAIN", detail: `commit ${f.commitSha.slice(0, 7)} is not GitHub main ${f.freshMainSha.slice(0, 7)}` };
  return { ok: true, sha: f.commitSha };
}

/**
 * The Vercel PROJECT Build Command — the control an old checkout cannot bypass.
 *
 * Vercel caps a project's Build Command at 256 characters (measured, 3 Sep
 * 2026: the API refuses longer ones with `invalid_build_command`), so the
 * decision itself cannot live inline. Instead the command fetches
 * scripts/provenance-guard.sh FROM GITHUB MAIN, refuses if that fetch yields
 * nothing, runs it, and only then runs `npm run build`. Three consequences:
 *
 *   - the guard that runs is always the one on current main, whatever tree
 *     was uploaded, so a stale checkout cannot carry a stale or absent guard;
 *   - an unreachable GitHub fails the fetch, and `&&` stops the build — a
 *     refusal, not a fall-through (`sh -c "$(curl …)"` would have passed on an
 *     empty body, which is why the non-empty test is there);
 *   - `npm run build` is never reached after a refusal, because the guard
 *     exits non-zero and the chain stops.
 *
 * `guardUrl` is a parameter only so the verifier and a temporary Vercel
 * project can point it at a branch; the canonical value is main's.
 */
export const PROVENANCE_GUARD_PATH = "scripts/provenance-guard.sh";
export function provenanceBuildCommand(
  guardUrl = `https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/contents/${PROVENANCE_GUARD_PATH}?ref=${CANONICAL.ref}`
): string {
  // AUTHENTICATED, WITH THE TOKEN NEVER IN ARGV.
  //
  // curl reads its config from stdin (-K-), so no Authorization header appears
  // in ps output, process accounting or a trace. The header lines themselves
  // live in P2B_GH_HDR, a Production environment variable, for two reasons:
  // they carry the credential, and inlining them put this command at 295
  // characters against Vercel's 256 ceiling.
  //
  // THE URL STAYS IN THE COMMAND DELIBERATELY. It is what names the canonical
  // repository, and the approved-command comparison at promotion time is only
  // meaningful while the command still pins the repo it fetches from. Moving the
  // URL into an environment variable would make the approved string say nothing
  // about where the guard came from.
  //
  // -f turns a non-2xx into a non-zero exit, and && stops the build on it.
  return `g=$(printf 'url="%s"\n%s' "${guardUrl}" "$P2B_GH_HDR"|curl -fsSK- --max-time 30)&&[ -n "$g" ]&&echo "$g"|sh&&npm run build`;
}

export const PROVENANCE_BUILD_COMMAND = provenanceBuildCommand();
/** Vercel's documented ceiling. The verifier holds the command under it. */
export const VERCEL_BUILD_COMMAND_MAX = 256;

/** What the operator's release command must know about a candidate. */
export type Candidate = {
  id: string;
  url: string;
  readyState: string;
  target: string | null;
  projectId: string;
  /** Vercel's own Git metadata — present only on Git-triggered deployments. */
  githubDeployment: boolean;
  githubOrg: string | undefined;
  githubRepo: string | undefined;
  githubRef: string | undefined;
  githubSha: string | undefined;
  /** Client-supplied metadata (`vercel deploy` from a checkout). Never trusted for identity. */
  clientSha: string | undefined;
  createdAt: number;
};

export type PromotionDecision =
  | { ok: true; candidate: Candidate; sha: string }
  | { ok: false; code: PromotionRefusal; detail: string };

export type PromotionRefusal =
  | "MAIN_UNREADABLE" | "WRONG_PROJECT" | "NOT_READY" | "NOT_PRODUCTION_TARGET"
  | "NOT_GITHUB_DEPLOYMENT" | "WRONG_REPOSITORY" | "WRONG_REF" | "SHA_NOT_MAIN" | "MAIN_MOVED";

/**
 * May this deployment be promoted to the canonical domains?
 *
 * `freshMainSha` is read immediately before this call; `mainAtSelection` is
 * the SHA read when the candidate was chosen. They must agree: if `main`
 * moved between choosing and promoting, the operator is looking at a stale
 * decision and the answer is to start over, not to promote what they picked.
 */
export function decidePromotion(
  c: Candidate,
  mainAtSelection: string | null,
  freshMainSha: string | null,
): PromotionDecision {
  if (!freshMainSha || !SHA.test(freshMainSha)) return { ok: false, code: "MAIN_UNREADABLE", detail: "GitHub main could not be read at promotion time" };
  if (mainAtSelection !== freshMainSha) return { ok: false, code: "MAIN_MOVED", detail: `main was ${mainAtSelection?.slice(0, 7) ?? "unread"} at selection and is ${freshMainSha.slice(0, 7)} now — choose again` };
  if (c.projectId !== CANONICAL.vercelProjectId) return { ok: false, code: "WRONG_PROJECT", detail: `deployment belongs to project ${c.projectId}` };
  if (c.readyState !== "READY") return { ok: false, code: "NOT_READY", detail: `deployment is ${c.readyState}` };
  if (c.target !== CANONICAL.target) return { ok: false, code: "NOT_PRODUCTION_TARGET", detail: `deployment target is ${c.target ?? "none"}` };
  if (!c.githubDeployment) return { ok: false, code: "NOT_GITHUB_DEPLOYMENT", detail: "not a GitHub-triggered deployment (CLI-uploaded source is never canonical)" };
  if (c.githubOrg !== CANONICAL.owner || c.githubRepo !== CANONICAL.repo) return { ok: false, code: "WRONG_REPOSITORY", detail: `built from ${c.githubOrg ?? "?"}/${c.githubRepo ?? "?"}` };
  if (c.githubRef !== CANONICAL.ref) return { ok: false, code: "WRONG_REF", detail: `built from ref ${c.githubRef ?? "?"}` };
  if (!c.githubSha || c.githubSha !== freshMainSha) return { ok: false, code: "SHA_NOT_MAIN", detail: `built from ${c.githubSha?.slice(0, 7) ?? "?"}, GitHub main is ${freshMainSha.slice(0, 7)}` };
  return { ok: true, candidate: c, sha: freshMainSha };
}

/** Shape a Vercel API deployment into a Candidate. Unknown fields become undefined, which refuses. */
export function candidateFromVercel(d: {
  uid?: string; id?: string; url: string; state?: string; readyState?: string; target?: string | null;
  projectId?: string; created?: number; createdAt?: number; meta?: Record<string, string | undefined>;
}): Candidate {
  const m = d.meta ?? {};
  return {
    id: d.uid ?? d.id ?? "",
    url: d.url,
    readyState: d.readyState ?? d.state ?? "UNKNOWN",
    target: d.target ?? null,
    projectId: d.projectId ?? "",
    githubDeployment: m.githubDeployment === "1",
    githubOrg: m.githubOrg ?? m.githubCommitOrg,
    githubRepo: m.githubRepo ?? m.githubCommitRepo,
    githubRef: m.githubCommitRef,
    githubSha: m.githubCommitSha,
    clientSha: m.gitCommitSha,
    createdAt: d.created ?? d.createdAt ?? 0,
  };
}
