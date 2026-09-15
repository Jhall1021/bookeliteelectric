import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST HOMEOWNER DEMO SOURCE CONTRACT\n");

const source = readFileSync("app/dev-fixtures/route-assist-multi-outlet/page.tsx", "utf8");

check("demo offers outlet, switch, and light fixture flows", source.includes('OUTLET: "Outlet"') && source.includes('SWITCH: "Switch"') && source.includes('LIGHT_FIXTURE: "Light fixture"'));
check("outlet and switch flows source from an existing outlet", source.includes("Tap the existing outlet this new") && source.includes("switch") && source.includes("outlet"));
check("outlet and switch flows explain nearest-room-outlet fallback", source.includes("If there isn’t an outlet on this wall, tap the nearest outlet in the room."));
check("light fixture flow sources from its controlling switch", source.includes("Tap the switch that will control this light"));
check("light fixture source can be existing or newly added switch", source.includes("This can be an existing switch or a new switch you just added."));
check("light fixture flow never instructs direct outlet-to-light sourcing", !source.includes("outlet this new light") && !source.includes("outlet this light"));
check("homeowner instructions do not use place-A or A-to-B language", !source.includes("Place A") && !source.includes("place A") && !source.includes("A → B") && !source.includes("A is the existing outlet"));
check("homeowner source marker uses semantic source labels instead of A", source.includes('marker: "P"') && source.includes('marker: "SW"') && !source.includes('label="A"'));
check("outlet flow supports adding another outlet", source.includes("+ Add another outlet") && source.includes("kind === \"OUTLET\""));
check("switch and light flows stay single-destination in this demo", source.includes('kind !== "OUTLET" && targets.length >= 1'));
check("internal ordered legs remain available without becoming homeowner workflow", source.includes("buildOrderedOutletLegs(source, targets)"));
check("doorway bypass applies to whichever segment crosses left to right", source.includes("crossesLeftToRight") && source.includes("leg.source.x < DOOR_LEFT_X") && source.includes("leg.destination.x > DOOR_RIGHT_X"));
check("doorway bypass also supports right-to-left routing", source.includes("crossesRightToLeft") && source.includes("leg.source.x > DOOR_RIGHT_X") && source.includes("leg.destination.x < DOOR_LEFT_X"));
check("doorway bypass is not limited to the first internal segment", !source.includes("leg.ordinal === 1 && leg.source.x < DOOR_LEFT_X"));
check("non-crossing segments remain direct", source.includes("return [leg.source, leg.destination]"));
check("homeowner CTA stays implementation-neutral", source.includes(">Continue</button>") && !source.includes("Continue to scan"));
check("continue opens one room scan", source.includes('projectStep === "SCAN_ROOM"') && source.includes('data-testid="route-assist-scan-room"'));
check("room scan explicitly keeps selected locations", source.includes("We’ll use the locations you already selected. You won’t need to place them again."));
check("scan transitions to one project review", source.includes('projectStep === "REVIEW"') && source.includes('data-testid="route-assist-multi-outlet-review"'));
check("review confirms the full project", source.includes('data-testid="route-assist-confirm-project"') && source.includes('setProjectStep("DONE")'));
check("review explains doorway bypass when present", source.includes("The route shown goes up and around the doorway before continuing to the next location."));
check("confirmation preserves the approved route drawing", source.includes('projectStep === "DONE"') && source.includes("projectRoom(true)"));
check("confirmation calls out doorway bypass when present", source.includes('data-testid="route-assist-confirmed-bypass-note"') && source.includes("Confirmed path:") && source.includes("goes up and around the doorway"));
check("old per-leg scan queue is removed", !source.includes("SCAN_QUEUE") && !source.includes("activeLegIndex") && !source.includes("Start scan for") && !source.includes("Leg 1 of"));
check("flow never redirects to single-outlet demo", !source.includes('href="/dev-fixtures/route-assist-demo"'));
check("demo explicitly stops before pricing/materials/booking", source.includes("does not calculate pricing, materials, or booking"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
