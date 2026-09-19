import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./atomicLabor";
import {
  analyzeContractorSpeed,
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
  ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS,
  type CalibrationAnswer,
} from "./laborCalibrationWizard";

export type LaborOperationProposal = {
  operationKey: string;
  operationName: string;
  unit: "each" | "ft";
  hoursPerUnit: number;
  source: "DIRECT" | "APPROVED_PROPOSAL";
  basis: {
    method: "DIRECT_ENTRY" | "APPROVED_RELATIONSHIP_PROPOSAL";
    scenarioKeys: string[];
    note: string;
  };
  requiresExplicitApproval: true;
  canPublish: false;
};

export type LaborProposalSet = {
  proposals: LaborOperationProposal[];
  unresolvedScenarioKeys: string[];
  operationsStillUncalibrated: string[];
  canPublish: false;
};

export type BookDeltaRelationship = {
  anchorScenarioKey: string;
  anchorOperationKey: string;
  targetOperationKey: string;
  anchorBookHours: number;
  targetBookHours: number;
  observationIds: string[];
  scope: string;
};

/**
 * Same-family published relationships whose physical scopes are close enough
 * to preserve a delta from the contractor's direct anchor. These are review
 * proposals only. Cross-family relationships do not belong here.
 */
export const ELECTRICAL_BOOK_DELTA_RELATIONSHIPS: BookDeltaRelationship[] = [
  {
    anchorScenarioKey: "replace-standard-receptacle", anchorOperationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
    targetOperationKey: "ELEC_REPLACE_STANDARD_SWITCH", anchorBookHours: 0.30, targetBookHours: 0.30,
    observationIds: ["O001", "O002"], scope: "Same-source like-for-like device replacements in an existing usable box.",
  },
  {
    anchorScenarioKey: "replace-standard-receptacle", anchorOperationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
    targetOperationKey: "ELEC_REPLACE_GFCI_RECEPTACLE", anchorBookHours: 0.30, targetBookHours: 0.40,
    observationIds: ["O001", "O003"], scope: "Same-source existing-box replacement; GFCI reset/test adds the published difference.",
  },
  {
    anchorScenarioKey: "replace-standard-receptacle", anchorOperationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
    targetOperationKey: "ELEC_REPLACE_THREE_WAY_SWITCH", anchorBookHours: 0.375, targetBookHours: 0.375,
    observationIds: ["O025", "O034"], scope: "Matched published 15–30 minute replacement ranges; tracing or repairing conductors excluded.",
  },
  {
    anchorScenarioKey: "replace-standard-receptacle", anchorOperationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
    targetOperationKey: "ELEC_REPLACE_LED_DIMMER", anchorBookHours: 0.375, targetBookHours: 0.415,
    observationIds: ["O025", "O029"], scope: "Compatible existing-box replacement; target uses the midpoint of the published 0.33–0.50 hour dimmer range.",
  },
  {
    anchorScenarioKey: "replace-standard-receptacle", anchorOperationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
    targetOperationKey: "ELEC_REPLACE_USB_RECEPTACLE", anchorBookHours: 0.375, targetBookHours: 0.375,
    observationIds: ["O025", "O031"], scope: "Matched published 15–30 minute existing-box replacement ranges; box enlargement excluded.",
  },
];

/**
 * Produces review rows, never decisions. A one-operation scenario supports a
 * direct row. Multi-operation totals remain intact and are never divided.
 * When at least four comparable answers show a consistent speed pattern, a
 * published atomic reference may be scaled into an explicitly reviewable
 * proposal; it is never accepted automatically.
 */
export function buildElectricalOperationProposals(
  answers: CalibrationAnswer[],
  establishedOperationKeys: Set<string> = new Set(),
): LaborProposalSet {
  const answerByScenario = new Map(answers.map((answer) => [answer.scenarioKey, answer]));
  const operationByKey = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation]));
  const proposals = new Map<string, LaborOperationProposal>();
  const unresolvedScenarioKeys: string[] = [];

  for (const scenario of [...ELECTRICAL_CORE_CALIBRATION_SCENARIOS, ...ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS]) {
    const answer = answerByScenario.get(scenario.key);
    if (!answer) continue;
    if (scenario.operationKeys.length !== 1) {
      unresolvedScenarioKeys.push(scenario.key);
      continue;
    }
    const operation = operationByKey.get(scenario.operationKeys[0]);
    if (!operation || establishedOperationKeys.has(operation.key)) continue;
    proposals.set(operation.key, {
      operationKey: operation.key,
      operationName: operation.name,
      unit: operation.unit,
      hoursPerUnit: answer.contractorHours,
      source: "DIRECT",
      basis: {
        method: "DIRECT_ENTRY",
        scenarioKeys: [scenario.key],
        note: "The bounded scenario contains exactly this one operation.",
      },
      requiresExplicitApproval: true,
      canPublish: false,
    });
  }

  for (const relationship of ELECTRICAL_BOOK_DELTA_RELATIONSHIPS) {
    const answer = answerByScenario.get(relationship.anchorScenarioKey);
    const operation = operationByKey.get(relationship.targetOperationKey);
    if (!answer || !operation || establishedOperationKeys.has(operation.key) || proposals.has(operation.key)) continue;
    const hoursPerUnit = Math.max(0, answer.contractorHours + relationship.targetBookHours - relationship.anchorBookHours);
    proposals.set(operation.key, {
      operationKey: operation.key,
      operationName: operation.name,
      unit: operation.unit,
      hoursPerUnit,
      source: "APPROVED_PROPOSAL",
      basis: {
        method: "APPROVED_RELATIONSHIP_PROPOSAL",
        scenarioKeys: [relationship.anchorScenarioKey],
        note: `Preserves the published same-family delta (${relationship.observationIds.join("/")}). ${relationship.scope}`,
      },
      requiresExplicitApproval: true,
      canPublish: false,
    });
  }

  const speed = analyzeContractorSpeed(answers);
  if (speed.kind === "CONSISTENT" && speed.factor !== null) {
    const scenarioKeys = speed.factors.map((factor) => factor.scenarioKey).sort();
    for (const operation of ELECTRICAL_ATOMIC_LABOR_OPERATIONS) {
      if (operation.referenceLaborHours === null || operation.referenceStatus === "DISPUTED") continue;
      if (establishedOperationKeys.has(operation.key) || proposals.has(operation.key)) continue;
      proposals.set(operation.key, {
        operationKey: operation.key,
        operationName: operation.name,
        unit: operation.unit,
        hoursPerUnit: operation.referenceLaborHours * speed.factor,
        source: "APPROVED_PROPOSAL",
        basis: {
          method: "APPROVED_RELATIONSHIP_PROPOSAL",
          scenarioKeys,
          note: `Published atomic reference × contractor's supporting ${speed.factor.toFixed(3)} speed factor; explicit approval required.`,
        },
        requiresExplicitApproval: true,
        canPublish: false,
      });
    }
  }

  const calibratedOrProposed = new Set([...establishedOperationKeys, ...proposals.keys()]);
  return {
    proposals: [...proposals.values()].sort((a, b) => a.operationName.localeCompare(b.operationName)),
    unresolvedScenarioKeys: unresolvedScenarioKeys.sort(),
    operationsStillUncalibrated: ELECTRICAL_ATOMIC_LABOR_OPERATIONS
      .map((operation) => operation.key)
      .filter((key) => !calibratedOrProposed.has(key))
      .sort(),
    canPublish: false,
  };
}
