import { evaluateLaborRecipe, type LaborEvaluation, type LaborRecipe, type QuantityFacts } from "../laborOperations";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { indexedElectricalLaborFamilies } from "./laborCoverageFamilies";

export type ElectricalStandardScenario =
  | {
      kind: "STANDARD";
      serviceSlug: string;
      recipeKey: string;
      facts: QuantityFacts;
      source: string;
      quantities: Record<string, number>;
      canPublish: false;
    }
  | {
      kind: "NO_STANDARD";
      serviceSlug: string;
      recipeKey: string;
      reason: string;
      missingFacts: string[];
      invalidConditions: string[];
      canPublish: false;
    };

type BoundedFacts = { facts: QuantityFacts; source: string };

/**
 * Facts already fixed by a checked-in package definition. These are physical
 * scope quantities, not labor decisions or customer prices.
 */
export const ELECTRICAL_BOUNDED_STANDARD_FACTS: Record<string, BoundedFacts> = {
  ELECTRICAL_PANEL_REPLACEMENT: {
    facts: { singlePoleCircuitCount: 17, doublePoleCircuitCount: 3 },
    source: "seed-panel-replacement.ts: defined 17 single-pole and 3 double-pole branch reconnections",
  },
  ELECTRICAL_200A_SERVICE_UPGRADE: {
    facts: {
      serviceEntranceFeet: 20,
      groundingElectrodeCount: 2,
      singlePoleCircuitCount: 17,
      doublePoleCircuitCount: 3,
    },
    source: "seed-200a-service-upgrade.ts: defined 20 ft service entrance, 2 electrodes, 17 single-pole and 3 double-pole branches",
  },
  ELECTRICAL_GENERATOR_INLET_INTERLOCK: {
    facts: { feederRouteFeet: 10 },
    source: "seed-generator-inlet.ts: defined 10 ft feeder package",
  },
  ELECTRICAL_UNDERCABINET_LIGHTING: {
    facts: { lightingFeet: 12, continuousRunCount: 1, driverCount: 1 },
    source: "seed-under-cabinet-lighting.ts: defined 12 ft tape/channel package with one run and one driver",
  },
};

const ALL_OPERATION_HOURS = Object.fromEntries(
  ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 1]),
);

function missingFacts(recipe: LaborRecipe, evaluation: Extract<LaborEvaluation, { kind: "INCOMPLETE" }>, facts: QuantityFacts): string[] {
  const byOperation = new Map(recipe.lines.map((line) => [line.operationKey, line]));
  const result = new Set<string>();
  for (const missing of evaluation.missingQuantities) {
    if (missing.startsWith("condition:")) {
      result.add(missing.slice("condition:".length));
      continue;
    }
    const source = byOperation.get(missing)?.quantity;
    if (!source || source.kind === "constant") continue;
    if (source.kind === "framing-crossings") {
      result.add(source.distanceFact);
      result.add(source.spacingFact);
    } else {
      result.add(source.fact);
    }
  }
  // When a route-selection condition is itself unknown, the evaluator cannot
  // yet enter either branch to report that branch's measurement. The audit
  // still needs to name those facts so "choose accessible" is never mistaken
  // for the complete physical scope.
  for (const rule of recipe.conditionRules ?? []) {
    for (const fact of rule.facts) if (facts[fact] === null || facts[fact] === undefined) result.add(fact);
  }
  for (const line of recipe.lines) {
    if (line.condition && (facts[line.condition] === null || facts[line.condition] === undefined)) result.add(line.condition);
    if (line.condition && facts[line.condition] === false) continue;
    const source = line.quantity;
    if (source.kind === "measurement" || source.kind === "contractor-input") result.add(source.fact);
    if (source.kind === "framing-crossings") {
      result.add(source.distanceFact);
      result.add(source.spacingFact);
    }
  }
  return [...result].sort();
}

/**
 * Classifies every priceable service recipe. A standard exists only when its
 * complete physical quantity set is fixed by the recipe itself or by a named,
 * checked-in package definition. Unknown scope stays visible and fail-closed.
 */
export function buildElectricalStandardScenarios(
  recipes: LaborRecipe[] = ELECTRICAL_ATOMIC_LABOR_RECIPES,
  factsByService: Readonly<Record<string, QuantityFacts>> = {},
): ElectricalStandardScenario[] {
  const families = indexedElectricalLaborFamilies();
  const result: ElectricalStandardScenario[] = [];
  for (const recipe of recipes) {
    const services = recipe.appliesTo.filter((slug) => {
      const status = families.get(slug)?.status;
      return status === "ATOMIC_STARTED";
    });
    if (!services.length) continue;

    const bounded = ELECTRICAL_BOUNDED_STANDARD_FACTS[recipe.key];
    for (const serviceSlug of services) {
      const suppliedFacts = factsByService[serviceSlug] ?? {};
      const facts = { ...(bounded?.facts ?? {}), ...suppliedFacts };
      const evaluation = evaluateLaborRecipe(recipe, facts, ALL_OPERATION_HOURS);
      if (evaluation.kind === "READY") {
        const sources = [bounded?.source, Object.keys(suppliedFacts).length ? "validated contractor scope policy" : null].filter(Boolean);
        result.push({
          kind: "STANDARD", serviceSlug, recipeKey: recipe.key, facts,
          source: sources.join("; ") || "recipe contains only fixed physical quantities",
          quantities: evaluation.quantities, canPublish: false,
        });
        continue;
      }

      const missing = missingFacts(recipe, evaluation, facts);
      const reason = missing.length
        ? `No honest standard scope: requires ${missing.join(", ")}`
        : `No honest standard scope: route conditions are not valid (${evaluation.invalidConditions.join(", ")})`;
      result.push({
        kind: "NO_STANDARD", serviceSlug, recipeKey: recipe.key, reason,
        missingFacts: missing, invalidConditions: evaluation.invalidConditions, canPublish: false,
      });
    }
  }
  return result.sort((a, b) => a.serviceSlug.localeCompare(b.serviceSlug));
}
