export type ConductorWiringMethod =
  | "CABLE_ASSEMBLY"
  | "INDIVIDUAL_CONDUCTORS_IN_RACEWAY"
  | "UNRESOLVED";

export type ConductorFunction =
  | "UNGROUNDED"
  | "NEUTRAL"
  | "EQUIPMENT_GROUND"
  | "OTHER";

export type ConductorMaterial = "COPPER" | "ALUMINUM" | "UNRESOLVED";
export type ConductorEnvironmentRequirement = "DRY" | "WET" | "UNRESOLVED";
export type ConductorPresence = "REQUIRED" | "NOT_REQUIRED" | "UNRESOLVED";

/**
 * Physical conductor requirement only. No footage is duplicated here: route
 * quantity lives once on RouteFact and is referenced by routeRef.
 *
 * Wiring method is explicit physical scope and must never be inferred from a
 * material recipe. NOT_REQUIRED remains a traceable state rather than deleting
 * the requirement identity.
 */
export type ConductorRequirement = {
  requirementId: string;
  routeRef: string | null;
  wiringMethod: ConductorWiringMethod;
  function: ConductorFunction;
  count: number | null;
  gaugeAwg: number | null;
  conductorMaterial: ConductorMaterial;
  environmentRequirement: ConductorEnvironmentRequirement;
  presence: ConductorPresence;
};

/**
 * Structural shared-route invariant: conductor requirements may reference a
 * route quantity, but they never own or copy that route's length.
 */
export function validateConductorRouteRefs(
  requirements: readonly ConductorRequirement[],
  routeIds: ReadonlySet<string>
): string[] {
  const problems: string[] = [];
  const seenRequirementIds = new Set<string>();

  for (const requirement of requirements) {
    if (!requirement.requirementId || seenRequirementIds.has(requirement.requirementId)) {
      problems.push(`duplicate or empty requirementId: ${requirement.requirementId}`);
    }
    seenRequirementIds.add(requirement.requirementId);

    if (requirement.routeRef !== null && !routeIds.has(requirement.routeRef)) {
      problems.push(`requirement ${requirement.requirementId} references unknown route ${requirement.routeRef}`);
    }
    if (requirement.count !== null && (!Number.isInteger(requirement.count) || requirement.count < 0)) {
      problems.push(`requirement ${requirement.requirementId} count must be a non-negative integer or null`);
    }
    if (requirement.gaugeAwg !== null && (!Number.isInteger(requirement.gaugeAwg) || requirement.gaugeAwg < 0)) {
      problems.push(`requirement ${requirement.requirementId} gaugeAwg must be a non-negative integer or null`);
    }
  }

  return problems;
}
