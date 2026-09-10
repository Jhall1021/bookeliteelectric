import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { hostedSurface } from "@/lib/storefrontSurface";
import { handoffUrl } from "@/lib/device-handoff";
import { createAndPersistHandoff } from "@/lib/deviceHandoffStore";
import { loadSession } from "@/lib/guidedFlowSession";

// POST body: { guidedFlowSessionId, taskType, taskId? }
//
// The desktop calls this when it reaches a camera-required step. Returns a
// QR-ready URL carrying ONLY the opaque raw token — never the session id,
// never the task id, never anything about the flow (docs/design/
// device-handoff-v1.md's security section; enforced structurally by
// `handoffUrl`'s own signature, which has no parameter for either).
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
    const { guidedFlowSessionId, taskType, taskId } = body;
    if (!guidedFlowSessionId || !taskType) {
      return NextResponse.json({ error: "Missing guidedFlowSessionId or taskType" }, { status: 400 });
    }

    const session = await loadSession(db, guidedFlowSessionId);
    if (!session || session.sessionId !== sessionId || session.contractorId !== site.contractorId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // UNGUARDED CLIENT, DELIBERATELY — same precedent as Photo in
    // POST /api/visit: DeviceHandoff derives its owner through
    // GuidedFlowSession, so it has no contractorId of its own to stamp, and
    // the guard correctly refuses a direct create rather than inventing
    // one. The ownership proof is already done above: `session` came back
    // from the GUARDED `loadSession(db, ...)` call and was checked against
    // `site.contractorId`, so a foreign session would have been null and
    // this line would never run.
    const { id, rawToken, expiresAt } = await createAndPersistHandoff(prisma, {
      guidedFlowSessionId,
      taskType,
      taskId: typeof taskId === "string" ? taskId : null,
    });

    // Standalone, non-embedded surface — a QR-scanned phone opens the real
    // hosted page directly, never the contractor's iframe.
    const origin = new URL(req.url).origin;
    const base = hostedSurface(site.hostedSlug).basePath;
    const url = handoffUrl(`${origin}${base}`, rawToken);

    return NextResponse.json({ id, url, expiresAt });
  });
}
