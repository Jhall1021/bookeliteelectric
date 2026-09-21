import type { LaborEvaluation } from "../laborOperations";
import { evaluateRecessedLightingAtomicLabor } from "./lightingRouteAtomicLaborBridge";
import {
  resolveRecessedLightingRouteFacts,
  type RecessedLightingRouteFactInput,
} from "./lightingRouteFacts";
import type { MaterialTakeoff, ProductSelection } from "./materialTakeoff";
import { computeRecessedLightingMaterialTakeoff } from "./recessedLightingMaterialTakeoff";

export type RecessedLightingTakeoff =
  | { kind: "INCOMPLETE_FACTS"; missingFacts: string[]; invalidFacts: string[] }
  | { kind: "EVALUATED"; labor: LaborEvaluation; materials: MaterialTakeoff };

/**
 * One resolved physical layout feeds both labor and materials. No caller may
 * price labor from one cable length while buying material from another.
 */
export function evaluateRecessedLightingTakeoff(args: {
  facts: RecessedLightingRouteFactInput;
  contractorHours: Record<string, number | null | undefined>;
  selections: ProductSelection[];
}): RecessedLightingTakeoff {
  const resolved = resolveRecessedLightingRouteFacts(args.facts);
  if (resolved.kind === "INCOMPLETE") {
    return {
      kind: "INCOMPLETE_FACTS",
      missingFacts: resolved.missingFacts,
      invalidFacts: resolved.invalidFacts,
    };
  }

  const facts = resolved.facts;
  return {
    kind: "EVALUATED",
    labor: evaluateRecessedLightingAtomicLabor({
      access: facts.access,
      lightCount: facts.lightCount,
      interLightCableFeet: facts.installedCablePathFeet,
      nmCableSupportCount: facts.nmCableSupportCount,
      perpendicularCeilingFeet: facts.perpendicularCeilingFeet,
      framingSpacingInches: facts.framingSpacingInches,
      existingLightingSourceConfirmed: facts.existingLightingSourceConfirmed,
      contractorHours: args.contractorHours,
    }),
    materials: computeRecessedLightingMaterialTakeoff({
      lightCount: facts.lightCount,
      installedCablePathFeet: facts.installedCablePathFeet,
      totalCableSlackFeet: facts.totalCableSlackFeet,
      nmCableSupportCount: facts.nmCableSupportCount,
      selections: args.selections,
    }),
  };
}
