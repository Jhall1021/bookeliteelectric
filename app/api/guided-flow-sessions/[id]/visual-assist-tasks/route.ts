import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { loadSession } from "@/lib/guidedFlowSession";

/**
 * Generic Visual Assist task tracking for a GuidedFlowSession — not
 * Route-Assist-specific, see docs/design/guided-flow-session-v1.md §4.
 * POST registers that a task was requested (e.g. when a camera step is
 * reached); the caller — whichever device finishes the task — PATCHes it
 * complete with the result. One canonical result per task, visible to
 * every client reading this session, never a per-device copy (the brief's
 * explicit requirement: no DesktopRouteAssistResult / MobileRouteAssistResult).
 */

async function loadOwnedSession(db: Parameters<typeof loadSession>[0], id: string, sessionId: string) {
  const session = await loadSession(db, id);
  if (!session || session.sessionId !== sessionId) return null;
  return session;
}

// POST body: { taskType, taskKey? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
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
    const { taskType, taskKey } = body;
    if (!taskType) return NextResponse.json({ error: "Missing taskType" }, { status: 400 });

    // UNGUARDED CLIENT, DELIBERATELY — same precedent as DeviceHandoff's
    // own create (app/api/device-handoffs/route.ts): this model derives its
    // owner through GuidedFlowSession, and ownership was already proven
    // above via the GUARDED `loadOwnedSession` read.
    const task = await prisma.guidedFlowVisualAssistTask.create({
      data: { guidedFlowSessionId: params.id, taskType, taskKey: typeof taskKey === "string" ? taskKey : null },
    });
    return NextResponse.json({ id: task.id, taskType: task.taskType, status: task.status });
  });
}

// GET — the current tasks for this session, so a returning desktop (or a
// phone) can see whether one already finished.
export async function GET(req: Request, { params }: { params: { id: string } }) {
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

    const tasks = await db.guidedFlowVisualAssistTask.findMany({
      where: { guidedFlowSessionId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        taskType: t.taskType,
        taskKey: t.taskKey,
        status: t.status,
        result: t.result,
        completedAt: t.completedAt,
      })),
    });
  });
}
