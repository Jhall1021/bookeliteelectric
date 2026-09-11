import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOrCreateActiveSession } from "@/lib/guidedFlowSession";

// POST body: { serviceSlug }
//
// Finds or creates the ACTIVE GuidedFlowSession for this browser+service —
// same identity narrowing every other homeowner-facing route already uses
// (ADR §2.2: site resolves the tenant FIRST, never a resource the caller
// names). Returns just enough for the client to seed its own walk: the
// answers so far, never anything this system computed from them.
export async function POST(req: Request) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const body = await req.json();
    const { serviceSlug } = body;
    if (!serviceSlug || typeof serviceSlug !== "string") {
      return NextResponse.json({ error: "Missing serviceSlug" }, { status: 400 });
    }

    const service = await db.service.findUnique({
      where: { contractorId_slug: { contractorId: site.contractorId, slug: serviceSlug } },
      select: { id: true, slug: true, active: true },
    });
    if (!service || !service.active) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }

    const session = await findOrCreateActiveSession(db, {
      contractorId: site.contractorId,
      sessionId,
      serviceId: service.id,
      serviceSlug: service.slug,
    });

    return NextResponse.json({
      id: session.id,
      version: session.version,
      status: session.status,
      consumedAnswers: session.consumedAnswers,
      customerNote: session.customerNote,
    });
  });
}
