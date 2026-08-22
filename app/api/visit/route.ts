import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import {
  loadServiceForResolution,
  loadPricingSettings,
  resolveRoute,
} from "@/lib/routeResolver";

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
  const { serviceId, answersSnapshot, photos } = body;

  if (!serviceId) {
    return NextResponse.json({ error: "Missing serviceId" }, { status: 400 });
  }

  // Deliberately NOT read from the body: computedPriceCents, isPrimary,
  // crew count, crew-hours, duration, component increments. The browser
  // used to send the price and this route stored it after a typeof check,
  // which made dev tools an authority on what Elite charges.
  if ("computedPriceCents" in body) {
    console.warn(
      `[visit] client sent computedPriceCents for ${serviceId} — ignored. ` +
        `Something is still on the old contract.`
    );
  }

  const service = await loadServiceForResolution(prisma, serviceId);
  if (!service || !service.active) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }

  let visit = await prisma.visit.findFirst({ where: { sessionId, status: "OPEN" } });
  if (!visit) {
    visit = await prisma.visit.create({ data: { sessionId, status: "OPEN" } });
  }

  // Primary is a fact about the visit, not a claim the client gets to make.
  // The first line originates the trip and carries the service-call minimum;
  // everything after it is same-visit work.
  const existingCount = await prisma.lineItem.count({ where: { visitId: visit.id } });
  const isPrimary = existingCount === 0;

  const settings = await loadPricingSettings(prisma);
  const answers: Record<string, string> = answersSnapshot ?? {};
  const resolved = resolveRoute(service, answers, isPrimary, settings);

  if (resolved.status === "INVALID") {
    // Loud in the logs, vague to the customer — the reason names internal
    // structure, and a broken tree is our problem to fix, not theirs to read.
    console.error(`[visit] cannot resolve ${service.slug}: ${resolved.reason}`);
    return NextResponse.json(
      {
        error: "ROUTE_UNRESOLVED",
        message:
          "Something's not right with this service just now. Nothing has been added — please try again, or send us a couple of photos and we'll price it directly.",
      },
      { status: 422 }
    );
  }

  if (resolved.status === "REROUTE") {
    return NextResponse.json(
      { error: "REROUTE_REQUIRED", targetServiceId: resolved.targetServiceId },
      { status: 409 }
    );
  }

  if (resolved.status === "REVIEW") {
    // A blocking review isn't a booking. It goes through /api/quotes, which
    // collects photos and contact details and holds a place in the visit.
    return NextResponse.json(
      {
        error: "REVIEW_REQUIRED",
        reason: resolved.reason,
        photoLabels: resolved.photoLabels,
        floorPriceCents: resolved.floorPriceCents,
      },
      { status: 409 }
    );
  }

  const incomingPhotos: { url: string; label: string }[] = Array.isArray(photos)
    ? photos.filter(
        (ph: unknown): ph is { url: string; label: string } =>
          !!ph &&
          typeof (ph as { url?: unknown }).url === "string" &&
          (ph as { url: string }).url.length > 0 &&
          typeof (ph as { label?: unknown }).label === "string"
      )
    : [];

  const lineItem = await prisma.$transaction(async (tx) => {
    const created = await tx.lineItem.create({
      data: {
        visitId: visit!.id,
        serviceId,
        isPrimary: resolved.isPrimary,
        answersSnapshot: answers,
        // Server-derived, every one of them.
        computedPriceCents: resolved.priceCents,
        // The RESOLVED duration, not the service default. A six-light
        // recessed job consumed the same calendar slot as a one-light job
        // because this used to snapshot service.estimatedMinutes.
        estimatedMinutes: resolved.config.estimatedMinutes,
        resolvedCrewHours: resolved.config.fieldLaborHours,
        resolvedCrewCount: resolved.config.techCount,
        resolvedAccessClass: resolved.config.accessClass,
        resolvedComponentKeys: resolved.config.components.map((c) => c.key),
      },
    });

    if (incomingPhotos.length > 0) {
      await tx.photo.createMany({
        data: incomingPhotos.map((ph) => ({
          lineItemId: created.id,
          url: ph.url,
          label: ph.label,
          source: "CUSTOMER_PRE_BOOKING" as const,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({
    visitId: visit.id,
    lineItemId: lineItem.id,
    // Returned so the client can show what was added — not so it can
    // influence it.
    priceCents: resolved.priceCents,
    isPrimary: resolved.isPrimary,
  });
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
    // Skip lines still awaiting a quote — promoting one would price
    // something the office hasn't looked at.
    const newAnchor = remaining.find((li) => li.computedPriceCents !== null);

    if (newAnchor) {
      // REPLAY, don't guess.
      //
      // This used to assign service.basePrice, which is only correct for a
      // service with no tree. A finished-wall outlet or a six-light recessed
      // job has a standalone price that depends on its own answers — the
      // stored snapshot is exactly what's needed to work it out, and it was
      // sitting there unread.
      //
      // Same authority rule as POST: the price comes from replaying the
      // route, not from a constant.
      const service = await loadServiceForResolution(prisma, newAnchor.serviceId);
      const settings = await loadPricingSettings(prisma);

      if (service) {
        const answers = (newAnchor.answersSnapshot ?? {}) as Record<string, string>;
        const resolved = resolveRoute(service, answers, true, settings);

        if (resolved.status === "PRICED") {
          pricingAdjusted = true;
          await prisma.lineItem.update({
            where: { id: newAnchor.id },
            data: {
              isPrimary: true,
              computedPriceCents: resolved.priceCents,
              estimatedMinutes: resolved.config.estimatedMinutes,
              resolvedCrewHours: resolved.config.fieldLaborHours,
              resolvedCrewCount: resolved.config.techCount,
            },
          });
        } else {
          // The line can't be repriced as a standalone job — its route may
          // only have been valid as an add-on, or the tree may have changed.
          // Promote it anyway so the visit has an anchor, but leave it
          // unpriced so scheduling blocks and the office sees it, rather than
          // inventing a figure.
          console.error(
            `[visit] promoted ${service.slug} but could not reprice it: ` +
              ("reason" in resolved ? resolved.reason : resolved.status)
          );
          pricingAdjusted = true;
          await prisma.lineItem.update({
            where: { id: newAnchor.id },
            data: { isPrimary: true, computedPriceCents: null },
          });
        }
      }
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
