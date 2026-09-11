/**
 * Token generation, hashing, and the QR URL builder.
 *
 * Same shape as `lib/session.ts`'s anonymous visit token
 * (`randomBytes(32).toString("base64url")`) for the raw token, and the same
 * rationale as `ContractorInvitation` for storing only a SHA-256 hash of it.
 *
 * A URL-borne token is more exposed than a cookie (it can end up in
 * browser history, a screenshot, a shared photo of the QR code itself) —
 * which is exactly why the brief asks for a short expiry (15–30 min) rather
 * than the 30-day visit-cookie window `lib/session.ts` uses for the same
 * random-bytes shape.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const HANDOFF_TOKEN_BYTES = 32;

export function generateHandoffToken(): string {
  return randomBytes(HANDOFF_TOKEN_BYTES).toString("base64url");
}

export function hashHandoffToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Constant-time comparison — a raw-token guess must not be distinguishable by timing. */
export function tokenMatchesHash(rawToken: string, tokenHash: string): boolean {
  const candidate = Buffer.from(hashHandoffToken(rawToken), "hex");
  const stored = Buffer.from(tokenHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/**
 * §"Handoff security" of the brief: the QR must not contain a raw
 * predictable session id. This function's signature is the enforcement —
 * it only ever accepts the opaque raw token, so there is nowhere to pass a
 * `guidedFlowSessionId` or `taskId` even by mistake. `assertNoIdentifiersLeaked`
 * below is a regression check on top of that, not the primary defense.
 */
export function handoffUrl(baseUrl: string, rawToken: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return `${trimmedBase}/handoff/${encodeURIComponent(rawToken)}`;
}

/** A cheap regression guard: the built URL must be nothing but base + opaque token. */
export function assertNoIdentifiersLeaked(url: string, rawToken: string): void {
  const suspiciousParamNames = ["guidedFlowSessionId", "taskId", "guided_flow_session_id", "task_id", "sessionId"];
  for (const name of suspiciousParamNames) {
    if (url.includes(name)) {
      throw new Error(`handoffUrl leaked an identifier-shaped parameter: "${name}"`);
    }
  }
  if (!url.includes(encodeURIComponent(rawToken))) {
    throw new Error("handoffUrl does not contain the token it was built from");
  }
}
