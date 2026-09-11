/**
 * The handoff state machine, as pure functions over a `DeviceHandoff`
 * record. No database read/write happens here — a caller (once persistence
 * exists) loads a row, calls one of these, and saves the result. Kept this
 * way so the whole state machine is provable with no DB, matching
 * `scripts/verify-device-handoff-domain.ts`.
 */

import { generateHandoffToken, hashHandoffToken, tokenMatchesHash } from "./token";
import type { DeviceHandoff, DeviceHandoffFailureReason, DeviceHandoffTaskType } from "./types";

/** Within the brief's suggested 15–30 minute window. */
export const DEFAULT_HANDOFF_TTL_MINUTES = 20;

export type CreateHandoffInput = {
  id: string;
  guidedFlowSessionId: string;
  taskType: DeviceHandoffTaskType;
  taskId?: string | null;
  now?: Date;
  ttlMinutes?: number;
};

export function createHandoff(input: CreateHandoffInput): { handoff: DeviceHandoff; rawToken: string } {
  const now = input.now ?? new Date();
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_HANDOFF_TTL_MINUTES;
  const rawToken = generateHandoffToken();
  return {
    rawToken,
    handoff: {
      id: input.id,
      guidedFlowSessionId: input.guidedFlowSessionId,
      taskType: input.taskType,
      taskId: input.taskId ?? null,
      tokenHash: hashHandoffToken(rawToken),
      status: "AVAILABLE",
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
      connectedAt: null,
      completedAt: null,
    },
  };
}

export type ResolveOutcome =
  | { ok: true; handoff: DeviceHandoff }
  | { ok: false; reason: DeviceHandoffFailureReason };

/**
 * §"Scanning an already-completed handoff": resolves safely to the current
 * state rather than erroring or recreating the task — COMPLETED is a
 * successful resolution, not a failure, so the caller can redirect to
 * "you're all set" instead of restarting capture. Only a token mismatch,
 * revocation, or expiry are real failures, and expiry never applies to an
 * already-completed handoff (the work already happened).
 */
export function resolveHandoff(handoff: DeviceHandoff, rawToken: string, now: Date = new Date()): ResolveOutcome {
  if (!tokenMatchesHash(rawToken, handoff.tokenHash)) return { ok: false, reason: "TOKEN_MISMATCH" };
  if (handoff.status === "REVOKED") return { ok: false, reason: "REVOKED" };
  if (handoff.status !== "COMPLETED" && now.getTime() > handoff.expiresAt.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  return { ok: true, handoff };
}

export type TransitionOutcome =
  | { ok: true; handoff: DeviceHandoff }
  | { ok: false; reason: DeviceHandoffFailureReason };

/** AVAILABLE -> CONNECTED. Idempotent: scanning again while already connected/completed is not an error. */
export function connectHandoff(handoff: DeviceHandoff, now: Date = new Date()): TransitionOutcome {
  if (handoff.status === "REVOKED") return { ok: false, reason: "REVOKED" };
  if (handoff.status === "COMPLETED") return { ok: true, handoff }; // §"already-completed" — no-op, not an error
  if (handoff.status === "EXPIRED" || now.getTime() > handoff.expiresAt.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (handoff.status === "CONNECTED") return { ok: true, handoff }; // reconnect — same phone, or a refresh
  return { ok: true, handoff: { ...handoff, status: "CONNECTED", connectedAt: now } };
}

/** CONNECTED -> COMPLETED. Marks the task done; the caller persists the actual result elsewhere. */
export function completeHandoff(handoff: DeviceHandoff, now: Date = new Date()): TransitionOutcome {
  if (handoff.status === "REVOKED") return { ok: false, reason: "REVOKED" };
  if (handoff.status === "COMPLETED") return { ok: true, handoff }; // idempotent
  if (now.getTime() > handoff.expiresAt.getTime()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, handoff: { ...handoff, status: "COMPLETED", completedAt: now } };
}

/** Any non-completed state -> REVOKED. A completed handoff can't be revoked — the work already happened. */
export function revokeHandoff(handoff: DeviceHandoff): TransitionOutcome {
  if (handoff.status === "COMPLETED") return { ok: false, reason: "ALREADY_COMPLETED" };
  return { ok: true, handoff: { ...handoff, status: "REVOKED" } };
}

export function isExpired(handoff: DeviceHandoff, now: Date = new Date()): boolean {
  return handoff.status !== "COMPLETED" && handoff.status !== "REVOKED" && now.getTime() > handoff.expiresAt.getTime();
}

/**
 * The desktop-facing presentation state — the mapping the brief's
 * `WAITING_FOR_PHONE` / `PHONE_CONNECTED` / `ROUTE_COMPLETED` /
 * `HANDOFF_EXPIRED` copy is drawn from. Kept as a pure derivation, not a
 * stored field, so it can never drift from `handoff.status`.
 */
export type DesktopPresentationState =
  | "WAITING_FOR_PHONE"
  | "PHONE_CONNECTED"
  | "TASK_COMPLETED"
  | "HANDOFF_EXPIRED"
  | "HANDOFF_REVOKED";

export function desktopPresentationState(handoff: DeviceHandoff, now: Date = new Date()): DesktopPresentationState {
  if (handoff.status === "REVOKED") return "HANDOFF_REVOKED";
  if (handoff.status === "COMPLETED") return "TASK_COMPLETED";
  if (isExpired(handoff, now)) return "HANDOFF_EXPIRED";
  return handoff.status === "CONNECTED" ? "PHONE_CONNECTED" : "WAITING_FOR_PHONE";
}
