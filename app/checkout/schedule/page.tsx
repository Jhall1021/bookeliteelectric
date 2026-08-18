import { prisma } from "@/lib/prisma";
import { getWindowAvailabilityForDay } from "@/lib/jobber";
import ScheduleClient from "@/components/checkout/ScheduleClient";

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
  const eligibleCrews = await prisma.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);

  const days = nextWeekdays(5);

  // Sequential, not Promise.all — Jobber's rate limiting is per
  // app/account, and this is only 5 calls on a page load, not a hot path.
  const dayAvailability = [];
  for (const day of days) {
    const dateISO = day.toISOString().split("T")[0];
    const windows = await getWindowAvailabilityForDay(dateISO, eligibleIds);
    dayAvailability.push({ date: day.toISOString(), dateISO, windows });
  }

  return <ScheduleClient days={dayAvailability} />;
}
