import assert from "node:assert/strict";
import {
  saveLaborOperationDecisions,
  saveLaborScenarioAnswers,
  validateOperationDecisions,
  validateScenarioAnswers,
} from "../lib/laborCalibrationPersistence";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const refuses = (fn: () => unknown, pattern: RegExp, message: string) => {
  assert.throws(fn, pattern, message);
  checks += 1;
};

const answer = { scenarioKey: "replace-standard-receptacle", scenarioHours: 0.5 };
const normalized = validateScenarioAnswers("electrical", [answer]);
ok(normalized[0].scopeVersion === 1, "scenario answer receives the current scope version");
refuses(() => validateScenarioAnswers("electrical", [{ ...answer, scenarioHours: 0 }]), /greater than zero/, "zero scenario duration is refused");
refuses(() => validateScenarioAnswers("electrical", [answer, answer]), /Duplicate/, "duplicate scenario answer is refused");
refuses(() => validateScenarioAnswers("electrical", [{ scenarioKey: "made-up", scenarioHours: 1 }]), /Unknown/, "unknown scenario is refused");
refuses(() => validateScenarioAnswers("plumbing", [answer]), /Unsupported/, "unregistered trade is refused rather than borrowing Electrical");

const direct = {
  operationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE",
  hoursPerUnit: 0.5,
  source: "DIRECT" as const,
  basis: { method: "DIRECT_ENTRY" as const, scenarioKeys: ["replace-standard-receptacle"] },
};
ok(validateOperationDecisions("electrical", [direct])[0].hoursPerUnit === 0.5, "direct contractor entry is accepted");
ok(validateOperationDecisions("electrical", [{ ...direct, hoursPerUnit: 0 }])[0].hoursPerUnit === 0, "explicit zero labor remains a valid decision");
refuses(() => validateOperationDecisions("electrical", [{ ...direct, hoursPerUnit: -1 }]), /nonnegative/, "negative operation labor is refused");
refuses(() => validateOperationDecisions("electrical", [{ ...direct, operationKey: "ELEC_NOT_REAL" }]), /Unknown/, "unknown operation is refused");
refuses(() => validateOperationDecisions("electrical", [{ ...direct, source: "APPROVED_PROPOSAL", basis: { method: "DIRECT_ENTRY", scenarioKeys: [] } } as never]), /Approved proposal basis/, "proposal cannot masquerade as direct entry");
refuses(() => validateOperationDecisions("electrical", [{ ...direct, source: "APPROVED_PROPOSAL", basis: { method: "APPROVED_RELATIONSHIP_PROPOSAL", scenarioKeys: [] } }]), /cite at least one/, "proposal must cite scenario evidence");
refuses(() => validateOperationDecisions("electrical", [{ ...direct, source: "APPROVED_PROPOSAL", basis: { method: "APPROVED_RELATIONSHIP_PROPOSAL", scenarioKeys: ["replace-standard-receptacle"] } }], new Set()), /unanswered scenario/, "proposal cannot cite an unanswered scenario");

async function main() {
  const scenarioWrites: unknown[] = [];
  const decisionWrites: unknown[] = [];
  const mockDb = {
    contractorLaborScenarioAnswer: {
      upsert: async (args: unknown) => { scenarioWrites.push(args); return args; },
      findMany: async () => [{ scenarioKey: "replace-standard-receptacle" }],
    },
    contractorLaborOperationDecision: {
      upsert: async (args: unknown) => { decisionWrites.push(args); return args; },
    },
  };

  await saveLaborScenarioAnswers(mockDb as never, "contractor-a", "electrical", [answer]);
  ok(scenarioWrites.length === 1, "scenario evidence writes only one scenario-answer row");
  await saveLaborOperationDecisions(mockDb as never, "contractor-a", "electrical", [{
    ...direct,
    source: "APPROVED_PROPOSAL",
    basis: { method: "APPROVED_RELATIONSHIP_PROPOSAL", scenarioKeys: ["replace-standard-receptacle"] },
  }]);
  ok(decisionWrites.length === 1, "explicit approval writes only one operation-decision row");
  ok(!("service" in mockDb), "persistence boundary has no Service write capability");

  console.log(`LABOR CALIBRATION PERSISTENCE — ${checks}/${checks} checks passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
