/**
 * Accepting an invitation into a contractor — the other half of
 * ContractorInvitation, whose minting lives in lib/platformOnboarding.ts
 * because only staff may invite. This file is neutral ground: the ordinary,
 * not-yet-a-member person accepting an invitation is not staff, so this
 * authority sits beside lib/contractorCreation.ts rather than inside the
 * platform module, on the same terms — `createContractorForUser` is the
 * self-serve authority a signed-in user reaches directly; `acceptInvitationFor`
 * is this file's equivalent for the invited path. Both are the ONLY ways to
 * grant a user their first OWNER membership, alongside the founder's
 * `attachOwnerFor`, and all three share `lib/contractorCreation.ts`'s
 * ownership lock so a user cannot win two of them at once.
 *
 * INVITATION IS NOT LOGIN (lib/auth.ts). A ContractorInvitation authorizes
 * JOINING; the session that accepts it must already be authenticated and
 * email-verified by the ordinary means (password or magic link) — this file
 * never mints a session and never reads a password.
 *
 * NEVER CONSUME ON A READ. `peekInvitationFor` is read-only by construction:
 * it exists so the GET page a person lands on from the email link can say
 * what they are being invited to without spending the token — an email
 * client's link-scanning prefetch, or the browser's own preview, issues a GET
 * before a human ever sees the page, and a token that GET could spend would
 * be burned before the real visit. Only `acceptInvitationFor`, called from a
 * POST server action, ever writes `acceptedAt`.
 *
 * THE TOKEN IS HASHED AT REST, RAW IN THE EMAIL ONLY. Matches
 * ContractorInvitation.tokenHash's own doc comment: a leaked database gives
 * an attacker nothing usable. Never log the raw token, and never let it
 * appear in an Error's message — every refusal here is a fixed, generic
 * string.
 */

import type { PrismaClient, ContractorRole } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { OwnershipConflictError, withOwnershipLock, ownsAnotherBusiness } from "./contractorCreation";

/** Seven days — long enough for someone who checks email on Sunday, short enough that a forwarded message goes stale. Matches the schema's own doc comment on `expiresAt`. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 bytes of entropy, URL-safe. Never stored — only its hash is. */
export function mintInvitationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInvitationToken(raw) };
}

/** SHA-256, hex. The one hashing routine both the mint (platformOnboarding) and the lookup (this file) use, so they cannot disagree about what a token hashes to. */
export function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type InvitationDisplayStatus = "pending" | "expired" | "revoked" | "accepted" | "retired";

export type InvitationPeek =
  | { found: false }
  | { found: true; contractorName: string; email: string; status: InvitationDisplayStatus };

/**
 * READ ONLY — see the header. Looks a token up by its hash and reports a
 * status derived at read time (never a stored flag): retirement and
 * expiration are facts about the contractor and the clock, not something a
 * background job has to keep in sync.
 */
export async function peekInvitationFor(db: PrismaClient, rawToken: string): Promise<InvitationPeek> {
  const invitation = await db.contractorInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(rawToken) },
    select: {
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      contractor: { select: { name: true, active: true } },
    },
  });
  if (!invitation) return { found: false };
  const status: InvitationDisplayStatus = invitation.acceptedAt
    ? "accepted"
    : invitation.revokedAt
      ? "revoked"
      : !invitation.contractor.active
        ? "retired"
        : invitation.expiresAt <= new Date()
          ? "expired"
          : "pending";
  return { found: true, contractorName: invitation.contractor.name, email: invitation.email, status };
}

export type AcceptRefusal = {
  code:
    | "NOT_SIGNED_IN"
    | "INVITATION_NOT_FOUND"
    | "INVITATION_REVOKED"
    | "INVITATION_EXPIRED"
    | "INVITATION_ALREADY_USED"
    | "INVITATION_NO_LONGER_VALID"
    | "CONTRACTOR_RETIRED"
    | "EMAIL_MISMATCH"
    | "NOT_VERIFIED"
    | "ALREADY_OWNS_ANOTHER";
  message: string;
};

export type AcceptResult =
  | { ok: true; contractorId: string; slug: string; name: string; already: boolean }
  | { ok: false; refusal: AcceptRefusal };

class InvitationNoLongerValidError extends Error {}
class ContractorRetiredAtAcceptError extends Error {}

/**
 * Accept an invitation and become the contractor's member with the invited
 * role. Called ONLY from a POST action — see the header.
 *
 * `user` is the authenticated caller's identity; this does not read the
 * session itself, matching every other authority in this codebase, so it
 * stays testable without one. `null` means signed out.
 *
 * REFUSAL ORDER, deliberately checked outside the transaction first (for a
 * fast, specific message) and then RE-CHECKED inside it (for correctness
 * under concurrency): not found → already used (idempotent only for the
 * original accepting user, with a still-active membership) → revoked →
 * expired → contractor retired → wrong email → unverified → already owns
 * another business → consume.
 */
export async function acceptInvitationFor(
  db: PrismaClient,
  user: { id: string; email: string; emailVerified: boolean } | null,
  rawToken: string
): Promise<AcceptResult> {
  if (!user) {
    return { ok: false, refusal: { code: "NOT_SIGNED_IN", message: "Sign in or create an account with the invited address first." } };
  }

  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await db.contractorInvitation.findUnique({
    where: { tokenHash },
    select: {
      id: true, email: true, role: true, expiresAt: true,
      acceptedAt: true, acceptedByUserId: true, revokedAt: true,
      contractorId: true, invitedByUserId: true,
      contractor: { select: { slug: true, name: true, active: true } },
    },
  });
  if (!invitation) {
    return { ok: false, refusal: { code: "INVITATION_NOT_FOUND", message: "That invitation link is not valid. Ask whoever invited you for a new one." } };
  }

  // Idempotent replay: the SAME user, already accepted, with a membership
  // that is still actually there and active. Anything else that has
  // acceptedAt set is spent and must never mint a second membership from it —
  // a one-time token stays one-time even if the membership it created was
  // later touched by something unrelated.
  if (invitation.acceptedAt) {
    if (invitation.acceptedByUserId === user.id) {
      const membership = await db.contractorMembership.findUnique({
        where: { userId_contractorId: { userId: user.id, contractorId: invitation.contractorId } },
        select: { active: true },
      });
      if (membership?.active) {
        return { ok: true, contractorId: invitation.contractorId, slug: invitation.contractor.slug, name: invitation.contractor.name, already: true };
      }
    }
    return { ok: false, refusal: { code: "INVITATION_ALREADY_USED", message: "This invitation has already been used." } };
  }
  if (invitation.revokedAt) {
    return { ok: false, refusal: { code: "INVITATION_REVOKED", message: "This invitation was withdrawn. Ask whoever invited you to send a new one." } };
  }
  if (invitation.expiresAt <= new Date()) {
    return { ok: false, refusal: { code: "INVITATION_EXPIRED", message: "This invitation has expired. Ask whoever invited you to send a new one." } };
  }
  if (!invitation.contractor.active) {
    return { ok: false, refusal: { code: "CONTRACTOR_RETIRED", message: "This business is no longer active." } };
  }
  if (user.email.trim().toLowerCase() !== invitation.email) {
    return { ok: false, refusal: { code: "EMAIL_MISMATCH", message: `This invitation is for ${invitation.email}. Sign in with that address to accept it.` } };
  }
  if (!user.emailVerified) {
    return { ok: false, refusal: { code: "NOT_VERIFIED", message: "Confirm your email address before accepting." } };
  }

  try {
    const result = await db.$transaction(async (tx) =>
      withOwnershipLock(tx, user.id, async () => {
        // Excludes THIS invitation's own contractor: re-accepting the same
        // invitation (a double-click, two tabs) must never be mistaken for
        // "owns another business" just because the first of the two grants
        // already committed by the time the second one checks.
        if (await ownsAnotherBusiness(tx, user.id, invitation.contractorId)) throw new OwnershipConflictError();

        // ATOMIC CONSUME. Only matches, and only updates, if the row is
        // STILL pending at this exact instant — the WHERE clause is the
        // guard, and Postgres's row lock on the UPDATE is what makes two
        // simultaneous accepts of the same token (a double-click, two tabs)
        // resolve to exactly one winner: the loser's `count` is 0 because the
        // winner's write already committed acceptedAt, not because of
        // anything checked in application code.
        const consumed = await tx.contractorInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date(), acceptedByUserId: user.id },
        });
        if (consumed.count === 0) throw new InvitationNoLongerValidError();

        // Re-read retirement INSIDE the lock, right before writing the
        // membership: the earlier check above is a fast-path message, not the
        // guarantee. A retirement that commits between that check and here
        // must not be followed by a membership grant.
        const fresh = await tx.contractor.findUniqueOrThrow({ where: { id: invitation.contractorId }, select: { active: true, slug: true, name: true } });
        if (!fresh.active) throw new ContractorRetiredAtAcceptError();

        await tx.contractorMembership.upsert({
          where: { userId_contractorId: { userId: user.id, contractorId: invitation.contractorId } },
          update: { role: invitation.role as ContractorRole, active: true, invitedByUserId: invitation.invitedByUserId },
          create: { userId: user.id, contractorId: invitation.contractorId, role: invitation.role as ContractorRole, active: true, invitedByUserId: invitation.invitedByUserId },
        });
        return { contractorId: invitation.contractorId, slug: fresh.slug, name: fresh.name };
      })
    );
    return { ok: true, ...result, already: false };
  } catch (e) {
    if (e instanceof OwnershipConflictError) {
      return { ok: false, refusal: { code: "ALREADY_OWNS_ANOTHER", message: "This account already owns another business. One owned business per account is the standing rule." } };
    }
    if (e instanceof InvitationNoLongerValidError) {
      // The narrow concurrent case: two simultaneous accepts of the SAME
      // token by the SAME user serialize on the ownership lock, and by the
      // time the second one reaches the atomic update, the first has already
      // consumed the row. Re-check for the idempotent-success shape before
      // refusing, so a double-click never surfaces as an error to the person
      // who legitimately just joined.
      const settled = await db.contractorInvitation.findUnique({ where: { id: invitation.id }, select: { acceptedByUserId: true, contractorId: true } });
      if (settled?.acceptedByUserId === user.id) {
        const membership = await db.contractorMembership.findUnique({ where: { userId_contractorId: { userId: user.id, contractorId: settled.contractorId } }, select: { active: true } });
        if (membership?.active) {
          return { ok: true, contractorId: invitation.contractorId, slug: invitation.contractor.slug, name: invitation.contractor.name, already: true };
        }
      }
      return { ok: false, refusal: { code: "INVITATION_NO_LONGER_VALID", message: "This invitation is no longer valid — it may have just been used, withdrawn, or expired." } };
    }
    if (e instanceof ContractorRetiredAtAcceptError) {
      return { ok: false, refusal: { code: "CONTRACTOR_RETIRED", message: "This business is no longer active." } };
    }
    throw e;
  }
}
