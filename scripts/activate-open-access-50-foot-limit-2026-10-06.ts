/**
 * Standardize the shared open-access route module:
 *   1–50 feet  -> instant pricing
 *   over 50    -> blocking photo review
 *   unknown    -> blocking photo review
 *
 * The question retains a 300-foot input domain so a homeowner can enter the
 * real distance and receive the review outcome instead of a validation error.
 * Report-only by default; pass --apply after the production identity guard.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import {
  ACCESSIBLE_BOUNDS,
  ACCESSIBLE_KEYS,
  OPEN_ACCESS_INSTANT_MAX_FEET,
} from "../prisma/_concealedRouteModules";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["elite-electric", "electrical-onboarding-test"] as const;
const REVIEW_PHOTOS = ["A photo of the open space the wiring will run through"];

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const questions = await db.question.findMany({
      where: {
        key: ACCESSIBLE_KEYS.feet,
        service: { active: true, contractor: { slug: { in: [...CONTRACTOR_SLUGS] } } },
      },
      select: {
        id: true,
        numberMin: true,
        numberMax: true,
        service: { select: { slug: true, contractor: { select: { slug: true, name: true } } } },
        options: { select: { id: true, value: true, routeAction: true } },
      },
      orderBy: [{ service: { contractor: { slug: "asc" } } }, { service: { slug: "asc" } }],
    });
    assert.ok(questions.length > 0, "no active shared open-access questions found");

    const templateQuestions = await db.templateQuestion.findMany({
      where: {
        key: ACCESSIBLE_KEYS.feet,
        templateService: { templateVersion: { trade: "electrical" } },
      },
      select: {
        id: true,
        templateService: { select: { key: true, templateVersion: { select: { version: true } } } },
        options: { select: { id: true, value: true, routeAction: true } },
      },
      orderBy: [{ templateService: { templateVersion: { version: "desc" } } }, { templateService: { key: "asc" } }],
    });
    assert.ok(templateQuestions.length > 0, "no electrical-template open-access questions found");

    console.log(`OPEN ACCESS 50-FOOT LIMIT — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const question of questions) {
      console.log(`  ${question.service.contractor.name}/${question.service.slug}: ${question.numberMin}–${question.numberMax} feet`);
    }
    console.log(`  new policy: 1–${OPEN_ACCESS_INSTANT_MAX_FEET} feet instant; longer or unknown routes reviewed`);
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded update.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const question of questions) {
        const instant = question.options.find((option) => option.value === "__number__");
        const unknown = question.options.find((option) => option.value === NUMERIC_UNKNOWN)
          ?? question.options.find((option) => option.value === "unsure");
        assert.ok(instant, `${question.service.contractor.slug}/${question.service.slug}: missing numeric option`);
        assert.ok(unknown, `${question.service.contractor.slug}/${question.service.slug}: missing unknown option`);

        await tx.question.update({
          where: { id: question.id },
          data: { numberMin: ACCESSIBLE_BOUNDS.min, numberMax: ACCESSIBLE_BOUNDS.max, numberAllowsDecimal: true },
        });
        await tx.answerOption.deleteMany({ where: { questionId: question.id, value: "over_50" } });
        await tx.answerOption.update({
          where: { id: instant.id },
          data: {
            label: "Route length in feet",
            order: 1,
            routeAction: "RESOLVE_INSTANT",
            nextQuestionId: null,
            photosBlockBooking: false,
            requiredPhotoLabels: [],
            numberAtLeast: ACCESSIBLE_BOUNDS.min,
            numberAtMost: OPEN_ACCESS_INSTANT_MAX_FEET,
            numberAtLeastExclusive: false,
          },
        });
        await tx.answerOption.create({
          data: {
            questionId: question.id,
            label: `More than ${OPEN_ACCESS_INSTANT_MAX_FEET} feet`,
            value: "over_50",
            order: 2,
            routeAction: "PHOTO_REVIEW",
            photosBlockBooking: true,
            requiredPhotoLabels: REVIEW_PHOTOS,
            numberAtLeast: OPEN_ACCESS_INSTANT_MAX_FEET,
            numberAtLeastExclusive: true,
            numberAtMost: ACCESSIBLE_BOUNDS.max,
          },
        });
        await tx.answerOption.update({
          where: { id: unknown.id },
          data: {
            value: NUMERIC_UNKNOWN,
            label: "I'm not sure",
            order: 99,
            routeAction: "PHOTO_REVIEW",
            nextQuestionId: null,
            photosBlockBooking: true,
            requiredPhotoLabels: REVIEW_PHOTOS,
            numberAtLeast: null,
            numberAtMost: null,
            numberAtLeastExclusive: false,
          },
        });
      }

      for (const question of templateQuestions) {
        const instant = question.options.find((option) => option.value === "__number__");
        const unknown = question.options.find((option) => option.value === NUMERIC_UNKNOWN)
          ?? question.options.find((option) => option.value === "unsure");
        assert.ok(instant, `template ${question.templateService.key}: missing numeric option`);
        assert.ok(unknown, `template ${question.templateService.key}: missing unknown option`);

        await tx.templateQuestion.update({
          where: { id: question.id },
          data: { numberMin: ACCESSIBLE_BOUNDS.min, numberMax: ACCESSIBLE_BOUNDS.max, numberAllowsDecimal: true },
        });
        await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: question.id, value: "over_50" } });
        await tx.templateAnswerOption.update({
          where: { id: instant.id },
          data: {
            label: "Route length in feet",
            labelPattern: null,
            templatePolicyDefinitionId: null,
            order: 1,
            routeAction: "RESOLVE_INSTANT",
            nextQuestionKey: null,
            photosBlockBooking: false,
            requiredPhotoLabels: [],
            numberAtLeast: ACCESSIBLE_BOUNDS.min,
            numberAtMost: OPEN_ACCESS_INSTANT_MAX_FEET,
            numberAtLeastExclusive: false,
          },
        });
        await tx.templateAnswerOption.create({
          data: {
            templateQuestionId: question.id,
            label: `More than ${OPEN_ACCESS_INSTANT_MAX_FEET} feet`,
            value: "over_50",
            order: 2,
            routeAction: "PHOTO_REVIEW",
            photosBlockBooking: true,
            requiredPhotoLabels: REVIEW_PHOTOS,
            illustrationUrls: [],
            numberAtLeast: OPEN_ACCESS_INSTANT_MAX_FEET,
            numberAtLeastExclusive: true,
            numberAtMost: ACCESSIBLE_BOUNDS.max,
          },
        });
        await tx.templateAnswerOption.update({
          where: { id: unknown.id },
          data: {
            value: NUMERIC_UNKNOWN,
            label: "I'm not sure",
            labelPattern: null,
            templatePolicyDefinitionId: null,
            order: 99,
            routeAction: "PHOTO_REVIEW",
            nextQuestionKey: null,
            photosBlockBooking: true,
            requiredPhotoLabels: REVIEW_PHOTOS,
            numberAtLeast: null,
            numberAtMost: null,
            numberAtLeastExclusive: false,
          },
        });
      }
    }, { timeout: 120000 });

    const published = await db.question.findMany({
      where: { id: { in: questions.map((question) => question.id) } },
      select: {
        id: true,
        options: { select: { value: true, routeAction: true, numberAtLeast: true, numberAtMost: true, numberAtLeastExclusive: true } },
      },
    });
    for (const question of published) {
      const instant = question.options.find((option) => option.value === "__number__");
      const over = question.options.find((option) => option.value === "over_50");
      const unknown = question.options.find((option) => option.value === NUMERIC_UNKNOWN);
      assert.ok(instant?.routeAction === "RESOLVE_INSTANT" && instant.numberAtLeast === 1 && instant.numberAtMost === 50);
      assert.ok(over?.routeAction === "PHOTO_REVIEW" && over.numberAtLeast === 50 && over.numberAtLeastExclusive && over.numberAtMost === 300);
      assert.equal(unknown?.routeAction, "PHOTO_REVIEW");
    }
    console.log(`  Published and verified ${questions.length} live questions and ${templateQuestions.length} template questions.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
