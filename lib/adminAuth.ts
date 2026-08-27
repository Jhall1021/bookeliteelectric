/**
 * Admin access — membership, not a shared password.
 *
 * WHAT THIS REPLACED
 *
 * One password in an environment variable, hashed into a deterministic cookie
 * with no expiry and no rotation. It proved that someone knew a secret, and
 * nothing about who they were — so it could not answer the only question that
 * matters once there is more than one contractor: whose data may this request
 * touch?
 *
 * It is gone rather than kept as a fallback. A retired auth path left in place
 * "just in case" is an undocumented bypass with no audit trail, and it would
 * have been the easiest way into every contractor's pricing.
 *
 * WHAT REPLACES IT
 *
 *   session -> active User -> active ContractorMembership -> Contractor
 *
 * A valid Better Auth session is NOT access. Someone can hold a perfectly good
 * session and be a member of nothing, and they are refused here.
 *
 * This module answers "may this request act as an admin at all". Which
 * contractor it acts FOR, and with the guarded client, is
 * lib/adminContext.ts.
 */

import {
  resolveAdminContractor,
  NotAuthenticatedError,
  NoMembershipError,
  AmbiguousContractorError,
  type AdminContext,
} from "./adminContext";

/**
 * The admin context for this request, or null.
 *
 * Async, unlike the cookie check it replaces — it reads a session and a
 * membership. Every call site awaits it, which is the visible cost of the
 * check being real.
 */
export async function adminContextOrNull(): Promise<AdminContext | null> {
  try {
    return await resolveAdminContractor();
  } catch (e) {
    // Not signed in, not a member, or a member of several with none named.
    // All three mean "no admin access for this request" here; the routes that
    // need to tell a user WHICH it was catch the specific error themselves.
    if (
      e instanceof NotAuthenticatedError ||
      e instanceof NoMembershipError ||
      e instanceof AmbiguousContractorError
    ) {
      return null;
    }
    throw e;
  }
}

/** Convenience for a gate that only needs yes or no. */
export async function isAdminAuthenticated(): Promise<boolean> {
  return (await adminContextOrNull()) !== null;
}

export { NotAuthenticatedError, NoMembershipError, AmbiguousContractorError };
export type { AdminContext };
