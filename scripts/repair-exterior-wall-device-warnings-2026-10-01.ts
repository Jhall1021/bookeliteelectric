/**
 * Restore the exterior-wall contingency on the active outlet tree and add the
 * same narrowly scoped qualification to a new switch and a new wall sconce.
 *
 * Report only by default. Pass --apply to update the guarded production
 * database for Elite and the electrical onboarding test contractor.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  EXTERIOR_WALL_CONTINGENCY_TEXT,
  EXTERIOR_WALL_DISCLAIMER_KEYS,
  EXTERIOR_WALL_QUESTION_HELP,
} from "../lib/electrical/exteriorWallContingency";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "../prisma/_moduleHelpers";
import { OUTLET_V2_KEYS } from "../prisma/seed-new-outlet-v2";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const LIGHTING_SLUGS = [
  "new-ceiling-light",
  "new-wall-sconce",
  "recessed-lighting",
  "new-exterior-lighting-locations",
] as const;
const PHOTOS = [
  "A wide photo showing the existing control or power source and the proposed new location",
  "A photo showing the wall or ceiling along the proposed wiring route",
];

type DisclaimerDefinition = {
  key: string;
  name: string;
  description: string;
  accessClass: "ACCESSIBLE" | null;
  text: string;
};

const DEFINITIONS: DisclaimerDefinition[] = [
  {
    key: EXTERIOR_WALL_DISCLAIMER_KEYS.outlet,
    name: "Exterior wall contingency — new outlet",
    description: "An exterior wall can turn an otherwise accessible new-outlet route into a finished-wall route.",
    accessClass: "ACCESSIBLE",
    text: EXTERIOR_WALL_CONTINGENCY_TEXT,
  },
  {
    key: EXTERIOR_WALL_DISCLAIMER_KEYS.switch,
    name: "Exterior wall contingency — switch leg",
    description: "An exterior wall can turn an otherwise accessible new-switch route into a finished-wall route.",
    accessClass: null,
    text: EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  },
  {
    key: EXTERIOR_WALL_DISCLAIMER_KEYS.wallSconce,
    name: "Exterior wall contingency — new wall sconce",
    description: "An exterior wall can turn an otherwise accessible new-wall-sconce route into a finished-wall route.",
    accessClass: "ACCESSIBLE",
    text: EXTERIOR_WALL_CONTINGENCY_TEXT,
  },
];

async function ensureDisclaimer(db: PrismaClient, contractorId: string, definition: DisclaimerDefinition) {
  const canonical = await db.canonicalDisclaimer.upsert({
    where: { key: definition.key },
    update: { name: definition.name, description: definition.description, accessClass: definition.accessClass },
    create: { key: definition.key, name: definition.name, description: definition.description, accessClass: definition.accessClass },
    select: { id: true },
  });
  return db.contractorDisclaimer.upsert({
    where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
    update: { text: definition.text },
    create: { contractorId, canonicalDisclaimerId: canonical.id, text: definition.text },
    select: { id: true },
  });
}

async function attach(db: PrismaClient, answerOptionId: string, contractorDisclaimerId: string) {
  await db.answerOptionDisclaimer.upsert({
    where: { answerOptionId_contractorDisclaimerId: { answerOptionId, contractorDisclaimerId } },
    update: { order: 0 },
    create: { answerOptionId, contractorDisclaimerId, order: 0 },
  });
}

async function repairOutlet(db: PrismaClient, contractorId: string, disclaimerId: string) {
  const service = await db.service.findUnique({
    where: { contractorId_slug: { contractorId, slug: "new-120v-outlet" } }, select: { id: true },
  });
  if (!service) return "missing";
  const questions = await db.question.findMany({
    where: { serviceId: service.id, key: { in: [
      OUTLET_V2_KEYS.accessibleExterior,
      OUTLET_V2_KEYS.atticExterior,
      OUTLET_V2_KEYS.atticWindow,
      OUTLET_V2_KEYS.exteriorInaccessibleAck,
    ] } },
    select: { id: true, key: true, options: { select: { id: true, value: true } } },
  });
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const exterior = byKey.get(OUTLET_V2_KEYS.accessibleExterior)?.options.find((option) => option.value === "exterior");
  const atticExterior = byKey.get(OUTLET_V2_KEYS.atticExterior)?.options.find((option) => option.value === "exterior");
  assert.ok(exterior && atticExterior, "active outlet exterior-wall answers are missing");

  await db.answerOptionDisclaimer.deleteMany({
    where: { contractorDisclaimerId: disclaimerId, answerOption: { question: { serviceId: service.id } } },
  });
  await attach(db, exterior.id, disclaimerId);
  await attach(db, atticExterior.id, disclaimerId);
  return "updated";
}

async function repairLightingService(
  db: PrismaClient,
  contractorId: string,
  slug: typeof LIGHTING_SLUGS[number],
  switchDisclaimerId: string,
  sconceDisclaimerId: string,
) {
  const service = await db.service.findUnique({
    where: { contractorId_slug: { contractorId, slug } }, select: { id: true },
  });
  if (!service) return "missing";
  const questions = await db.question.findMany({
    where: { serviceId: service.id }, select: { id: true, key: true, order: true },
  });
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const switchToFixture = byKey.get("extension_switch_to_fixture_feet");
  const height = byKey.get("fixture_height");
  const access = byKey.get("extension_route_access");
  if (!switchToFixture || !height || !access) return "legacy-skipped";

  for (const [key, order] of [
    ["fixture_height", 9],
    ["work_area_below", 10],
    ["recessed_light_count", 11],
    ["extension_route_access", 12],
    ["extension_route_surface", 14],
    ["extension_route_clear", 15],
  ] as const) {
    const question = byKey.get(key);
    if (question) await db.question.update({ where: { id: question.id }, data: { order } });
  }

  const switchExterior = await upsertQuestion(db, service.id, {
    key: "extension_new_switch_exterior_wall",
    prompt: "Is the new switch going on an exterior wall?",
    helpText: EXTERIOR_WALL_QUESTION_HELP,
    order: 8,
  });
  await db.answerOption.updateMany({
    where: { questionId: switchToFixture.id, value: "__number__" },
    data: { routeAction: "CONTINUE", nextQuestionId: switchExterior.id },
  });
  await db.answerOption.createMany({ data: [
    { questionId: switchExterior.id, label: "No — it is an interior wall", value: "interior", routeAction: "CONTINUE", nextQuestionId: height.id, order: 1, requiredPhotoLabels: [] },
    { questionId: switchExterior.id, label: "Yes — it is an exterior wall", value: "exterior", routeAction: "CONTINUE", nextQuestionId: height.id, order: 2, requiredPhotoLabels: [] },
    { questionId: switchExterior.id, label: "I'm not sure", value: "unsure", routeAction: "CONTINUE", nextQuestionId: height.id, order: 3, requiredPhotoLabels: [] },
  ] });
  await db.answerOptionDisclaimer.deleteMany({
    where: { contractorDisclaimerId: switchDisclaimerId, answerOption: { questionId: switchExterior.id } },
  });
  for (const answer of await db.answerOption.findMany({
    where: { questionId: switchExterior.id, value: "exterior" }, select: { id: true },
  })) await attach(db, answer.id, switchDisclaimerId);

  if (slug === "new-wall-sconce") {
    const sconceExterior = await upsertQuestion(db, service.id, {
      key: "extension_sconce_exterior_wall",
      prompt: "Is the new wall sconce going on an exterior wall?",
      helpText: EXTERIOR_WALL_QUESTION_HELP,
      order: 13,
    });
    await db.answerOption.updateMany({
      where: { questionId: access.id, value: "accessible" },
      data: { routeAction: "CONTINUE", nextQuestionId: sconceExterior.id, approvedComponentPriceCents: 0 },
    });
    await db.answerOption.createMany({ data: [
      { questionId: sconceExterior.id, label: "No — it is an interior wall", value: "interior", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: PHOTOS },
      { questionId: sconceExterior.id, label: "Yes — it is an exterior wall", value: "exterior", routeAction: "RESOLVE_ADJUSTED", order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: sconceExterior.id, label: "I'm not sure", value: "unsure", routeAction: "RESOLVE_ADJUSTED", order: 3, requiredPhotoLabels: PHOTOS },
    ] });
    await db.answerOptionDisclaimer.deleteMany({
      where: { contractorDisclaimerId: sconceDisclaimerId, answerOption: { questionId: sconceExterior.id } },
    });
    for (const answer of await db.answerOption.findMany({
      where: { questionId: sconceExterior.id, value: "exterior" }, select: { id: true },
    })) await attach(db, answer.id, sconceDisclaimerId);
  }

  assert.deepEqual(await findDanglingReferences(db, service.id), []);
  assert.deepEqual(await findUnreachableQuestions(db, service.id), []);
  return "updated";
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
      console.log(`${contractorSlug}: outlet + new-switch branches + wall sconce ${apply ? "will be updated" : "need inspection/update"}`);
      if (!apply) continue;
      const disclaimerIds = new Map<string, string>();
      for (const definition of DEFINITIONS) {
        const disclaimer = await ensureDisclaimer(db, contractor.id, definition);
        disclaimerIds.set(definition.key, disclaimer.id);
      }
      console.log(`  outlet: ${await repairOutlet(db, contractor.id, disclaimerIds.get(EXTERIOR_WALL_DISCLAIMER_KEYS.outlet)!)}`);
      for (const slug of LIGHTING_SLUGS) {
        const result = await repairLightingService(
          db,
          contractor.id,
          slug,
          disclaimerIds.get(EXTERIOR_WALL_DISCLAIMER_KEYS.switch)!,
          disclaimerIds.get(EXTERIOR_WALL_DISCLAIMER_KEYS.wallSconce)!,
        );
        console.log(`  ${slug}: ${result}`);
      }
    }
    console.log(apply ? "Exterior-wall warnings applied." : "Report only. Re-run with --apply to publish the guarded update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
