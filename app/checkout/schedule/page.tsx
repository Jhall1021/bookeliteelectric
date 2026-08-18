import { prisma } from "@/lib/prisma";
import { getWindowAvailabilityForDay } from "@/lib/jobber";
import ScheduleClient from "@/components/checkout/ScheduleClient";

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

  // Only the first (default-selected) day is checked here, on the server,
  // for a fast initial render with no loading flicker. Every other day —
  // including this one again if you navigate away and back — gets a
  // fresh client-side check the moment its tab is actually clicked.
  const eligibleCrews = await prisma.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);
  const firstDayWindows = await getWindowAvailabilityForDay(days[0].dateISO, eligibleIds);

  return <ScheduleClient days={days} initialWindows={firstDayWindows} />;
}
