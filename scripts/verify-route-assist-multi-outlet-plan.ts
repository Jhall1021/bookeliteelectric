import { buildOrderedOutletLegs } from "../lib/visual-assist/route-assist/multiOutletPlan";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST MULTI-OUTLET PLAN\n");

const source = { id: "A", label: "Existing outlet", point: { x: 0.1, y: 0.6 } };
const outlets = [
  { id: "B", label: "Outlet 1", point: { x: 0.7, y: 0.6 } },
  { id: "C", label: "Outlet 2", point: { x: 0.82, y: 0.45 } },
  { id: "D", label: "Outlet 3", point: { x: 0.9, y: 0.3 } },
];

const legs = buildOrderedOutletLegs(source, outlets);
check("three new outlets produce three ordinary legs", legs.length === 3, String(legs.length));
check("first leg is A->B", legs[0].fromEndpointId === "A" && legs[0].toEndpointId === "B", JSON.stringify(legs[0]));
check("second leg daisy-chains B->C", legs[1].fromEndpointId === "B" && legs[1].toEndpointId === "C", JSON.stringify(legs[1]));
check("third leg daisy-chains C->D", legs[2].fromEndpointId === "C" && legs[2].toEndpointId === "D", JSON.stringify(legs[2]));
check("leg ordinals preserve homeowner order", legs.map((leg) => leg.ordinal).join(",") === "1,2,3");
check("leg coordinates are copied rather than aliasing endpoint objects", legs[1].source !== outlets[0].point && legs[1].destination !== outlets[1].point);

outlets[0].point.x = 0.2;
check("later endpoint mutation cannot rewrite an already-built leg", legs[0].destination.x === 0.7 && legs[1].source.x === 0.7);

const none = buildOrderedOutletLegs(source, []);
check("no new outlets produces no route legs", none.length === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
