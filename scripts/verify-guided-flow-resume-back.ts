import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AnswerOptionDTO, QuestionDTO } from "../lib/flow-types";
import { answersBeforeGuidedFlow, storedGuidedFlowReplay } from "../lib/guidedFlowStoredAnswer";

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
  // A valid question owned by this service but not on the active q1 -> q3
  // route. Its saved value represents an abandoned branch and must not leak
  // into the intro/reset snapshot.
  question("q4", "abandoned_branch", [option("old", "RESOLVE_ADJUSTED", null)]),
];

const partial = storedGuidedFlowReplay(
  questions,
  "q1",
  {
    first: "a",
    first_doorway: "yes",
    second: "b",
    second_doorway: "no",
    abandoned_branch: "old",
    abandoned_branch_doorway: "yes",
    unrelated: "keep",
  },
  (q) => [`${q.key}_doorway`],
);
assert.deepEqual(partial.path.map((q) => q.key), ["first", "second"]);
assert.deepEqual(partial.baseAnswers, { unrelated: "keep" });
assert.deepEqual(partial.replayedAnswers, {
  unrelated: "keep",
  first: "a",
  first_doorway: "yes",
  second: "b",
  second_doorway: "no",
});

const terminal = storedGuidedFlowReplay(
  questions,
  "q1",
  { first: "a", second: "b", third: "c" },
);
assert.deepEqual(terminal.path.map((q) => q.key), ["first", "second", "third"]);
assert.deepEqual(terminal.baseAnswers, {});

const stale = storedGuidedFlowReplay(questions, "q1", { first: "not-an-option", second: "b" });
assert.deepEqual(stale.path, []);
assert.deepEqual(stale.baseAnswers, {});
assert.deepEqual(stale.replayedAnswers, {});

assert.deepEqual(
  answersBeforeGuidedFlow(
    questions,
    { first: "a", abandoned_branch: "old", abandoned_branch_doorway: "yes", unrelated: "keep" },
    (q) => [`${q.key}_doorway`],
  ),
  { unrelated: "keep" },
);

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
assert.match(engine, /replayHistory\.push\([\s\S]*state: \{ kind: "question", question \}/);
assert.match(engine, /setHistory\(\(h\) => \[\.\.\.h, \{ state, config, answers: replay\.baseAnswers \}\]\)/);
assert.match(engine, /previous\.state\.kind === "intro"[\s\S]*answersBeforeGuidedFlow/);
assert.match(engine, /shouldStartFresh \? \{\} : resumedReplay\.replayedAnswers/);

console.log("guided-flow resume/back: Back and partial resume both discard disconnected branch answers");
