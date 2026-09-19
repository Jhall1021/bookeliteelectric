import type { MaterialTakeoff } from "./materialTakeoff";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";
import { evaluateLaborRecipe, type LaborEvaluation, type QuantityFacts } from "../laborOperations";

type SelectedComponent = { key: string; quantity: number };

export type SurfaceRouteLaborBridgeResult =
  | { kind: "TAKEOFF_INCOMPLETE"; detail: string[] }
  | { kind: "LABOR_INCOMPLETE"; evaluation: Extract<LaborEvaluation, { kind: "INCOMPLETE" }>; facts: QuantityFacts }
  | { kind: "READY"; hours: number; quantities: Record<string, number>; facts: QuantityFacts };

const quantityForComponent = (components: SelectedComponent[], key: string): number =>
  components.filter((component) => component.key === key).reduce((sum, component) => sum + component.quantity, 0);

const quantityForRole = (takeoff: MaterialTakeoff, role: string): number =>
  takeoff.physicalRequirements.filter((requirement) => requirement.role === role)
    .reduce((sum, requirement) => sum + requirement.quantity, 0);

/**
 * Translate established Routing V2/takeoff facts into the surface-route labor
 * recipe. This performs arithmetic only. It never guesses a product rule or a
 * contractor labor value, and it cannot authorize a price.
 */
export function evaluateSurfaceRouteAtomicLabor(args: {
  components: SelectedComponent[];
  takeoff: MaterialTakeoff;
  contractorHours: Record<string, number | null | undefined>;
}): SurfaceRouteLaborBridgeResult {
  if (!args.takeoff.purchaseComplete) {
    return {
      kind: "TAKEOFF_INCOMPLETE",
      detail: [...new Set(args.takeoff.unresolvedRequirements.map((requirement) =>
        requirement.role ? `${requirement.code}:${requirement.role}` : requirement.code))].sort(),
    };
  }

  const conductorRoles = new Set(
    args.takeoff.classStatuses.find((status) => status.classKey === "CONDUCTOR")?.roles ?? [],
  );
  const conductorFeet = args.takeoff.physicalRequirements
    .filter((requirement) => conductorRoles.has(requirement.role))
    .reduce((sum, requirement) => sum + requirement.quantity, 0);

  const facts: QuantityFacts = {
    surfaceRouteFeet: quantityForComponent(args.components, "SURFACE_ROUTE_FT"),
    conductorFeet,
    straightJointCount: quantityForRole(args.takeoff, SURFACE_ROLES.joint),
    supportCount: quantityForRole(args.takeoff, SURFACE_ROLES.supportClip),
    insideCornerCount: quantityForComponent(args.components, "SURFACE_ROUTE_INSIDE_CORNER"),
    outsideCornerCount: quantityForComponent(args.components, "SURFACE_ROUTE_OUTSIDE_CORNER"),
    flatCornerCount: quantityForComponent(args.components, "SURFACE_ROUTE_FLAT_CORNER"),
    blankEndCount: quantityForRole(args.takeoff, SURFACE_ROLES.end),
    transitionCount: quantityForRole(args.takeoff, SURFACE_ROLES.transition),
    surfaceDeviceBoxCount: quantityForComponent(args.components, "SURFACE_DEVICE_BOX_OUTLET"),
  };

  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE");
  if (!recipe) throw new Error("ELECTRICAL_SURFACE_RACEWAY_ROUTE is missing from the canonical labor library");
  const evaluation = evaluateLaborRecipe(recipe, facts, args.contractorHours);
  return evaluation.kind === "READY"
    ? { kind: "READY", hours: evaluation.hours, quantities: evaluation.quantities, facts }
    : { kind: "LABOR_INCOMPLETE", evaluation, facts };
}
