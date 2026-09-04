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
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CANONICAL, candidateFromVercel, PROVENANCE_BUILD_COMMAND, type Candidate } from "./_releaseProvenance";
import { promote as decideAndPromote, type ReleaseEffects } from "./_releaseOrchestration";
import type { BuildEvidence } from "./_releaseSource";

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
export function freshMainSha(remote: string = CANONICAL.gitRemote): string | null {
  const token = process.env.P2B_GH_READ_TOKEN;
  if (!token) return null;
  try {
    const url = remote.replace("https://", `https://x-access-token@`);
    const out = execFileSync("git", ["ls-remote", url, `refs/heads/${CANONICAL.ref}`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GIT_CONFIG_COUNT: "0",
             GIT_PASSWORD: token },
    });
    const sha = out.split("\t")[0]?.trim();
    return /^[0-9a-f]{40}$/.test(sha ?? "") ? sha : null;
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
export async function buildEvidence(api: Api, id: string): Promise<BuildEvidence | null> {
  const dep = await api<{ buildCommand?: string | null; projectSettings?: { buildCommand?: string | null } }>(
    `/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
  if (dep.status >= 300) return null;
  const proj = await api<{ buildCommand?: string | null }>(
    `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
  return {
    effectiveBuildCommand: dep.body.projectSettings?.buildCommand ?? dep.body.buildCommand ?? null,
    commitVercelJsonBuildCommand: null,
    guardLineSha: null,
    projectBuildCommandNow: proj.status >= 300 ? null : proj.body.buildCommand ?? null,
  };
}

export async function readBack(host: string): Promise<{ deploymentId: string | null; commitSha: string | null; target: string | null } | null> {
  try {
    const r = await fetch(`https://${host}/api/release`, { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) return null;
    return (await r.json()) as never;
  } catch { return null; }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const token = process.env.VERCEL_TOKEN;
  console.log(`\nPRODUCTION RELEASE — ${apply ? "APPLY" : "dry run (pass --apply to promote)"}\n`);
  if (!token) { console.error("  REFUSED: VERCEL_TOKEN is not set in this shell. It is deliberately not read from .env files.\n"); process.exit(1); }
  const api = vercelApi(token);

  const mainAtSelection = freshMainSha();
  console.log(`  GitHub ${CANONICAL.owner}/${CANONICAL.repo} ${CANONICAL.ref}: ${mainAtSelection ?? "UNREADABLE"}`);
  if (!mainAtSelection) { console.error("  REFUSED: GitHub main could not be read.\n"); process.exit(1); }

  const candidates = await listCandidates(api);
  console.log(`  READY production deployments considered: ${candidates.length}`);

  // SELECTION IS A SHORTLIST, NOT A DECISION.
  //
  // This used to pick on `c.githubDeployment && c.githubSha`, both derived from
  // Vercel's `meta` — which the deploying client supplies. So the selector could
  // be told what to pick. It still narrows on meta because that is all a list
  // response carries, but nothing is trusted until the orchestrator re-reads the
  // chosen deployment and establishes origin from the platform's own fields.
  const chosen = candidates.find((c) => c.githubSha === mainAtSelection) ?? null;
  if (!chosen) {
    const nearest = candidates.slice(0, 5).map((c) => `    ${c.id}  sha=${(c.githubSha ?? c.clientSha ?? "?").slice(0, 7)}  created=${new Date(c.createdAt).toISOString()}`).join("\n");
    console.error(`  REFUSED: no READY production deployment claiming main ${mainAtSelection.slice(0, 7)} exists.\n  Nearest:\n${nearest}\n  Nothing here deploys; a build of main comes from Vercel's Git integration.\n`);
    process.exit(1);
  }
  console.log(`  shortlisted: ${chosen.id} (${chosen.url}) — claims ${chosen.githubSha?.slice(0, 7)}, not yet verified`);

  const logPath = process.env.P2B_RELEASE_LOG ?? join(homedir(), ".price2book", "release-log.jsonl");

  // EVERY DECISION AND THE ONLY MUTATION, IN ONE PLACE.
  //
  // The same promote() the isolated tests exercise. A dry run supplies an
  // effect that refuses to mutate, so the dry run proves the real path rather
  // than a parallel one that merely resembles it.
  let promoted: string | null = null;
  const fx: ReleaseEffects = {
    readCurrentProduction: () => currentProductionRaw(api),
    readFreshMain: async () => freshMainSha(),
    readDeployment: (id) => deploymentRecord(api, id),
    readBuildEvidence: (id) => buildEvidence(api, id),
    promoteDeployment: async (id) => {
      if (!apply) throw new Error("dry run reached the mutation — this is a bug, not a release");
      if (!existsSync(dirname(logPath))) mkdirSync(dirname(logPath), { recursive: true });
      const r = await api<{ error?: { message?: string } }>(
        `/v10/projects/${CANONICAL.vercelProjectId}/promote/${id}?teamId=${CANONICAL.vercelTeamId}`,
        { method: "POST" });
      if (r.status >= 300) throw new Error(`promote failed ${r.status} ${r.body.error?.message ?? ""}`);
      promoted = id;
    },
  };

  const outcome = await decideAndPromote(chosen, mainAtSelection, PROVENANCE_BUILD_COMMAND, fx);
  if (!outcome.ok) { console.error(`  REFUSED (${outcome.code}): ${outcome.detail}\n`); process.exit(1); }

  console.log(`  decision: PROMOTABLE — ${outcome.sha.slice(0, 7)} is GitHub main, now and at selection.`);
  console.log(`  replaces: ${outcome.replaced} (rollback target)`);

  if (!apply) { console.log(`\n  Dry run. Nothing was changed. Re-run with --apply to promote ${chosen.id}.\n`); return; }
  if (!promoted) { console.error("  REFUSED: promotion did not run.\n"); process.exit(1); }

  if (!existsSync(dirname(logPath))) mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), previous: outcome.replaced, promoted: { id: chosen.id, url: chosen.url, sha: outcome.sha }, hosts: CANONICAL.canonicalHosts }) + "\n");
  console.log(`  recorded previous=${outcome.replaced} -> ${logPath}`);

  console.log(`  promoted ${chosen.id}`);

  await new Promise((r) => setTimeout(r, 8000));
  const after = await currentProductionRaw(api).then((r) => (r.raw as { id?: string } | undefined) ?? null);
  console.log(`  canonical production after: ${after?.id ?? "?"}`);
  let bad = after?.id !== chosen.id;
  for (const host of CANONICAL.canonicalHosts) {
    const rb = await readBack(host);
    const okHost = rb?.deploymentId === chosen.id && rb?.commitSha === outcome.sha && rb?.target === "production";
    if (!okHost) bad = true;
    console.log(`  ${okHost ? "ok  " : "FAIL"} ${host}/api/release -> ${rb ? `${rb.deploymentId} ${rb.commitSha?.slice(0, 7)} ${rb.target}` : "unreadable"}`);
  }
  console.log(bad ? `\n  Promotion did not read back cleanly. Previous production id is in ${logPath}.\n` : `\n  Released ${outcome.sha.slice(0, 7)} as ${chosen.id}.\n`);
  if (bad) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
