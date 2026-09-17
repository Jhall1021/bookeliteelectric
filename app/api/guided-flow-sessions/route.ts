import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOrCreateActiveSession, resolveEntryProvenance } from "@/lib/guidedFlowSession";

// POST body: { serviceSlug, entryServiceId?, entryServiceSlug? }
//
// Finds or creates the ACTIVE GuidedFlowSession for this browser+service —
// same identity narrowing every other homeowner-facing route already uses
// (ADR §2.2: site resolves the tenant FIRST, never a resource the caller
// names). Returns just enough for the client to seed its own walk: the
// answers so far, never anything this system computed from them.
//
// entryServiceId/entryServiceSlug, when present, are a CLAIM arriving from
// the reroute handoff (client-writable sessionStorage) — never trusted as
// typed. resolveEntryProvenance re-validates the id against a real, active
// service on THIS SAME contractor before it can influence the new row; an
// invalid or cross-contractor claim silently falls back to the target
// session's own service identity (findOrCreateActiveSession's own default),
// never surfaced as an error and never left half-trusted.
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
    const { serviceSlug, entryServiceId, entryServiceSlug } = body;
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

    const provenance = await resolveEntryProvenance(db, site.contractorId, {
      entryServiceId: typeof entryServiceId === "string" ? entryServiceId : null,
      entryServiceSlug: typeof entryServiceSlug === "string" ? entryServiceSlug : null,
    });

    const session = await findOrCreateActiveSession(db, {
      contractorId: site.contractorId,
      sessionId,
      serviceId: service.id,
      serviceSlug: service.slug,
      entryServiceId: provenance?.entryServiceId,
      entryServiceSlug: provenance?.entryServiceSlug,
    });

    return NextResponse.json({
      id: session.id,
      version: session.version,
      status: session.status,
      consumedAnswers: session.consumedAnswers,
      customerNote: session.customerNote,
      entryServiceId: session.entryServiceId,
      entryServiceSlug: session.entryServiceSlug,
    });
  });
}
