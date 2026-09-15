import { adaptRouteAssistResult } from "../lib/electrical/routeAssistAdapter";
import { getRouteAssistInvocation } from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
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

/** Synthetic trusted-domain probe for downstream adapter/registry behavior. */
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

const built = buildRouteAssistResult({
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  points: [
    { id: "a", x: 0.1, y: 0.5, imageId: "img-1", kind: "SOURCE" },
    { id: "w", x: 0.5, y: 0.5, imageId: "img-1", kind: "WAYPOINT" },
    { id: "b", x: 0.9, y: 0.5, imageId: "img-1", kind: "DESTINATION" },
  ],
  segments: [
    { id: "s1", fromPointId: "a", toPointId: "w", estimatedLengthFt: 5.125 },
    { id: "s2", fromPointId: "w", toPointId: "b", estimatedLengthFt: 9.5 },
  ],
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["img-1"], overlayImageIds: [] },
});
check("result builder returns a complete Route Assist result", !("reason" in built), JSON.stringify(built));
if (!("reason" in built)) {
  check(
    "result builder preserves exact 14.625 ft aggregate",
    built.estimatedTotalRouteLengthFt === 14.625,
    String(built.estimatedTotalRouteLengthFt),
  );
}

const fractional = adaptRouteAssistResult(capture());
check(
  "adapter preserves 14.625 ft exactly",
  fractional.mapped.routeLengthFt === 14.625,
  JSON.stringify(fractional.mapped.routeLengthFt),
);
check(
  "fractional footage is not marked invalid by the downstream adapter",
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

// Legacy image-space corner aggregates are deliberately outside the canonical
// fitting-count contract now. Even a malformed synthetic value cannot become a
// Routing V2 fitting quantity through this adapter; task-boundary validation
// separately rejects malformed persisted aggregate counts.
const legacyCornerProbe = adaptRouteAssistResult(capture({ insideCornersCount: 1.5 }));
check(
  "legacy image-space corner aggregates stay explicitly unmapped",
  legacyCornerProbe.unmapped.some((x) => x.field === "insideCornersCount")
);
check(
  "legacy corner aggregates cannot fabricate a physical fitting count",
  legacyCornerProbe.mapped.insideCorners === null &&
    legacyCornerProbe.mapped.outsideCorners === null &&
    legacyCornerProbe.mapped.flatCorners === null,
  JSON.stringify(legacyCornerProbe.mapped),
);

if (fail > 0) {
  console.error(`\n${fail} failed, ${pass} passed\n`);
  process.exit(1);
}

console.log(`\n${pass} passed\n`);
