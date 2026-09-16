/**
 * The Preview database initialization entry point — PR #63's "prepare a
 * concrete executable initialization path for a fresh isolated Preview
 * database" task.
 *
 * WHAT THIS IS
 *
 * A single, identity-checked orchestrator that runs the SAME accepted
 * catalog construction `scripts/rehearse-fresh-electrical-launch.ts` already
 * proved — its own exported `SEED_STEPS`/`NEEDS_APPLY`/`TOLERATE_NONZERO`/
 * `POST_SEED_STEPS`, `run()` helper, and its three named fixups
 * (`bootstrapContractor`, `addMissingCoverRaised4sRole`,
 * `applyBatch2fSurgeFix`) — reused directly, never re-derived or re-typed —
 * against whichever target this run's own identity check accepts, followed
 * by a real `preflight`/`installCatalog` contractor setup through the
 * SAME path a real onboarding contractor uses (`lib/templateProvisioning.ts`,
 * proven correct by every other rehearsal script in this engagement).
 *
 * WHAT THIS IS NOT
 *
 * Not a Neon-branch-creation tool — this repo has no Neon API integration
 * at all (confirmed by search: no `neon` package, no branch-creation code
 * anywhere). Provisioning the actual Preview branch stays a manual/external
 * step; this script starts from an already-existing target database's
 * connection string.
 *
 * Not yet run against anything but a local disposable target. Every
 * execution this round used `--target-url` pointed at a brand-new local
 * scratch database this script itself creates — see this manifest's own
 * evidence trail (docs/design/electrical-fresh-launch-reset-manifest.md).
 * Running it against a real Neon Preview branch is a SEPARATE, later,
 * explicitly-authorized step; nothing here performs that write on its own
 * initiative, and the identity guard below refuses to proceed against
 * anything it cannot positively confirm is a safe target.
 *
 * TWO TARGET KINDS, ONE IDENTITY GUARD — checked BEFORE any write, in plan
 * mode too (plan mode reports the verdict; it just doesn't act on an ok one)
 *
 *   LOCAL   --target-url resolves to a loopback host. Creates a brand-new,
 *           uniquely-named scratch database (never a pre-existing one, no
 *           pre-drop, ever — the same rule every rehearsal script in this
 *           engagement follows) and stamps it `local-*` before writing
 *           anything else, via the exact mechanism
 *           `prisma/_assertDisposableLocalDatabase.ts` already checks.
 *   REMOTE  Any other host. Refused UNLESS `scripts/_lineage.ts`'s own
 *           `classifyRehearsalTarget(targetUrl, process.env.DATABASE_URL)`
 *           returns `ok: true` — the SAME "is this a genuine branch of
 *           production, not production itself, not an archive, not a
 *           foreign lineage" verdict five other rehearsal scripts in this
 *           repo already trust for exactly this question — AND the
 *           operator passes `--i-am-targeting-a-real-preview-branch`,
 *           mirroring the one other place this repo uses an explicit "yes,
 *           deliberately" escape hatch
 *           (`scripts/extract-template-catalog.ts`'s own
 *           `--i-know-this-writes-to-production`).
 *
 * PLAN BY DEFAULT
 *
 * No flag writes anything — `--apply` is required to actually create or seed
 * a database, matching the convention `scripts/extract-template-catalog.ts`,
 * `scripts/finalize-panel-replacement-recipe.ts` and every Phase F seed file
 * already use. Deliberately NOT `release-production.ts`'s `--create`/
 * `--promote` phase naming: a Preview initializer is a rehearsal-flavored
 * tool that can be re-run freely against an owned/disposable target, not the
 * production release authority that idiom belongs to.
 *
 * PRESERVES OWNER ACCESS AND EVERY OTHER TRADE
 *
 * Every write below is scoped to the "electrical" trade's own
 * TemplateVersion (`scripts/extract-template-catalog.ts`'s own
 * `--from elite-electric` flag) and one throwaway `Contractor` row. Nothing
 * in this chain touches `User`, `ContractorMembership`, or any other
 * trade's `TemplateService`/`TemplateVersion` rows — there is structurally
 * nothing here that could.
 *
 *   npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
 *     [--i-am-targeting-a-real-preview-branch] [--label <short-name>]
 *
 * See docs/design/electrical-preview-initialization.md for the full ordered
 * plan, current `main` reconciliation, and integration-isolation notes this
 * script implements.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { classifyRehearsalTarget, endpointOf } from "./_lineage";
import {
  SEED_STEPS, NEEDS_APPLY, TOLERATE_NONZERO, POST_SEED_STEPS,
  run, bootstrapContractor, addMissingCoverRaised4sRole, applyBatch2fSurgeFix,
} from "./rehearse-fresh-electrical-launch";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const TARGET_URL = value("target-url");
const APPLY = flag("apply");
const CONFIRMED_REMOTE = flag("i-am-targeting-a-real-preview-branch");
const LABEL = value("label") ?? "preview";

const SCRATCH_HOST = "127.0.0.1";
const SCRATCH_PORT = 5544;
const SCRATCH_USER = "rehearsal_admin";

function isLoopback(url: string): boolean {
  const host = url.replace(/^.*@/, "").split(/[:/]/)[0];
  return host === "127.0.0.1" || host === "localhost";
}

function createScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe" });
}
function dropScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
}

type Plan =
  | { kind: "local"; databaseUrl: string; dbName: string }
  | { kind: "remote"; databaseUrl: string; verdictReason: string };

/**
 * Resolve and verify the target BEFORE anything else runs, in both plan and
 * apply mode — "verify... before writes" holds even when there will be no
 * write this call, so a plan run reports the real verdict rather than an
 * assumed one.
 */
async function resolveTarget(): Promise<Plan> {
  if (!TARGET_URL) {
    console.error("Usage: npx tsx scripts/init-preview-database.ts --target-url <url> [--apply] [--i-am-targeting-a-real-preview-branch] [--label <name>]");
    process.exit(1);
  }

  if (isLoopback(TARGET_URL)) {
    // The provided URL names a HOST, not a specific database this run may
    // write into directly — a brand-new, uniquely named database is created
    // fresh instead, matching every other rehearsal script's own
    // no-pre-drop rule. --target-url's own path/dbname portion is ignored
    // on purpose; only its host:port matter for the local case.
    const runId = `${Date.now()}_${process.pid}`;
    const dbName = `p2b_previewinit_${runId}`;
    const databaseUrl = `postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${dbName}?schema=public`;
    return { kind: "local", databaseUrl, dbName };
  }

  // REMOTE: refuse unless this is a genuine, confirmed branch of
  // production — never production itself, never an archive, never a
  // foreign/unmarked database — using the SAME mechanism
  // scripts/verify-rehearsal-target.ts and four other rehearsal scripts in
  // this repo already trust for exactly this question. Reused, not
  // reimplemented: a second lineage/marker check here could disagree with
  // the original one and both would look authoritative.
  const verdict = await classifyRehearsalTarget(TARGET_URL, process.env.DATABASE_URL);
  if (!verdict.ok) {
    console.error(`\n  REFUSED: ${TARGET_URL} did not pass the branch-of-production check.`);
    console.error(`  code=${verdict.code}`);
    console.error(`  ${verdict.reason}\n`);
    process.exit(1);
  }
  if (!CONFIRMED_REMOTE) {
    console.error(
      `\n  ${TARGET_URL} DOES look like a legitimate Preview branch (${verdict.reason}), but writing to\n` +
      `  any non-local target needs an explicit --i-am-targeting-a-real-preview-branch, the same\n` +
      `  "yes, deliberately" pattern scripts/extract-template-catalog.ts's own\n` +
      `  --i-know-this-writes-to-production flag uses for the opposite case.\n`
    );
    process.exit(1);
  }
  return { kind: "remote", databaseUrl: TARGET_URL, verdictReason: verdict.reason };
}

function printPlan(plan: Plan) {
  console.log(`\nPREVIEW DATABASE INITIALIZATION — ${plan.kind === "local" ? "LOCAL REHEARSAL" : "REMOTE (Preview branch)"} target\n`);
  console.log(plan.kind === "local"
    ? `  Would create a brand-new local scratch database at ${SCRATCH_HOST}:${SCRATCH_PORT}, stamp it local-*, then:`
    : `  Would run against ${endpointOf(plan.databaseUrl)} (${plan.verdictReason}), then:`);
  console.log(`   1. prisma db push --skip-generate --accept-data-loss (schema)`);
  console.log(`   2. verify-database-identity.ts --stamp (record which database this is)`);
  if (plan.kind === "local") console.log(`   3. assertDisposableLocalDatabase (belt-and-braces, same guard every local rehearsal script uses)`);
  console.log(`   4. bootstrapContractor + addMissingCoverRaised4sRole`);
  console.log(`   5. ${SEED_STEPS.length} seed steps, in order (see scripts/rehearse-fresh-electrical-launch.ts's own SEED_STEPS)`);
  console.log(`   6. post-seed steps, in order:`);
  for (const step of POST_SEED_STEPS) console.log(`        - ${step.label}`);
  console.log(`   7. a real preflight/installCatalog contractor setup (normal onboarding path), to prove the catalog installs`);
  if (plan.kind === "local") console.log(`   8. drop the scratch database (local rehearsal only — a real Preview target is left in place)`);
  console.log(`\n  Nothing above has been executed. Pass --apply to run it for real.\n`);
}

async function initializeCatalog(plan: Plan, identityLabel: string, neonProject: string) {
  const databaseUrl = plan.databaseUrl;
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });
  execFileSync("npx", [
    "tsx", "scripts/verify-database-identity.ts", "--stamp",
    "--expect", identityLabel, "--project", neonProject,
    "--note", "Preview database initialization — scripts/init-preview-database.ts",
  ], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });

  if (plan.kind === "local") {
    // Belt-and-braces, same as rehearse-fresh-electrical-launch.ts's own
    // main(): the stamp above is the operator's decision; this re-checks it
    // independently before anything is seeded. Meaningless for a remote
    // Preview target (it would refuse any non-loopback host outright) —
    // that side is gated by classifyRehearsalTarget + the confirmation
    // flag in resolveTarget() instead.
    process.env.DATABASE_URL = databaseUrl;
    const identityCheck = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await assertDisposableLocalDatabase(identityCheck);
    } finally {
      await identityCheck.$disconnect();
    }
  }

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
}

/**
 * "Normal contractor setup" — the same real, unmodified path
 * scripts/rehearse-fresh-electrical-launch-phase2.ts already uses to prove
 * a fresh install works: templateVersionSource -> preflight ->
 * installCatalog, once, against a throwaway contractor. Not a browser
 * signup and not a new proof surface — this only confirms the freshly
 * built catalog installs cleanly through the same door a real contractor
 * onboarding would use.
 */
async function proveNormalContractorSetup(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await prisma.contractor.create({
      data: { slug: `preview-init-check-${Date.now()}`, name: "Preview Init Check", active: true, countryCode: "US" },
      select: { id: true },
    });
    await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: "electrical" } });
    await prisma.pricingSettings.create({
      data: { contractorId: contractor.id, crewHourRateCents: 18500, primaryMinimumCents: 19500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, "electrical"));
    if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
    const result = await installCatalog(prisma, contractor.id, pf.catalog);
    console.log(`\n  NORMAL CONTRACTOR SETUP PROVEN: installed ${result.services} services through the real preflight/installCatalog path.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const plan = await resolveTarget();
  if (!APPLY) { printPlan(plan); return; }

  if (plan.kind === "local") {
    createScratchDatabase(plan.dbName);
    console.log(`Scratch database created on ${SCRATCH_HOST}:${SCRATCH_PORT}: ${plan.dbName}`);
    try {
      await initializeCatalog(plan, `local-previewinit-${plan.dbName}`, "local-disposable-not-neon");
      await proveNormalContractorSetup(plan.databaseUrl);
      console.log(`\nDone — this was a LOCAL REHEARSAL only. Dropping the scratch database.`);
    } finally {
      dropScratchDatabase(plan.dbName);
    }
  } else {
    console.log(`Initializing REMOTE target ${endpointOf(plan.databaseUrl)}...`);
    await initializeCatalog(plan, LABEL, "preview-branch");
    await proveNormalContractorSetup(plan.databaseUrl);
    console.log(`\nDone. This Preview target is left in place — it is not this script's to drop.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
