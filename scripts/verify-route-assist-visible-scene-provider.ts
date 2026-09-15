import type { RouteAssistSweepCaptureHandoffV1 } from "../lib/visual-assist/route-assist/captureHandoff";
import { preparePersistedSweepForVisibleSceneReviewV1 } from "../lib/visual-assist/route-assist/visibleSceneReviewPipeline";
import type { RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

const points: RoutePoint[] = [
  { id: "source", x: 0.1, y: 0.6, imageId: "frame-0", kind: "SOURCE", surface: "WALL" },
  { id: "door", x: 0.5, y: 0.5, imageId: "frame-1", kind: "WAYPOINT", surface: "WALL", obstacle: "DOORWAY" },
  { id: "destination", x: 0.9, y: 0.6, imageId: "frame-2", kind: "DESTINATION", surface: "WALL" },
];
const segments: RouteSegment[] = [
  { id: "seg-a", fromPointId: "source", toPointId: "door", surface: "WALL" },
  { id: "seg-b", fromPointId: "door", toPointId: "destination", surface: "WALL" },
];
const handoff: RouteAssistSweepCaptureHandoffV1 = {
  version: 1,
  persistedFrames: [0, 1, 2].map((sequence) => ({
    imageId: `frame-${sequence}`,
    imageUrl: `https://example.invalid/frame-${sequence}.jpg`,
    mimeType: "image/jpeg" as const,
    width: 1200,
    height: 900,
    capturedAt: `2026-09-15T20:00:0${sequence}.000Z`,
    sequence,
  })),
  reviewImage: { imageId: "frame-2", imageUrl: "https://example.invalid/frame-2.jpg", mimeType: "image/jpeg", width: 1200, height: 900 },
  captureArtifacts: { imageIds: ["frame-0", "frame-1", "frame-2"], overlayImageIds: [] },
};

function semantics(entrySide: "LEFT" | "RIGHT" | "UNRESOLVED" = "LEFT") {
  return {
    version: 1 as const,
    captureImageIds: ["frame-0", "frame-1", "frame-2"],
    objects: [
      { id: "source-object", kind: "SOURCE_RECEPTACLE" as const, imageId: "frame-0", confidence: 0.99, box: { x: 0.08, y: 0.52, width: 0.1, height: 0.16 }, pointId: "source" },
      { id: "base-a", kind: "BASEBOARD_OR_TRIM" as const, imageId: "frame-0", confidence: 0.98, box: { x: 0.1, y: 0.84, width: 0.8, height: 0.05 } },
      { id: "doorway", kind: "DOORWAY" as const, imageId: "frame-1", confidence: 0.98, box: { x: 0.3, y: 0.18, width: 0.4, height: 0.7 } },
      { id: "door-left", kind: "DOOR_SIDE_CASING" as const, imageId: "frame-1", confidence: 0.97, box: { x: 0.28, y: 0.18, width: 0.04, height: 0.7 } },
      { id: "door-top", kind: "DOOR_TOP_CASING" as const, imageId: "frame-1", confidence: 0.97, box: { x: 0.28, y: 0.16, width: 0.46, height: 0.05 } },
      { id: "door-right", kind: "DOOR_SIDE_CASING" as const, imageId: "frame-1", confidence: 0.97, box: { x: 0.72, y: 0.18, width: 0.04, height: 0.7 } },
      { id: "base-b", kind: "BASEBOARD_OR_TRIM" as const, imageId: "frame-2", confidence: 0.98, box: { x: 0.08, y: 0.84, width: 0.8, height: 0.05 } },
      { id: "destination-object", kind: "DESTINATION_MARKER" as const, imageId: "frame-2", confidence: 0.99, box: { x: 0.78, y: 0.52, width: 0.1, height: 0.16 }, pointId: "destination" },
    ],
    segmentObservations: [
      { segmentId: "seg-a", imageId: "frame-1", objectIds: ["doorway", "door-left", "door-top", "door-right"], confidence: 0.96 },
    ],
    doorwayGroups: [{ id: "door-group", doorwayObjectId: "doorway", leftCasingObjectId: "door-left", topCasingObjectId: "door-top", rightCasingObjectId: "door-right", entrySide }],
  };
}

const validProvider: RouteAssistVisibleSceneProviderV1 = {
  providerKey: "fixture.semantic-cv",
  async analyze() { return semantics("LEFT"); },
};

async function main() {
  console.log("\nROUTE ASSIST VISIBLE SCENE PROVIDER PIPELINE\n");
  const input = { version: 1 as const, mode: "SURFACE" as const, destinationType: "RECEPTACLE" as const, points, segments };
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff, provider: validProvider, providerInput: input });
  check("valid provider semantics reach review proposal", result.proposal?.status === "REVIEW_REQUIRED", JSON.stringify(result.problems));
  check("valid provider semantics reach frame-local overlay", Boolean(result.overlay && result.overlay.paths.length >= 1), JSON.stringify(result));
  check("provider receives ordered capture identities only", result.semantics?.captureImageIds.join(",") === "frame-0,frame-1,frame-2");
  check("semantic pipeline creates no route measurements", !("lengthFt" in (result.semantics?.objects[0] ?? {})) && !("measuredLengthFt" in (result.proposal ?? {})));
  check("semantic pipeline keeps source anchored to existing graph point", result.semantics?.objects.find((o) => o.kind === "SOURCE_RECEPTACLE")?.pointId === "source");
  check("doorway traversal uses explicit physical side identity", result.proposal?.trimBoundaries.join(",").includes("DOOR_CASING_LEFT,DOOR_CASING_TOP,DOOR_CASING_RIGHT") === true);

  const unresolvedProvider: RouteAssistVisibleSceneProviderV1 = { providerKey: "fixture.unresolved-door", async analyze() { return semantics("UNRESOLVED"); } };
  const unresolved = await preparePersistedSweepForVisibleSceneReviewV1({ handoff, provider: unresolvedProvider, providerInput: input });
  check("unresolved doorway entry side fails closed", unresolved.proposal?.status === "INSUFFICIENT_VISIBLE_EVIDENCE" && unresolved.overlay === null && unresolved.problems.some((p) => p.includes("entry side")));

  const badOrder = { ...handoff, captureArtifacts: { imageIds: ["frame-1", "frame-0", "frame-2"], overlayImageIds: [] } };
  const orderFailure = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: badOrder, provider: validProvider, providerInput: input });
  check("mismatched persisted sweep order fails before provider review", orderFailure.overlay === null && orderFailure.problems.some((p) => p.includes("order or identity")));

  const badProvider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "fixture.bad-cv",
    async analyze() { return { version: 1, captureImageIds: ["unknown-frame"], objects: [], segmentObservations: [] }; },
  };
  const badResult = await preparePersistedSweepForVisibleSceneReviewV1({ handoff, provider: badProvider, providerInput: input });
  check("provider cannot introduce unknown capture identity", badResult.semantics === null && badResult.problems.some((p) => p.includes("capture order")));

  const mutationProvider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "fixture.mutation-check",
    async analyze(providerInput) {
      (providerInput.points[0] as RoutePoint).id = "mutated";
      return { version: 1, captureImageIds: [...providerInput.captureArtifacts.imageIds], objects: [], segmentObservations: [] };
    },
  };
  await preparePersistedSweepForVisibleSceneReviewV1({ handoff, provider: mutationProvider, providerInput: input });
  check("provider cannot mutate authoritative Route Assist graph", points[0].id === "source");

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
