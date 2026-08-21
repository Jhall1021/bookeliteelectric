import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

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
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { serviceId, answersSnapshot, photos, name, email, phone, floorPriceCents } = body;

  if (!serviceId || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "Missing serviceId or photos" }, { status: 400 });
  }
  if (!name || !email) {
    return NextResponse.json({ error: "Missing name or email" }, { status: 400 });
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { estimatedMinutes: true },
  });

  // Contact details are still collected here — it's how the office reaches
  // them with the price. Checkout would normally capture this, but they can't
  // reach checkout until the quote comes back.
  const customer = await prisma.customer.create({ data: { name, email, phone } });

  let visit = await prisma.visit.findFirst({ where: { sessionId, status: "OPEN" } });
  if (!visit) {
    visit = await prisma.visit.create({ data: { sessionId, status: "OPEN" } });
  }

  // Line item and quote are created together — a quote with no line item
  // leaves the customer wondering where their request went, and a line item
  // with no quote is an unpriced row nobody is working on.
  const { quote, lineItem } = await prisma.$transaction(async (tx) => {
    const isFirst = (await tx.lineItem.count({ where: { visitId: visit!.id } })) === 0;

    const li = await tx.lineItem.create({
      data: {
        visitId: visit!.id,
        serviceId,
        isPrimary: isFirst,
        answersSnapshot: answersSnapshot ?? {},
        // Unpriced until the office says otherwise.
        computedPriceCents: null,
        // The accumulated total where the flow stopped. A floor, not a guess.
        floorPriceCents: typeof floorPriceCents === "number" ? floorPriceCents : null,
        estimatedMinutes: service?.estimatedMinutes ?? null,
      },
    });

    const q = await tx.quote.create({
      data: {
        customerId: customer.id,
        serviceId,
        visitId: visit!.id,
        lineItemId: li.id,
        answersSnapshot: answersSnapshot ?? {},
        status: "SUBMITTED",
        photos: {
          create: photos.map((p: { url: string; label: string }) => ({
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
}
