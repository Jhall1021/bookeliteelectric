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
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync, readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CANONICAL, PROVENANCE_BUILD_COMMAND } from "./_releaseProvenance";

import { parseCurrentProduction } from "./_releaseSource";
import { runRelease, type ReleaseIO } from "./_releaseRun";
import { type ApprovedBuild, type Read } from "./_releaseControl";

/** The approved build, as constants. Changing these is a reviewed change. */
export const APPROVED_BUILD: ApprovedBuild = {
  rootDirectory: null, installCommand: null,
  buildCommand: PROVENANCE_BUILD_COMMAND, outputDirectory: "public", framework: null,
};
/** Where a canonical host may legitimately redirect to. */
export const APPROVED_REDIRECT_HOSTS: readonly string[] = CANONICAL.canonicalHosts;

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

/* listCandidates is GONE, deliberately.
 *
 * It listed deployments and let the caller pick one whose metadata claimed the
 * right commit. The observation showed every field it selected on is writable
 * by whoever deploys, so selection by claim cannot be made safe — the release
 * now creates the deployment and keeps the id its own request returned. */

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
export async function vercelJsonBuildCommand(
  sha: string, fetchImpl: FetchLike = fetch, token = process.env.P2B_GH_READ_TOKEN
): Promise<Read<string | null>> {
  if (!token) return { read: false, why: "no GitHub read credential" };

  // ABSENCE IS PROVED BY A SUCCESSFUL READ, NOT BY A 404.
  //
  // GitHub answers 404 for a private resource the credential cannot see, so a
  // 404 on the file alone is indistinguishable from a revoked token, a wrong
  // repository, or a commit that does not exist. Reading it as "no override"
  // meant a broken credential silently granted the permissive answer.
  //
  // So the ROOT TREE at the exact commit is read first. That one call proves
  // access works, proves the commit exists, and says whether vercel.json is
  // there — and only then does absence mean anything.
  let tree: { tree?: unknown } | null = null;
  try {
    const r = await fetchImpl(
      `https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/git/trees/${sha}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (!r.ok) return { read: false, why: `commit tree ${r.status} — access to the exact commit not established` };
    tree = (await r.json()) as { tree?: unknown };
  } catch (e) { return { read: false, why: `commit tree unreadable: ${String(e).slice(0, 80)}` }; }

  // A TRUNCATED TREE IS NOT A LISTING. GitHub sets `truncated: true` when the
  // response could not carry every entry, so "vercel.json is not in this array"
  // stops meaning "vercel.json is not in the commit" — the file could be in the
  // part that was cut. Absence needs a listing that claims to be complete.
  if ((tree as { truncated?: unknown }).truncated === true)
    return { read: false, why: "commit tree is truncated — absence cannot be established from a partial listing" };

  const entries = tree?.tree;
  if (!Array.isArray(entries)) return { read: false, why: "commit tree response has no tree array" };

  // And every entry must be a shape this can actually read. `[null, 42, {}]` is
  // an array, and `.some(path === "vercel.json")` is false over it — which is
  // absence concluded from entries that were never understood.
  const wellFormed = entries.every(
    (e) => typeof e === "object" && e !== null && !Array.isArray(e)
      && typeof (e as { path?: unknown }).path === "string"
      && (e as { path: string }).path !== ""
  );
  if (!wellFormed)
    return { read: false, why: "commit tree contains entries without a readable path" };

  const found = entries.some((e) => (e as { path: string }).path === "vercel.json");
  // Proved present-or-absent by a successful read of the commit's own tree.
  if (!found) return { read: true, value: null };

  try {
    const r = await fetchImpl(
      `https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/contents/vercel.json?ref=${sha}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" } }
    );
    if (!r.ok) return { read: false, why: `vercel.json listed in the tree but read ${r.status}` };
    const text = await r.text();
    // The tree says the file exists, so an empty body is a failed read, not an
    // empty configuration.
    if (text.trim() === "") return { read: false, why: "vercel.json is listed in the tree but came back empty" };
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { return { read: false, why: "vercel.json at the built commit is not valid JSON" }; }
    // `[]` and `"next build"` are valid JSON and are not configurations. Reading
    // buildCommand off them yields undefined, which used to mean "no override".
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { read: false, why: "vercel.json is not a JSON object" };
    const v = (parsed as { buildCommand?: unknown }).buildCommand;
    if (v === undefined || v === null) return { read: true, value: null };
    return typeof v === "string"
      ? { read: true, value: v }
      : { read: false, why: "vercel.json buildCommand is not a string" };
  } catch (e) { return { read: false, why: `vercel.json unreadable: ${String(e).slice(0, 80)}` }; }
}

/* readBack is GONE too. It asked whether a host answered; observeHosts in
 * liveIO asks whether the host reports THIS run's deployment id and sha, and
 * checks the alias mapping separately — because a stale deployment answers 200
 * perfectly well, and a promotion can move the target while an alias does not
 * follow. */

/* ────────────────────────────── the lock ─────────────────────────────────
 * A lock file coordinates ONE MACHINE. It has no authority over the Vercel
 * dashboard, another token, or the Git integration — so one machine is
 * designated for releases and the lock is meaningful only there.
 * ───────────────────────────────────────────────────────────────────────── */

export const RELEASE_MACHINE = process.env.P2B_RELEASE_MACHINE ?? "the designated release machine";

export function fileLock(path: string) {
  return {
    /** ATOMIC. O_EXCL either creates the file or fails; there is no window. */
    async acquire(info: { sha: string }): Promise<{ ok: true } | { ok: false; heldBy: string }> {
      try {
        mkdirSync(dirname(path), { recursive: true });
        const fd = openSync(path, "wx", 0o600);           // wx = O_CREAT|O_EXCL
        writeSync(fd, JSON.stringify({
          operator: userInfo().username, host: hostname(),
          sha: info.sha, at: new Date().toISOString(), pid: process.pid,
        }));
        closeSync(fd);
        return { ok: true };
      } catch (e) {
        if ((e as { code?: string }).code !== "EEXIST") throw e;
        // NEVER cleared automatically. A stale lock means either a release is
        // running or one died with an unknown outcome, and both want a person
        // before another release starts.
        let held = "unreadable lock file";
        try { held = readFileSync(path, "utf8"); } catch { /* keep the default */ }
        return { ok: false, heldBy: held };
      }
    },
    async release(): Promise<void> { try { unlinkSync(path); } catch { /* already gone */ } },
  };
}

/**
 * Append a record, and THROW if it cannot be written.
 *
 * The refusal in phase C depends on this throwing. A writer that swallows its
 * own failure would make "the rollback target was recorded" unfalsifiable.
 */
export async function appendRecord(path: string, record: unknown): Promise<void> {
  const fd = openSync(path, "a", 0o600);
  try {
    writeSync(fd, JSON.stringify(record) + "\n");
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

/* ─────────────────────────── the live effects ───────────────────────────── */

const asRead = <T>(cond: boolean, value: T, why: string): Read<T> =>
  cond ? { read: true, value } : { read: false, why };

export function liveIO(api: Api, logPath: string, lockPath: string): ReleaseIO {
  const settings = (o: {
    rootDirectory?: string | null; installCommand?: string | null;
    buildCommand?: string | null; outputDirectory?: string | null; framework?: string | null;
  }): ApprovedBuild => ({
    rootDirectory: o.rootDirectory ?? null, installCommand: o.installCommand ?? null,
    buildCommand: o.buildCommand ?? "", outputDirectory: o.outputDirectory ?? "",
    framework: o.framework ?? null,
  });

  return {
    // The repository is pinned from GITHUB, then Vercel's link must match it.
    readGithubRepoId: async () => {
      const t = process.env.P2B_GH_READ_TOKEN;
      if (!t) return { read: false, why: "no GitHub read credential" };
      try {
        const r = await fetch(`https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}`,
          { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
        if (!r.ok) return { read: false, why: `repo read ${r.status}` };
        const j = (await r.json()) as { id?: unknown };
        return asRead(typeof j.id === "number", j.id as number, "repository id absent or not numeric");
      } catch (e) { return { read: false, why: String(e).slice(0, 80) }; }
    },
    readProjectLink: async () => {
      const r = await api<{ link?: { repoId?: unknown } }>(
        `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `project read ${r.status}` };
      const id = r.body.link?.repoId;
      return asRead(typeof id === "number", id as number, "project has no numeric linked repository id");
    },
    readFreshMain: () => freshMainSha(),
    readCommitTree: async (sha) => {
      const t = process.env.P2B_GH_READ_TOKEN;
      if (!t) return { read: false, why: "no GitHub read credential" };
      try {
        const r = await fetch(`https://api.github.com/repos/${CANONICAL.owner}/${CANONICAL.repo}/git/trees/${sha}`,
          { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
        if (!r.ok) return { read: false, why: `commit tree ${r.status}` };
        const j = (await r.json()) as { tree?: unknown; truncated?: unknown };
        if (!Array.isArray(j.tree)) return { read: false, why: "tree response has no tree array" };
        const wellFormed = j.tree.every((e) => typeof e === "object" && e !== null
          && typeof (e as { path?: unknown }).path === "string" && (e as { path: string }).path !== "");
        if (!wellFormed) return { read: false, why: "tree contains entries without a readable path" };
        return { read: true, value: { truncated: j.truncated === true, paths: j.tree.map((e) => (e as { path: string }).path) } };
      } catch (e) { return { read: false, why: String(e).slice(0, 80) }; }
    },
    readProjectSettings: async () => {
      const r = await api<Record<string, unknown>>(
        `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `project read ${r.status}` };
      return { read: true, value: settings(r.body as never) };
    },
    readCurrentProduction: async () => {
      const raw = await currentProductionRaw(api);
      const parsed = parseCurrentProduction(raw.raw, raw.error);
      return parsed.ok
        ? { read: true, value: { deploymentId: parsed.current.deploymentId, aliases: parsed.current.aliases } }
        : { read: false, why: parsed.detail };
    },

    // PHASE B. gitSource pins the commit; NO projectSettings, so the project's
    // approved configuration applies rather than anything this request carries.
    createDeployment: async (sha) => {
      try {
        const r = await api<{ id?: string; error?: { message?: string } }>(
          `/v13/deployments?teamId=${CANONICAL.vercelTeamId}`,
          { method: "POST", body: JSON.stringify({
            name: CANONICAL.vercelProjectName, project: CANONICAL.vercelProjectId, target: "production",
            gitSource: { type: "github", repoId: CANONICAL.repoId, ref: CANONICAL.ref, sha },
          }) });
        if (r.status >= 300) return { error: `create ${r.status} ${r.body.error?.message ?? ""}` };
        return { id: r.body.id ?? null };
      } catch (e) { return { error: e }; }
    },

    readCandidateBuild: async (id) => {
      const r = await api<{ projectSettings?: Record<string, unknown> }>(
        `/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `deployment read ${r.status}` };
      const ps = r.body.projectSettings;
      if (!ps) return { read: false, why: "deployment record carries no projectSettings" };
      return { read: true, value: settings(ps as never) };
    },
    readCandidateSha: async (id) => {
      const r = await api<{ gitSource?: { sha?: unknown } }>(
        `/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `deployment read ${r.status}` };
      const sha = r.body.gitSource?.sha;
      return asRead(typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha), sha as string,
        "deployment record carries no commit sha");
    },

    acquireLock: (info) => fileLock(lockPath).acquire(info),
    releaseLock: () => fileLock(lockPath).release(),
    recordIntent: (r) => appendRecord(logPath, { phase: "intent", ...r }),
    promoteDeployment: async (id) => {
      const r = await api<{ error?: { message?: string } }>(
        `/v10/projects/${CANONICAL.vercelProjectId}/promote/${id}?teamId=${CANONICAL.vercelTeamId}`,
        { method: "POST" });
      if (r.status >= 300) throw new Error(`promote ${r.status} ${r.body.error?.message ?? ""}`);
    },
    recordCompletion: (r) => appendRecord(logPath, { phase: "completed", ...r }),

    // Routing and target are DIFFERENT questions; both are asked.
    observeHosts: async (expected) => {
      const dom = await api<{ domains?: { name?: string }[] }>(
        `/v9/projects/${CANONICAL.vercelProjectId}/domains?teamId=${CANONICAL.vercelTeamId}`);
      const cur = await currentProductionRaw(api);
      const targetId = ((cur.raw as { uid?: string; id?: string } | undefined) ?? {});
      void dom;
      return Promise.all(CANONICAL.canonicalHosts.map(async (host) => {
        const alias: Read<string> = targetId.uid || targetId.id
          ? { read: true, value: (targetId.uid ?? targetId.id) as string }
          : { read: false, why: "production target unreadable" };
        try {
          const r = await fetch(`https://${host}/api/release`, { headers: { "Cache-Control": "no-cache" }, redirect: "follow" });
          if (!r.ok) return { host, aliasDeploymentId: alias, served: { read: false as const, why: `HTTP ${r.status}` } };
          const j = (await r.json()) as { deploymentId?: string | null; commitSha?: string | null };
          return { host, aliasDeploymentId: alias, served: { read: true as const, value: {
            deploymentId: j.deploymentId ?? null, commitSha: j.commitSha ?? null,
            finalHost: new URL(r.url).hostname,
          } } };
        } catch (e) {
          return { host, aliasDeploymentId: alias, served: { read: false as const, why: String(e).slice(0, 80) } };
        }
      }));
      void expected;
    },
    log: (l) => console.log(l),
  };
}

async function main() {
  const phase = process.argv.includes("--create") ? "create"
    : process.argv.includes("--promote") ? "promote" : "preflight";
  console.log(`\nPRODUCTION RELEASE — phase ${phase.toUpperCase()}\n`);

  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("  REFUSED: VERCEL_TOKEN is not set in this shell. It is deliberately not read from .env files.\n"); process.exit(1); }
  if (!process.env.P2B_GH_READ_TOKEN) { console.error("  REFUSED: P2B_GH_READ_TOKEN is not set; the repository is private.\n"); process.exit(1); }

  const logPath = process.env.P2B_RELEASE_LOG ?? join(homedir(), ".price2book", "release-log.jsonl");
  const lockPath = process.env.P2B_RELEASE_LOCK ?? join(homedir(), ".price2book", "release.lock");
  const io = liveIO(vercelApi(token), logPath, lockPath);

  const result = await runRelease({
    phase,
    approvedSha: process.env.P2B_APPROVED_SHA,
    candidateId: process.env.P2B_CANDIDATE_ID,
  }, APPROVED_BUILD, APPROVED_REDIRECT_HOSTS, io);

  if (result.ok) {
    console.log(`\n  ${phase} OK — ${JSON.stringify(result)}\n`);
    return;
  }
  console.error(`\n  REFUSED (${result.code}): ${result.detail}\n`);
  if ("problems" in result) for (const p of result.problems) console.error(`    - ${p}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
