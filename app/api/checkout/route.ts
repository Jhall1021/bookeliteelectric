import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { pushBookingToJobber, pickCrewForWindow, effectiveBusySpan } from "@/lib/jobber";
import { sendBookingConfirmationEmail } from "@/lib/email";

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

  // Internal dispatch data — sum of every line item's snapshotted duration.
  // Null (not 0) if ANY item is missing an estimate, so it's obvious in the
  // data that the total is incomplete rather than silently under-counting.
  // Computed here, before the availability check below, since a job
  // longer than its arrival window needs to correctly block a crew's
  // calendar for its real length, not just the 3-hour window.
  const hasCompleteEstimates = visit.lineItems.every((li) => li.estimatedMinutes !== null);
  const estimatedDurationMinutes = hasCompleteEstimates
    ? visit.lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0)
    : null;

  // Final, live availability check — right here, right before anything is
  // created. The schedule page only re-checks Jobber when a day tab is
  // actually clicked; the DEFAULT day shown on first load never gets a
  // second look unless someone switches away and back. Between that
  // initial snapshot and a customer actually finishing checkout (a
  // multi-step flow — schedule, then details, then submit), real time
  // passes and the calendar can genuinely change. This is the one place
  // that's guaranteed to check the instant a booking is actually about to
  // be committed, and it's what stops a booking from being created at all
  // for a window that's no longer really open — rather than creating it
  // anyway and only discovering the conflict later trying to push to Jobber.
  const dateISO = new Date(date).toISOString().split("T")[0];
  const eligibleCrews = await prisma.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const [windowStartDate, windowEndDate] = effectiveBusySpan(dateISO, windowStart, windowEnd, estimatedDurationMinutes);
  const assignedCrewId = await pickCrewForWindow(
    dateISO,
    windowStartDate,
    windowEndDate,
    eligibleCrews.map((c) => c.jobberUserId)
  );

  if (!assignedCrewId) {
    return NextResponse.json(
      { error: "Sorry, that arrival window was just taken. Please go back and pick another." },
      { status: 409 }
    );
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
      estimatedDurationMinutes,
      // Card-on-file, captured after completion — decided in the approved
      // architecture. Real Stripe SetupIntent wiring is Phase 6; for now
      // paymentStatus reflects that no charge has happened yet.
      paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
      paymentStatus: "pending_card_capture_setup",
    },
  });

  await prisma.visit.update({ where: { id: visit.id }, data: { status: "CHECKED_OUT" } });

  // Push to Jobber immediately, not as a separate manual admin step —
  // this is what actually closes the double-booking gap: the moment
  // real capacity is claimed on the site, it needs to be reflected on
  // the real Jobber calendar before anyone else's availability check can
  // see it. Deliberately non-blocking: if Jobber is down, disconnected,
  // or errors for any reason, the customer still gets their booking and
  // confirmation — the admin "Send to Jobber" button on /admin/bookings
  // still exists as a manual fallback/retry for exactly this case.
  //
  // One retry after a short pause for genuinely transient failures (a
  // momentary network blip, a cold-start hiccup). NOT a fix for a real
  // platform timeout — this push chain is 3-4 sequential Jobber calls,
  // and retrying a request that's already timing out only makes it worse.
  // If failures persist, check Vercel's runtime logs for this route: a
  // MISSING log line (not even the console.error below) points to a
  // timeout, not a caught error, and needs a different fix (decoupling
  // the Jobber push from the customer-facing response entirely).
  try {
    let result;
    try {
      result = await pushBookingToJobber(booking.id, assignedCrewId);
    } catch (firstErr) {
      console.warn(`First Jobber push attempt failed for booking ${booking.id}, retrying once:`, firstErr);
      await new Promise((r) => setTimeout(r, 750));
      result = await pushBookingToJobber(booking.id, assignedCrewId);
    }
    await prisma.booking.update({ where: { id: booking.id }, data: { jobberJobId: result.jobberJobId } });
  } catch (err) {
    console.error(`Automatic Jobber push failed for booking ${booking.id} after retry — needs manual "Send to Jobber":`, err);
  }

  // Same non-blocking pattern as the Jobber push — an email hiccup should
  // never prevent a customer from getting their booking confirmed.
  try {
    await sendBookingConfirmationEmail(booking.id);
  } catch (err) {
    console.error(`Confirmation email failed for booking ${booking.id}:`, err);
  }

  return NextResponse.json({ bookingId: booking.id });
}
