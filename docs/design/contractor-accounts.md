# Contractor accounts and tenant ownership

**Status:** proposed. Release-hardening item #2.

## What exists

`lib/auth.ts` runs better-auth with `emailAndPassword: { enabled: false }` and
the magic-link plugin as the only method. `ContractorMembership` is the
authority for tenant access and `resolveAdminContractor` reads it on the
unguarded client — deliberately, because it is the query that decides which
tenant context to open. `ContractorInvitation` already exists with an email, a
role, and a SHA-256 `tokenHash` whose raw token lives only in the email.

So invitation into an **existing** contractor is built. What has no product
flow at all is a brand-new user **creating** a contractor and becoming its
OWNER. The BrightPath proof needed a direct membership write, which was fine
for a fixture and is not acceptable for release.

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

**Magic link stops being the normal login.** It stays for recovery, for
invitation acceptance, and as the fallback when someone cannot get in. That is
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
place a membership is written outside an invitation acceptance. Everything
downstream continues to resolve tenancy from `ContractorMembership`, and the
cross-tenant suite runs against the new tenant like any other.

Three guards worth writing down before this is built:

- **Slug and hosted address are claimed atomically** with the contractor, and
  are globally unique. Two signups racing for `elite-electric` must not both
  win, and the loser should get a clear rename rather than a constraint error.
- **Nothing grants OWNER except creation and invitation acceptance.** A single
  authority (`lib/contractorCreation.ts`) alongside the existing invitation
  path, so a third way cannot appear quietly — the pattern already used for
  activation, publication and policy resolution.
- **A verified email is required to hold a membership**, so an unverified
  address can never reach another contractor's data even transiently.

## What this does not change

`ContractorMembership` stays authoritative. The tenant guard, the site-identifier
routing, and ADR-011's "a browser session is not a tenant" are untouched — this
adds a way to bring a tenant into existence, not a new way to reach one.
