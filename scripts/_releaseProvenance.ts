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
 * ONE DECISION, MADE INSIDE THE BUILD
 *
 *   decideBuildProvenance   at build time, inside Vercel, from the system
 *                           environment: may this source build as production?
 * decideBuildProvenance is a pure function of the facts handed in, so the
 * verifier runs the real thing rather than a mirror of it, and it FAILS CLOSED:
 * a missing fact is a refusal, never a pass.
 *
 * There is no promotion decision here any more. Whether a deployment may be
 * promoted is not a question about its record: the release promotes only the
 * candidate it created and bound in a receipt. The build-time decision is also mirrored as a shell
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
   * ESTABLISHED 4 September 2026 by an UNAUTHENTICATED read of
   * https://api.github.com/repos/Jhall1021/bookeliteelectric, which returned
   * id 1336270570 for owner "Jhall1021", name "bookeliteelectric". No
   * credential was involved, so the value does not depend on any token that
   * has since been used or disclosed.
   *
   * PINNING IT DOES NOT MAKE IT TRUSTED. preflightDecision still requires all
   * THREE to agree — this constant, GitHub's reported id, and the id Vercel's
   * project link carries — and refuses REPO_MISMATCH if any disagrees. The
   * constant is the claim under test, not the authority.
   */
  repoId: 1336270570,
  ref: "main",
  provider: "github",
  target: "production",
  /** Vercel team `price2-book` and project `price2book` — the only canonical home. */
  vercelTeamId: "team_dAw8VA0u1R3VuwiPMP97otvK",
  vercelProjectId: "prj_zB0QVq80340s2dVt7X3c1ewKgHtT",
  vercelProjectName: "price2book",
  /**
   * THE GOVERNED HOSTS — and the only ones.
   *
   * Vercel also serves generated *.vercel.app aliases for this project. They are
   * DELIBERATELY OUTSIDE this set, and readAliasPage skips them as "genuinely
   * not ours". That is a decision, not an oversight: proof 6 observed a
   * promotion move the generated aliases and the production target together,
   * and proof 4 case 1 observed a CREATION move two generated aliases while the
   * production target stayed put. Neither is a customer-facing fact, and
   * enforcing them would make the release refuse on routing nobody is served by.
   *
   * The proofs establish this for GENERATED hosts on a disposable project. They
   * establish NOTHING about the three custom domains below, which are a
   * different host class on a project with auto-assignment disabled.
   */
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

/*
 * THE DEPLOYMENT-SELECTION SURFACE IS GONE.
 *
 * Candidate, PromotionDecision, PromotionRefusal, decidePromotion and
 * candidateFromVercel decided whether a deployment could be promoted by reading
 * its own record — githubDeployment, githubOrg, githubRepo, githubRef,
 * githubSha. The origin-trust observation established that a caller creating a
 * deployment can write every one of those fields, and that Vercel then enriches
 * the forgery further: a record claiming GitHub built it is a claim, not
 * evidence.
 *
 * The release does not select a deployment and interrogate it. It CREATES one
 * from a pinned sha and keeps the id its own request returned, binding it in a
 * durable receipt that phase C requires before it will promote anything.
 * See runRelease in _releaseRun.ts.
 */
