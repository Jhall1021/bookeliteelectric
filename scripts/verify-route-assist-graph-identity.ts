import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import { isRouteAssistResultPayload } from "../lib/visual-assist/route-assist/validation";
import {
  isRouteAssistIncomplete,
  type RouteAssistResult,
  type RoutePoint,
  type RouteSegment,
} from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

const points: RoutePoint[] = [
  { id: "A", x: 0.1, y: 0.5, imageId: "room", kind: "SOURCE" },
  { id: "W1", x: 0.5, y: 0.5, imageId: "room", kind: "WAYPOINT", physicalTurn: "FLAT" },
  { id: "B", x: 0.9, y: 0.5, imageId: "room", kind: "DESTINATION" },
];
const segments: RouteSegment[] = [
  { id: "S1", fromPointId: "A", toPointId: "W1", surface: "WALL", estimatedLengthFt: 5 },
  { id: "S2", fromPointId: "W1", toPointId: "B", surface: "WALL", estimatedLengthFt: 6 },
];

const built = buildRouteAssistResult({
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  points,
  segments,
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["room"], overlayImageIds: [] },
});
if (isRouteAssistIncomplete(built)) throw new Error(`fixture unexpectedly incomplete: ${built.reason}`);
const valid = applyConfirmation(built, "ACCEPTED");

console.log("\nROUTE ASSIST GRAPH IDENTITY\n");

check("a canonical simple route is accepted", isRouteAssistResultPayload(valid));

const duplicatePoint: RouteAssistResult = {
  ...valid,
  points: [
    ...valid.points,
    { id: "W1", x: 0.6, y: 0.7, imageId: "room", kind: "WAYPOINT", physicalTurn: "OUTSIDE" },
  ],
};
check(
  "duplicate point ids are rejected before they can make evidence references ambiguous",
  !isRouteAssistResultPayload(duplicatePoint)
);

const duplicateSegment: RouteAssistResult = {
  ...valid,
  segments: [
    ...valid.segments,
    { id: "S1", fromPointId: "A", toPointId: "B", surface: "WALL", estimatedLengthFt: 11 },
  ],
};
check(
  "duplicate segment ids are rejected before ordered geometry can address the wrong leg",
  !isRouteAssistResultPayload(duplicateSegment)
);

const selfLoop: RouteAssistResult = {
  ...valid,
  segments: valid.segments.map((segment, index) =>
    index === 0 ? { ...segment, fromPointId: "W1", toPointId: "W1" } : segment
  ),
};
check("self-loop route legs are rejected", !isRouteAssistResultPayload(selfLoop));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
