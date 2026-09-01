/**
 * The admin tenant boundary — the counterpart to lib/siteRouting.ts.
 *
 *   authenticated session -> membership -> contractor -> tenant context
 *   -> guarded Prisma
 *
 * The storefront resolves a tenant from a site identifier the caller carries.
 * The admin resolves one from WHO IS SIGNED IN and what they are a member of.
 * Both refuse to look at the resource being requested, for the same reason: a
 * tenant derived from the thing being accessed authorises access to itself.
 *
 * IDENTITY AND AUTHORIZATION ARE RESOLVED TOGETHER
 *
 * `withAdminContractor` does both, and hands back the guarded client only
 * after both succeed. Splitting them would allow a route to check the session,
 * forget the membership, and query as whoever it liked — which is exactly the
 * mistake a shared admin password makes structurally.
 *
 * FORBIDDEN FALLBACKS
 *
 * There is no `soleContractorId()` here, no "first contractor in the
 * database", no "first membership, silently", and no Elite default. Each of
 * those is a rule that holds until the moment a second contractor exists and
 * then quietly returns the wrong one — the failure mode the migration audit
 * singled out as the most dangerous in this codebase.
 *
 * A person with several memberships must SAY which contractor they are acting
 * for. Ambiguity is an error, not a guess.
 */

import { cookies, headers } from "next/headers";
import type { PrismaClient, ContractorRole } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { withContractor } from "./tenantRoute";

/** Which contractor an admin request is acting for, and with what authority. */
export type AdminContext = {
  userId: string;
  email: string;
  contractorId: string;
  contractorSlug: string;
  role: ContractorRole;
};

/** No valid session. The caller is not signed in, or the session expired. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotAuthenticatedError";
  }
}

/**
 * Signed in, but not entitled to the contractor asked for — or to any.
 *
 * Deliberately does not distinguish "this contractor does not exist" from "you
 * are not a member of it". A signed-in user should not be able to enumerate
 * contractors by probing.
 */
export class NoMembershipError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NoMembershipError";
  }
}

/** Several memberships and nothing said which. A choice, not a default. */
export class AmbiguousContractorError extends Error {
  constructor(public readonly choices: { contractorId: string; slug: string }[]) {
    super(
      `This account can act for ${choices.length} contractors. The request must ` +
        `name which one.`
    );
    this.name = "AmbiguousContractorError";
  }
}

/** The signed-in user, or null. Identity only — no authorization. */
export async function currentUser(): Promise<
  { id: string; email: string; emailVerified: boolean } | null
> {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) return null;
  // emailVerified travels with the user because creating a tenant depends on
  // it, and re-reading the row at the call site would be a second source of
  // truth for the same fact.
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
  };
}

/**
 * The cookie holding which contractor this account is currently working on.
 *
 * A CHOICE, not a credential. It narrows an account to one of the memberships
 * it already has; it can never grant one. Every read below re-checks the
 * membership, so a stale or forged value resolves to "not yours" rather than
 * to access.
 */
export const CONTRACTOR_COOKIE = "p2b.contractor";

/**
 * Resolve identity and authorization together.
 *
 * `contractorId` is optional only while a user has exactly one membership.
 * With more than one it is required, and its absence is an error rather than
 * a silently chosen first row.
 *
 * When it is not passed, the portal's selection cookie is consulted — the
 * answer a human already gave at /choose. That is still an explicit
 * choice; it is simply one made earlier. It is validated against the account's
 * memberships like any other, so it cannot widen access.
 */
export async function resolveAdminContractor(
  contractorId?: string
): Promise<AdminContext> {
  const user = await currentUser();
  if (!user) throw new NotAuthenticatedError();

  const chosenId = contractorId ?? cookies().get(CONTRACTOR_COOKIE)?.value ?? undefined;

  // Read on the UNGUARDED client, deliberately: this is the query that decides
  // which tenant context to open, so it cannot run inside one. It reads
  // membership rows keyed by the signed-in user and nothing else.
  const memberships = await prisma.contractorMembership.findMany({
    where: { userId: user.id, active: true },
    select: {
      contractorId: true,
      role: true,
      contractor: { select: { slug: true, active: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const usable = memberships.filter((m) => m.contractor.active);
  if (usable.length === 0) {
    throw new NoMembershipError("This account is not a member of any active contractor.");
  }

  if (chosenId) {
    const chosen = usable.find((m) => m.contractorId === chosenId);
    // Same message whether the contractor is absent or simply not theirs.
    if (!chosen) throw new NoMembershipError("No such contractor for this account.");
    return {
      userId: user.id,
      email: user.email,
      contractorId: chosen.contractorId,
      contractorSlug: chosen.contractor.slug,
      role: chosen.role,
    };
  }

  if (usable.length > 1) {
    throw new AmbiguousContractorError(
      usable.map((m) => ({ contractorId: m.contractorId, slug: m.contractor.slug }))
    );
  }

  const only = usable[0];
  return {
    userId: user.id,
    email: user.email,
    contractorId: only.contractorId,
    contractorSlug: only.contractor.slug,
    role: only.role,
  };
}

/**
 * Run admin work as one contractor, on the guarded client.
 *
 *   return withAdminContractor(async (db, ctx) => db.service.findMany());
 *
 * The context and the client arrive together, so a route cannot reach guarded
 * territory without having established who the user is and what they may act
 * for. Same shape as `withSite` on the storefront side, and for the same
 * reason.
 */
export async function withAdminContractor<T>(
  fn: (db: PrismaClient, ctx: AdminContext) => Promise<T>,
  options?: { contractorId?: string }
): Promise<T> {
  const ctx = await resolveAdminContractor(options?.contractorId);
  return withContractor(ctx.contractorId, "admin-session", (db) => fn(db, ctx));
}

/** OWNER-only actions — billing, membership changes, deleting a contractor. */
export function requireOwner(ctx: AdminContext): void {
  if (ctx.role !== "OWNER") {
    throw new NoMembershipError("This action requires the contractor's owner.");
  }
}

/**
 * The API-route form: resolve, or return the right refusal.
 *
 * `withAdminContractor` THROWS when identity or membership fails, which is
 * correct for a page — the layout redirects. In an API route an uncaught throw
 * is a 500, and a 500 tells a caller "we broke" when the truth is "you may
 * not".
 *
 * That distinction was not theoretical: four routes returned 500 to a
 * signed-out request because the resolver ran before their own auth guard. The
 * fix is not to reorder the lines — it is to stop the order mattering. This
 * translates each failure once, so a route cannot get it wrong by construction.
 *
 *   401  no session
 *   403  session, but no membership for this contractor
 *   409  several memberships and none named — a choice, not a failure
 */
export async function withAdminRoute<T>(
  fn: (db: PrismaClient, ctx: AdminContext) => Promise<T>,
  options?: { contractorId?: string }
): Promise<T | Response> {
  try {
    return await withAdminContractor(fn, options);
  } catch (e) {
    if (e instanceof NotAuthenticatedError) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    if (e instanceof NoMembershipError) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof AmbiguousContractorError) {
      return Response.json(
        { error: e.message, choices: e.choices },
        { status: 409 }
      );
    }
    throw e;
  }
}
