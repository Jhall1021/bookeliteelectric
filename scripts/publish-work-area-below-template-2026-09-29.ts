/**
 * Publish only the canonical `work_area_below` choice list into Electrical
 * Template v1. This intentionally does not re-extract whole services: an
 * unrelated service-level wording refusal must not prevent this already-
 * classified shared question from reaching future contractor installs.
 */
import { PrismaClient } from "@prisma/client";
import { WORK_AREA_BELOW_CHOICES } from "../prisma/_workAreaBelowOptions";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const questions = await db.templateQuestion.findMany({
      where: {
        key: "work_area_below",
        templateService: { templateVersion: { trade: "electrical", version: 1 } },
      },
      select: {
        id: true,
        templateService: { select: { key: true } },
        options: {
          orderBy: { order: "asc" },
          select: {
            value: true, routeAction: true, nextQuestionKey: true,
            requiredPhotoLabels: true, illustrationUrls: true,
            rerouteServiceKey: true, referencedServiceKey: true,
            templatePolicyDefinitionId: true,
            _count: { select: { components: true, materials: true, disclaimers: true, photoGroups: true } },
          },
        },
      },
      orderBy: { templateService: { key: "asc" } },
    });
    if (questions.length === 0) throw new Error("Electrical Template v1 has no work_area_below questions.");

    const plans = questions.map((question) => {
      const level = question.options.find((option) =>
        ["level_floor", "open_room_level"].includes(option.value)
        && ["CONTINUE", "RESOLVE_INSTANT"].includes(option.routeAction));
      if (!level) throw new Error(`${question.templateService.key}: no safe template level-floor continuation`);
      if (level.routeAction === "CONTINUE" && !level.nextQuestionKey) {
        throw new Error(`${question.templateService.key}: template continuation has no target key`);
      }
      const review = question.options.find((option) => option.routeAction === "PHOTO_REVIEW");
      if (!review) throw new Error(`${question.templateService.key}: no template photo-review branch to preserve`);
      for (const option of question.options) {
        const related = Object.values(option._count).reduce((sum, count) => sum + count, 0);
        if (option.rerouteServiceKey !== null || option.referencedServiceKey !== null
            || option.templatePolicyDefinitionId !== null || option.illustrationUrls.length !== 0
            || related !== 0) {
          throw new Error(`${question.templateService.key}: template work-area option carries non-routing data`);
        }
      }
      return { question, level, review };
    });

    console.log(`WORK-AREA-BELOW TEMPLATE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const plan of plans) console.log(`  ${plan.question.templateService.key}: ${plan.question.options.length} → 3`);
    if (!apply) return console.log(`  Report only. Re-run with --apply to update ${plans.length} template question(s).`);

    for (const { question, level, review } of plans) {
      await db.$transaction(async (tx) => {
        await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: question.id } });
        await tx.templateAnswerOption.createMany({ data: [
          {
            templateQuestionId: question.id,
            ...WORK_AREA_BELOW_CHOICES.level,
            routeAction: level.routeAction,
            nextQuestionKey: level.nextQuestionKey,
            order: 1,
            requiredPhotoLabels: [],
            photosBlockBooking: false,
            illustrationUrls: [],
          },
          {
            templateQuestionId: question.id,
            ...WORK_AREA_BELOW_CHOICES.obstructed,
            routeAction: "PHOTO_REVIEW",
            order: 2,
            requiredPhotoLabels: review.requiredPhotoLabels,
            photosBlockBooking: true,
            illustrationUrls: [],
          },
          {
            templateQuestionId: question.id,
            ...WORK_AREA_BELOW_CHOICES.unsure,
            routeAction: "PHOTO_REVIEW",
            order: 3,
            requiredPhotoLabels: review.requiredPhotoLabels,
            photosBlockBooking: true,
            illustrationUrls: [],
          },
        ] });
      });
    }
    console.log(`  Updated ${plans.length} Electrical Template v1 question(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
