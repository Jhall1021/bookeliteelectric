import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  const quote = await prisma.quote.findUnique({ where: { id: params.quoteId } });

  if (!quote || quote.status !== "PRICED" || quote.quotedPriceCents === null) {
    return NextResponse.json({ error: "This quote isn't ready to approve yet" }, { status: 400 });
  }

  const sessionId = getOrCreateSessionId();
  let visit = await prisma.visit.findFirst({ where: { sessionId, status: "OPEN" } });
  if (!visit) {
    visit = await prisma.visit.create({ data: { sessionId, status: "OPEN" } });
  }

  // Approved quotes always land as the visit's primary item — they're
  // significant, custom-priced jobs, never a While We're There add-on.
  await prisma.lineItem.create({
    data: {
      visitId: visit.id,
      serviceId: quote.serviceId,
      isPrimary: true,
      answersSnapshot: quote.answersSnapshot ?? {},
      computedPriceCents: quote.quotedPriceCents,
    },
  });

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
