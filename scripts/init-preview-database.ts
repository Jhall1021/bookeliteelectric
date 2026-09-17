/**
 * The Preview database initialization entry point — PR #63's "prepare a
 * concrete executable initialization path for a fresh isolated Preview
 * database" task.
 *
 * CORRECTED 20 Sep 2026, from code review of the first version (kept below
 * where the history still matters):
 *
 *   1. "Any production-lineage copy + a generic confirmation flag" is not a
 *      designated-target binding — it also accepts a SIBLING rehearsal
 *      branch, since that too is a genuine branch of production. Replaced
 *      with `--expect-endpoint`/`--expect-project`, values the operator
 *      obtains out-of-band when the ONE intended Preview branch is created,
 *      checked for an exact match against what `--target-url` actually
 *      resolves to. `classifyRehearsalTarget`'s lineage verdict is now
 *      SUPPORTING evidence (still required to pass) that the designated
 *      target is a genuine, non-archive, non-foreign branch of production —
 *      never treated as proof that it is the RIGHT branch. An explicit
 *      inequality check against production's own endpoint is asserted
 *      directly, not only inferred from the lineage marker.
 *   2. The remote path used to call `verify-database-identity.ts --stamp`
 *      unconditionally, which overwrites the inherited marker's
 *      `neonEndpoint` to the endpoint currently connected to. A branch's
 *      marker only proves it is a branch BECAUSE that field still names
 *      production's endpoint, not its own — restamping it destroys the very
 *      evidence `classifyRehearsalTarget` needs on the next run, so a
 *      retry (or a second script) would then call this SAME target "the
 *      original" and refuse it. Fixed: a remote target's identity marker is
 *      never mutated by this script. The verified project/endpoint are
 *      logged for the human record instead of written into shared state.
 *   3. Every rehearsal so far ran against a brand-new, EMPTY local database.
 *      A real Preview branch is a Neon copy-on-write clone of production —
 *      populated, not empty — and running an upsert-shaped seed chain into
 *      a populated database is not a fresh reset: `extract-template-
 *      catalog.ts` upserts strictly on `(trade, version)` and never looks
 *      for OTHER versions of the trade, so a clone that already carries
 *      production's real `electrical` DELTA rows (v2..v6) keeps them
 *      untouched, and `templateVersionSource`'s own fold (lib/
 *      templateProvisioning.ts) automatically layers every DELTA above the
 *      snapshot version back on top of whatever this script just built —
 *      silently producing a hybrid of "this run's v1" and "production's
 *      real v2-v6", not the intended catalog either side authored. Fixed
 *      with a real, narrow reset: `resetElectricalTemplateTree()` deletes
 *      every existing `TemplateVersion` row for `trade: "electrical"`
 *      before rebuilding — proven safe to do without touching anything
 *      already installed, because `Service.templateVersionId`/
 *      `AnswerOption.templateVersionId`/etc. are plain provenance strings
 *      with NO foreign key (prisma/schema.prisma:2440-2444's own comment:
 *      "A RECORD, not a link: nothing reads through it at request time") —
 *      only the template TREE itself (TemplateService -> TemplateQuestion ->
 *      TemplateAnswerOption -> its children, all real `onDelete: Cascade`
 *      FKs) is removed, and the `where: { trade: "electrical" }` scope
 *      cannot reach any other trade's rows, any `User`, or any already-
 *      installed `Service`/`Question`/`AnswerOption` row for ANY contractor.
 *      After rebuilding, `verifyIntendedCatalogIsCurrent()` asserts exactly
 *      one `electrical` `TemplateVersion` row exists and its own
 *      `TemplateService` count matches the expected build — proof the FOLDED
 *      catalog is what was intended, not merely that `installCatalog`
 *      reported a service count (which reads through the very fold that
 *      could be silently wrong).
 *   4. Two claims in the first version were not supported by the above and
 *      are retracted here: "every write is scoped to one throwaway
 *      Contractor row" (the reset above is a real, trade-scoped DELETE, not
 *      an insert-only write) and "safe concurrently by construction" (true
 *      only across DIFFERENT targets — the reset-then-rebuild against ONE
 *      designated remote target is a sequence of separate subprocess/prisma
 *      calls, not one transaction, so two runs against the SAME target at
 *      once are not safe and are not attempted here). See §3/§4 of
 *      docs/design/electrical-preview-initialization.md for the corrected
 *      claims and the retry/rebuild contract this implies.
 *
 * WHAT THIS IS
 *
 * A single, identity-checked orchestrator that runs the SAME accepted
 * catalog construction `scripts/rehearse-fresh-electrical-launch.ts` already
 * proved — its own exported `SEED_STEPS`/`NEEDS_APPLY`/`TOLERATE_NONZERO`/
 * `POST_SEED_STEPS`, `run()` helper, and its three named fixups
 * (`bootstrapContractor`, `addMissingCoverRaised4sRole`,
 * `applyBatch2fSurgeFix`) — reused directly, never re-derived or re-typed —
 * against whichever target this run's own identity check accepts, preceded
 * by a narrow reset of that trade's own template tree and followed by a
 * real `preflight`/`installCatalog` contractor setup through the SAME path
 * a real onboarding contractor uses (`lib/templateProvisioning.ts`, proven
 * correct by every other rehearsal script in this engagement) and a direct
 * check that the folded catalog is exactly the one this run built.
 *
 * WHAT THIS IS NOT
 *
 * Not a Neon-branch-creation tool — this repo has no Neon API integration
 * at all (confirmed by search: no `neon` package, no branch-creation code
 * anywhere). Provisioning the actual Preview branch stays a manual/external
 * step; this script starts from an already-existing target database's
 * connection string.
 *
 * Not yet run against anything but a local disposable target and a local
 * rehearsal of the populated-target contract (see
 * docs/design/electrical-preview-initialization.md §5). Running it against
 * a real Neon Preview branch is a SEPARATE, later, explicitly-authorized
 * step; nothing here performs that write on its own initiative, and the
 * identity guard below refuses to proceed against anything it cannot
 * positively confirm is the one designated target.
 *
 * TWO TARGET KINDS, ONE IDENTITY GUARD — checked BEFORE any write, in plan
 * mode too (plan mode reports the verdict; it just doesn't act on an ok one)
 *
 *   LOCAL   --target-url resolves to a loopback host. Creates a brand-new,
 *           uniquely-named scratch database (never a pre-existing one, no
 *           pre-drop, ever — the same rule every rehearsal script in this
 *           engagement follows) at the HOST/PORT/USER --target-url actually
 *           names (never a hardcoded one) and stamps it `local-*` before
 *           writing anything else, via the exact mechanism
 *           `prisma/_assertDisposableLocalDatabase.ts` already checks.
 *   REMOTE  Any other host. Refused unless ALL of the following hold:
 *             - `--expect-endpoint`/`--expect-project` were passed and the
 *               endpoint `--target-url` resolves to matches
 *               `--expect-endpoint` EXACTLY — the designated-target binding;
 *               a sibling rehearsal branch has a different endpoint and is
 *               refused by this check alone.
 *             - the resolved endpoint is explicitly NOT production's own
 *               endpoint (checked directly, not only inferred).
 *             - `scripts/_lineage.ts`'s own `classifyRehearsalTarget`
 *               returns `ok: true` — SUPPORTING evidence that this is a
 *               genuine branch of production, not an archive, not a
 *               foreign/unmarked database — never treated as proof of which
 *               specific branch it is.
 *           No connection string is ever printed by any of the above —
 *           only the short endpoint id `_lineage.ts`'s own `endpointOf()`
 *           extracts.
 *
 * PLAN BY DEFAULT
 *
 * No flag writes anything — `--apply` is required to actually create, reset
 * or seed a database, matching the convention `scripts/extract-template-
 * catalog.ts`, `scripts/finalize-panel-replacement-recipe.ts` and every
 * Phase F seed file already use. Deliberately NOT `release-production.ts`'s
 * `--create`/`--promote` phase naming: a Preview initializer is a rehearsal-
 * flavored tool that can be re-run freely against an owned/disposable
 * target, not the production release authority that idiom belongs to.
 *
 * PRESERVES OWNER ACCESS AND EVERY OTHER TRADE
 *
 * The reset and every seed/extraction write below is scoped to the
 * "electrical" trade's own `TemplateVersion` tree (`trade: "electrical"`,
 * matching `scripts/extract-template-catalog.ts`'s own `--from
 * elite-electric` flag) and one throwaway `Contractor` row created at the
 * end to prove installation. Nothing in this chain touches `User`,
 * `ContractorMembership`, any other trade's `TemplateVersion`/
 * `TemplateService` rows, or any ALREADY-INSTALLED contractor's `Service`/
 * `Question`/`AnswerOption` rows — the last of these is not merely a
 * convention here, it is structural: those rows carry no foreign key back
 * to `TemplateVersion` at all (see the correction note above), so deleting
 * the trade's template tree cannot reach them.
 *
 *   npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
 *     [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]
 *
 * `--expect-endpoint`/`--expect-project` are required once `--target-url`
 * is not a loopback host.
 *
 * See docs/design/electrical-preview-initialization.md for the full ordered
 * plan, current `main` reconciliation, retry/rebuild contract, and
 * integration-isolation notes this script implements.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { classifyRehearsalTarget, endpointOf, type Verdict } from "./_lineage";
import {
  SEED_STEPS, NEEDS_APPLY, TOLERATE_NONZERO, POST_SEED_STEPS,
  run, bootstrapContractor, addMissingCoverRaised4sRole, applyBatch2fSurgeFix,
} from "./rehearse-fresh-electrical-launch";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";

const TRADE = "electrical";
/** The service count `rehearse-fresh-electrical-launch.ts`'s own chain is proven to produce. */
const EXPECTED_SERVICE_COUNT = 82;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const TARGET_URL = value("target-url");
const APPLY = flag("apply");
const EXPECT_ENDPOINT = value("expect-endpoint");
const EXPECT_PROJECT = value("expect-project");

function usage(): never {
  console.error(
    "\nUsage: npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]\n" +
    "         [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]\n\n" +
    "  --expect-endpoint/--expect-project are REQUIRED once --target-url is not a\n" +
    "  loopback host — the exact identity you obtained when the Preview branch was\n" +
    "  created, not a generic confirmation. A connection string is never printed;\n" +
    "  only the short endpoint id.\n"
  );
  process.exit(1);
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

function createScratchDatabase(host: string, port: string, user: string, name: string): void {
  execFileSync("psql", ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe" });
}
function dropScratchDatabase(host: string, port: string, user: string, name: string): void {
  execFileSync("psql", ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
}

export type Plan =
  | { kind: "local"; databaseUrl: string; dbName: string; host: string; port: string; user: string }
  | { kind: "remote"; databaseUrl: string; verdictReason: string; endpoint: string; expectProject: string };

/**
 * The pure decision: given a parsed target, the operator's declared
 * expectations, production's own URL, and a lineage classifier (injectable
 * so this can be unit-tested with canned verdicts instead of a real Neon
 * connection — see scripts/verify-init-preview-database-contract.ts), is
 * this remote target the ONE designated Preview branch?
 *
 * Order matters: the exact-endpoint binding and the explicit inequality to
 * production are both checked BEFORE the lineage classifier runs, so a
 * mistaken sibling-branch URL is refused on the binding mismatch alone —
 * lineage is asked to confirm a target that has already cleared the
 * ownership question, never to establish it.
 */
export async function decideRemoteTarget(opts: {
  targetUrl: string;
  targetEndpoint: string;
  expectEndpoint: string | undefined;
  expectProject: string | undefined;
  productionUrl: string | undefined;
  classify: (targetUrl: string, productionUrl: string | undefined) => Promise<Verdict>;
}): Promise<{ ok: true; verdictReason: string } | { ok: false; reason: string }> {
  if (!opts.expectEndpoint || !opts.expectProject) {
    return { ok: false, reason:
      "a remote target needs --expect-endpoint and --expect-project — the exact identity " +
      "obtained when this Preview branch was created, not a generic confirmation. This binds " +
      "the run to ONE designated target; it will not accept any other genuine branch of " +
      "production, including a sibling rehearsal branch." };
  }
  if (opts.targetEndpoint !== opts.expectEndpoint) {
    return { ok: false, reason:
      `--target-url resolves to endpoint "${opts.targetEndpoint}", but --expect-endpoint declared ` +
      `"${opts.expectEndpoint}". These must agree — refusing rather than guessing which one was meant.` };
  }
  if (!opts.productionUrl) {
    return { ok: false, reason: "DATABASE_URL is not set, so production's endpoint cannot be measured for the explicit-inequality check." };
  }
  const productionEndpoint = endpointOf(opts.productionUrl);
  if (opts.targetEndpoint === productionEndpoint) {
    return { ok: false, reason: "the designated target's endpoint IS production's own endpoint. This script never writes there under any flag." };
  }
  const verdict = await opts.classify(opts.targetUrl, opts.productionUrl);
  if (!verdict.ok) {
    return { ok: false, reason: `did not pass the branch-of-production check. code=${verdict.code} — ${verdict.reason}` };
  }
  return { ok: true, verdictReason: verdict.reason };
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
    // rule. The host/port/user actually named in the URL are honored, never
    // a hardcoded scratch cluster address.
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    const user = decodeURIComponent(parsed.username) || "rehearsal_admin";
    const runId = `${Date.now()}_${process.pid}`;
    const dbName = `p2b_previewinit_${runId}`;
    const databaseUrl = `postgresql://${user}@${host}:${port}/${dbName}?schema=public`;
    return { kind: "local", databaseUrl, dbName, host, port, user };
  }

  const targetEndpoint = endpointOf(TARGET_URL);
  const decision = await decideRemoteTarget({
    targetUrl: TARGET_URL,
    targetEndpoint,
    expectEndpoint: EXPECT_ENDPOINT,
    expectProject: EXPECT_PROJECT,
    productionUrl: process.env.DATABASE_URL,
    classify: classifyRehearsalTarget,
  });
  if (!decision.ok) {
    console.error(`\n  REFUSED (${targetEndpoint}): ${decision.reason}\n`);
    process.exit(1);
  }
  return { kind: "remote", databaseUrl: TARGET_URL, verdictReason: decision.verdictReason, endpoint: targetEndpoint, expectProject: EXPECT_PROJECT! };
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
    : `  Would run against endpoint ${plan.endpoint} (project ${plan.expectProject}; ${plan.verdictReason}), then:`);
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
      console.log(`   4. reset "${TRADE}" template tree: COULD NOT READ existing state (${(e as Error).message}) — apply would refuse rather than guess`);
    }
  } else {
    console.log(`   4. reset "${TRADE}" template tree (a fresh local database has nothing to reset)`);
  }
  console.log(`   5. bootstrapContractor + addMissingCoverRaised4sRole`);
  console.log(`   6. ${SEED_STEPS.length} seed steps, in order (see scripts/rehearse-fresh-electrical-launch.ts's own SEED_STEPS)`);
  console.log(`   7. post-seed steps, in order:`);
  for (const step of POST_SEED_STEPS) console.log(`        - ${step.label}`);
  console.log(`   8. verify the folded "${TRADE}" catalog is exactly one SNAPSHOT with ${EXPECTED_SERVICE_COUNT} services — not merely that installation reports that count`);
  console.log(`   9. a real preflight/installCatalog contractor setup (normal onboarding path), to prove the catalog installs`);
  if (plan.kind === "local") console.log(`  10. drop the scratch database (local rehearsal only — a real Preview target is left in place)`);
  console.log(`\n  Nothing above has been executed. Pass --apply to run it for real.\n`);
}

/**
 * Delete every existing TemplateVersion row for TRADE, cascading through
 * its whole template tree. Proven safe against already-installed data:
 * Service/Question/AnswerOption's own templateVersionId/templateKey fields
 * are plain provenance strings with NO foreign key back to TemplateVersion
 * (prisma/schema.prisma:2440-2444), so nothing already installed from a
 * prior version — for ANY contractor — can be reached by this delete. Scope
 * is the trade string alone; no other trade's rows are queried at all.
 *
 * Deliberately does not swallow errors (unlike the test-cleanup
 * `teardownTrade` this pattern is drawn from,
 * scripts/verify-disclaimer-template-version-fold.ts) — a real reset that
 * fails partway should surface, not report false success.
 */
export async function resetElectricalTemplateTree(databaseUrl: string): Promise<{ version: number; kind: string }[]> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const existing = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
    if (existing.length > 0) {
      await prisma.templateVersion.deleteMany({ where: { id: { in: existing.map((v) => v.id) } } });
    }
    return existing.map((v) => ({ version: v.version, kind: v.kind }));
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The final folded catalog IS the intended one — not merely that
 * installCatalog reported a plausible service count, which reads through
 * the same fold that could be silently wrong (lib/templateProvisioning.ts's
 * templateVersionSource folds every DELTA above the snapshot version; a
 * stray inherited DELTA this run didn't create would be folded in
 * invisibly). Asserts both that exactly one TemplateVersion row exists for
 * the trade (the reset above ran and nothing else re-created a second one
 * mid-run) and that its own TemplateService count matches what this chain
 * is proven to build.
 */
export async function verifyIntendedCatalogIsCurrent(databaseUrl: string, expectedServiceCount: number): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const versions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
    if (versions.length !== 1) {
      throw new Error(`expected exactly one "${TRADE}" TemplateVersion after reset+rebuild, found ${versions.length}: ${JSON.stringify(versions)}`);
    }
    if (versions[0].kind !== "SNAPSHOT") {
      throw new Error(`expected the sole "${TRADE}" TemplateVersion to be a SNAPSHOT, found kind=${versions[0].kind}`);
    }
    const serviceCount = await prisma.templateService.count({ where: { templateVersionId: versions[0].id } });
    if (serviceCount !== expectedServiceCount) {
      throw new Error(
        `the folded "${TRADE}" catalog has ${serviceCount} service(s) under its sole TemplateVersion, expected ` +
        `${expectedServiceCount} — installCatalog reporting ${expectedServiceCount} is not proof of this on its own.`
      );
    }
    console.log(`\n  FOLDED CATALOG VERIFIED: exactly one "${TRADE}" TemplateVersion (v${versions[0].version} SNAPSHOT, id=${versions[0].id}) with ${serviceCount} services — no inherited DELTA or stale version present.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function initializeCatalog(plan: Plan) {
  const databaseUrl = plan.databaseUrl;
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });

  if (plan.kind === "local") {
    execFileSync("npx", [
      "tsx", "scripts/verify-database-identity.ts", "--stamp",
      "--expect", `local-previewinit-${plan.dbName}`, "--project", "local-disposable-not-neon",
      "--note", "Preview database initialization — scripts/init-preview-database.ts",
    ], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });

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
    // not this connection. Overwriting it would make classifyRehearsalTarget
    // call this SAME target "the original" on the very next check,
    // including a retry of this script. Record the verified identity for
    // the human log instead of writing it into shared state.
    console.log(`\n  Target verified: endpoint=${plan.endpoint} project=${plan.expectProject} (${plan.verdictReason})`);
    console.log(`  Identity marker left untouched — see docs/design/electrical-preview-initialization.md §2.\n`);
  }

  const deleted = await resetElectricalTemplateTree(databaseUrl);
  console.log(deleted.length === 0
    ? `\n  "${TRADE}" template tree: nothing existed, nothing reset.\n`
    : `\n  "${TRADE}" template tree RESET: deleted ${deleted.length} existing TemplateVersion row(s) (${deleted.map((v) => `v${v.version} ${v.kind}`).join(", ")}) before rebuilding.\n`);

  await bootstrapContractor(databaseUrl);
  await addMissingCoverRaised4sRole(databaseUrl);

  for (const step of SEED_STEPS) {
    if (step === "__CONDITIONAL_DISCLAIMERS__") {
      run("prisma/seed-conditional-disclaimers.ts", [], {}, databaseUrl);
      continue;
    }
    const stepArgs = NEEDS_APPLY.has(step) ? ["--apply"] : [];
    run(step, stepArgs, TOLERATE_NONZERO[step] ? { allowFailure: TOLERATE_NONZERO[step] } : {}, databaseUrl);
  }

  for (const step of POST_SEED_STEPS) {
    console.log(`\n--- ${step.label} ---`);
    if (step.kind === "batch2fSurgeFix") await applyBatch2fSurgeFix(databaseUrl);
    else run(step.file, step.args ?? [], {}, databaseUrl);
  }

  await verifyIntendedCatalogIsCurrent(databaseUrl, EXPECTED_SERVICE_COUNT);
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
 * RETRY NOTE: this throwaway contractor's slug is timestamp-unique and is
 * NOT cleaned up by this script on success or failure. A target retried
 * several times (after a failed apply, or deliberately re-run) will
 * accumulate one `preview-init-check-*` Contractor per attempt — harmless
 * to the template catalog itself (this function only ever reads it), but
 * left for a human to prune if it matters. This is the retry/rebuild
 * contract documented in docs/design/electrical-preview-initialization.md
 * §2: the electrical template tree is idempotent across retries (each
 * apply resets it first); this proof contractor is not.
 */
async function proveNormalContractorSetup(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await prisma.contractor.create({
      data: { slug: `preview-init-check-${Date.now()}`, name: "Preview Init Check", active: true, countryCode: "US" },
      select: { id: true },
    });
    await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
    await prisma.pricingSettings.create({
      data: { contractorId: contractor.id, crewHourRateCents: 18500, primaryMinimumCents: 19500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, TRADE));
    if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
    const result = await installCatalog(prisma, contractor.id, pf.catalog);
    console.log(`\n  NORMAL CONTRACTOR SETUP PROVEN: installed ${result.services} services through the real preflight/installCatalog path.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const plan = await resolveTarget();
  if (!APPLY) { await printPlan(plan); return; }

  if (plan.kind === "local") {
    createScratchDatabase(plan.host, plan.port, plan.user, plan.dbName);
    console.log(`Scratch database created on ${plan.host}:${plan.port}: ${plan.dbName}`);
    try {
      await initializeCatalog(plan);
      await proveNormalContractorSetup(plan.databaseUrl);
      console.log(`\nDone — this was a LOCAL REHEARSAL only. Dropping the scratch database.`);
    } finally {
      dropScratchDatabase(plan.host, plan.port, plan.user, plan.dbName);
    }
  } else {
    console.log(`Initializing REMOTE target ${plan.endpoint}...`);
    await initializeCatalog(plan);
    await proveNormalContractorSetup(plan.databaseUrl);
    console.log(`\nDone. This Preview target is left in place — it is not this script's to drop.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
