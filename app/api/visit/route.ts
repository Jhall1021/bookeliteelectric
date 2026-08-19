import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// POST body: { serviceId, computedPriceCents, isPrimary, answersSnapshot,
//              photos?: { url, label }[] }
// Each call creates a new LineItem row — adding the same service twice
// (e.g. two outlet replacements in different rooms) is intentional and
// supported. Quantity is derived by grouping on GET, not stored directly.
//
// `photos` is only sent by the price-locked PHOTO_REVIEW path, where the
// customer uploads prep photos and books in the same step. Those rows are
// created together with the line item so a partial write can't leave photos
// orphaned in R2 with nothing pointing at them.
export async function POST(req: Request) {
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { serviceId, computedPriceCents, isPrimary, answersSnapshot, photos } = body;

  if (!serviceId || typeof computedPriceCents !== "number") {
    return NextResponse.json({ error: "Missing serviceId or computedPriceCents" }, { status: 400 });
  }

  let visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
  });

  if (!visit) {
    visit = await prisma.visit.create({ data: { sessionId, status: "OPEN" } });
  }

  // Duration is looked up server-side, never trusted from the client — the
  // customer never sends or sees this value, it's purely internal dispatch
  // data snapshotted at add-time, same pattern as price.
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { estimatedMinutes: true },
  });

  // Only accept well-formed photo entries — a malformed one would otherwise
  // create a Photo row with an empty url that renders as a broken image on
  // the technician's job sheet.
  const incomingPhotos: { url: string; label: string }[] = Array.isArray(photos)
    ? photos.filter(
        (p: unknown): p is { url: string; label: string } =>
          !!p &&
          typeof (p as { url?: unknown }).url === "string" &&
          (p as { url: string }).url.length > 0 &&
          typeof (p as { label?: unknown }).label === "string"
      )
    : [];

  const lineItem = await prisma.$transaction(async (tx) => {
    const created = await tx.lineItem.create({
      data: {
        visitId: visit!.id,
        serviceId,
        isPrimary: isPrimary ?? true,
        answersSnapshot: answersSnapshot ?? {},
        computedPriceCents,
        estimatedMinutes: service?.estimatedMinutes ?? null,
      },
    });

    if (incomingPhotos.length > 0) {
      await tx.photo.createMany({
        data: incomingPhotos.map((p) => ({
          lineItemId: created.id,
          url: p.url,
          label: p.label,
          source: "CUSTOMER_PRE_BOOKING" as const,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({ visitId: visit.id, lineItemId: lineItem.id });
}

// DELETE ?lineItemId=... — removes ONE instance. If the customer added 3
// outlet replacements and wants 2, this removes a single row, not the
// whole group.
//
// If this delete removes the LAST primary line item while add-ons remain,
// something still has to be the reason a technician is coming out. Rather
// than repricing every remaining item to full rate, exactly ONE remaining
// item is promoted to primary (full standalone price) and becomes the new
// anchor for the visit — everything else keeps its existing While We're
// There price, since that discount is still legitimate relative to the new
// anchor job.
export async function DELETE(req: Request) {
  const sessionId = getOrCreateSessionId();
  const { searchParams } = new URL(req.url);
  const lineItemId = searchParams.get("lineItemId");

  if (!lineItemId) {
    return NextResponse.json({ error: "Missing lineItemId" }, { status: 400 });
  }

  const lineItem = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    include: { visit: true },
  });

  if (!lineItem || lineItem.visit.sessionId !== sessionId || lineItem.visit.status !== "OPEN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visitId = lineItem.visitId;
  await prisma.lineItem.delete({ where: { id: lineItemId } });

  const remaining = await prisma.lineItem.findMany({
    where: { visitId },
    include: { service: { select: { basePrice: true } } },
    orderBy: { id: "asc" }, // earliest-added remaining item becomes the new anchor
  });

  const hasPrimaryLeft = remaining.some((li) => li.isPrimary);
  let pricingAdjusted = false;

  if (!hasPrimaryLeft && remaining.length > 0) {
    const newAnchor = remaining[0];
    if (newAnchor.service.basePrice !== null) {
      pricingAdjusted = true;
      await prisma.lineItem.update({
        where: { id: newAnchor.id },
        data: { isPrimary: true, computedPriceCents: newAnchor.service.basePrice },
      });
    }
  }

  return NextResponse.json({ ok: true, pricingAdjusted });
}

// GET the current open visit, grouped by service + primary/add-on so
// multiples of the same service show as a quantity instead of repeated rows.
//
// IMPORTANT: within a group, units are NOT all the same price. The first
// unit of any service keeps whatever it was originally priced at (full
// standalone rate if it's the primary job, or the WWT rate if it was itself
// an add-on). Every unit ADDED AFTER that — even a second of the exact same
// service — is priced at the service's While We're There rate, since the
// technician is already on-site either way. `whileWeThereBasePrice` is
// exposed per group so the client's "+" button knows what to charge for
// the next unit; `totalPriceCents` is a true sum of each line item's actual
// stored price, not unitPrice × quantity, since prices can differ within
// the group.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: {
      lineItems: {
        include: {
          service: { select: { id: true, name: true, slug: true, whileWeThereBasePrice: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!visit) {
    return NextResponse.json({ lineItems: [], totalCents: 0 });
  }

  const totalCents = visit.lineItems.reduce((sum, li) => sum + li.computedPriceCents, 0);

  const groups = new Map<
    string,
    {
      serviceId: string;
      serviceName: string;
      serviceSlug: string;
      isPrimary: boolean;
      whileWeThereBasePrice: number | null;
      firstUnitPriceCents: number;
      totalPriceCents: number;
      lineItemIds: string[];
    }
  >();

  for (const li of visit.lineItems) {
    const key = `${li.service.id}:${li.isPrimary}`;
    const existing = groups.get(key);
    if (existing) {
      existing.lineItemIds.push(li.id);
      existing.totalPriceCents += li.computedPriceCents;
    } else {
      groups.set(key, {
        serviceId: li.service.id,
        serviceName: li.service.name,
        serviceSlug: li.service.slug,
        isPrimary: li.isPrimary,
        whileWeThereBasePrice: li.service.whileWeThereBasePrice,
        firstUnitPriceCents: li.computedPriceCents,
        totalPriceCents: li.computedPriceCents,
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
      whileWeThereBasePrice: g.whileWeThereBasePrice,
      quantity: g.lineItemIds.length,
      totalPriceCents: g.totalPriceCents,
      // Front end removes the last-added instance by popping this list.
      lineItemIds: g.lineItemIds,
    })),
    totalCents,
  });
}
