import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { completeHandoff } from "@/lib/deviceHandoffStore";
import { loadSession } from "@/lib/guidedFlowSession";

// POST — called by the phone once its task (e.g. Route Assist) is done.
// The phone is, by this point, a holder of the same session token the
// desktop has (joined during /resolve), so the ownership check here is the
// same shape as every other route in this file — no special case for
// "this is the second device."
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const handoff = await db.deviceHandoff.findUnique({ where: { id: params.id } });
    if (!handoff) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const session = await loadSession(db, handoff.guidedFlowSessionId);
    if (!session || session.sessionId !== sessionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await completeHandoff(db, params.id);
    return NextResponse.json({ id: updated?.id, status: updated?.status });
  });
}
