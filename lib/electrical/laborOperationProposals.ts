import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./atomicLabor";
import {
  analyzeContractorSpeed,
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
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

  for (const scenario of ELECTRICAL_CORE_CALIBRATION_SCENARIOS) {
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

