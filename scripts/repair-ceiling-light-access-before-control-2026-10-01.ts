/**
 * Put route access ahead of the power/control choice for new ceiling lights.
 *
 * Report only by default. Pass --apply to update the two production-lineage
 * electrical catalogs. The shape guard refuses any tree other than the known
 * source-first shape or the intended repaired shape.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const PHOTOS = [
  "A wide photo showing the existing control or power source and the proposed new location",
  "A photo showing the wall or ceiling along the proposed wiring route",
];

type OptionRow = {
  id: string;
  value: string;
  routeAction: string;
  nextQuestionId: string | null;
};

type QuestionRow = {
  id: string;
  key: string;
  options: OptionRow[];
};

function exactlyOne<T>(rows: T[], label: string): T {
  assert.equal(rows.length, 1, `${label}: expected one row, found ${rows.length}`);
  return rows[0];
}

function question(rows: QuestionRow[], key: string) {
  return exactlyOne(rows.filter((row) => row.key === key), `question ${key}`);
}

function option(row: QuestionRow, value: string) {
  return exactlyOne(row.options.filter((candidate) => candidate.value === value), `${row.key}/${value}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }

  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    let changes = 0;
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUniqueOrThrow({
        where: { slug: contractorSlug },
        select: { id: true },
      });
      const service = await db.service.findUniqueOrThrow({
        where: { contractorId_slug: { contractorId: contractor.id, slug: "new-ceiling-light" } },
        select: {
          id: true,
          questions: {
            select: {
              id: true,
              key: true,
              options: { select: { id: true, value: true, routeAction: true, nextQuestionId: true } },
            },
          },
        },
      });
      const questions = service.questions as QuestionRow[];
      const byKey = new Map(questions.map((row) => [row.key, row]));
      if (!byKey.has("extension_control") || !byKey.has("extension_existing_location")) {
        console.log(`${contractorSlug}/new-ceiling-light: legacy tree skipped`);
        continue;
      }
      const existing = question(questions, "extension_existing_location");
      const height = question(questions, "fixture_height");
      const below = question(questions, "work_area_below");
      const access = question(questions, "extension_route_access");
      const surface = question(questions, "extension_route_surface");
      const clear = question(questions, "extension_route_clear");
      const control = question(questions, "extension_control");
      const existingSwitchFeet = question(questions, "extension_existing_switch_feet");
      const existingFixtureFeet = question(questions, "extension_existing_fixture_feet");
      const powerToSwitchFeet = question(questions, "extension_power_to_switch_feet");
      const switchToFixtureFeet = question(questions, "extension_switch_to_fixture_feet");
      const switchExterior = question(questions, "extension_new_switch_exterior_wall");

      const existingNo = option(existing, "no");
      const accessible = option(access, "accessible");
      const clearRoute = option(clear, "clear");
      const existingSwitchNumber = option(existingSwitchFeet, "__number__");
      const existingFixtureNumber = option(existingFixtureFeet, "__number__");
      const switchToFixtureNumber = option(switchToFixtureFeet, "__number__");
      const switchExteriorOptions = ["interior", "exterior", "unsure"].map((value) => option(switchExterior, value));

      const sourceFirst =
        existingNo.nextQuestionId === control.id &&
        existingSwitchNumber.nextQuestionId === height.id &&
        existingFixtureNumber.nextQuestionId === height.id &&
        accessible.routeAction === "RESOLVE_ADJUSTED" &&
        clearRoute.routeAction === "RESOLVE_ADJUSTED" &&
        switchExteriorOptions.every((answer) => answer.nextQuestionId === height.id);
      const accessFirst =
        existingNo.nextQuestionId === height.id &&
        accessible.routeAction === "CONTINUE" && accessible.nextQuestionId === control.id &&
        clearRoute.routeAction === "CONTINUE" && clearRoute.nextQuestionId === control.id &&
        existingSwitchNumber.routeAction === "RESOLVE_ADJUSTED" && existingSwitchNumber.nextQuestionId === null &&
        existingFixtureNumber.routeAction === "RESOLVE_ADJUSTED" && existingFixtureNumber.nextQuestionId === null &&
        switchExteriorOptions.every((answer) => answer.routeAction === "RESOLVE_ADJUSTED" && answer.nextQuestionId === null);
      assert.ok(sourceFirst || accessFirst, `${contractorSlug}: unexpected new-ceiling-light route shape`);
      assert.equal(option(surface, "drywall").nextQuestionId, clear.id);
      assert.equal(option(below, "level_floor").nextQuestionId, access.id);
      assert.equal(switchToFixtureNumber.nextQuestionId, switchExterior.id);

      if (accessFirst) {
        console.log(`${contractorSlug}/new-ceiling-light: already asks access before control`);
        continue;
      }
      changes++;
      console.log(`${contractorSlug}/new-ceiling-light: will move access before control and measurement`);
      if (!apply) continue;

      await db.$transaction([
        db.answerOption.update({ where: { id: existingNo.id }, data: { nextQuestionId: height.id } }),
        db.answerOption.update({ where: { id: accessible.id }, data: {
          routeAction: "CONTINUE", nextQuestionId: control.id, photosBlockBooking: false,
          requiredPhotoLabels: [], approvedComponentPriceCents: 0,
        } }),
        db.answerOption.update({ where: { id: clearRoute.id }, data: {
          routeAction: "CONTINUE", nextQuestionId: control.id, photosBlockBooking: false,
          requiredPhotoLabels: [], approvedComponentPriceCents: 0,
        } }),
        db.answerOption.update({ where: { id: existingSwitchNumber.id }, data: {
          routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, photosBlockBooking: false,
          requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null,
        } }),
        db.answerOption.update({ where: { id: existingFixtureNumber.id }, data: {
          routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, photosBlockBooking: false,
          requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null,
        } }),
        ...switchExteriorOptions.map((answer) => db.answerOption.update({ where: { id: answer.id }, data: {
          routeAction: "RESOLVE_ADJUSTED" as const, nextQuestionId: null, photosBlockBooking: false,
          requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null,
        } })),
        db.question.update({ where: { id: height.id }, data: { order: 1 } }),
        db.question.update({ where: { id: below.id }, data: { order: 2 } }),
        db.question.update({ where: { id: access.id }, data: { order: 3 } }),
        db.question.update({ where: { id: surface.id }, data: { order: 4 } }),
        db.question.update({ where: { id: clear.id }, data: { order: 5 } }),
        db.question.update({ where: { id: control.id }, data: { order: 6 } }),
        db.question.update({ where: { id: existingSwitchFeet.id }, data: { order: 7 } }),
        db.question.update({ where: { id: existingFixtureFeet.id }, data: { order: 8 } }),
        db.question.update({ where: { id: powerToSwitchFeet.id }, data: { order: 9 } }),
        db.question.update({ where: { id: switchToFixtureFeet.id }, data: { order: 10 } }),
        db.question.update({ where: { id: switchExterior.id }, data: { order: 11 } }),
      ]);
      assert.deepEqual(await findDanglingReferences(db, service.id), []);
      assert.deepEqual(await findUnreachableQuestions(db, service.id), []);
    }
    console.log(`${apply ? "applied" : "report"}: ${changes} ceiling-light tree(s) need access-first routing`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
