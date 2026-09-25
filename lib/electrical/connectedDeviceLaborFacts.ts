import type { PrismaClient, Prisma } from "@prisma/client";
import type { QuantityFacts } from "../laborOperations";

export const CONNECTED_DEVICE_POLICY_KEYS = {
  commissioning: "connected_device.commissioning",
} as const;

export const CONNECTED_DEVICE_COMMISSIONING_CHOICES = ["INCLUDED", "NOT_INCLUDED"] as const;
export const CONNECTED_DEVICE_SERVICE_SLUGS = new Set([
  "smart-outlet-upgrade",
  "smart-thermostat-install",
  "video-doorbell-existing-wiring",
  "new-video-doorbell-wiring",
  "floodlight-camera-existing",
  "new-exterior-flood-camera",
]);

type Db = PrismaClient | Prisma.TransactionClient;

export function connectedDeviceFactsFromChoice(choice: string | null | undefined): QuantityFacts | null {
  if (choice === "INCLUDED") return { commissioningIncluded: true };
  if (choice === "NOT_INCLUDED") return { commissioningIncluded: false };
  return null;
}

export function connectedDeviceFactsForService(serviceSlug: string, facts: QuantityFacts | null): QuantityFacts {
  return facts && CONNECTED_DEVICE_SERVICE_SLUGS.has(serviceSlug) ? facts : {};
}

/** Loads only an explicitly resolved contractor policy. Missing or unknown choices fail closed. */
export async function loadConnectedDeviceLaborFacts(db: Db, contractorId: string): Promise<QuantityFacts | null> {
  const policy = await db.contractorPolicyValue.findFirst({
    where: { contractorId, key: CONNECTED_DEVICE_POLICY_KEYS.commissioning },
    select: { choice: true, resolvedAt: true },
  });
  if (!policy?.resolvedAt) return null;
  return connectedDeviceFactsFromChoice(policy.choice);
}
