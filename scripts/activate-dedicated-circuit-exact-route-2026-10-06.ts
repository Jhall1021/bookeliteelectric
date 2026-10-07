/**
 * Replace the dedicated-circuit distance bands with an exact measurement and
 * reduce the opening equipment screen from eight choices to five.
 *
 * Existing range option ids are retained so any attached catalog metadata
 * survives. Previously saved band answers remain price-compatible in code.
 * Report-only by default; pass --apply after the production identity guard.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["elite-electric", "electrical-onboarding-test"] as const;
const SERVICE_SLUG = "dedicated-120v-circuit-outlet";
const EQUIPMENT_KEY = "dedicated_equipment";
const DISTANCE_KEY = "dedicated_distance";
const DISTANCE_PROMPT = "How many feet will the wire travel from the electrical panel to the new outlet?";
const DISTANCE_HELP =
  "Measure only the accessible path through the attic, basement, crawlspace, drop ceiling, or open framing. Don't include the short drops at the panel or outlet.";
const REVIEW_PHOTOS = [
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The area around the electrical panel",
  "The proposed outlet location",
  "The route between the panel and outlet, including any finished walls or ceilings",
];
const RANGES = [
  { value: "under_25", label: "Up to 25 feet", min: 1, max: 25, open: false, order: 1, review: false },
  // Keep the historical values so existing option ids and saved visits remain
  // valid; the displayed and validated boundary is now 100 feet.
  { value: "25_to_50", label: "More than 25 feet, up to 100 feet", min: 25, max: 100, open: true, order: 2, review: false },
  { value: "over_50", label: "More than 100 feet", min: 100, max: 200, open: true, order: 3, review: true },
] as const;

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
    const services = await db.service.findMany({
      where: { slug: SERVICE_SLUG, active: true, contractor: { slug: { in: [...CONTRACTOR_SLUGS] } } },
      select: {
        id: true,
        contractor: { select: { slug: true, name: true } },
        questions: {
          where: { key: { in: [EQUIPMENT_KEY, "dedicated_amperage", "dedicated_fireplace_amperage", "dedicated_route_access", DISTANCE_KEY, "dedicated_finish_ack"] } },
          select: { id: true, key: true, inputType: true, options: { select: { id: true, value: true } } },
        },
      },
      orderBy: { contractor: { slug: "asc" } },
    });
    assert.deepEqual(services.map((service) => service.contractor.slug).sort(), [...CONTRACTOR_SLUGS].sort());

    const templateService = await db.templateService.findFirstOrThrow({
      where: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
      orderBy: { templateVersion: { version: "desc" } },
      select: {
        id: true,
        questions: {
          where: { key: { in: [EQUIPMENT_KEY, "dedicated_amperage", "dedicated_fireplace_amperage", DISTANCE_KEY, "dedicated_finish_ack"] } },
          select: { id: true, key: true, options: { select: { id: true, value: true } } },
        },
      },
    });

    console.log(`DEDICATED CIRCUIT EXACT ROUTE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const service of services) {
      const equipment = service.questions.find((question) => question.key === EQUIPMENT_KEY);
      const distance = service.questions.find((question) => question.key === DISTANCE_KEY);
      assert.ok(equipment && distance, `${service.contractor.slug}: equipment and distance questions are required`);
      console.log(`  ${service.contractor.name}: ${equipment.options.length} equipment choices; distance input ${distance.inputType}`);
    }
    console.log("  new opening screen: 5 choices; route: exact feet from panel to outlet");
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded update.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const service of services) {
        const byKey = new Map(service.questions.map((question) => [question.key, question]));
        const equipment = byKey.get(EQUIPMENT_KEY)!;
        const amperage = byKey.get("dedicated_amperage")!;
        const fireplaceAmperage = byKey.get("dedicated_fireplace_amperage")!;
        const distance = byKey.get(DISTANCE_KEY)!;
        const finish = byKey.get("dedicated_finish_ack")!;

        await tx.question.update({
          where: { id: equipment.id },
          data: { helpText: "Choose the closest match. We'll work out the breaker and wire size." },
        });
        await tx.answerOption.deleteMany({ where: { questionId: equipment.id } });
        await tx.answerOption.createMany({ data: [
          { questionId: equipment.id, label: "Refrigerator or freezer", value: "fridge_freezer", routeAction: "CONTINUE", nextQuestionId: byKey.get("dedicated_route_access")?.id ?? distance.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
          { questionId: equipment.id, label: "Sump pump", value: "sump_pump", routeAction: "CONTINUE", nextQuestionId: byKey.get("dedicated_route_access")?.id ?? distance.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null },
          { questionId: equipment.id, label: "Microwave or room air conditioner", value: "microwave", routeAction: "CONTINUE", nextQuestionId: byKey.get("dedicated_route_access")?.id ?? distance.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: null },
          { questionId: equipment.id, label: "Electric fireplace", value: "electric_fireplace", routeAction: "CONTINUE", nextQuestionId: fireplaceAmperage.id, order: 4, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
          { questionId: equipment.id, label: "Another appliance or I know the circuit size", value: "knows_size", routeAction: "CONTINUE", nextQuestionId: amperage.id, order: 5, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
        ] });

        await tx.question.update({
          where: { id: distance.id },
          data: {
            prompt: DISTANCE_PROMPT,
            helpText: DISTANCE_HELP,
            inputType: "NUMBER",
            numberAllowsDecimal: true,
            numberMin: 1,
            numberMax: 200,
          },
        });
        for (const range of RANGES) {
          const option = distance.options.find((candidate) => candidate.value === range.value);
          assert.ok(option, `${service.contractor.slug}: missing ${range.value}`);
          await tx.answerOption.update({
            where: { id: option.id },
            data: {
              label: range.label,
              order: range.order,
              numberAtLeast: range.min,
              numberAtMost: range.max,
              numberAtLeastExclusive: range.open,
              routeAction: range.review ? "PHOTO_REVIEW" : "CONTINUE",
              nextQuestionId: range.review ? null : finish.id,
              photosBlockBooking: range.review,
              requiredPhotoLabels: range.review ? REVIEW_PHOTOS : [],
            },
          });
        }
        const canonicalUnknown = distance.options.find((option) => option.value === NUMERIC_UNKNOWN);
        const legacyUnknown = distance.options.find((option) => option.value === "unsure");
        assert.ok(!(canonicalUnknown && legacyUnknown), `${service.contractor.slug}: duplicate distance uncertainty options`);
        const unknown = canonicalUnknown ?? legacyUnknown;
        assert.ok(unknown, `${service.contractor.slug}: missing distance uncertainty option`);
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

      const templateByKey = new Map(templateService.questions.map((question) => [question.key, question]));
      const templateEquipment = templateByKey.get(EQUIPMENT_KEY)!;
      const templateDistance = templateByKey.get(DISTANCE_KEY)!;
      await tx.templateQuestion.update({
        where: { id: templateEquipment.id },
        data: { helpText: "Choose the closest match. We'll work out the breaker and wire size." },
      });
      await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: templateEquipment.id } });
      await tx.templateAnswerOption.createMany({ data: [
        { templateQuestionId: templateEquipment.id, label: "Refrigerator or freezer", value: "fridge_freezer", routeAction: "CONTINUE", nextQuestionKey: "dedicated_route_access", order: 1, requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
        { templateQuestionId: templateEquipment.id, label: "Sump pump", value: "sump_pump", routeAction: "CONTINUE", nextQuestionKey: "dedicated_route_access", order: 2, requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
        { templateQuestionId: templateEquipment.id, label: "Microwave or room air conditioner", value: "microwave", routeAction: "CONTINUE", nextQuestionKey: "dedicated_route_access", order: 3, requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
        { templateQuestionId: templateEquipment.id, label: "Electric fireplace", value: "electric_fireplace", routeAction: "CONTINUE", nextQuestionKey: "dedicated_fireplace_amperage", order: 4, requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
        { templateQuestionId: templateEquipment.id, label: "Another appliance or I know the circuit size", value: "knows_size", routeAction: "CONTINUE", nextQuestionKey: "dedicated_amperage", order: 5, requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
      ] });

      await tx.templateQuestion.update({
        where: { id: templateDistance.id },
        data: { prompt: DISTANCE_PROMPT, helpText: DISTANCE_HELP, inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200 },
      });
      for (const range of RANGES) {
        const option = templateDistance.options.find((candidate) => candidate.value === range.value);
        assert.ok(option, `template: missing ${range.value}`);
        await tx.templateAnswerOption.update({
          where: { id: option.id },
          data: {
            label: range.label,
            labelPattern: null,
            templatePolicyDefinitionId: null,
            order: range.order,
            numberAtLeast: range.min,
            numberAtMost: range.max,
            numberAtLeastExclusive: range.open,
            routeAction: range.review ? "PHOTO_REVIEW" : "CONTINUE",
            nextQuestionKey: range.review ? null : "dedicated_finish_ack",
            photosBlockBooking: range.review,
            requiredPhotoLabels: range.review ? REVIEW_PHOTOS : [],
          },
        });
      }
      const templateCanonicalUnknown = templateDistance.options.find((option) => option.value === NUMERIC_UNKNOWN);
      const templateLegacyUnknown = templateDistance.options.find((option) => option.value === "unsure");
      assert.ok(!(templateCanonicalUnknown && templateLegacyUnknown), "template: duplicate distance uncertainty options");
      const templateUnknown = templateCanonicalUnknown ?? templateLegacyUnknown;
      assert.ok(templateUnknown, "template: missing distance uncertainty option");
      await tx.templateAnswerOption.update({
        where: { id: templateUnknown.id },
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
    }, { timeout: 120000 });

    console.log("  Published: five equipment choices and an exact panel-to-outlet measurement for live catalogs and the electrical template.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
