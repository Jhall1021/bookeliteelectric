import { cookies } from "next/headers";
import crypto from "crypto";

const ADMIN_COOKIE = "elite_admin_session";

// Deliberately simple for a single-owner business: one shared admin
// password (ADMIN_PASSWORD env var), not individual staff logins with
// roles. The session token is an HMAC of a fixed string using a second
// secret (ADMIN_SESSION_SECRET) — deterministic, so no session store is
// needed, but it also means sessions don't expire or rotate. Fine for a
// first admin pass; real staff-account auth is a future upgrade if the
// team grows past one shared login.
//
// WHY THIS NOW FAILS CLOSED
//
// ADMIN_SESSION_SECRET was referenced here but never set in Vercel. Node
// accepts an empty HMAC key without complaint, so expectedToken() returned a
// perfectly valid, deterministic 64-character token derived from a known
// algorithm and a known fixed string. Anyone able to read this file could
// compute that token, set the cookie, and reach the admin — publishing
// prices, reading customer bookings, disconnecting Jobber — without ever
// touching the password.
//
// checkAdminPassword below already refused to work without its variable.
// This one didn't, which is the whole lesson: a missing secret has to be an
// error, never a default. Same rule as loadPricingSettings, which throws
// rather than inventing a rate. An admin route that 500s is vastly better
// than one that authenticates strangers.
function expectedToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    // Loud on the server, and nothing usable returned. Deliberately not a
    // fallback value of any kind.
    console.error(
      "[adminAuth] ADMIN_SESSION_SECRET is not configured — refusing to issue " +
        "or validate an admin session."
    );
    throw new Error("ADMIN_SESSION_SECRET is not configured");
  }
  return crypto.createHmac("sha256", secret).update("elite-admin").digest("hex");
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `a === b` on strings short-circuits at the first differing character, so
 * how long it takes is a signal about how much of the value was right. Hard
 * to exploit across a network, cheap to remove.
 *
 * Lengths are hashed to a fixed size first, because timingSafeEqual throws on
 * mismatched lengths — and that throw would itself be a length oracle.
 */
function secretsMatch(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkAdminPassword(password: string): boolean {
  const real = process.env.ADMIN_PASSWORD ?? "";
  if (!real) return false; // fail closed if not configured
  return secretsMatch(password, real);
}

export function setAdminSessionCookie() {
  cookies().set(ADMIN_COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export function clearAdminSessionCookie() {
  cookies().delete(ADMIN_COOKIE);
}

export function isAdminAuthenticated(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    return secretsMatch(token, expectedToken());
  } catch {
    // Secret missing. Not authenticated — never the other way round.
    return false;
  }
}
