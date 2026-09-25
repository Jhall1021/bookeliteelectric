import { circuitPackageMaterialRoleKeysForServices } from "./circuitPackageMaterialRoles";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";

const SURFACE_ROUTE_SERVICES = new Set([
  "new-120v-outlet",
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
]);

const PREPARED_SURFACE_SYSTEM_ROLES = [
  SURFACE_ROLES.channel,
  SURFACE_ROLES.joint,
  SURFACE_ROLES.insideElbow,
  SURFACE_ROLES.outsideElbow,
  SURFACE_ROLES.flatElbow,
  SURFACE_ROLES.supportClip,
  SURFACE_ROLES.transition,
  SURFACE_ROLES.deviceBox,
  SURFACE_ROLES.fixtureBox,
  "CONDUCTOR_THHN_12_UNGROUNDED",
  "CONDUCTOR_THHN_12_GROUNDED",
  "CONDUCTOR_THHN_12_EQUIPMENT_GROUND",
];

/** Roles selected at runtime rather than attached to a static recipe row. */
export function electricalRuntimeMaterialRoleKeysForServices(serviceSlugs: Iterable<string>): string[] {
  const slugs = [...serviceSlugs];
  return [...new Set([
    ...circuitPackageMaterialRoleKeysForServices(slugs),
    ...(slugs.some((slug) => SURFACE_ROUTE_SERVICES.has(slug)) ? PREPARED_SURFACE_SYSTEM_ROLES : []),
  ])];
}
