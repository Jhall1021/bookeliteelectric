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
  "live answer outranks the asynchronously persisted session snapshot",
  /currentAnswer\s*!==\s*undefined[\s\S]{0,160}currentAnswer[\s\S]{0,160}persistedAnswers\[question\.key\]/.test(assist),
  "RouteAssistQuestionAssist must protect the current same-tab answer before consulting the server mirror"
);
check(
  "grouped reuse still resolves through the central precedence policy",
  /decideRouteAssistGroupedReuse\(answerToProtect,\s*scanValue\)/.test(assist)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
