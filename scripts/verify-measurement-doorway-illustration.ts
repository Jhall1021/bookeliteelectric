import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const questionStep = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");

assert.ok(
  guide.includes("function Doorway()") && guide.includes('data-measurement-doorway="true"'),
  "the shared measurement illustration owns a reusable doorway drawing",
);
assert.ok(
  guide.includes("const doorwayActive = showDoorway && doorwayChecked") &&
    guide.includes("const doorway = doorwayActive ? <Doorway /> : null"),
  "the doorway appears only when the supported measurement checkbox is checked",
);
assert.ok(
  guide.includes("<Drawing>{doorway}<Route") &&
    guide.match(/doorwayActive[\s\S]{0,180}DOOR_ROUTE_Y/g)?.length === 6,
  "all six measurement scenarios switch to a route that clears the doorway",
);
assert.ok(
  questionStep.includes("doorwayChecked={doorwayChecked}") &&
    questionStep.includes("onDoorwayChange={collectsDoorway ? setDoorwayChecked : undefined}"),
  "checking and unchecking the doorway redraws the illustration immediately",
);

console.log("measurement doorway illustration: checked inserts the door and reroutes; unchecked restores the original drawing");
