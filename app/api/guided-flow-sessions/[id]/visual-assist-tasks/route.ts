import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

/**
 * One logical camera invocation gets one task row.
 *
 * There is intentionally no schema migration in this workstream, so taskKey
 * does not acquire a new unique constraint here. A plain find-then-create would
 * still race when two devices (or two Strict Mode requests) arrive together.
 * SERIALIZABLE turns that predicate into a concurrency boundary: if two
 * transactions both observe "no task" and both try to create one, Postgres
 * aborts one with P2034 and the retry observes/reuses the winner.
 *
 * This identity is deliberately scoped to the existing generic task vocabulary:
 * session + taskType + taskKey. Route Assist does not get a private persistence
 * model or a second idempotency scheme.
 */
async function createOrReuseTask(
  guidedFlowSessionId: string,
  taskType: Prisma.GuidedFlowVisualAssistTaskCreateInput["taskType"],
  taskKey: string | null,
) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.guidedFlowVisualAssistTask.findFirst({
            where: { guidedFlowSessionId, taskType, taskKey },
            orderBy: { createdAt: "desc" },
          });
          if (existing) return existing;

          return tx.guidedFlowVisualAssistTask.create({
            data: { guidedFlowSessionId, taskType, taskKey },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("Could not create or reuse visual assist task");
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
    const normalizedTaskKey = typeof taskKey === "string" ? taskKey : null;

    // UNGUARDED CLIENT, DELIBERATELY — same precedent as DeviceHandoff's
    // own create (app/api/device-handoffs/route.ts): this model derives its
    // owner through GuidedFlowSession, and ownership was already proven
    // above via the GUARDED `loadOwnedSession` read. createOrReuseTask keeps
    // that same ownership boundary while making the write server-idempotent.
    const task = await createOrReuseTask(params.id, taskType, normalizedTaskKey);
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
