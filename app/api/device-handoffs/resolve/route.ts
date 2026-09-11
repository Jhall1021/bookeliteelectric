import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { connectHandoff, resolveHandoffByToken } from "@/lib/deviceHandoffStore";
import { loadSession } from "@/lib/guidedFlowSession";
import { SESSION_COOKIE } from "@/lib/session";

// GET ?token=...
//
// The phone's first request after scanning the QR code. On success, this
// is the ONE place that makes the phone a genuine second holder of the
// desktop's anonymous session token — see app/api/guided-flow-sessions/
// [id]/route.ts's header comment for why nothing else needs a cross-device
// special case once this has run. Every failure reads the same neutral
// shape: no reason that distinguishes "expired" from "wrong token" from
// "revoked" reaches the response body, per docs/design/device-handoff-v1.md
// ("do not expose quote details").
export async function GET(req: Request) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });

    const resolved = await resolveHandoffByToken(db, token);
    if (!resolved.ok) {
      // Every failure reason collapses to the same neutral response —
      // TOKEN_MISMATCH, EXPIRED, REVOKED and NOT_FOUND all look identical
      // from here, on purpose.
      return NextResponse.json({ error: "This link isn't valid or has expired." }, { status: 404 });
    }

    const session = await loadSession(db, resolved.handoff.guidedFlowSessionId);
    if (!session || session.contractorId !== site.contractorId) {
      return NextResponse.json({ error: "This link isn't valid or has expired." }, { status: 404 });
    }

    await connectHandoff(db, resolved.handoff.id);

    // Join this browser into the SAME anonymous homeowner identity the
    // desktop already has — same cookie shape lib/session.ts already
    // issues, just set to an existing value instead of a new random one.
    cookies().set(SESSION_COOKIE, session.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({
      guidedFlowSessionId: session.id,
      serviceSlug: session.serviceSlug,
      taskType: resolved.handoff.taskType,
      taskId: resolved.handoff.taskId,
      handoffId: resolved.handoff.id,
    });
  });
}
