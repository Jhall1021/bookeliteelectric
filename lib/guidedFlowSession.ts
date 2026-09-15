/**
 * Server-side persistence for an in-progress homeowner Guided Pricing flow —
 * docs/design/guided-flow-session-v1.md.
 *
 * WHAT THIS MODULE OWNS, AND DOES NOT
 *
 * It stores what the customer told us (`consumedAnswers`) and nothing this
 * system computed from it. It does not decide what question comes next, it
 * does not price anything, and it does not know what Route Assist or Device
 * Handoff mean. `GuidedFlowEngine.tsx`'s existing client-side walk
 * (`evaluate`/`advanceFrom`) stays the only "what's next" authority;
 * `lib/routeResolver.ts`'s `resolveRoute` stays the only price authority.
 * This module is a mirror, not a router — see the design doc §3 for why
 * that distinction is load-bearing rather than a nicety.
 *
 * DEPENDENCY-INJECTED, LIKE lib/routeResolver.ts
 *
 * Every function takes `db: PrismaClient`, not the global `prisma` import —
 * same reasoning as that module: the caller decides whether the client is
 * guarded, and a reader can tell which one ran.
 */

import { Prisma, type PrismaClient, type GuidedFlowSession, type GuidedFlowSessionStatus } from "@prisma/client";

export type FindOrCreateSessionInput = {
  contractorId: string;
  sessionId: string;
  serviceId: string;
  serviceSlug: string;
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * The deterministic identity of "the ACTIVE session for this
 * contractor+browser-session+service" — set on `activeSessionKey`
 * (`prisma/schema.prisma`, `@unique`) only while a row is ACTIVE, and cleared
 * back to `null` the moment it stops being ACTIVE (`completeSession`,
 * `abandonSession` below). Exported so a caller proving the invariant holds —
 * scripts/verify-concurrent-session-creation-browser-flow.ts — can compute
 * the same key a race is expected to collide on, without duplicating the
 * concatenation rule.
 */
export function buildActiveSessionKey(input: {
  contractorId: string;
  sessionId: string;
  serviceId: string;
}): string {
  return `${input.contractorId}:${input.sessionId}:${input.serviceId}`;
}

/**
 * The active session for this browser+service, or a new one.
 *
 * "At most one ACTIVE session per contractor+session+service" is now a real
 * database constraint, not just a contract-phase invariant enforced by
 * finding before creating inside one call — that older approach (find, then
 * create if nothing was found) has a race window between the two statements
 * that two concurrent requests can both fall into, each finding nothing and
 * each creating a row. It did: React Strict Mode's development-only double
 * effect invocation reproduced it live twice in one rehearsal (see
 * scripts/verify-back-navigation-config-browser-flow.ts's header), and
 * nothing about the underlying race is specific to Strict Mode — two
 * independent requests (a slow network retry, two tabs, a device-handoff
 * join landing at nearly the same moment) can hit the identical window in
 * production.
 *
 * `activeSessionKey` turns the invariant into a real partial-uniqueness
 * constraint Postgres enforces: it holds `buildActiveSessionKey(...)` only
 * while `status: "ACTIVE"`, and `null` otherwise, so completed/abandoned
 * history never collides with a later session for the same triple (a plain
 * `@@unique([contractorId, sessionId, serviceId])` would forbid that
 * entirely, one column expresses "unique among ACTIVE rows" for free since
 * Postgres never considers two NULLs equal).
 *
 * IDEMPOTENT BY CONSTRAINT, NOT BY CHECKING FIRST for the actual safety
 * property — same idiom as `lib/depositRecording.ts`'s `recordCapture`. The
 * `findUnique` below is purely a read-path optimization (resuming an
 * existing session, by far the common case, skips a doomed insert attempt);
 * the correctness comes from the `create` + unique-constraint + `P2002`
 * catch, which is safe even if two calls reach this function at the exact
 * same instant with no prior read at all. Whichever `create` the database
 * commits first wins the row; the loser's `create` fails, and it fetches the
 * winner by the same deterministic key — never retries its own create,
 * never invents a second row.
 */
export async function findOrCreateActiveSession(
  db: PrismaClient,
  input: FindOrCreateSessionInput
): Promise<GuidedFlowSession> {
  const activeSessionKey = buildActiveSessionKey(input);

  const existing = await db.guidedFlowSession.findUnique({ where: { activeSessionKey } });
  if (existing) {
    // Touched, not modified — resuming a session is activity even before
    // the customer answers anything new.
    return db.guidedFlowSession.update({
      where: { id: existing.id },
      data: { lastActivityAt: new Date() },
    });
  }
  try {
    return await db.guidedFlowSession.create({
      data: {
        contractorId: input.contractorId,
        sessionId: input.sessionId,
        serviceId: input.serviceId,
        serviceSlug: input.serviceSlug,
        consumedAnswers: {},
        activeSessionKey,
      },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Lost the race: another concurrent call committed its `create` for this
    // exact key between our `findUnique` above and our own `create`. The
    // constraint already decided who wins — fetch them rather than treating
    // this as an error or attempting a second create.
    const winner = await db.guidedFlowSession.findUniqueOrThrow({ where: { activeSessionKey } });
    return db.guidedFlowSession.update({
      where: { id: winner.id },
      data: { lastActivityAt: new Date() },
    });
  }
}

export async function loadSession(db: PrismaClient, id: string): Promise<GuidedFlowSession | null> {
  return db.guidedFlowSession.findUnique({ where: { id } });
}

export type UpdateAnswersInput = {
  id: string;
  expectedVersion: number;
  consumedAnswers: Record<string, string>;
  customerNote?: string | null;
};

export type UpdateOutcome =
  | { ok: true; session: GuidedFlowSession }
  | { ok: false; reason: "STALE_VERSION" | "NOT_ACTIVE" | "NOT_FOUND" };

/**
 * Optimistic-concurrency write — docs/design/guided-flow-session-v1.md §5.
 *
 * `updateMany`, not `update`: `update` throws on a missing row, which would
 * make "stale version" and "row doesn't exist" indistinguishable without an
 * extra read. `updateMany`'s `count` tells the caller which happened —
 * `NOT_FOUND` only when a follow-up read confirms the row is truly gone,
 * `STALE_VERSION`/`NOT_ACTIVE` otherwise. Either way, the caller re-fetches
 * with `loadSession` before deciding what to show the customer; this
 * function never retries on their behalf, so a stale payload can never be
 * silently reapplied.
 */
export async function updateSessionAnswers(db: PrismaClient, input: UpdateAnswersInput): Promise<UpdateOutcome> {
  const result = await db.guidedFlowSession.updateMany({
    where: { id: input.id, version: input.expectedVersion, status: "ACTIVE" },
    data: {
      consumedAnswers: input.consumedAnswers,
      ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
      version: { increment: 1 },
      lastActivityAt: new Date(),
    },
  });
  if (result.count === 1) {
    const session = await db.guidedFlowSession.findUnique({ where: { id: input.id } });
    // Cannot be null immediately after a successful update in the same
    // request, barring a concurrent delete — treated as NOT_FOUND rather
    // than asserted impossible, since "impossible" is how bugs like that
    // stay hidden.
    if (!session) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, session };
  }
  const current = await db.guidedFlowSession.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.status !== "ACTIVE") return { ok: false, reason: "NOT_ACTIVE" };
  return { ok: false, reason: "STALE_VERSION" };
}

export type CompleteSessionInput = {
  id: string;
  expectedVersion: number;
  lineItemId?: string | null;
  quoteId?: string | null;
};

/**
 * Marks a session COMPLETED at the exact terminal-write moment its answers
 * became a real `LineItem`/`Quote` — called right after that write
 * succeeds, never before, so a session can never read COMPLETED while the
 * booking it describes failed to save.
 */
export async function completeSession(db: PrismaClient, input: CompleteSessionInput): Promise<UpdateOutcome> {
  const result = await db.guidedFlowSession.updateMany({
    where: { id: input.id, version: input.expectedVersion, status: "ACTIVE" },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      lineItemId: input.lineItemId ?? undefined,
      quoteId: input.quoteId ?? undefined,
      version: { increment: 1 },
      // Frees the activeSessionKey slot immediately — a customer who starts
      // this same service again (a second visit, a second line item) gets a
      // fresh ACTIVE session for the same contractor+session+service rather
      // than colliding with this now-COMPLETED history row.
      activeSessionKey: null,
    },
  });
  if (result.count === 1) {
    const session = await db.guidedFlowSession.findUnique({ where: { id: input.id } });
    if (!session) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, session };
  }
  const current = await db.guidedFlowSession.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.status !== "ACTIVE") return { ok: false, reason: "NOT_ACTIVE" };
  return { ok: false, reason: "STALE_VERSION" };
}

/**
 * "Abandoned" is a lazy read-time classification, not a background job —
 * same posture as the rest of this codebase's stated preference for no
 * cron/queue/worker (PriceSight's design doc says this explicitly, and
 * nothing here has reason to differ). A session past this window still
 * reads ACTIVE in the database until something touches it; callers that
 * care use `isEffectivelyAbandoned` rather than trusting `status` alone.
 */
export const ABANDONED_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours

export function isEffectivelyAbandoned(session: Pick<GuidedFlowSession, "status" | "lastActivityAt">, now: Date = new Date()): boolean {
  return session.status === "ACTIVE" && now.getTime() - session.lastActivityAt.getTime() > ABANDONED_AFTER_MS;
}

/** Explicit transition — e.g. the customer starts over, or a lazy reap on next read. */
export async function abandonSession(db: PrismaClient, id: string): Promise<void> {
  await db.guidedFlowSession.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "ABANDONED", version: { increment: 1 }, activeSessionKey: null },
  });
}

export type { GuidedFlowSession, GuidedFlowSessionStatus };
