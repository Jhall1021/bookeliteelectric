import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/adminContext";
import { peekInvitationFor } from "@/lib/contractorInvitations";
import { acceptInvitationAction } from "./actions";
import { SignOutRetry } from "./SignOutRetry";
import { ResendVerification } from "./ResendVerification";

export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  INVITATION_NOT_FOUND: "That invitation link is not valid.",
  INVITATION_REVOKED: "This invitation was withdrawn.",
  INVITATION_EXPIRED: "This invitation has expired.",
  INVITATION_ALREADY_USED: "This invitation has already been used.",
  INVITATION_NO_LONGER_VALID: "This invitation is no longer valid — it may have just been used, withdrawn, or expired.",
  CONTRACTOR_RETIRED: "This business is no longer active.",
  EMAIL_MISMATCH: "That invitation is for a different email address.",
  NOT_VERIFIED: "Confirm your email address first.",
  ALREADY_OWNS_ANOTHER: "This account already owns another business. One owned business per account is the standing rule.",
  NOT_SIGNED_IN: "Sign in or create an account with the invited address first.",
};

/**
 * Accepting an invitation — GET only, and read-only by construction:
 * peekInvitationFor never writes. The one thing that spends the token is the
 * POST form below, wired to acceptInvitationAction. See
 * lib/contractorInvitations.ts's header for why that split matters.
 *
 * `params.token` goes to peekInvitationFor and nowhere else; the accept form
 * carries it back in a hidden field for the action to re-resolve, the same
 * discipline the platform onboarding pages use for a contractor id.
 */
export default async function InvitePage({ params, searchParams }: { params: { token: string }; searchParams?: { error?: string; name?: string } }) {
  const token = params.token;
  const [peek, user] = await Promise.all([peekInvitationFor(prisma, token), currentUser()]);
  const path = `/invite/${encodeURIComponent(token)}`;
  const error = searchParams?.error && ERROR_TEXT[searchParams.error];
  // Never validated as a return path — it is inert prefill text for a form
  // field, not a redirect target, so lib/safeReturnPath.ts's rule does not
  // apply to it. Only ever set by inviteOwnerFor's own URL, but even an
  // attacker-supplied value here can do no more than mis-prefill a name.
  const namePrefill = searchParams?.name ?? "";

  if (!peek.found) {
    return <Message title="Invitation not found">That invitation link is not valid. Ask whoever invited you for a new one.</Message>;
  }

  if (peek.status === "accepted") {
    return <Message title="Already accepted">This invitation has already been used. If you meant to sign in, use the link below.</Message>;
  }
  if (peek.status === "revoked") {
    return <Message title="Invitation withdrawn">This invitation was withdrawn. Ask whoever invited you to send a new one.</Message>;
  }
  if (peek.status === "expired") {
    return <Message title="Invitation expired">This invitation has expired. Ask whoever invited you to send a new one.</Message>;
  }
  if (peek.status === "retired") {
    return <Message title="No longer active">{peek.contractorName} is no longer active on Price2Book. This invitation cannot be accepted.</Message>;
  }

  // peek.status === "pending" from here down.
  const matches = user && user.email.trim().toLowerCase() === peek.email;

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Join {peek.contractorName}</h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
        You&rsquo;ve been invited to join <span className="font-medium text-p2b-ink">{peek.contractorName}</span> on Price2Book, as <span className="font-medium text-p2b-ink">{peek.email}</span>.
      </p>

      {error && (
        <div className="mt-4 rounded-sm border border-p2b-error-line bg-p2b-error-bg p-3 text-sm text-p2b-error-ink">{error}</div>
      )}

      {!user && (
        <div className="mt-6 flex flex-col gap-3">
          <a href={`/sign-up?next=${encodeURIComponent(path)}&email=${encodeURIComponent(peek.email)}${namePrefill ? `&name=${encodeURIComponent(namePrefill)}` : ""}`} className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-p2b-accent-hover">
            Create an account
          </a>
          <a href={`/sign-in?next=${encodeURIComponent(path)}&email=${encodeURIComponent(peek.email)}`} className="w-full rounded-sm border border-p2b-line px-4 py-3.5 text-center text-base font-semibold text-p2b-ink hover:bg-p2b-canvas-alt">
            I already have an account
          </a>
          <p className="text-[13px] text-p2b-muted">Use {peek.email} — this invitation only accepts for that address.</p>
        </div>
      )}

      {user && !matches && (
        <div className="mt-6 rounded-sm border border-p2b-line bg-p2b-canvas-alt p-4 text-sm text-p2b-ink">
          <p>You&rsquo;re signed in as <span className="font-medium">{user.email}</span>, but this invitation is for <span className="font-medium">{peek.email}</span>.</p>
          <SignOutRetry path={path} />
        </div>
      )}

      {user && matches && !user.emailVerified && (
        <div className="mt-6 rounded-sm border border-p2b-line bg-p2b-amber-tint p-4 text-sm text-p2b-amber-ink">
          <p>Confirm your email address first — check your inbox for the link we sent when you signed up.</p>
          <ResendVerification email={user.email} path={path} />
        </div>
      )}

      {user && matches && user.emailVerified && (
        <form action={acceptInvitationAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover">
            Accept and join {peek.contractorName}
          </button>
        </form>
      )}
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">{title}</h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">{children}</p>
    </div>
  );
}
