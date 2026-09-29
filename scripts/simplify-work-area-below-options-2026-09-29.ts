/**
 * Replace every installed `work_area_below` question with the same three
 * customer choices while preserving where that service's level-floor answer
 * continues next.
 *
 * Report-only by default. Production apply requires --apply and an exact
 * endpoint/lineage match.
 */
import { PrismaClient } from "@prisma/client";
import { workAreaBelowAnswerOptions } from "../prisma/_workAreaBelowOptions";
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
    const questions = await db.question.findMany({
      where: { key: "work_area_below" },
      select: {
        id: true,
        service: { select: { slug: true, active: true, contractor: { select: { slug: true } } } },
        options: {
          orderBy: { order: "asc" },
          select: {
            value: true, routeAction: true, nextQuestionId: true, requiredPhotoLabels: true,
            priceModifierCents: true, approvedComponentPriceCents: true,
            accessClassification: true, disclaimer: true, referencedServiceId: true,
            _count: { select: { components: true, materials: true, conditionalDisclaimers: true, photoGroups: true } },
          },
        },
      },
      orderBy: [{ service: { contractorId: "asc" } }, { service: { slug: "asc" } }],
    });
    if (questions.length === 0) throw new Error("No installed work_area_below questions were found.");

    const plans = questions.map((question) => {
      const level = question.options.find((option) =>
        ["level_floor", "open_room_level"].includes(option.value)
        && ["CONTINUE", "RESOLVE_INSTANT"].includes(option.routeAction));
      if (!level) throw new Error(`${question.service.contractor.slug}/${question.service.slug}: no safe level-floor continuation`);
      if (level.routeAction === "CONTINUE" && !level.nextQuestionId) {
        throw new Error(`${question.service.contractor.slug}/${question.service.slug}: level-floor continuation has no target`);
      }
      const review = question.options.find((option) => option.routeAction === "PHOTO_REVIEW");
      if (!review) throw new Error(`${question.service.contractor.slug}/${question.service.slug}: no photo-review branch to preserve`);

      for (const option of question.options) {
        const related = Object.values(option._count).reduce((sum, count) => sum + count, 0);
        if (option.priceModifierCents !== 0 || option.approvedComponentPriceCents !== null
            || option.accessClassification !== null || option.disclaimer !== null
            || option.referencedServiceId !== null || related !== 0) {
          throw new Error(`${question.service.contractor.slug}/${question.service.slug}: work-area option carries non-routing data`);
        }
      }

      return {
        question,
        continueOption: level.routeAction === "CONTINUE"
          ? { routeAction: "CONTINUE" as const, nextQuestionId: level.nextQuestionId as string }
          : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null },
        reviewPhotoLabels: review.requiredPhotoLabels,
      };
    });

    console.log(`WORK-AREA-BELOW OPTIONS — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const { question } of plans) {
      console.log(`  ${question.service.contractor.slug}/${question.service.slug}: ${question.options.length} → 3${question.service.active ? "" : " (inactive)"}`);
    }
    if (!apply) return console.log(`  Report only. Re-run with --apply to update ${plans.length} question(s).`);

    for (const plan of plans) {
      await db.$transaction(async (tx) => {
        await tx.answerOption.deleteMany({ where: { questionId: plan.question.id } });
        await tx.answerOption.createMany({ data: workAreaBelowAnswerOptions({
          questionId: plan.question.id,
          continueOption: plan.continueOption,
          reviewPhotoLabels: plan.reviewPhotoLabels,
        }) });
      });
    }
    console.log(`  Updated ${plans.length} installed question(s) across all contractors and services.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
