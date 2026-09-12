import type { PlatformRole } from "@prisma/client";

/**
 * Fine-grained staff authority. Roles are labels; capabilities are the actual
 * decisions. Keep product code asking "may this actor do X?" instead of
 * scattering role-name comparisons through pages and server actions.
 */
export type PlatformCapability =
  | "PLATFORM_READ"
  | "CONTRACTOR_ONBOARD"
  | "CONTRACTOR_LAUNCH"
  | "CONTRACTOR_RETIRE"
  | "STAFF_ACCESS_MANAGE";

/**
 * Today Prisma exposes only PLATFORM_ADMIN. The string cases for the two
 * planned roles are deliberate forward-compatibility seams: they have no
 * effect until a schema migration actually permits those role values.
 */
export function platformCapabilitiesForRole(role: PlatformRole | string): readonly PlatformCapability[] {
  switch (role) {
    case "PLATFORM_ADMIN":
      return [
        "PLATFORM_READ",
        "CONTRACTOR_ONBOARD",
        "CONTRACTOR_LAUNCH",
        "CONTRACTOR_RETIRE",
        "STAFF_ACCESS_MANAGE",
      ];
    case "PLATFORM_ONBOARDING":
      return ["PLATFORM_READ", "CONTRACTOR_ONBOARD"];
    case "PLATFORM_SUPPORT":
      return ["PLATFORM_READ"];
    default:
      return [];
  }
}

export function hasPlatformCapability(role: PlatformRole | string, capability: PlatformCapability): boolean {
  return platformCapabilitiesForRole(role).includes(capability);
}

/**
 * A staff identity can be valid while still lacking authority for a specific
 * operation. Keep that refusal distinct from "not platform staff" so callers
 * can render an honest permission message without weakening authentication.
 */
export class PlatformCapabilityError extends Error {
  readonly capability: PlatformCapability;

  constructor(capability: PlatformCapability) {
    super(`Price2Book staff permission required: ${PLATFORM_CAPABILITY_LABELS[capability]}.`);
    this.name = "PlatformCapabilityError";
    this.capability = capability;
  }
}

/** Authoritative capability decision for mutation/read command boundaries. */
export function requirePlatformCapability(
  role: PlatformRole | string,
  capability: PlatformCapability,
): void {
  if (!hasPlatformCapability(role, capability)) throw new PlatformCapabilityError(capability);
}

export const PLATFORM_CAPABILITY_LABELS: Record<PlatformCapability, string> = {
  PLATFORM_READ: "view platform operations",
  CONTRACTOR_ONBOARD: "onboard contractors",
  CONTRACTOR_LAUNCH: "launch contractor services",
  CONTRACTOR_RETIRE: "retire contractors",
  STAFF_ACCESS_MANAGE: "manage staff access",
};
