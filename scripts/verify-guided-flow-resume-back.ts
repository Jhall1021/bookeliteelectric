import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AnswerOptionDTO, QuestionDTO } from "../lib/flow-types";
import { storedGuidedFlowReplay } from "../lib/guidedFlowStoredAnswer";

const option = (
  value: string,
  routeAction: AnswerOptionDTO["routeAction"],
  nextQuestionId: string | null,
) => ({ value, routeAction, nextQuestionId } as AnswerOptionDTO);
const question = (id: string, key: string, options: AnswerOptionDTO[]) => ({
  id,
  key,
  inputType: "SINGLE_SELECT",
  options,
} as QuestionDTO);

const questions = [
  question("q1", "first", [option("a", "CONTINUE", "q2")]),
  question("q2", "second", [option("b", "CONTINUE", "q3")]),
  question("q3", "third", [option("c", "RESOLVE_ADJUSTED", null)]),
];

const partial = storedGuidedFlowReplay(
  questions,
  "q1",
  { first: "a", first_doorway: "yes", second: "b", second_doorway: "no", unrelated: "keep" },
  (q) => [`${q.key}_doorway`],
);
assert.deepEqual(partial.path.map((q) => q.key), ["first", "second"]);
assert.deepEqual(partial.baseAnswers, { unrelated: "keep" });

const terminal = storedGuidedFlowReplay(
  questions,
  "q1",
  { first: "a", second: "b", third: "c" },
);
assert.deepEqual(terminal.path.map((q) => q.key), ["first", "second", "third"]);
assert.deepEqual(terminal.baseAnswers, {});

const stale = storedGuidedFlowReplay(questions, "q1", { first: "not-an-option", second: "b" });
assert.deepEqual(stale.path, []);
assert.deepEqual(stale.baseAnswers, { first: "not-an-option", second: "b" });

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
assert.match(engine, /replayHistory\.push\([\s\S]*state: \{ kind: "question", question \}/);
assert.match(engine, /setHistory\(\(h\) => \[\.\.\.h, \{ state, config, answers: replay\.baseAnswers \}\]\)/);

console.log("guided-flow resume/back: replayed saved questions become real Back destinations");
