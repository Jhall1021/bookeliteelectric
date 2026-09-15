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
check("first leg may own doorway bypass geometry", source.includes("leg.ordinal === 1") && source.includes("DOOR_HEADER_Y"));
check("later legs do not inherit first-leg doorway geometry", source.includes("return [leg.source, leg.destination]"));
check("demo renders each canonical project leg separately", source.includes("data-route-leg={leg.id}") && source.includes("leg.fromEndpointId") && source.includes("leg.toEndpointId"));
check("demo explicitly stops before pricing/materials/booking", source.includes("does not calculate pricing, materials, or booking"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
