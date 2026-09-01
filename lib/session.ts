import { cookies, headers } from "next/headers";
import { randomBytes, randomUUID } from "crypto";

const SESSION_COOKIE = "elite_session_id";

/**
 * The header an embedded storefront sends instead of the cookie.
 *
 * WHY A HEADER AT ALL
 *
 * The cookie is `SameSite=Lax`, so a cross-origin iframe never sends it —
 * `Lax` is withheld in third-party contexts, and `None` is blocked outright by
 * Safari's ITP and Firefox's Total Cookie Protection. The cart would not
 * survive one navigation inside an embed.
 *
 * WHAT THE TOKEN IS, AND IS NOT
 *
 * It is an opaque random string that names a VISIT. It carries no contractor
 * id, encodes nothing, and grants no tenancy: `findOpenVisit(contractorId,
 * sessionId)` takes the contractor FIRST, resolved from the site identifier,
 * and the token only ever narrows within it. A token from another contractor's
 * storefront resolves to nothing rather than to somebody else's cart — ADR-011,
 * unchanged, and the reason the same ordering that made the cookie safe makes
 * this safe.
 *
 * Never in a URL. A query string is copied into referrers, share sheets,
 * server logs and screenshots, and a visit token in any of those is somebody
 * else's cart.
 */
const VISIT_TOKEN_HEADER = "x-price2book-visit";

/** 32 bytes of randomness. Guessing one must be worthless, not merely hard. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The visit token this request carries, from the header or the cookie.
 *
 * The header wins when present, because only an embed sends one and an embed
 * has no usable cookie. Everything downstream sees a session id and cannot
 * tell which surface produced it — which is the point: the engine does not
 * branch on the surface.
 */
function tokenFromRequest(): string | null {
  const fromHeader = headers().get(VISIT_TOKEN_HEADER);
  if (fromHeader && fromHeader.length >= 16 && fromHeader.length <= 256) return fromHeader;
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Every visitor gets an anonymous session id before they've created an
 * account. The "My Visit" cart is keyed off this until checkout, where it's
 * attached to a real Customer record.
 *
 * An embedded request arrives with its token already in hand and no cookie can
 * be set for it, so this returns what it was given rather than minting a
 * second identity the browser would immediately forget.
 */
export function getOrCreateSessionId(): string {
  const existing = tokenFromRequest();
  if (existing) return existing;

  const id = randomUUID();
  cookies().set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return id;
}

/**
 * Read-only counterpart to getOrCreateSessionId.
 *
 * Server Components can read cookies but not write them — calling
 * cookies().set() during a render throws ("Cookies can only be modified in a
 * Server Action or Route Handler"). Pages that just need to know whether a
 * visit is already in progress must use this instead, and accept null for a
 * first-time visitor who hasn't been issued a token yet.
 */
export function getSessionId(): string | null {
  return tokenFromRequest();
}

/**
 * Mint a token for an embedded storefront to keep in its own storage.
 *
 * Handed to the embed once, over its own origin, and stored there — partitioned
 * per top-level site by every current browser, so one contractor's page cannot
 * read the token issued on another's. The server never has to trust where it
 * came from, because the token alone still reaches nothing without a resolved
 * contractor.
 */
export function issueVisitToken(): string {
  return newToken();
}

export { VISIT_TOKEN_HEADER };
