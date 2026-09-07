/**
 * ContractorCredential — the one reader/writer.
 *
 * THE INVARIANT (G4 audit, 7 Sep 2026, approved)
 *
 *   A credential is an explicit, contractor-owned fact about the
 *   contractor's WORKFORCE. Price2Book never invents, infers, defaults or
 *   derives it — including from Contractor.licenseNumber, ContractorTrade,
 *   ContractorRole, ContractorMembership or PlatformAccess. Absence means
 *   NOT ESTABLISHED: never "not held", and never "held". A credential fact
 *   by itself changes nothing — no price, no activation, no booking. It may
 *   affect a platform promise only where a SEPARATELY APPROVED requirement
 *   rule names it, and no such rule exists yet.
 *
 * WORKFORCE, NOT PERSONAL.
 *
 * Price2Book does not own technician dispatch strongly enough to know which
 * individual will perform any future booking. So `EPA_608` never means "the
 * contractor is 608-certified" or "every technician is" — it means "this
 * contractor states they can staff applicable work with a 608-certified
 * technician." Every label and message below is written from that reading;
 * changing the wording to a personal claim would misstate what the platform
 * actually knows.
 *
 * FACT ONLY. NO GATE.
 *
 * This module has no caller that blocks anything. There is deliberately no
 * export that asks "is this service allowed to activate" — that decision
 * needs a separately approved requirement rule (which service, which key,
 * what happens when it's missing), and none exists. Wiring one in here
 * would be exactly the invented inference the invariant forbids.
 *
 * THREE-STATE, NEVER A BOOLEAN DEFAULT.
 *
 * `credentialState` returns "not-established" | "declared" | "revoked".
 * There is no boolean helper that collapses "not-established" and "revoked"
 * to the same false — a caller that needs a boolean must say which one it
 * means, so a future gate cannot silently equate "we never asked" with "the
 * contractor said no."
 */

import type { PrismaClient } from "@prisma/client";

/**
 * The initial vocabulary. One key: the EPA Section 608 workforce capability
 * HVAC needs. Not a shared cross-trade registry — see
 * docs/design/g4-contractor-credential.md for why lib/plumbing/roles.ts is
 * deliberately NOT folded into this yet.
 *
 * Regulatory scope (which HVAC activities actually trigger Section 608,
 * whether it attaches to a person or a company, whether it expires) is
 * UNVERIFIED and out of scope for this key's existence. This constant names
 * the capability Price2Book lets a contractor record; it asserts no legal
 * conclusion about when that capability is required.
 */
export const CREDENTIAL_KEYS = ["EPA_608"] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export function isCredentialKey(key: string): key is CredentialKey {
  return (CREDENTIAL_KEYS as readonly string[]).includes(key);
}

/** Human copy for each key. Workforce-level wording only — see file header. */
export const CREDENTIAL_LABELS: Record<CredentialKey, string> = {
  EPA_608:
    "This contractor can staff applicable HVAC work with an EPA Section 608–certified technician.",
};

export type CredentialState = "not-established" | "declared" | "revoked";

export type CredentialRecord = {
  key: CredentialKey;
  state: CredentialState;
  declaredAt: Date;
  revokedAt: Date | null;
};

/**
 * The one read. Three states, no default.
 *
 * A missing row is "not-established" — not "revoked" and not "declared".
 * Nothing here reads Contractor.licenseNumber, ContractorTrade,
 * ContractorRole, ContractorMembership or PlatformAccess: the only inputs
 * are the two identifiers the caller supplies.
 */
export async function credentialState(
  db: PrismaClient,
  contractorId: string,
  key: CredentialKey
): Promise<CredentialRecord | { key: CredentialKey; state: "not-established" }> {
  const row = await db.contractorCredential.findUnique({
    where: { contractorId_key: { contractorId, key } },
    select: { declaredAt: true, revokedAt: true },
  });
  if (!row) return { key, state: "not-established" };
  return {
    key,
    state: row.revokedAt === null ? "declared" : "revoked",
    declaredAt: row.declaredAt,
    revokedAt: row.revokedAt,
  };
}

/** Every credential row this contractor has ever declared, revoked or not. */
export async function listCredentials(
  db: PrismaClient,
  contractorId: string
): Promise<CredentialRecord[]> {
  const rows = await db.contractorCredential.findMany({
    where: { contractorId },
    select: { key: true, declaredAt: true, revokedAt: true },
    orderBy: { key: "asc" },
  });
  return rows
    .filter((r): r is typeof r & { key: CredentialKey } => isCredentialKey(r.key))
    .map((r) => ({
      key: r.key,
      state: r.revokedAt === null ? "declared" : ("revoked" as const),
      declaredAt: r.declaredAt,
      revokedAt: r.revokedAt,
    }));
}

/**
 * Record that the contractor states they hold this workforce capability.
 *
 * Upsert, restamping `declaredAt` and clearing `revokedAt` — re-declaring
 * after a revocation is the same row, not a new one. This keeps CURRENT
 * state; it does not keep a full declare/revoke event history (a future
 * need, not this one — see the G4 audit, §11).
 */
export async function declareCredential(
  db: PrismaClient,
  contractorId: string,
  key: CredentialKey
): Promise<void> {
  const now = new Date();
  await db.contractorCredential.upsert({
    where: { contractorId_key: { contractorId, key } },
    update: { declaredAt: now, revokedAt: null },
    create: { contractorId, key, declaredAt: now, revokedAt: null },
  });
}

/**
 * Withdraw the statement. The row is kept as history, never deleted — see
 * the model's schema comment. A no-op (not an error) if nothing was ever
 * declared, so a caller does not need to check state first.
 */
export async function revokeCredential(
  db: PrismaClient,
  contractorId: string,
  key: CredentialKey
): Promise<void> {
  await db.contractorCredential.updateMany({
    where: { contractorId, key, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
