/**
 * The Preview database initialization entry point — PR #63's "prepare a
 * concrete executable initialization path for a fresh isolated Preview
 * database" task.
 *
 * CORRECTED TWICE from code review — first 20 Sep 2026 (kept in the file's
 * git history), then again 20 Sep 2026 on the SAME date after a second pass
 * found the first correction still incomplete in three places:
 *
 *   5. `--expect-project` was checked only for presence, then printed as
 *      "verified" — no comparison against anything actually observed on the
 *      target ever occurred, and `--expect-endpoint`'s own comparison used
 *      `_lineage.ts`'s `endpointOf()`, which discards everything after the
 *      first hostname segment. Fixed: `readTargetIdentity()` (injectable,
 *      unit-tested with canned identities — see
 *      scripts/verify-init-preview-database-contract.ts) actually queries
 *      the target's own inherited `database_identity.neonProject` column and
 *      compares it byte-for-byte against `--expect-project`; the endpoint
 *      comparison now uses the FULL hostname (`fullEndpoint()`, only the
 *      `-pooler` suffix stripped), not a truncated prefix; a new
 *      `--expect-database` is compared against the connection string's own
 *      database name. Neon exposes no branch identifier over a plain
 *      Postgres connection and this repo has no Neon API integration — the
 *      endpoint, unique per branch's compute, is this script's sole VERIFIED
 *      proxy for "which branch"; there is no separate `--expect-branch`
 *      flag, because an unchecked flag that merely echoes an operator's
 *      claim back at them is worse than no flag at all.
 *   6. `resetElectricalTemplateTree()` deletes the TEMPLATE tree, but
 *      `extract-template-catalog.ts --from elite-electric` reads its input
 *      from Elite's own LIVE `Service`/`Question`/`AnswerOption` rows, and
 *      several seed files (`bootstrapContractor`, `prisma/seed.ts`'s own
 *      `service.upsert({..., update: {}})`) leave an already-existing row's
 *      fields untouched on a re-run — so a populated target's stale Elite
 *      source data could survive into a "freshly built" catalog even though
 *      the TEMPLATE side was genuinely reset. Fixed: `resetEliteSourceData()`
 *      deletes Elite's own `AnswerOption`/`Question`/`Service` rows (bottom-
 *      up and explicit — rehearsal found that `Question.serviceId`/
 *      `AnswerOption.questionId` carry no cascade at all, so a direct
 *      `Service` delete throws a foreign-key violation; only their OWN
 *      children, like `AnswerOptionDisclaimer`, genuinely cascade),
 *      `ContractorCategory`, and `ContractorDisclaimer` rows before the seed
 *      chain runs, every time — the chain now always builds Elite's
 *      electrical data from nothing, never onto whatever a populated target
 *      already had. Also fixed: `verifyIntendedCatalogIsCurrent()` now calls
 *      the REAL fold (`templateVersionSource(...).load()`, the same
 *      resolution `installCatalog`/`preflight` use) instead of a raw
 *      `TemplateService.count()`, and accepts an optional normalized-content
 *      fingerprint to compare against a known-clean control build — a
 *      matching service count was never proof the CONTENT was the intended
 *      one. See scripts/verify-init-preview-database-contract.ts for a
 *      rehearsal that runs the REAL construction chain (not synthetic
 *      inserts) against a deliberately dirtied, already-populated target and
 *      proves the rebuild — and a same-target retry after a simulated
 *      partial failure — converge on byte-identical normalized content.
 *   7. Every subprocess this script runs used `stdio: "inherit"`, so a
 *      child's own error output (Prisma's and psql's connection-failure
 *      messages both embed the literal connection string, credentials
 *      included) would stream straight to the terminal/log before this
 *      script ever got a chance to look at it; `main().catch(console.error)`
 *      and `printPlan`'s own catch block printed raw `Error.message`/stack
 *      text for the same reason. Fixed: every subprocess now runs through
 *      `runCaptured()` (piped, never inherited, stdio) and every place that
 *      logs an error or subprocess output passes through `sanitizeSecrets()`
 *      first. `proveNormalContractorSetup()`'s throwaway contractor is now
 *      actually deleted when it's done (previously left to accumulate, one
 *      per retry) — a cleanup failure is reported, not swallowed.
 *
 * One honesty correction alongside the above: an already-installed
 * contractor's `Service` row surviving `resetElectricalTemplateTree()` at
 * the DATABASE level (proven true, unchanged) does NOT mean that
 * installation stays FUNCTIONAL. `lib/disclaimerAuthoring.ts`'s
 * `installedDisclaimerRequirements` looks up that service's originating
 * `TemplateService` by `(svc.templateKey, svc.templateVersionId)` — a
 * `TemplateVersion` this reset just deleted — so disclaimer resolution (and
 * anything else that reads through that same provenance lookup) silently
 * finds nothing for it afterward. This is expected and accepted, not a
 * defect requiring a migration path: this initializer's target is a
 * disposable Preview/rehearsal database, and a disposable install surviving
 * as an inert row rather than staying live across a from-scratch catalog
 * rebuild needs no migration guarantee.
 *
 * WHAT THIS IS
 *
 * A single, identity-checked orchestrator that runs the SAME accepted
 * catalog construction `scripts/rehearse-fresh-electrical-launch.ts` already
 * proved — its own exported `SEED_STEPS`/`NEEDS_APPLY`/`TOLERATE_NONZERO`/
 * `POST_SEED_STEPS` and its three named fixups (`bootstrapContractor`,
 * `addMissingCoverRaised4sRole`, `applyBatch2fSurgeFix`) — reused directly,
 * never re-derived or re-typed — against whichever target this run's own
 * identity check accepts, preceded by a narrow reset of BOTH that trade's
 * template tree AND Elite's own live source data, and followed by a direct
 * check (using the real fold) that the resulting catalog is exactly the one
 * this run built, then a real `preflight`/`installCatalog` contractor setup
 * through the SAME path a real onboarding contractor uses.
 *
 * WHAT THIS IS NOT
 *
 * Not a Neon-branch-creation tool — this repo has no Neon API integration at
 * all (confirmed by search: no `neon` package, no branch-creation code
 * anywhere). Provisioning the actual Preview branch stays a manual/external
 * step; this script starts from an already-existing target database's
 * connection string.
 *
 * Not yet run against anything but local disposable targets — see
 * docs/design/electrical-preview-initialization.md §6 for the two separate
 * local rehearsals (the script's own end-to-end run, and the dedicated
 * populated-target/retry/credential-sanitization proof). Running this
 * against a real Neon Preview branch is a SEPARATE, later,
 * explicitly-authorized step.
 *
 *   npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
 *     [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]
 *     [--expect-database <database-name>]
 *
 * `--expect-endpoint`/`--expect-project`/`--expect-database` are all
 * required once `--target-url` is not a loopback host, and are each checked
 * against what is actually observed on the target — never accepted merely
 * because they were supplied.
 *
 * See docs/design/electrical-preview-initialization.md for the full ordered
 * plan, current `main` reconciliation, retry/rebuild contract, and
 * integration-isolation notes this script implements.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { classifyRehearsalTarget, type Verdict } from "./_lineage";
import {
  SEED_STEPS, NEEDS_APPLY, TOLERATE_NONZERO, POST_SEED_STEPS,
  bootstrapContractor, addMissingCoverRaised4sRole, applyBatch2fSurgeFix,
} from "./rehearse-fresh-electrical-launch";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";

const TRADE = "electrical";
const ELITE_SLUG = "elite-electric";
/** The service count `rehearse-fresh-electrical-launch.ts`'s own chain is proven to produce. */
const EXPECTED_SERVICE_COUNT = 82;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const TARGET_URL = value("target-url");
const APPLY = flag("apply");
const EXPECT_ENDPOINT = value("expect-endpoint");
const EXPECT_PROJECT = value("expect-project");
const EXPECT_DATABASE = value("expect-database");

function usage(): never {
  console.error(
    "\nUsage: npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]\n" +
    "         [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]\n" +
    "         [--expect-database <database-name>]\n\n" +
    "  --expect-endpoint/--expect-project/--expect-database are REQUIRED once\n" +
    "  --target-url is not a loopback host — the exact identity you obtained when\n" +
    "  the Preview branch was created. Each is checked against what is actually\n" +
    "  observed on the target, never accepted merely because it was supplied. A\n" +
    "  connection string is never printed; only sanitized, redacted output.\n"
  );
  process.exit(1);
}

/**
 * Redacts the credential portion of any connection-string-shaped substring
 * (`//user:pass@`) before this process ever logs it. Prisma's and psql's own
 * connection-failure messages both embed the literal connection string —
 * every error and every byte of subprocess output this script logs passes
 * through this first.
 */
export function sanitizeSecrets(text: string): string {
  return text.replace(/\/\/[^\s'"/@]+:[^\s'"/@]+@/g, "//[redacted]@");
}

/** Parsed once, never logged raw. Every message below prints only `.hostname`/`.port`. */
function parseTargetUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    console.error("\n  --target-url is not a valid connection URL.\n");
    process.exit(1);
  }
}

function isLoopback(u: URL): boolean {
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
}

/**
 * The FULL hostname, only the `-pooler` suffix stripped (the same endpoint
 * served two ways — see scripts/_lineage.ts's own header comment). Unlike
 * that file's `endpointOf()`, this keeps the whole hostname rather than
 * truncating to the first dot-separated segment: two different endpoints
 * that happen to share a leading segment must never compare equal here.
 */
export function fullEndpoint(url: string): string {
  return new URL(url).hostname.replace(/-pooler(?=\.|$)/, "");
}

/** A password, when present, goes through PGPASSWORD only — never a CLI argument (ps output, shell history). */
function psqlEnv(password: string): NodeJS.ProcessEnv {
  return password ? { ...process.env, PGPASSWORD: password } : process.env;
}
function createScratchDatabase(host: string, port: string, user: string, password: string, name: string): void {
  execFileSync("psql", ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe", env: psqlEnv(password) });
}
function dropScratchDatabase(host: string, port: string, user: string, password: string, name: string): void {
  execFileSync("psql", ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe", env: psqlEnv(password) });
}

export type CapturedResult = { stdout: string; stderr: string; code: number };

/**
 * Runs a child process with piped (never inherited) stdio. A connection
 * failure's own error text from Prisma or psql can embed the literal
 * connection string; inherited stdio would stream that straight to the
 * terminal/log before anything here gets a chance to redact it, so every
 * subprocess this script runs — local or remote — goes through this.
 */
export function runCaptured(cmd: string, args: string[], env: NodeJS.ProcessEnv): CapturedResult {
  try {
    const stdout = execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env }).toString();
    return { stdout, stderr: "", code: 0 };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number | null };
    return {
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : "",
      code: err.status ?? 1,
    };
  }
}

function logCaptured(label: string, result: CapturedResult): void {
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (out.trim()) console.log(out);
  if (err.trim()) console.error(err);
  if (result.code !== 0) throw new Error(`${label} exited with code ${result.code}`);
}

/** The sanitizing equivalent of rehearse-fresh-electrical-launch.ts's own `run()` — see correction 7. */
function runSanitized(file: string, args: string[], opts: { allowFailure?: string } = {}, databaseUrl: string): void {
  console.log(`\n--- ${file} ${args.join(" ")} ---`);
  const result = runCaptured("npx", ["tsx", file, ...args], { ...process.env, DATABASE_URL: databaseUrl });
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (out.trim()) console.log(out);
  if (err.trim()) console.error(err);
  if (result.code !== 0) {
    if (opts.allowFailure) { console.log(`  (nonzero exit — treated as tolerable: ${opts.allowFailure})`); return; }
    throw new Error(`${file} exited with code ${result.code}`);
  }
}

export type TargetIdentity = { endpoint: string; database: string; project: string | null };

/**
 * What is ACTUALLY observed on a target, as opposed to what an operator
 * declared. `endpoint`/`database` come straight from the connection string
 * (no network round trip); `project` is read from the target's own
 * inherited `database_identity.neonProject` column — authoritative because
 * a Neon branch inherits its parent's marker row unchanged, so this is the
 * SAME project id production itself carries, not a guess. `null` means
 * unreadable (no marker, or the query failed) — the caller refuses on that,
 * it never treats an unreadable project as a pass.
 */
export async function readTargetIdentity(url: string): Promise<TargetIdentity> {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let project: string | null = null;
  try {
    const rows = await prisma.$queryRawUnsafe<{ neonProject: string }[]>('select "neonProject" from database_identity limit 1');
    project = rows[0]?.neonProject ?? null;
  } catch {
    project = null;
  } finally {
    await prisma.$disconnect();
  }
  return { endpoint: fullEndpoint(url), database, project };
}

export type Plan =
  | { kind: "local"; databaseUrl: string; dbName: string; host: string; port: string; user: string; password: string }
  | { kind: "remote"; databaseUrl: string; verdictReason: string; endpoint: string; database: string; expectProject: string };

/**
 * The pure decision: given the target URL, the operator's declared
 * expectations, production's own URL, an injectable identity reader, and an
 * injectable lineage classifier (both swappable with canned values so this
 * can be unit-tested without a real Neon connection — see
 * scripts/verify-init-preview-database-contract.ts), is this remote target
 * the ONE designated Preview branch?
 *
 * Order: missing declarations, then the explicit inequality to production
 * (URL-only, no query), then the target's OWN OBSERVED identity compared
 * field-by-field against what was declared, then lineage classification as
 * supporting evidence that the (already-bound) target is a genuine,
 * non-archive, non-foreign branch of production. Declaring the right values
 * is never sufficient on its own — every one of them is checked against
 * something actually read from the target or from production, not merely
 * echoed back.
 */
export async function decideRemoteTarget(opts: {
  targetUrl: string;
  expectEndpoint: string | undefined;
  expectProject: string | undefined;
  expectDatabase: string | undefined;
  productionUrl: string | undefined;
  readIdentity: (url: string) => Promise<TargetIdentity>;
  classify: (targetUrl: string, productionUrl: string | undefined) => Promise<Verdict>;
}): Promise<
  | { ok: true; identity: { endpoint: string; database: string; project: string }; verdictReason: string }
  | { ok: false; reason: string }
> {
  const { targetUrl, expectEndpoint, expectProject, expectDatabase, productionUrl, readIdentity, classify } = opts;

  if (!expectEndpoint || !expectProject || !expectDatabase) {
    return { ok: false, reason:
      "a remote target needs --expect-endpoint, --expect-project, and --expect-database — the exact " +
      "identity obtained when this Preview branch was created, not a generic confirmation. This binds " +
      "the run to ONE designated target; it will not accept any other genuine branch of production, " +
      "including a sibling rehearsal branch." };
  }
  if (!productionUrl) {
    return { ok: false, reason: "DATABASE_URL is not set, so production's endpoint cannot be measured for the explicit-inequality check." };
  }

  const targetEndpoint = fullEndpoint(targetUrl);
  const productionEndpoint = fullEndpoint(productionUrl);
  if (targetEndpoint === productionEndpoint) {
    return { ok: false, reason: "the designated target's endpoint IS production's own endpoint. This script never writes there under any flag." };
  }

  const identity = await readIdentity(targetUrl);
  if (!identity.project) {
    return { ok: false, reason: `could not read an identity marker's project from ${identity.endpoint} — an unmarked database is never a designated target.` };
  }
  if (identity.endpoint !== expectEndpoint) {
    return { ok: false, reason: `the target's OBSERVED endpoint is "${identity.endpoint}", but --expect-endpoint declared "${expectEndpoint}". These must agree — refusing rather than guessing which one was meant.` };
  }
  if (identity.database !== expectDatabase) {
    return { ok: false, reason: `the target's OBSERVED database name is "${identity.database}", but --expect-database declared "${expectDatabase}". These must agree.` };
  }
  if (identity.project !== expectProject) {
    return { ok: false, reason: `the target's own identity marker records project "${identity.project}", but --expect-project declared "${expectProject}". Declaring a project does not make it so — this is checked against the marker actually stamped on the target.` };
  }

  const verdict = await classify(targetUrl, productionUrl);
  if (!verdict.ok) {
    return { ok: false, reason: `did not pass the branch-of-production check. code=${verdict.code} — ${verdict.reason}` };
  }
  return { ok: true, identity: { endpoint: identity.endpoint, database: identity.database, project: identity.project }, verdictReason: verdict.reason };
}

/**
 * Resolve and verify the target BEFORE anything else runs, in both plan and
 * apply mode — "verify... before writes" holds even when there will be no
 * write this call, so a plan run reports the real verdict rather than an
 * assumed one.
 */
async function resolveTarget(): Promise<Plan> {
  if (!TARGET_URL) usage();
  const parsed = parseTargetUrl(TARGET_URL);

  if (isLoopback(parsed)) {
    // --target-url names a HOST, not a specific database this run may write
    // into directly — a brand-new, uniquely named database is created fresh
    // instead, matching every other rehearsal script's own no-pre-drop
    // rule. The host/port/user/password actually named in the URL are
    // honored, never a hardcoded scratch cluster address. A password, if
    // present, is preserved into the reconstructed URL (Prisma reads it
    // straight from there) and passed to psql only via PGPASSWORD — never
    // as a CLI argument, which would sit in `ps` output and shell history.
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    const user = decodeURIComponent(parsed.username) || "rehearsal_admin";
    const password = parsed.password ? decodeURIComponent(parsed.password) : "";
    const runId = `${Date.now()}_${process.pid}`;
    const dbName = `p2b_previewinit_${runId}`;
    const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
    const databaseUrl = `postgresql://${auth}@${host}:${port}/${dbName}?schema=public`;
    return { kind: "local", databaseUrl, dbName, host, port, user, password };
  }

  const decision = await decideRemoteTarget({
    targetUrl: TARGET_URL,
    expectEndpoint: EXPECT_ENDPOINT,
    expectProject: EXPECT_PROJECT,
    expectDatabase: EXPECT_DATABASE,
    productionUrl: process.env.DATABASE_URL,
    readIdentity: readTargetIdentity,
    classify: classifyRehearsalTarget,
  });
  if (!decision.ok) {
    console.error(`\n  REFUSED: ${sanitizeSecrets(decision.reason)}\n`);
    process.exit(1);
  }
  return {
    kind: "remote", databaseUrl: TARGET_URL, verdictReason: decision.verdictReason,
    endpoint: decision.identity.endpoint, database: decision.identity.database, expectProject: decision.identity.project,
  };
}

async function existingElectricalVersions(databaseUrl: string) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    return await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
  } finally {
    await prisma.$disconnect();
  }
}

async function printPlan(plan: Plan) {
  console.log(`\nPREVIEW DATABASE INITIALIZATION — ${plan.kind === "local" ? "LOCAL REHEARSAL" : "REMOTE (Preview branch)"} target\n`);
  console.log(plan.kind === "local"
    ? `  Would create a brand-new local scratch database at ${plan.host}:${plan.port}, stamp it local-*, then:`
    : `  Would run against endpoint ${plan.endpoint}, database ${plan.database} (project ${plan.expectProject}; ${plan.verdictReason}), then:`);
  console.log(`   1. prisma db push --skip-generate --accept-data-loss (schema)`);
  console.log(`   2. verify-database-identity.ts --stamp — LOCAL target only; a remote target's inherited`);
  console.log(`      marker is left untouched (restamping it would defeat classifyRehearsalTarget on retry)`);
  if (plan.kind === "local") console.log(`   3. assertDisposableLocalDatabase (belt-and-braces, same guard every local rehearsal script uses)`);
  if (plan.kind === "remote") {
    try {
      const existing = await existingElectricalVersions(plan.databaseUrl);
      console.log(existing.length === 0
        ? `   4. reset "${TRADE}" template tree: nothing to delete, target is already clean`
        : `   4. reset "${TRADE}" template tree: WOULD DELETE ${existing.length} existing TemplateVersion ` +
          `row(s) (${existing.map((v) => `v${v.version} ${v.kind}`).join(", ")}) and everything cascaded ` +
          `under them — no already-installed Service/Question/AnswerOption row is reachable from this delete`);
    } catch (e) {
      console.log(`   4. reset "${TRADE}" template tree: COULD NOT READ existing state (${sanitizeSecrets((e as Error).message)}) — apply would refuse rather than guess`);
    }
  } else {
    console.log(`   4. reset "${TRADE}" template tree (a fresh local database has nothing to reset)`);
  }
  console.log(`   5. reset "${ELITE_SLUG}" live source data (Quote/LineItem/PricingRule, Service/ContractorCategory/ContractorDisclaimer) — the seed chain always builds from nothing, never onto a populated target's stale rows`);
  console.log(`   6. bootstrapContractor + addMissingCoverRaised4sRole`);
  console.log(`   7. ${SEED_STEPS.length} seed steps, in order (see scripts/rehearse-fresh-electrical-launch.ts's own SEED_STEPS)`);
  console.log(`   8. post-seed steps, in order:`);
  for (const step of POST_SEED_STEPS) console.log(`        - ${step.label}`);
  console.log(`   9. verify the folded "${TRADE}" catalog via the REAL fold (templateVersionSource) — exactly one SNAPSHOT, ${EXPECTED_SERVICE_COUNT} services — not merely that installation reports that count`);
  console.log(`  10. a real preflight/installCatalog contractor setup (normal onboarding path), to prove the catalog installs, then delete that throwaway contractor`);
  if (plan.kind === "local") console.log(`  11. drop the scratch database (local rehearsal only — a real Preview target is left in place)`);
  console.log(`\n  Nothing above has been executed. Pass --apply to run it for real.\n`);
}

/**
 * Delete every existing TemplateVersion row for TRADE, cascading through
 * its whole template tree. Proven safe against already-installed data:
 * Service/Question/AnswerOption's own templateVersionId/templateKey fields
 * are plain provenance strings with NO foreign key back to TemplateVersion
 * (prisma/schema.prisma:2440-2444), so nothing already installed from a
 * prior version — for ANY contractor — can be reached by this delete. Scope
 * is the trade string alone; no other trade's rows are queried at all. (See
 * this file's header for why a surviving row is not the same as a
 * FUNCTIONAL one.)
 *
 * Deliberately does not swallow errors (unlike the test-cleanup
 * `teardownTrade` this pattern is drawn from,
 * scripts/verify-disclaimer-template-version-fold.ts) — a real reset that
 * fails partway should surface, not report false success.
 *
 * `TemplateAnswerOption.templatePolicyDefinitionId` is the one deliberate
 * `onDelete: Restrict` in this tree (prisma/schema.prisma:4372) — Postgres
 * does not reliably resolve that within a single cascading delete of
 * `TemplateVersion` (rehearsal found this for real: deleting a genuine,
 * policy-carrying v1 SNAPSHOT threw `Foreign key constraint violated:
 * template_answer_options_templatePolicyDefinitionId_fkey`, something a
 * toy fixture with no policies attached never exercised). Deleting the
 * `TemplateAnswerOption` rows explicitly first removes the only thing that
 * FK restricts, so the rest of the tree — `TemplateService`,
 * `TemplateQuestion`, `TemplatePolicyDefinition`, materials, disclaimers,
 * components — cascades cleanly from `TemplateVersion` afterward.
 */
export async function resetElectricalTemplateTree(databaseUrl: string): Promise<{ version: number; kind: string }[]> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const existing = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
    if (existing.length > 0) {
      const versionIds = existing.map((v) => v.id);
      await prisma.templateAnswerOption.deleteMany({ where: { templateQuestion: { templateService: { templateVersionId: { in: versionIds } } } } });
      await prisma.templateVersion.deleteMany({ where: { id: { in: versionIds } } });
    }
    return existing.map((v) => ({ version: v.version, kind: v.kind }));
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Delete Elite's own LIVE electrical source data — the rows
 * `extract-template-catalog.ts --from elite-electric` actually reads FROM,
 * as distinct from `resetElectricalTemplateTree`'s TARGET (the template
 * tree it writes TO). Several seed files upsert with `update: {}`
 * (`bootstrapContractor`, `prisma/seed.ts`'s own `service.upsert`), which
 * leaves an already-existing row's fields untouched on a re-run — so
 * without this, a populated target's stale Elite data could survive into a
 * "freshly built" catalog even after the template side was genuinely reset.
 *
 * Order matters, and matters MORE than a schema read alone suggested —
 * rehearsal found this for real: unlike the template tables,
 * `Question.serviceId` and `AnswerOption.questionId` carry NO `onDelete`
 * clause at all (prisma/schema.prisma:2496, 2548), which Postgres treats as
 * `NO ACTION` — the same as `Restrict` without deferral. Deleting `Service`
 * directly threw `Foreign key constraint violated:
 * questions_serviceId_fkey`. So `AnswerOption` and `Question` are deleted
 * explicitly, bottom-up, BEFORE `Service` — the exact order the
 * test-cleanup `teardownTrade`
 * (scripts/verify-disclaimer-template-version-fold.ts) already uses for its
 * own synthetic contractor, which is why that helper's shape was safe to
 * copy here. Everything ELSE hanging off `AnswerOption`/`Question`
 * (`AnswerOptionDisclaimer`/`AnswerOptionComponent`/`AnswerOptionMaterial`/
 * `AnswerOptionPhotoGroup`/`QuestionDisclaimer`) genuinely IS `onDelete:
 * Cascade` and needs no separate step. `ContractorCategory` has no such
 * ordering dependency but is deleted for the same reason: a genuinely fresh
 * rebuild should not inherit a stale category's contractor-owned
 * presentation fields (sortOrder/navGroup/nameOverride/iconOverride — see
 * prisma/_categoryHelpers.ts's own "idempotency rule": those are written on
 * CREATE and never touched again, by design, which is exactly why a stale
 * row needs deleting rather than re-seeding).
 *
 * ALSO deletes `Quote`/`LineItem`/`PricingRule` scoped to Elite's own
 * services. An earlier version of this comment invented a distinction
 * between "disposable catalog data" and "transaction history" and left
 * these three alone on the theory that they might be real customer
 * records — Joshua's authorization is not scoped that way: disposable
 * bookings, quotes, and sessions on this target are explicitly included,
 * the same as the catalog itself. `Quote` is deleted before `LineItem`
 * (its own `lineItemId` is a nullable, non-cascading unique FK to
 * `LineItem` — deleting the quote first avoids ever needing to touch that
 * FK from the other side). `GuidedFlowSession` needs no explicit step here;
 * it already cascades from `Service` (`onDelete: Cascade`).
 *
 * `assertNoUnsupportedServiceDependency` runs FIRST, before any delete: it
 * reads `pg_constraint` for every foreign key into `services` and refuses
 * up front if one exists that this function does not already know how to
 * clear. That check found a real, previously-unlisted one while this was
 * being rehearsed: `AnswerOption.referencedServiceId`
 * (`prisma/schema.prisma:2573-2574`, the `"AnswerOptionReferencedService"`
 * relation — e.g. a TV-installation answer option pricing itself off
 * Elite Tilt Mount's own live price) is a genuine, separate, non-cascading
 * FK into `services`, distinct from `AnswerOption.questionId`.
 * `AnswerOption.rerouteServiceId`, by contrast, is a bare `String?` with NO
 * `@relation` at all (confirmed by its absence from the schema) — a
 * provenance-style reference, not a real FK, exactly like `templateKey`/
 * `templateVersionId` elsewhere. The known set below is therefore
 * `questions`, `answer_options`, `line_items`, `quotes`, `pricing_rules` —
 * everything else with a real FK into `services` is `onDelete: Cascade`
 * already, and `answer_options` is already deleted (bottom-up, before
 * `Service`) by the explicit steps further down. A model added to the
 * schema later with its own new non-cascading FK to `Service` would
 * otherwise half-dismantle Elite's tree before failing on `Service` itself
 * with no clear signal why; refusing up front means a human decides
 * whether that new dependency needs the same authorization already
 * extended to the tables below, rather than this script assuming it or
 * silently leaving a partial mess.
 *
 * Scoped to ONE named contractor (`elite-electric`) — never a broader
 * "all contractors" or "all trades" delete. No `User`/`ContractorMembership`
 * row is queried at all. This does not touch production and is never run
 * against it (see the identity guard in decideRemoteTarget).
 */
const KNOWN_NON_CASCADING_SERVICE_DEPENDENCIES = new Set(["questions", "answer_options", "line_items", "quotes", "pricing_rules"]);

async function assertNoUnsupportedServiceDependency(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ referencing_table: string; delete_action: string }[]>(`
    select conrelid::regclass::text as referencing_table, confdeltype as delete_action
    from pg_constraint
    where contype = 'f' and confrelid = 'services'::regclass
  `);
  const unexpected = [...new Set(
    rows.filter((r) => r.delete_action !== "c" && !KNOWN_NON_CASCADING_SERVICE_DEPENDENCIES.has(r.referencing_table)).map((r) => r.referencing_table)
  )];
  if (unexpected.length > 0) {
    throw new Error(
      `resetEliteSourceData refuses: found a non-cascading foreign key into "services" from ` +
      `${unexpected.join(", ")} that this function does not already know how to clear. Extend it ` +
      `deliberately, with the same explicit authorization Quote/LineItem/PricingRule already have, ` +
      `rather than letting a partial delete fail on Service itself with no clear signal why.`
    );
  }
}

export async function resetEliteSourceData(databaseUrl: string): Promise<{
  deletedServices: number; deletedCategories: number; deletedDisclaimers: number;
  deletedQuotes: number; deletedLineItems: number; deletedPricingRules: number;
}> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await assertNoUnsupportedServiceDependency(prisma);
    const elite = await prisma.contractor.findUnique({ where: { slug: ELITE_SLUG }, select: { id: true } });
    if (!elite) return { deletedServices: 0, deletedCategories: 0, deletedDisclaimers: 0, deletedQuotes: 0, deletedLineItems: 0, deletedPricingRules: 0 };
    const serviceIds = (await prisma.service.findMany({ where: { contractorId: elite.id }, select: { id: true } })).map((s) => s.id);

    const quotes = await prisma.quote.deleteMany({ where: { OR: [{ serviceId: { in: serviceIds } }, { lineItem: { serviceId: { in: serviceIds } } }] } });
    const lineItems = await prisma.lineItem.deleteMany({ where: { serviceId: { in: serviceIds } } });
    const pricingRules = await prisma.pricingRule.deleteMany({ where: { serviceId: { in: serviceIds } } });

    await prisma.answerOption.deleteMany({ where: { question: { service: { contractorId: elite.id } } } });
    await prisma.question.deleteMany({ where: { service: { contractorId: elite.id } } });
    const services = await prisma.service.deleteMany({ where: { contractorId: elite.id } });
    const categories = await prisma.contractorCategory.deleteMany({ where: { contractorId: elite.id } });
    const disclaimers = await prisma.contractorDisclaimer.deleteMany({ where: { contractorId: elite.id } });
    return {
      deletedServices: services.count, deletedCategories: categories.count, deletedDisclaimers: disclaimers.count,
      deletedQuotes: quotes.count, deletedLineItems: lineItems.count, deletedPricingRules: pricingRules.count,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The raw fold (`templateVersionSource(...).load()`) leaves FOUR foreign
 * keys unresolved — option-level `canonicalComponentId`/`canonicalMaterialId`/
 * `canonicalDisclaimerId`/`photoGroupId` and service-level
 * `canonicalCategoryId` (`prisma/schema.prisma:4442-4583`; unlike the
 * SERVICE-level `materials`, which the query already nests
 * `canonicalMaterial: { select: { key: true } }` for). Those ids are the
 * SEMANTIC identity of the row, not row/provenance churn: two independently
 * built databases assign different opaque cuids to their `CanonicalComponent`
 * etc. rows even when the KEY is identical, so blindly stripping every
 * `*Id` field (as a first version of this comparison did) makes swapping
 * WHICH canonical component/material/disclaimer/photo-group/category an
 * option or service references disappear from the fingerprint entirely —
 * a real gap code review found, not a hypothetical one. This resolves each
 * to its stable `key` (or `slug` for categories) via one batched lookup per
 * kind before normalization ever runs, so the fingerprint compares WHAT a
 * branch means, not which opaque row happens to mean it this time.
 */
export type SemanticKeyMaps = {
  component: Map<string, string>; material: Map<string, string>;
  disclaimer: Map<string, string>; photoGroup: Map<string, string>; category: Map<string, string>;
};

function collectRawIds(value: unknown, ids: { component: Set<string>; material: Set<string>; disclaimer: Set<string>; photoGroup: Set<string>; category: Set<string> }): void {
  if (Array.isArray(value)) { value.forEach((v) => collectRawIds(v, ids)); return; }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.canonicalComponentId === "string") ids.component.add(o.canonicalComponentId);
    if (typeof o.canonicalMaterialId === "string") ids.material.add(o.canonicalMaterialId);
    if (typeof o.canonicalDisclaimerId === "string") ids.disclaimer.add(o.canonicalDisclaimerId);
    if (typeof o.photoGroupId === "string") ids.photoGroup.add(o.photoGroupId);
    if (typeof o.canonicalCategoryId === "string") ids.category.add(o.canonicalCategoryId);
    Object.values(o).forEach((v) => collectRawIds(v, ids));
  }
}

export async function buildSemanticKeyMaps(prisma: PrismaClient, services: unknown): Promise<SemanticKeyMaps> {
  const ids = { component: new Set<string>(), material: new Set<string>(), disclaimer: new Set<string>(), photoGroup: new Set<string>(), category: new Set<string>() };
  collectRawIds(services, ids);
  const [components, materials, disclaimers, photoGroups, categories] = await Promise.all([
    prisma.canonicalComponent.findMany({ where: { id: { in: [...ids.component] } }, select: { id: true, key: true } }),
    prisma.canonicalMaterial.findMany({ where: { id: { in: [...ids.material] } }, select: { id: true, key: true } }),
    prisma.canonicalDisclaimer.findMany({ where: { id: { in: [...ids.disclaimer] } }, select: { id: true, key: true } }),
    prisma.photoGroup.findMany({ where: { id: { in: [...ids.photoGroup] } }, select: { id: true, key: true } }),
    prisma.canonicalCategory.findMany({ where: { id: { in: [...ids.category] } }, select: { id: true, slug: true } }),
  ]);
  return {
    component: new Map(components.map((c) => [c.id, c.key])),
    material: new Map(materials.map((m) => [m.id, m.key])),
    disclaimer: new Map(disclaimers.map((d) => [d.id, d.key])),
    photoGroup: new Map(photoGroups.map((p) => [p.id, p.key])),
    category: new Map(categories.map((c) => [c.id, c.slug])),
  };
}

/** Adds a `*Key` sibling next to each of the 5 raw ids `buildSemanticKeyMaps` resolved. The raw id itself is left in place; `normalizeForComparison` strips it afterward. */
export function resolveSemanticIds(value: unknown, maps: SemanticKeyMaps): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveSemanticIds(v, maps));
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = resolveSemanticIds(v, maps);
    const resolve = (idKey: string, map: Map<string, string>, keyField: string) => {
      const id = o[idKey];
      if (typeof id === "string") out[keyField] = map.get(id) ?? `UNRESOLVED:${id}`;
    };
    resolve("canonicalComponentId", maps.component, "canonicalComponentKey");
    resolve("canonicalMaterialId", maps.material, "canonicalMaterialKey");
    resolve("canonicalDisclaimerId", maps.disclaimer, "canonicalDisclaimerKey");
    resolve("photoGroupId", maps.photoGroup, "photoGroupKey");
    resolve("canonicalCategoryId", maps.category, "canonicalCategoryKey");
    return out;
  }
  return value;
}

/**
 * Strips every opaque database id (the literal key `id`, and any key ending
 * in `Id`) plus timestamp fields — safe now that `resolveSemanticIds` has
 * already copied every SEMANTIC foreign key into a `*Key` sibling that
 * survives (it doesn't end in `Id`), so nothing meaningful is lost, only
 * row/provenance churn.
 *
 * `questions` and `options` are compared BY POSITION, never re-sorted:
 * `templateVersionSource`'s own query already returns them in the real
 * production order (`QUESTION_ORDER` / `{order:"asc"}`), and a changed
 * ENTRY or SEQUENCE must stay visible as a structural difference at some
 * array index — sorting them away would hide exactly the "did the guided
 * flow's order change" question this comparison exists to answer. Their
 * `order` field is rewritten to the array's own rank (0, 1, 2, ...)
 * afterward, which tolerates non-deterministic numeric SPACING between
 * otherwise-identical builds without tolerating an actual sequence change
 * (see `docs/design/electrical-preview-initialization.md` §6 for the two
 * real order-tie sources this rehearsal found and fixed at the seed level —
 * `prisma/seed-conditional-disclaimers.ts` and `prisma/seed-content-
 * fixes.ts` both inserted a question mid-tree without shifting whatever
 * already held that slot). A material line's own `order` (materials arrays
 * specifically, both service- and option-level) is dropped outright rather
 * than rank-normalized — it is a display convenience with no routing or
 * pricing effect, unlike a question's or option's.
 *
 * Every OTHER array (components, disclaimers, photoGroups per option,
 * services, policies) is an unordered SET as far as behavior is concerned,
 * so it is sorted by its own (already-normalized) JSON text for id-churn
 * and insertion-order tolerance.
 */
export function normalizeForComparison(value: unknown, arrayKey?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((v) => normalizeForComparison(v, arrayKey));
    if (arrayKey === "questions" || arrayKey === "options") {
      return normalized.map((item, i) =>
        item && typeof item === "object" && !Array.isArray(item) ? { ...(item as Record<string, unknown>), order: i } : item
      );
    }
    return [...normalized].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "id" || /Id$/.test(k) || k === "createdAt" || k === "updatedAt" || k === "stampedAt") continue;
      if (k === "order" && arrayKey === "materials") continue;
      out[k] = normalizeForComparison(v, k);
    }
    return out;
  }
  return value;
}

/** The real fold, semantic-key resolution, then normalization — one pipeline, reused by verification and by the negative-control tests alike. */
export async function buildCatalogFingerprint(prisma: PrismaClient, trade: string): Promise<{ fingerprint: string; serviceCount: number }> {
  const source = await templateVersionSource(prisma, trade).load();
  const maps = await buildSemanticKeyMaps(prisma, source.services);
  const resolved = resolveSemanticIds({ services: source.services, policies: [...source.policies.values()] }, maps);
  const fingerprint = JSON.stringify(normalizeForComparison(resolved));
  return { fingerprint, serviceCount: source.services.length };
}

/**
 * The final folded catalog IS the intended one — not merely that
 * installCatalog reported a plausible service count, which reads through
 * the same fold that could be silently wrong. Calls the REAL fold via
 * `buildCatalogFingerprint` (the same resolution `preflight`/`installCatalog`
 * use, plus semantic-key resolution — see that function and
 * `normalizeForComparison`) rather than a raw `TemplateService` count, so a
 * stray survivor that would ALSO fool `installCatalog` is caught here too.
 * Optionally compares the fold's normalized content against a known-clean
 * control build's fingerprint: a matching count was never proof the CONTENT
 * was the intended one.
 */
export async function verifyIntendedCatalogIsCurrent(
  databaseUrl: string,
  expectedServiceCount: number,
  expectedFingerprint?: string
): Promise<{ fingerprint: string }> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const versions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
    if (versions.length !== 1) {
      throw new Error(`expected exactly one "${TRADE}" TemplateVersion after reset+rebuild, found ${versions.length}: ${JSON.stringify(versions)}`);
    }
    if (versions[0].kind !== "SNAPSHOT") {
      throw new Error(`expected the sole "${TRADE}" TemplateVersion to be a SNAPSHOT, found kind=${versions[0].kind}`);
    }
    const { fingerprint, serviceCount } = await buildCatalogFingerprint(prisma, TRADE);
    if (serviceCount !== expectedServiceCount) {
      throw new Error(
        `the folded "${TRADE}" catalog has ${serviceCount} service(s), expected ${expectedServiceCount} ` +
        `— installCatalog reporting ${expectedServiceCount} is not proof of this on its own.`
      );
    }
    if (expectedFingerprint !== undefined && fingerprint !== expectedFingerprint) {
      throw new Error(
        `the folded "${TRADE}" catalog's normalized content does not match the clean-construction control — ` +
        `a matching service count is not proof the CONTENT is the intended one.`
      );
    }
    console.log(
      `\n  FOLDED CATALOG VERIFIED: exactly one "${TRADE}" TemplateVersion (v${versions[0].version} SNAPSHOT, id=${versions[0].id}) ` +
      `with ${serviceCount} services` +
      (expectedFingerprint !== undefined ? `, content matches the clean-construction control.\n` : ` — no inherited DELTA or stale version present.\n`)
    );
    return { fingerprint };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The reusable core: reset both the template tree and Elite's own live
 * source, rebuild via the accepted seed chain, verify the fold. Exported so
 * scripts/verify-init-preview-database-contract.ts can run the SAME
 * construction — not a synthetic stand-in — against a deliberately dirtied,
 * already-populated target, and so a retry after a partial failure is
 * exactly "call this again", nothing bespoke.
 */
export async function rebuildElectricalCatalog(
  databaseUrl: string,
  opts: { expectedServiceCount?: number; expectedFingerprint?: string } = {}
): Promise<{ fingerprint: string }> {
  const deletedVersions = await resetElectricalTemplateTree(databaseUrl);
  console.log(deletedVersions.length === 0
    ? `\n  "${TRADE}" template tree: nothing existed, nothing reset.`
    : `\n  "${TRADE}" template tree RESET: deleted ${deletedVersions.length} existing TemplateVersion row(s) (${deletedVersions.map((v) => `v${v.version} ${v.kind}`).join(", ")}) before rebuilding.`);

  const deletedSource = await resetEliteSourceData(databaseUrl);
  const nothingToReset = Object.values(deletedSource).every((n) => n === 0);
  console.log(nothingToReset
    ? `  "${ELITE_SLUG}" live source: nothing existed, nothing reset.\n`
    : `  "${ELITE_SLUG}" live source RESET: deleted ${deletedSource.deletedServices} Service row(s) (and their Question/AnswerOption rows), ` +
      `${deletedSource.deletedCategories} ContractorCategory row(s), ${deletedSource.deletedDisclaimers} ContractorDisclaimer row(s), ` +
      `${deletedSource.deletedQuotes} Quote row(s), ${deletedSource.deletedLineItems} LineItem row(s), ${deletedSource.deletedPricingRules} PricingRule row(s).\n`);

  await bootstrapContractor(databaseUrl);
  await addMissingCoverRaised4sRole(databaseUrl);

  for (const step of SEED_STEPS) {
    if (step === "__CONDITIONAL_DISCLAIMERS__") {
      runSanitized("prisma/seed-conditional-disclaimers.ts", [], {}, databaseUrl);
      continue;
    }
    const stepArgs = NEEDS_APPLY.has(step) ? ["--apply"] : [];
    runSanitized(step, stepArgs, TOLERATE_NONZERO[step] ? { allowFailure: TOLERATE_NONZERO[step] } : {}, databaseUrl);
  }

  for (const step of POST_SEED_STEPS) {
    console.log(`\n--- ${step.label} ---`);
    if (step.kind === "batch2fSurgeFix") await applyBatch2fSurgeFix(databaseUrl);
    else runSanitized(step.file, step.args ?? [], {}, databaseUrl);
  }

  return verifyIntendedCatalogIsCurrent(databaseUrl, opts.expectedServiceCount ?? EXPECTED_SERVICE_COUNT, opts.expectedFingerprint);
}

async function initializeCatalog(plan: Plan): Promise<void> {
  const databaseUrl = plan.databaseUrl;
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  logCaptured("prisma db push", runCaptured("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], env));

  if (plan.kind === "local") {
    logCaptured("verify-database-identity.ts --stamp", runCaptured("npx", [
      "tsx", "scripts/verify-database-identity.ts", "--stamp",
      "--expect", `local-previewinit-${plan.dbName}`, "--project", "local-disposable-not-neon",
      "--note", "Preview database initialization — scripts/init-preview-database.ts",
    ], env));

    // Belt-and-braces, same as rehearse-fresh-electrical-launch.ts's own
    // main(): the stamp above is the operator's decision; this re-checks it
    // independently before anything is seeded.
    process.env.DATABASE_URL = databaseUrl;
    const identityCheck = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await assertDisposableLocalDatabase(identityCheck);
    } finally {
      await identityCheck.$disconnect();
    }
  } else {
    // REMOTE: never restamp. The inherited marker was already verified (in
    // resolveTarget()) as an un-mutated, genuine branch of production —
    // that proof depends on its neonEndpoint field still naming production,
    // not this connection. Record the verified identity for the human log
    // instead of writing it into shared state.
    console.log(`\n  Target verified: endpoint=${plan.endpoint} database=${plan.database} project=${plan.expectProject} (${plan.verdictReason})`);
    console.log(`  Identity marker left untouched — see docs/design/electrical-preview-initialization.md §2.\n`);
  }

  await rebuildElectricalCatalog(databaseUrl);
}

/**
 * "Normal contractor setup" — the same real, unmodified path
 * scripts/rehearse-fresh-electrical-launch-phase2.ts already uses to prove
 * a fresh install works: templateVersionSource -> preflight ->
 * installCatalog, once, against a throwaway contractor. Not a browser
 * signup and not a new proof surface — this only confirms the freshly
 * built catalog installs cleanly through the same door a real contractor
 * onboarding would use.
 *
 * The throwaway contractor is deleted in `finally`, whether or not
 * installation succeeded — a target retried any number of times no longer
 * accumulates one `preview-init-check-*` Contractor per attempt. A cleanup
 * failure is REPORTED, not swallowed: it does not fail this function (the
 * proof it ran for already stands), but it is never hidden behind a bare
 * `catch {}`.
 */
async function proveNormalContractorSetup(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let contractorId: string | undefined;
  try {
    const contractor = await prisma.contractor.create({
      data: { slug: `preview-init-check-${Date.now()}`, name: "Preview Init Check", active: true, countryCode: "US" },
      select: { id: true },
    });
    contractorId = contractor.id;
    await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
    await prisma.pricingSettings.create({
      data: { contractorId: contractor.id, crewHourRateCents: 18500, primaryMinimumCents: 19500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, TRADE));
    if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
    const result = await installCatalog(prisma, contractor.id, pf.catalog);
    console.log(`\n  NORMAL CONTRACTOR SETUP PROVEN: installed ${result.services} services through the real preflight/installCatalog path.`);
  } finally {
    if (contractorId) {
      try {
        // Bottom-up, same as resetEliteSourceData: Question.serviceId and
        // AnswerOption.questionId carry no cascade, so Service must not be
        // deleted first.
        await prisma.answerOption.deleteMany({ where: { question: { service: { contractorId } } } });
        await prisma.question.deleteMany({ where: { service: { contractorId } } });
        await prisma.service.deleteMany({ where: { contractorId } });
        await prisma.contractorTrade.deleteMany({ where: { contractorId } });
        await prisma.pricingSettings.deleteMany({ where: { contractorId } });
        await prisma.contractor.delete({ where: { id: contractorId } });
        console.log(`  Cleaned up proof contractor ${contractorId}.`);
      } catch (cleanupErr) {
        console.error(`  WARNING: failed to clean up proof contractor ${contractorId}: ${sanitizeSecrets(String(cleanupErr))}`);
      }
    }
    await prisma.$disconnect();
  }
}

async function main() {
  const plan = await resolveTarget();
  if (!APPLY) { await printPlan(plan); return; }

  if (plan.kind === "local") {
    createScratchDatabase(plan.host, plan.port, plan.user, plan.password, plan.dbName);
    console.log(`Scratch database created on ${plan.host}:${plan.port}: ${plan.dbName}`);
    try {
      await initializeCatalog(plan);
      await proveNormalContractorSetup(plan.databaseUrl);
      console.log(`\nDone — this was a LOCAL REHEARSAL only. Dropping the scratch database.`);
    } finally {
      dropScratchDatabase(plan.host, plan.port, plan.user, plan.password, plan.dbName);
    }
  } else {
    console.log(`Initializing REMOTE target ${plan.endpoint}...`);
    await initializeCatalog(plan);
    await proveNormalContractorSetup(plan.databaseUrl);
    console.log(`\nDone. This Preview target is left in place — it is not this script's to drop.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(sanitizeSecrets(e instanceof Error ? (e.stack ?? e.message) : String(e)));
    process.exit(1);
  });
}
