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
 * client's own link-scanning prefetch, or the browser's own preview, issues a
 * GET before a human opens the page, and a token a GET could spend would be
 * burned before the real visit. Only `acceptInvitationFor`, called from a
 * POST server action, ever writes `acceptedAt`.
 *
 * THE TOKEN IS HASHED AT REST, RAW IN THE EMAIL ONLY. Matches
 * ContractorInvitation.tokenHash's own doc comment: a leaked database gives
 * an attacker nothing usable. Never log the raw token, and never let it
 * appear in an Error's message — every refusal here is a fixed, generic
 * string.
 *
 * LOCKED ON TWO DOMAINS, IN ONE FIXED ORDER: withContractorLock first, then
 * withOwnershipLock — see lib/contractorCreation.ts's header. Serializes
 * acceptance against a concurrent resend/revoke/retire of the SAME
 * contractor (withContractorLock), and against a concurrent grant of the
 * SAME user's ownership through a DIFFERENT contractor (withOwnershipLock).
 * Retirement is re-read holding the contractor lock, right before the
 * membership write — a check made once, outside any lock, and never
 * repeated under one, is exactly the gap that let a retirement commit
 * between the check and the write.
 */

import type { PrismaClient, ContractorRole, Prisma } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { OwnershipConflictError, ContractorRetiredError, withOwnershipLock, withContractorLock, ownsAnotherBusiness } from "./contractorCreation";

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

/**
 * The ONE shape of a successful, idempotent replay, computed identically
 * everywhere acceptInvitationFor might report `already: true` — the early
 * exit for a token that turns out to already be spent, and the recovery path
 * after losing the atomic-consume race to a concurrent accept of the SAME
 * token. Both call this and nothing else, so the two can never disagree.
 *
 * Requires ALL of: this exact user is who spent it; their email is STILL
 * verified; the contractor is STILL active; the membership it should have
 * created still exists and is active. Any one failing means "no" — the
 * caller then falls through to whatever refusal fits (already used,
 * retired, or the generic no-longer-valid), never a stale "yes".
 */
async function idempotentAcceptance(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { acceptedByUserId: string | null; contractorId: string; userId: string; emailVerified: boolean }
): Promise<AcceptResult | null> {
  if (params.acceptedByUserId !== params.userId) return null;
  if (!params.emailVerified) return null;
  const [membership, contractor] = await Promise.all([
    tx.contractorMembership.findUnique({
      where: { userId_contractorId: { userId: params.userId, contractorId: params.contractorId } },
      select: { active: true },
    }),
    tx.contractor.findUnique({ where: { id: params.contractorId }, select: { slug: true, name: true, active: true } }),
  ]);
  if (!membership?.active) return null;
  if (!contractor?.active) return null;
  return { ok: true, contractorId: params.contractorId, slug: contractor.slug, name: contractor.name, already: true };
}

/**
 * Accept an invitation and become the contractor's member with the invited
 * role. Called ONLY from a POST action — see the header.
 *
 * `user` is the authenticated caller's identity; this does not read the
 * session itself, matching every other authority in this codebase, so it
 * stays testable without one. `null` means signed out.
 *
 * REFUSAL ORDER, deliberately checked outside the transaction first (for a
 * fast, specific message) and then RE-CHECKED inside it, holding the locks
 * (for correctness under concurrency): not found → already used (idempotent
 * — see `idempotentAcceptance`) → revoked → expired → contractor retired →
 * wrong email → unverified → already owns another business → consume.
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

  if (invitation.acceptedAt) {
    const idempotent = await idempotentAcceptance(db, {
      acceptedByUserId: invitation.acceptedByUserId, contractorId: invitation.contractorId,
      userId: user.id, emailVerified: user.emailVerified,
    });
    if (idempotent) return idempotent;
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
      withContractorLock(tx, invitation.contractorId, () =>
        withOwnershipLock(tx, user.id, async () => {
          // Re-read retirement holding BOTH locks, right before writing.
          // The check above is a fast-path message, not the guarantee — a
          // retirement committing between that check and here must not be
          // followed by a membership grant. retireContractorFor takes the
          // same contractor lock, so whichever of the two gets here first
          // completes entirely before the other's reads run.
          const fresh = await tx.contractor.findUniqueOrThrow({ where: { id: invitation.contractorId }, select: { active: true, slug: true, name: true } });
          if (!fresh.active) throw new ContractorRetiredError();

          if (await ownsAnotherBusiness(tx, user.id, invitation.contractorId)) throw new OwnershipConflictError();

          // ATOMIC CONSUME. Only matches, and only updates, if the row is
          // STILL pending at this exact instant. With the contractor lock
          // held, no concurrent caller can be mutating this row at the same
          // time — this conditional guard is defense-in-depth, not the only
          // thing preventing two winners.
          const consumed = await tx.contractorInvitation.updateMany({
            where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
            data: { acceptedAt: new Date(), acceptedByUserId: user.id },
          });
          if (consumed.count === 0) throw new InvitationNoLongerValidError();

          await tx.contractorMembership.upsert({
            where: { userId_contractorId: { userId: user.id, contractorId: invitation.contractorId } },
            update: { role: invitation.role as ContractorRole, active: true, invitedByUserId: invitation.invitedByUserId },
            create: { userId: user.id, contractorId: invitation.contractorId, role: invitation.role as ContractorRole, active: true, invitedByUserId: invitation.invitedByUserId },
          });
          return { contractorId: invitation.contractorId, slug: fresh.slug, name: fresh.name };
        })
      )
    );
    return { ok: true, ...result, already: false };
  } catch (e) {
    if (e instanceof OwnershipConflictError) {
      return { ok: false, refusal: { code: "ALREADY_OWNS_ANOTHER", message: "This account already owns another business. One owned business per account is the standing rule." } };
    }
    if (e instanceof ContractorRetiredError) {
      return { ok: false, refusal: { code: "CONTRACTOR_RETIRED", message: "This business is no longer active." } };
    }
    if (e instanceof InvitationNoLongerValidError) {
      // The narrow concurrent case: two simultaneous accepts of the SAME
      // token by the SAME user serialize on the contractor lock, and by the
      // time the second one reaches the atomic update, the first has already
      // consumed the row. Re-check for idempotent success — the SAME check,
      // not a copy of it — before refusing, so a double-click never
      // surfaces as an error to the person who legitimately just joined.
      const settled = await db.contractorInvitation.findUnique({ where: { id: invitation.id }, select: { acceptedByUserId: true, contractorId: true } });
      const idempotent = settled
        ? await idempotentAcceptance(db, { acceptedByUserId: settled.acceptedByUserId, contractorId: settled.contractorId, userId: user.id, emailVerified: user.emailVerified })
        : null;
      if (idempotent) return idempotent;
      return { ok: false, refusal: { code: "INVITATION_NO_LONGER_VALID", message: "This invitation is no longer valid — it may have just been used, withdrawn, or expired." } };
    }
    throw e;
  }
}
