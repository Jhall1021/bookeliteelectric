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
import { CANONICAL, candidateFromVercel, decidePromotion, type Candidate } from "./_releaseProvenance";

const API = "https://api.vercel.com";

export function freshMainSha(remote: string = CANONICAL.gitRemote): string | null {
  try {
    const out = execFileSync("git", ["ls-remote", remote, `refs/heads/${CANONICAL.ref}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 });
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

export async function currentProduction(api: Api): Promise<{ id: string; url: string } | null> {
  const r = await api<{ targets?: { production?: { id: string; url: string } } }>(`/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
  return r.body.targets?.production ?? null;
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

  const serving = await currentProduction(api);
  console.log(`  canonical production now: ${serving ? `${serving.id} (${serving.url})` : "none"}`);

  const candidates = await listCandidates(api);
  console.log(`  READY production deployments considered: ${candidates.length}`);
  const chosen = candidates.find((c) => c.githubDeployment && c.githubSha === mainAtSelection) ?? null;
  if (!chosen) {
    const nearest = candidates.slice(0, 5).map((c) => `    ${c.id}  github=${c.githubDeployment ? "yes" : "no"}  sha=${(c.githubSha ?? c.clientSha ?? "?").slice(0, 7)}  created=${new Date(c.createdAt).toISOString()}`).join("\n");
    console.error(`  REFUSED: no READY GitHub-built production deployment of main ${mainAtSelection.slice(0, 7)} exists.\n  Nearest:\n${nearest}\n  Nothing here deploys; a build of main comes from Vercel's Git integration.\n`);
    process.exit(1);
  }
  console.log(`  candidate: ${chosen.id} (${chosen.url}) built from ${chosen.githubOrg}/${chosen.githubRepo}@${chosen.githubRef} ${chosen.githubSha?.slice(0, 7)}`);
  if (serving?.id === chosen.id) console.log(`  note: this deployment is already production.`);

  const fresh = freshMainSha();
  const decision = decidePromotion(chosen, mainAtSelection, fresh);
  if (!decision.ok) { console.error(`  REFUSED (${decision.code}): ${decision.detail}\n`); process.exit(1); }
  console.log(`  decision: PROMOTABLE — ${decision.sha.slice(0, 7)} is GitHub main, now and at selection.`);

  if (!apply) { console.log(`\n  Dry run. Nothing was changed. Re-run with --apply to promote ${chosen.id}.\n`); return; }

  const logPath = process.env.P2B_RELEASE_LOG ?? join(homedir(), ".price2book", "release-log.jsonl");
  if (!existsSync(dirname(logPath))) mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), previous: serving, promoted: { id: chosen.id, url: chosen.url, sha: decision.sha }, hosts: CANONICAL.canonicalHosts }) + "\n");
  console.log(`  recorded previous=${serving?.id ?? "none"} -> ${logPath}`);

  const promote = await api<{ error?: { message?: string } }>(`/v10/projects/${CANONICAL.vercelProjectId}/promote/${chosen.id}?teamId=${CANONICAL.vercelTeamId}`, { method: "POST" });
  if (promote.status >= 300) { console.error(`  PROMOTE FAILED: ${promote.status} ${promote.body.error?.message ?? ""}\n`); process.exit(1); }
  console.log(`  promoted ${chosen.id}`);

  await new Promise((r) => setTimeout(r, 8000));
  const after = await currentProduction(api);
  console.log(`  canonical production after: ${after?.id ?? "?"}`);
  let bad = after?.id !== chosen.id;
  for (const host of CANONICAL.canonicalHosts) {
    const rb = await readBack(host);
    const okHost = rb?.deploymentId === chosen.id && rb?.commitSha === decision.sha && rb?.target === "production";
    if (!okHost) bad = true;
    console.log(`  ${okHost ? "ok  " : "FAIL"} ${host}/api/release -> ${rb ? `${rb.deploymentId} ${rb.commitSha?.slice(0, 7)} ${rb.target}` : "unreadable"}`);
  }
  console.log(bad ? `\n  Promotion did not read back cleanly. Previous production id is in ${logPath}.\n` : `\n  Released ${decision.sha.slice(0, 7)} as ${chosen.id}.\n`);
  if (bad) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
