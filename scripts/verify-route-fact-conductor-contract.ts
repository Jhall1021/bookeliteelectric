import { validateConductorRouteRefs, type ConductorRequirement } from "../lib/electrical/conductorRequirement";
import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import { routeAssistResultToRouteFactV1 } from "../lib/visual-assist/route-assist/routeFactAdapter";
import { isRouteAssistIncomplete, type RouteAssistCaptureInput, type RouteAssistResult } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

function buildResult(lengths: Array<number | null>): RouteAssistResult {
  const input: RouteAssistCaptureInput = {
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: [
      { id: "source", x: 0.1, y: 0.7, imageId: "img-1", kind: "SOURCE", surface: "WALL" },
      { id: "door", x: 0.5, y: 0.3, imageId: "img-1", kind: "WAYPOINT", surface: "WALL", obstacle: "DOORWAY" },
      { id: "destination", x: 0.9, y: 0.7, imageId: "img-1", kind: "DESTINATION", surface: "WALL" },
    ],
    segments: [
      { id: "seg-a", fromPointId: "source", toPointId: "door", surface: "WALL", estimatedLengthFt: lengths[0] },
      { id: "seg-b", fromPointId: "door", toPointId: "destination", surface: "WALL", estimatedLengthFt: lengths[1] },
    ],
    drywallAccessAllowed: null,
    captureArtifacts: { imageIds: ["img-1"], overlayImageIds: [] },
  };
  const outcome = buildRouteAssistResult(input);
  if (isRouteAssistIncomplete(outcome)) throw new Error(`fixture unexpectedly incomplete: ${outcome.reason}`);
  return outcome;
}

function containsForbiddenCommercialKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(price|cost|labor|material)/i.test(key)) return true;
    if (containsForbiddenCommercialKey(child)) return true;
  }
  return false;
}

console.log("\nROUTE FACT + CONDUCTOR REQUIREMENT V1\n");

const fresh = buildResult([20.1, 27.5]);
const accepted = applyConfirmation(fresh, "ACCEPTED");
const routeFact = routeAssistResultToRouteFactV1(accepted, {
  routeId: "route-47-6",
  lengthSource: "CUSTOMER_ENTERED",
  routeClass: "UNDERGROUND",
  environment: "WET",
});

check("accepted Route Assist result projects to one RouteFact", routeFact !== null, JSON.stringify(routeFact));
check("exact legitimate route length is preserved", routeFact?.lengthFt === 47.6, JSON.stringify(routeFact));
check("confirmed Route Assist result maps to CONFIRMED", routeFact?.reviewState === "CONFIRMED", JSON.stringify(routeFact));
check("ordered segment identity is referenced, not duplicated geometry", routeFact?.orderedSegmentRefs.join(",") === "seg-a,seg-b", JSON.stringify(routeFact));
check("existing doorway waypoint is referenced as an observable event", routeFact?.observableEventRefs.includes("door") === true, JSON.stringify(routeFact));

const unavailable = routeAssistResultToRouteFactV1(buildResult([null, null]), { routeId: "route-unresolved" });
check("no route length is invented when unavailable", unavailable?.lengthFt === null && unavailable.lengthSource === "UNRESOLVED", JSON.stringify(unavailable));

const reviewRequired = routeAssistResultToRouteFactV1(fresh, { routeId: "route-review" });
check("review-required state stays review-required", reviewRequired?.reviewState === "REVIEW_REQUIRED", JSON.stringify(reviewRequired));

const requirements: ConductorRequirement[] = [
  {
    requirementId: "hot-pair",
    routeRef: "route-47-6",
    wiringMethod: "INDIVIDUAL_CONDUCTORS_IN_RACEWAY",
    function: "UNGROUNDED",
    count: 2,
    gaugeAwg: 6,
    conductorMaterial: "COPPER",
    environmentRequirement: "WET",
    presence: "REQUIRED",
  },
  {
    requirementId: "neutral",
    routeRef: "route-47-6",
    wiringMethod: "INDIVIDUAL_CONDUCTORS_IN_RACEWAY",
    function: "NEUTRAL",
    count: null,
    gaugeAwg: null,
    conductorMaterial: "UNRESOLVED",
    environmentRequirement: "WET",
    presence: "UNRESOLVED",
  },
  {
    requirementId: "egc",
    routeRef: "route-47-6",
    wiringMethod: "INDIVIDUAL_CONDUCTORS_IN_RACEWAY",
    function: "EQUIPMENT_GROUND",
    count: 1,
    gaugeAwg: 10,
    conductorMaterial: "COPPER",
    environmentRequirement: "WET",
    presence: "REQUIRED",
  },
];

check("multiple conductor requirements reference the same single route quantity", requirements.every((requirement) => requirement.routeRef === routeFact?.routeId));
check("shared-route reference invariant validates", validateConductorRouteRefs(requirements, new Set([routeFact!.routeId])).length === 0);
check("two identical hots are grouped as count=2", requirements[0].function === "UNGROUNDED" && requirements[0].count === 2);
check("neutral can remain explicitly unresolved", requirements[1].function === "NEUTRAL" && requirements[1].presence === "UNRESOLVED" && requirements[1].count === null);

const resolvedNeutral: ConductorRequirement = { ...requirements[1], presence: "NOT_REQUIRED" };
check("neutral can become NOT_REQUIRED without deleting historical identity", resolvedNeutral.requirementId === requirements[1].requirementId && resolvedNeutral.presence === "NOT_REQUIRED");

const cable: ConductorRequirement = {
  requirementId: "cable-method",
  routeRef: "route-47-6",
  wiringMethod: "CABLE_ASSEMBLY",
  function: "UNGROUNDED",
  count: 2,
  gaugeAwg: 6,
  conductorMaterial: "COPPER",
  environmentRequirement: "DRY",
  presence: "REQUIRED",
};
const individual: ConductorRequirement = { ...cable, requirementId: "raceway-method", wiringMethod: "INDIVIDUAL_CONDUCTORS_IN_RACEWAY" };
check("cable assembly and individual-conductor wiring methods remain distinct", cable.wiringMethod !== individual.wiringMethod);
check("wet environment and underground route class remain separate concepts", routeFact?.routeClass === "UNDERGROUND" && routeFact.environment === "WET" && requirements[0].environmentRequirement === "WET");

check("RouteFact contains no price/cost/labor/material fields", !containsForbiddenCommercialKey(routeFact), JSON.stringify(routeFact));
check("ConductorRequirement contains no price/cost/labor/material fields", !containsForbiddenCommercialKey(requirements), JSON.stringify(requirements));
check("ConductorRequirement carries no duplicated route length", !("lengthFt" in requirements[0]));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
