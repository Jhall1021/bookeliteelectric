import type { AnswerOptionDTO, QuestionDTO } from "../lib/flow-types";
import { optionForStoredGuidedFlowAnswer } from "../lib/guidedFlowStoredAnswer";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

/**
 * These verifier fixtures intentionally model only the fields consumed by
 * optionForStoredGuidedFlowAnswer()/selectNumericOption(). Keeping the proof
 * coupled to every display/pricing field on AnswerOptionDTO made an unrelated
 * DTO addition capable of breaking the Next/Vercel build even though the
 * replay contract itself had not changed.
 */
function option(over: {
  id: string;
  value: string;
  numberAtLeast?: number | null;
  numberAtMost?: number | null;
}): AnswerOptionDTO {
  return {
    id: over.id,
    label: over.value,
    value: over.value,
    numberAtLeast: over.numberAtLeast ?? null,
    numberAtMost: over.numberAtMost ?? null,
  } as unknown as AnswerOptionDTO;
}

function question(over: {
  key: string;
  inputType: QuestionDTO["inputType"];
  numberMin?: number | null;
  numberMax?: number | null;
  options: AnswerOptionDTO[];
}): QuestionDTO {
  return {
    id: `q-${over.key}`,
    key: over.key,
    inputType: over.inputType,
    numberMin: over.numberMin ?? null,
    numberMax: over.numberMax ?? null,
    options: over.options,
  } as unknown as QuestionDTO;
}

console.log("\nGUIDED FLOW STORED ANSWER REPLAY\n");

const select = question({
  key: "wall_surface",
  inputType: "SINGLE_SELECT",
  options: [option({ id: "drywall", value: "drywall" }), option({ id: "masonry", value: "masonry" })],
});
check(
  "ordinary stored selection resolves by authored option value",
  optionForStoredGuidedFlowAnswer(select, "masonry")?.id === "masonry"
);
check("stale ordinary selection fails closed", optionForStoredGuidedFlowAnswer(select, "tile") === null);

const freeNumber = question({
  key: "surface_route_feet",
  inputType: "NUMBER",
  numberMin: 1,
  numberMax: 200,
  options: [option({ id: "route-number", value: "__number__" })],
});
const decimal = optionForStoredGuidedFlowAnswer(freeNumber, "14.625");
check("unranged NUMBER replay accepts the stored decimal", decimal?.id === "route-number");
check(
  "unranged NUMBER replay preserves the homeowner/Route Assist value",
  decimal?.value === "14.625",
  String(decimal?.value)
);

const ranged = question({
  key: "concealed_route_feet",
  inputType: "NUMBER",
  numberMin: 1,
  numberMax: 300,
  options: [
    option({ id: "within", value: "within", numberAtLeast: 1, numberAtMost: 20 }),
    option({ id: "beyond", value: "beyond", numberAtLeast: 21, numberAtMost: 300 }),
  ],
});
const stored31 = optionForStoredGuidedFlowAnswer(ranged, "31");
check("stored ranged NUMBER selects by numeric predicate, not option order", stored31?.id === "beyond");
check("stored ranged NUMBER keeps 31 as the answer value", stored31?.value === "31");
check(
  "decimal in integer-routing mode still fails closed instead of being rounded into a branch",
  optionForStoredGuidedFlowAnswer(ranged, "18.5") === null
);
check("missing stored answer is not replayed", optionForStoredGuidedFlowAnswer(ranged, undefined) === null);
check("blank stored answer is not replayed", optionForStoredGuidedFlowAnswer(ranged, "   ") === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
