import { NextResponse } from "next/server";
import { loadBusinessHours, generateArrivalWindows, toDisplay, toMinutes } from "@/lib/businessHours";
import {
  windowAvailabilityForDay,
  visitJobDurationMinutes,
  SchedulingUnavailableError,
  SchedulingNotConfiguredError,
} from "@/lib/schedulingAvailability";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { getSessionId } from "@/lib/session";
import { isServiceDate } from "@/lib/serviceDate";

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

  // A service date, exactly. Anything else is not a day that can be scheduled.
  if (!isServiceDate(params.dateISO)) {
    return NextResponse.json({ error: "INVALID_SERVICE_DATE" }, { status: 400 });
  }

  return withSite(site, async (db) => {
    // The crew list is no longer read here. Who is authoritative about this
    // contractor's calendar is the scheduling authority's business, and
    // reading crews at the call site is what let a NATIVE contractor be
    // answered by Jobber's rules.
    const businessHours = await loadBusinessHours(db, site.contractorId);

    // THE JOB'S LENGTH COMES FROM THE VISIT, NOT FROM THE REQUEST.
    //
    // The schedule page's first day applied the visit's duration on the server,
    // but every later day came through here, and this route never read one:
    // the client's `?duration=` was ignored, so a day tab offered windows the
    // job could not finish in and checkout then refused them as
    // WINDOW_TOO_LATE. The duration is read the same way the page and checkout
    // read it — the open visit's snapshotted line minutes — so all three agree,
    // and nothing a browser sends can shorten a job. Read-only: getSessionId
    // never mints a session. No visit (or an incomplete estimate) means no
    // duration, exactly as on the page.
    const sessionId = getSessionId();
    const visit = sessionId
      ? await db.visit.findFirst({
          where: { contractorId: site.contractorId, sessionId, status: "OPEN" },
          select: { lineItems: { select: { estimatedMinutes: true } } },
        })
      : null;
    const estimatedDurationMinutes = visit ? visitJobDurationMinutes(visit.lineItems) : null;

    try {
      const windows = await windowAvailabilityForDay(db, site.contractorId, params.dateISO, {
        windows: generateArrivalWindows(businessHours),
        dayEndDisplay: toDisplay(toMinutes(businessHours.dayEnd)),
      }, estimatedDurationMinutes);
      return NextResponse.json({ windows });
    } catch (err) {
      if (err instanceof SchedulingNotConfiguredError) {
        // NOT retriable, and deliberately not an empty window list: a day with
        // no windows reads as "fully booked", which is a different and
        // untrue thing to tell a homeowner.
        return NextResponse.json(
          {
            error: "SCHEDULING_NOT_CONFIGURED",
            retriable: false,
            message: "Online booking isn't available for this business yet. Please give us a call.",
          },
          { status: 503 }
        );
      }
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
