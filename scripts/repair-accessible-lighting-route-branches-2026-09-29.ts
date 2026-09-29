/**
 * Narrow repair for the four lighting-extension trees installed before the
 * accessible and finished route branches diverged.
 *
 * Report only by default. Pass --apply to write. The production guard is
 * intentionally exact because this script changes customer-facing routing.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const SERVICES = [
  "new-ceiling-light",
  "new-wall-sconce",
  "recessed-lighting",
  "new-exterior-lighting-locations",
] as const;

type QuestionRow = {
  id: string;
  key: string;
  order: number;
  options: { id: string; value: string; routeAction: string; nextQuestionId: string | null }[];
};

function exactlyOne<T>(rows: T[], label: string): T {
  assert.equal(rows.length, 1, `${label}: expected exactly one row, found ${rows.length}`);
  return rows[0];
}

function question(questions: QuestionRow[], key: string) {
  return exactlyOne(questions.filter((row) => row.key === key), `question ${key}`);
}

function option(questionRow: QuestionRow, value: string) {
  return exactlyOne(questionRow.options.filter((row) => row.value === value), `${questionRow.key}/${value}`);
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
      for (const serviceSlug of SERVICES) {
        const service = await db.service.findUniqueOrThrow({
          where: { contractorId_slug: { contractorId: contractor.id, slug: serviceSlug } },
          select: {
            id: true,
            questions: {
              select: {
                id: true,
                key: true,
                order: true,
                options: { select: { id: true, value: true, routeAction: true, nextQuestionId: true } },
              },
            },
          },
        });
        const questions = service.questions as QuestionRow[];
        const access = question(questions, "extension_route_access");
        const surface = question(questions, "extension_route_surface");
        const clear = question(questions, "extension_route_clear");
        const feet = question(questions, "extension_route_feet");
        const control = question(questions, "extension_control");
        const accessible = option(access, "accessible");
        const finished = option(access, "finished");
        const drywall = option(surface, "drywall");
        const unobstructed = option(clear, "clear");
        const numeric = option(feet, "__number__");

        assert.equal(accessible.routeAction, "CONTINUE");
        assert.equal(finished.routeAction, "CONTINUE");
        assert.equal(drywall.routeAction, "CONTINUE");
        assert.equal(unobstructed.routeAction, "CONTINUE");
        assert.equal(numeric.routeAction, "CONTINUE");

        const before = {
          accessible: accessible.nextQuestionId,
          finished: finished.nextQuestionId,
          surface: drywall.nextQuestionId,
          clear: unobstructed.nextQuestionId,
          feet: numeric.nextQuestionId,
        };
        const desired = {
          accessible: feet.id,
          finished: surface.id,
          surface: clear.id,
          clear: feet.id,
          feet: control.id,
        };
        const oldShape =
          before.accessible === feet.id &&
          before.finished === feet.id &&
          before.surface === clear.id &&
          before.clear === control.id &&
          before.feet === surface.id;
        const repairedShape = Object.entries(desired).every(
          ([key, value]) => before[key as keyof typeof before] === value,
        );
        assert.ok(oldShape || repairedShape, `${contractorSlug}/${serviceSlug}: unexpected route shape ${JSON.stringify(before)}`);

        if (repairedShape) {
          console.log(`${contractorSlug}/${serviceSlug}: already repaired`);
          continue;
        }
        changes++;
        console.log(`${contractorSlug}/${serviceSlug}: accessible will skip finish and obstruction questions`);
        if (!apply) continue;

        await db.$transaction([
          db.answerOption.update({ where: { id: finished.id }, data: { nextQuestionId: surface.id } }),
          db.answerOption.update({ where: { id: unobstructed.id }, data: { nextQuestionId: feet.id } }),
          db.answerOption.update({ where: { id: numeric.id }, data: { nextQuestionId: control.id } }),
          db.question.update({ where: { id: surface.id }, data: { order: 7 } }),
          db.question.update({ where: { id: clear.id }, data: { order: 8 } }),
          db.question.update({ where: { id: feet.id }, data: { order: 9 } }),
          db.question.update({ where: { id: control.id }, data: { order: 10 } }),
        ]);
        assert.deepEqual(await findDanglingReferences(db, service.id), []);
        assert.deepEqual(await findUnreachableQuestions(db, service.id), []);
      }
    }
    console.log(`${apply ? "applied" : "report"}: ${changes} lighting route tree(s) need repair`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
