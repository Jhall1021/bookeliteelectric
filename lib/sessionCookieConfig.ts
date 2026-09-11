/**
 * The `elite_session_id` cookie's name and attributes — the one thing that
 * MUST be identical wherever this cookie is written, so that a value set by
 * one path is always honored by another.
 *
 * Deliberately zero imports. Two different runtimes write this cookie —
 * `lib/session.ts`'s `getOrCreateSessionId()` (Node, via `next/headers`, from
 * a Route Handler or Server Action) and `middleware.ts` (the Edge runtime,
 * via `NextResponse`'s cookie API) — and a module either of them imports must
 * run cleanly in both. Anything with a dependency (Prisma, `next/headers`,
 * `next/server`) belongs in the caller, not here.
 */

/** Also re-exported as `SESSION_COOKIE` from lib/session.ts for existing callers. */
export const SESSION_COOKIE_NAME = "elite_session_id";

/**
 * Attributes as they were already set by `getOrCreateSessionId()` before this
 * module existed — moved here unchanged, not revised. No `secure` attribute:
 * that gap predates this fix and isn't this change's to close.
 */
export const SESSION_COOKIE_ATTRS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
};
