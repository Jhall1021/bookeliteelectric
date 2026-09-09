# Contractor accounts and tenant ownership

**Status:** proposed. Release-hardening item #2.

## What exists

`lib/auth.ts` runs better-auth with `emailAndPassword: { enabled: false }` and
the magic-link plugin as the only method. `ContractorMembership` is the
authority for tenant access and `resolveAdminContractor` reads it on the
unguarded client — deliberately, because it is the query that decides which
tenant context to open. `ContractorInvitation` exists in the schema with an
email, a role and a SHA-256 `tokenHash`.

**Neither way in was built.** A brand-new user creating a contractor had no
flow at all, and invitations turn out to be schema without an implementation —
see the section at the foot of this document. The BrightPath proof needed a
direct membership write, which was fine for a fixture and is not acceptable for
release. Creation is now built; invitations are not.

## Authentication

| requirement | approach |
| --- | --- |
| email as username | already true — better-auth keys on email; keep it as the sole identifier |
| email + password | enable better-auth's `emailAndPassword`; magic link stays as recovery, not as the normal login |
| email verification | require a verified address before a session can open any tenant context |
| password reset | the existing magic-link plugin, scoped to a reset flow — a single-use, short-expiry link, which is what it already is |
| password hashing | better-auth's default (scrypt); do not hand-roll |
| brute force / rate limit | per-email and per-IP throttling on sign-in, reset request, and verification resend |
| revocable sessions | better-auth stores sessions in the database — expose a list-and-revoke surface, and revoke all on password change |

**Magic link stops being the normal login.** It stays for recovery, as the
fallback when someone cannot get in, and for invitation acceptance if that is
ever built. That is
a narrowing of its role, not a removal: the proof in this session was blocked
for an hour because signing in required an inbox round-trip, and a contractor
between jobs will hit the same wall.

Two things worth deciding explicitly rather than inheriting:

- **Verification before or after first sign-in.** Blocking a session until the
  address is verified is safer and is what gates a tenant; letting them in and
  gating only tenant-affecting actions is kinder to a contractor mid-setup.
  Recommendation: allow the session, gate contractor creation and every
  membership on verification.
- **Rate-limit response shape.** It must not distinguish "no such account" from
  "wrong password" — the current magic-link flow already avoids that, and
  passwords must not reintroduce it.

## Creating a contractor and becoming its OWNER

The missing flow. Four steps, and the third is the one that matters:

1. **Sign up** — email, password, verification. A user with no memberships.
2. **No memberships → create-or-join.** `resolveAdminContractor` currently
   throws `NoMembershipError` here and the layout redirects; today that is a
   dead end. It should offer the two real paths: create a contractor, or accept
   a pending invitation (which can be looked up by the verified email).
3. **Create the contractor.** One transaction: `Contractor` + `ContractorSite`
   + `ContractorMembership{role: OWNER}` + `ContractorOnboarding`. It must be
   one transaction for the same reason catalog installation is: a contractor
   with no site, or a contractor with no owner, is a broken tenant somebody has
   to repair by hand.
4. **Guided Setup** takes over, unchanged.

**The isolation architecture does not move.** Creation happens on the unguarded
client — it must, because there is no tenant context until the row exists, and
the guard refuses `create` on a contractor-scoped model without one. That is
the same seam `resolveAdminContractor` already uses, and it stays the *only*
place a membership is written at all. Everything
downstream continues to resolve tenancy from `ContractorMembership`, and the
cross-tenant suite runs against the new tenant like any other.

Three guards worth writing down before this is built:

- **Slug and hosted address are claimed atomically** with the contractor, and
  are globally unique. Two signups racing for `elite-electric` must not both
  win, and the loser should get a clear rename rather than a constraint error.
- **Nothing grants OWNER except creation.** One authority
  (`lib/contractorCreation.ts`), so a second way cannot appear quietly — the
  pattern already used for activation, publication and policy resolution. An
  invitation path, when built, must be the only other one.
- **A verified email is required to hold a membership**, so an unverified
  address can never reach another contractor's data even transiently.

## What this does not change

`ContractorMembership` stays authoritative. The tenant guard, the site-identifier
routing, and ADR-011's "a browser session is not a tenant" are untouched — this
adds a way to bring a tenant into existence, not a new way to reach one.


## Invitations — built, Phase 3A (7 September 2026)

`ContractorInvitation` (email, role, SHA-256 `tokenHash`, `expiresAt`,
`acceptedAt`/`acceptedByUserId`, `revokedAt`) now has both ends built:

- **Minting.** `inviteOwnerFor` in `lib/platformOnboarding.ts` — staff-only,
  through `withPlatformContractorFor` like every other command in that
  module. ONE PENDING INVITATION PER CONTRACTOR: inviting again, to the same
  address or a different one, revokes any invitation that is still neither
  accepted nor revoked and creates a fresh one in the same transaction, so
  the old link stops working the instant the new one exists. Refuses on a
  retired contractor. `revokeInvitationFor` withdraws one explicitly and
  deliberately does NOT check retirement — see below.
- **Acceptance.** `acceptInvitationFor` in `lib/contractorInvitations.ts` —
  neutral ground, not part of the platform module, because the person
  accepting is not staff; the same relationship `createContractorForUser`
  (self-serve) already has to the founder's `attachOwnerFor`. Consumption is
  atomic (a conditional `updateMany` that only one of two simultaneous
  accepts can win) and idempotent ONLY for the original accepting user with a
  still-active membership — anything else that already carries `acceptedAt`
  is spent and refused, never re-granted. `/invite/[token]`
  (`app/(auth)/invite/[token]/page.tsx`) is GET-only and read-only
  (`peekInvitationFor`); only a POST server action ever calls
  `acceptInvitationFor`, so an email client's link-prefetch cannot burn the
  token before a human opens the page.
- **The one-owned-business rule, race-safe.** All three paths that can grant
  a user their first OWNER membership — self-serve creation, `attachOwnerFor`,
  invitation acceptance — now check and write inside
  `withOwnershipLock` (`lib/contractorCreation.ts`), a transaction-scoped
  Postgres advisory lock keyed to the user. A plain "check, then write" is a
  TOCTOU gap under READ COMMITTED; the lock closes it regardless of which two
  of the three paths race each other.
- **Retirement.** Neutralized, not deleted: `acceptInvitationFor` refuses
  `CONTRACTOR_RETIRED` (checked once before the transaction for a fast
  message, and again inside it, right before the membership write, so a
  retirement racing an acceptance cannot be followed by a grant).
  `attachOwnerFor`, `enrolTradeFor` and `installTradeTemplateFor` gained the
  same server-side retirement refusal they were missing (a gap the retire
  branch's own review had already found and left open). `revokeInvitationFor`
  is the one exception on purpose: withdrawing an invitation must keep
  working on a retired business.
- **Delivery.** Reuses the platform's own mailer (`sendPlatformMail`,
  `lib/auth.ts`) via a new `sendInvitationEmail`. The invitation row and the
  email send are not one unit: a send failure is reported
  (`delivered: false`, the underlying error) without rolling back the row,
  and the fix is calling invite again — the same revoke-and-replace path a
  deliberate resend uses.

Not built here, on purpose: `/start`'s messaging changed to point at "check
your email" now that a real link exists, but Phase 3B owns the full
contractor setup wizard — `/dashboard/welcome` is a minimal, tenant-bound
landing page and nothing more.
