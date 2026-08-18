import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

// Deliberately scoped to editing EXISTING questions/options only — no
// adding, removing, or rewiring routing here. See TreeEditor.tsx for why.
export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { questions } = await req.json();

  if (!Array.isArray(questions)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Confirm every question actually belongs to this service before writing
  // anything — prevents a crafted request from editing another service's tree.
  const owned = await prisma.question.findMany({
    where: { serviceId: params.serviceId },
    select: { id: true, options: { select: { id: true } } },
  });
  const ownedQuestionIds = new Set(owned.map((q) => q.id));
  const ownedOptionIds = new Set(owned.flatMap((q) => q.options.map((o) => o.id)));

  for (const q of questions) {
    if (!ownedQuestionIds.has(q.id)) {
      return NextResponse.json({ error: "Question does not belong to this service" }, { status: 400 });
    }
    for (const o of q.options ?? []) {
      if (!ownedOptionIds.has(o.id)) {
        return NextResponse.json({ error: "Answer option does not belong to this service" }, { status: 400 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const q of questions) {
      await tx.question.update({
        where: { id: q.id },
        data: { prompt: q.prompt, helpText: q.helpText || null },
      });
      for (const o of q.options ?? []) {
        await tx.answerOption.update({
          where: { id: o.id },
          data: {
            label: o.label,
            priceModifierCents: o.priceModifierCents ?? 0,
            referencedServiceId: o.referencedServiceId || null,
            disclaimer: o.disclaimer || null,
            requiredPhotoLabels: o.requiredPhotoLabels ?? [],
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
