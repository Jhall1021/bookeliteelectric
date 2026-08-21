import { prisma } from "@/lib/prisma";
import { getWindowAvailabilityForDay } from "@/lib/jobber";
import { getOrCreateSessionId } from "@/lib/session";
import ScheduleClient from "@/components/checkout/ScheduleClient";
import { redirect } from "next/navigation";

// Same reasoning as the API route — never statically cache this page.
// The whole point is a live check every time someone actually looks.
export const dynamic = "force-dynamic";

function nextWeekdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
  }
  return days;
}

export default async function SchedulePage() {
  const days = nextWeekdays(5).map((d) => ({
    date: d.toISOString(),
    dateISO: d.toISOString().split("T")[0],
  }));

  // The customer's current cart already has estimatedMinutes snapshotted
  // on every line item at add-time — so the real job length is known
  // before checkout even happens, and windows can correctly reflect it
  // (a long job blocks longer than the 3-hour arrival window itself; see
  // effectiveBusySpan in lib/jobber.ts). Missing entirely just means an
  // empty cart or incomplete estimates — falls back to the flat window.
  const sessionId = getOrCreateSessionId();
  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: { lineItems: true },
  });
  // Nothing gets scheduled while a line is still being priced. The cart
  // disables the button, but a customer who bookmarked this page or hit back
  // would otherwise walk straight past it.
  const awaitingQuote = visit?.lineItems.some((li) => li.computedPriceCents === null) ?? false;
  if (awaitingQuote) redirect("/my-visit");

  const hasCompleteEstimates = !!visit && visit.lineItems.every((li) => li.estimatedMinutes !== null);
  const estimatedDurationMinutes = hasCompleteEstimates
    ? visit!.lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0)
    : null;

  // Only the first (default-selected) day is checked here, on the server,
  // for a fast initial render with no loading flicker. Every other day —
  // including this one again if you navigate away and back — gets a
  // fresh client-side check the moment its tab is actually clicked.
  const eligibleCrews = await prisma.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);
  const firstDayWindows = await getWindowAvailabilityForDay(days[0].dateISO, eligibleIds, estimatedDurationMinutes);

  return (
    <ScheduleClient
      days={days}
      initialWindows={firstDayWindows}
      estimatedDurationMinutes={estimatedDurationMinutes}
    />
  );
}
