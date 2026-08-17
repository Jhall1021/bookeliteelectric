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
function expectedToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update("elite-admin").digest("hex");
}

export function checkAdminPassword(password: string): boolean {
  const real = process.env.ADMIN_PASSWORD ?? "";
  if (!real) return false; // fail closed if not configured
  return password === real;
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
  return token === expectedToken();
}
