import {
  runRouteAssistScanProviderV1,
  type RouteAssistScanProviderInputV1,
  type RouteAssistScanProviderV1,
} from "../lib/visual-assist/route-assist/scanProvider";
import { collectRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanPipeline";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST SCAN PROVIDER BOUNDARY\n");

const baseInput: RouteAssistScanProviderInputV1 = {
  version: 1,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  captureKind: "ORDINARY_ROOM_SCAN",
  points: [
    { id: "a", x: 0.1, y: 0.5, imageId: "img-1", kind: "SOURCE" },
    { id: "w", x: 0.5, y: 0.5, imageId: "img-1", kind: "WAYPOINT" },
    { id: "b", x: 0.9, y: 0.5, imageId: "img-1", kind: "DESTINATION" },
  ],
  segments: [
    { id: "s1", fromPointId: "a", toPointId: "w" },
    { id: "s2", fromPointId: "w", toPointId: "b" },
  ],
  captureArtifacts: { imageIds: ["img-1"], overlayImageIds: [] },
};

function evidence(overrides: Partial<RouteAssistScanEvidenceV1> = {}): RouteAssistScanEvidenceV1 {
  return {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: [
      {
        segmentId: "s1",
        measuredLengthFt: {
          value: 5.125,
          confidence: 0.01,
          visibility: "CLEAR",
          basis: "WORLD_GEOMETRY",
        },
      },
      {
        segmentId: "s2",
        measuredLengthFt: {
          value: 9.5,
          confidence: 0.02,
          visibility: "CLEAR",
          basis: "WORLD_GEOMETRY",
        },
      },
    ],
    transitions: [
      {
        pointId: "w",
        physicalTurn: {
          value: "FLAT",
          confidence: 0.03,
          visibility: "CLEAR",
          basis: "WORLD_GEOMETRY",
        },
      },
    ],
    ...overrides,
  };
}

async function run() {
  const coherentProvider: RouteAssistScanProviderV1 = {
    providerKey: "fake.world.v1",
    async analyze(input) {
      // Try to mutate detached provider input. The caller's graph must survive.
      (input.points[0] as { id: string }).id = "provider-mutated";
      return evidence();
    },
  };

  const coherent = await runRouteAssistScanProviderV1(coherentProvider, baseInput);
  check("coherent provider evidence is accepted", coherent.evidence !== null, JSON.stringify(coherent.problems));
  check(
    "provider confidence is carried as evidence, not threshold authority",
    coherent.evidence?.segments[0].measuredLengthFt?.confidence === 0.01,
    JSON.stringify(coherent.evidence?.segments[0].measuredLengthFt),
  );
  check("provider cannot mutate caller route graph", baseInput.points[0].id === "a", String(baseInput.points[0].id));

  const pipeline = await collectRouteAssistScanCandidatesV1(coherentProvider, baseInput);
  check("automatic scan pipeline stops with reviewable candidates", pipeline.evidence !== null && pipeline.candidates !== null, JSON.stringify(pipeline.problems));
  check(
    "complete world-geometry route length stays exact and unrounded in candidate layer",
    pipeline.candidates?.completeMeasuredRouteLength?.valueFt === 14.625,
    JSON.stringify(pipeline.candidates?.completeMeasuredRouteLength),
  );
  check(
    "low provider confidence remains present rather than being threshold-filtered",
    pipeline.candidates?.segments[0].measuredLengthFt?.confidence === 0.01,
    JSON.stringify(pipeline.candidates?.segments[0].measuredLengthFt),
  );
  check(
    "pipeline does not mutate canonical Route Assist graph",
    baseInput.segments.every((segment) => segment.estimatedLengthFt == null) && baseInput.points[1].physicalTurn == null,
    JSON.stringify({ points: baseInput.points, segments: baseInput.segments }),
  );

  const wrongGraph = await runRouteAssistScanProviderV1(
    {
      providerKey: "fake.bad-graph.v1",
      async analyze() {
        return evidence({
          segments: [{ segmentId: "not-a-route-segment" }],
        });
      },
    },
    baseInput,
  );
  check("evidence outside the authoritative route graph is rejected", wrongGraph.evidence === null, JSON.stringify(wrongGraph.problems));
  check("graph mismatch explains the refusal", wrongGraph.problems.some((p) => p.includes("not present in the base route")), JSON.stringify(wrongGraph.problems));

  const concealedOrdinaryProvider: RouteAssistScanProviderV1 = {
    providerKey: "fake.concealed-room.v1",
    async analyze() {
      return evidence({ transitions: [] });
    },
  };
  const concealedOrdinary = await runRouteAssistScanProviderV1(
    concealedOrdinaryProvider,
    { ...baseInput, mode: "CONCEALED", captureKind: "ORDINARY_ROOM_SCAN" },
  );
  check("ordinary room scan cannot establish concealed footage", concealedOrdinary.evidence === null, JSON.stringify(concealedOrdinary.problems));
  check(
    "concealed-footage refusal is explicit",
    concealedOrdinary.problems.filter((p) => p.includes("cannot establish concealed-route footage")).length === 2,
    JSON.stringify(concealedOrdinary.problems),
  );
  const concealedOrdinaryPipeline = await collectRouteAssistScanCandidatesV1(
    concealedOrdinaryProvider,
    { ...baseInput, mode: "CONCEALED", captureKind: "ORDINARY_ROOM_SCAN" },
  );
  check(
    "rejected concealed-room evidence cannot leak into candidates",
    concealedOrdinaryPipeline.evidence === null && concealedOrdinaryPipeline.candidates === null,
    JSON.stringify(concealedOrdinaryPipeline),
  );

  const concealedExposed = await runRouteAssistScanProviderV1(
    {
      providerKey: "fake.exposed-route.v1",
      async analyze() {
        return evidence({ transitions: [] });
      },
    },
    { ...baseInput, mode: "CONCEALED", captureKind: "EXPOSED_ROUTE_SCAN" },
  );
  check(
    "explicitly exposed-route capture may carry coherent world-geometry lengths",
    concealedExposed.evidence !== null,
    JSON.stringify(concealedExposed.problems),
  );

  const providerFailure = await runRouteAssistScanProviderV1(
    {
      providerKey: "fake.failure.v1",
      async analyze() {
        throw new Error("provider offline");
      },
    },
    baseInput,
  );
  check("provider failure yields no evidence", providerFailure.evidence === null, JSON.stringify(providerFailure));
  check("provider failure is neutral and does not leak provider error text", providerFailure.problems[0] === "scan provider failed without producing evidence", JSON.stringify(providerFailure.problems));

  const invalidKey = await runRouteAssistScanProviderV1(
    {
      providerKey: "bad provider key with spaces",
      async analyze() {
        return evidence();
      },
    },
    baseInput,
  );
  check("provider identity is opaque/bounded", invalidKey.evidence === null && invalidKey.problems.length === 1, JSON.stringify(invalidKey));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
