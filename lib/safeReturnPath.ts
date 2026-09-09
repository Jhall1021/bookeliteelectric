/**
 * The ONLY `next` values sign-up and sign-in will ever act on: an exact
 * `/invite/<token>` path, nothing else.
 *
 * `next` arrives from a URL's query string, which means anyone can type it —
 * not just an invitation's own link. Used unvalidated, it is a textbook open
 * redirect: `?next=https://evil.example` (an absolute URL), or
 * `?next=//evil.example` (browsers treat a leading `//` as protocol-relative,
 * i.e. an OFFSITE host, not a local path) would send someone who just proved
 * their identity — the exact moment they are most likely to trust a redirect
 * — straight to a page that is not this site.
 *
 * The only legitimate use of `next` today is returning to an invitation
 * after authenticating, so the allowlist is exactly that shape: a leading
 * single `/`, the literal segment `invite`, then one path segment matching
 * the token's own alphabet (`mintInvitationToken` in
 * lib/contractorInvitations.ts produces base64url — `A-Za-z0-9_-`, no
 * padding). Nothing else — no query string, no fragment, no second slash —
 * is accepted, so a value this function returns is always safe to hand to
 * `callbackURL`, `window.location.href`, or a `Link href` without further
 * checking.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^\/invite\/[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
}
