import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// POST body: { serviceId, computedPriceCents, isPrimary, answersSnapshot }
// Each call creates a new LineItem row — adding the same service twice
// (e.g. two outlet replacements in different rooms) is intentional and
// supported. Quantity is derived by grouping on GET, not stored directly.
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

// DELETE ?lineItemId=... — removes ONE instance. If the customer added 3
// outlet replacements and wants 2, this removes a single row, not the
// whole group.
export async function DELETE(req: Request) {
  const sessionId = getOrCreateSessionId();
  const { searchParams } = new URL(req.url);
  const lineItemId = searchParams.get("lineItemId");

  if (!lineItemId) {
    return NextResponse.json({ error: "Missing lineItemId" }, { status: 400 });
  }

  // Confirm the line item belongs to this session's own open visit before
  // deleting — prevents one customer from deleting another's cart item.
  const lineItem = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    include: { visit: true },
  });

  if (!lineItem || lineItem.visit.sessionId !== sessionId || lineItem.visit.status !== "OPEN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.lineItem.delete({ where: { id: lineItemId } });
  return NextResponse.json({ ok: true });
}

// GET the current open visit, grouped by service + primary/add-on so
// multiples of the same service show as a quantity instead of repeated rows.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: {
      lineItems: {
        include: { service: { select: { id: true, name: true, slug: true } } },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!visit) {
    return NextResponse.json({ lineItems: [], totalCents: 0 });
  }

  const totalCents = visit.lineItems.reduce((sum, li) => sum + li.computedPriceCents, 0);

  // Group by service.id + isPrimary. Each group tracks the individual
  // LineItem ids so "remove one" can target a specific row.
  const groups = new Map<
    string,
    {
      serviceId: string;
      serviceName: string;
      serviceSlug: string;
      isPrimary: boolean;
      unitPriceCents: number;
      lineItemIds: string[];
    }
  >();

  for (const li of visit.lineItems) {
    const key = `${li.service.id}:${li.isPrimary}`;
    const existing = groups.get(key);
    if (existing) {
      existing.lineItemIds.push(li.id);
    } else {
      groups.set(key, {
        serviceId: li.service.id,
        serviceName: li.service.name,
        serviceSlug: li.service.slug,
        isPrimary: li.isPrimary,
        unitPriceCents: li.computedPriceCents,
        lineItemIds: [li.id],
      });
    }
  }

  return NextResponse.json({
    visitId: visit.id,
    lineItems: Array.from(groups.values()).map((g) => ({
      serviceId: g.serviceId,
      serviceName: g.serviceName,
      serviceSlug: g.serviceSlug,
      isPrimary: g.isPrimary,
      unitPriceCents: g.unitPriceCents,
      quantity: g.lineItemIds.length,
      totalPriceCents: g.unitPriceCents * g.lineItemIds.length,
      // Front end removes the last-added instance by popping this list.
      lineItemIds: g.lineItemIds,
    })),
    totalCents,
  });
}
