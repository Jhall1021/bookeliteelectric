import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWindowAvailabilityForDay } from "@/lib/jobber";

// Deliberately un-cached — always hits Jobber fresh. This is what makes
// clicking a day tab actually reflect whatever's really on the calendar
// right now, not a snapshot from whenever the page first loaded.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { dateISO: string } }) {
  const eligibleCrews = await prisma.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);

  const windows = await getWindowAvailabilityForDay(params.dateISO, eligibleIds);
  return NextResponse.json({ windows });
}
