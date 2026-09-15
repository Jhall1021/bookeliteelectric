import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST / GUIDED FLOW SOURCE CONTRACT\n");

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
const assist = readFileSync("components/route-assist/RouteAssistQuestionAssist.tsx", "utf8");

check(
  "Guided Flow imports the canonical stored-answer replay helper",
  engine.includes('optionForStoredGuidedFlowAnswer') &&
    engine.includes('from "@/lib/guidedFlowStoredAnswer"')
);
check(
  "advanceFrom replays prior answers through the canonical helper",
  /optionForStoredGuidedFlowAnswer\(question,\s*prior\)/.test(engine)
);
check(
  "advanceFrom no longer replays stored answers by literal option-value lookup",
  !/question\.options\.find\(\(o\)\s*=>\s*o\.value\s*===\s*prior\)/.test(engine)
);
check(
  "Guided Flow passes the current in-memory answer into Route Assist",
  /currentAnswer=\{answers\[state\.question\.key\]\}/.test(engine)
);
check(
  "Route Assist declares currentAnswer as an optional live value",
  /currentAnswer\?:\s*string/.test(assist)
);
check(
  "Route Assist NUMBER resolution uses the canonical numeric selector",
  /question\.inputType\s*===\s*"NUMBER"[\s\S]{0,180}selectNumericOption\(question,\s*value\)/.test(assist),
  "NUMBER measurements must be validated by the shared selector, not exact option-value matching"
);
check(
  "Route Assist preserves the exact measured NUMBER string after selection",
  /resolved\s*=\s*\{\s*\.\.\.choice\.option,\s*value\s*\}/.test(assist),
  "14.625 must remain 14.625 instead of becoming __number__ or a band option value"
);
check(
  "live answer outranks the asynchronously persisted session snapshot",
  /currentAnswer\s*!==\s*undefined[\s\S]{0,160}currentAnswer[\s\S]{0,160}persistedAnswers\[question\.key\]/.test(assist),
  "RouteAssistQuestionAssist must protect the current same-tab answer before consulting the server mirror"
);
check(
  "grouped reuse still resolves through the central precedence policy",
  /decideRouteAssistGroupedReuse\(answerToProtect,\s*scanValue\)/.test(assist)
);
check(
  "grouped auto-use is recorded per session/task/question",
  /autoUseMarker\(guidedFlowSessionId,\s*invocation\.taskKey,\s*question\.key\)/.test(assist) &&
    assist.includes("p2b:route-assist:auto-used:v1:"),
  "the marker identity must distinguish each canonical question while sharing one capture task"
);
check(
  "Back cannot immediately auto-reapply a scan that already answered this question",
  /alreadyAutoUsed\(marker\)\s*\|\|\s*autoAttemptedRef\.current\s*===\s*marker/.test(assist),
  "a previously auto-used grouped result must leave the restored question available for manual review/edit"
);
check(
  "successful grouped auto-resolution marks the question before forwarding the answer",
  /if\s*\(markAsAutoUsed\)[\s\S]{0,160}markAutoUsed\([\s\S]{0,180}onResolved\(resolved\)/.test(assist),
  "mark first so a synchronous/fast rerender cannot auto-consume the same scan twice"
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
