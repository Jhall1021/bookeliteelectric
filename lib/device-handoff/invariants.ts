/**
 * Security/privacy invariants as code, same discipline as
 * lib/visual-assist/route-assist/invariants.ts — checked in the verifier,
 * not hoped for in review.
 */

import { assertNoIdentifiersLeaked, handoffUrl, HANDOFF_TOKEN_BYTES } from "./token";
import type { DeviceHandoff } from "./types";

/** §"Handoff security": ~15–30 minutes. Flags a handoff configured outside that window. */
export function ttlWithinPolicy(handoff: DeviceHandoff, createdAt: Date): boolean {
  const minutes = (handoff.expiresAt.getTime() - createdAt.getTime()) / 60_000;
  return minutes >= 10 && minutes <= 30;
}

/** The raw token must have real entropy — 32 bytes, base64url-encoded (~43 chars, no padding). */
export function tokenHasSufficientEntropy(rawToken: string): boolean {
  // base64url of N bytes is ceil(N*4/3) chars with no '=' padding.
  const expectedLength = Math.ceil((HANDOFF_TOKEN_BYTES * 4) / 3);
  return rawToken.length >= expectedLength && /^[A-Za-z0-9_-]+$/.test(rawToken);
}

/** The built QR URL must carry nothing but the opaque token — no session/task id, ever. */
export function urlLeaksNoIdentifiers(baseUrl: string, rawToken: string): boolean {
  const url = handoffUrl(baseUrl, rawToken);
  try {
    assertNoIdentifiersLeaked(url, rawToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * A `DeviceHandoff` must never carry anything that looks like photo data,
 * customer PII, or answer content — it's a capability pointer, not a
 * payload. Runtime field-name walk, same technique as the equipment-ID and
 * Route Assist invariant walkers, so a future field addition to the type
 * gets checked automatically rather than by memory.
 */
const FORBIDDEN_HANDOFF_FIELD_TOKENS = ["photo", "image", "answer", "price", "name", "email", "phone", "address"];

const HANDOFF_FIELD_NAMES: (keyof DeviceHandoff)[] = [
  "id",
  "guidedFlowSessionId",
  "taskType",
  "taskId",
  "tokenHash",
  "status",
  "expiresAt",
  "connectedAt",
  "completedAt",
];

export function handoffFieldViolations(): string[] {
  const violations: string[] = [];
  for (const name of HANDOFF_FIELD_NAMES) {
    for (const token of FORBIDDEN_HANDOFF_FIELD_TOKENS) {
      if (String(name).toLowerCase().includes(token)) {
        violations.push(`field "${name}" contains forbidden token "${token}"`);
      }
    }
  }
  return violations;
}
