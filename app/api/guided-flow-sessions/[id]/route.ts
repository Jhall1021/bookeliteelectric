import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { loadSession, updateSessionAnswers } from "@/lib/guidedFlowSession";

/**
 * Ownership check every route in this file shares: the caller's own
 * anonymous session token must match the one stored on the row, or this
 * reads as 404 — never 403, so a guessed id can't be used to confirm a
 * session exists. This is the same check `DELETE /api/visit` already makes
 * (`lineItem.visit.sessionId !== sessionId`).
 *
 * A second device (a phone that scanned a Device Handoff QR) satisfies this
 * check too, but not by a special case here — the handoff-resolve endpoint
 * is what makes the phone's OWN cookie equal to the desktop's session token
 * in the first place (see app/api/device-handoffs/resolve/route.ts). From
 * that point on the phone genuinely IS a second holder of the same
 * anonymous identity, the same way two tabs in one browser already are —
 * this route never has to know or care how many devices hold that token.
 */
async function loadOwnedSession(db: Parameters<typeof loadSession>[0], id: string, sessionId: string) {
  const session = await loadSession(db, id);
  if (!session || session.sessionId !== sessionId) return null;
  return session;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const session = await loadOwnedSession(db, params.id, sessionId);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      id: session.id,
      version: session.version,
      status: session.status,
      consumedAnswers: session.consumedAnswers,
      customerNote: session.customerNote,
      serviceSlug: session.serviceSlug,
    });
  });
}

// PATCH body: { expectedVersion, consumedAnswers, customerNote? }
//
// Optimistic-concurrency write — docs/design/guided-flow-session-v1.md §5.
// A stale `expectedVersion` is rejected with 409 and the CURRENT state, so
// the caller can reconcile rather than retry blindly with the same payload.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }
  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const owned = await loadOwnedSession(db, params.id, sessionId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const { expectedVersion, consumedAnswers, customerNote } = body;
    if (typeof expectedVersion !== "number" || typeof consumedAnswers !== "object" || consumedAnswers === null) {
      return NextResponse.json({ error: "Missing expectedVersion or consumedAnswers" }, { status: 400 });
    }

    const outcome = await updateSessionAnswers(db, {
      id: params.id,
      expectedVersion,
      consumedAnswers,
      customerNote: typeof customerNote === "string" ? customerNote : undefined,
    });

    if (!outcome.ok) {
      const current = await loadSession(db, params.id);
      return NextResponse.json(
        {
          error: outcome.reason,
          current: current
            ? {
                version: current.version,
                status: current.status,
                consumedAnswers: current.consumedAnswers,
                customerNote: current.customerNote,
              }
            : null,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      id: outcome.session.id,
      version: outcome.session.version,
      status: outcome.session.status,
      consumedAnswers: outcome.session.consumedAnswers,
      customerNote: outcome.session.customerNote,
    });
  });
}
