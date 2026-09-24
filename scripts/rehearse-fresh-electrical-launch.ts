/**
 * Fresh Electrical launch rehearsal — PR #63's FRESH-LAUNCH DIRECTION.
 *
 * Builds the intended fully composed Electrical catalog from checked-in
 * source only (no production/Neon access, ever), inside ONE brand-new,
 * uniquely-named, disposable local Postgres database this run creates and
 * destroys itself — never the shared p2b_integration_seeded cluster.
 *
 * WHY ONE CONSOLIDATED SNAPSHOT, NOT A REPLAYED v1->v2->v3->v4->v5->v6 CHAIN
 *
 * Production's real Electrical template is a SNAPSHOT (v1) plus a chain of
 * DELTAs (v2..v6), each published incrementally over weeks. Replaying that
 * incremental history has no purpose here: `installCatalog` only ever cares
 * about the FOLDED, final state (`templateVersionSource` with no atVersion
 * folds every DELTA newer than the SNAPSHOT). This run instead builds Elite's
 * live catalog fresh, with every real, checked-in improvement applied in one
 * pass, and extracts ONE consolidated v1 SNAPSHOT from it — functionally
 * identical to what installing from the real v1-v6 chain would produce, and
 * far less error-prone than trying to reproduce six historical publication
 * events from source that, for several of them, was never itself a
 * standalone script (see the per-version notes below).
 *
 * PER-VERSION PROVENANCE — what this run does and does not reconstruct
 *
 *   v1  SNAPSHOT (75 services) — reconstructed via a full run of the real
 *       seed chain (see SEED_STEPS below) plus scripts/extract-template-
 *       catalog.ts, the integration branch's own newer/safer copy (adds a
 *       production-refusal-by-identity guard, pricingMethod preservation,
 *       and Routing V2 field preservation not present on main's copy).
 *   v2  DELTA (new-120v-outlet only) — no dedicated writer script exists
 *       anywhere in this repo's history; it predates the Material Catalog
 *       workstream entirely. Not reconstructed as a separate delta — its
 *       content, whatever it was, is presumed already folded into
 *       new-120v-outlet's own current, checked-in seed content (the service
 *       has been actively maintained since), and is captured incidentally
 *       by this run's own full-catalog extraction of that service's CURRENT
 *       state. No claim is made that this is byte-identical to the real v2;
 *       only that nothing in this repo can reconstruct v2 more precisely.
 *   v3  DELTA (6 services: new-video-doorbell-wiring, generator-inlet-
 *       interlock, 240v-garage-outlet + 3 NEMA siblings) — verified against
 *       prisma/template/electrical-v3-provenance.json's own structured
 *       record: prisma/seed-generator-inlet.ts and prisma/seed-240v-garage-
 *       outlet.ts already write the exact structural materials that record
 *       lists. Reconstructed by the ordinary seed chain; no extra step
 *       needed.
 *   v4  DELTA (electrical-panel-replacement) — EXCLUDED. Its source branch
 *       (feat/material-batch-2a-panel-service-upgrade) was never merged into
 *       main or this integration branch (no merge commit exists anywhere in
 *       git history for either), and is now 439 files / ~66k lines behind
 *       main — reconstructing from it would mean pulling unreviewed,
 *       massively stale code. Project memory records this as "PR #67,
 *       merged"; git history does not support that. This discrepancy is
 *       reported, not silently resolved either way. electrical-panel-
 *       replacement's recipe in this run's output reflects whatever the
 *       ordinary seed chain gives it, which may be less complete than
 *       production's real v4.
 *   v5  DELTA (13 services, Batch 2E) — reconstructed by running the real,
 *       idempotent scripts/add-consumables-recipes.ts --apply, whose own
 *       13-service SERVICES list matches Batch 2E's real service list
 *       exactly.
 *   v6  DELTA (2 services, Batch 2F) — reconstructed two ways. Surge: one
 *       small, explicit, documented fix (applyBatch2fSurgeFix below), copied
 *       verbatim from commit 7cad9f4's own production-publication message,
 *       because prisma/seed-materials.ts on this branch is stale relative
 *       to what that commit reports Elite's real live data already was:
 *       whole-house-surge-protection's checked-in recipe still names the
 *       generic BREAKER_DOUBLE_POLE (production's real Elite row already
 *       used BREAKER_DOUBLE_POLE_20A). Fan: the real mechanism —
 *       scripts/add-equipment-roles.ts (creates BATH_FAN_STANDARD, which no
 *       prisma/seed-*.ts file defines) then scripts/build-fan-packages.ts
 *       (builds replace-bathroom-exhaust-fan's real priced tree with it
 *       wired in) — because prisma/seed-bathroom-fans.ts writes no material
 *       link at
 *       all for that service (production's real Elite row already carried
 *       BATH_FAN_STANDARD + CONSUMABLES_SMALL).
 *
 * ROUTING V2 — never previously extracted into the template layer at all
 *
 * Routing V2's shared modules (lib/rerouteHandoff.ts, the six
 * prisma/seed-routing-v2-*.ts files) write only to Elite's LIVE rows; no
 * TemplateVersion has ever carried them, on any branch. This run seeds them
 * into Elite's live catalog before extraction (so the full-catalog
 * extraction picks up the new surface-mounted-* fixture services and
 * new-120v-outlet's V2 rewiring), then — since seed-routing-v2-policies.ts
 * and seed-routing-v2-pricing-method.ts mutate an EXISTING TemplateVersion's
 * rows in place rather than writing Elite's live rows — runs those two
 * AFTER the extraction, against the freshly-created v1 SNAPSHOT.
 *
 * No production/Neon access. Nothing here merges, deploys, or writes to any
 * database other than the one disposable database this run creates itself.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const RUN_ID = `${Date.now()}_${process.pid}`;
const SCRATCH_HOST = "127.0.0.1";
const SCRATCH_PORT = 5544;
const SCRATCH_USER = "rehearsal_admin";
const DB_NAME = `p2b_freshlaunch_${RUN_ID}`;
const DB_URL = `postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${DB_NAME}?schema=public`;

function createScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe" });
}
function dropScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
}

/**
 * The one executable, documented way to end this run's ownership of a
 * scratch database it left running for Phase 2 to use.
 *
 *   npx tsx scripts/rehearse-fresh-electrical-launch.ts --teardown <db-name>
 *
 * Before this existed, "left running for inspection" named no next step —
 * an operator had to already know dropScratchDatabase()'s shape to end the
 * run's ownership at all. Guarded by the same loopback-host check the
 * disposable-database guard uses, so a copy-pasted db name from a stray
 * clipboard entry cannot target anything but this local cluster.
 */
async function teardown(name: string): Promise<void> {
  if (!/^p2b_freshlaunch_\d+_\d+$/.test(name)) {
    console.error(`Refusing to drop "${name}" — does not look like a database this script created (expected p2b_freshlaunch_<run-id>).`);
    process.exit(1);
  }
  dropScratchDatabase(name);
  console.log(`Dropped ${name} on ${SCRATCH_HOST}:${SCRATCH_PORT}.`);
}

/**
 * Exported so scripts/init-preview-database.ts can run the SAME ordered
 * construction chain against a DIFFERENT target — a real Preview branch's
 * own database, never this script's own local scratch one — without
 * re-deriving or re-typing the step list. `databaseUrl` defaults to this
 * script's own scratch DB so every existing call site below is unchanged.
 */
export function run(file: string, args: string[] = [], opts: { allowFailure?: string } = {}, databaseUrl: string = DB_URL): void {
  console.log(`\n--- ${file} ${args.join(" ")} ---`);
  try {
    execFileSync("npx", ["tsx", file, ...args], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });
  } catch (e) {
    if (opts.allowFailure) {
      console.log(`  (nonzero exit — treated as tolerable: ${opts.allowFailure})`);
      return;
    }
    throw e;
  }
}

/**
 * Every seed file needed for the full ~75-service catalog, in dependency
 * order, derived from reading seed-all.ts's own STEPS array plus every
 * standalone seed file it omits. seed-photo-groups.ts is inserted here even
 * though seed-all.ts itself omits it — prisma/seed-breakers.ts and several
 * out-of-STEPS files silently no-op their panel/work-area photo attachment
 * without it (confirmed by reading their own PhotoGroup lookups), which
 * seed-all.ts's own use elsewhere has apparently never surfaced.
 */
export const SEED_STEPS: string[] = [
  "prisma/seed.ts",
  "prisma/seed-questions.ts",
  "prisma/seed-pricing-settings.ts",
  "prisma/seed-materials.ts",
  "prisma/seed-photo-groups.ts",
  "prisma/seed-height-access.ts",
  "prisma/seed-lighting-control.ts",
  "prisma/seed-recessed-lighting.ts",
  "prisma/seed-breakers.ts",
  "prisma/seed-device-and-finish-modules.ts",
  "prisma/seed-new-outlet.ts",
  "prisma/seed-exterior-gfci.ts",
  "prisma/seed-exterior-gfci-routing.ts",
  "prisma/seed-bathroom-fans.ts",
  "prisma/seed-customer-supplied.ts",
  "prisma/seed-dedicated-circuit.ts",
  "prisma/seed-tv-installation.ts",
  "prisma/seed-access-normalization.ts",
  "prisma/seed-fixture-finish-ack.ts",

  // Not in seed-all.ts's STEPS at all. seed-appliance-services.ts runs
  // BEFORE __CONDITIONAL_DISCLAIMERS__ below, deliberately: it (re)builds
  // soundbar-installation's and replace-range-hood's trees from scratch via
  // clearTree(), which would silently discard any AnswerOptionDisclaimer
  // attached to them by a disclaimer step that ran first. The bootstrap
  // fixed the "no CanonicalDisclaimer from nothing" gap noted below; the
  // real seed-chain ordering still has to respect which files rebuild a
  // tree versus which attach onto one already built.
  "prisma/seed-appliance-services.ts",

  // Previously a known, expected failure — see FIXTURE_SEED docstring in
  // scripts/verify-audit-batch-adoption.ts for the full evidence trail: no
  // path in this codebase created a CanonicalDisclaimer row from nothing on
  // a from-scratch database. seed-conditional-disclaimers.ts now bootstraps
  // its own CanonicalDisclaimer + Elite ContractorDisclaimer rows from its
  // own already-reviewed, checked-in DISCLAIMERS text before attaching them
  // — including CUSTOMER_SUPPLIED_EQUIPMENT, replacing the inline
  // AnswerOption.disclaimer soundbar-installation and replace-range-hood
  // used to carry.
  "__CONDITIONAL_DISCLAIMERS__",
  "prisma/seed-content-fixes.ts",
  "prisma/seed-labor-hours.ts",
  "prisma/seed-dedicated-circuit-labor.ts",

  "prisma/seed-phase-f-material-roles.ts",
  "prisma/seed-phase-f-role-redesign.ts",
  "prisma/seed-phase-f-material-costs.ts",
  "prisma/seed-phase-f-costs-round2.ts",
  "prisma/seed-video-doorbell-wiring.ts",
  "prisma/seed-generator-inlet.ts",
  "prisma/seed-hot-tub-spa.ts",
  "prisma/seed-panel-replacement.ts",
  "prisma/seed-200a-service-upgrade.ts",
  "prisma/seed-240v-garage-outlet.ts",
  "prisma/seed-240v-appliance-circuits.ts",
  "prisma/seed-electric-fireplace-circuit.ts",
  "prisma/seed-level-2-ev-charger.ts",
  "prisma/seed-landscape-lighting.ts",
  "prisma/seed-under-cabinet-lighting.ts",
  // Phase E equipment roles — creates BATH_FAN_STANDARD (needed below by
  // build-fan-packages.ts and this run's own v6 fix) and the two TV-mount
  // equipment roles, wiring the latter into tilt-tv-mount and
  // articulating-tv-mount to close a real costWithoutRecipe gap (its own
  // docstring).
  "scripts/add-equipment-roles.ts",
  // Builds replace-bathroom-exhaust-fan's real priced tree (fan-only
  // package, BATH_FAN_STANDARD wired in) and its hidden
  // replace-bathroom-exhaust-fan-with-light reroute sibling — the real
  // mechanism behind Batch 2F's fan promotion, used here instead of a bare
  // ServiceMaterial insert.
  "scripts/build-fan-packages.ts",
  // prisma/seed-chandelier.ts deliberately OMITTED: it targets
  // "remove-and-replace-existing-chandelier", a slug prisma/seed.ts does not
  // create at all (confirmed — grep finds it nowhere in seed.ts, and several
  // OTHER seed files that reference the same slug already print their own
  // graceful "not in the catalog, skipped" for it). The service was
  // apparently removed/renamed from the base catalog at some point;
  // seed-chandelier.ts is stale and, unlike those other files, throws
  // instead of skipping. Not part of the current, real catalog — running it
  // would not add a real service, only crash the build.
  "prisma/seed-flood-camera.ts",
  "prisma/seed-low-voltage-and-sconces.ts",
  // Defines the bounded one-location photo-review tree and its fixed
  // exterior-box/consumables recipe. Omitting this left the base catalog's
  // old plural REMOTE_QUOTE placeholder structurally empty.
  "prisma/seed-new-exterior-light-location.ts",
  "prisma/seed-outlet-power-source.ts",
  "prisma/seed-material-categories.ts",
  "prisma/seed-zip-codes-nj.ts",

  // Routing V2 — live-layer seeds only. seed-routing-v2-policies.ts and
  // seed-routing-v2-pricing-method.ts run AFTER extraction (see main()).
  "prisma/seed-routing-v2-material-roles.ts",
  "prisma/seed-routing-v2-components.ts",
  "prisma/seed-routing-v2-component-materials.ts",
  "prisma/seed-component-labor-evidence.ts",
  "prisma/seed-routing-v2-fixtures.ts",
  "prisma/seed-surface-mounted-services.ts",
  "prisma/seed-new-outlet-v2.ts",

  // Explicitly retired — never run: prisma/seed-pricing-inputs.ts would
  // reverse the August 2026 pricing reconciliation (crew-hours, progressive
  // markup, $250 minimum). Its own header says "RETIRED — DO NOT RUN."
];

/**
 * Some seed files exit non-zero to REPORT a finding worth a human decision
 * (e.g. a service that graduated off the QUOTE list with no recorded
 * crew-hours) rather than to signal a broken setup step — tolerated here
 * since none of them are part of this run's own scope. Exported alongside
 * SEED_STEPS/NEEDS_APPLY so a second entry point runs the identical chain.
 */
export const TOLERATE_NONZERO: Record<string, string> = {
  "prisma/seed-labor-hours.ts": "reports pre-existing findings (e.g. level-2-ev-charger's missing hours) unrelated to this run's scope",
};

/**
 * The whole "Phase F" material-role/cost effort defaults to report-only
 * (dry run) and requires an explicit --apply to write anything — confirmed
 * by grepping every file below for its own `argv.includes("--apply")`
 * check. Every other seed file in SEED_STEPS writes unconditionally.
 */
export const NEEDS_APPLY = new Set([
  "prisma/seed-phase-f-material-roles.ts",
  "prisma/seed-phase-f-role-redesign.ts",
  "prisma/seed-phase-f-material-costs.ts",
  "prisma/seed-phase-f-costs-round2.ts",
  "prisma/seed-video-doorbell-wiring.ts",
  "prisma/seed-generator-inlet.ts",
  "prisma/seed-hot-tub-spa.ts",
  "prisma/seed-panel-replacement.ts",
  "prisma/seed-200a-service-upgrade.ts",
  "prisma/seed-240v-garage-outlet.ts",
  "prisma/seed-under-cabinet-lighting.ts",
  "scripts/add-equipment-roles.ts",
  "scripts/build-fan-packages.ts",
]);

/**
 * Every step AFTER the seed chain, in order — the panel-recipe correction,
 * the two Batch fixes, and full-catalog extraction into a fresh
 * TemplateVersion. Exported as data (not re-invoked from main() below) so
 * scripts/init-preview-database.ts can run the SAME sequence, in the SAME
 * order, against a different target, without retyping it and risking drift.
 */
export type PostSeedStep =
  | { kind: "run"; file: string; args?: string[]; label: string }
  | { kind: "batch2fSurgeFix"; label: string };

export const POST_SEED_STEPS: PostSeedStep[] = [
  { kind: "batch2fSurgeFix", label: "Batch 2F (v6) surge-protection fix" },
  { kind: "run", file: "scripts/add-consumables-recipes.ts", args: ["--apply"], label: "Batch 2E (v5): add-consumables-recipes.ts --apply" },
  // These are catalog entry aliases, not independent quote-only jobs. Apply
  // them before extraction so every fresh contractor installation receives
  // the reroute into the canonical priced dedicated-circuit package.
  { kind: "run", file: "scripts/apply-dedicated-circuit-entry-aliases.ts", args: ["--contractor", "elite-electric"], label: "Dedicated-circuit entry aliases: sump pump and refrigerator/freezer" },
  { kind: "run", file: "prisma/repair-trees.ts", label: "repair-trees.ts (sanity check before extraction)" },
  { kind: "run", file: "scripts/extract-template-catalog.ts", args: ["--from", "elite-electric", "--apply"], label: "Full-catalog extraction: v1 SNAPSHOT" },
  { kind: "run", file: "scripts/finalize-panel-replacement-recipe.ts", args: ["--apply"], label: "electrical-panel-replacement: intended final recipe (narrow correction)" },
  { kind: "run", file: "prisma/seed-routing-v2-policies.ts", label: "Routing V2 template patches (mutate the just-created v1 SNAPSHOT in place) — policies" },
  { kind: "run", file: "prisma/seed-routing-v2-pricing-method.ts", label: "Routing V2 template patches (mutate the just-created v1 SNAPSHOT in place) — pricing method" },
];

export async function bootstrapContractor(databaseUrl: string = DB_URL): Promise<void> {
  const p = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await p.contractor.upsert({
    where: { slug: "elite-electric" },
    update: {},
    create: { slug: "elite-electric", name: "Elite Electric & Lighting", trade: "residential electrician", phone: "732-204-7003" },
  });
  await p.$disconnect();
}

/**
 * Fills one real, pre-existing gap this run discovered: prisma/seed-240v-
 * garage-outlet.ts references canonical role COVER_RAISED_4S (a standard
 * raised cover plate for a 4-inch-square surface box). The canonical Phase F
 * role seed now defines it; this helper remains for older snapshots and for
 * the explicit Elite test cost required by the existing garage seeder.
 *
 * seed-240v-garage-outlet.ts hard-fails (not a graceful "held") on an
 * uncosted role it consumes, so leaving the cost genuinely unresolved
 * blocks the whole service rather than surfacing as a reportable gap —
 * unlike Phase F's own HELD items (RECEPTACLE_240V_30A etc.), which that
 * process's OWN scripts tolerate. A cost is entered here, labeled ASSUMED —
 * the SAME provenance category prisma/seed-phase-f-material-costs.ts
 * already uses for INTERLOCK_KIT/PANEL_MAIN_BREAKER/PANEL_200A_MAIN_BREAKER
 * (no supplier quote, a reasonable placeholder of the right order of
 * magnitude), not a new pattern and not hidden: $3.50, matching
 * BOX_SURFACE_4S's own $2.67 for the box it covers.
 */
export async function addMissingCoverRaised4sRole(databaseUrl: string = DB_URL): Promise<void> {
  const p = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const elite = await p.contractor.findUniqueOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
    let role = await p.canonicalMaterial.findUnique({ where: { key: "COVER_RAISED_4S" } });
    if (!role) {
      role = await p.canonicalMaterial.create({
        data: { key: "COVER_RAISED_4S", name: "4-inch square raised device cover", unit: "each" },
      });
      console.log("  COVER_RAISED_4S canonical role added (no seed file anywhere defines it)");
    } else {
      console.log("  COVER_RAISED_4S already exists — role left untouched");
    }
    const existingCost = await p.contractorMaterial.findFirst({ where: { contractorId: elite.id, canonicalMaterialId: role.id } });
    if (!existingCost) {
      await p.contractorMaterial.create({
        data: { contractorId: elite.id, canonicalMaterialId: role.id, unitCostCents: 350, costConfidence: "ASSUMED" },
      });
      console.log("  COVER_RAISED_4S priced at $3.50/each — ASSUMED (no reference price exists anywhere in this repo)");
    }
  } finally {
    await p.$disconnect();
  }
}

/**
 * Batch 2F (v6)'s surge-protection half, verbatim from commit 7cad9f4's own
 * production-publication message — see this file's header docstring for the
 * full citation: production's real Elite row already used
 * BREAKER_DOUBLE_POLE_20A; only the template (and this branch's checked-in
 * prisma/seed-materials.ts) still names the generic BREAKER_DOUBLE_POLE.
 * Applied directly because no seed file performs this swap. The fan half of
 * Batch 2F is handled by the real mechanism instead — scripts/add-equipment-
 * roles.ts + scripts/build-fan-packages.ts, run earlier in SEED_STEPS — not
 * a bare ServiceMaterial insert.
 */
export async function applyBatch2fSurgeFix(databaseUrl: string = DB_URL): Promise<void> {
  const p = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const surge = await p.service.findFirstOrThrow({ where: { slug: "whole-house-surge-protection" } });
    const generic = await p.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_DOUBLE_POLE" } });
    const specific = await p.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_DOUBLE_POLE_20A" } });
    const updated = await p.serviceMaterial.updateMany({
      where: { serviceId: surge.id, canonicalMaterialId: generic.id },
      data: { canonicalMaterialId: specific.id },
    });
    console.log(`  whole-house-surge-protection: ${updated.count} ServiceMaterial row(s) swapped BREAKER_DOUBLE_POLE -> BREAKER_DOUBLE_POLE_20A`);
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  const teardownTarget = process.argv[2] === "--teardown" ? process.argv[3] : null;
  if (teardownTarget) return teardown(teardownTarget);

  console.log(`Fresh Electrical launch rehearsal — run ${RUN_ID}\n`);
  createScratchDatabase(DB_NAME);
  console.log(`Scratch database created on ${SCRATCH_HOST}:${SCRATCH_PORT}: ${DB_NAME}`);

  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: DB_URL } });
    execFileSync("npx", [
      "tsx", "scripts/verify-database-identity.ts", "--stamp",
      "--expect", `local-freshlaunch-${RUN_ID}`, "--project", "local-disposable-not-neon",
      "--note", "fresh Electrical launch rehearsal, disposable, dropped at end of run",
    ], { stdio: "inherit", env: { ...process.env, DATABASE_URL: DB_URL } });

    // Same guard every other rehearsal script in this repo uses before
    // mutating a database outside the seed/migrate chain — belt-and-braces
    // alongside the loopback host literal above, so this script fails the
    // same way the others do if it is ever pointed somewhere else by mistake.
    const identityCheck = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    try {
      await assertDisposableLocalDatabase(identityCheck);
    } finally {
      await identityCheck.$disconnect();
    }

    await bootstrapContractor();
    await addMissingCoverRaised4sRole();

    for (const step of SEED_STEPS) {
      if (step === "__CONDITIONAL_DISCLAIMERS__") {
        // No longer tolerated as a known failure — see the bootstrap this
        // file's own docstring and the SEED_STEPS comment above describe.
        run("prisma/seed-conditional-disclaimers.ts");
        continue;
      }
      const args = NEEDS_APPLY.has(step) ? ["--apply"] : [];
      run(step, args, TOLERATE_NONZERO[step] ? { allowFailure: TOLERATE_NONZERO[step] } : {});
    }

    for (const step of POST_SEED_STEPS) {
      console.log(`\n--- ${step.label} ---`);
      if (step.kind === "batch2fSurgeFix") await applyBatch2fSurgeFix();
      else run(step.file, step.args ?? []);
    }

    console.log(`\nDone. Scratch database ${DB_NAME} (${SCRATCH_HOST}:${SCRATCH_PORT}) left running for Phase 2.`);
    console.log(`Run Phase 2 against it: DATABASE_URL is exported for this process only, so export it yourself:`);
    console.log(`  export DATABASE_URL="postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${DB_NAME}?schema=public"`);
    console.log(`  npx tsx scripts/rehearse-fresh-electrical-launch-phase2.ts`);
    console.log(`When finished, end this run's ownership of it:`);
    console.log(`  npx tsx scripts/rehearse-fresh-electrical-launch.ts --teardown ${DB_NAME}`);
  } catch (e) {
    console.error("\nFAILED — dropping scratch database before exiting.\n");
    dropScratchDatabase(DB_NAME);
    throw e;
  }
}

// Entrypoint guard — scripts/init-preview-database.ts imports this module's
// SEED_STEPS/NEEDS_APPLY/POST_SEED_STEPS/run/bootstrapContractor/
// addMissingCoverRaised4sRole/applyBatch2fSurgeFix for its own, different
// target. Without this, importing them for their exports also ran this
// file's own main() as a side effect — creating and half-seeding an
// UNWANTED scratch database the importer never asked for and had no
// reference to, discovered exactly that way while rehearsing that script.
// Same pattern scripts/add-equipment-roles.ts, scripts/add-consumables-
// recipes.ts and scripts/build-fan-packages.ts already use for the same
// reason — they are RUN() as sub-steps of this very file's own main().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
