/**
 * Corrected rehearsal of the five-service electrical audit-batch adoption,
 * through the CURRENT, unmodified scripts/template-update.ts.
 *
 * SUPERSEDES the first pass (commit e63528a). That pass hand-authored its
 * BEFORE/TARGET fixtures and was found, on review, to have gotten the real
 * `lighting_control` module, the real before/after composition of
 * new-ceiling-light/new-ceiling-fan, and the graph/pricing evidence wrong in
 * several independent ways — see the manifest's revision history. This pass
 * fixes the EVIDENCE, not the tool: scripts/template-update.ts is never
 * imported for its logic and never modified.
 *
 * WHAT "FAITHFUL" MEANS HERE
 *
 * Every BEFORE/TARGET fixture below is composed by running this repo's own,
 * real, unmodified seed functions — never a hand-transcribed tree — inside a
 * brand-new, disposable local Postgres database created and destroyed by
 * this script alone (never the shared p2b_integration_seeded cluster's own
 * Elite fixture, and never any existing Elite row). The one exception is the
 * four small BEFORE-state reversions (verbatim from each fix commit's own
 * diff, see revertCeilingSwitchLeg/revertOutletCondition/
 * revertDedicatedPanelLocation/revertDishwasherWording below) — there is no
 * running the "old" seed files directly, because a later, unrelated refactor
 * (2703b38) restructured how their functions are called; reverting a verbatim
 * diff hunk on top of the current, correct seed output is the faithful
 * substitute, and every value in it is copied from `git show <fix-sha>`,
 * never reconstructed from memory.
 *
 * Each fixture's five services are then extracted with the real
 * scripts/extract-template-service.ts (one TemplateVersion per service, kept
 * inside the scratch database) and migrated — by canonical KEY, never by raw
 * id, since ids are per-database-instance — into ONE combined TemplateVersion
 * per fixture (500 = BEFORE, 501 = TARGET) inside the shared rehearsal
 * database, which is where the throwaway ADOPTER/UNRELATED contractors live
 * and where scripts/template-update.ts/provision-from-template.ts actually
 * run.
 *
 * THE EIGHT REAL PER-UNIT OPERATIONS THIS PROVES, matching the six real
 * audit-fix commits' own account of this five-service batch:
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
 * modifier) — closing the gap the first pass's review found in its own
 * uncomposed BEFORE fixture.
 *
 * `dedicated_distance/25_to_50` is deliberately NOT adopted in the main
 * batch. It is used for the conflict-protection proof instead (§7): a
 * simulated prior admin customization must survive an `--adopt` attempt
 * untouched. `dedicated-120v-circuit-outlet` therefore ends this run with
 * one real change adopted and one genuinely conflicted — "partial service
 * states unapproved" — which is the state the task asked to demonstrate,
 * not a shortfall against the 8.
 *
 * Every disclosed simplification is called out at its own site: this
 * fixture (a) does not resolve the two policy-quantity material allowances
 * (WIRE_14_2/CONSUMABLES_*) a real onboarding flow would walk a contractor
 * through — materialCostResolved is set directly for the services this
 * verifier prices, which is an onboarding-readiness gate orthogonal to the
 * switch-leg pricing arithmetic being proven, and is itself a real, separate
 * gap this run surfaces (see approveService's own comment) rather than
 * papers over; and (b) approves ADOPTER's own ContractorComponent rows using
 * the exact canonical figures prisma/seed-lighting-control.ts and
 * prisma/seed-dedicated-circuit.ts already define for Elite — never a
 * client-side reimplementation of pricing. The real resolver
 * (lib/routeResolver.ts's resolveRoute, loaded through the real
 * lib/templateProvisioning.ts + lib/materialCost.ts paths) computes every
 * price this script reports.
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

const ADOPTER = "__audit-batch-adopter__";
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

function createScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `CREATE DATABASE ${name};`], { stdio: "pipe" });
}
function dropScratchDatabase(name: string): void {
  execFileSync("psql", ["-h", SCRATCH_HOST, "-p", String(SCRATCH_PORT), "-U", SCRATCH_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${name};`], { stdio: "pipe" });
}

/**
 * The one-time seed/build orchestrator, written to a temp file INSIDE
 * prisma/ so the real seed files' own relative imports resolve, run as a
 * subprocess (each seed file constructs its own PrismaClient at import time
 * from process.env.DATABASE_URL — a subprocess is the only way to give two
 * different runs of the same module graph two different target databases),
 * then deleted. Never committed — see the cleanup at the bottom of this file.
 */
const FIXTURE_SEED_PATH = "prisma/_tmp_auditbatch_seed.ts";
const FIXTURE_SEED_SOURCE = String.raw`
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";

const ELITE_SLUG = "elite-electric";

function run(file: string) {
  execFileSync("npx", ["tsx", file], { stdio: "inherit", env: process.env });
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

  run("prisma/repair-trees.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
`;

function buildScratchFixture(variant: "before" | "target", dbName: string): void {
  createScratchDatabase(dbName);
  const url = scratchUrl(dbName);
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  execFileSync("npx", [
    "tsx", "scripts/verify-database-identity.ts", "--stamp",
    "--expect", `local-auditbatch-${variant}`, "--project", "local-disposable-not-neon",
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
  routeAction: string; nextQuestionKey: string | null; rerouteServiceKey: string | null; referencedServiceKey: string | null;
  numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean; requiresCapabilityKey: string | null;
  components: { key: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[];
};
type QuestionSnap = { prompt: string; options: Record<string, OptionSnap> };
type ServiceSnap = {
  name: string; bookingType: string; basePrice: number | null; materialCostResolved: boolean; publishedPriceApprovedAt: string | null;
  questions: Record<string, QuestionSnap>;
  receipts: { unitKind: string; unitKey: string; acceptedProjection: unknown }[];
};

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
    include: { questions: { include: { options: { include: { components: { include: { canonicalComponent: { select: { key: true } } } } } } } } },
  });
  const questions: Record<string, QuestionSnap> = {};
  for (const q of svc.questions) {
    const options: Record<string, OptionSnap> = {};
    for (const o of q.options) {
      options[o.value] = {
        routeAction: o.routeAction,
        nextQuestionKey: await resolveQuestionKey(prisma, o.nextQuestionId),
        rerouteServiceKey: await resolveServiceSlug(prisma, o.rerouteServiceId),
        referencedServiceKey: await resolveServiceSlug(prisma, o.referencedServiceId),
        numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost, numberAtLeastExclusive: o.numberAtLeastExclusive,
        requiresCapabilityKey: o.requiresCapabilityKey,
        components: o.components.filter((c) => c.canonicalComponent).map((c) => ({
          key: c.canonicalComponent!.key, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey,
          conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
        })),
      };
    }
    questions[q.key] = { prompt: q.prompt, options };
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

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Complete, systematic comparison of a live service against the TARGET
 * template's own questions/options — every key TARGET declares, every field
 * `template-update.ts`'s own AdoptedOptionProjection tracks. Historical rows
 * TARGET does not declare (switched_source, outlet_condition,
 * dedicated_panel_location) are correctly out of scope: this walks TARGET's
 * key set, not the live tree's, so an intentionally-retained orphan is never
 * expected to match anything and never silently ignored either — its
 * unreachability is asserted separately via findUnreachableQuestions.
 *
 * `skipIds` names units that this run deliberately left un-adopted or
 * conflicted (dedicated_distance/25_to_50, kept for §7's conflict-protection
 * proof) — asserted explicitly at their own call site instead, so this
 * function's silence about them is a documented exception, not a gap.
 */
async function assertFullGraphMatchesTarget(dst: PrismaClient, contractorId: string, slug: string, targetVersion: number, skipIds: string[] = []): Promise<void> {
  const live = await snapshotLiveService(dst, contractorId, slug);
  const target = await dst.templateService.findFirstOrThrow({
    where: { slug, templateVersion: { trade: TRADE, version: targetVersion } },
    include: { questions: { include: { options: { include: { components: { include: { canonicalComponent: { select: { key: true } } } } } } } } },
  });

  for (const tq of target.questions) {
    const lq = live.questions[tq.key];
    ok(!!lq, `${slug}: question "${tq.key}" exists on the adopted contractor`);
    if (!lq) continue;
    ok(lq.prompt === tq.prompt, `${slug}: question "${tq.key}" prompt matches target ("${lq.prompt}")`);
    for (const to of tq.options) {
      if (skipIds.includes(`${tq.key}/${to.value}`)) continue;
      const lo = lq.options[to.value];
      ok(!!lo, `${slug}: option "${tq.key}/${to.value}" exists on the adopted contractor`);
      if (!lo) continue;
      const expected: OptionSnap = {
        routeAction: to.routeAction, nextQuestionKey: to.nextQuestionKey, rerouteServiceKey: to.rerouteServiceKey,
        referencedServiceKey: to.referencedServiceKey, numberAtLeast: to.numberAtLeast, numberAtMost: to.numberAtMost,
        numberAtLeastExclusive: to.numberAtLeastExclusive, requiresCapabilityKey: to.requiresCapabilityKey,
        components: to.components.filter((c) => c.canonicalComponent).map((c) => ({
          key: c.canonicalComponent!.key, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey,
          conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
        })).sort((a, b) => a.key.localeCompare(b.key)),
      };
      const actual: OptionSnap = { ...lo, components: [...lo.components].sort((a, b) => a.key.localeCompare(b.key)) };
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

function templateUpdate(args: string[]): string {
  return execFileSync("npx", ["tsx", "scripts/template-update.ts", ...args], { encoding: "utf8", stdio: "pipe" });
}
function status(slug: string): ParsedChange[] {
  return parseStatus(templateUpdate(["--contractor", ADOPTER, "--service", slug, "--status"]));
}
function isConflicted(c: ParsedChange): boolean {
  return (c.kind === "option-revised" || c.kind === "wording-changed") && c.conflict;
}
function adopt(slug: string, id: string): string {
  return templateUpdate(["--contractor", ADOPTER, "--service", slug, "--adopt", id]);
}

// ---------------------------------------------------------------------------
// Real component/pricing setup for ADOPTER — same canonical figures Elite's
// own seeds use (prisma/seed-lighting-control.ts, prisma/seed-dedicated-circuit.ts),
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

async function approveAdopterComponents(prisma: PrismaClient, contractorId: string): Promise<void> {
  for (const c of [...LIGHTING_COMPONENTS, ...CIRCUIT_COMPONENTS]) {
    const canonical = await prisma.canonicalComponent.findUniqueOrThrow({ where: { key: c.key } });
    await prisma.contractorComponent.upsert({
      where: { contractorId_canonicalComponentId: { contractorId, canonicalComponentId: canonical.id } },
      update: { approvedPriceCents: c.approvedPriceCents, addFieldLaborHours: c.addFieldLaborHours, addMaterialCostCents: c.addMaterialCostCents, addScheduleMinutes: c.addScheduleMinutes },
      create: { contractorId, canonicalComponentId: canonical.id, approvedPriceCents: c.approvedPriceCents, addFieldLaborHours: c.addFieldLaborHours, addMaterialCostCents: c.addMaterialCostCents, addScheduleMinutes: c.addScheduleMinutes },
    });
  }
}

async function approveAdopterPricingSettings(prisma: PrismaClient, contractorId: string): Promise<void> {
  await prisma.pricingSettings.upsert({
    where: { contractorId },
    update: {},
    create: { contractorId, crewHourRateCents: 25000, primaryMinimumCents: 25000, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
  });
}

/**
 * A flat priceModifierCents is contractor economics, so extract-template-
 * service.ts drops it on purpose (`if (o.priceModifierCents) findings.push(
 * {kind:"economics", ...dropped})`) — provisioning ADOPTER from the BEFORE
 * template correctly leaves switched_source's yes/no at their schema default
 * (0/null). A real contractor would enter this figure themselves during
 * onboarding, same as approving a component's price below; this does that
 * with Elite's own real historical values, verbatim from cb8821a8's diff.
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

/**
 * Approves one service for pricing: real basePrice (copied from Elite's own
 * published figure, queried off the fixtures before their scratch databases
 * were dropped — never invented), and materialCostResolved forced true.
 *
 * DISCLOSED SIMPLIFICATION: materialCostResolved's real gate
 * (lib/materialCost.ts's recomputeServiceMaterialCost) can never flip back to
 * true for a service whose only materials are policy-quantity allowances —
 * requiredRolesFor() excludes them entirely, so a service with zero
 * STRUCTURAL materials is "ready" with nothing to resolve and the function
 * returns early without writing. That is a real, separate gap in the
 * material-onboarding path (not part of the six audit fixes and not this
 * task's scope) — reported here, not fixed. Setting the flag directly is
 * the same shortcut a from-scratch fixture already takes to reach a
 * bookable state; it does not touch what resolveRoute computes once it is
 * set, which is the one thing this section exists to prove.
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

  console.log("Building BEFORE fixture (scratch database, real seed code)...\n");
  buildScratchFixture("before", "p2b_auditbatch_before");
  console.log("\nBuilding TARGET fixture (scratch database, real seed code, current HEAD)...\n");
  buildScratchFixture("target", "p2b_auditbatch_target");

  console.log("\nMigrating both fixtures into the rehearsal database...\n");
  const preExistingVersions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { version: true } });
  const preExistingContractors = (await prisma.contractor.findMany({ select: { slug: true } })).map((c) => c.slug).sort();

  const publishedVersions: number[] = [];
  try {
    await migrateFixtureIntoRehearsalDb(scratchUrl("p2b_auditbatch_before"), BEFORE_VERSION, "audit-batch verifier BEFORE — composed from real seed code");
    publishedVersions.push(BEFORE_VERSION); // tracked immediately — the migration above is one atomic transaction, so this can only ever be all-or-nothing
    await migrateFixtureIntoRehearsalDb(scratchUrl("p2b_auditbatch_target"), TARGET_VERSION, "audit-batch verifier TARGET — composed from real seed code, current HEAD");
    publishedVersions.push(TARGET_VERSION);

    dropScratchDatabase("p2b_auditbatch_before");
    dropScratchDatabase("p2b_auditbatch_target");

    console.log("\nProvisioning ADOPTER and UNRELATED from BEFORE (v500)...\n");
    await withThrowaway(prisma, ADOPTER, "Audit Batch Adopter", async (adopterId) => {
      provision(ADOPTER, ["--version", String(BEFORE_VERSION)]);

      await withThrowaway(prisma, UNRELATED, "Audit Batch Unrelated Tenant", async (unrelatedId) => {
        provision(UNRELATED, ["--version", String(BEFORE_VERSION)]);

        console.log("\n§0 — snapshot UNRELATED before any ADOPTER adoption\n");
        const unrelatedBefore: Record<string, ServiceSnap> = {};
        for (const slug of SERVICE_SLUGS) unrelatedBefore[slug] = await snapshotLiveService(prisma, unrelatedId, slug);

        console.log("\n§1 — approve ADOPTER's pricing/components for the resolver proof\n");
        await approveAdopterPricingSettings(prisma, adopterId);
        await approveAdopterComponents(prisma, adopterId);
        await approveSwitchedSourcePriceModifiers(prisma, adopterId);
        await approveService(prisma, adopterId, "new-ceiling-light", 37500, 25000);

        console.log("\n§2 — real resolveRoute price on the BEFORE tree (double-charge expected)\n");
        const beforePriceCents = await priceCeilingLightPath(prisma, adopterId);
        console.log(`  BEFORE price for the test path: $${(beforePriceCents / 100).toFixed(2)}`);

        console.log("\n§3 — assert the exact offered change set (before any adoption)\n");
        const EXPECTED: Record<string, string[]> = {
          "new-ceiling-light": ["existing_light_source/no"],
          "new-ceiling-fan": ["existing_light_source/no"],
          "replace-standard-outlet": [
            "device_replacement_reason/works_upgrading",
            "device_replacement_reason/intermittent",
            "device_replacement_reason/damaged",
          ],
          "dedicated-120v-circuit-outlet": ["dedicated_distance/under_25", "dedicated_distance/25_to_50"],
          "dishwasher-electrical": ["appliance_power_present"],
        };
        let totalExpected = 0;
        for (const [slug, expectedIds] of Object.entries(EXPECTED)) {
          const changes = status(slug);
          const actualIds = changes.filter((c) => c.kind !== "baseline-missing" && c.kind !== "question-added" && c.kind !== "option-added").map((c) => c.id).sort();
          ok(deepEqual(actualIds, [...expectedIds].sort()), `${slug}: --status reports exactly ${JSON.stringify(expectedIds)}, got ${JSON.stringify(actualIds)}`);
          ok(changes.every((c) => !isConflicted(c)), `${slug}: no change is reported as a conflict before any adoption`);
          totalExpected += expectedIds.length;
        }
        ok(totalExpected === 8, `exactly 8 real per-unit operations across the batch (${totalExpected})`);

        console.log("\n§4 — adopt each change, with pricing-invalidation checked after the FIRST change in every multi-change service\n");

        async function adoptAndCheckReset(slug: string, id: string): Promise<void> {
          const out = adopt(slug, id);
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

        // dedicated-120v-circuit-outlet — adopt the real one; leave 25_to_50 for the conflict test below.
        await approveService(prisma, adopterId, "dedicated-120v-circuit-outlet", 79500, null);
        await adoptAndCheckReset("dedicated-120v-circuit-outlet", "dedicated_distance/under_25");

        // dishwasher-electrical — the one wording-changed unit.
        await approveService(prisma, adopterId, "dishwasher-electrical", 27500, 19000);
        await adoptAndCheckReset("dishwasher-electrical", "appliance_power_present");

        console.log("\n§6 — no-op re-adopt: the same option adopted twice must be a genuine no-op\n");
        {
          const before = await snapshotLiveService(prisma, adopterId, "new-ceiling-light");
          const out = adopt("new-ceiling-light", "existing_light_source/no");
          ok(/no change matched/.test(out), `re-adopting "existing_light_source/no" reports no change matched (${out.trim().split("\n").pop()})`);
          const after = await snapshotLiveService(prisma, adopterId, "new-ceiling-light");
          ok(deepEqual(before, after), "re-adopting an already-adopted option left the full service snapshot byte-identical");
        }

        console.log("\n§7 — conflict protection: a simulated prior customization survives an --adopt attempt untouched\n");
        {
          const circuitService = await prisma.service.findFirstOrThrow({ where: { contractorId: adopterId, slug: "dedicated-120v-circuit-outlet" } });
          const q3 = await prisma.question.findFirstOrThrow({ where: { serviceId: circuitService.id, key: "dedicated_distance" } });
          const opt = await prisma.answerOption.findFirstOrThrow({ where: { questionId: q3.id, value: "25_to_50" } });
          // Simulate an admin who already customized this option by attaching
          // a component to it — leaves nextQuestionId untouched (still
          // pointing at dedicated_panel_location, so that question's
          // reachability is unaffected by this test), but is a real
          // structural difference from BOTH the BEFORE baseline (no
          // components) and TARGET's own fix (also no components) —
          // routableShapeEqual compares components, so this is a genuine
          // conflict against both, not an accidental match of either.
          const twentyAmp = await prisma.canonicalComponent.findUniqueOrThrow({ where: { key: "DEDICATED_CIRCUIT_20A" } });
          await prisma.answerOptionComponent.create({ data: { answerOptionId: opt.id, canonicalComponentId: twentyAmp.id } });

          await approveService(prisma, adopterId, "dedicated-120v-circuit-outlet", 79500, null);
          const beforeApprovedAt = (await prisma.service.findUniqueOrThrow({ where: { id: circuitService.id } })).publishedPriceApprovedAt;
          const before = await snapshotLiveService(prisma, adopterId, "dedicated-120v-circuit-outlet");

          const changes = status("dedicated-120v-circuit-outlet");
          const conflictReported = changes.find((c) => c.kind === "option-revised" && c.id === "dedicated_distance/25_to_50");
          ok(!!conflictReported && isConflicted(conflictReported), "dedicated_distance/25_to_50 is now reported as a CONFLICT after the simulated customization");

          const out = adopt("dedicated-120v-circuit-outlet", "dedicated_distance/25_to_50");
          ok(/SKIPPED/.test(out), `conflicted adopt of dedicated_distance/25_to_50 is skipped, not overwritten (${out.trim().split("\n").pop()})`);

          const after = await snapshotLiveService(prisma, adopterId, "dedicated-120v-circuit-outlet");
          ok(deepEqual(before, after), "the full service (all questions/options/components) is byte-identical before and after the skipped conflict adopt");
          const afterApprovedAt = (await prisma.service.findUniqueOrThrow({ where: { id: circuitService.id } })).publishedPriceApprovedAt;
          ok(deepEqual(beforeApprovedAt?.toISOString() ?? null, afterApprovedAt?.toISOString() ?? null), "the approval timestamp specifically is untouched by the skipped conflict adopt");
          ok(before.receipts.length === after.receipts.length, "no new TemplateAdoptionReceipt row was written by the skipped conflict adopt");
        }

        console.log("\n§8 — full graph comparison against TARGET, and bypassed-row unreachability from the real entry\n");
        for (const slug of SERVICE_SLUGS) {
          const skipIds = slug === "dedicated-120v-circuit-outlet" ? ["dedicated_distance/25_to_50"] : [];
          await assertFullGraphMatchesTarget(prisma, adopterId, slug, TARGET_VERSION, skipIds);
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
          ok(deepEqual((await findUnreachableQuestions(prisma, circuitSvc.id)).sort(), []),
            "dedicated-120v-circuit-outlet: dedicated_panel_location is still REACHABLE — 25_to_50 was deliberately left conflicted/unadopted, so its own CONTINUE into dedicated_panel_location remains a real, live path");
        }

        console.log("\n§9 — UNRELATED tenant is unaffected by every adoption performed above\n");
        for (const slug of SERVICE_SLUGS) {
          const after = await snapshotLiveService(prisma, unrelatedId, slug);
          ok(deepEqual(unrelatedBefore[slug], after), `UNRELATED's ${slug} is byte-identical to its pre-adoption snapshot`);
        }
      });
    });
  } finally {
    console.log("\nCleanup...\n");
    for (const v of publishedVersions) {
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
    }
    dropScratchDatabase("p2b_auditbatch_before");
    dropScratchDatabase("p2b_auditbatch_target");

    const postVersions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { version: true } });
    const postContractors = (await prisma.contractor.findMany({ select: { slug: true } })).map((c) => c.slug).sort();
    ok(deepEqual(preExistingVersions.map((v) => v.version).sort(), postVersions.map((v) => v.version).sort()),
      "electrical TemplateVersion set matches the captured pre-run baseline exactly (not just a count)");
    ok(deepEqual(preExistingContractors, postContractors), "Contractor set matches the captured pre-run baseline exactly");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

writeFileSync(FIXTURE_SEED_PATH, FIXTURE_SEED_SOURCE);
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => { try { unlinkSync(FIXTURE_SEED_PATH); } catch { /* already gone */ } });
