import { circuitPackageMaterialRoleKeysForServices } from "./circuitPackageMaterialRoles";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";

const SURFACE_ROUTE_SERVICES = new Set([
  "new-120v-outlet",
  "bidet-smart-toilet-outlet",
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
]);

const NEW_OUTLET_RUNTIME_ROLES = [
  "WIRE_14_2",
  "WIRE_12_2",
  "NM_CABLE_SUPPORT",
  "BOX_OLD_WORK",
  "WALL_PLATE",
  "CONSUMABLES_SMALL",
  "RECEPTACLE_STANDARD",
];

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

const PREPARED_SURFACE_FIXTURE_SYSTEM_ROLES = PREPARED_SURFACE_SYSTEM_ROLES
  .filter((role) => role !== SURFACE_ROLES.deviceBox);

/**
 * New-ceiling-fan material quantities are resolved from the measured route,
 * not stored as one fixed ServiceMaterial recipe.  A fresh contractor still
 * needs every role that runtime can select, even if the rest of the catalog
 * did not happen to reference the same wire, support or raceway parts.
 */
const NEW_CEILING_FAN_RUNTIME_ROLES = [
  "WIRE_14_2",
  "WIRE_12_2",
  "NM_CABLE_SUPPORT",
  "BOX_FAN_RATED",
  "CONSUMABLES_SMALL",
  ...PREPARED_SURFACE_FIXTURE_SYSTEM_ROLES,
];

/** Roles selected at runtime rather than attached to a static recipe row. */
export function electricalRuntimeMaterialRoleKeysForServices(serviceSlugs: Iterable<string>): string[] {
  const slugs = [...serviceSlugs];
  return [...new Set([
    ...circuitPackageMaterialRoleKeysForServices(slugs),
    ...(slugs.some((slug) => SURFACE_ROUTE_SERVICES.has(slug)) ? PREPARED_SURFACE_SYSTEM_ROLES : []),
    ...(slugs.some((slug) => slug === "new-120v-outlet" || slug === "bidet-smart-toilet-outlet")
      ? NEW_OUTLET_RUNTIME_ROLES
      : []),
    ...(slugs.some((slug) => slug === "new-120v-outlet" || slug === "bidet-smart-toilet-outlet")
      ? ["GFCI_INTERIOR"]
      : []),
    ...(slugs.includes("new-ceiling-fan") ? NEW_CEILING_FAN_RUNTIME_ROLES : []),
  ])];
}
