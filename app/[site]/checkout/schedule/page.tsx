import { prisma } from "@/lib/prisma";
import { getWindowAvailabilityForDay, SchedulingUnavailableError } from "@/lib/jobber";
import {
  loadBusinessHours,
  nextWorkingDays,
  generateArrivalWindows,
  toDisplay,
  toMinutes,
} from "@/lib/businessHours";
import { getSessionId } from "@/lib/session";
import ScheduleClient from "@/components/checkout/ScheduleClient";
import { redirect } from "next/navigation";
import { requireHostedSite, withSite } from "@/lib/siteRouting";

// Same reasoning as the API route — never statically cache this page.
// The whole point is a live check every time someone actually looks.
export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: { site: string } }) {
  // ADR §2.2. Booking hours belong to a contractor, so the storefront has to
  // be resolved before they are read.
  const site = await requireHostedSite(params.site);

  // Working days come from configuration now. This used to exclude Saturday
  // and Sunday with a hardcoded check, which quietly disagreed with the
  // arrival windows and the end-of-day cutoff — three places encoding the
  // same working week, kept in step by hand.
  const businessHours = await withSite(site, (db) =>
    loadBusinessHours(db, site.contractorId)
  );
  const days = nextWorkingDays(5, businessHours).map((d) => ({
    date: d.toISOString(),
    dateISO: d.toISOString().split("T")[0],
  }));

  // The customer's current cart already has estimatedMinutes snapshotted
  // on every line item at add-time — so the real job length is known
  // before checkout even happens, and windows can correctly reflect it
  // (a long job blocks longer than the 3-hour arrival window itself; see
  // effectiveBusySpan in lib/jobber.ts). Missing entirely just means an
  // empty cart or incomplete estimates — falls back to the flat window.
  // READ-ONLY. getOrCreateSessionId() SETS a cookie, and a Server Component
  // cannot — Next throws "Cookies can only be modified in a Server Action or
  // Route Handler" and the page 500s. lib/session.ts already documents this
  // and provides getSessionId() for pages; this was the one page still using
  // the writing variant.
  //
  // It only showed up for a visitor with NO cookie yet, so the flow hid it:
  // anyone arriving through the cart already had one. A bookmarked or shared
  // link 500'd. Verified present on production before this branch.
  const sessionId = getSessionId();
  // ADR-011. Keyed on the contractor this storefront resolved to, not on the
  // session cookie alone.
  const visit = sessionId
    ? await withSite(site, (db) =>
        db.visit.findFirst({
          where: { contractorId: site.contractorId, sessionId, status: "OPEN" },
          include: { lineItems: true },
        })
      )
    : null;
  // Nothing gets scheduled while a line is still being priced. The cart
  // disables the button, but a customer who bookmarked this page or hit back
  // would otherwise walk straight past it.
  const awaitingQuote = visit?.lineItems.some((li) => li.computedPriceCents === null) ?? false;
  if (awaitingQuote) redirect(`/${params.site}/my-visit`);

  const hasCompleteEstimates = !!visit && visit.lineItems.every((li) => li.estimatedMinutes !== null);
  const estimatedDurationMinutes = hasCompleteEstimates
    ? visit!.lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0)
    : null;

  // Only the first (default-selected) day is checked here, on the server,
  // for a fast initial render with no loading flicker. Every other day —
  // including this one again if you navigate away and back — gets a
  // fresh client-side check the moment its tab is actually clicked.
  // Guarded: crew members are contractor-owned (ADR-011). Unscoped, this
  // returned every contractor's crew and so decided this storefront's
  // availability from other businesses' schedules.
  const eligibleCrews = await withSite(site, (db) =>
    db.jobberCrewMember.findMany({
      where: { eligibleForWebsiteBookings: true },
      select: { jobberUserId: true },
    })
  );
  const eligibleIds = eligibleCrews.map((c) => c.jobberUserId);
  // The server-rendered first day gets the same treatment as every later one:
  // if the calendar cannot be read, the page says so rather than shipping a
  // list of windows nobody verified.
  let firstDayWindows: { start: string; end: string; available: boolean }[] = [];
  let schedulingUnavailable = false;
  try {
    firstDayWindows = await getWindowAvailabilityForDay(
      site.contractorId,
      days[0].dateISO,
      eligibleIds,
      estimatedDurationMinutes,
      {
        windows: generateArrivalWindows(businessHours),
        dayEndDisplay: toDisplay(toMinutes(businessHours.dayEnd)),
      }
    );
  } catch (err) {
    if (!(err instanceof SchedulingUnavailableError)) throw err;
    schedulingUnavailable = true;
  }

  return (
    <ScheduleClient
      days={days}
      initialWindows={firstDayWindows}
      estimatedDurationMinutes={estimatedDurationMinutes}
      initiallyUnavailable={schedulingUnavailable}
    />
  );
}
