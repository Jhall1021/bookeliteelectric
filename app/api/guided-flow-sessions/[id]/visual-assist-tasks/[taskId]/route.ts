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

    const body = await req.json();
    const updated = await db.guidedFlowVisualAssistTask.update({
      where: { id: params.taskId },
      data: { status: "COMPLETED", result: body.result ?? {}, completedAt: new Date() },
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  });
}
