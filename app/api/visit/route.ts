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

  // A service with a decision tree cannot be added without going through it.
  //
  // The cart's "+" button used to POST with an empty answersSnapshot, which
  // added a second unit at the add-on rate with no qualification at all — no
  // height, no access, no distance. Someone could qualify one recessed light
  // for an 8 ft ceiling with attic access and then add five more for rooms
  // nobody asked about, at a price justified by a different room.
  //
  // Enforced here rather than only in the UI: hiding a button doesn't stop a
  // POST, and this is the difference between a priced job and a loss.
  const qualification = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { name: true, _count: { select: { questions: true } } },
  });

  if (qualification && qualification._count.questions > 0) {
    const answers = answersSnapshot ?? {};
    if (Object.keys(answers).length === 0) {
      return NextResponse.json(
        {
          error: "QUALIFICATION_REQUIRED",
          message: `${qualification.name} needs a few questions answered before it can be added — the price depends on them.`,
        },
        { status: 422 }
      );
    }
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
          service: {
            select: {
              id: true,
              name: true,
              slug: true,
              whileWeThereBasePrice: true,
              category: { select: { slug: true } },
              _count: { select: { questions: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!visit) {
    return NextResponse.json({ lineItems: [], totalCents: 0 });
  }

  // Only what's actually priced. An unpriced line contributes nothing to the
  // subtotal rather than counting as zero — the customer should see what they
  // owe so far, not a total that's quietly missing an item.
  const totalCents = visit.lineItems.reduce((sum, li) => sum + (li.computedPriceCents ?? 0), 0);
  const awaitingQuote = visit.lineItems.filter((li) => li.computedPriceCents === null).length;

  const groups = new Map<
    string,
    {
      serviceId: string;
      serviceName: string;
      serviceSlug: string;
      categorySlug: string;
      requiresQualification: boolean;
      isPrimary: boolean;
      whileWeThereBasePrice: number | null;
      awaitingQuote: boolean;
      floorPriceCents: number | null;
      firstUnitPriceCents: number;
      totalPriceCents: number;
      lineItemIds: string[];
    }
  >();

  for (const li of visit.lineItems) {
    // Unpriced lines are grouped separately from priced ones for the same
    // service — they're different states, and merging them would show a
    // quantity of two against a single price.
    const key = `${li.service.id}:${li.isPrimary}:${li.computedPriceCents === null ? "quote" : "priced"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.lineItemIds.push(li.id);
      existing.totalPriceCents += li.computedPriceCents ?? 0;
    } else {
      groups.set(key, {
        serviceId: li.service.id,
        serviceName: li.service.name,
        serviceSlug: li.service.slug,
        categorySlug: li.service.category.slug,
        // Another unit of this can't just be incremented — its price came
        // from answers about one specific location.
        requiresQualification: li.service._count.questions > 0,
        isPrimary: li.isPrimary,
        whileWeThereBasePrice: li.service.whileWeThereBasePrice,
        awaitingQuote: li.computedPriceCents === null,
        floorPriceCents: li.floorPriceCents,
        firstUnitPriceCents: li.computedPriceCents ?? 0,
        totalPriceCents: li.computedPriceCents ?? 0,
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
      categorySlug: g.categorySlug,
      requiresQualification: g.requiresQualification,
      isPrimary: g.isPrimary,
      whileWeThereBasePrice: g.whileWeThereBasePrice,
      awaitingQuote: g.awaitingQuote,
      floorPriceCents: g.floorPriceCents,
      quantity: g.lineItemIds.length,
      totalPriceCents: g.totalPriceCents,
      // Front end removes the last-added instance by popping this list.
      lineItemIds: g.lineItemIds,
    })),
    totalCents,
    // Scheduling is blocked while this is above zero. The customer can keep
    // building the visit; they just can't pick a time until every line has a
    // price, because a technician can't be dispatched against an unknown.
    awaitingQuote,
  });
}
