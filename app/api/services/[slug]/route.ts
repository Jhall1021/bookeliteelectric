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
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
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
        priceModifierCents: o.priceModifierCents,
        nextQuestionId: o.nextQuestionId,
        routeAction: o.routeAction,
        rerouteServiceId: o.rerouteServiceId,
        requiredPhotoLabels: o.requiredPhotoLabels,
      })),
    })),
  };

  return NextResponse.json(dto);
}
