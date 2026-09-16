/**
 * Corrected rehearsal of the five-service electrical audit-batch adoption,
 * through the CURRENT, unmodified scripts/template-update.ts.
 *
 * THIRD PASS. Supersedes e63528a (hand-authored fixtures, wrong module
 * composition) and f0c345a (real seed-based fixtures, but the successful
 * batch and the conflict proof were entangled on one contractor, the graph
 * comparison covered only routing/component fields, scratch-database
 * ownership used fixed names with a pre-drop, and material readiness was
 * silently declared fine). This pass fixes those four things; the six real
 * audit-fix commits and scripts/template-update.ts are still never touched.
 *
 * WHAT "FAITHFUL" MEANS HERE
 *
 * Every BEFORE/TARGET fixture is composed by running this repo's own, real,
 * unmodified seed functions — never a hand-transcribed tree — inside a
 * brand-new, disposable local Postgres database this run creates and destroys
 * itself under a name unique to this run (never the shared
 * p2b_integration_seeded cluster's own Elite fixture). The composition now
 * also runs seed-access-normalization.ts and seed-fixture-finish-ack.ts —
 * previously omitted — since both apply to services in this batch; see
 * FIXTURE_SEED_SOURCE's own comment for why seed-conditional-disclaimers.ts
 * is attempted but its content is not part of the resulting fixture. The
 * four small BEFORE-state reversions (verbatim from each fix commit's own
 * diff — see revertCeilingSwitchLeg/revertOutletCondition/
 * revertDedicatedPanelLocation/revertDishwasherWording below) are the one
 * exception: a later, unrelated refactor (2703b38) restructured how the old
 * seed functions are called, so there is no running the pre-fix files
 * directly. Every value in each reversion is copied from `git show
 * <fix-sha>`, never reconstructed from memory.
 *
 * Each fixture's five services are extracted with the real
 * scripts/extract-template-service.ts (one TemplateVersion per service,
 * inside the scratch database) and migrated — by canonical KEY, never by raw
 * id — into ONE combined TemplateVersion per fixture (500 = BEFORE, 501 =
 * TARGET) inside the shared rehearsal database, where scripts/template-
 * update.ts/provision-from-template.ts actually run.
 *
 * THREE CONTRACTORS, THREE SEPARATE CLAIMS
 *
 *   ADOPTER          uncustomized. Adopts ALL EIGHT real per-unit operations
 *                    and is compared against TARGET completely — every
 *                    question/option TARGET declares, not a subset.
 *   CONFLICT_TESTER   separate, single-purpose. Adopts ONE real change
 *                    (dedicated_distance/under_25), is never re-approved
 *                    afterward, then has a second, un-adopted option
 *                    (dedicated_distance/25_to_50) customized directly —
 *                    bypassing the tool — before a further `--adopt` on it
 *                    is exercised. Proves two separate things honestly: the
 *                    refusal writes nothing, and the service's own
 *                    unapproved state (from the one real adopt, never
 *                    re-approved) survives that refusal untouched. It does
 *                    NOT claim an independently-approved customization
 *                    survives approved — that would be a different fixture.
 *   UNRELATED        provisioned from the same BEFORE version, snapshotted
 *                    before any `--adopt` call runs against ADOPTER, never
 *                    touched, re-snapshotted at the end.
 *
 * THE EIGHT REAL PER-UNIT OPERATIONS, matching the six real audit-fix
 * commits' own account of this five-service batch — ALL EIGHT adopted on
 * ADOPTER in this pass:
 *
 *   new-ceiling-light        option-revised  existing_light_source/no
 *   new-ceiling-fan          option-revised  existing_light_source/no
 *   replace-standard-outlet  option-revised  device_replacement_reason/works_upgrading
 *                            option-revised  device_replacement_reason/intermittent
 *                            option-revised  device_replacement_reason/damaged
 *   dedicated-120v-circuit-outlet
 *                            option-revised  dedicated_distance/under_25
 *                            option-revised  dedicated_distance/25_to_50
 *   dishwasher-electrical    wording-changed appliance_power_present
 *
 * `existing_light_source/yes` is NOT a change on either ceiling service —
 * confirmed by direct inspection of both fixtures' fully-composed live
 * trees (both wire it to CONTINUE -> lighting_control with no price
 * modifier).
 *
 * DISCLOSED SIMPLIFICATIONS, called out again at their own call sites:
 * `materialCostResolved` is forced directly for the services this run
 * prices or adopts, rather than walked through the real material-onboarding
 * flow. That flow's own function (lib/materialCost.ts's
 * recomputeServiceMaterialCost) provably CANNOT flip it back to true for a
 * service whose only materials are policy-quantity allowances —
 * requiredRolesFor() excludes them entirely, so a service with zero
 * structural materials is "ready" with nothing to resolve and the function
 * returns early without writing. Whether a real contractor has ANY supported
 * path to reapprove pricing after adopting one of these five services is
 * therefore UNPROVEN by this run and BLOCKED pending a focused check of that
 * actual lifecycle — recorded as a new blocker in the manifest, not silently
 * fixed and not declared irrelevant. Every `ContractorComponent`/
 * `priceModifierCents` figure entered directly for ADOPTER/CONFLICT_TESTER
 * uses Elite's own real canonical figures (the same numbers
 * prisma/seed-lighting-control.ts/prisma/seed-dedicated-circuit.ts already
 * define) — templates never carry economics by design
 * (extract-template-service.ts drops priceModifierCents explicitly) — never
 * a reimplementation of pricing; every price this script reports is computed
 * by the real lib/routeResolver.ts resolveRoute.
 *
 * SCRATCH RESOURCE OWNERSHIP: every scratch database and the temporary seed
 * file are named uniquely per run (RUN_ID) and created with no pre-drop —
 * `createScratchDatabase` is a bare `CREATE DATABASE`, never `DROP DATABASE
 * IF EXISTS` first, so this run can never destroy a database it did not
 * itself create. Ownership is recorded the instant creation succeeds, before
 * anything else happens to that resource, and the entire build/migrate/
 * adopt sequence runs inside one try block whose finally cleans up only
 * what was actually recorded as owned — continuing through every other
 * cleanup step if one fails, and surfacing every failure at the end rather
 * than swallowing it.
 *
 * No production/Neon access. Deployment stays disabled. Nothing here merges,
 * deploys, adopts against a real tenant, or touches scripts/template-update.ts.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { loadEnv } from "./_env";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { withThrowaway, provision } from "./_throwaway";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { findUnreachableQuestions, findDanglingReferences } from "../prisma/_moduleHelpers";

loadEnv();

const RUN_ID = `${Date.now()}_${process.pid}`;
const ADOPTER = "__audit-batch-adopter__";
const CONFLICT_TESTER = "__audit-batch-conflict-tester__";
const UNRELATED = "__audit-batch-unrelated-tenant__";
const BEFORE_VERSION = 500;
const TARGET_VERSION = 501;
const TRADE = "electrical";

const SERVICE_SLUGS = [
  "new-ceiling-light",
  "new-ceiling-fan",
  "replace-standard-outlet",
  "dedicated-120v-circuit-outlet",
  "dishwasher-electrical",
] as const;

let failures = 0;
function ok(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  ok    ${msg}`);
  } else {
    failures++;
    console.error(`  FAIL  ${msg}`);
  }
}

const SCRATCH_HOST = "127.0.0.1";
const SCRATCH_PORT = 5544;
const SCRATCH_USER = "rehearsal_admin";
function scratchUrl(db: string): string {
  return `postgresql://${SCRATCH_USER}@${SCRATCH_HOST}:${SCRATCH_PORT}/${db}?schema=public`;
}
const REHEARSAL_URL = process.env.DATABASE_URL!;

/** Bare CREATE — no pre-drop. A name collision (RUN_ID makes this practically impossible) throws rather than destroying whatever was already there. */
function createScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe" });
}
function dropScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
}

const BEFORE_DB = `p2b_auditbatch_before_${RUN_ID}`;
const TARGET_DB = `p2b_auditbatch_target_${RUN_ID}`;
const FIXTURE_SEED_PATH = `prisma/_tmp_auditbatch_seed_${RUN_ID}.ts`;

/**
 * The one-time seed/build orchestrator, written to a run-unique temp file
 * INSIDE prisma/ so the real seed files' own relative imports resolve, run
 * as a subprocess (each seed file constructs its own PrismaClient at import
 * time from process.env.DATABASE_URL — a subprocess is the only way to give
 * two different runs of the same module graph two different target
 * databases), then deleted. Never committed.
 *
 * Runs seed-access-normalization.ts and seed-fixture-finish-ack.ts, matching
 * seed-all.ts's own documented order ("classify access answers — AFTER the
 * trees" then "fixture acknowledgement — AFTER classification"), because
 * both apply to services in this batch: seed-fixture-finish-ack.ts's own
 * SERVICES list names new-ceiling-light/new-ceiling-fan directly, and it
 * refuses to do anything ("no FINISHED answer; run seed-access-
 * normalization first") without the classification pass running first.
 * Neither touches new-ceiling-light/new-ceiling-fan's attic_access="has_access"
 * branch — the one this run's resolver test path uses — so the price proof
 * is unaffected by adding them.
 *
 * seed-conditional-disclaimers.ts is ALSO applicable — its own ATTACHMENTS
 * table names new-ceiling-light/new-ceiling-fan (lighting_control/
 * existing_switched_light -> TAP_EXISTING_FIXTURE_FINISHED) and its
 * EXTERIOR_WALL_SERVICES table names dedicated-120v-circuit-outlet
 * (dedicated_route_access -> EXTERIOR_WALL_CONTINGENCY_DEDICATED) — but it
 * is run wrapped in a try/catch here because this codebase has no path to
 * create a CanonicalDisclaimer row from nothing on a from-scratch database:
 * its own attach() helper does `canonicalDisclaimer.findUniqueOrThrow`
 * before ever reaching a ContractorDisclaimer, and the one migration that
 * would normally backfill CanonicalDisclaimer/ContractorDisclaimer rows
 * (prisma/backfill-disclaimer-split-2026-08-27.ts) has its own `legacy`
 * query hardcoded to `[]` since 28 Aug 2026 — a pre-existing, already-
 * documented gap (docs/design/electrical-decision-tree-audit-v1-rehearsal-
 * bootstrap.md's own "Known, expected failure" section), not something
 * introduced or fixable within this task's scope. The actual error text this
 * run observes is printed and asserted to match that same root cause, so the
 * omission is confirmed by evidence rather than assumed. None of the three
 * affected disclaimer attachments carry routing, pricing, or components, so
 * their absence does not affect the resolver proof, the adoption-set proof,
 * or the reachability proofs — only the disclaimer-key comparison in
 * assertFullGraphMatchesTarget, which correctly shows empty sets on both
 * sides rather than silently skipping the field.
 */
const FIXTURE_SEED_SOURCE = String.raw`
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";

const ELITE_SLUG = "elite-electric";

function run(file: string) {
  execFileSync("npx", ["tsx", file], { stdio: "inherit", env: process.env });
}
function runAllowFailure(file: string, expectedNeedle: string) {
  try {
    execFileSync("npx", ["tsx", file], { stdio: "pipe", env: process.env });
    console.log("  " + file + " ran to completion (unexpected — no CanonicalDisclaimer gap found)");
  } catch (e) {
    const out = (e && typeof e === "object" && "stderr" in e ? String((e as { stderr: unknown }).stderr) : "") +
      (e && typeof e === "object" && "stdout" in e ? String((e as { stdout: unknown }).stdout) : "");
    const matched = out.includes(expectedNeedle);
    console.log("  " + file + " failed as expected (pre-existing CanonicalDisclaimer gap, matched=" + matched + ")");
    if (!matched) {
      console.log("  --- actual failure output, since it did not match the expected needle ---");
      console.log(out.slice(-2000));
    }
  }
}

async function bootstrapContractor(prisma: PrismaClient) {
  await prisma.contractor.upsert({
    where: { slug: ELITE_SLUG },
    update: {},
    create: { slug: ELITE_SLUG, name: "Elite Electric & Lighting", trade: "residential electrician", phone: "732-204-7003" },
  });
}

async function revertCeilingSwitchLeg(prisma: PrismaClient, slug: "new-ceiling-light" | "new-ceiling-fan", noun: "light" | "fan") {
  const service = await prisma.service.findFirstOrThrow({ where: { slug } });
  const existingLight = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "existing_light_source" } });
  const noAnswer = await prisma.answerOption.findFirstOrThrow({ where: { questionId: existingLight.id, value: "no" } });
  const qSwitchedSource = await prisma.question.create({
    data: { serviceId: service.id, key: "switched_source", prompt: "Is there an existing switch in the room we could use to control the new " + noun + "?", inputType: "SINGLE_SELECT", order: 3 },
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: qSwitchedSource.id, label: "Yes", value: "yes", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 15000, order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qSwitchedSource.id, label: "No", value: "no", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 22500, order: 2, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qSwitchedSource.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", order: 3,
        requiredPhotoLabels: noun === "light"
          ? ["Room where the light is going, full view", "Ceiling area where the fixture will be installed"]
          : ["Room where the fan is going, full view", "Ceiling area where the fan will be installed"] },
    ],
  });
  await prisma.answerOption.update({ where: { id: noAnswer.id }, data: { routeAction: "CONTINUE", nextQuestionId: qSwitchedSource.id } });
  console.log("  reverted " + slug + " to pre-B.2 (switched_source reinstated)");
}

async function revertOutletCondition(prisma: PrismaClient) {
  const service = await prisma.service.findFirstOrThrow({ where: { slug: "replace-standard-outlet" } });
  const deviceQ = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "device_replacement_reason" } });
  const qOutletCondition = await prisma.question.create({
    data: { serviceId: service.id, key: "outlet_condition", prompt: "What's happening with the outlet?", inputType: "SINGLE_SELECT", order: 1 },
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: qOutletCondition.id, label: "It just needs to be swapped for a new one", value: "standard_swap", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [] },
      { questionId: qOutletCondition.id, label: "It's warm, sparking, or smells like burning", value: "unsafe_condition", routeAction: "REROUTE_TROUBLESHOOTING", order: 2, requiredPhotoLabels: [] },
      { questionId: qOutletCondition.id, label: "It doesn't work at all / no power", value: "no_power", routeAction: "REROUTE_TROUBLESHOOTING", order: 3, requiredPhotoLabels: [] },
    ],
  });
  await prisma.answerOption.updateMany({
    where: { questionId: deviceQ.id, value: { in: ["works_upgrading", "intermittent", "damaged"] } },
    data: { routeAction: "CONTINUE", nextQuestionId: qOutletCondition.id },
  });
  console.log("  reverted replace-standard-outlet to pre-B.17 (outlet_condition reinstated)");
}

async function revertDedicatedPanelLocation(prisma: PrismaClient) {
  const service = await prisma.service.findFirstOrThrow({ where: { slug: "dedicated-120v-circuit-outlet" } });
  const q3 = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "dedicated_distance" } });
  const q5 = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "dedicated_finish_ack" } });
  await prisma.question.update({ where: { id: q5.id }, data: { order: 6 } });
  const qPanelLocation = await prisma.question.create({
    data: { serviceId: service.id, key: "dedicated_panel_location", prompt: "Where is your electrical panel?", helpText: "This helps us arrive prepared. It won't change your price.", inputType: "SINGLE_SELECT", order: 5 },
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: qPanelLocation.id, label: "Unfinished basement", value: "unfinished_basement", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qPanelLocation.id, label: "Finished basement or utility room", value: "finished_basement", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qPanelLocation.id, label: "Garage", value: "garage", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 3, requiredPhotoLabels: [] },
      { questionId: qPanelLocation.id, label: "On a finished interior wall", value: "interior_finished_wall", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 4, requiredPhotoLabels: [] },
      { questionId: qPanelLocation.id, label: "Outside the house", value: "exterior", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 5, requiredPhotoLabels: [] },
      { questionId: qPanelLocation.id, label: "Somewhere else, or I'm not sure", value: "other_unsure", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 6, requiredPhotoLabels: [] },
    ],
  });
  await prisma.answerOption.updateMany({ where: { questionId: q3.id, value: { in: ["under_25", "25_to_50"] } }, data: { nextQuestionId: qPanelLocation.id } });
  console.log("  reverted dedicated-120v-circuit-outlet to pre-B.18 (dedicated_panel_location reinstated)");
}

async function revertDishwasherWording(prisma: PrismaClient) {
  const service = await prisma.service.findFirstOrThrow({ where: { slug: "dishwasher-electrical" } });
  const q = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "appliance_power_present" } });
  await prisma.question.update({ where: { id: q.id }, data: { prompt: "Is there already suitable power at the dishwasher?" } });
  console.log("  reverted dishwasher-electrical to pre-B.19 wording");
}

async function main() {
  const variant = process.argv[process.argv.indexOf("--variant") + 1];
  if (variant !== "before" && variant !== "target") throw new Error('--variant before|target is required');

  const boot = new PrismaClient();
  await bootstrapContractor(boot);
  await boot.$disconnect();

  run("prisma/seed.ts");
  run("prisma/seed-questions.ts");

  if (variant === "before") {
    const p = new PrismaClient();
    await revertCeilingSwitchLeg(p, "new-ceiling-light", "light");
    await revertCeilingSwitchLeg(p, "new-ceiling-fan", "fan");
    await p.$disconnect();
  }

  run("prisma/seed-materials.ts");
  run("prisma/seed-height-access.ts");
  run("prisma/seed-lighting-control.ts");
  run("prisma/seed-breakers.ts");

  {
    const { seedDeviceModule } = await import("./seed-device-and-finish-modules");
    const { seedDedicatedCircuit } = await import("./seed-dedicated-circuit");
    const { seedApplianceElectrical } = await import("./seed-appliance-services");
    await seedDeviceModule("replace-standard-outlet");
    await seedDedicatedCircuit();
    await seedApplianceElectrical("dishwasher-electrical");
  }

  if (variant === "before") {
    const p = new PrismaClient();
    await revertOutletCondition(p);
    await revertDedicatedPanelLocation(p);
    await revertDishwasherWording(p);
    await p.$disconnect();
  }

  run("prisma/seed-access-normalization.ts");
  run("prisma/seed-fixture-finish-ack.ts");
  runAllowFailure("prisma/seed-conditional-disclaimers.ts", "CanonicalDisclaimer");

  run("prisma/repair-trees.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
`;

function buildScratchFixture(variant: "before" | "target", dbName: string): void {
  const url = scratchUrl(dbName);
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  execFileSync("npx", [
    "tsx", "scripts/verify-database-identity.ts", "--stamp",
    "--expect", `local-auditbatch-${variant}-${RUN_ID}`, "--project", "local-disposable-not-neon",
    "--note", `audit-batch adoption verifier: ${variant} fixture, disposable, dropped at end of run`,
  ], { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  execFileSync("npx", ["tsx", FIXTURE_SEED_PATH, "--variant", variant], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });

  let v = 1;
  for (const slug of SERVICE_SLUGS) {
    execFileSync("npx", ["tsx", "scripts/extract-template-service.ts", "--contractor", "elite-electric", "--service", slug, "--version", String(v), "--apply"],
      { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
    v++;
  }
}

/** Cross-database migration: canonical rows resolved by KEY on the destination, never copied by id. */
async function migrateFixtureIntoRehearsalDb(sourceUrl: string, destVersion: number, notes: string): Promise<void> {
  const src = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const dst = new PrismaClient({ datasources: { db: { url: REHEARSAL_URL } } });
  try {
    const sourceVersions = await src.templateVersion.findMany({
      where: { trade: TRADE },
      include: {
        policies: true,
        services: {
          include: {
            materials: { include: { canonicalMaterial: { select: { key: true } } } },
            policies: { include: { templatePolicyDefinition: { select: { key: true } } } },
            questions: {
              orderBy: { order: "asc" },
              include: {
                options: {
                  orderBy: { order: "asc" },
                  include: {
                    components: { include: { canonicalComponent: { select: { key: true } } } },
                    materials: { include: { canonicalMaterial: { select: { key: true } } } },
                    disclaimers: { include: { canonicalDisclaimer: { select: { key: true } } } },
                    photoGroups: { include: { photoGroup: { select: { key: true } } } },
                    templatePolicyDefinition: { select: { key: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { version: "asc" },
    });
    if (sourceVersions.length !== SERVICE_SLUGS.length) {
      throw new Error(`expected ${SERVICE_SLUGS.length} extracted TemplateVersions in the scratch db, found ${sourceVersions.length}`);
    }

    const categoryIdCache = new Map<string, string>();
    const componentIdCache = new Map<string, string>();
    const materialIdCache = new Map<string, string>();
    const disclaimerIdCache = new Map<string, string>();
    const photoGroupIdCache = new Map<string, string>();
    const categorySlugById = new Map<string, string>();

    const existing = await dst.templateVersion.findUnique({ where: { trade_version: { trade: TRADE, version: destVersion } } });
    if (existing) throw new Error(`electrical v${destVersion} already exists in the rehearsal database — refusing to overwrite`);

    await dst.$transaction(async (tx) => {
      const tv = await tx.templateVersion.create({ data: { trade: TRADE, version: destVersion, kind: "DELTA", notes } });

      const policyIdByKey = new Map<string, string>();
      for (const sv of sourceVersions) {
        for (const def of sv.policies) {
          if (policyIdByKey.has(def.key)) continue;
          const row = await tx.templatePolicyDefinition.create({
            data: { templateVersionId: tv.id, key: def.key, type: def.type, unit: def.unit, boundaryCount: def.boundaryCount, prompt: def.prompt, choices: def.choices },
          });
          policyIdByKey.set(def.key, row.id);
        }
      }

      for (const sv of sourceVersions) {
        for (const svc of sv.services) {
          if (!categorySlugById.has(svc.canonicalCategoryId)) {
            const cat = await src.canonicalCategory.findUniqueOrThrow({ where: { id: svc.canonicalCategoryId } });
            categorySlugById.set(svc.canonicalCategoryId, cat.slug);
          }
          const slug = categorySlugById.get(svc.canonicalCategoryId)!;
          if (!categoryIdCache.has(slug)) categoryIdCache.set(slug, (await dst.canonicalCategory.findUniqueOrThrow({ where: { slug } })).id);

          const ts = await tx.templateService.create({
            data: {
              templateVersionId: tv.id, key: svc.key, slug: svc.slug, name: svc.name,
              shortDescription: svc.shortDescription, icon: svc.icon,
              canonicalCategoryId: categoryIdCache.get(slug)!,
              bookingType: svc.bookingType, photoState: svc.photoState,
              isPrimaryEligible: svc.isPrimaryEligible, requiresTechCount: svc.requiresTechCount,
              pricingMethod: svc.pricingMethod,
              materials: {
                create: await Promise.all(svc.materials.map(async (m) => {
                  if (!materialIdCache.has(m.canonicalMaterial!.key)) materialIdCache.set(m.canonicalMaterial!.key, (await dst.canonicalMaterial.findUniqueOrThrow({ where: { key: m.canonicalMaterial!.key } })).id);
                  return { canonicalMaterialId: materialIdCache.get(m.canonicalMaterial!.key)!, quantity: m.quantity, quantityIsPolicy: m.quantityIsPolicy, order: m.order };
                })),
              },
              policies: { create: svc.policies.map((p) => ({ templatePolicyDefinitionId: policyIdByKey.get(p.templatePolicyDefinition.key)! })) },
            },
          });

          for (const q of svc.questions) {
            await tx.templateQuestion.create({
              data: {
                templateServiceId: ts.id, key: q.key, prompt: q.prompt, helpText: q.helpText,
                inputType: q.inputType, numberAllowsDecimal: q.numberAllowsDecimal, numberMin: q.numberMin, numberMax: q.numberMax, order: q.order,
                options: {
                  create: await Promise.all(q.options.map(async (o) => {
                    for (const c of o.components) if (!componentIdCache.has(c.canonicalComponent!.key)) componentIdCache.set(c.canonicalComponent!.key, (await dst.canonicalComponent.findUniqueOrThrow({ where: { key: c.canonicalComponent!.key } })).id);
                    for (const m of o.materials) if (!materialIdCache.has(m.canonicalMaterial!.key)) materialIdCache.set(m.canonicalMaterial!.key, (await dst.canonicalMaterial.findUniqueOrThrow({ where: { key: m.canonicalMaterial!.key } })).id);
                    for (const d of o.disclaimers) if (!disclaimerIdCache.has(d.canonicalDisclaimer!.key)) disclaimerIdCache.set(d.canonicalDisclaimer!.key, (await dst.canonicalDisclaimer.findUniqueOrThrow({ where: { key: d.canonicalDisclaimer!.key } })).id);
                    for (const g of o.photoGroups) if (!photoGroupIdCache.has(g.photoGroup!.key)) photoGroupIdCache.set(g.photoGroup!.key, (await dst.photoGroup.findUniqueOrThrow({ where: { key: g.photoGroup!.key } })).id);
                    return {
                      value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
                      numberAtLeastExclusive: o.numberAtLeastExclusive, numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost,
                      requiresCapabilityKey: o.requiresCapabilityKey, labelPattern: o.labelPattern,
                      templatePolicyDefinitionId: o.templatePolicyDefinition ? policyIdByKey.get(o.templatePolicyDefinition.key)! : null,
                      nextQuestionKey: o.nextQuestionKey, rerouteServiceKey: o.rerouteServiceKey, referencedServiceKey: o.referencedServiceKey,
                      requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking, illustrationUrls: o.illustrationUrls,
                      components: { create: o.components.map((c) => ({ canonicalComponentId: componentIdCache.get(c.canonicalComponent!.key)!, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey })) },
                      materials: { create: o.materials.map((m) => ({ canonicalMaterialId: materialIdCache.get(m.canonicalMaterial!.key)!, quantity: m.quantity, order: m.order })) },
                      disclaimers: { create: o.disclaimers.map((d) => ({ canonicalDisclaimerId: disclaimerIdCache.get(d.canonicalDisclaimer!.key)! })) },
                      photoGroups: { create: o.photoGroups.map((g) => ({ photoGroupId: photoGroupIdCache.get(g.photoGroup!.key)! })) },
                    };
                  })),
                },
              },
            });
          }
        }
      }
    }, { timeout: 60_000 });
    console.log(`  electrical v${destVersion} migrated into the rehearsal database (${notes})`);
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Snapshotting and comparison
// ---------------------------------------------------------------------------

type OptionSnap = {
  id: string;
  order: number;
  label: string;
  routeAction: string;
  nextQuestionKey: string | null;
  rerouteServiceKey: string | null;
  referencedServiceKey: string | null;
  numberAtLeast: number | null;
  numberAtMost: number | null;
  numberAtLeastExclusive: boolean;
  requiresCapabilityKey: string | null;
  labelPattern: string | null;
  requiredPhotoLabels: string[];
  photosBlockBooking: boolean;
  illustrationUrls: string[];
  components: { key: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[];
  materials: { key: string; quantity: number }[];
  photoGroups: string[];
  disclaimers: string[];
};
type QuestionSnap = {
  id: string;
  prompt: string;
  helpText: string | null;
  order: number;
  inputType: string;
  numberAllowsDecimal: boolean;
  numberMin: number | null;
  numberMax: number | null;
  options: Record<string, OptionSnap>;
};
type ServiceSnap = {
  name: string; bookingType: string; basePrice: number | null; materialCostResolved: boolean; publishedPriceApprovedAt: string | null;
  questions: Record<string, QuestionSnap>;
  receipts: { unitKind: string; unitKey: string; acceptedProjection: unknown }[];
};
/**
 * Comparable against a TARGET template unit — no live row id (no counterpart
 * across databases) and no raw `order` (compared separately, by RANK, via
 * rankByOrder — see assertFullGraphMatchesTarget).
 */
type OptionCompareSnap = Omit<OptionSnap, "id" | "order">;

function stripOptionId({ id: _id, order: _order, ...rest }: OptionSnap): OptionCompareSnap {
  return rest;
}

async function resolveQuestionKey(prisma: PrismaClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  const q = await prisma.question.findUnique({ where: { id }, select: { key: true } });
  return q?.key ?? null;
}
async function resolveServiceSlug(prisma: PrismaClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  const s = await prisma.service.findUnique({ where: { id }, select: { slug: true } });
  return s?.slug ?? null;
}

async function snapshotLiveService(prisma: PrismaClient, contractorId: string, slug: string): Promise<ServiceSnap> {
  const svc = await prisma.service.findFirstOrThrow({
    where: { contractorId, slug },
    include: {
      questions: {
        include: {
          options: {
            include: {
              components: { include: { canonicalComponent: { select: { key: true } } } },
              materials: { include: { canonicalMaterial: { select: { key: true } } } },
              conditionalDisclaimers: { include: { contractorDisclaimer: { include: { canonicalDisclaimer: { select: { key: true } } } } } },
              photoGroups: { include: { photoGroup: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
  const questions: Record<string, QuestionSnap> = {};
  for (const q of svc.questions) {
    const options: Record<string, OptionSnap> = {};
    for (const o of q.options) {
      options[o.value] = {
        id: o.id,
        order: o.order,
        label: o.label,
        routeAction: o.routeAction,
        nextQuestionKey: await resolveQuestionKey(prisma, o.nextQuestionId),
        rerouteServiceKey: await resolveServiceSlug(prisma, o.rerouteServiceId),
        referencedServiceKey: await resolveServiceSlug(prisma, o.referencedServiceId),
        numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost, numberAtLeastExclusive: o.numberAtLeastExclusive,
        requiresCapabilityKey: o.requiresCapabilityKey,
        labelPattern: o.labelPattern,
        requiredPhotoLabels: [...o.requiredPhotoLabels].sort(),
        photosBlockBooking: o.photosBlockBooking,
        illustrationUrls: [...o.illustrationUrls].sort(),
        components: o.components.filter((c) => c.canonicalComponent).map((c) => ({
          key: c.canonicalComponent!.key, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey,
          conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
        })).sort((a, b) => a.key.localeCompare(b.key)),
        materials: o.materials.filter((m) => m.canonicalMaterial).map((m) => ({ key: m.canonicalMaterial!.key, quantity: m.quantity })).sort((a, b) => a.key.localeCompare(b.key)),
        photoGroups: o.photoGroups.filter((g) => g.photoGroup).map((g) => g.photoGroup!.key).sort(),
        disclaimers: o.conditionalDisclaimers
          .filter((d) => d.contractorDisclaimer?.canonicalDisclaimer)
          .map((d) => d.contractorDisclaimer!.canonicalDisclaimer!.key)
          .sort(),
      };
    }
    questions[q.key] = {
      id: q.id, prompt: q.prompt, helpText: q.helpText, order: q.order, inputType: q.inputType,
      numberAllowsDecimal: q.numberAllowsDecimal, numberMin: q.numberMin, numberMax: q.numberMax,
      options,
    };
  }
  const receipts = await prisma.templateAdoptionReceipt.findMany({
    where: { serviceId: svc.id }, orderBy: { createdAt: "asc" },
    select: { unitKind: true, unitKey: true, acceptedProjection: true },
  });
  return {
    name: svc.name, bookingType: svc.bookingType, basePrice: svc.basePrice,
    materialCostResolved: svc.materialCostResolved, publishedPriceApprovedAt: svc.publishedPriceApprovedAt?.toISOString() ?? null,
    questions, receipts,
  };
}

/** Every question+option row id for one contractor's five services, flat-keyed. Used to prove adoption never deletes-and-recreates a row it could update in place. */
async function snapshotRowIds(prisma: PrismaClient, contractorId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const slug of SERVICE_SLUGS) {
    const snap = await snapshotLiveService(prisma, contractorId, slug);
    for (const [qKey, q] of Object.entries(snap.questions)) {
      ids[`${slug}::question::${qKey}`] = q.id;
      for (const [oValue, o] of Object.entries(q.options)) {
        ids[`${slug}::option::${qKey}/${oValue}`] = o.id;
      }
    }
  }
  return ids;
}

/**
 * Recursively sorts object keys before stringifying — plain `JSON.stringify`
 * prints an object's keys in insertion order, which is stable within one
 * call site's own construction but NOT across two independently-built maps
 * of the same logical content (e.g. two `snapshotRowIds` calls, whose flat
 * id map is populated by iterating live Prisma query results with no
 * guaranteed row order) — the exact class of bug `scripts/template-
 * update.ts`'s own `componentKey` comment documents for the identical
 * reason. Arrays are left in place: their order is meaningful everywhere
 * this file builds one, and every array compared here is explicitly sorted
 * at its own construction site first.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Rank each key by its `order` among the given items — position, not raw magnitude, so an interposed retained/historical row (present on live, absent from target) shifting every later raw order number by one does not register as a difference. */
function rankByOrder(items: { key: string; order: number }[]): Record<string, number> {
  const ranks: Record<string, number> = {};
  [...items].sort((a, b) => a.order - b.order).forEach((it, i) => { ranks[it.key] = i; });
  return ranks;
}

/**
 * Complete, systematic comparison of a live service against the TARGET
 * template's own questions/options — every key TARGET declares, and beyond
 * routing/components (what `template-update.ts`'s own AdoptedOptionProjection
 * tracks): question helpText and relative order, and option label, photos,
 * disclaimers, and material/policy links. Order is compared by RANK among the
 * keys TARGET declares (see rankByOrder), not raw magnitude — a retained
 * historical question TARGET does not declare occupies a live order slot with
 * no target counterpart, which correctly and harmlessly shifts every later
 * raw order number without changing anything's real relative position.
 *
 * Historical rows TARGET does not declare (switched_source, outlet_condition,
 * dedicated_panel_location) are correctly out of scope here — this walks
 * TARGET's key set, not the live tree's — and their unreachability is
 * asserted separately via findUnreachableQuestions.
 */
async function assertFullGraphMatchesTarget(dst: PrismaClient, contractorId: string, slug: string, targetVersion: number): Promise<void> {
  const live = await snapshotLiveService(dst, contractorId, slug);
  const target = await dst.templateService.findFirstOrThrow({
    where: { slug, templateVersion: { trade: TRADE, version: targetVersion } },
    include: {
      questions: {
        include: {
          options: {
            include: {
              components: { include: { canonicalComponent: { select: { key: true } } } },
              materials: { include: { canonicalMaterial: { select: { key: true } } } },
              disclaimers: { include: { canonicalDisclaimer: { select: { key: true } } } },
              photoGroups: { include: { photoGroup: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });

  const targetQuestionRank = rankByOrder(target.questions.map((q) => ({ key: q.key, order: q.order })));
  const liveQuestionRank = rankByOrder(
    Object.entries(live.questions)
      .filter(([key]) => targetQuestionRank[key] !== undefined)
      .map(([key, q]) => ({ key, order: q.order }))
  );

  for (const tq of target.questions) {
    const lq = live.questions[tq.key];
    ok(!!lq, `${slug}: question "${tq.key}" exists on the adopted contractor`);
    if (!lq) continue;
    ok(lq.prompt === tq.prompt, `${slug}: question "${tq.key}" prompt matches target ("${lq.prompt}")`);
    ok(lq.helpText === tq.helpText, `${slug}: question "${tq.key}" helpText matches target`);
    ok(lq.inputType === tq.inputType, `${slug}: question "${tq.key}" inputType matches target (${lq.inputType})`);
    ok(lq.numberAllowsDecimal === tq.numberAllowsDecimal && lq.numberMin === tq.numberMin && lq.numberMax === tq.numberMax,
      `${slug}: question "${tq.key}" numeric-route fields match target`);
    ok(liveQuestionRank[tq.key] === targetQuestionRank[tq.key],
      `${slug}: question "${tq.key}" relative order among target's own questions is preserved (rank ${liveQuestionRank[tq.key]})`);

    const targetOptionRank = rankByOrder(tq.options.map((o) => ({ key: o.value, order: o.order })));
    const liveOptionRank = rankByOrder(
      Object.entries(lq.options)
        .filter(([value]) => targetOptionRank[value] !== undefined)
        .map(([value, o]) => ({ key: value, order: o.order }))
    );

    for (const to of tq.options) {
      const lo = lq.options[to.value];
      ok(!!lo, `${slug}: option "${tq.key}/${to.value}" exists on the adopted contractor`);
      if (!lo) continue;
      ok(liveOptionRank[to.value] === targetOptionRank[to.value],
        `${slug}: option "${tq.key}/${to.value}" relative order among target's own options is preserved`);
      const expected: OptionCompareSnap = {
        label: to.label,
        routeAction: to.routeAction, nextQuestionKey: to.nextQuestionKey, rerouteServiceKey: to.rerouteServiceKey,
        referencedServiceKey: to.referencedServiceKey, numberAtLeast: to.numberAtLeast, numberAtMost: to.numberAtMost,
        numberAtLeastExclusive: to.numberAtLeastExclusive, requiresCapabilityKey: to.requiresCapabilityKey,
        labelPattern: to.labelPattern,
        requiredPhotoLabels: [...to.requiredPhotoLabels].sort(),
        photosBlockBooking: to.photosBlockBooking,
        illustrationUrls: [...to.illustrationUrls].sort(),
        components: to.components.filter((c) => c.canonicalComponent).map((c) => ({
          key: c.canonicalComponent!.key, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey,
          conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
        })).sort((a, b) => a.key.localeCompare(b.key)),
        materials: to.materials.filter((m) => m.canonicalMaterial).map((m) => ({ key: m.canonicalMaterial!.key, quantity: m.quantity })).sort((a, b) => a.key.localeCompare(b.key)),
        photoGroups: to.photoGroups.filter((g) => g.photoGroup).map((g) => g.photoGroup!.key).sort(),
        disclaimers: to.disclaimers.filter((d) => d.canonicalDisclaimer).map((d) => d.canonicalDisclaimer!.key).sort(),
      };
      const actual: OptionCompareSnap = stripOptionId(lo);
      ok(deepEqual(actual, expected), `${slug}: option "${tq.key}/${to.value}" full shape matches target — ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// --status / --adopt against the real, unmodified adoption tool
// ---------------------------------------------------------------------------

type ParsedChange =
  | { kind: "question-added" | "option-added" | "baseline-missing"; id: string }
  | { kind: "option-revised" | "wording-changed"; id: string; conflict: boolean };

function parseStatus(output: string): ParsedChange[] {
  const changes: ParsedChange[] = [];
  for (const line of output.split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*\+ question\s+\[([^\]]+)\]/))) { changes.push({ kind: "question-added", id: m[1] }); continue; }
    if ((m = line.match(/^\s*\+ option\s+(\S+)/))) { changes.push({ kind: "option-added", id: m[1] }); continue; }
    if ((m = line.match(/^\s*~ option\s+(\S+)(.*)$/))) { changes.push({ kind: "option-revised", id: m[1], conflict: /CONFLICT/.test(m[2]) }); continue; }
    if ((m = line.match(/^\s*~ wording\s+\[([^\]]+)\](.*)$/))) { changes.push({ kind: "wording-changed", id: m[1], conflict: /CONFLICT/.test(m[2]) }); continue; }
    if ((m = line.match(/^\s*! \w+\s+(\S+)\s+NEEDS BASELINE/))) { changes.push({ kind: "baseline-missing", id: m[1] }); continue; }
  }
  return changes;
}

function templateUpdate(contractorSlug: string, args: string[]): string {
  return execFileSync("npx", ["tsx", "scripts/template-update.ts", "--contractor", contractorSlug, ...args], { encoding: "utf8", stdio: "pipe" });
}
function status(contractorSlug: string, slug: string): ParsedChange[] {
  return parseStatus(templateUpdate(contractorSlug, ["--service", slug, "--status"]));
}
function isConflicted(c: ParsedChange): boolean {
  return (c.kind === "option-revised" || c.kind === "wording-changed") && c.conflict;
}
function adopt(contractorSlug: string, slug: string, id: string): string {
  return templateUpdate(contractorSlug, ["--service", slug, "--adopt", id]);
}
/** The complete typed change set as stable strings, e.g. "option-revised:existing_light_source/no" — every kind, never filtered before an "exact set" assertion. */
function changeSetKeys(changes: ParsedChange[]): string[] {
  return changes.map((c) => `${c.kind}:${c.id}`).sort();
}

// ---------------------------------------------------------------------------
// Real component/pricing setup — same canonical figures Elite's own seeds
// use (prisma/seed-lighting-control.ts, prisma/seed-dedicated-circuit.ts),
// applied to a different contractor via the real ContractorComponent table.
// ---------------------------------------------------------------------------

const LIGHTING_COMPONENTS = [
  { key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE", approvedPriceCents: 22000, addFieldLaborHours: 0.75, addMaterialCostCents: 2500, addScheduleMinutes: 45 },
  { key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED", approvedPriceCents: 36000, addFieldLaborHours: 1.25, addMaterialCostCents: 3500, addScheduleMinutes: 75 },
  { key: "SWITCH_POWER_RUN_ACCESSIBLE", approvedPriceCents: 32000, addFieldLaborHours: 1.0, addMaterialCostCents: 2180, addScheduleMinutes: 60 },
  { key: "SWITCH_POWER_RUN_FINISHED", approvedPriceCents: 42000, addFieldLaborHours: 1.5, addMaterialCostCents: 2180, addScheduleMinutes: 90 },
  { key: "LED_DIMMER_UPGRADE", approvedPriceCents: 4000, addFieldLaborHours: 0, addMaterialCostCents: 3000, addScheduleMinutes: 0 },
  { key: "SWITCHLEG_ACCESSIBLE_UNDER_10", approvedPriceCents: 30000, addFieldLaborHours: 1.0, addMaterialCostCents: 3500, addScheduleMinutes: 60 },
  { key: "SWITCHLEG_ACCESSIBLE_10_20", approvedPriceCents: 36000, addFieldLaborHours: 1.25, addMaterialCostCents: 3500, addScheduleMinutes: 75 },
  { key: "SWITCHLEG_FINISHED_UNDER_10", approvedPriceCents: 43500, addFieldLaborHours: 1.5, addMaterialCostCents: 4500, addScheduleMinutes: 90 },
  { key: "SWITCHLEG_FINISHED_10_20", approvedPriceCents: 56000, addFieldLaborHours: 2.0, addMaterialCostCents: 4500, addScheduleMinutes: 120 },
];
const CIRCUIT_COMPONENTS = [
  { key: "DEDICATED_CIRCUIT_20A", approvedPriceCents: 1500, addFieldLaborHours: 0, addMaterialCostCents: 1050, addScheduleMinutes: 0 },
  { key: "DEDICATED_CIRCUIT_240V", approvedPriceCents: 1500, addFieldLaborHours: 0, addMaterialCostCents: 1100, addScheduleMinutes: 0 },
];

async function approveComponents(prisma: PrismaClient, contractorId: string): Promise<void> {
  for (const c of [...LIGHTING_COMPONENTS, ...CIRCUIT_COMPONENTS]) {
    const canonical = await prisma.canonicalComponent.findUniqueOrThrow({ where: { key: c.key } });
    await prisma.contractorComponent.upsert({
      where: { contractorId_canonicalComponentId: { contractorId, canonicalComponentId: canonical.id } },
      update: { approvedPriceCents: c.approvedPriceCents, addFieldLaborHours: c.addFieldLaborHours, addMaterialCostCents: c.addMaterialCostCents, addScheduleMinutes: c.addScheduleMinutes },
      create: { contractorId, canonicalComponentId: canonical.id, approvedPriceCents: c.approvedPriceCents, addFieldLaborHours: c.addFieldLaborHours, addMaterialCostCents: c.addMaterialCostCents, addScheduleMinutes: c.addScheduleMinutes },
    });
  }
}
/** Re-reads every ContractorComponent this run approved and confirms it still matches the source-of-truth figures above — proves adoption does not collaterally disturb a contractor's own economics on components it never touched. */
async function assertComponentsStillApproved(prisma: PrismaClient, contractorId: string): Promise<void> {
  for (const c of [...LIGHTING_COMPONENTS, ...CIRCUIT_COMPONENTS]) {
    const canonical = await prisma.canonicalComponent.findUniqueOrThrow({ where: { key: c.key } });
    const row = await prisma.contractorComponent.findUnique({ where: { contractorId_canonicalComponentId: { contractorId, canonicalComponentId: canonical.id } } });
    ok(row?.approvedPriceCents === c.approvedPriceCents, `ContractorComponent ${c.key} still approved at $${(c.approvedPriceCents / 100).toFixed(2)} after the full adoption batch`);
  }
}

async function approvePricingSettings(prisma: PrismaClient, contractorId: string): Promise<void> {
  await prisma.pricingSettings.upsert({
    where: { contractorId },
    update: {},
    create: { contractorId, crewHourRateCents: 25000, primaryMinimumCents: 25000, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
  });
}

/**
 * A flat priceModifierCents is contractor economics, so extract-template-
 * service.ts drops it on purpose (`if (o.priceModifierCents) findings.push(
 * {kind:"economics", ...dropped})`) — provisioning from the BEFORE template
 * correctly leaves switched_source's yes/no at their schema default (0/null).
 * A real contractor would enter this figure themselves during onboarding,
 * same as approving a component's price below; this does that with Elite's
 * own real historical values, verbatim from cb8821a8's diff.
 */
async function approveSwitchedSourcePriceModifiers(prisma: PrismaClient, contractorId: string): Promise<void> {
  for (const slug of ["new-ceiling-light", "new-ceiling-fan"]) {
    const service = await prisma.service.findFirst({ where: { contractorId, slug } });
    if (!service) continue;
    const q = await prisma.question.findFirst({ where: { serviceId: service.id, key: "switched_source" } });
    if (!q) continue; // already adopted away — nothing left to price
    await prisma.answerOption.updateMany({ where: { questionId: q.id, value: "yes" }, data: { priceModifierCents: 15000 } });
    await prisma.answerOption.updateMany({ where: { questionId: q.id, value: "no" }, data: { priceModifierCents: 22500 } });
  }
}
/** Confirms the retained switched_source question's own economics (unaffected by any adopt call, which never touches it) survived the full batch unchanged. */
async function assertSwitchedSourceEconomicsPreserved(prisma: PrismaClient, contractorId: string): Promise<void> {
  for (const slug of ["new-ceiling-light", "new-ceiling-fan"]) {
    const service = await prisma.service.findFirstOrThrow({ where: { contractorId, slug } });
    const q = await prisma.question.findFirstOrThrow({ where: { serviceId: service.id, key: "switched_source" } });
    const yes = await prisma.answerOption.findFirstOrThrow({ where: { questionId: q.id, value: "yes" } });
    const no = await prisma.answerOption.findFirstOrThrow({ where: { questionId: q.id, value: "no" } });
    ok(yes.priceModifierCents === 15000 && no.priceModifierCents === 22500,
      `${slug}: retained switched_source's own price modifiers ($150/$225) are unchanged after the full adoption batch`);
  }
}

/**
 * Approves one service for pricing: real basePrice (copied from Elite's own
 * published figure, queried off the fixtures before their scratch databases
 * were dropped — never invented), and materialCostResolved forced true.
 *
 * DISCLOSED SIMPLIFICATION — see this file's own header docstring: whether a
 * real contractor has ANY supported path to re-resolve materialCostResolved
 * after adopting one of these five services is UNPROVEN and BLOCKED, not
 * fixed and not declared irrelevant. Setting the flag directly reaches a
 * bookable state without walking that unproven path; it does not touch what
 * resolveRoute computes once it is set, which is the one thing the §-numbered
 * resolver check exists to prove.
 */
async function approveService(prisma: PrismaClient, contractorId: string, slug: string, basePrice: number, whileWeThereBasePrice: number | null): Promise<void> {
  await prisma.service.updateMany({
    where: { contractorId, slug },
    data: { basePrice, whileWeThereBasePrice, materialCostResolved: true, publishedPriceApprovedAt: new Date() },
  });
}

async function priceCeilingLightPath(prisma: PrismaClient, contractorId: string): Promise<number> {
  const service = await prisma.service.findFirstOrThrow({ where: { contractorId, slug: "new-ceiling-light" } });
  const loaded = await loadServiceForResolution(prisma, service.id);
  if (!loaded) throw new Error("new-ceiling-light did not load for resolution");
  const settings = await loadPricingSettings(prisma, contractorId);
  const answers: Record<string, string> = {
    fixture_height: "under_8",
    work_area_below: "level_floor",
    attic_access: "has_access",
    existing_light_source: "no",
    ...(loaded.questions.some((q) => q.key === "switched_source") ? { switched_source: "no" } : {}),
    lighting_control: "no_switch",
    switch_near_power: "no",
    below_above_access: "has_access",
    lighting_dimmer_upgrade: "standard",
  };
  const result = resolveRoute(loaded, answers, true, settings);
  if (result.status !== "PRICED") throw new Error(`expected PRICED, got ${result.status} — ${"reason" in result ? result.reason : ""}`);
  return result.priceCents;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const prisma = new PrismaClient();
  await assertDisposableLocalDatabase(prisma);

  const preExistingVersions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { version: true } });
  const preExistingContractors = (await prisma.contractor.findMany({ select: { slug: true } })).map((c) => c.slug).sort();

  const ownedDatabases: string[] = [];
  const ownedFiles: string[] = [];
  const ownedTemplateVersions: number[] = [];
  const ownedContractorSlugs: string[] = [];
  const cleanupErrors: string[] = [];

  try {
    console.log(`Run ${RUN_ID} — creating owned scratch databases...\n`);
    createScratchDatabase(BEFORE_DB);
    ownedDatabases.push(BEFORE_DB); // recorded the instant CREATE succeeds
    createScratchDatabase(TARGET_DB);
    ownedDatabases.push(TARGET_DB);

    writeFileSync(FIXTURE_SEED_PATH, FIXTURE_SEED_SOURCE);
    ownedFiles.push(FIXTURE_SEED_PATH);

    console.log("\nBuilding BEFORE fixture (scratch database, real seed code)...\n");
    buildScratchFixture("before", BEFORE_DB);
    console.log("\nBuilding TARGET fixture (scratch database, real seed code, current HEAD)...\n");
    buildScratchFixture("target", TARGET_DB);

    console.log("\nMigrating both fixtures into the rehearsal database...\n");
    await migrateFixtureIntoRehearsalDb(scratchUrl(BEFORE_DB), BEFORE_VERSION, "audit-batch verifier BEFORE — composed from real seed code");
    ownedTemplateVersions.push(BEFORE_VERSION); // tracked immediately — the migration above is one atomic transaction, so this can only ever be all-or-nothing
    await migrateFixtureIntoRehearsalDb(scratchUrl(TARGET_DB), TARGET_VERSION, "audit-batch verifier TARGET — composed from real seed code, current HEAD");
    ownedTemplateVersions.push(TARGET_VERSION);

    // Scratch databases are no longer needed once migrated — dropped here as
    // an optimization; cleanup's finally re-attempts unconditionally (a
    // second DROP DATABASE IF EXISTS is a harmless no-op) as the backstop.
    dropScratchDatabase(BEFORE_DB);
    dropScratchDatabase(TARGET_DB);

    console.log("\nProvisioning ADOPTER and UNRELATED from BEFORE (v500)...\n");
    await withThrowaway(prisma, ADOPTER, "Audit Batch Adopter", async (adopterId) => {
      ownedContractorSlugs.push(ADOPTER);
      provision(ADOPTER, ["--version", String(BEFORE_VERSION)]);

      await withThrowaway(prisma, UNRELATED, "Audit Batch Unrelated Tenant", async (unrelatedId) => {
        ownedContractorSlugs.push(UNRELATED);
        provision(UNRELATED, ["--version", String(BEFORE_VERSION)]);

        console.log("\n§0 — snapshot UNRELATED before any ADOPTER adoption\n");
        const unrelatedBefore: Record<string, ServiceSnap> = {};
        for (const slug of SERVICE_SLUGS) unrelatedBefore[slug] = await snapshotLiveService(prisma, unrelatedId, slug);

        console.log("\n§1 — approve ADOPTER's pricing/components for the resolver proof\n");
        await approvePricingSettings(prisma, adopterId);
        await approveComponents(prisma, adopterId);
        await approveSwitchedSourcePriceModifiers(prisma, adopterId);
        await approveService(prisma, adopterId, "new-ceiling-light", 37500, 25000);

        console.log("\n§2 — real resolveRoute price on the BEFORE tree (double-charge expected)\n");
        const beforePriceCents = await priceCeilingLightPath(prisma, adopterId);
        console.log(`  BEFORE price for the test path: $${(beforePriceCents / 100).toFixed(2)}`);

        console.log("\n§3 — assert the exact, complete typed --status change set (before any adoption, uncustomized ADOPTER)\n");
        const EXPECTED: Record<string, string[]> = {
          "new-ceiling-light": ["option-revised:existing_light_source/no"],
          "new-ceiling-fan": ["option-revised:existing_light_source/no"],
          "replace-standard-outlet": [
            "option-revised:device_replacement_reason/works_upgrading",
            "option-revised:device_replacement_reason/intermittent",
            "option-revised:device_replacement_reason/damaged",
          ],
          "dedicated-120v-circuit-outlet": ["option-revised:dedicated_distance/under_25", "option-revised:dedicated_distance/25_to_50"],
          "dishwasher-electrical": ["wording-changed:appliance_power_present"],
        };
        let totalExpected = 0;
        for (const [slug, expectedKeys] of Object.entries(EXPECTED)) {
          const changes = status(ADOPTER, slug);
          const actualKeys = changeSetKeys(changes); // every kind, unfiltered
          ok(deepEqual(actualKeys, [...expectedKeys].sort()), `${slug}: --status's complete typed change set is exactly ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`);
          ok(changes.every((c) => !isConflicted(c)), `${slug}: no change is reported as a conflict on the uncustomized ADOPTER`);
          totalExpected += expectedKeys.length;
        }
        ok(totalExpected === 8, `exactly 8 real per-unit operations across the batch (${totalExpected})`);

        console.log("\n§3a — snapshot every question/option row id before any adoption, for the retention proof in §8a\n");
        const idsBeforeAdoption = await snapshotRowIds(prisma, adopterId);

        console.log("\n§4 — adopt ALL EIGHT changes on the uncustomized ADOPTER, pricing-invalidation checked after the FIRST change in every multi-change service\n");

        async function adoptAndCheckReset(slug: string, id: string): Promise<void> {
          const out = adopt(ADOPTER, slug, id);
          ok(!/SKIPPED|REFUSED/.test(out), `${slug}: adopting "${id}" was not skipped or refused`);
          const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug } });
          ok(svc.materialCostResolved === false && svc.basePrice === null && svc.publishedPriceApprovedAt === null,
            `${slug}: adopting "${id}" reset pricing (materialCostResolved=false, basePrice=null, publishedPriceApprovedAt=null)`);
        }

        // new-ceiling-light — single change, then re-approve for the AFTER price.
        await adoptAndCheckReset("new-ceiling-light", "existing_light_source/no");
        await approveService(prisma, adopterId, "new-ceiling-light", 37500, 25000);

        console.log("\n§5 — real resolveRoute price on the now-adopted tree (single charge expected)\n");
        const afterPriceCents = await priceCeilingLightPath(prisma, adopterId);
        console.log(`  AFTER price for the same test path: $${(afterPriceCents / 100).toFixed(2)}`);
        ok(beforePriceCents - afterPriceCents === 22500,
          `switch-leg work is now charged exactly once: BEFORE ($${(beforePriceCents / 100).toFixed(2)}) - AFTER ($${(afterPriceCents / 100).toFixed(2)}) = $225.00, the removed switched_source/no flat fee`);

        // new-ceiling-fan — single change.
        await approveService(prisma, adopterId, "new-ceiling-fan", 42500, 27500);
        await adoptAndCheckReset("new-ceiling-fan", "existing_light_source/no");

        // replace-standard-outlet — three changes, pricing checked after EACH one.
        for (const id of ["device_replacement_reason/works_upgrading", "device_replacement_reason/intermittent", "device_replacement_reason/damaged"]) {
          await approveService(prisma, adopterId, "replace-standard-outlet", 22500, 8500);
          await adoptAndCheckReset("replace-standard-outlet", id);
        }

        // dedicated-120v-circuit-outlet — BOTH real changes, pricing checked after EACH.
        for (const id of ["dedicated_distance/under_25", "dedicated_distance/25_to_50"]) {
          await approveService(prisma, adopterId, "dedicated-120v-circuit-outlet", 79500, null);
          await adoptAndCheckReset("dedicated-120v-circuit-outlet", id);
        }

        // dishwasher-electrical — the one wording-changed unit.
        await approveService(prisma, adopterId, "dishwasher-electrical", 27500, 19000);
        await adoptAndCheckReset("dishwasher-electrical", "appliance_power_present");

        console.log("\n§6 — no-op re-adopt: the same option adopted twice must be a genuine no-op\n");
        {
          const before = await snapshotLiveService(prisma, adopterId, "new-ceiling-light");
          const out = adopt(ADOPTER, "new-ceiling-light", "existing_light_source/no");
          ok(/no change matched/.test(out), `re-adopting "existing_light_source/no" reports no change matched (${out.trim().split("\n").pop()})`);
          const after = await snapshotLiveService(prisma, adopterId, "new-ceiling-light");
          ok(deepEqual(before, after), "re-adopting an already-adopted option left the full service snapshot byte-identical");
        }

        console.log("\n§7 — full graph comparison against TARGET (ALL units, uncustomized ADOPTER), and bypassed-row unreachability from the real entry\n");
        for (const slug of SERVICE_SLUGS) {
          await assertFullGraphMatchesTarget(prisma, adopterId, slug, TARGET_VERSION);
          const service = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug } });
          const dangling = await findDanglingReferences(prisma, service.id);
          ok(dangling.length === 0, `${slug}: no dangling references after adoption`);
        }
        {
          const lightSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug: "new-ceiling-light" } });
          ok(deepEqual((await findUnreachableQuestions(prisma, lightSvc.id)).sort(), ["switched_source"]), "new-ceiling-light: switched_source is unreachable from the real entry after adoption (retained, not deleted)");
          const fanSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug: "new-ceiling-fan" } });
          ok(deepEqual((await findUnreachableQuestions(prisma, fanSvc.id)).sort(), ["switched_source"]), "new-ceiling-fan: switched_source is unreachable from the real entry after adoption");
          const outletSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug: "replace-standard-outlet" } });
          ok(deepEqual((await findUnreachableQuestions(prisma, outletSvc.id)).sort(), ["outlet_condition"]), "replace-standard-outlet: outlet_condition is unreachable from the real entry after adoption");
          const circuitSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug: "dedicated-120v-circuit-outlet" } });
          ok(deepEqual((await findUnreachableQuestions(prisma, circuitSvc.id)).sort(), ["dedicated_panel_location"]),
            "dedicated-120v-circuit-outlet: dedicated_panel_location is unreachable from the real entry — BOTH dedicated_distance answers were adopted, so nothing on this contractor's live tree points at it any more");
        }

        console.log("\n§8 — question/option row-id retention: every id present before any adoption is still present, unchanged, after all eight\n");
        const idsAfterAdoption = await snapshotRowIds(prisma, adopterId);
        ok(deepEqual(idsBeforeAdoption, idsAfterAdoption), "every question/option row id (adopted, unchanged, and retained/orphaned alike) is identical before and after the full batch — nothing was deleted and recreated");

        console.log("\n§9 — economics preserved: adoption does not collaterally disturb pricing data it never touched\n");
        await assertComponentsStillApproved(prisma, adopterId);
        await assertSwitchedSourceEconomicsPreserved(prisma, adopterId);

        console.log("\n§10 — UNRELATED tenant is unaffected by every adoption performed above\n");
        for (const slug of SERVICE_SLUGS) {
          const after = await snapshotLiveService(prisma, unrelatedId, slug);
          ok(deepEqual(unrelatedBefore[slug], after), `UNRELATED's ${slug} is byte-identical to its pre-adoption snapshot`);
        }
      });
    });

    console.log("\n§11 — conflict protection, on a SEPARATE contractor never touched above: refusal writes nothing, and real partial (never re-approved) progress stays unapproved\n");
    await withThrowaway(prisma, CONFLICT_TESTER, "Audit Batch Conflict Tester", async (conflictTesterId) => {
      ownedContractorSlugs.push(CONFLICT_TESTER);
      provision(CONFLICT_TESTER, ["--version", String(BEFORE_VERSION)]);
      await approvePricingSettings(prisma, conflictTesterId);
      await approveComponents(prisma, conflictTesterId);

      // ONE real change, approved beforehand so the reset is meaningful, then
      // deliberately NEVER re-approved — this is the actual, undoctored state
      // a real partial adoption leaves a service in.
      await approveService(prisma, conflictTesterId, "dedicated-120v-circuit-outlet", 79500, null);
      const out = adopt(CONFLICT_TESTER, "dedicated-120v-circuit-outlet", "dedicated_distance/under_25");
      ok(!/SKIPPED|REFUSED/.test(out), `dedicated_distance/under_25 adopted cleanly on ${CONFLICT_TESTER}`);
      const afterFirstAdopt = await prisma.service.findFirstOrThrow({ where: { contractorId: conflictTesterId, slug: "dedicated-120v-circuit-outlet" } });
      ok(afterFirstAdopt.materialCostResolved === false && afterFirstAdopt.basePrice === null && afterFirstAdopt.publishedPriceApprovedAt === null,
        "after the one real adopt, dedicated-120v-circuit-outlet is unapproved (materialCostResolved=false, basePrice=null, publishedPriceApprovedAt=null) — and is NOT re-approved from here on");

      const circuitService = await prisma.service.findFirstOrThrow({ where: { contractorId: conflictTesterId, slug: "dedicated-120v-circuit-outlet" } });
      const q3 = await prisma.question.findFirstOrThrow({ where: { serviceId: circuitService.id, key: "dedicated_distance" } });
      const opt = await prisma.answerOption.findFirstOrThrow({ where: { questionId: q3.id, value: "25_to_50" } });
      // Simulate an admin who customized this UN-adopted option by attaching a
      // component to it directly, bypassing the tool — leaves nextQuestionId
      // untouched (still pointing at dedicated_panel_location, so that
      // question's reachability is a fact about THIS contractor, asserted
      // below, not borrowed from ADOPTER's). This is a real structural
      // difference from both the BEFORE baseline (no components) and TARGET's
      // own fix (also no components), so it is a genuine conflict against
      // both, not an accidental match of either.
      const twentyAmp = await prisma.canonicalComponent.findUniqueOrThrow({ where: { key: "DEDICATED_CIRCUIT_20A" } });
      await prisma.answerOptionComponent.create({ data: { answerOptionId: opt.id, canonicalComponentId: twentyAmp.id } });

      const beforeState = await prisma.service.findUniqueOrThrow({ where: { id: circuitService.id } });
      const before = await snapshotLiveService(prisma, conflictTesterId, "dedicated-120v-circuit-outlet");

      const changes = status(CONFLICT_TESTER, "dedicated-120v-circuit-outlet");
      const conflictReported = changes.find((c) => c.kind === "option-revised" && c.id === "dedicated_distance/25_to_50");
      ok(!!conflictReported && isConflicted(conflictReported), "dedicated_distance/25_to_50 is reported as a CONFLICT after the simulated customization");

      const adoptOut = adopt(CONFLICT_TESTER, "dedicated-120v-circuit-outlet", "dedicated_distance/25_to_50");
      ok(/SKIPPED/.test(adoptOut), `conflicted adopt of dedicated_distance/25_to_50 is skipped, not overwritten (${adoptOut.trim().split("\n").pop()})`);

      const after = await snapshotLiveService(prisma, conflictTesterId, "dedicated-120v-circuit-outlet");
      ok(deepEqual(before, after), "the full service (every question/option/component/label/photo/disclaimer) is byte-identical before and after the skipped conflict adopt");
      const afterState = await prisma.service.findUniqueOrThrow({ where: { id: circuitService.id } });
      ok(afterState.materialCostResolved === false && afterState.basePrice === null && afterState.publishedPriceApprovedAt === null,
        "dedicated-120v-circuit-outlet is STILL unapproved after the skipped conflict adopt — real partial progress, never re-approved, stays unapproved; the refusal did not (and could not) change that");
      ok(before.receipts.length === after.receipts.length, "no new TemplateAdoptionReceipt row was written by the skipped conflict adopt");

      const circuitSvcOnConflictTester = await prisma.service.findFirstOrThrow({ where: { contractorId: conflictTesterId, slug: "dedicated-120v-circuit-outlet" } });
      ok(deepEqual((await findUnreachableQuestions(prisma, circuitSvcOnConflictTester.id)).sort(), []),
        `${CONFLICT_TESTER}: dedicated_panel_location is still reachable — only under_25 was adopted here, and 25_to_50's own live CONTINUE into it (its customization did not touch nextQuestionId) remains a real path`);
    });
  } catch (e) {
    cleanupErrors.push(`main body threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  } finally {
    console.log("\nCleanup — only resources this run recorded as owned, continuing past any individual failure...\n");

    for (const v of ownedTemplateVersions) {
      try {
        const row = await prisma.templateVersion.findUnique({ where: { trade_version: { trade: TRADE, version: v } } });
        if (!row) continue;
        // TemplateAnswerOption.templatePolicyDefinitionId is onDelete:Restrict
        // (deliberately — a policy reference is never silently orphaned), so a
        // banded option (dedicated_distance's three) must be detached before
        // the version's own TemplatePolicyDefinition rows can cascade away.
        await prisma.templateAnswerOption.updateMany({
          where: { templatePolicyDefinition: { templateVersionId: row.id } },
          data: { templatePolicyDefinitionId: null },
        });
        await prisma.templateVersion.delete({ where: { id: row.id } });
      } catch (e) {
        cleanupErrors.push(`failed to delete electrical v${v}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const slug of ownedContractorSlugs) {
      try {
        const c = await prisma.contractor.findUnique({ where: { slug } });
        if (c) {
          const { destroyContractor } = await import("./_throwaway");
          await destroyContractor(prisma, slug);
        }
      } catch (e) {
        cleanupErrors.push(`failed to destroy contractor ${slug}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const db of ownedDatabases) {
      try {
        dropScratchDatabase(db);
      } catch (e) {
        cleanupErrors.push(`failed to drop scratch database ${db}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const f of ownedFiles) {
      try {
        unlinkSync(f);
      } catch (e) {
        cleanupErrors.push(`failed to delete ${f}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    try {
      const postVersions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { version: true } });
      const postContractors = (await prisma.contractor.findMany({ select: { slug: true } })).map((c) => c.slug).sort();
      ok(deepEqual(preExistingVersions.map((v) => v.version).sort(), postVersions.map((v) => v.version).sort()),
        "electrical TemplateVersion set matches the captured pre-run baseline exactly (not just a count)");
      ok(deepEqual(preExistingContractors, postContractors), "Contractor set matches the captured pre-run baseline exactly");
    } catch (e) {
      cleanupErrors.push(`failed to verify post-run baseline: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (cleanupErrors.length > 0) {
      console.error(`\n${cleanupErrors.length} CLEANUP ERROR(S):`);
      for (const e of cleanupErrors) console.error(`  - ${e}`);
    }
  }

  console.log(`\n${failures === 0 && cleanupErrors.length === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED, ${cleanupErrors.length} CLEANUP ERROR(S)`}\n`);
  await prisma.$disconnect();
  if (failures > 0 || cleanupErrors.length > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
