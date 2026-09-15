import { getRouteAssistInvocation } from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { isRouteAssistResultPayload } from "../lib/visual-assist/route-assist/validation";
import type { RouteAssistResult } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

function result(over: Partial<RouteAssistResult> = {}): RouteAssistResult {
  return {
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: [],
    segments: [],
    customerConfirmedRoute: true,
    estimatedTotalRouteLengthFt: 14.625,
    sameWall: null,
    wallTransitionsCount: 0,
    insideCornersCount: 2,
    outsideCornersCount: 1,
    doorwayBypassesCount: 0,
    windowBypassesCount: 0,
    verticalTransitionsCount: 0,
    wallToCeilingTransitionsCount: 0,
    wallToFloorTransitionsCount: 0,
    visibleObstacleDetoursCount: 0,
    concealedRouteComplexity: null,
    suggestedAccessOpeningsMin: null,
    suggestedAccessOpeningsMax: null,
    needsContractorReview: false,
    captureArtifacts: { imageIds: [], overlayImageIds: [] },
    customerNotes: null,
    drywallAccessAllowed: null,
    ...over,
  };
}

console.log("\nROUTE ASSIST TASK CONTRACT\n");

const slug = "new-120v-outlet";
const feet = getRouteAssistInvocation(slug, "surface_route_feet");
const inside = getRouteAssistInvocation(slug, "surface_inside_corner_count");
const outside = getRouteAssistInvocation(slug, "surface_outside_corner_count");
const concealed = getRouteAssistInvocation(slug, "concealed_route_feet");

check("surface feet invocation exists", !!feet);
check("surface inside-corner invocation exists", !!inside);
check("surface outside-corner invocation exists", !!outside);
check(
  "one surface scan has one shared task identity",
  !!feet && feet.taskKey === inside?.taskKey && feet.taskKey === outside?.taskKey,
  `${feet?.taskKey} / ${inside?.taskKey} / ${outside?.taskKey}`
);
check(
  "the shared task key is itself phone-recoverable through the registry",
  !!feet && getRouteAssistInvocation(slug, feet.taskKey)?.destinationType === "RECEPTACLE",
  String(feet?.taskKey)
);
check(
  "concealed capture remains a distinct task",
  !!concealed && !!feet && concealed.taskKey !== feet.taskKey,
  `${feet?.taskKey} vs ${concealed?.taskKey}`
);

const valid = result();
check("a confirmed fractional-footage result is valid", isRouteAssistResultPayload(valid));
check(
  "surface feet preserves 14.625",
  feet?.resolveAnswerValue(valid) === "14.625",
  String(feet?.resolveAnswerValue(valid))
);
check(
  "the same capture independently resolves its inside-corner fact",
  inside?.resolveAnswerValue(valid) === "2",
  String(inside?.resolveAnswerValue(valid))
);
check(
  "the same capture independently resolves its outside-corner fact",
  outside?.resolveAnswerValue(valid) === "1",
  String(outside?.resolveAnswerValue(valid))
);

check(
  "unconfirmed result cannot complete a task",
  !isRouteAssistResultPayload(result({ customerConfirmedRoute: false, needsContractorReview: true }))
);
check(
  "fractional counts are rejected",
  !isRouteAssistResultPayload(result({ insideCornersCount: 1.5 }))
);
check(
  "negative footage is rejected",
  !isRouteAssistResultPayload(result({ estimatedTotalRouteLengthFt: -1 }))
);
check(
  "non-concealed drywall-access claim is rejected",
  !isRouteAssistResultPayload(result({ drywallAccessAllowed: true }))
);
check(
  "one-sided access-opening evidence is rejected",
  !isRouteAssistResultPayload(result({ mode: "CONCEALED", drywallAccessAllowed: true, suggestedAccessOpeningsMin: 2 }))
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
