import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST MULTI-OUTLET DEMO SOURCE CONTRACT\n");

const source = readFileSync("app/dev-fixtures/route-assist-multi-outlet/page.tsx", "utf8");

check("demo composes ordered legs through the shared planner", source.includes("buildOrderedOutletLegs(source, outlets)"));
check("demo supports adding another outlet", source.includes("+ Add another outlet") && source.includes("setPlacingOutlet(true)"));
check("demo supports outlet removal and relabeling", source.includes("removeOutlet(index)") && source.includes("endpointLetter(currentIndex)"));
check("demo labels homeowner endpoints A/B/C/D-style", source.includes('label="A"') && source.includes("endpointLetter(index)"));
check("first internal leg may own doorway bypass geometry", source.includes("leg.ordinal === 1") && source.includes("DOOR_HEADER_Y"));
check("later internal legs do not inherit first-leg doorway geometry", source.includes("return [leg.source, leg.destination]"));
check("homeowner CTA stays implementation-neutral", source.includes(">\n              Continue\n            </button>") && !source.includes("Continue to scan {legs.length}"));
check("continue opens one room scan", source.includes('projectStep === "SCAN_ROOM"') && source.includes('data-testid="route-assist-scan-room"'));
check("one room scan keeps all placed outlets visible", source.includes("source={source} outlets={outlets}") && source.includes("One scan for this room."));
check("scan transitions to one project review", source.includes('projectStep === "REVIEW"') && source.includes('data-testid="route-assist-multi-outlet-review"'));
check("review confirms the full project", source.includes('data-testid="route-assist-confirm-project"') && source.includes('setProjectStep("DONE")'));
check("old per-leg scan queue is removed", !source.includes("SCAN_QUEUE") && !source.includes("activeLegIndex") && !source.includes("Start scan for"));
check("multi-outlet flow never redirects to single-outlet demo", !source.includes('href="/dev-fixtures/route-assist-demo"'));
check("demo explicitly stops before pricing/materials/booking", source.includes("does not calculate pricing, materials, or booking"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
