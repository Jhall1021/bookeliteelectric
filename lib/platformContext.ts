/**
 * The platform boundary — who is Price2Book staff, and how staff enter a
 * contractor. The counterpart to lib/adminContext.ts, which answers the
 * contractor-side question.
 *
 *   Better Auth session -> PlatformAccess (non-revoked) -> platform actor
 *   platform actor -> named contractor -> withContractor() -> guarded Prisma
 *
 * ONE SOURCE OF STAFF-NESS
 *
 * A person is platform staff when, and only when, they hold a PlatformAccess
 * row with `revokedAt` null. Nothing else counts: not an email address or
 * domain, not owning a contractor, not being the first user, not an
 * environment variable. `ContractorMembership` and `PlatformAccess` are
 * independent in both directions — Elite's OWNER is not staff by virtue of
 * being Elite's owner, and a PLATFORM_ADMIN is not an Elite member by virtue
 * of being staff. Neither is ever derived from the other.
 *
 * `asPlatform()` and `platformDb` are DATABASE-SCOPE tools. They say "this
 * query runs outside a tenant"; they say nothing about who is asking. They
 * are never evidence of authorization, which is why every wrapper here
 * resolves the actor before it hands either of them out.
 *
 * AUTHORIZE, THEN VALIDATE, THEN SCOPE — IN THAT ORDER
 *
 * `withPlatformContractor` is the only sanctioned way for staff to reach a
 * contractor's data, and the only wrapper in the codebase that takes a
 * contractor id as an argument. It resolves platform access BEFORE the id is
 * read as anything, so an unauthorized caller learns nothing from the answer
 * — a foreign id and a malformed one refuse identically, and the lookup never
 * runs. Once authorized it enters the same `withContractor()` guard every
 * other path uses. Staff hold a key to the tenant boundary, never a hole
 * through it; tenancy stays one implementation.
 *
 * TWO SHAPES OF EVERY FUNCTION
 *
 * The `...For` variants take the signed-in user as an argument and are the
 * actual decision. The bare variants read the user from the request and call
 * them. That split exists so the decisions can be proven without a request
 * scope (scripts/verify-platform-authority.ts) and so the request-bound
 * wrappers contain no logic of their own to get wrong.
 *
 * PHASE 1 IS READ-ONLY AND UNAUDITED BY DESIGN. Nothing here writes
 * SupportAccessEvent yet; that arrives with support entry, where there is a
 * visit to record. Nothing here mutates anything.
 */

import type { PlatformRole, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { currentUser, NotAuthenticatedError } from "./adminContext";
import { asPlatform } from "./tenantContext";
import { withContractor } from "./tenantRoute";

export { NotAuthenticatedError };

/** A signed-in Price2Book staff member. */
export type PlatformActor = {
  userId: string;
  role: PlatformRole;
  grantedAt: Date;
  /** Display only. Never consulted for authorization. */
  email: string;
};

/** Identity as the session reports it. Authorization starts from the id. */
export type SignedInUser = { id: string; email: string };

/**
 * Signed in, but not platform staff — including a revoked grant and
 * including a contractor OWNER. One message for every case, so the answer
 * cannot be used to tell "never granted" from "revoked".
 */
export class NotPlatformStaffError extends Error {
  constructor() {
    super("This account is not Price2Book staff.");
    this.name = "NotPlatformStaffError";
  }
}

/**
 * Authorized, but the contractor named does not resolve. Only reachable AFTER
 * platform authorization succeeded; an unauthorized caller gets
 * NotPlatformStaffError regardless of what id they supplied. Deliberately
 * the same for a malformed id and an absent one.
 */
export class PlatformContractorNotFoundError extends Error {
  constructor() {
    super("No such contractor.");
    this.name = "PlatformContractorNotFoundError";
  }
}

export type PlatformAccessDecision =
  | { status: "none" }
  | { status: "revoked"; revokedAt: Date }
  | { status: "active"; role: PlatformRole; grantedAt: Date };

/**
 * The decision, pure and exported so the verifier runs the real thing rather
 * than a mirror of it. A row is access only while `revokedAt` is null.
 */
export function decidePlatformAccess(
  row: { role: PlatformRole; grantedAt: Date; revokedAt: Date | null } | null
): PlatformAccessDecision {
  if (!row) return { status: "none" };
  if (row.revokedAt !== null) return { status: "revoked", revokedAt: row.revokedAt };
  return { status: "active", role: row.role, grantedAt: row.grantedAt };
}

/**
 * Read on the UNGUARDED client, deliberately: PlatformAccess is not tenant
 * data and this is the query that decides whether a platform scope may open,
 * so it cannot run inside one. Keyed by the user id and nothing else.
 */
export async function platformAccessFor(db: PrismaClient, userId: string): Promise<PlatformAccessDecision> {
  const row = await db.platformAccess.findUnique({
    where: { userId },
    select: { role: true, grantedAt: true, revokedAt: true },
  });
  return decidePlatformAccess(row);
}

/** Identity in; a platform actor out, or a refusal. The whole decision. */
export async function platformActorFor(db: PrismaClient, user: SignedInUser | null): Promise<PlatformActor> {
  if (!user) throw new NotAuthenticatedError();
  const decision = await platformAccessFor(db, user.id);
  if (decision.status !== "active") throw new NotPlatformStaffError();
  return { userId: user.id, role: decision.role, grantedAt: decision.grantedAt, email: user.email };
}

/** The request-bound form. Pages call this and translate the throw. */
export async function resolvePlatformActor(): Promise<PlatformActor> {
  return platformActorFor(prisma, await currentUser());
}

/**
 * Cross-tenant platform reads — the directory, counts, anything not inside
 * one contractor. The actor is resolved first; only then does the callback
 * receive the unguarded client, and only inside `asPlatform()`.
 */
export async function withPlatformFor<T>(
  db: PrismaClient,
  user: SignedInUser | null,
  fn: (db: PrismaClient, actor: PlatformActor) => Promise<T>
): Promise<T> {
  const actor = await platformActorFor(db, user);
  return asPlatform(async () => await fn(db, actor));
}

export async function withPlatform<T>(
  fn: (db: PrismaClient, actor: PlatformActor) => Promise<T>
): Promise<T> {
  return withPlatformFor(prisma, await currentUser(), fn);
}

/**
 * Staff entering ONE contractor.
 *
 *   1. authorize — before `contractorId` is so much as inspected
 *   2. validate — the id must be a plausible id, then must resolve
 *   3. scope — the same withContractor() guard as every other path
 *
 * The callback receives the GUARDED client, so a foreign service or booking
 * id inside it resolves to nothing, exactly as it would for the contractor's
 * own admin. `source` is `platform-session`, so logs can tell staff from the
 * contractor.
 */
export type PlatformContractor = { id: string; slug: string; name: string };

const PLAUSIBLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function withPlatformContractorFor<T>(
  db: PrismaClient,
  user: SignedInUser | null,
  contractorId: unknown,
  fn: (db: PrismaClient, actor: PlatformActor, contractor: PlatformContractor) => Promise<T>
): Promise<T> {
  const actor = await platformActorFor(db, user);

  if (typeof contractorId !== "string" || !PLAUSIBLE_ID.test(contractorId)) {
    throw new PlatformContractorNotFoundError();
  }
  // Contractor is a platform model; this read is the lookup, not the scope.
  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, slug: true, name: true },
  });
  if (!contractor) throw new PlatformContractorNotFoundError();

  return withContractor(contractor.id, "platform-session", (guarded) => fn(guarded, actor, contractor));
}

export async function withPlatformContractor<T>(
  contractorId: unknown,
  fn: (db: PrismaClient, actor: PlatformActor, contractor: PlatformContractor) => Promise<T>
): Promise<T> {
  return withPlatformContractorFor(prisma, await currentUser(), contractorId, fn);
}

/**
 * The API-route translation, one place, same reasoning as withAdminRoute:
 * a refusal is a 401/403/404, never a 500.
 *
 *   401  no session
 *   403  session, but not platform staff (never granted, or revoked)
 *   404  staff, but the contractor named does not resolve
 */
export function platformRefusal(e: unknown): Response | null {
  if (e instanceof NotAuthenticatedError) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (e instanceof NotPlatformStaffError) return Response.json({ error: e.message }, { status: 403 });
  if (e instanceof PlatformContractorNotFoundError) return Response.json({ error: e.message }, { status: 404 });
  return null;
}

/** Cross-tenant platform reads, API form. */
export async function withPlatformRoute<T>(
  fn: (db: PrismaClient, actor: PlatformActor) => Promise<T>
): Promise<T | Response> {
  try {
    return await withPlatform(fn);
  } catch (e) {
    const refusal = platformRefusal(e);
    if (refusal) return refusal;
    throw e;
  }
}

/** One contractor, API form. */
export async function withPlatformContractorRoute<T>(
  contractorId: unknown,
  fn: (db: PrismaClient, actor: PlatformActor, contractor: PlatformContractor) => Promise<T>
): Promise<T | Response> {
  try {
    return await withPlatformContractor(contractorId, fn);
  } catch (e) {
    const refusal = platformRefusal(e);
    if (refusal) return refusal;
    throw e;
  }
}
