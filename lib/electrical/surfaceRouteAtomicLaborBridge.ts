import type { MaterialTakeoff } from "./materialTakeoff";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";
import { evaluateLaborRecipe, type LaborEvaluation, type QuantityFacts } from "../laborOperations";

type SelectedComponent = { key: string; quantity: number };

export type SurfaceRouteEndpoint = "OUTLET" | "SWITCH" | "FIXTURE_BOX";

export type SurfaceRouteLaborBridgeResult =
  | { kind: "TAKEOFF_INCOMPLETE"; detail: string[] }
  | { kind: "LABOR_INCOMPLETE"; evaluation: Extract<LaborEvaluation, { kind: "INCOMPLETE" }>; facts: QuantityFacts }
  | { kind: "READY"; hours: number; quantities: Record<string, number>; facts: QuantityFacts };

const RECIPE_BY_ENDPOINT = {
  OUTLET: "ELECTRICAL_SURFACE_OUTLET_SERVICE",
  SWITCH: "ELECTRICAL_SURFACE_SWITCH_SERVICE",
  FIXTURE_BOX: "ELECTRICAL_SURFACE_FIXTURE_BOX_SERVICE",
} as const;

export function surfaceRouteEndpoint(components: SelectedComponent[]): SurfaceRouteEndpoint | null {
  const keys = new Set(components.map((component) => component.key));
  if (keys.has("OUTLET_EXTENSION_CORE") && keys.has("SURFACE_DEVICE_BOX_OUTLET")) return "OUTLET";
  if (keys.has("SWITCH_ENDPOINT_CORE") && keys.has("SURFACE_DEVICE_BOX_SWITCH")) return "SWITCH";
  if (keys.has("FIXTURE_BOX_ENDPOINT") && keys.has("SURFACE_FIXTURE_BOX")) return "FIXTURE_BOX";
  return null;
}

export function surfaceRouteOperationKeys(endpoint: SurfaceRouteEndpoint): string[] {
  const recipeKey = RECIPE_BY_ENDPOINT[endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === recipeKey);
  if (!recipe) throw new Error(`${recipeKey} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

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
  endpoint?: SurfaceRouteEndpoint;
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
    surfaceDeviceBoxCount: quantityForComponent(args.components, "SURFACE_DEVICE_BOX_OUTLET")
      + quantityForComponent(args.components, "SURFACE_DEVICE_BOX_SWITCH"),
  };

  const endpoint = args.endpoint ?? surfaceRouteEndpoint(args.components);
  if (!endpoint) {
    return {
      kind: "LABOR_INCOMPLETE",
      evaluation: { kind: "INCOMPLETE", missingOperations: [], missingQuantities: ["surface-route-endpoint"], invalidConditions: [] },
      facts,
    };
  }
  const recipeKey = RECIPE_BY_ENDPOINT[endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === recipeKey);
  if (!recipe) throw new Error(`${recipeKey} is missing from the canonical labor library`);
  const evaluation = evaluateLaborRecipe(recipe, facts, args.contractorHours);
  return evaluation.kind === "READY"
    ? { kind: "READY", hours: evaluation.hours, quantities: evaluation.quantities, facts }
    : { kind: "LABOR_INCOMPLETE", evaluation, facts };
}
