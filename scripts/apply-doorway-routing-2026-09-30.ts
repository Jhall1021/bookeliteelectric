/**
 * Enable deterministic doorway pricing for the Electrical Onboarding Test
 * storefront. Report-only unless --apply is supplied.
 *
 * The application records the checkbox answer itself. This reconciliation
 * makes the installed finished-wall tree accept one standard doorway and adds
 * the TV-outlet doorway component used by the legacy published-price flow.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const TV_COMPONENT_KEY = "TV_OUTLET_FINISHED_DOORWAY_BYPASS";
const TV_DISTANCE_KEY = "tv_outlet_run_distance";
const TV_DOORWAY_KEY = `${TV_DISTANCE_KEY}_doorway`;
const REVIEW_PHOTOS = [
  "The wall where the TV is going, full height",
  "The nearest outlet on that wall",
  "A wider photo of the room",
];

const TV_COMPONENTS = [
  { key: "TV_OUTLET_RUN_ACCESSIBLE_UNDER_10", name: "TV power outlet — open route, up to 10 ft", label: "Add the power outlet behind the TV", approvedPriceCents: 13750, labor: 0.5, material: 0, minutes: 30 },
  { key: "TV_OUTLET_RUN_ACCESSIBLE_10_20", name: "TV power outlet — open route, 10 to 20 ft", label: "Add the power outlet behind the TV — longer wiring run", approvedPriceCents: 20750, labor: 0.75, material: 500, minutes: 45 },
  { key: "TV_OUTLET_RUN_FINISHED_UNDER_10", name: "TV power outlet — finished wall, up to 10 ft", label: "Add the power outlet behind the TV through finished walls", approvedPriceCents: 18750, labor: 0.75, material: 0, minutes: 45 },
  { key: "TV_OUTLET_RUN_FINISHED_10_20", name: "TV power outlet — finished wall, 10 to 20 ft", label: "Add the power outlet behind the TV through finished walls — longer wiring run", approvedPriceCents: 32250, labor: 1.25, material: 500, minutes: 75 },
  { key: TV_COMPONENT_KEY, name: "TV power outlet — finished-wall doorway bypass", label: "Route the concealed TV-outlet wiring around one doorway", approvedPriceCents: 13500, labor: 0.5, material: 700, minutes: 30 },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true, slug: true },
    });

    const obstacleQuestions = await db.question.findMany({
      where: { service: { contractorId: contractor.id }, key: "concealed_route_obstacles" },
      select: {
        id: true,
        serviceId: true,
        service: { select: { slug: true } },
        options: { where: { value: "doorway" }, select: { id: true, routeAction: true, nextQuestionId: true, photosBlockBooking: true } },
      },
    });

    let doorwayOptionsToChange = 0;
    for (const question of obstacleQuestions) {
      assert.equal(question.options.length, 1, `${question.service.slug}: expected one doorway answer`);
      const method = await db.question.findFirstOrThrow({
        where: { serviceId: question.serviceId, key: "concealed_access_method" },
        select: { id: true },
      });
      const option = question.options[0];
      const ready = option.routeAction === "CONTINUE" && option.nextQuestionId === method.id && !option.photosBlockBooking;
      if (!ready) {
        assert.equal(option.routeAction, "PHOTO_REVIEW", `${question.service.slug}: unexpected doorway action`);
        doorwayOptionsToChange++;
      }
    }

    const tv = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: "tv-installation" } },
      select: {
        id: true,
        questions: { select: { id: true, key: true, order: true } },
      },
    });
    const distanceQuestion = tv.questions.find((question) => question.key === TV_DISTANCE_KEY);
    const distanceOptions = distanceQuestion
      ? await db.answerOption.findMany({ where: { questionId: distanceQuestion.id }, select: { id: true } })
      : [];
    const existingTvComponentCount = await db.contractorComponent.count({
      where: {
        contractorId: contractor.id,
        canonicalComponent: { key: { in: TV_COMPONENTS.map((component) => component.key) } },
      },
    });

    console.log(`DOORWAY ROUTING — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint} / ${contractor.name}`);
    console.log(`  finished-wall doorway answers to make priceable: ${doorwayOptionsToChange}`);
    console.log(`  TV measured-distance flow to install: ${distanceQuestion ? "no" : "yes"}`);
    console.log(`  TV route components to add: ${TV_COMPONENTS.length - existingTvComponentCount}`);
    console.log(`  TV measured-distance options currently installed: ${distanceOptions.length}`);
    if (!apply) {
      console.log("  Report only. Re-run with --apply to update this staging contractor.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const question of obstacleQuestions) {
        const method = await tx.question.findFirstOrThrow({
          where: { serviceId: question.serviceId, key: "concealed_access_method" },
          select: { id: true },
        });
        await tx.answerOption.update({
          where: { id: question.options[0].id },
          data: {
            routeAction: "CONTINUE",
            nextQuestionId: method.id,
            photosBlockBooking: false,
            requiredPhotoLabels: [],
          },
        });
      }

      const componentIds = new Map<string, string>();
      for (const component of TV_COMPONENTS) {
        const notes = component.key === TV_COMPONENT_KEY
          ? "One standard doorway adds fourteen feet of concealed cable path and the ordinary access-opening time needed to route above the header. Drywall repair and painting remain excluded."
          : "Measured TV-outlet route allowance, selected by access class and entered distance.";
        const canonical = await tx.canonicalComponent.upsert({
          where: { key: component.key },
          update: { name: component.name, customerFacingLabel: component.label, notes, active: true },
          create: { key: component.key, name: component.name, customerFacingLabel: component.label, notes, active: true },
        });
        componentIds.set(component.key, canonical.id);
        const economics = {
          approvedPriceCents: component.approvedPriceCents,
          addFieldLaborHours: component.labor,
          addMaterialCostCents: component.material,
          addScheduleMinutes: component.minutes,
          addTechCount: 0,
          active: true,
          notes,
        };
        await tx.contractorComponent.upsert({
          where: { contractorId_canonicalComponentId: { contractorId: contractor.id, canonicalComponentId: canonical.id } },
          update: economics,
          create: { contractorId: contractor.id, canonicalComponentId: canonical.id, ...economics },
        });
      }

      const lastOrder = Math.max(...tv.questions.filter((question) => question.key !== TV_DISTANCE_KEY).map((question) => question.order));
      const qDistance = distanceQuestion
        ? await tx.question.update({
            where: { id: distanceQuestion.id },
            data: {
              prompt: "About how far is the nearest outlet from where the new outlet will go behind the TV?",
              helpText: "Measure the path the wire would follow along the walls, basement, attic, or ceiling—not a straight line across the room.",
              inputType: "NUMBER",
              numberAllowsDecimal: true,
              numberMin: 1,
              numberMax: 200,
            },
          })
        : await tx.question.create({
            data: {
              serviceId: tv.id,
              key: TV_DISTANCE_KEY,
              prompt: "About how far is the nearest outlet from where the new outlet will go behind the TV?",
              helpText: "Measure the path the wire would follow along the walls, basement, attic, or ceiling—not a straight line across the room.",
              inputType: "NUMBER",
              numberAllowsDecimal: true,
              numberMin: 1,
              numberMax: 200,
              order: lastOrder + 1,
            },
          });

      const optionDefinitions = [
        { value: "under_10", label: "Up to 10 feet", action: "RESOLVE_ADJUSTED" as const, order: 1, min: 1, max: 10, open: false },
        { value: "10_to_20", label: "More than 10 feet, up to 20 feet", action: "RESOLVE_ADJUSTED" as const, order: 2, min: 10, max: 20, open: true },
        { value: "over_20", label: "More than 20 feet", action: "PHOTO_REVIEW" as const, order: 3, min: 20, max: 200, open: true },
        { value: NUMERIC_UNKNOWN, label: "I'm not sure", action: "PHOTO_REVIEW" as const, order: 4, min: null, max: null, open: false },
      ];
      const optionIds = new Map<string, string>();
      for (const definition of optionDefinitions) {
        const existing = await tx.answerOption.findFirst({ where: { questionId: qDistance.id, value: definition.value }, select: { id: true } });
        const optionData = {
          label: definition.label,
          routeAction: definition.action,
          nextQuestionId: null,
          order: definition.order,
          requiredPhotoLabels: definition.action === "PHOTO_REVIEW" ? REVIEW_PHOTOS : [],
          photosBlockBooking: definition.action === "PHOTO_REVIEW",
          approvedComponentPriceCents: null,
          priceModifierCents: 0,
          numberAtLeast: definition.min,
          numberAtMost: definition.max,
          numberAtLeastExclusive: definition.open,
        };
        const option = existing
          ? await tx.answerOption.update({ where: { id: existing.id }, data: optionData })
          : await tx.answerOption.create({ data: { questionId: qDistance.id, value: definition.value, ...optionData } });
        optionIds.set(definition.value, option.id);
      }

      const access = await tx.question.findFirstOrThrow({ where: { serviceId: tv.id, key: "outlet_access" }, select: { id: true } });
      await tx.answerOption.updateMany({
        where: { questionId: access.id, value: "has_access" },
        data: { routeAction: "CONTINUE", nextQuestionId: qDistance.id, accessClassification: "ACCESSIBLE", priceModifierCents: 0, approvedComponentPriceCents: 0 },
      });
      await tx.answerOption.updateMany({
        where: { questionId: access.id, value: "no_access" },
        data: { accessClassification: "FINISHED", priceModifierCents: 0 },
      });

      const finishAck = await tx.question.findFirstOrThrow({ where: { serviceId: tv.id, key: "tv_finish_ack" }, select: { id: true } });
      await tx.answerOption.updateMany({
        where: { questionId: finishAck.id, value: "accepted" },
        data: { routeAction: "CONTINUE", nextQuestionId: qDistance.id, priceModifierCents: 0, approvedComponentPriceCents: 0 },
      });

      const attachments = [
        { option: "under_10", component: "TV_OUTLET_RUN_ACCESSIBLE_UNDER_10", access: "ACCESSIBLE" as const },
        { option: "under_10", component: "TV_OUTLET_RUN_FINISHED_UNDER_10", access: "FINISHED" as const },
        { option: "10_to_20", component: "TV_OUTLET_RUN_ACCESSIBLE_10_20", access: "ACCESSIBLE" as const },
        { option: "10_to_20", component: "TV_OUTLET_RUN_FINISHED_10_20", access: "FINISHED" as const },
      ];
      for (const attachment of attachments) {
        const answerOptionId = optionIds.get(attachment.option)!;
        const canonicalComponentId = componentIds.get(attachment.component)!;
        await tx.answerOptionComponent.upsert({
          where: { answerOptionId_canonicalComponentId: { answerOptionId, canonicalComponentId } },
          update: { conditionAccessClass: attachment.access, conditionAccessSlot: "PRIMARY", conditionAnswerKey: null, conditionAnswerValue: null, quantity: 1 },
          create: { answerOptionId, canonicalComponentId, conditionAccessClass: attachment.access, conditionAccessSlot: "PRIMARY", quantity: 1 },
        });
      }
      for (const optionValue of ["under_10", "10_to_20"]) {
        const answerOptionId = optionIds.get(optionValue)!;
        const canonicalComponentId = componentIds.get(TV_COMPONENT_KEY)!;
        await tx.answerOptionComponent.upsert({
          where: { answerOptionId_canonicalComponentId: { answerOptionId, canonicalComponentId } },
          update: { conditionAccessClass: "FINISHED", conditionAccessSlot: "PRIMARY", conditionAnswerKey: TV_DOORWAY_KEY, conditionAnswerValue: "yes", quantity: 1 },
          create: { answerOptionId, canonicalComponentId, conditionAccessClass: "FINISHED", conditionAccessSlot: "PRIMARY", conditionAnswerKey: TV_DOORWAY_KEY, conditionAnswerValue: "yes", quantity: 1 },
        });
      }
    });

    console.log("  Applied: standard doorway routes remain priceable and TV finished-wall doorway work is included.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
