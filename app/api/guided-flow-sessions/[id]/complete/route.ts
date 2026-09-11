import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { completeSession, loadSession } from "@/lib/guidedFlowSession";

// POST body: { expectedVersion, lineItemId?, quoteId? }
//
// Called ONLY right after the terminal write it describes already
// succeeded (POST /api/visit or /api/quotes) — never before, so a session
// can't read COMPLETED while the booking it points at failed to save. See
// docs/design/guided-flow-session-v1.md §9.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const session = await loadSession(db, params.id);
    if (!session || session.sessionId !== sessionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const { expectedVersion, lineItemId, quoteId } = body;
    if (typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "Missing expectedVersion" }, { status: 400 });
    }

    const outcome = await completeSession(db, {
      id: params.id,
      expectedVersion,
      lineItemId: typeof lineItemId === "string" ? lineItemId : null,
      quoteId: typeof quoteId === "string" ? quoteId : null,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.reason }, { status: 409 });
    }
    return NextResponse.json({ id: outcome.session.id, status: outcome.session.status });
  });
}
