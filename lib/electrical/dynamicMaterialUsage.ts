import type { PrismaClient } from "@prisma/client";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";
import { POLICY_KEYS, SURFACE_RACEWAY_SYSTEM_KEY } from "./surfaceSystemConfiguration";

export type DynamicMaterialUsingService = { id: string; name: string; slug: string };

const SURFACE_SERVICE_SLUGS = [
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
] as const;

const COMMON_SURFACE_ROLES = [
  SURFACE_ROLES.channel,
  SURFACE_ROLES.joint,
  SURFACE_ROLES.insideElbow,
  SURFACE_ROLES.outsideElbow,
  SURFACE_ROLES.flatElbow,
  SURFACE_ROLES.supportClip,
] as const;

/**
 * Material dependencies that exist at runtime rather than as ServiceMaterial
 * rows. Surface-raceway quantities depend on the customer's route geometry,
 * the contractor's selected system, and their conductor policy, so storing a
 * fixed recipe quantity would be false. The catalog still needs to say which
 * services can consume those materials, though; this read model supplies that
 * missing relationship without changing pricing authority.
 */
export async function loadDynamicMaterialUsage(
  db: PrismaClient,
  contractorId: string,
): Promise<Map<string, DynamicMaterialUsingService[]>> {
  const [services, conductorPolicy, system] = await Promise.all([
    db.service.findMany({
      where: { contractorId, slug: { in: [...SURFACE_SERVICE_SLUGS] } },
      select: { id: true, name: true, slug: true },
    }),
    db.contractorPolicyValue.findUnique({
      where: { contractorId_key: { contractorId, key: POLICY_KEYS.conductorSpec } },
      select: { choice: true, resolvedAt: true },
    }),
    db.contractorMaterialSystem.findUnique({
      where: { contractorId_systemKey: { contractorId, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
      select: {
        groundingStrategy: true,
        sourceTerminationMaterial: { select: { key: true } },
        destinationTerminationMaterial: { select: { key: true } },
      },
    }),
  ]);

  const usage = new Map<string, DynamicMaterialUsingService[]>();
  const add = (key: string, service: DynamicMaterialUsingService) => {
    const existing = usage.get(key);
    if (existing) {
      if (!existing.some((candidate) => candidate.id === service.id)) existing.push(service);
    } else {
      usage.set(key, [service]);
    }
  };

  for (const service of services) {
    for (const role of COMMON_SURFACE_ROLES) add(role, service);
    add(service.slug === "surface-mounted-fixture-box" ? SURFACE_ROLES.fixtureBox : SURFACE_ROLES.deviceBox, service);

    const terminationRoles = [
      system?.sourceTerminationMaterial?.key,
      system?.destinationTerminationMaterial?.key,
    ].filter((key): key is string => !!key);
    for (const role of terminationRoles) add(role, service);

    const gauge = conductorPolicy?.resolvedAt ? conductorPolicy.choice : null;
    if (gauge && /^(10|12|14)$/.test(gauge)) {
      add(`CONDUCTOR_THHN_${gauge}_UNGROUNDED`, service);
      add(`CONDUCTOR_THHN_${gauge}_GROUNDED`, service);
      if (system?.groundingStrategy === "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR") {
        add(`CONDUCTOR_THHN_${gauge}_EQUIPMENT_GROUND`, service);
      }
    }
  }

  return usage;
}
