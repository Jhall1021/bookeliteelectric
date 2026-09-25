/**
 * Material roles a route-priced circuit may select at runtime.
 *
 * These roles are not all attached to one static ServiceMaterial row: the
 * breaker, cable and receptacle depend on the customer's answers. Keeping the
 * complete inventory here lets both catalog installation and runtime pricing
 * use the same authority, so a prepared catalog cannot omit a role that its
 * own route calculator later requires.
 */
export const CIRCUIT_PACKAGE_MATERIAL_ROLE_KEYS_BY_SERVICE = {
  "dedicated-120v-circuit-outlet": [
    "BREAKER_SINGLE_POLE_15A",
    "BREAKER_SINGLE_POLE_20A",
    "RECEPTACLE_STANDARD",
    "GFCI_INTERIOR_20A",
    "WIRE_14_2",
    "WIRE_12_2",
    "BOX_OLD_WORK",
    "WALL_PLATE",
    "CONSUMABLES_MEDIUM",
    "NM_CABLE_SUPPORT",
  ],
  "electric-fireplace-circuit": [
    "BREAKER_SINGLE_POLE_15A",
    "BREAKER_SINGLE_POLE_20A",
    "RECEPTACLE_STANDARD",
    "WIRE_14_2",
    "WIRE_12_2",
    "BOX_OLD_WORK",
    "WALL_PLATE",
    "CONSUMABLES_MEDIUM",
    "NM_CABLE_SUPPORT",
  ],
  "new-240v-appliance-circuit": [
    "BREAKER_DOUBLE_POLE_30A",
    "BREAKER_DOUBLE_POLE_50A",
    "RECEPTACLE_14_30",
    "RECEPTACLE_14_50",
    "WIRE_10_3",
    "WIRE_6_3",
    "BOX_SURFACE_4S",
    "COVER_RAISED_4S",
    "CONSUMABLES_MEDIUM",
    "NM_CABLE_SUPPORT",
  ],
} as const;

export type CircuitPackageServiceSlug = keyof typeof CIRCUIT_PACKAGE_MATERIAL_ROLE_KEYS_BY_SERVICE;

export function circuitPackageMaterialRoleKeysForService(serviceSlug: string): readonly string[] {
  return serviceSlug in CIRCUIT_PACKAGE_MATERIAL_ROLE_KEYS_BY_SERVICE
    ? CIRCUIT_PACKAGE_MATERIAL_ROLE_KEYS_BY_SERVICE[serviceSlug as CircuitPackageServiceSlug]
    : [];
}

export function circuitPackageMaterialRoleKeysForServices(serviceSlugs: Iterable<string>): string[] {
  return [...new Set([...serviceSlugs].flatMap((slug) =>
    [...circuitPackageMaterialRoleKeysForService(slug)]))];
}
