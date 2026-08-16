import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "elite_session_id";

/**
 * Every visitor gets an anonymous session id in a cookie before they've
 * created an account. The "My Visit" cart is keyed off this until checkout,
 * where it's attached to a real Customer record.
 */
export function getOrCreateSessionId(): string {
  const store = cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return id;
}
