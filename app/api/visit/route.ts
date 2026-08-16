import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// POST body: { serviceId, computedPriceCents, isPrimary, answersSnapshot }
export async function POST(req: Request) {
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { serviceId, computedPriceCents, isPrimary, answersSnapshot } = body;

  if (!serviceId || typeof computedPriceCents !== "number") {
    return NextResponse.json({ error: "Missing serviceId or computedPriceCents" }, { status: 400 });
  }

  let visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
  });

  if (!visit) {
    visit = await prisma.visit.create({ data: { sessionId, status: "OPEN" } });
  }

  const lineItem = await prisma.lineItem.create({
    data: {
      visitId: visit.id,
      serviceId,
      isPrimary: isPrimary ?? true,
      answersSnapshot: answersSnapshot ?? {},
      computedPriceCents,
    },
  });

  return NextResponse.json({ visitId: visit.id, lineItemId: lineItem.id });
}

// GET the current open visit with its line items + resolved service names.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: {
      lineItems: {
        include: { service: { select: { name: true, slug: true } } },
      },
    },
  });

  if (!visit) {
    return NextResponse.json({ lineItems: [], totalCents: 0 });
  }

  const totalCents = visit.lineItems.reduce((sum, li) => sum + li.computedPriceCents, 0);

  return NextResponse.json({
    visitId: visit.id,
    lineItems: visit.lineItems.map((li) => ({
      id: li.id,
      serviceName: li.service.name,
      serviceSlug: li.service.slug,
      isPrimary: li.isPrimary,
      priceCents: li.computedPriceCents,
    })),
    totalCents,
  });
}
