/**
 * The one sanctioned way a deployment becomes Price2Book production.
 *
 *   npx tsx scripts/release-production.ts             # PREFLIGHT: read-only
 *   npx tsx scripts/release-production.ts --create    # create the pinned deployment + receipt
 *   npx tsx scripts/release-production.ts --promote   # promote the receipt-bound candidate
 *
 * THREE PHASES, AND ONLY ONE OF THEM READS ANYTHING WITHOUT WRITING.
 *
 *   (no flag)   PREFLIGHT. Reads GitHub main, the commit tree, the project's
 *               settings and the current production baseline, and decides
 *               whether a release COULD proceed. Mutates nothing.
 *   --create    PHASE B. Creates a deployment from a pinned, explicitly
 *               approved sha and writes a durable creation receipt binding
 *               runId, candidate id, sha and the outgoing baseline.
 *   --promote   PHASE C. Promotes ONLY the candidate the receipt names, then
 *               re-reads the target, every canonical alias and every canonical
 *               host's served identity before calling it a release.
 *
 * THE CANDIDATE IS CAUSED, NOT CHOSEN.
 *
 * This command does not list deployments and pick one, and it does not decide
 * a deployment's origin from its metadata. It CREATES the deployment and keeps
 * the id returned by its own creation request, because an origin-trust
 * observation established that every origin-looking field on a deployment
 * record — source, githubDeployment, githubCommitSha, githubCommitVerification
 * and the rest — is writable by the caller that creates it. A record that says
 * "GitHub built this" is a claim, not evidence.
 *
 * That is why phase C takes its candidate from the receipt phase B wrote and
 * refuses without one, and why the promote response body is never read for
 * identity: it was measured at one byte.
 *
 * WHAT IT NEVER DOES
 *
 * It never runs `vercel deploy` and never uploads a working tree. Phase B DOES
 * create a deployment — through the API, from a pinned sha, with no
 * projectSettings, so the project's approved build configuration applies and
 * the provenance guard in it runs. Vercel builds it from GitHub; this command
 * never builds anything itself.
 *
 * CREDENTIALS. The Vercel token comes from VERCEL_TOKEN in the OPERATOR'S
 * environment, never from a repository file: `.env` and `.env.local` are
 * deliberately NOT loaded here. A token that sits in the checkout is a token
 * every session on the machine holds, which is how the incident happened.
 *
 * P2B_GH_READ_TOKEN is required too, and its requirement is DELIBERATE rather
 * than incidental. The canonical repository is public, so the read would often
 * succeed without it — but an authenticated read fails closed on a bad or
 * missing credential instead of silently degrading to an anonymous, rate-
 * limited one, and the guard's NO_READ_CREDENTIAL refusal depends on it.
 *
 * RECORD. Every phase appends to P2B_RELEASE_LOG (default
 * ~/.price2book/release-log.jsonl): the intent, the promotion once accepted,
 * and the outcome. Recovery is "promote the id the receipt names", not
 * archaeology.
 */
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync, readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CANONICAL, PROVENANCE_BUILD_COMMAND } from "./_releaseProvenance";

import { parseCurrentProduction } from "./_releaseSource";
import { runRelease, type ReleaseIO } from "./_releaseRun";
import { type ApprovedBuild, type Read, type CreationReceipt, type AliasMapping } from "./_releaseControl";

/** The approved build, as constants. Changing these is a reviewed change. */
/**
 * The build configuration a canonical production deployment must have been
 * built with, established from the project itself rather than assumed.
 *
 * CORRECTED 5 September 2026. `outputDirectory: "public"` and `framework: null`
 * were carried over from the disposable proof fixture, which was a static site.
 * This repository is a Next.js application with 55 API route files; `public/`
 * holds images. With those values a preflight against the real project could
 * only ever have refused.
 *
 * Read-only dashboard inspection of the canonical project established:
 *
 *   Framework Preset   Next.js                 -> framework: "nextjs"
 *   Root Directory     repository root ("./")  -> rootDirectory: null
 *   Output Directory   Next.js default         -> outputDirectory: ""
 *   Install Command    no override             -> installCommand: null
 *   Build Command      no override             -> the project reports ""
 *
 * The first four are what the project reports today. `buildCommand` is
 * DELIBERATELY DIFFERENT.
 *
 * THE APPROVED BUILD COMMAND IS NOT INSTALLED, AND PREFLIGHT MUST REFUSE.
 *
 * The canonical project still runs Vercel's automatic command. The provenance
 * one-liner — the thing that makes the guard run at all — is not on the project,
 * so `compareBuild` will report drift on `buildCommand` and preflight will
 * refuse PROJECT_SETTINGS_NOT_APPROVED. That is correct: a release must not
 * proceed while the guard would not run.
 *
 * It resolves when a separately reviewed and authorized Stage 2 installs the
 * command on the project. It must NOT be resolved by relaxing this constant to
 * whatever the project currently says — that inverts the check into adopting
 * the project's configuration as approved, which is the failure this whole
 * mechanism exists to prevent.
 */
export const APPROVED_BUILD: ApprovedBuild = {
  rootDirectory: null,
  installCommand: null,
  buildCommand: PROVENANCE_BUILD_COMMAND,   // NOT yet installed on the project
  outputDirectory: "",
  framework: "nextjs",
};
/** Where a canonical host may legitimately redirect to. */
export const APPROVED_REDIRECT_HOSTS: readonly string[] = CANONICAL.canonicalHosts;

const API = "https://api.vercel.com";

/**
 * A fresh read of GitHub refs/heads/main.
 *
 * AUTHENTICATED BY CHOICE, not by necessity. The canonical repository is PUBLIC,
 * so this read would usually succeed anonymously — but an authenticated read
 * fails closed on a bad or missing credential instead of degrading silently to
 * an anonymous, rate-limited one, and the guard's NO_READ_CREDENTIAL refusal
 * depends on the credential being required. The operator's read token is
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
// deploymentRecord and vercelJsonBuildCommand were removed. Both belonged to
// the superseded design that read a deployment's own record to decide its
// origin, and to a config-file check made from outside the release decision.
// The authoritative path is preflightDecision's commit-tree check, which
// refuses CONFIG_FILE_PRESENT for vercel.json, vercel.toml AND vercel.ts and
// refuses TREE_TRUNCATED when absence cannot be established at all.
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
  const read = (): { runId?: string } | null => {
    try { return JSON.parse(readFileSync(path, "utf8")) as { runId?: string }; } catch { return null; }
  };
  return {
    /** ATOMIC. O_EXCL either creates the file or fails; there is no window. */
    async acquire(info: { sha: string; runId: string }): Promise<{ ok: true } | { ok: false; heldBy: string }> {
      try {
        mkdirSync(dirname(path), { recursive: true });
        const fd = openSync(path, "wx", 0o600);           // wx = O_CREAT|O_EXCL
        writeSync(fd, JSON.stringify({
          runId: info.runId, operator: userInfo().username, host: hostname(),
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
    /** Which run holds it. Phase C acts only if the answer is its own. */
    async owner(): Promise<Read<string>> {
      const j = read();
      if (!j) return { read: false, why: "no release lock is held; phase B must run first" };
      return typeof j.runId === "string" && j.runId !== ""
        ? { read: true, value: j.runId }
        : { read: false, why: "the lock file carries no run id" };
    },
    /**
     * RELEASE ONLY WHAT WE OWN.
     *
     * A phase C with no receipt used to refuse and then delete the legitimate
     * run's lock in its finally block — worse than doing nothing, because the
     * refusal looked safe.
     */
    async release(runId: string): Promise<void> {
      const j = read();
      if (!j || j.runId !== runId) return;   // not ours; leave it alone
      // ONLY ENOENT IS "ALREADY GONE".
      //
      // This caught EVERY unlink error and resolved successfully, so the
      // caller's failure handling could never fire in production: an EPERM or
      // EIO left the lock in place while the refusal told the operator it had
      // been released. A lock that is held but reported as released blocks the
      // next release and reads as a stuck run.
      try {
        unlinkSync(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return;  // genuinely gone
        throw e;
      }
    },
  };
}

/**
 * A one-shot claim on promoting a candidate.
 *
 * Two concurrent phase-C processes both promoted, and the same receipt promoted
 * again once the lock was gone. An O_EXCL file per candidate makes both
 * impossible: the first claim wins and the file stays as the record that this
 * candidate has had its turn.
 */
export function promotionClaim(dir: string) {
  return {
    async claim(runId: string, candidateId: string): Promise<{ ok: true } | { ok: false; why: string }> {
      const file = join(dir, `promote-${candidateId.replace(/[^A-Za-z0-9_-]/g, "_")}.claim`);
      try {
        mkdirSync(dir, { recursive: true });
        const fd = openSync(file, "wx", 0o600);
        writeSync(fd, JSON.stringify({ runId, candidateId, at: new Date().toISOString(), pid: process.pid }));
        closeSync(fd);
        return { ok: true };
      } catch (e) {
        if ((e as { code?: string }).code !== "EEXIST") throw e;
        let by = "an earlier run";
        try { by = readFileSync(file, "utf8"); } catch { /* keep the default */ }
        return { ok: false, why: `promotion of ${candidateId} was already claimed by ${by}` };
      }
    },
  };
}

/**
 * Does an HTTP status establish that the promotion did NOT happen?
 *
 * Every status >= 300 was treated as definite, so a 503 released the lock as
 * though the request had certainly been refused. A gateway or proxy error says
 * nothing about whether the request reached Vercel or what it did there.
 */
export function isDefiniteFailure(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return false; // timeout / retry-ish
  if (status >= 500) return false;                                      // server or proxy: unknown
  return status >= 400;                                                 // a genuine refusal
}

/**
 * Append a record, and THROW if it cannot be written.
 *
 * The refusal in phase C depends on this throwing. A writer that swallows its
 * own failure would make "the rollback target was recorded" unfalsifiable.
 */
export async function appendRecord(
  path: string, record: unknown,
  write: (fd: number, buf: Buffer, off: number, len: number) => number = (fd, b, o, l) => writeSync(fd, b, o, l),
  sync: (fd: number) => void = fsyncSync
): Promise<void> {
  const buf = Buffer.from(JSON.stringify(record) + "\n", "utf8");
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a", 0o600);
  try {
    // THE WHOLE RECORD, OR NOTHING. writeSync returns the byte count it
    // actually wrote and may write fewer than asked; the previous version
    // ignored that, so a short write persisted `{`, was fsynced, and returned
    // successfully — a rollback target that is not one, reported as recorded.
    let written = 0;
    while (written < buf.length) {
      const n = write(fd, buf, written, buf.length - written);
      if (!Number.isInteger(n) || n <= 0)
        throw new Error(`short write: ${written} of ${buf.length} bytes, then ${n}`);
      written += n;
    }
    if (written !== buf.length)
      throw new Error(`incomplete record: ${written} of ${buf.length} bytes`);
    sync(fd);
  } finally { closeSync(fd); }
}

/**
 * Creation receipts — what phase B wrote, and what phase C requires.
 *
 * Kept beside the release log, one JSON object per line. Phase C reads the LAST
 * receipt for a candidate id; anything else means the id was not created here.
 */
export async function readReceipt(path: string, candidateId: string): Promise<Read<CreationReceipt>> {
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch (e) { return { read: false, why: `no creation receipts could be read (${String(e).slice(0, 60)})` }; }
  let found: CreationReceipt | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as Partial<CreationReceipt>;
      // Structural minimum only. Whether the RECOVERY BASELINE is intact is
      // decided by receiptRefusal() against the hosts this release requires,
      // which this function has no way to know.
      if (r && r.candidateId === candidateId && typeof r.sha === "string" && typeof r.runId === "string") {
        found = {
          runId: r.runId, candidateId: r.candidateId, sha: r.sha,
          createdAt: r.createdAt ?? "", operator: r.operator ?? "", host: r.host ?? "",
          outgoingDeploymentId: r.outgoingDeploymentId ?? "",
          outgoingAliases: Array.isArray(r.outgoingAliases) ? r.outgoingAliases : [],
        };
      }
    } catch { /* a damaged line proves nothing either way */ }
  }
  return found
    ? { read: true, value: found }
    : { read: false, why: `no creation receipt for ${candidateId}` };
}

/**
 * Every canonical host's alias destination, established rather than assumed.
 *
 * THREE WAYS THIS PREVIOUSLY CLAIMED ABSENCE IT HAD NOT PROVED:
 *
 *  - it read ONE page at `limit=100` and ignored `pagination.next`, so a host
 *    listed on page two was reported as verifiably unmapped;
 *  - a record for a canonical host whose `deploymentId` was malformed — `42` —
 *    failed the `typeof` guard and was silently skipped, which again presented
 *    as unmapped;
 *  - and both routes produced `{ read: true, value: null }`, the shape that
 *    means "we looked and there is nothing", when nothing had been established.
 *
 * So: pages are followed until every required host is resolved or the listing
 * genuinely ends; a malformed record for a required host makes THAT host
 * unread rather than absent; and running out of page budget while hosts are
 * still unresolved is a failed read, not an answer.
 */
export async function collectAliasMappings(
  api: Api, requiredHosts: readonly string[], maxPages = 20
): Promise<Read<readonly AliasMapping[]>> {
  const resolved = new Map<string, string>();
  const malformed = new Map<string, string>();
  let next: string | number | undefined;
  let pages = 0;

  const outstanding = () => requiredHosts.filter((h) => !resolved.has(h) && !malformed.has(h));

  for (;;) {
    let r: { status: number; body: unknown };
    const q = `/v4/aliases?projectId=${CANONICAL.vercelProjectId}&teamId=${CANONICAL.vercelTeamId}` +
      `&limit=100${next === undefined ? "" : `&until=${encodeURIComponent(String(next))}`}`;
    try { r = await api(q); }
    catch (e) { return { read: false, why: `alias list threw: ${String(e).slice(0, 80)}` }; }
    if (r.status >= 300) return { read: false, why: `alias list ${r.status}` };

    const page = readAliasPage(r.body, requiredHosts);
    if (!page.read) return { read: false, why: page.why };

    for (const [host, id] of page.value.resolved) resolved.set(host, id);
    for (const [host, why] of page.value.malformed) malformed.set(host, why);

    pages++;
    if (outstanding().length === 0) break;      // everything required is settled
    if (page.value.endOfList) break;            // the listing VERIFIABLY ended
    next = page.value.next;
    if (pages >= maxPages)
      return { read: false, why:
        `alias list still has pages after ${pages} and ${outstanding().join(", ")} remain unresolved` };
  }

  return { read: true, value: requiredHosts.map((host) => {
    const bad = malformed.get(host);
    if (bad) return { host, destination: { read: false as const, why: bad } };
    const d = resolved.get(host);
    // Absent from a listing that VERIFIABLY ended is verified absence.
    return { host, destination: d !== undefined
      ? { read: true as const, value: d }
      : { read: true as const, value: null } };
  }) };
}

/**
 * One page of the alias listing, validated as a UNIT before anything in it is
 * believed.
 *
 * THE REMAINING WAY THIS CLAIMED ABSENCE IT HAD NOT PROVED. Unknown shapes were
 * quietly turned into facts:
 *
 *  - `pagination.next` of an unexpected type became `undefined`, which the loop
 *    read as "the listing ended" — so an object where a cursor belonged ended
 *    the walk and every unseen host was reported unmapped;
 *  - a response with NO pagination metadata at all did the same, though nothing
 *    in it says the listing finished;
 *  - and entries like `[null, 42, {}]` were skipped one at a time. An entry
 *    whose host cannot be read might BE one of ours; skipping it is how it
 *    became "not in the listing".
 *
 * So: the end of the list must be stated, not inferred from a missing field;
 * a cursor must be a cursor; and an entry may only be dismissed as irrelevant
 * once its host has actually been read.
 */
export function readAliasPage(
  body: unknown, requiredHosts: readonly string[]
): Read<{
  resolved: ReadonlyMap<string, string>;
  malformed: ReadonlyMap<string, string>;
  endOfList: boolean;
  next: string | number | undefined;
}> {
  if (typeof body !== "object" || body === null)
    return { read: false, why: "alias list response is not an object" };
  const b = body as { aliases?: unknown; pagination?: unknown };

  if (!Array.isArray(b.aliases))
    return { read: false, why: "alias list carries no aliases array" };

  // THE END OF THE LIST IS STATED, NOT INFERRED. Vercel returns a pagination
  // object whose `next` is a cursor or null; absent metadata, or a `next` that
  // is neither, leaves us unable to say whether more pages exist — and "unable
  // to say" is not "there are none".
  if (!("pagination" in b))
    return { read: false, why: "alias list carries no pagination metadata, so the end of the list is not established" };
  const pag = b.pagination;
  let endOfList: boolean;
  let next: string | number | undefined;
  if (pag === null) { endOfList = true; next = undefined; }
  else if (typeof pag === "object" && !Array.isArray(pag)) {
    const px = pag as { next?: unknown };
    if (!("next" in px))
      return { read: false, why: "alias pagination carries no next field, so the end of the list is not established" };
    const nx = px.next;
    if (nx === null) { endOfList = true; next = undefined; }
    else if (typeof nx === "string" || typeof nx === "number") { endOfList = false; next = nx; }
    else return { read: false, why: `alias pagination.next is ${JSON.stringify(nx)}, which is not a cursor` };
  } else return { read: false, why: "alias pagination is not an object" };

  const resolved = new Map<string, string>();
  const malformed = new Map<string, string>();
  for (const raw of b.aliases) {
    // AN ENTRY WE CANNOT READ MIGHT BE ONE OF OURS. It is only irrelevant once
    // its host has been read and found to be someone else's.
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { read: false, why: `alias list contains an entry that is not an object (${JSON.stringify(raw)})` };
    const a = raw as { alias?: unknown; deploymentId?: unknown };
    if (typeof a.alias !== "string" || a.alias === "")
      return { read: false, why: `alias list contains an entry with no readable host (${JSON.stringify(a.alias)})` };
    if (!requiredHosts.includes(a.alias)) continue;   // read, and genuinely not ours
    if (typeof a.deploymentId !== "string" || a.deploymentId === "") {
      malformed.set(a.alias, `alias record carries a malformed deploymentId (${JSON.stringify(a.deploymentId)})`);
      continue;
    }
    resolved.set(a.alias, a.deploymentId);
  }

  return { read: true, value: { resolved, malformed, endOfList, next } };
}

/* ─────────────────────────── the live effects ───────────────────────────── */

const asRead = <T>(cond: boolean, value: T, why: string): Read<T> =>
  cond ? { read: true, value } : { read: false, why };

export function liveIO(api: Api, logPath: string, lockPath: string, receiptPath: string): ReleaseIO {
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
    // A CURRENT-PROJECT FACT, read from the project itself. Absent is not
    // false: a response that does not carry the field cannot establish that
    // auto-assignment is off, and preflight refuses on anything but an explicit
    // boolean false.
    readAutoAssignCustomDomains: async () => {
      try {
        const r = await api<{ autoAssignCustomDomains?: unknown }>(
          `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
        if (r.status >= 300) return { read: false, why: `project read ${r.status}` };
        if (!("autoAssignCustomDomains" in (r.body as object)))
          return { read: false, why: "the project response carries no autoAssignCustomDomains field" };
        const v = (r.body as { autoAssignCustomDomains?: unknown }).autoAssignCustomDomains;
        if (typeof v !== "boolean")
          return { read: false, why: `autoAssignCustomDomains is ${JSON.stringify(v)}, not a boolean` };
        return { read: true, value: v };
      } catch (e) { return { read: false, why: `project read threw: ${String(e).slice(0, 80)}` }; }
    },

    readProjectSettings: async () => {
      const r = await api<Record<string, unknown>>(
        `/v9/projects/${CANONICAL.vercelProjectId}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `project read ${r.status}` };
      return { read: true, value: settings(r.body as never) };
    },
    readAliasMappings: () => collectAliasMappings(api, CANONICAL.canonicalHosts),
    // Re-read after promoting. Aliases and served identity both reported the
    // candidate while the TARGET was still the incumbent, and that returned
    // success; the target is its own question.
    readProductionTarget: async () => {
      const raw = await currentProductionRaw(api);
      const parsed = parseCurrentProduction(raw.raw, raw.error);
      return parsed.ok
        ? { read: true as const, value: parsed.current.deploymentId }
        : { read: false as const, why: parsed.detail };
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

    // The WHOLE record — identity, ownership, readiness and target included.
    // Reading only the build settings and the sha let a response describing
    // another deployment, in another project, at target "preview" and still
    // building, satisfy every check and reach the promote effect.
    readCandidate: async (id) => {
      const r = await api<{
        uid?: string; id?: string; projectId?: string; readyState?: string; state?: string;
        target?: string | null; gitSource?: { sha?: unknown }; projectSettings?: Record<string, unknown>;
      }>(`/v13/deployments/${id}?teamId=${CANONICAL.vercelTeamId}`);
      if (r.status >= 300) return { read: false, why: `deployment read ${r.status}` };
      const b = r.body;
      const recId = b.uid ?? b.id;
      if (!recId) return { read: false, why: "deployment record carries no id" };
      const sha = typeof b.gitSource?.sha === "string" ? (b.gitSource.sha as string) : null;
      return { read: true, value: {
        id: recId, projectId: b.projectId ?? "", readyState: b.readyState ?? b.state ?? "UNKNOWN",
        target: b.target ?? null, sha,
        build: b.projectSettings ? settings(b.projectSettings as never) : null,
      } };
    },
    recordCreation: (r) => appendRecord(receiptPath, r),
    loadCreationReceipt: (id) => readReceipt(receiptPath, id),

    acquireLock: (info) => fileLock(lockPath).acquire(info),
    readLockOwner: () => fileLock(lockPath).owner(),
    claimPromotion: (runId, candidateId) => promotionClaim(dirname(lockPath)).claim(runId, candidateId),
    releaseLock: (runId) => fileLock(lockPath).release(runId),
    recordIntent: (r) => appendRecord(logPath, { event: "intent", ...r }),
    promoteDeployment: async (id) => {
      let r: { status: number; body: { error?: { message?: string } } };
      try {
        r = await api<{ error?: { message?: string } }>(
          `/v10/projects/${CANONICAL.vercelProjectId}/promote/${id}?teamId=${CANONICAL.vercelTeamId}`,
          { method: "POST" });
      } catch (e) {
        // No response at all: the promotion may or may not have happened.
        throw Object.assign(new Error(String(e).slice(0, 160)), { definite: false });
      }
      // A 4xx is a refusal; a 5xx is a shrug. Only the first establishes that
      // nothing happened, and only that one may release the lock.
      if (r.status >= 300)
        throw Object.assign(new Error(`promote ${r.status} ${r.body.error?.message ?? ""}`),
          { definite: isDefiniteFailure(r.status) });
    },
    // THREE DISTINCT JOURNAL EVENTS. "completed" conflated a promotion the API
    // accepted with a release whose routing was verified, so the log could not
    // say which had happened — and after a verification failure it said the
    // wrong one.
    recordPromotionAccepted: (r) => appendRecord(logPath, { event: "promotion-accepted", ...r }),
    recordReleaseVerified: (r) => appendRecord(logPath, { event: "release-verified", ...r }),
    recordRecoveryRequired: (r, why) =>
      appendRecord(logPath, { event: "recovery-required", why, ...r }),

    // Routing and target are DIFFERENT questions; both are asked.
    //
    // The previous version fetched the domains, threw the result away with
    // `void dom`, and gave every host the PRODUCTION TARGET id as its alias
    // mapping — so "the alias points where we expect" was just "the target
    // moved", restated. That is the exact confusion the observation corrected.
    observeHosts: async (_expected) => {
      // The SAME reader the baseline uses: paginated, and malformed records for
      // a canonical host are unread rather than absent.
      const mappings = await collectAliasMappings(api, CANONICAL.canonicalHosts);
      const byHost = new Map(mappings.read ? mappings.value.map((m) => [m.host, m.destination]) : []);
      return Promise.all(CANONICAL.canonicalHosts.map(async (host) => {
        const d = byHost.get(host);
        const alias: Read<string> = !mappings.read
          ? { read: false, why: mappings.why }
          : !d || !d.read
            ? { read: false, why: d && !d.read ? d.why : `${host} was not in the alias listing` }
            : d.value === null
              ? { read: false, why: `${host} is verifiably not mapped to any deployment` }
              : { read: true, value: d.value };
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
    },
    operator: () => userInfo().username,
    host: () => hostname(),
    log: (l) => console.log(l),
  };
}

/**
 * The phase, parsed strictly.
 *
 * `argv.includes("--create")` was too generous in three ways at once: it
 * accepted `--apply` by ignoring it and silently running a PREFLIGHT, it
 * accepted both phase flags together and picked whichever it tested first, and
 * it accepted any unknown flag or stray positional without comment. An operator
 * who types the old `--apply` out of muscle memory should be told the flag is
 * gone, not handed a dry run that looks like it did something.
 */
export function parsePhase(argv: readonly string[]):
  { ok: true; phase: "preflight" | "create" | "promote" } | { ok: false; detail: string } {
  const args = [...argv];
  if (args.length === 0) return { ok: true, phase: "preflight" };

  if (args.includes("--apply"))
    return { ok: false, detail:
      "--apply no longer exists. The release is three phases: no flag (preflight, read-only), " +
      "--create (create the pinned deployment and its receipt), --promote (promote the receipt-bound candidate)." };

  const phases = args.filter((a) => a === "--create" || a === "--promote");
  const others = args.filter((a) => a !== "--create" && a !== "--promote");
  if (others.length > 0)
    return { ok: false, detail: `unrecognized argument(s): ${others.join(" ")}. Expected no flag, --create, or --promote.` };
  if (phases.length > 1)
    return { ok: false, detail: `exactly one phase may be named; got ${phases.join(" ")}.` };

  return { ok: true, phase: phases[0] === "--create" ? "create" : "promote" };
}

async function main() {
  const parsed = parsePhase(process.argv.slice(2));
  if (!parsed.ok) { console.error(`\n  REFUSED: ${parsed.detail}\n`); process.exit(1); }
  const phase = parsed.phase;
  console.log(`\nPRODUCTION RELEASE — phase ${phase.toUpperCase()}\n`);

  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("  REFUSED: VERCEL_TOKEN is not set in this shell. It is deliberately not read from .env files.\n"); process.exit(1); }
  if (!process.env.P2B_GH_READ_TOKEN) {
    // NOT because the repository is private — it is public. An authenticated
    // read fails closed on a bad credential rather than degrading to an
    // anonymous, rate-limited one, and the guard refuses NO_READ_CREDENTIAL
    // without it. The requirement is a choice, not a consequence.
    console.error("  REFUSED: P2B_GH_READ_TOKEN is not set. Reads of GitHub are authenticated deliberately, so they fail closed.\n");
    process.exit(1);
  }

  const logPath = process.env.P2B_RELEASE_LOG ?? join(homedir(), ".price2book", "release-log.jsonl");
  const lockPath = process.env.P2B_RELEASE_LOCK ?? join(homedir(), ".price2book", "release.lock");
  const receiptPath = process.env.P2B_RELEASE_RECEIPTS ?? join(homedir(), ".price2book", "creation-receipts.jsonl");
  const io = liveIO(vercelApi(token), logPath, lockPath, receiptPath);

  const result = await runRelease({
    phase,
    approvedSha: process.env.P2B_APPROVED_SHA,
    candidateId: process.env.P2B_CANDIDATE_ID,
  }, APPROVED_BUILD, APPROVED_REDIRECT_HOSTS, io,
     { projectId: CANONICAL.vercelProjectId, target: CANONICAL.target, repoId: CANONICAL.repoId });

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
