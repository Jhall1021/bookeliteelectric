import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { measurementCanCrossDoorway } from "../lib/electrical/doorwayRouting";

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
    questionStep.includes("onDoorwayChange={collectsDoorway ? setDoorwayChecked : undefined}") &&
    questionStep.includes("accessClass={primaryAccessClass}"),
  "checking and unchecking the doorway redraws the illustration immediately",
);
assert.equal(
  measurementCanCrossDoorway({
    questionKey: "tv_outlet_run_distance",
    prompt: "Nearest outlet distance",
    serviceSlug: "tv-installation",
    accessClass: "ACCESSIBLE",
  }),
  false,
  "accessible attic, basement, and crawl-space routes hide the doorway control",
);
assert.equal(
  measurementCanCrossDoorway({
    questionKey: "tv_outlet_run_distance",
    prompt: "Nearest outlet distance",
    serviceSlug: "tv-installation",
    accessClass: "FINISHED",
  }),
  true,
  "finished-wall routes retain the doorway control",
);
assert.ok(
  questionStep.includes('collectsDoorway ? (doorwayChecked ? "yes" : "no") : null'),
  "an accessible-route answer clears any doorway value saved on an earlier finished-wall path",
);
assert.ok(
  guide.includes('accessible_route_feet: "accessible-route"') &&
    guide.includes("<AccessibleRouteDrawing />") &&
    guide.includes("Estimate only this distance") &&
    guide.includes("Don’t include the ends."),
  "the accessible-route question shows its own estimate-only diagram and distinguishes the automatic end allowance",
);

console.log("measurement illustrations: doorway rerouting and accessible-route estimate guidance verified");
