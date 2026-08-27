/**
 * Resolving a visitor's open visit — ADR-011.
 *
 * THE INVARIANT
 *
 *   A browser session identifies continuity within a storefront.
 *   It does not identify a tenant.
 *
 * `elite_session_id` is one cookie with no contractor dimension. Six call
 * sites used to resolve a visit as:
 *
 *     sessionId -> Visit -> contractor            WRONG
 *
 * which meant a visitor who added a service on one storefront and then opened
 * another contractor's storefront in the same browser reopened the FIRST
 * contractor's visit. The route rejected a foreign service; the visit row
 * itself was shared, so the cart bled across storefronts and the
 * "while we're there" discount was decided by the wrong contractor's line
 * items. Correct order is always:
 *
 *     site -> contractor -> (contractorId, sessionId, OPEN) -> Visit   RIGHT
 *
 * WHY contractorId IS A REQUIRED PARAMETER
 *
 * The guarded client already scopes Visit, so passing it is redundant at
 * runtime — and that is exactly why it is here. Taking it as an argument makes
 * the function impossible to call before the contractor has been resolved, so
 * the ordering is a property of the signature rather than of a comment
 * somebody has to remember. The guard cross-checks it against the ambient
 * context and throws CrossTenantError on a mismatch, so a wrong value fails
 * loudly instead of silently widening.
 *
 * See the standing principle: if correct execution depends on a human
 * remembering an ordering rule, encode the order into the call path and use
 * verification as the backstop.
 *
 * ON `status: "OPEN"`
 *
 * Deliberately part of every lookup. A session accumulates CHECKED_OUT visits
 * over time — live data had sessions holding 7, 15 and 2 — so "the visit for
 * this session" is only well defined among OPEN ones. At most one OPEN visit
 * per (contractor, session) is the real invariant; it is checked by
 * scripts/verify-booking-tenancy.ts and is a contract-phase partial-unique
 * candidate.
 */

import type { PrismaClient } from "@prisma/client";

/**
 * The visitor's open visit for this contractor, or null.
 *
 * `guarded` must be a tenant-scoped client. `sessionId` may be null for a
 * first-time visitor who has not been issued a cookie yet.
 */
export async function findOpenVisit(
  guarded: PrismaClient,
  contractorId: string,
  sessionId: string | null
) {
  if (!sessionId) return null;
  return guarded.visit.findFirst({
    where: { contractorId, sessionId, status: "OPEN" },
  });
}

/**
 * As above, creating the visit if this contractor has no open one.
 *
 * The create is stamped by the guard, and `contractorId` is passed explicitly
 * for the same reason as the read: a Visit is an ownership root, so its owner
 * is written, never inferred from whatever gets added to it later.
 */
export async function findOrCreateOpenVisit(
  guarded: PrismaClient,
  contractorId: string,
  sessionId: string
) {
  const existing = await findOpenVisit(guarded, contractorId, sessionId);
  if (existing) return existing;
  return guarded.visit.create({ data: { contractorId, sessionId, status: "OPEN" } });
}

/**
 * Prove a Visit belongs to the active contractor, then run a write.
 *
 * LineItem and Booking derive their owner through Visit, so the guard refuses
 * to create them directly — there is no contractorId to stamp (ADR-010). The
 * proof has to happen where a client is available.
 *
 * The read goes through the GUARDED client, so another contractor's visit id
 * comes back null and the write never runs. Returning the proven id rather
 * than a boolean means the caller cannot forget to use it.
 */
export async function withProvenVisit<T>(
  guarded: PrismaClient,
  visitId: string,
  write: (provenVisitId: string) => Promise<T>
): Promise<T> {
  const owned = await guarded.visit.findUnique({
    where: { id: visitId },
    select: { id: true },
  });
  if (!owned) {
    const { CrossTenantError } = await import("./tenantContext");
    throw new CrossTenantError(
      `Visit ${visitId} does not belong to the active contractor, so nothing ` +
        `may be created under it.`
    );
  }
  return write(owned.id);
}
