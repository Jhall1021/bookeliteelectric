import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalize } from "@/lib/serviceMatch";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";

/**
 * Did the customer take the suggestion?
 *
 * The single most useful signal here. A service suggested often and accepted
 * rarely is named in words nobody recognizes — which is a content problem the
 * matching can't fix, and one nothing else would surface.
 *
 * Fire-and-forget: the customer is already navigating, and a failure here
 * must never interrupt that.
 */
export async function POST(req: Request) {
  try {
    const { text, accepted } = await req.json();
    if (typeof text !== "string") return NextResponse.json({ ok: true });

    // ADR-008: this contractor's counters. Keyed on the phrase alone, one
    // contractor's customer rejecting a suggestion moved ANOTHER contractor's
    // accept/reject counts — quietly corrupting the signal each of them uses
    // to judge their own service naming.
    //
    // The site is resolved first, like every other customer API. Fire and
    // forget still: the customer is already navigating.
    const site = await requireSiteFromRequest(req);
    await withSite(site, (db) =>
      db.serviceQuery.updateMany({
        where: { normalizedText: normalize(text) },
        data: accepted
          ? { timesAccepted: { increment: 1 } }
          : { timesRejected: { increment: 1 } },
      })
    );
  } catch {
    // Deliberately silent.
  }
  return NextResponse.json({ ok: true });
}
