import {
  ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY,
  type LaborScopeFactCollectionPath,
  type LaborScopeFactDefinition,
} from "./laborScopeFactRegistry";

export type SourcedLaborScopeFact = {
  value: boolean | number | null;
  source: LaborScopeFactCollectionPath;
};

export type LaborScopeFactValidation =
  | { kind: "READY"; facts: Record<string, boolean | number>; sources: Record<string, LaborScopeFactCollectionPath> }
  | { kind: "INCOMPLETE"; missingFacts: string[]; invalidFacts: string[] };

function validValue(definition: LaborScopeFactDefinition, value: boolean | number): boolean {
  if (definition.valueType === "BOOLEAN") return typeof value === "boolean";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (definition.valueType === "COUNT") return Number.isInteger(value) && value >= 0;
  if (definition.valueType === "FEET") return value >= 0;
  return Number.isInteger(value) && value > 0;
}

/**
 * One authority gate shared by every future producer of atomic labor facts.
 * A plausible value from the wrong source is still invalid.
 */
export function validateElectricalLaborScopeFacts(
  requiredFactKeys: Iterable<string>,
  supplied: Record<string, SourcedLaborScopeFact | undefined>,
): LaborScopeFactValidation {
  const missingFacts: string[] = [];
  const invalidFacts: string[] = [];
  const facts: Record<string, boolean | number> = {};
  const sources: Record<string, LaborScopeFactCollectionPath> = {};

  for (const key of [...new Set(requiredFactKeys)].sort()) {
    const definition = ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get(key);
    if (!definition) {
      invalidFacts.push(`${key}: no registered collection authority`);
      continue;
    }
    const candidate = supplied[key];
    if (!candidate || candidate.value === null) {
      missingFacts.push(key);
      continue;
    }
    if (!definition.collectionPaths.includes(candidate.source)) {
      invalidFacts.push(`${key}: ${candidate.source} is not an authorized source`);
      continue;
    }
    if (!validValue(definition, candidate.value)) {
      invalidFacts.push(`${key}: invalid ${definition.valueType.toLowerCase()} value`);
      continue;
    }
    facts[key] = candidate.value;
    sources[key] = candidate.source;
  }

  return missingFacts.length || invalidFacts.length
    ? { kind: "INCOMPLETE", missingFacts, invalidFacts }
    : { kind: "READY", facts, sources };
}
