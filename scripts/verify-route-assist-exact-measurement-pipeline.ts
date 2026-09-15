import type { AnswerOptionDTO, QuestionDTO } from "../lib/flow-types";
import { adaptRouteAssistResult } from "../lib/electrical/routeAssistAdapter";
import { selectNumericOption } from "../lib/numericRouteRanges";
import { getRouteAssistInvocation } from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

function option(id: string, value: string): AnswerOptionDTO {
  return {
    id,
    label: value,
    value,
    numberAtLeast: null,
    numberAtMost: null,
  } as unknown as AnswerOptionDTO;
}

const surfaceFeetQuestion = {
  id: "q-surface-route-feet",
  key: "surface_route_feet",
  inputType: "NUMBER",
  numberMin: 0,
  numberMax: 300,
  options: [option("surface-route-number", "__number__")],
} as unknown as QuestionDTO;

console.log("\nROUTE ASSIST EXACT MEASUREMENT PIPELINE\n");

const built = buildRouteAssistResult({
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  points: [
    { id: "a", x: 0.1, y: 0.5, imageId: "img-1", kind: "SOURCE" },
    { id: "turn", x: 0.5, y: 0.5, imageId: "img-1", kind: "WAYPOINT", physicalTurn: "FLAT" },
    { id: "b", x: 0.9, y: 0.25, imageId: "img-1", kind: "DESTINATION" },
  ],
  segments: [
    { id: "s1", fromPointId: "a", toPointId: "turn", surface: "WALL", estimatedLengthFt: 5.125 },
    { id: "s2", fromPointId: "turn", toPointId: "b", surface: "WALL", estimatedLengthFt: 9.5 },
  ],
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["img-1"], overlayImageIds: [] },
});

check("route graph builds successfully", !("reason" in built), JSON.stringify(built));
if ("reason" in built) {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

check(
  "RouteAssistResult preserves exact accepted 14.625 ft",
  built.estimatedTotalRouteLengthFt === 14.625,
  String(built.estimatedTotalRouteLengthFt),
);

const confirmed = applyConfirmation(built, "ACCEPTED");
check("route is customer-confirmed before reuse", confirmed.customerConfirmedRoute === true);
check("confirmation does not change measured footage", confirmed.estimatedTotalRouteLengthFt === 14.625);

const adapted = adaptRouteAssistResult(confirmed);
check("electrical adapter accepts the result", adapted.invalid.length === 0, JSON.stringify(adapted.invalid));
check("electrical adapter preserves 14.625", adapted.mapped.routeLengthFt === 14.625, JSON.stringify(adapted.mapped));
check("explicit full physical-turn evidence produces one flat corner", adapted.mapped.flatCorners === 1, JSON.stringify(adapted.mapped));

const invocation = getRouteAssistInvocation("new-120v-outlet", "surface_route_feet");
check("Routing V2 surface footage invocation exists", invocation !== null);
const answerValue = invocation?.resolveAnswerValue(confirmed) ?? null;
check("invocation emits exact decimal string", answerValue === "14.625", String(answerValue));

const selected = answerValue === null ? null : selectNumericOption(surfaceFeetQuestion, answerValue);
check("canonical NUMBER selector accepts exact decimal measurement", selected?.kind === "option", JSON.stringify(selected));
if (selected?.kind === "option") {
  const resolved = { ...selected.option, value: answerValue! };
  check("Guided Flow answer value remains exactly 14.625", resolved.value === "14.625", resolved.value);
  check("authored NUMBER sentinel never replaces the measurement", resolved.value !== "__number__", resolved.value);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
