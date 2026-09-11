import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { desktopStatus } from "@/lib/deviceHandoffStore";
import { loadSession } from "@/lib/guidedFlowSession";

// GET — the desktop's polling endpoint. §13 of the brief: polling every
// few seconds, no WebSockets, no new realtime infrastructure — this is the
// entire mechanism.
export async function GET(req: Request, { params }: { params: { id: string } }) {
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
    // Only the ORIGINATING device (the one whose session token created this
    // handoff) may poll its status — the phone doesn't need to, it already
    // has everything from the resolve response.
    if (!session || session.sessionId !== sessionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const status = await desktopStatus(db, params.id);
    return NextResponse.json({ status });
  });
}
