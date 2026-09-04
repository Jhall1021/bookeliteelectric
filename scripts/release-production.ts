/**
 * The one sanctioned way a deployment becomes Price2Book production.
 *
 *   npx tsx scripts/release-production.ts            # dry run: what WOULD be promoted, and why or why not
 *   npx tsx scripts/release-production.ts --apply    # promote, record, read back
 *
 * WHAT IT NEVER DOES
 *
 * It never runs `vercel deploy`. It never uploads a working tree. It never
 * builds anything. Production artifacts are built by Vercel from GitHub
 * `main`; this command only decides whether an existing, READY, GitHub-built
 * deployment of the CURRENT `main` may take the canonical domains — and then
 * says so explicitly with `vercel promote`, because auto-assignment is off on
 * the canonical project and nothing else moves those domains.
 *
 * THE ORDER, AND WHY IT IS RE-CHECKED
 *
 *   1. read GitHub main (fresh)             -> mainAtSelection
 *   2. list READY production deployments of the canonical project
 *   3. choose the one Vercel built from GitHub main at exactly that SHA
 *   4. read GitHub main AGAIN                -> freshMainSha
 *   5. decidePromotion(candidate, mainAtSelection, freshMainSha)
 *   6. --apply: record the previous approved deployment, promote, read back
 *
 * Step 4 exists because a release is decided by a person over minutes, and
 * `main` can move under them. A promotion whose `main` changed between 1 and
 * 4 is refused as MAIN_MOVED; the answer is to run again, not to promote the
 * thing that was true a minute ago.
 *
 * CREDENTIALS. The Vercel token comes from VERCEL_TOKEN in the OPERATOR'S
 * environment, never from a repository file: `.env` and `.env.local` are
 * deliberately NOT loaded here. A token that sits in the checkout is a token
 * every session on the machine holds, which is how the incident happened.
 *
 * RECORD. Every apply appends the previous and new production deployment ids
 * to P2B_RELEASE_LOG (default ~/.price2book/release-log.jsonl), so recovery is
 * "promote the previous id", not archaeology.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CANONICAL, candidateFromVercel, PROVENANCE_BUILD_COMMAND, type Candidate } from "./_releaseProvenance";
import { validateRelease, applyRelease, type ReleaseEffects, type ReleasePlan } from "./_releaseOrchestration";
import { resolveEffectiveBuildCommand, type BuildEvidence, type Read } from "./_releaseSource";

const API = "https://api.vercel.com";

/**
 * A fresh read of GitHub refs/heads/main.
 *
 * AUTHENTICATED, because the repository is private. The operator's read token is
 * its OWN credential — separate from VERCEL_TOKEN, which promotes — and it is
 * read from the shell, never from a .env file. `git` gets it through an askpass
 * environment variable rather than an argument, so it never appears in argv.
 *
 * Null means UNREADABLE, and every caller treats that as a refusal. It never
 * means "main is missing".
 */
export type FetchLike = typeof fetch;

/**
 * A fresh read of GitHub refs/heads/main, authenticated.
 *
 * THE PREVIOUS VERSION DID NOT AUTHENTICATE. It set GIT_PASSWORD — not a
 * variable git reads — and blanked GIT_ASKPASS, so git was handed no credential
 * at all and simply failed, or worse, quietly succeeded using whatever the
 * machine already had in its credential helper. Either way the check was not
 * testing what it claimed.
 *
 * So it uses the GitHub API, which was the design all along: the token travels
 * in a header on a request object, never in argv, never in a URL, and never
 * through git's credential machinery. `fetchImpl` is injectable so this is
 * testable without a network or a real token.
 *
 * Null means UNREADABLE and every caller treats it as a refusal. It never means
 * "main is missing".
 */
export async function freshMainSha(
  fetchImpl: FetchLike = fetch,
  token = process.env.P2B_GH_READ_TOKEN
): Promise<string | null> {
  if (!token) return null;
  try {
    const r = await fetchImpl(
      `https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/git/ref/heads/${CANONICAL.ref}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { ref?: unknown; object?: { type?: unknown; sha?: unknown } };
    // Same structural requirements the shell guard enforces: the exact ref, an
    // object of type commit, and a sha that is one.
    if (j.ref !== `refs/heads/${CANONICAL.ref}`) return null;
    if (!j.object || j.object.type !== "commit") return null;
    const sha = j.object.sha;
    return typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}

type Api = <T>(path: string, init?: RequestInit) => Promise<{ status: number; body: T }>;
function vercelApi(token: string): Api {
  return async (path, init) => {
    const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as never };
  };
}

/** READY production deployments of the canonical project, newest first. */
export async function listCandidates(api: Api): Promise<Candidate[]> {
  const r = await api<{ deployments?: Parameters<typeof candidateFromVercel>[0][] }>(
    `/v6/deployments?teamId=${CANONICAL.vercelTeamId}&projectId=${CANONICAL.vercelProjectId}&target=production&state=READY&limit=20`
  );
  if (r.status !== 200) throw new Error(`Vercel deployments list answered ${r.status}`);
  return (r.body.deployments ?? []).map((d) => candidateFromVercel({ ...d, projectId: CANONICAL.vercelProjectId }));
}

/**
 * The CURRENT production deployment, raw.
 *
 * Returns the record and any error rather than a tidy null. The old version
 * collapsed both a failed request and a genuinely empty target into `null`, and
 * the caller then printed "none" and carried on — so an API outage looked
 * exactly like a first release. parseCurrentProduction() is what decides.
 */
export async function currentProductionRaw(api: Api): Promise<{ raw?: unknown; error?: unknown }> {
  try {
    const proj = await api<{ targets?: { production?: { id?: string } } }>(
      `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
    if (proj.status >= 300) return { error: `project read ${proj.status}` };
    const id = proj.body.targets?.production?.id;
    if (!id) return { raw: {} };
    // The project record carries no readyState or alias list, so the deployment
    // itself is read. A promotion has to know what it replaces well enough to
    // put it back.
    const dep = await api<unknown>(`/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
    if (dep.status >= 300) return { error: `deployment read ${dep.status}` };
    return { raw: dep.body };
  } catch (e) { return { error: e }; }
}

/** The candidate's own deployment record — for platform-verified origin. */
export async function deploymentRecord(api: Api, id: string): Promise<unknown> {
  const r = await api<unknown>(`/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
  return r.status >= 300 ? null : r.body;
}

/**
 * How this deployment was ACTUALLY built.
 *
 * The effective build command comes from the deployment's own record. The
 * project's current setting is read separately and only as drift detection —
 * it cannot testify about a build that already happened.
 */
export async function buildEvidence(
  api: Api, id: string, sha: string,
  fetchImpl: FetchLike = fetch, ghToken = process.env.P2B_GH_READ_TOKEN
): Promise<BuildEvidence | null> {
  const dep = await api<{ buildCommand?: string | null; projectSettings?: { buildCommand?: string | null } }>(
    `/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
  if (dep.status >= 300) return null;
  const proj = await api<{ buildCommand?: string | null }>(
    `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);

  return {
    // Both fields can carry it; if they disagree, nothing here may choose.
    effectiveBuildCommand: resolveEffectiveBuildCommand(
      dep.body.buildCommand, dep.body.projectSettings?.buildCommand),
    // ACTUALLY READ, at the built commit. This used to be hardcoded null —
    // "no override" asserted by an adapter that had looked at nothing.
    commitVercelJsonBuildCommand: await vercelJsonBuildCommand(sha, fetchImpl, ghToken),
    guardLineSha: null,
    projectBuildCommandNow: proj.status >= 300
      ? { read: false, why: `project read ${proj.status}` }
      : { read: true, value: proj.body.buildCommand ?? null },
  };
}

/**
 * `buildCommand` from vercel.json AT THE BUILT COMMIT.
 *
 * A 404 is a genuine "there is no vercel.json", which is a read. Anything else
 * — a failed request, unparseable content, no credential — is NOT a read, and
 * the decision refuses on it rather than assuming no override.
 */
export async function vercelJsonBuildCommand(
  sha: string, fetchImpl: FetchLike = fetch, token = process.env.P2B_GH_READ_TOKEN
): Promise<Read<string | null>> {
  if (!token) return { read: false, why: "no GitHub read credential" };
  try {
    const r = await fetchImpl(
      `https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/contents/vercel.json?ref=${sha}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" } }
    );
    if (r.status === 404) return { read: true, value: null };
    if (!r.ok) return { read: false, why: `vercel.json read ${r.status}` };
    const text = await r.text();
    if (text.trim() === "") return { read: true, value: null };
    let j: { buildCommand?: unknown };
    try { j = JSON.parse(text) as { buildCommand?: unknown }; }
    catch { return { read: false, why: "vercel.json at the built commit is not valid JSON" }; }
    const v = j.buildCommand;
    if (v === undefined || v === null) return { read: true, value: null };
    return typeof v === "string"
      ? { read: true, value: v }
      : { read: false, why: "vercel.json buildCommand is not a string" };
  } catch (e) { return { read: false, why: `vercel.json unreadable: ${String(e).slice(0, 80)}` }; }
}

export async function readBack(host: string): Promise<{ deploymentId: string | null; commitSha: string | null; target: string | null } | null> {
  try {
    const r = await fetch(`https://${host}/api/release`, { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) return null;
    return (await r.json()) as never;
  } catch { return null; }
}

/** Effects the release uses. Split so a dry run gets the reads and no writes. */
export function releaseEffects(api: Api, logPath: string, apply: boolean): ReleaseEffects {
  return {
    readCurrentProduction: () => currentProductionRaw(api),
    readFreshMain: () => freshMainSha(),
    readDeployment: (id) => deploymentRecord(api, id),
    readBuildEvidence: (id) => buildEvidence(api, id, "PLACEHOLDER"),

    // INTENT IS PERSISTED BEFORE THE MUTATION, and a failure here stops the
    // release. Written synchronously so a throw genuinely prevents promotion.
    recordIntent: async (plan: ReleasePlan) => {
      if (!apply) throw new Error("recordIntent reached during a dry run — this is a bug");
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, JSON.stringify({
        at: new Date().toISOString(), phase: "intent",
        rollbackTo: plan.replaced, rollbackAliases: plan.replacedAliases,
        promoting: plan.candidateId, sha: plan.sha, hosts: plan.hosts,
      }) + "\n");
    },

    promoteDeployment: async (id) => {
      if (!apply) throw new Error("promoteDeployment reached during a dry run — this is a bug");
      const r = await api<{ error?: { message?: string } }>(
        `/v10/projects/${CANONICAL.vercelProjectId}/promote/${id}?teamId=${CANONICAL.vercelTeamId}`,
        { method: "POST" });
      if (r.status >= 300) throw new Error(`promote failed ${r.status} ${r.body.error?.message ?? ""}`);
    },

    recordCompletion: async (plan: ReleasePlan) => {
      appendFileSync(logPath, JSON.stringify({
        at: new Date().toISOString(), phase: "completed",
        promoted: plan.candidateId, sha: plan.sha, replaced: plan.replaced,
      }) + "\n");
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const token = process.env.VERCEL_TOKEN;
  console.log(`\nPRODUCTION RELEASE — ${apply ? "APPLY" : "dry run (pass --apply to promote)"}\n`);
  if (!token) { console.error("  REFUSED: VERCEL_TOKEN is not set in this shell. It is deliberately not read from .env files.\n"); process.exit(1); }
  if (!process.env.P2B_GH_READ_TOKEN) { console.error("  REFUSED: P2B_GH_READ_TOKEN is not set. The repository is private and main must be read.\n"); process.exit(1); }
  const api = vercelApi(token);

  const mainAtSelection = await freshMainSha();
  console.log(`  GitHub ${CANONICAL.owner}/${CANONICAL.repo} ${CANONICAL.ref}: ${mainAtSelection ?? "UNREADABLE"}`);
  if (!mainAtSelection) { console.error("  REFUSED: GitHub main could not be read.\n"); process.exit(1); }

  const candidates = await listCandidates(api);
  console.log(`  READY production deployments considered: ${candidates.length}`);

  // SELECTION IS A SHORTLIST, NOT A DECISION. It narrows on meta because a list
  // response carries nothing else; nothing is trusted until validateRelease
  // re-reads the deployment and establishes origin from platform fields.
  const chosen = candidates.find((c) => c.githubSha === mainAtSelection) ?? null;
  if (!chosen) {
    const nearest = candidates.slice(0, 5).map((c) => `    ${c.id}  sha=${(c.githubSha ?? c.clientSha ?? "?").slice(0, 7)}  created=${new Date(c.createdAt).toISOString()}`).join("\n");
    console.error(`  REFUSED: no READY production deployment claiming main ${mainAtSelection.slice(0, 7)} exists.\n  Nearest:\n${nearest}\n  Nothing here deploys; a build of main comes from Vercel's Git integration.\n`);
    process.exit(1);
  }
  console.log(`  shortlisted: ${chosen.id} (${chosen.url}) — claims ${chosen.githubSha?.slice(0, 7)}, not yet verified`);

  const logPath = process.env.P2B_RELEASE_LOG ?? join(homedir(), ".price2book", "release-log.jsonl");
  const fx = releaseEffects(api, logPath, apply);
  // The candidate's own sha is what vercel.json must be read at.
  fx.readBuildEvidence = (id) => buildEvidence(api, id, mainAtSelection);

  // PHASE ONE — reads only. A dry run stops here and CAN SUCCEED.
  const validated = await validateRelease(chosen, mainAtSelection, PROVENANCE_BUILD_COMMAND, fx);
  if (!validated.ok) { console.error(`  REFUSED (${validated.code}): ${validated.detail}\n`); process.exit(1); }
  const plan = validated.plan;
  console.log(`  decision: PROMOTABLE — ${plan.sha.slice(0, 7)} is GitHub main, now and at selection.`);
  console.log(`  replaces: ${plan.replaced} (rollback target)`);

  if (!apply) {
    console.log(`\n  Dry run complete — validated, nothing changed. Re-run with --apply to promote ${plan.candidateId}.\n`);
    return;
  }

  // PHASE TWO — re-reads main, records the rollback target, then promotes.
  const outcome = await applyRelease(plan, fx);
  if (!outcome.ok) { console.error(`  REFUSED (${outcome.code}): ${outcome.detail}\n`); process.exit(1); }
  console.log(`  recorded rollback target ${plan.replaced} -> ${logPath}`);
  console.log(`  promoted ${plan.candidateId}`);

  await new Promise((r) => setTimeout(r, 8000));
  const after = await currentProductionRaw(api).then((r) => (r.raw as { uid?: string; id?: string } | undefined) ?? null);
  const afterId = after?.uid ?? after?.id;
  console.log(`  canonical production after: ${afterId ?? "?"}`);
  let bad = afterId !== plan.candidateId;
  for (const host of plan.hosts) {
    const rb = await readBack(host);
    const okHost = rb?.deploymentId === plan.candidateId && rb?.commitSha === plan.sha && rb?.target === "production";
    if (!okHost) bad = true;
    console.log(`  ${okHost ? "ok  " : "FAIL"} ${host}/api/release -> ${rb ? `${rb.deploymentId} ${rb.commitSha?.slice(0, 7)} ${rb.target}` : "unreadable"}`);
  }
  console.log(bad ? `\n  Promotion did not read back cleanly. Rollback target is in ${logPath}.\n` : `\n  Released ${plan.sha.slice(0, 7)} as ${plan.candidateId}.\n`);
  if (bad) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
