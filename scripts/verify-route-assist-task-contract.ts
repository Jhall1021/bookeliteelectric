import {
  getRouteAssistCaptureContextByTaskKey,
  getRouteAssistInvocation,
} from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { isRouteAssistResultPayload } from "../lib/visual-assist/route-assist/validation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import type { RouteAssistDestinationType } from "../lib/visual-assist/route-assist/taxonomy";
import {
  isRouteAssistIncomplete,
  type RouteAssistResult,
  type RoutePoint,
  type RouteSegment,
} from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

function confirmedSurfaceResult(destinationType: RouteAssistDestinationType = "RECEPTACLE"): RouteAssistResult {
  const points: RoutePoint[] = [
    { id: "A", x: 0.05, y: 0.5, imageId: "room", kind: "SOURCE" },
    { id: "W1", x: 0.2, y: 0.5, imageId: "room", kind: "WAYPOINT", physicalTurn: "INSIDE" },
    { id: "W2", x: 0.35, y: 0.35, imageId: "room", kind: "WAYPOINT", physicalTurn: "INSIDE" },
    { id: "W3", x: 0.55, y: 0.35, imageId: "room", kind: "WAYPOINT", physicalTurn: "OUTSIDE" },
    { id: "W4", x: 0.75, y: 0.5, imageId: "room", kind: "WAYPOINT", physicalTurn: "FLAT" },
    { id: "B", x: 0.95, y: 0.5, imageId: "room", kind: "DESTINATION" },
  ];
  const lengths = [3.125, 2.5, 3, 2, 4]; // exact 14.625 physical route.
  const ids = ["A", "W1", "W2", "W3", "W4", "B"];
  const segments: RouteSegment[] = lengths.map((estimatedLengthFt, index) => ({
    id: `S${index + 1}`,
    fromPointId: ids[index],
    toPointId: ids[index + 1],
    surface: "WALL",
    estimatedLengthFt,
  }));

  const built = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType,
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: { imageIds: ["room"], overlayImageIds: [] },
  });
  if (isRouteAssistIncomplete(built)) throw new Error(`fixture unexpectedly incomplete: ${built.reason}`);
  return applyConfirmation(built, "ACCEPTED");
}

console.log("\nROUTE ASSIST TASK CONTRACT\n");

const slug = "new-120v-outlet";
const feet = getRouteAssistInvocation(slug, "surface_route_feet");
const inside = getRouteAssistInvocation(slug, "surface_inside_corner_count");
const outside = getRouteAssistInvocation(slug, "surface_outside_corner_count");
const flat = getRouteAssistInvocation(slug, "surface_route_flat_corner_count");
const concealed = getRouteAssistInvocation(slug, "concealed_route_feet");

check("surface feet invocation exists", !!feet);
check("surface inside-corner invocation exists", !!inside);
check("surface outside-corner invocation exists", !!outside);
check("surface flat-corner invocation exists", !!flat);
check(
  "one surface scan has one shared task identity",
  !!feet && feet.taskKey === inside?.taskKey && feet.taskKey === outside?.taskKey && feet.taskKey === flat?.taskKey,
  `${feet?.taskKey} / ${inside?.taskKey} / ${outside?.taskKey} / ${flat?.taskKey}`
);
check(
  "capture task identity is not borrowed from any canonical question key",
  !!feet && ![
    "surface_route_feet",
    "surface_inside_corner_count",
    "surface_outside_corner_count",
    "surface_route_flat_corner_count",
  ].includes(feet.taskKey),
  String(feet?.taskKey)
);
const phoneContext = feet ? getRouteAssistCaptureContextByTaskKey(slug, feet.taskKey) : null;
check(
  "the shared task key is phone-recoverable without pretending it is a question key",
  phoneContext?.destinationType === "RECEPTACLE" &&
    phoneContext.sourceHint === feet?.sourceHint &&
    phoneContext.destinationHint === feet?.destinationHint,
  JSON.stringify(phoneContext)
);
check(
  "concealed capture remains a distinct task",
  !!concealed && !!feet && concealed.taskKey !== feet.taskKey,
  `${feet?.taskKey} vs ${concealed?.taskKey}`
);

const valid = confirmedSurfaceResult();
check("a domain-built confirmed result passes completion validation", isRouteAssistResultPayload(valid));
check(
  "Route Assist task result preserves exact fractional footage",
  feet?.resolveAnswerValue(valid) === "14.625",
  String(feet?.resolveAnswerValue(valid))
);
check(
  "the same capture independently resolves exact physical inside turns",
  inside?.resolveAnswerValue(valid) === "2",
  String(inside?.resolveAnswerValue(valid))
);
check(
  "the same capture independently resolves exact physical outside turns",
  outside?.resolveAnswerValue(valid) === "1",
  String(outside?.resolveAnswerValue(valid))
);
check(
  "the same capture independently resolves exact physical flat turns",
  flat?.resolveAnswerValue(valid) === "1",
  String(flat?.resolveAnswerValue(valid))
);

check(
  "exact 14.625 aggregate remains a valid persisted completion",
  valid.estimatedTotalRouteLengthFt === 14.625 && isRouteAssistResultPayload(valid),
  String(valid.estimatedTotalRouteLengthFt)
);
const roundedAggregateLie: RouteAssistResult = { ...valid, estimatedTotalRouteLengthFt: 14.6 };
check(
  "a rounded 14.6 aggregate cannot masquerade as legs that total 14.625",
  !isRouteAssistResultPayload(roundedAggregateLie)
);
check(
  "downstream Route Assist binding emits the exact accepted aggregate",
  feet?.resolveAnswerValue(valid) === "14.625",
  String(feet?.resolveAnswerValue(valid))
);

// Legacy image-space aggregates are NOT fitting authority. Deliberately lie in
// those fields while leaving explicit physicalTurn evidence intact: the task
// validator rejects the lie as graph-inconsistent, and a direct adapter probe
// (which receives a trusted RouteAssistResult) still reads the physical turns.
const legacyLie: RouteAssistResult = { ...valid, insideCornersCount: 9, outsideCornersCount: 8 };
check("graph-inconsistent legacy aggregate cannot complete a task", !isRouteAssistResultPayload(legacyLie));
check(
  "physical inside-turn answer ignores the legacy image-space aggregate",
  inside?.resolveAnswerValue(legacyLie) === "2",
  String(inside?.resolveAnswerValue(legacyLie))
);
check(
  "physical outside-turn answer ignores the legacy image-space aggregate",
  outside?.resolveAnswerValue(legacyLie) === "1",
  String(outside?.resolveAnswerValue(legacyLie))
);

const unresolvedTurn: RouteAssistResult = {
  ...valid,
  points: valid.points.map((point) => point.id === "W2" ? { ...point, physicalTurn: null } : point),
};
check(
  "one unresolved physical waypoint makes every exact fitting count unavailable",
  inside?.resolveAnswerValue(unresolvedTurn) === null &&
    outside?.resolveAnswerValue(unresolvedTurn) === null &&
    flat?.resolveAnswerValue(unresolvedTurn) === null
);

const endpointProofs: {
  service: string;
  destinationType: RouteAssistDestinationType;
}[] = [
  { service: "surface-mounted-outlet", destinationType: "RECEPTACLE" },
  { service: "surface-mounted-switch", destinationType: "SWITCH" },
  { service: "surface-mounted-fixture-box", destinationType: "SURFACE_BOX" },
];

for (const proof of endpointProofs) {
  const inv = getRouteAssistInvocation(proof.service, "surface_route_feet");
  const ownResult = confirmedSurfaceResult(proof.destinationType);
  check(`${proof.service} reuses the surface-route capture`, !!inv);
  check(
    `${proof.service} advertises the correct endpoint`,
    inv?.destinationType === proof.destinationType,
    String(inv?.destinationType)
  );
  check(
    `${proof.service} accepts its own endpoint result`,
    inv?.resolveAnswerValue(ownResult) === "14.625",
    String(inv?.resolveAnswerValue(ownResult))
  );
  const groupContext = inv ? getRouteAssistCaptureContextByTaskKey(proof.service, inv.taskKey) : null;
  check(
    `${proof.service} recovers the same endpoint from grouped task identity`,
    groupContext?.destinationType === proof.destinationType,
    JSON.stringify(groupContext)
  );
  const wrongDestination: RouteAssistDestinationType =
    proof.destinationType === "RECEPTACLE" ? "SWITCH" : "RECEPTACLE";
  check(
    `${proof.service} refuses a different endpoint's capture`,
    inv?.resolveAnswerValue({ ...ownResult, destinationType: wrongDestination }) === null,
    String(inv?.resolveAnswerValue({ ...ownResult, destinationType: wrongDestination }))
  );
}

check(
  "unconfirmed result cannot complete a task",
  !isRouteAssistResultPayload({ ...valid, customerConfirmedRoute: false, needsContractorReview: true })
);
check(
  "fractional aggregate counts are rejected",
  !isRouteAssistResultPayload({ ...valid, insideCornersCount: 1.5 })
);
check(
  "negative footage is rejected",
  !isRouteAssistResultPayload({ ...valid, estimatedTotalRouteLengthFt: -1 })
);
check(
  "graph-inconsistent footage is rejected even when structurally valid",
  !isRouteAssistResultPayload({ ...valid, estimatedTotalRouteLengthFt: 99 })
);
check(
  "non-concealed drywall-access claim is rejected",
  !isRouteAssistResultPayload({ ...valid, drywallAccessAllowed: true })
);
check(
  "one-sided access-opening evidence is rejected",
  !isRouteAssistResultPayload({
    ...valid,
    mode: "CONCEALED",
    drywallAccessAllowed: true,
    suggestedAccessOpeningsMin: 2,
  })
);
const orphan: RouteAssistResult = {
  ...valid,
  points: [...valid.points, { id: "ORPHAN", x: 0.5, y: 0.9, imageId: "room", kind: "WAYPOINT" }],
};
check("an orphaned route point cannot become the canonical completed task", !isRouteAssistResultPayload(orphan));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
