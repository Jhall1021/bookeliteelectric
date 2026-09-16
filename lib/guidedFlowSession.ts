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

import type { PrismaClient, GuidedFlowSession, GuidedFlowSessionStatus } from "@prisma/client";

export type FindOrCreateSessionInput = {
  contractorId: string;
  sessionId: string;
  serviceId: string;
  serviceSlug: string;
  /**
   * Entry-service provenance CARRIED FORWARD from a reroute handoff —
   * already validated by the caller (see `resolveEntryProvenance` below)
   * against this same contractorId. Omit for a direct, non-rerouted entry:
   * a brand-new session then defaults its own entry to its own resolved
   * service, which is exactly what "entry == resolved for a direct flow"
   * means. Only consulted when CREATING a session — an existing session's
   * entry provenance is never overwritten by a later find.
   */
  entryServiceId?: string;
  entryServiceSlug?: string;
};

/**
 * The active session for this browser+service, or a new one.
 *
 * "At most one ACTIVE session per contractor+session+service" is a
 * contract-phase invariant, same as Visit's "at most one OPEN visit per
 * contractor+session" (`prisma/schema.prisma`'s own comment on `Visit`) —
 * not a DB constraint Prisma can express as a partial unique. Enforced here
 * by finding before creating, inside the same call.
 */
export async function findOrCreateActiveSession(
  db: PrismaClient,
  input: FindOrCreateSessionInput
): Promise<GuidedFlowSession> {
  const existing = await db.guidedFlowSession.findFirst({
    where: {
      contractorId: input.contractorId,
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // `input.entryServiceId === undefined` means the caller had no VALIDATED
    // claim at all (a direct visit, or a reroute whose claim failed
    // resolveEntryProvenance) — an ordinary resume, existing behavior.
    // A claim that names the SAME entry this session already recorded is the
    // same journey continuing (e.g. the customer went back and replayed the
    // same reroute) — also a resume, not a fork.
    if (input.entryServiceId === undefined || input.entryServiceId === existing.entryServiceId) {
      // Touched, not modified — resuming a session is activity even before
      // the customer answers anything new.
      return db.guidedFlowSession.update({
        where: { id: existing.id },
        data: { lastActivityAt: new Date() },
      });
    }

    // A validated claim naming a DIFFERENT entry service than this existing
    // ACTIVE target session recorded is a different customer journey landing
    // on the same target service — e.g. a customer left an ACTIVE B session
    // open from visiting B directly, then a later A -> B reroute (carrying
    // validated entry=A) arrives in the same browser session. Reusing that
    // row would relabel a stranger's-in-effect journey (or leak its
    // in-progress answers into this one). Retire it and start a fresh target
    // session instead — consumedAnswers starts empty, never copied over.
    const [, created] = await db.$transaction([
      db.guidedFlowSession.updateMany({
        where: { id: existing.id, status: "ACTIVE" },
        data: { status: "ABANDONED", version: { increment: 1 } },
      }),
      db.guidedFlowSession.create({
        data: {
          contractorId: input.contractorId,
          sessionId: input.sessionId,
          serviceId: input.serviceId,
          serviceSlug: input.serviceSlug,
          entryServiceId: input.entryServiceId,
          entryServiceSlug: input.entryServiceSlug ?? input.serviceSlug,
          consumedAnswers: {},
        },
      }),
    ]);
    return created;
  }

  return db.guidedFlowSession.create({
    data: {
      contractorId: input.contractorId,
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      serviceSlug: input.serviceSlug,
      // Direct flow: entry IS the resolved service. Rerouted target: the
      // caller already validated these against contractorId (see
      // resolveEntryProvenance) — falls back to serviceId/serviceSlug when
      // absent or invalid, never left null on a real row.
      entryServiceId: input.entryServiceId ?? input.serviceId,
      entryServiceSlug: input.entryServiceSlug ?? input.serviceSlug,
      consumedAnswers: {},
    },
  });
}

export type EntryProvenanceCandidate = {
  entryServiceId?: string | null;
  entryServiceSlug?: string | null;
};

/**
 * Validate a CLAIMED entry-service id/slug (arriving via the client-writable
 * sessionStorage handoff — never trusted as-is) against a real, active
 * service belonging to THIS contractor.
 *
 * Fails safe: any mismatch, missing id, or inactive/foreign service returns
 * `null` rather than throwing, so the caller's own fallback (the target
 * session's own serviceId/serviceSlug) takes over silently. A tampered or
 * cross-contractor id must never surface as an error that leaks whether a
 * given id exists elsewhere — it just looks like "no provenance claimed".
 */
export async function resolveEntryProvenance(
  db: PrismaClient,
  contractorId: string,
  candidate: EntryProvenanceCandidate
): Promise<{ entryServiceId: string; entryServiceSlug: string } | null> {
  if (!candidate.entryServiceId) return null;
  const service = await db.service.findFirst({
    where: { id: candidate.entryServiceId, contractorId, active: true },
    select: { id: true, slug: true },
  });
  if (!service) return null;
  return { entryServiceId: service.id, entryServiceSlug: service.slug };
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
    data: { status: "ABANDONED", version: { increment: 1 } },
  });
}

export type { GuidedFlowSession, GuidedFlowSessionStatus };
