import type { Prisma, PrismaClient } from "@prisma/client";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./electrical/atomicLabor";
import {
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
  ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS,
} from "./electrical/laborCalibrationWizard";

export type LaborTradeRegistry = {
  scenarioKeys: Set<string>;
  operationKeys: Set<string>;
};

const ELECTRICAL_REGISTRY: LaborTradeRegistry = {
  scenarioKeys: new Set(
    [...ELECTRICAL_CORE_CALIBRATION_SCENARIOS, ...ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS]
      .map((scenario) => scenario.key),
  ),
  operationKeys: new Set(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => operation.key)),
};

export const LABOR_TRADE_REGISTRIES: Record<string, LaborTradeRegistry> = {
  electrical: ELECTRICAL_REGISTRY,
};

export type ScenarioAnswerInput = { scenarioKey: string; scenarioHours: number; scopeVersion?: number };
export type OperationDecisionBasis = {
  method: "DIRECT_ENTRY" | "APPROVED_RELATIONSHIP_PROPOSAL";
  scenarioKeys: string[];
  note?: string;
};
export type OperationDecisionInput = {
  operationKey: string;
  hoursPerUnit: number;
  source: "DIRECT" | "APPROVED_PROPOSAL";
  basis: OperationDecisionBasis;
};

function registryFor(trade: string): LaborTradeRegistry {
  const registry = LABOR_TRADE_REGISTRIES[trade];
  if (!registry) throw new Error(`Unsupported labor trade: ${trade}`);
  return registry;
}

export function validateScenarioAnswers(trade: string, inputs: ScenarioAnswerInput[]): ScenarioAnswerInput[] {
  const registry = registryFor(trade);
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("At least one scenario answer is required.");
  const seen = new Set<string>();
  return inputs.map((input) => {
    if (!registry.scenarioKeys.has(input.scenarioKey)) throw new Error(`Unknown ${trade} labor scenario: ${input.scenarioKey}`);
    if (seen.has(input.scenarioKey)) throw new Error(`Duplicate labor scenario: ${input.scenarioKey}`);
    if (!Number.isFinite(input.scenarioHours) || input.scenarioHours <= 0) throw new Error(`scenarioHours must be greater than zero for ${input.scenarioKey}`);
    const scopeVersion = input.scopeVersion ?? 1;
    if (!Number.isInteger(scopeVersion) || scopeVersion < 1) throw new Error(`scopeVersion must be a positive integer for ${input.scenarioKey}`);
    seen.add(input.scenarioKey);
    return { scenarioKey: input.scenarioKey, scenarioHours: input.scenarioHours, scopeVersion };
  });
}

export function validateOperationDecisions(
  trade: string,
  inputs: OperationDecisionInput[],
  answeredScenarioKeys?: Set<string>,
): OperationDecisionInput[] {
  const registry = registryFor(trade);
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("At least one operation decision is required.");
  const seen = new Set<string>();
  return inputs.map((input) => {
    if (!registry.operationKeys.has(input.operationKey)) throw new Error(`Unknown ${trade} labor operation: ${input.operationKey}`);
    if (seen.has(input.operationKey)) throw new Error(`Duplicate labor operation: ${input.operationKey}`);
    if (!Number.isFinite(input.hoursPerUnit) || input.hoursPerUnit < 0) throw new Error(`hoursPerUnit must be nonnegative for ${input.operationKey}`);
    if (input.source !== "DIRECT" && input.source !== "APPROVED_PROPOSAL") throw new Error(`Invalid decision source for ${input.operationKey}`);
    if (!input.basis || typeof input.basis !== "object" || Array.isArray(input.basis)) throw new Error(`basis is required for ${input.operationKey}`);
    if (!Array.isArray(input.basis.scenarioKeys) || input.basis.scenarioKeys.some((key) => typeof key !== "string" || !registry.scenarioKeys.has(key))) {
      throw new Error(`basis contains an unknown scenario for ${input.operationKey}`);
    }
    if (input.source === "DIRECT" && input.basis.method !== "DIRECT_ENTRY") {
      throw new Error(`DIRECT labor requires DIRECT_ENTRY basis for ${input.operationKey}`);
    }
    if (input.source === "APPROVED_PROPOSAL") {
      if (input.basis.method !== "APPROVED_RELATIONSHIP_PROPOSAL") throw new Error(`Approved proposal basis is required for ${input.operationKey}`);
      if (input.basis.scenarioKeys.length === 0) throw new Error(`Approved proposal must cite at least one scenario for ${input.operationKey}`);
      if (answeredScenarioKeys && input.basis.scenarioKeys.some((key) => !answeredScenarioKeys.has(key))) {
        throw new Error(`Approved proposal cites an unanswered scenario for ${input.operationKey}`);
      }
    }
    seen.add(input.operationKey);
    return input;
  });
}

type LaborDb = Pick<PrismaClient, "contractorLaborScenarioAnswer" | "contractorLaborOperationDecision"> | Prisma.TransactionClient;

/** Stores scenario evidence only. It does not infer or approve atomic labor. */
export async function saveLaborScenarioAnswers(
  db: LaborDb,
  contractorId: string,
  trade: string,
  inputs: ScenarioAnswerInput[],
) {
  const answers = validateScenarioAnswers(trade, inputs);
  return Promise.all(answers.map((answer) => db.contractorLaborScenarioAnswer.upsert({
    where: { contractorId_trade_scenarioKey: { contractorId, trade, scenarioKey: answer.scenarioKey } },
    update: { scenarioHours: answer.scenarioHours, scopeVersion: answer.scopeVersion },
    create: { contractorId, trade, scenarioKey: answer.scenarioKey, scenarioHours: answer.scenarioHours, scopeVersion: answer.scopeVersion },
    select: { scenarioKey: true, scenarioHours: true, scopeVersion: true, answeredAt: true, updatedAt: true },
  })));
}

/** Writes only values the contractor explicitly approved. Never service labor or price. */
export async function saveLaborOperationDecisions(
  db: LaborDb,
  contractorId: string,
  trade: string,
  inputs: OperationDecisionInput[],
) {
  const citedScenarioKeys = [...new Set(inputs.flatMap((input) => input.basis?.scenarioKeys ?? []))];
  const answered = citedScenarioKeys.length
    ? await db.contractorLaborScenarioAnswer.findMany({
        where: { contractorId, trade, scenarioKey: { in: citedScenarioKeys } },
        select: { scenarioKey: true },
      })
    : [];
  const decisions = validateOperationDecisions(trade, inputs, new Set(answered.map((row) => row.scenarioKey)));
  return Promise.all(decisions.map((decision) => db.contractorLaborOperationDecision.upsert({
    where: { contractorId_trade_operationKey: { contractorId, trade, operationKey: decision.operationKey } },
    update: { hoursPerUnit: decision.hoursPerUnit, source: decision.source, basis: decision.basis as Prisma.InputJsonObject, approvedAt: new Date() },
    create: { contractorId, trade, operationKey: decision.operationKey, hoursPerUnit: decision.hoursPerUnit, source: decision.source, basis: decision.basis as Prisma.InputJsonObject },
    select: { operationKey: true, hoursPerUnit: true, source: true, basis: true, approvedAt: true, updatedAt: true },
  })));
}
