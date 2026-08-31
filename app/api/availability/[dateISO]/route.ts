import { NextResponse } from "next/server";
import { getWindowAvailabilityForDay, SchedulingUnavailableError } from "@/lib/jobber";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";

// Deliberately un-cached — always hits Jobber fresh. This is what makes
// clicking a day tab actually reflect whatever's really on the calendar
// right now, not a snapshot from whenever the page first loaded.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { dateISO: string } }) {
  // ADR §2.2. This is a customer-facing API and had no tenant identity at all:
  // it read every contractor's crew and answered with availability computed
  // from all of them. Which windows a storefront offers is that contractor's
  // capacity, so the site has to say who is asking.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  return withSite(site, async (db) => {
    const eligibleCrews = await db.jobberCrewMember.findMany({
      where: { eligibleForWebsiteBookings: true },
      select: { jobberUserId: true },
    });
    const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);

    try {
      const windows = await getWindowAvailabilityForDay(site.contractorId, params.dateISO, eligibleIds);
      return NextResponse.json({ windows });
    } catch (err) {
      if (!(err instanceof SchedulingUnavailableError)) throw err;
      // A named, retriable condition rather than a 500. The client shows a
      // temporary state instead of slots; it does not fall back to offering
      // every window, which is what this replaced.
      return NextResponse.json(
        {
          error: "SCHEDULING_UNAVAILABLE",
          retriable: true,
          message: "We can't check our schedule right now. Please try again in a moment.",
        },
        { status: 503 }
      );
    }
  });
}
