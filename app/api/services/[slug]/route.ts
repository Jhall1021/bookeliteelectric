import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ServiceFlowDTO } from "@/lib/flow-types";

// Trees are small (a handful of questions per service), so we return the
// whole thing in one call rather than round-tripping per question — the
// GuidedFlowEngine walks it client-side.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const service = await prisma.service.findUnique({
    where: { slug: params.slug },
    include: {
      category: { select: { icon: true } },
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: {
              referencedService: { select: { basePrice: true } },
              // Components come down with the tree so the engine can
              // accumulate a configuration client-side without a round trip
              // per answer.
              components: { include: { component: true } },
              photoGroups: {
                orderBy: { order: "asc" },
                include: { photoGroup: true },
              },
            },
          },
        },
      },
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const dto: ServiceFlowDTO = {
    id: service.id,
    slug: service.slug,
    name: service.name,
    bookingType: service.bookingType,
    basePrice: service.basePrice,
    whileWeThereBasePrice: service.whileWeThereBasePrice,
    startingPriceLabel: service.startingPriceLabel,
    shortDescription: service.shortDescription,
    icon: service.icon ?? service.category.icon,
    disclaimer: service.disclaimer,
    fieldLaborHours: service.fieldLaborHours,
    materialCostCents: service.materialCostCents,
    estimatedMinutes: service.estimatedMinutes,
    requiresTechCount: service.requiresTechCount,
    questions: service.questions.map((q) => ({
      id: q.id,
      key: q.key,
      prompt: q.prompt,
      helpText: q.helpText,
      inputType: q.inputType,
      order: q.order,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        // Live lookup wins over the frozen seed-time number whenever this
        // option references another service — this is what makes admin
        // edits to e.g. Elite Tilt Mount's price actually show up here.
        priceModifierCents: o.referencedService?.basePrice ?? o.priceModifierCents,
        nextQuestionId: o.nextQuestionId,
        routeAction: o.routeAction,
        rerouteServiceId: o.rerouteServiceId,
        // Groups expand first, then any loose labels specific to this answer.
        // The client receives one flat list and stays unaware of the split.
        requiredPhotoLabels: [
          ...o.photoGroups.flatMap((g) => g.photoGroup.labels),
          ...o.requiredPhotoLabels,
        ],
        // De-duplicated: two groups may carry the same panel warning, and the
        // customer should see it once.
        photoSafetyNotes: [
          ...new Set(
            o.photoGroups
              .map((g) => g.photoGroup.safetyNote)
              .filter((n): n is string => !!n)
          ),
        ],
        disclaimer: o.disclaimer,
        photosBlockBooking: o.photosBlockBooking,
        overrideEstimatedMinutes: o.overrideEstimatedMinutes,
        overrideTechCount: o.overrideTechCount,
        overrideFieldLaborHours: o.overrideFieldLaborHours,
        addFieldLaborHours: o.addFieldLaborHours,
        addMaterialCostCents: o.addMaterialCostCents,
        addScheduleMinutes: o.addScheduleMinutes,
        approvedComponentPriceCents: o.approvedComponentPriceCents,
        accessClassification: o.accessClassification,
        components: o.components.map((sel) => ({
          quantity: sel.quantity,
          // §29 — null on both means the component always applies; when set,
          // it applies only if the customer's earlier answer matches.
          conditionAccessClass: sel.conditionAccessClass,
          conditionAnswerKey: sel.conditionAnswerKey,
          conditionAnswerValue: sel.conditionAnswerValue,
          component: {
            key: sel.component.key,
            customerFacingLabel: sel.component.customerFacingLabel,
            approvedPriceCents: sel.component.approvedPriceCents,
            addFieldLaborHours: sel.component.addFieldLaborHours,
            addMaterialCostCents: sel.component.addMaterialCostCents,
            addScheduleMinutes: sel.component.addScheduleMinutes,
            addTechCount: sel.component.addTechCount,
          },
        })),
      })),
    })),
  };

  return NextResponse.json(dto);
}
