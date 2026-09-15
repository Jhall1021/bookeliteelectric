import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { loadSession } from "@/lib/guidedFlowSession";

// PATCH body: { result } — marks the task COMPLETED with its canonical
// result. Whichever device finishes the task calls this; every device
// reading the session afterward (GET .../visual-assist-tasks) sees the
// same row.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
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

    const task = await db.guidedFlowVisualAssistTask.findUnique({ where: { id: params.taskId } });
    if (!task || task.guidedFlowSessionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (
      !body ||
      !Object.prototype.hasOwnProperty.call(body, "result") ||
      body.result === null ||
      typeof body.result !== "object" ||
      Array.isArray(body.result)
    ) {
      return NextResponse.json({ error: "Missing or invalid result" }, { status: 400 });
    }

    /**
     * FIRST ACCEPTED COMPLETION WINS.
     *
     * Desktop and phone can both legitimately finish the same canonical task.
     * A read-then-update sequence lets both readers observe PENDING and makes
     * the later write overwrite the earlier result. Put PENDING in the UPDATE
     * predicate instead: only one concurrent caller can change the row.
     *
     * A losing/retried PATCH is idempotent. It receives the already-completed
     * task and may continue, but it never replaces the canonical result.
     */
    const won = await db.guidedFlowVisualAssistTask.updateMany({
      where: {
        id: params.taskId,
        guidedFlowSessionId: params.id,
        status: "PENDING",
      },
      data: {
        status: "COMPLETED",
        result: body.result,
        completedAt: new Date(),
      },
    });

    const current = await db.guidedFlowVisualAssistTask.findUnique({ where: { id: params.taskId } });
    if (!current || current.guidedFlowSessionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: current.id,
      status: current.status,
      accepted: won.count === 1,
    });
  });
}
