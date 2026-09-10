/**
 * Persistence adapter for `lib/device-handoff/`'s pure domain — this file
 * is the ONLY thing in the codebase allowed to hold a `PrismaClient` next
 * to a raw handoff token, and even here the raw token exists for one
 * instant (the return value of `create`) and is never written anywhere.
 * Every state transition below defers its actual decision to the pure
 * `lifecycle.ts` functions already proven in isolation
 * (`scripts/verify-device-handoff-domain.ts`) — this file's only job is
 * loading a row, calling one of those, and saving the result.
 */

import type { PrismaClient, DeviceHandoff as DeviceHandoffRow } from "@prisma/client";
import {
  completeHandoff as completeHandoffPure,
  connectHandoff as connectHandoffPure,
  createHandoff as createHandoffPure,
  desktopPresentationState,
  resolveHandoff as resolveHandoffPure,
  revokeHandoff as revokeHandoffPure,
  type DeviceHandoff,
  type DeviceHandoffFailureReason,
  type DeviceHandoffTaskType,
  hashHandoffToken,
} from "./device-handoff";

function toDomain(row: DeviceHandoffRow): DeviceHandoff {
  return {
    id: row.id,
    guidedFlowSessionId: row.guidedFlowSessionId,
    taskType: row.taskType,
    taskId: row.taskId,
    tokenHash: row.tokenHash,
    status: row.status,
    expiresAt: row.expiresAt,
    connectedAt: row.connectedAt,
    completedAt: row.completedAt,
  };
}

export type CreateHandoffInput = {
  guidedFlowSessionId: string;
  taskType: DeviceHandoffTaskType;
  taskId?: string | null;
};

export async function createAndPersistHandoff(
  db: PrismaClient,
  input: CreateHandoffInput
): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  // createHandoffPure's `id` is caller-supplied by design (lifecycle.ts) —
  // a placeholder here, since the DB assigns the real cuid() on create()
  // below and nothing reads this one.
  const { handoff, rawToken } = createHandoffPure({
    id: "pending",
    guidedFlowSessionId: input.guidedFlowSessionId,
    taskType: input.taskType,
    taskId: input.taskId,
  });
  const row = await db.deviceHandoff.create({
    data: {
      guidedFlowSessionId: input.guidedFlowSessionId,
      taskType: input.taskType,
      taskId: input.taskId ?? null,
      tokenHash: handoff.tokenHash,
      expiresAt: handoff.expiresAt,
    },
  });
  return { id: row.id, rawToken, expiresAt: row.expiresAt };
}

export type ResolveResult =
  | { ok: true; handoff: DeviceHandoffRow }
  | { ok: false; reason: DeviceHandoffFailureReason | "NOT_FOUND" };

/**
 * Looks up by the token's hash directly — an indexed, unique lookup, not a
 * scan. This does not weaken the "never store the raw token" guarantee:
 * finding the ROW by its hash reveals nothing about the raw token itself
 * (the hash is one-way), and the actual authorization decision still runs
 * through `resolveHandoffPure`'s constant-time comparison and status
 * checks, so a row that happens to hash-collide (practically impossible
 * with SHA-256) would still fail the real check.
 */
export async function resolveHandoffByToken(db: PrismaClient, rawToken: string): Promise<ResolveResult> {
  const row = await db.deviceHandoff.findUnique({ where: { tokenHash: hashHandoffToken(rawToken) } });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  const outcome = resolveHandoffPure(toDomain(row), rawToken, new Date());
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  return { ok: true, handoff: row };
}

export async function connectHandoff(db: PrismaClient, id: string): Promise<DeviceHandoffRow | null> {
  const row = await db.deviceHandoff.findUnique({ where: { id } });
  if (!row) return null;
  const outcome = connectHandoffPure(toDomain(row));
  if (!outcome.ok) return row;
  return db.deviceHandoff.update({
    where: { id },
    data: { status: outcome.handoff.status, connectedAt: outcome.handoff.connectedAt },
  });
}

export async function completeHandoff(db: PrismaClient, id: string): Promise<DeviceHandoffRow | null> {
  const row = await db.deviceHandoff.findUnique({ where: { id } });
  if (!row) return null;
  const outcome = completeHandoffPure(toDomain(row));
  if (!outcome.ok) return row;
  return db.deviceHandoff.update({
    where: { id },
    data: { status: outcome.handoff.status, completedAt: outcome.handoff.completedAt },
  });
}

export async function revokeHandoff(db: PrismaClient, id: string): Promise<DeviceHandoffRow | null> {
  const row = await db.deviceHandoff.findUnique({ where: { id } });
  if (!row) return null;
  const outcome = revokeHandoffPure(toDomain(row));
  if (!outcome.ok) return row;
  return db.deviceHandoff.update({ where: { id }, data: { status: outcome.handoff.status } });
}

export async function desktopStatus(db: PrismaClient, id: string): Promise<ReturnType<typeof desktopPresentationState> | null> {
  const row = await db.deviceHandoff.findUnique({ where: { id } });
  if (!row) return null;
  return desktopPresentationState(toDomain(row));
}
