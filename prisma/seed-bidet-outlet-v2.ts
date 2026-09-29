/**
 * Give the bidet/smart-toilet outlet the same measured route tree as the
 * general new-outlet service. The service stays distinct because its endpoint
 * material is an interior GFCI receptacle rather than a standard receptacle;
 * the derived takeoff selects that material from the service slug.
 */
import { PrismaClient } from "@prisma/client";
import { assertNoBaseMaterial } from "../lib/materialCost";

const prisma = new PrismaClient();

export const GENERAL_OUTLET_SLUG = "new-120v-outlet";
export const BIDET_OUTLET_SLUG = "bidet-smart-toilet-outlet";

export async function syncBidetOutletTree(db: PrismaClient, contractorId: string) {
  const [source, target] = await Promise.all([
    db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId, slug: GENERAL_OUTLET_SLUG } },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: {
            conditionalHelp: true,
            options: {
              orderBy: { order: "asc" },
              include: {
                components: true,
                materials: true,
                conditionalDisclaimers: true,
                photoGroups: true,
              },
            },
          },
        },
      },
    }),
    db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId, slug: BIDET_OUTLET_SLUG } },
      select: { id: true },
    }),
  ]);

  // Replace the authored tree as one unit. Historical booking answers are
  // snapshots rather than foreign keys to these rows; the service identity is
  // preserved while the current customer flow becomes an exact copy.
  await db.answerOption.deleteMany({ where: { question: { serviceId: target.id } } });
  await db.question.deleteMany({ where: { serviceId: target.id } });

  const questionIds = new Map<string, string>();
  for (const question of source.questions) {
    const created = await db.question.create({
      data: {
        serviceId: target.id,
        key: question.key,
        prompt: question.prompt,
        helpText: question.helpText,
        inputType: question.inputType,
        order: question.order,
        numberMin: question.numberMin,
        numberMax: question.numberMax,
        numberAllowsDecimal: question.numberAllowsDecimal,
      },
      select: { id: true },
    });
    questionIds.set(question.id, created.id);
    if (question.conditionalHelp.length > 0) {
      await db.questionDisclaimer.createMany({
        data: question.conditionalHelp.map((disclaimer) => ({
          questionId: created.id,
          contractorDisclaimerId: disclaimer.contractorDisclaimerId,
          replacesHelpText: disclaimer.replacesHelpText,
          order: disclaimer.order,
        })),
      });
    }
  }

  for (const question of source.questions) {
    const targetQuestionId = questionIds.get(question.id)!;
    for (const option of question.options) {
      const created = await db.answerOption.create({
        data: {
          questionId: targetQuestionId,
          label: option.label,
          value: option.value,
          priceModifierCents: option.priceModifierCents,
          nextQuestionId: option.nextQuestionId ? questionIds.get(option.nextQuestionId) ?? null : null,
          routeAction: option.routeAction,
          rerouteServiceId: option.rerouteServiceId,
          referencedServiceId: option.referencedServiceId,
          requiredPhotoLabels: option.requiredPhotoLabels,
          order: option.order,
          disclaimer: option.disclaimer,
          photosBlockBooking: option.photosBlockBooking,
          illustrationUrls: option.illustrationUrls,
          overrideEstimatedMinutes: option.overrideEstimatedMinutes,
          overrideTechCount: option.overrideTechCount,
          overrideFieldLaborHours: option.overrideFieldLaborHours,
          addFieldLaborHours: option.addFieldLaborHours,
          addMaterialCostCents: option.addMaterialCostCents,
          addScheduleMinutes: option.addScheduleMinutes,
          accessFinishedDisclaimer: option.accessFinishedDisclaimer,
          accessClassification: option.accessClassification,
          accessSlot: option.accessSlot,
          approvedComponentPriceCents: option.approvedComponentPriceCents,
          labelPattern: option.labelPattern,
          policyKey: option.policyKey,
          numberAtLeast: option.numberAtLeast,
          numberAtMost: option.numberAtMost,
          numberAtLeastExclusive: option.numberAtLeastExclusive,
          requiresCapabilityKey: option.requiresCapabilityKey,
        },
        select: { id: true },
      });
      if (option.components.length > 0) {
        await db.answerOptionComponent.createMany({
          data: option.components.map((component) => ({
            answerOptionId: created.id,
            componentId: component.componentId,
            canonicalComponentId: component.canonicalComponentId,
            quantity: component.quantity,
            conditionAccessClass: component.conditionAccessClass,
            conditionAccessSlot: component.conditionAccessSlot,
            conditionAnswerKey: component.conditionAnswerKey,
            conditionAnswerValue: component.conditionAnswerValue,
            quantityAnswerKey: component.quantityAnswerKey,
          })),
        });
      }
      if (option.materials.length > 0) {
        await db.answerOptionMaterial.createMany({
          data: option.materials.map((material) => ({
            answerOptionId: created.id,
            canonicalMaterialId: material.canonicalMaterialId,
            quantity: material.quantity,
            order: material.order,
          })),
        });
      }
      if (option.conditionalDisclaimers.length > 0) {
        await db.answerOptionDisclaimer.createMany({
          data: option.conditionalDisclaimers.map((disclaimer) => ({
            answerOptionId: created.id,
            contractorDisclaimerId: disclaimer.contractorDisclaimerId,
            order: disclaimer.order,
          })),
        });
      }
      if (option.photoGroups.length > 0) {
        await db.answerOptionPhotoGroup.createMany({
          data: option.photoGroups.map((group) => ({
            answerOptionId: created.id,
            photoGroupId: group.photoGroupId,
            order: group.order,
          })),
        });
      }
    }
  }

  await db.service.update({
    where: { id: target.id },
    data: {
      pricingMethod: "DERIVED_RESOLVED_SCOPE",
      bookingType: source.bookingType,
      photoState: source.photoState,
      laborCrewType: source.laborCrewType,
      isPrimaryEligible: source.isPrimaryEligible,
    },
  });
  await assertNoBaseMaterial(
    db,
    target.id,
    "Bidet/smart-toilet outlets use the measured new-outlet route. The route takeoff supplies an interior GFCI endpoint instead of the general outlet's standard receptacle.",
  );
  return { sourceServiceId: source.id, targetServiceId: target.id, questionCount: source.questions.length };
}

if (process.argv[1]?.endsWith("seed-bidet-outlet-v2.ts")) {
  const contractorSlug = process.argv[2];
  if (!contractorSlug) throw new Error("Usage: npx tsx prisma/seed-bidet-outlet-v2.ts <contractor-slug>");
  prisma.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } })
    .then((contractor) => syncBidetOutletTree(prisma, contractor.id))
    .then(async (result) => { console.log(result); await prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
}
