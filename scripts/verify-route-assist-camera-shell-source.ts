import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST CAMERA SHELL SOURCE CONTRACT\n");

const component = readFileSync("components/route-assist/RouteAssistRoomScanCamera.tsx", "utf8");
const demo = readFileSync("app/dev-fixtures/route-assist-camera/page.tsx", "utf8");

check("camera shell requests rear-facing video only", component.includes('facingMode: { ideal: "environment" }') && component.includes("audio: false"));
check("camera tracks are stopped on unmount and finish", component.includes("getTracks().forEach((track) => track.stop())") && component.includes("function finishScan()"));
check("homeowner uses one room scan", component.includes("Scan the room once") && demo.includes("phone capture step"));
check("camera shell keeps semantic source and destination labels", component.includes("sourceLabel") && component.includes("destinationLabels") && !component.includes('"A"') && !component.includes('"B"'));
check("camera shell explicitly avoids hidden-wiring inference", component.includes("It will not infer hidden wiring."));
check("camera shell does not import pricing or material takeoff", !component.includes("materialTakeoff") && !component.includes("price") && !component.includes("MaterialTakeoff"));
check("camera shell does not create a second persistence model", !component.includes("localStorage") && !component.includes("sessionStorage") && !component.includes("fetch("));
check("demo distinguishes light fixture source as controlling switch", demo.includes('kind === "LIGHT_FIXTURE" ? "Controlling switch" : "Existing outlet"'));
check("demo keeps switch and outlet source as existing outlet", demo.includes("Existing outlet"));
check("demo honestly states provider submission is not wired yet", demo.includes("does not yet submit scan frames or geometry to a provider"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
