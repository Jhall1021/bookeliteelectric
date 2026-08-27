/**
 * Adopting the tenant guard, one route at a time — ADR-007a.
 *
 * THE PATTERN
 *
 *   const out = await withContractor(contractorId, "the tree admin", async (db) => {
 *     return db.question.findMany({ where: { serviceId } });
 *   });
 *
 * Context is opened and the guarded client handed to the callback together, so
 * a route cannot reach the guarded world without having established who it is
 * acting for. That is the whole reason the guard is still NOT attached to
 * lib/prisma.ts: a global attachment means any route can enter guarded
 * territory by accident, and the first query throws in production rather than
 * in review.
 *
 * WHY THE CLIENT IS A SINGLETON
 *
 * `$extends` returns a new client wrapping the same engine and connection
 * pool, so extending once at module scope costs nothing per request. Building
 * one per call would not exhaust connections, but it would allocate a client
 * on every request for no reason.
 *
 * The tenant context itself is per-invocation, held in AsyncLocalStorage by
 * lib/tenantContext.ts, so one shared client serves concurrent requests for
 * different contractors correctly — proven by the CONTEXT section of the live
 * harness.
 *
 * WHAT STAYS ON THE UNGUARDED CLIENT
 *
 * Platform reads. `CanonicalMaterial`, `CanonicalComponent`,
 * `CanonicalCategory`, `CanonicalDisclaimer`, `PhotoGroup`, `ZipCode` — the
 * guard passes them through anyway, so routing them through it buys nothing,
 * and reading them outside a tenant context is legitimate.
 *
 * Also: derived-model CREATES. See lib/tenantWrites.ts. The guard refuses
 * them on purpose, because there is no owner column to stamp and inventing one
 * would be the denormalization ADR-010 exists to avoid.
 */

import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { withTenantGuard } from "./tenantGuard";
import { withTenant, type TenantContext } from "./tenantContext";

/**
 * The guarded client.
 *
 * Deliberately not exported as a drop-in replacement for `prisma`. Reach it
 * through `withContractor`, which is what guarantees a context is open.
 */
const guarded = withTenantGuard(prisma) as unknown as PrismaClient;

/**
 * Run a callback inside one contractor's tenant context, with the guarded
 * client.
 *
 * `source` is how the contractor was identified, not a free-text label — the
 * union is deliberately closed so "where did this tenant come from" stays
 * answerable. Today every adopted route resolves the sole contractor, which is
 * `admin-session` for admin surfaces and `site-identifier` for public ones
 * once storefront routing exists.
 */
export async function withContractor<T>(
  contractorId: string,
  source: TenantContext["source"],
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  // AWAITED INSIDE THE SCOPE, DELIBERATELY.
  //
  // A Prisma promise is lazy: `db.service.findUnique(...)` builds the query
  // and does nothing until it is awaited. Returning it from the callback
  // unawaited let AsyncLocalStorage.run() exit first, so the query executed
  // OUTSIDE the tenant context and threw NoTenantContextError — while looking
  // like perfectly ordinary code at every call site.
  //
  // Awaiting here means the work completes inside the scope regardless of what
  // the callback returns, so a caller cannot get this wrong by writing the
  // natural one-line arrow function.
  return withTenant({ contractorId, source }, async () => await fn(guarded));
}

/**
 * The unguarded client, named so its use is visible in review.
 *
 * For platform reads and for the proven-parent writes in lib/tenantWrites.ts.
 * If you are reaching for this to make a tenant query compile, that is the
 * signal to look again rather than to import it.
 */
export { prisma as platformDb };
