export type ReviewedSpaPackage = {
  circuitAmps: 50;
  conductorCount: 4;
  ungroundedConductorRole: "CONDUCTOR_THHN_6_UNGROUNDED";
  groundedConductorRole: "CONDUCTOR_THHN_6_GROUNDED";
  equipmentGroundRole: "CONDUCTOR_THHN_10_EQUIPMENT_GROUND";
};

export const REVIEWED_SPA_PACKAGE: ReviewedSpaPackage = {
  circuitAmps: 50,
  conductorCount: 4,
  ungroundedConductorRole: "CONDUCTOR_THHN_6_UNGROUNDED",
  groundedConductorRole: "CONDUCTOR_THHN_6_GROUNDED",
  equipmentGroundRole: "CONDUCTOR_THHN_10_EQUIPMENT_GROUND",
};

/** Customer answers establish only a candidate. The contractor must read the
 * equipment instructions and confirm the electrical configuration, panel,
 * disconnect, wiring method, measured route and bonding scope. */
export function reviewedSpaPackage(serviceSlug: string, answers: Record<string, string | undefined>): ReviewedSpaPackage | null {
  if (serviceSlug !== "hot-tub-spa-electrical") return null;
  if (answers.spa_placed !== "placed") return null;
  if (answers.spa_requirements !== "label_available") return null;
  if (answers.spa_panel_location !== "exterior_same_wall") return null;
  if (answers.spa_route !== "ordinary_exterior_wall") return null;
  if (answers.spa_distance !== "within_25") return null;
  return REVIEWED_SPA_PACKAGE;
}
