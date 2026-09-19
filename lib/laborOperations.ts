/**
 * Trade-neutral vocabulary for decomposing a service into physical labor.
 *
 * This is deliberately separate from CanonicalComponent. A component is a
 * live pricing input today; an operation recipe is the auditable explanation
 * of the work that will eventually supply those inputs. Keeping them separate
 * lets us complete and calibrate the model without changing a published price.
 */

export type LaborUnit = "each" | "ft";

export type LaborEvidence = {
  observationId: string;
  scope: "DIRECT" | "PARTIAL" | "DECOMPOSITION_ONLY" | "CONTEXT_ONLY";
  note: string;
  materialSystem?: string;
  normalizedLaborHours?: number;
  normalizedUnit?: LaborUnit;
};

export type LaborOperation = {
  key: string;
  trade: string;
  name: string;
  unit: LaborUnit;
  includes: string;
  excludes: string;
  /** Null means the evidence does not support one portable numeric value. */
  referenceLaborHours: number | null;
  referenceStatus: "VERIFIED" | "PARTIAL" | "DISPUTED" | "NONE";
  evidence: LaborEvidence[];
};

export type QuantitySource =
  | { kind: "constant"; value: number }
  | { kind: "measurement"; fact: string; unit: LaborUnit }
  | { kind: "framing-crossings"; distanceFact: string; spacingFact: string }
  | { kind: "contractor-input"; fact: string; unit: LaborUnit };

export type LaborRecipeLine = {
  operationKey: string;
  quantity: QuantitySource;
  condition?: string;
  note?: string;
};

export type LaborRecipe = {
  key: string;
  trade: string;
  appliesTo: string[];
  lines: LaborRecipeLine[];
};

export type LaborCalibrationGroup = {
  key: string;
  trade: string;
  name: string;
  /** Familiar operation(s) suitable for asking the contractor directly. */
  anchorOperationKeys: string[];
  relatedOperationKeys: string[];
  method: "DIRECT_ANCHOR" | "RELATIONSHIP_PROPOSAL";
  guardrail: string;
};

export type QuantityFacts = Record<string, number | boolean | string | null | undefined>;

/** Number of framing members crossed when running perpendicular to them. */
export function framingCrossingCount(distanceFeet: number, spacingInches = 16): number {
  if (!Number.isFinite(distanceFeet) || distanceFeet < 0) throw new Error("distanceFeet must be nonnegative");
  if (!Number.isFinite(spacingInches) || spacingInches <= 0) throw new Error("spacingInches must be positive");
  return Math.ceil((distanceFeet * 12) / spacingInches);
}

export function resolveLaborQuantity(source: QuantitySource, facts: QuantityFacts): number | null {
  if (source.kind === "constant") return source.value;
  if (source.kind === "measurement" || source.kind === "contractor-input") {
    const value = facts[source.fact];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }
  const distance = facts[source.distanceFact];
  const spacing = facts[source.spacingFact];
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
  if (typeof spacing !== "number" || !Number.isFinite(spacing) || spacing <= 0) return null;
  return framingCrossingCount(distance, spacing);
}

export type LaborEvaluation =
  | { kind: "READY"; hours: number; quantities: Record<string, number> }
  | { kind: "INCOMPLETE"; missingOperations: string[]; missingQuantities: string[] };

/** Fail closed: every quantity and every contractor labor unit must exist. */
export function evaluateLaborRecipe(
  recipe: LaborRecipe,
  facts: QuantityFacts,
  contractorHours: Record<string, number | null | undefined>,
): LaborEvaluation {
  const quantities: Record<string, number> = {};
  const missingOperations = new Set<string>();
  const missingQuantities = new Set<string>();
  let hours = 0;

  for (const line of recipe.lines) {
    if (line.condition) {
      const condition = facts[line.condition];
      if (condition === null || condition === undefined) {
        missingQuantities.add(`condition:${line.condition}`);
        continue;
      }
      if (condition !== true) continue;
    }
    const quantity = resolveLaborQuantity(line.quantity, facts);
    if (quantity === null) {
      missingQuantities.add(line.operationKey);
      continue;
    }
    const unitHours = contractorHours[line.operationKey];
    if (unitHours === null || unitHours === undefined || !Number.isFinite(unitHours) || unitHours < 0) {
      missingOperations.add(line.operationKey);
      continue;
    }
    quantities[line.operationKey] = (quantities[line.operationKey] ?? 0) + quantity;
    hours += unitHours * quantity;
  }

  if (missingOperations.size || missingQuantities.size) {
    return {
      kind: "INCOMPLETE",
      missingOperations: [...missingOperations].sort(),
      missingQuantities: [...missingQuantities].sort(),
    };
  }
  return { kind: "READY", hours, quantities };
}
