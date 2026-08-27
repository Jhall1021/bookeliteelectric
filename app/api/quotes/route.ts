import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import {
  loadServiceForResolution,
  loadPricingSettings,
  resolveRoute,
} from "@/lib/routeResolver";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOrCreateOpenVisit } from "@/lib/openVisit";

/**
 * A quote request.
 *
 * Body: { serviceId, answersSnapshot, photos: [{ url, label }],
 *         name, email, phone, floorPriceCents? }
 *
 * Photos are already in R2 by this point — the client got the URLs from
 * /api/uploads/presign — so this records the rows.
 *
 * WHAT CHANGED, AND WHY
 *
 * This used to create a standalone Quote and send the customer to a quote
 * page, which ended their session. Anything already in the cart was
 * abandoned, and if the quoted item was their first, they left with nothing
 * booked at all. Someone wanting a recessed light and a smoke detector got
 * stuck on the light and never booked the detector, which was instantly
 * bookable.
 *
 * Now a quote takes its place in the visit as an unpriced line item. The
 * customer keeps adding, sees a subtotal for everything that IS priced, and
 * schedules once the office has filled in the rest.
 */
export async function POST(req: Request) {
  // ADR §2.2. The site identifier the caller carries decides the tenant. The
  // old shape read the requested service and took ITS contractor, which
  // authorises access to a resource using that same resource.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { serviceId, answersSnapshot, photos, name, email, phone } = body;

  // floorPriceCents is deliberately NOT read from the body.
  //
  // It's shown to the customer as "From $X", which makes it a price — and a
  // price the browser supplies is a price the browser controls. The server
  // replays the route below and derives it, or stores null.
  if ("floorPriceCents" in body) {
    console.warn(`[quotes] client sent floorPriceCents for ${serviceId} — ignored.`);
  }

  if (!serviceId || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "Missing serviceId or photos" }, { status: 400 });
  }
  if (!name || !email) {
    return NextResponse.json({ error: "Missing name or email" }, { status: 400 });
  }

  // Replay the route to establish the floor ourselves. A review branch always
  // means the job costs MORE than what's accumulated so far, so the running
  // total is a genuine minimum — but only if we computed it.
  const service = await loadServiceForResolution(db, serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }

  // The contractor comes from the service being quoted. No ambient context is
  // needed: you are quoting that contractor's work, so you use their rate.
  // Throws rather than falling back if the service has no owner or the
  // contractor has no pricing settings — a quote at somebody else's rate is
  // worse than no quote.
  // The contractor comes from the SITE, not from the service being priced.
  const settings = await loadPricingSettings(db, site.contractorId);
  // Guarded, and keyed on the contractor (ADR-011). This decides whether the
  // quoted line is the visit's primary, which decides the price — counting
  // another contractor's open visit here would have priced this quote as an
  // add-on to a cart that is not ours.
  const existingCount = await db.lineItem.count({
    where: { visit: { contractorId: site.contractorId, sessionId, status: "OPEN" } },
  });
  const resolved = resolveRoute(
    service,
    (answersSnapshot ?? {}) as Record<string, string>,
    existingCount === 0,
    settings
  );
  const derivedFloor =
    resolved.status === "REVIEW" ? resolved.floorPriceCents : null;

  // Contact details are still collected here — it's how the office reaches
  // them with the price. Checkout would normally capture this, but they can't
  // reach checkout until the quote comes back.
  // Customer is a direct-owned root, so the guard stamps contractorId on the
  // create. It is created before the Quote that will reference it, which is
  // exactly why it could not derive an owner.
  const customer = await db.customer.create({ data: { name, email, phone } });

  const visit = await findOrCreateOpenVisit(db, site.contractorId, sessionId);

  // Line item and quote are created together — a quote with no line item
  // leaves the customer wondering where their request went, and a line item
  // with no quote is an unpriced row nobody is working on.
  // UNGUARDED CLIENT, DELIBERATELY. LineItem derives through Visit and Quote
  // derives through Service (ADR-010), so neither has a contractorId to stamp
  // and the guard refuses a direct create rather than inventing an owner.
  // Both parents are already proven: `visit` came from the guarded client
  // above, and `service` from the guarded loadServiceForResolution, so a
  // foreign id would have been null long before this line.
  const { quote, lineItem } = await prisma.$transaction(async (tx) => {
    const isFirst = (await tx.lineItem.count({ where: { visitId: visit.id } })) === 0;

    const li = await tx.lineItem.create({
      data: {
        visitId: visit.id,
        serviceId,
        isPrimary: isFirst,
        answersSnapshot: answersSnapshot ?? {},
        // Unpriced until the office says otherwise.
        computedPriceCents: null,
        // The accumulated total where the flow stopped. A floor, not a guess.
        floorPriceCents: derivedFloor,
        estimatedMinutes: service?.estimatedMinutes ?? null,
      },
    });

    const q = await tx.quote.create({
      data: {
        customerId: customer.id,
        serviceId,
        visitId: visit.id,
        lineItemId: li.id,
        answersSnapshot: answersSnapshot ?? {},
        status: "SUBMITTED",
        // contractorId stamped EXPLICITLY. This is a nested create, and
        // Prisma never fires the guard's extension for nested writes, so
        // nothing else would set Photo's owner. Do not assume the guard
        // covers this — scripts/verify-booking-tenancy.ts checks the stamped
        // owner against the quote's service afterwards.
        photos: {
          create: photos.map((p: { url: string; label: string }) => ({
            contractorId: site.contractorId,
            url: p.url,
            label: p.label,
            source: "CUSTOMER_PRE_BOOKING",
          })),
        },
      },
    });

    return { quote: q, lineItem: li };
  });

  return NextResponse.json({
    quoteId: quote.id,
    lineItemId: lineItem.id,
    visitId: visit.id,
  });
  });
}
