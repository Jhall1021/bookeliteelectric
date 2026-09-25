/**
 * Promote reviewed electrical policy answers to Price2Book catalog standards.
 *
 * Report-only by default. --apply updates every installed electrical catalog
 * row on the designated production lineage and clears obsolete policy
 * blockers. It does not approve, publish, activate, or price a service.
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_PREPARED_POLICY_DEFAULTS } from "../lib/electrical/preparedPolicyDefaults";
import { ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS } from "../lib/electrical/catalogPolicyStandards";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const TARGET_CONTRACTOR_SLUG = "electrical-onboarding-test";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: TARGET_CONTRACTOR_SLUG },
      select: { id: true, name: true },
    });
    const keys = [...ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS];
    const [rows, blockedServices, routeQuestions] = await Promise.all([
      db.contractorPolicyValue.findMany({
        where: { contractorId: contractor.id, key: { in: keys } },
        select: { id: true, contractorId: true, key: true, boundaries: true, choice: true, measurement: true },
      }),
      db.service.findMany({
        where: { contractorId: contractor.id, unresolvedPolicyKeys: { isEmpty: false } },
        select: { id: true, unresolvedPolicyKeys: true },
      }),
      db.question.findMany({
        where: { service: { contractorId: contractor.id }, key: { in: ["new-ethernet-line_distance", "new-coax-line_distance", "flood_camera_height"] } },
        select: { key: true, service: { select: { slug: true, contractor: { select: { slug: true } } } }, options: { select: { value: true, label: true, routeAction: true }, orderBy: { order: "asc" } } },
      }),
    ]);

    const affectedServices = blockedServices.filter((service) =>
      service.unresolvedPolicyKeys.some((key) => ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has(key)));
    console.log(`ELECTRICAL CATALOG POLICY STANDARDS — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${TARGET_CONTRACTOR_SLUG})`);
    console.log(`  policy rows: ${rows.length}`);
    console.log(`  services carrying obsolete standard-policy blockers: ${affectedServices.length}`);
    for (const question of routeQuestions) {
      console.log(`  route ${question.service.contractor.slug}/${question.service.slug}/${question.key}: ${question.options.map((option) => `${option.value}=${option.label} [${option.routeAction}]`).join(" | ")}`);
    }
    if (!apply) return;

    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const answer = ELECTRICAL_PREPARED_POLICY_DEFAULTS[row.key];
        if (!answer) throw new Error(`No prepared standard value exists for ${row.key}`);
        await tx.contractorPolicyValue.update({
          where: { id: row.id },
          data: {
            boundaries: "boundaries" in answer ? answer.boundaries : [],
            choice: "choice" in answer ? answer.choice : null,
            measurement: "measurement" in answer ? answer.measurement : null,
            resolvedAt: new Date(),
          },
        });
      }
      for (const service of affectedServices) {
        await tx.service.update({
          where: { id: service.id },
          data: { unresolvedPolicyKeys: service.unresolvedPolicyKeys.filter((key) => !ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has(key)) },
        });
      }

      await tx.templatePolicyDefinition.updateMany({
        where: { key: "data_cable_run.breakpoints" },
        data: { boundaryCount: 3, prompt: "Prepared low-voltage route bands" },
      });
      await tx.templatePolicyDefinition.updateMany({
        where: { key: "exterior_mount_height.breakpoints" },
        data: { boundaryCount: 1, prompt: "Prepared exterior mounting height" },
      });

      const lowVoltageServices = await tx.service.findMany({
        where: { contractorId: contractor.id, slug: { in: ["new-ethernet-line", "new-coax-line"] } },
        select: { id: true, slug: true },
      });
      for (const service of lowVoltageServices) {
        await tx.service.update({
          where: { id: service.id },
          data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" },
        });
        const question = await tx.question.findFirst({
          where: { serviceId: service.id, key: `${service.slug}_distance` },
          select: { id: true },
        });
        if (!question) continue;
        await tx.answerOption.deleteMany({ where: { questionId: question.id } });
        await tx.answerOption.createMany({ data: [
          { questionId: question.id, value: "under_25", label: "25 feet or less", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false, approvedComponentPriceCents: 0 },
          { questionId: question.id, value: "26_to_50", label: "26 to 50 feet", routeAction: "RESOLVE_ADJUSTED", order: 2, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false, approvedComponentPriceCents: 0 },
          { questionId: question.id, value: "51_to_75", label: "51 to 75 feet", routeAction: "RESOLVE_ADJUSTED", order: 3, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false, approvedComponentPriceCents: 0 },
          { questionId: question.id, value: "over_75_or_unsure", label: "More than 75 feet, or I'm not sure", routeAction: "PHOTO_REVIEW", order: 4, requiredPhotoLabels: ["Where the line starts — the router, modem, or the existing cable box", "Where you'd like the new jack to come out", "The rooms in between, and the ceiling or floor between them if you can"], illustrationUrls: [], photosBlockBooking: true, approvedComponentPriceCents: null },
        ] });
      }
      await tx.templateService.updateMany({
        where: { key: { in: ["new-ethernet-line", "new-coax-line"] }, templateVersion: { trade: "electrical" } },
        data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" },
      });
      const lowVoltageTemplateQuestions = await tx.templateQuestion.findMany({
        where: { templateService: { key: { in: ["new-ethernet-line", "new-coax-line"] }, templateVersion: { trade: "electrical" } } },
        select: { id: true, key: true },
      });
      for (const question of lowVoltageTemplateQuestions.filter((row) => row.key.endsWith("_distance"))) {
        await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: question.id } });
        await tx.templateAnswerOption.createMany({ data: [
          { templateQuestionId: question.id, value: "under_25", label: "25 feet or less", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false },
          { templateQuestionId: question.id, value: "26_to_50", label: "26 to 50 feet", routeAction: "RESOLVE_ADJUSTED", order: 2, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false },
          { templateQuestionId: question.id, value: "51_to_75", label: "51 to 75 feet", routeAction: "RESOLVE_ADJUSTED", order: 3, requiredPhotoLabels: [], illustrationUrls: [], photosBlockBooking: false },
          { templateQuestionId: question.id, value: "over_75_or_unsure", label: "More than 75 feet, or I'm not sure", routeAction: "PHOTO_REVIEW", order: 4, requiredPhotoLabels: ["Where the line starts — the router, modem, or the existing cable box", "Where you'd like the new jack to come out", "The rooms in between, and the ceiling or floor between them if you can"], illustrationUrls: [], photosBlockBooking: true },
        ] });
      }

      const exteriorQuestions = await tx.question.findMany({
        where: { service: { contractorId: contractor.id }, key: "flood_camera_height" },
        select: { id: true, options: { select: { id: true, value: true }, orderBy: { order: "asc" } } },
      });
      for (const question of exteriorQuestions) {
        const standard = question.options.find((option) => option.value === "under_8") ?? question.options[0];
        const remote = question.options.find((option) => option.value === "over_12");
        const unsure = question.options.find((option) => option.value === "unsure");
        if (standard) await tx.answerOption.update({ where: { id: standard.id }, data: { value: "under_20", label: "20 feet or less", labelPattern: null, policyKey: null, order: 1 } });
        if (remote) await tx.answerOption.update({ where: { id: remote.id }, data: { value: "over_20", label: "Higher than 20 feet", labelPattern: null, policyKey: null, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2 } });
        if (unsure) await tx.answerOption.update({ where: { id: unsure.id }, data: { label: "I'm not sure", labelPattern: null, policyKey: null, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3 } });
        await tx.answerOption.deleteMany({ where: { questionId: question.id, id: { notIn: [standard?.id, remote?.id, unsure?.id].filter((id): id is string => !!id) } } });
      }
      const exteriorTemplateQuestions = await tx.templateQuestion.findMany({
        where: { key: "flood_camera_height", templateService: { templateVersion: { trade: "electrical" } } },
        select: { id: true, options: { select: { id: true, value: true }, orderBy: { order: "asc" } } },
      });
      for (const question of exteriorTemplateQuestions) {
        const standard = question.options.find((option) => option.value === "under_8") ?? question.options[0];
        const remote = question.options.find((option) => option.value === "over_12");
        const unsure = question.options.find((option) => option.value === "unsure");
        if (standard) await tx.templateAnswerOption.update({ where: { id: standard.id }, data: { value: "under_20", label: "20 feet or less", labelPattern: null, templatePolicyDefinitionId: null, order: 1 } });
        if (remote) await tx.templateAnswerOption.update({ where: { id: remote.id }, data: { value: "over_20", label: "Higher than 20 feet", labelPattern: null, templatePolicyDefinitionId: null, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2 } });
        if (unsure) await tx.templateAnswerOption.update({ where: { id: unsure.id }, data: { label: "I'm not sure", labelPattern: null, templatePolicyDefinitionId: null, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3 } });
        await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: question.id, id: { notIn: [standard?.id, remote?.id, unsure?.id].filter((id): id is string => !!id) } } });
      }
    });
    console.log("  Applied catalog standards. No service price, approval, offered state, or active state was changed.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
