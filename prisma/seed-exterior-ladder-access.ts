/**
 * Exterior ladder access for existing fixture replacements.
 *
 * Exterior work does not share the indoor ceiling-height problem. A customer
 * should not be asked whether stairs or furniture sit below an outdoor
 * floodlight, and the indoor 11–12 / 13–14 foot percentages do not describe
 * the setup time of an extension ladder. This module replaces that indoor
 * pair with one observable ladder-selection question.
 *
 * The extension-ladder branch adds a real 0.50 crew-hour allowance and the
 * matching 30 minutes of schedule time. Its customer-facing increment is
 * calculated from the contractor's current electrician labor rate, using the
 * same pricing engine as every other labor-backed add-on.
 *
 * Run with: npx tsx prisma/seed-exterior-ladder-access.ts
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";
import { loadPricingSettings } from "../lib/routeResolver";
import { suggestConfigurationPrice } from "../lib/pricing";

const prisma = new PrismaClient();

export const EXTERIOR_LADDER_SERVICE_SLUGS = [
  "replace-exterior-light-fixture",
  "replace-motion-flood-light",
  "floodlight-camera-existing",
] as const;

export const EXTERIOR_LADDER_KEY = "exterior_ladder_access";
export const EXTENSION_LADDER_LABOR_HOURS = 0.5;
export const EXTENSION_LADDER_SCHEDULE_MINUTES = 30;

const LEGACY_INTERIOR_KEYS = ["fixture_height", "work_area_below"] as const;
const REVIEW_PHOTOS = [
  "A wide photo showing the fixture, the whole side of the house, and the ground below",
  "A closer photo of the existing fixture",
];

async function attach(slug: (typeof EXTERIOR_LADDER_SERVICE_SLUGS)[number]) {
  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, slug),
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  const oldInteriorQuestions = service.questions.filter((question) =>
    LEGACY_INTERIOR_KEYS.includes(question.key as (typeof LEGACY_INTERIOR_KEYS)[number]),
  );
  const remaining = service.questions.filter((question) =>
    question.key !== EXTERIOR_LADDER_KEY
      && !LEGACY_INTERIOR_KEYS.includes(question.key as (typeof LEGACY_INTERIOR_KEYS)[number]),
  );
  const handoffQuestionId = remaining[0]?.id ?? null;

  const ladder = await upsertQuestion(prisma, service.id, {
    key: EXTERIOR_LADDER_KEY,
    prompt: "What kind of ladder is needed to reach the existing fixture?",
    helpText:
      "Choose based on the ground directly below the fixture. Step-ladder access needs firm, level ground. Extension-ladder access also needs a clear setup area and open wall below.",
    order: 0,
  });

  // Preserve any legitimate inbound route while removing the obsolete indoor
  // questions. Usually these were the entry questions, but repairing an
  // inbound reference makes the migration safe for an older customized tree.
  const oldIds = oldInteriorQuestions.map((question) => question.id);
  if (oldIds.length > 0) {
    await prisma.answerOption.updateMany({
      where: { nextQuestionId: { in: oldIds }, questionId: { notIn: oldIds } },
      data: { nextQuestionId: ladder.id },
    });
    await prisma.answerOption.deleteMany({ where: { questionId: { in: oldIds } } });
    await prisma.question.deleteMany({ where: { id: { in: oldIds } } });
  }

  for (const [index, question] of remaining.entries()) {
    await prisma.question.update({ where: { id: question.id }, data: { order: index + 1 } });
  }

  const settings = await loadPricingSettings(prisma, service.contractorId);
  const extensionIncrement = suggestConfigurationPrice(
    {
      accessClass: null,
      accessBySlot: {},
      awaitingComponentMaterialCost: false,
      awaitingComponentLabor: false,
      awaitingComponentApproval: false,
      fieldLaborHours: EXTENSION_LADDER_LABOR_HOURS,
      materialCostCents: 0,
      estimatedMinutes: EXTENSION_LADDER_SCHEDULE_MINUTES,
      techCount: 1,
      components: [],
      addedCrewHours: EXTENSION_LADDER_LABOR_HOURS,
      approvedIncrementCents: 0,
      legacyModifierCents: 0,
    },
    {
      materialMultiplier: service.materialMultiplier,
      permitAdminCents: 0,
      otherDirectCostCents: 0,
      isPrimaryEligible: false,
      laborCrewType: service.laborCrewType,
    },
    settings,
    false,
  ).totalCents;
  if (extensionIncrement === null) {
    throw new Error(`${slug}: could not calculate the extension-ladder labor increment`);
  }

  const onward = handoffQuestionId
    ? { routeAction: "CONTINUE" as const, nextQuestionId: handoffQuestionId }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: ladder.id,
        label: "Standard step ladder — typical first story",
        value: "step_ladder",
        ...onward,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: ladder.id,
        label: "Extension ladder — typical second story",
        value: "extension_ladder",
        ...onward,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: extensionIncrement,
        addFieldLaborHours: EXTENSION_LADDER_LABOR_HOURS,
        addScheduleMinutes: EXTENSION_LADDER_SCHEDULE_MINUTES,
      },
      {
        questionId: ladder.id,
        label: "Something else, or I'm not sure",
        value: "other_or_unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  if (dangling.length > 0) {
    throw new Error(`${slug}: dangling routes after exterior ladder migration: ${dangling.join(", ")}`);
  }
  console.log(
    `  ✓ ${slug} — exterior ladder access installed; extension ladder adds ` +
      `${EXTENSION_LADDER_LABOR_HOURS.toFixed(2)} hr / $${(extensionIncrement / 100).toFixed(2)}`,
  );
}

async function main() {
  console.log("Installing exterior ladder access...\n");
  for (const slug of EXTERIOR_LADDER_SERVICE_SLUGS) await attach(slug);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
