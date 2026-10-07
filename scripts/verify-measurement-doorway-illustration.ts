import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { measurementCanCrossDoorway } from "../lib/electrical/doorwayRouting";

const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const questionStep = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");
const fanSeed = readFileSync("prisma/seed-new-ceiling-fan-v2.ts", "utf8");

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
    guide.match(/doorwayActive[\s\S]{0,180}DOOR_ROUTE_Y/g)?.length === 8,
  "all eight measurement scenarios switch to a route that clears the doorway",
);
assert.ok(
  questionStep.includes("doorwayChecked={doorwayChecked}") &&
    questionStep.includes("onDoorwayChange={collectsDoorway ? setDoorwayChecked : undefined}") &&
    questionStep.includes("accessClass={measurementAccessClass}"),
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
assert.equal(
  measurementCanCrossDoorway({
    questionKey: "ext_gfci_distance",
    prompt: "How many feet is the new outdoor outlet from the power we'd run it from?",
    serviceSlug: "exterior-gfci-other-routing",
    accessClass: "FINISHED",
  }),
  true,
  "finished-wall exterior GFCI measurements include the doorway control",
);
assert.equal(
  measurementCanCrossDoorway({
    questionKey: "ext_gfci_distance",
    prompt: "How many feet is the new outdoor outlet from the power we'd run it from?",
    serviceSlug: "exterior-gfci-other-routing",
    accessClass: "ACCESSIBLE",
  }),
  false,
  "accessible exterior GFCI routes do not show a doorway that the open route bypasses",
);
assert.ok(
  questionStep.includes('[doorwayAnswerKey(question.key)]: collectsDoorway') &&
    questionStep.includes('routeDoorwayCount > 0 ? String(routeDoorwayCount) : "no"') &&
    questionStep.includes(': null,'),
  "an accessible-route answer clears any doorway value saved on an earlier finished-wall path",
);
assert.ok(
  guide.includes("function MultiRoomRouteDrawing") &&
    guide.includes("+ Add another room or route section") &&
    guide.includes("Feet through this section") &&
    guide.includes("Doorways crossed") &&
    questionStep.includes('"dedicated_distance"') &&
    questionStep.includes('"new-coax-line_distance"') &&
    questionStep.includes('"new-ethernet-line_distance"'),
  "dedicated, coax, and Ethernet measurements can expand into room-by-room route sections",
);
assert.ok(
  guide.includes('accessible_route_feet: "accessible-route"') &&
    guide.includes('serviceSlug === "dedicated-120v-circuit-outlet"') &&
    guide.includes('? "panel-outlet"') &&
    guide.includes("<AccessibleRouteDrawing endpoint={accessibleEndpoint} />") &&
    guide.includes('const sourceX = endpointIsFan ? 115 : 130') &&
    guide.includes('const targetX = endpointIsFan ? 300 : 470') &&
    guide.includes('sourceIsPanel ? <ElectricalPanel x={sourceX} y={sourceY} />') &&
    guide.includes('endpointIsFan ? <CeilingFan x={targetX} y={targetY} />') &&
    guide.includes('endpointIsCoax ? <CoaxWallPlate x={targetX} y={targetY} />') &&
    guide.includes('accessibleEndpoint === "panel-outlet" ? "Electrical panel"') &&
    guide.includes('accessibleEndpoint === "panel-outlet" ? "New outlet"') &&
    guide.includes("Estimate only this distance") &&
    guide.includes("Don’t include the ends."),
  "the accessible-route question shows the correct destination, estimate-only distance, and automatic end allowance",
);
assert.ok(
    guide.includes('function CeilingFanFinishedRouteDrawing({ method }') &&
    guide.includes('serviceSlug === "new-ceiling-fan"') &&
    guide.includes('fan_finished_route_feet: "outlet-to-outlet"') &&
    guide.includes('questionKey === "fan_finished_route_feet"') &&
    guide.includes('questionKey === "surface_route_feet"') &&
    guide.includes('HIDDEN ABOVE THE DRYWALL') &&
    guide.includes('VISIBLE SURFACE RACEWAY') &&
    guide.includes('Measure from the switch, up the wall, and across the ceiling to the fan location.'),
  "finished ceiling-fan measurements show switch-to-centered-fan diagrams for concealed and visible routes",
);
assert.ok(
  questionStep.includes("isWiringMethodComparisonQuestion(question.key)") &&
    fanSeed.includes("FAN_ROUTE_METHOD_HELP_KEY") &&
    fanSeed.includes('value: "unsure", routeAction: "CONTINUE", nextQuestionId: qMethodHelp.id'),
  "the fan help choice continues to the shared concealed-versus-Wiremold illustration instead of remote review",
);

console.log("measurement illustrations: doorway rerouting and accessible-route estimate guidance verified");
