import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// Returns active services (with a While We're There price) that aren't
// already in the customer's open visit — the add-on menu shown after any
// primary service is priced.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: { lineItems: { select: { serviceId: true } } },
  });

  const excludeIds = visit?.lineItems.map((li) => li.serviceId) ?? [];

  const suggestions = await prisma.service.findMany({
    where: {
      active: true,
      whileWeThereBasePrice: { not: null },
      id: { notIn: excludeIds },
    },
    select: { id: true, slug: true, name: true, whileWeThereBasePrice: true },
    take: 6,
  });

  return NextResponse.json({ suggestions });
}
