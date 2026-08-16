import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

export async function POST(req: Request) {
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { name, email, phone, address, zipCode, date, windowStart, windowEnd } = body;

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: { lineItems: true },
  });

  if (!visit || visit.lineItems.length === 0) {
    return NextResponse.json({ error: "No items in visit" }, { status: 400 });
  }

  const customer = await prisma.customer.create({ data: { name, email, phone } });

  // Phase 2 stub: find-or-create the ArrivalWindow for this date/time rather
  // than requiring admin-seeded capacity data up front. Real capacity
  // enforcement (booked vs. total) is Phase 6.
  let serviceArea = await prisma.serviceArea.findFirst({ where: { active: true } });
  if (!serviceArea) {
    serviceArea = await prisma.serviceArea.create({
      data: { name: "Monmouth & Ocean Counties, NJ", zipCodes: [], active: true },
    });
  }

  let arrivalWindow = await prisma.arrivalWindow.findFirst({
    where: { date: new Date(date), startTime: windowStart, endTime: windowEnd, serviceAreaId: serviceArea.id },
  });
  if (!arrivalWindow) {
    arrivalWindow = await prisma.arrivalWindow.create({
      data: {
        date: new Date(date),
        startTime: windowStart,
        endTime: windowEnd,
        serviceAreaId: serviceArea.id,
        capacityTotal: 4,
      },
    });
  }

  const totalCents = visit.lineItems.reduce((sum, li) => sum + li.computedPriceCents, 0);

  const booking = await prisma.booking.create({
    data: {
      visitId: visit.id,
      customerId: customer.id,
      address,
      zipCode,
      arrivalWindowId: arrivalWindow.id,
      totalCents,
      // Card-on-file, captured after completion — decided in the approved
      // architecture. Real Stripe SetupIntent wiring is Phase 6; for now
      // paymentStatus reflects that no charge has happened yet.
      paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
      paymentStatus: "pending_card_capture_setup",
    },
  });

  await prisma.visit.update({ where: { id: visit.id }, data: { status: "CHECKED_OUT" } });

  return NextResponse.json({ bookingId: booking.id });
}
