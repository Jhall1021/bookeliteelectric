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

// A custom first screen can collect answers for later legacy questions as
// supplementals. When a normal answer then advances into those already-filled
// questions, a replay rooted at that later question is suitable for Back
// snapshots but deliberately lacks the earlier route facts. Pricing must use
// the connected replay rooted at the beginning of the flow.
const dedicatedQuestions = [
  question("route", "dedicated_route_access", [option("accessible", "CONTINUE", "equipment")]),
  question("equipment", "dedicated_equipment", [option("fridge_freezer", "CONTINUE", "distance")]),
  question("distance", "dedicated_distance", [option("40", "CONTINUE", "finish")]),
  question("finish", "dedicated_finish_ack", [option("accepted", "PHOTO_REVIEW", null)]),
];
const dedicatedAnswers = {
  dedicated_route_access: "accessible",
  dedicated_equipment: "fridge_freezer",
  dedicated_distance: "40",
  dedicated_finish_ack: "accepted",
  dedicated_stair_full_flights: "0",
  dedicated_stair_half_flights: "1",
  dedicated_stair_foundation_scope: "partial",
  dedicated_stair_foundation_feet: "18",
};
const dedicatedSupplementals = (q: QuestionDTO) => q.key === "dedicated_route_access"
  ? [
      "dedicated_distance",
      "dedicated_finish_ack",
      "dedicated_stair_full_flights",
      "dedicated_stair_half_flights",
      "dedicated_stair_foundation_scope",
      "dedicated_stair_foundation_feet",
    ]
  : [];
const laterReplay = storedGuidedFlowReplay(
  dedicatedQuestions,
  "distance",
  dedicatedAnswers,
  dedicatedSupplementals,
);
assert.equal(laterReplay.replayedAnswers.dedicated_equipment, undefined);
assert.equal(laterReplay.replayedAnswers.dedicated_stair_foundation_feet, undefined);
const connectedReplay = storedGuidedFlowReplay(
  dedicatedQuestions,
  "route",
  dedicatedAnswers,
  dedicatedSupplementals,
);
assert.deepEqual(connectedReplay.replayedAnswers, dedicatedAnswers);

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
assert.match(engine, /setAnswers\(hasCarried \? carried : \{\}\)/);
assert.doesNotMatch(engine, /setAnswers\([^\n]*resumedReplay\.replayedAnswers/);
assert.match(engine, /const evaluationAnswers = activeReplay\.replayedAnswers;[\s\S]*evaluate\(priorOption, config, evaluationAnswers\)/);

console.log("guided-flow entry/back: direct entry starts fresh; reroutes carry answers; auto-skips retain connected supplemental pricing answers");
