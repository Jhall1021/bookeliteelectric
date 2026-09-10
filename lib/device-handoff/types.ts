/**
 * Device Handoff — a reusable capability for "continue this on your phone,"
 * not a Route Assist–specific QR implementation.
 *
 * This pure domain layer (token generation/hashing, the lifecycle state
 * machine, invariants) originated on `feat/route-assist-v1`, at a point
 * where no server-side mid-flow session existed to point a handoff at. It
 * is copied here UNCHANGED — see docs/design/device-handoff-v1.md for that
 * original architecture read — and `guidedFlowSessionId` below is the one
 * field renamed since then, to match the real `DeviceHandoff` Prisma model
 * this branch adds (docs/design/guided-flow-session-v1.md §4), which
 * FK's to the now-real `GuidedFlowSession`. Everything in THIS file stays
 * storage-agnostic pure domain logic on purpose; the persistence adapter
 * lives in `lib/deviceHandoffStore.ts`, not here.
 */

/** Reusable across every camera-oriented task, not just Route Assist. */
export const DEVICE_HANDOFF_TASK_TYPES = ["ROUTE_ASSIST", "PHOTO_CAPTURE", "VISUAL_ASSIST"] as const;
export type DeviceHandoffTaskType = (typeof DEVICE_HANDOFF_TASK_TYPES)[number];

/**
 * The only five states a handoff can be in. Desktop-facing copy
 * (`WAITING_FOR_PHONE`, `PHONE_CONNECTED`, ...) is a presentation-layer
 * label derived from this plus task-specific progress the caller tracks —
 * Device Handoff itself has no notion of "capture in progress," because
 * that would couple it back to Route Assist's internal steps.
 */
export const DEVICE_HANDOFF_STATUSES = ["AVAILABLE", "CONNECTED", "COMPLETED", "EXPIRED", "REVOKED"] as const;
export type DeviceHandoffStatus = (typeof DEVICE_HANDOFF_STATUSES)[number];

/**
 * `tokenHash` only — never the raw token. Mirrors `ContractorInvitation`
 * (prisma/schema.prisma): a hash so a database leak yields nothing usable,
 * raw crypto-random bytes (not a slow password hash) because there's no
 * low-entropy secret here to defend against a wordlist attack.
 *
 * Deliberately carries nothing about *what's inside* the session it points
 * to — no answers, no photos, no customer PII. It's a capability pointer:
 * "this token may resume this task on this session," nothing else. See
 * §6 (privacy) of the Device Handoff brief.
 */
export type DeviceHandoff = {
  id: string;
  guidedFlowSessionId: string;
  taskType: DeviceHandoffTaskType;
  taskId: string | null;
  tokenHash: string;
  status: DeviceHandoffStatus;
  expiresAt: Date;
  connectedAt: Date | null;
  completedAt: Date | null;
};

export type DeviceHandoffFailureReason = "TOKEN_MISMATCH" | "EXPIRED" | "REVOKED" | "ALREADY_COMPLETED";
