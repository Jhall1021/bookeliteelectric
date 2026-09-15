import { adaptRouteAssistResult } from "../lib/electrical/routeAssistAdapter";
import { getRouteAssistInvocation } from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import type { RouteAssistResult } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

function capture(overrides: Partial<RouteAssistResult> = {}): RouteAssistResult {
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
    ...overrides,
  };
}

console.log("\nROUTE ASSIST FRACTIONAL FOOTAGE\n");

const fractional = adaptRouteAssistResult(capture());
check(
  "adapter preserves 14.625 ft exactly",
  fractional.mapped.routeLengthFt === 14.625,
  JSON.stringify(fractional.mapped.routeLengthFt),
);
check(
  "fractional footage is not marked invalid",
  fractional.invalid.length === 0,
  JSON.stringify(fractional.invalid),
);

const surface = getRouteAssistInvocation("new-120v-outlet", "surface_route_feet");
check("surface footage invocation exists", surface !== null);
check(
  "surface invocation emits the measured numeric answer, unbanded",
  surface?.resolveAnswerValue(capture()) === "14.625",
  String(surface?.resolveAnswerValue(capture())),
);

const concealed = getRouteAssistInvocation("new-120v-outlet", "concealed_route_feet");
check("concealed footage invocation exists", concealed !== null);
check(
  "mode authority still holds: SURFACE capture cannot answer concealed footage",
  concealed?.resolveAnswerValue(capture()) === null,
  String(concealed?.resolveAnswerValue(capture())),
);

const negative = adaptRouteAssistResult(capture({ estimatedTotalRouteLengthFt: -1 }));
check(
  "negative footage is still invalid",
  negative.invalid.some((x) => x.field === "estimatedTotalRouteLengthFt"),
  JSON.stringify(negative.invalid),
);

const fractionalCorner = adaptRouteAssistResult(capture({ insideCornersCount: 1.5 }));
check(
  "corner counts remain whole-number facts",
  fractionalCorner.invalid.some((x) => x.field === "insideCornersCount"),
  JSON.stringify(fractionalCorner.invalid),
);

if (fail > 0) {
  console.error(`\n${fail} failed, ${pass} passed\n`);
  process.exit(1);
}

console.log(`\n${pass} passed\n`);
