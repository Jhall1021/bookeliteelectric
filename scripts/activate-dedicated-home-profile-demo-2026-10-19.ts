/**
 * Put the dedicated-circuit home profile first for the onboarding test site.
 *
 * This deliberately updates the existing tree in place. It does not rebuild
 * questions, replace option ids, or touch the Elite Electric catalog.
 * Report-only by default; pass --apply after reviewing the guarded target.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_SLUG = "dedicated-120v-circuit-outlet";

const KEYS = {
  home: "dedicated_route_access",
  equipment: "dedicated_equipment",
  amperage: "dedicated_amperage",
  fireplaceAmperage: "dedicated_fireplace_amperage",
  distance: "dedicated_distance",
  finish: "dedicated_finish_ack",
} as const;

const ORDERS = new Map<string, number>([
  [KEYS.home, 1],
  [KEYS.equipment, 2],
  [KEYS.amperage, 3],
  [KEYS.fireplaceAmperage, 4],
  [KEYS.distance, 5],
  [KEYS.finish, 6],
]);

const STANDARD_EQUIPMENT = new Set(["fridge_freezer", "sump_pump", "microwave"]);
const DIRECT_AMPERAGE = new Set(["15a_120v", "20a_120v"]);
const FIREPLACE_AMPERAGE = new Set(["15a", "20a"]);

async function loadTree(db: PrismaClient) {
  return db.service.findFirstOrThrow({
    where: {
      slug: SERVICE_SLUG,
      active: true,
      contractor: { slug: CONTRACTOR_SLUG },
    },
    select: {
      id: true,
      contractor: { select: { slug: true } },
      questions: {
        where: { key: { in: Object.values(KEYS) } },
        orderBy: { order: "asc" },
        select: {
          id: true,
          key: true,
          order: true,
          prompt: true,
          helpText: true,
          options: {
            select: {
              id: true,
              value: true,
              routeAction: true,
              nextQuestionId: true,
            },
          },
        },
      },
    },
  });
}

function indexQuestions(tree: Awaited<ReturnType<typeof loadTree>>) {
  const byKey = new Map(tree.questions.map((question) => [question.key, question]));
  for (const key of Object.values(KEYS)) assert.ok(byKey.has(key), `Missing required question ${key}`);
  return byKey;
}

function verifyTree(tree: Awaited<ReturnType<typeof loadTree>>) {
  assert.equal(tree.contractor.slug, CONTRACTOR_SLUG);
  const byKey = indexQuestions(tree);
  const home = byKey.get(KEYS.home)!;
  const equipment = byKey.get(KEYS.equipment)!;
  const amperage = byKey.get(KEYS.amperage)!;
  const fireplace = byKey.get(KEYS.fireplaceAmperage)!;
  const distance = byKey.get(KEYS.distance)!;

  assert.equal(home.order, 1);
  assert.equal(home.prompt, "Tell us about your home");
  assert.equal(
    home.helpText,
    "We’ll build the likely wire path from the home’s layout and the electrical panel location.",
  );
  for (const option of home.options.filter((candidate) => candidate.routeAction === "CONTINUE")) {
    assert.equal(option.nextQuestionId, equipment.id, `Home option ${option.value} must continue to equipment`);
  }
  for (const option of equipment.options) {
    if (STANDARD_EQUIPMENT.has(option.value)) assert.equal(option.nextQuestionId, distance.id);
    if (option.value === "electric_fireplace") assert.equal(option.nextQuestionId, fireplace.id);
    if (option.value === "knows_size") assert.equal(option.nextQuestionId, amperage.id);
  }
  for (const option of amperage.options.filter((candidate) => DIRECT_AMPERAGE.has(candidate.value))) {
    assert.equal(option.nextQuestionId, distance.id);
  }
  for (const option of fireplace.options.filter((candidate) => FIREPLACE_AMPERAGE.has(candidate.value))) {
    assert.equal(option.nextQuestionId, distance.id);
  }
  for (const [key, order] of ORDERS) assert.equal(byKey.get(key)?.order, order, `${key} has the wrong order`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT
    || identity.lineage !== PRODUCTION_LINEAGE
    || identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const before = await loadTree(db);
    const byKey = indexQuestions(before);
    const home = byKey.get(KEYS.home)!;
    const equipment = byKey.get(KEYS.equipment)!;
    const amperage = byKey.get(KEYS.amperage)!;
    const fireplace = byKey.get(KEYS.fireplaceAmperage)!;
    const distance = byKey.get(KEYS.distance)!;

    console.log(`DEDICATED HOME PROFILE DEMO — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${CONTRACTOR_SLUG}/${SERVICE_SLUG}`);
    console.log(`  database: ${identity.endpoint}`);
    console.log("  change: home profile first, then equipment, then one tailored distance measurement");
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded test-site update.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const [key, order] of ORDERS) {
        await tx.question.update({ where: { id: byKey.get(key)!.id }, data: { order } });
      }
      await tx.question.update({
        where: { id: home.id },
        data: {
          prompt: "Tell us about your home",
          helpText: "We’ll build the likely wire path from the home’s layout and the electrical panel location.",
        },
      });
      await tx.answerOption.updateMany({
        where: { questionId: home.id, routeAction: "CONTINUE" },
        data: { nextQuestionId: equipment.id },
      });
      await tx.answerOption.updateMany({
        where: { questionId: equipment.id, value: { in: [...STANDARD_EQUIPMENT] } },
        data: { nextQuestionId: distance.id },
      });
      await tx.answerOption.updateMany({
        where: { questionId: equipment.id, value: "electric_fireplace" },
        data: { nextQuestionId: fireplace.id },
      });
      await tx.answerOption.updateMany({
        where: { questionId: equipment.id, value: "knows_size" },
        data: { nextQuestionId: amperage.id },
      });
      await tx.answerOption.updateMany({
        where: { questionId: amperage.id, value: { in: [...DIRECT_AMPERAGE] } },
        data: { nextQuestionId: distance.id },
      });
      await tx.answerOption.updateMany({
        where: { questionId: fireplace.id, value: { in: [...FIREPLACE_AMPERAGE] } },
        data: { nextQuestionId: distance.id },
      });
    }, { timeout: 120000 });

    verifyTree(await loadTree(db));
    console.log("  Published and verified for the onboarding test site only.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
