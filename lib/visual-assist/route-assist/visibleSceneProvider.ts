import type { RouteAssistDestinationType, RouteAssistMode } from "./taxonomy";
import type { RouteAssistCaptureArtifacts, RoutePoint, RouteSegment } from "./types";
import {
  validateRouteAssistReviewCorrectionsV1,
  type RouteAssistReviewCorrectionV1,
} from "./routeReviewCorrection";
import type { RouteAssistSupplementalCaptureSetV1 } from "./targetedRecapture";
import {
  validateRouteAssistVisibleSceneSemanticsV1,
  type RouteAssistVisibleSceneSemanticsV1,
} from "./visualSceneSemantics";

/**
 * Provider boundary for ordinary-camera semantic CV.
 *
 * This is deliberately separate from metric/world-geometry scan evidence.
 * A semantic provider may identify visible source/destination anchors, trim,
 * doorways, windows and obstacles in captured images, but it cannot establish
 * footage, physical turns, hidden topology, material quantities, labor, price,
 * or a replacement Route Assist graph.
 */
export type RouteAssistVisibleSceneProviderInputV1 = {
  version: 1;
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
  captureArtifacts: Readonly<RouteAssistCaptureArtifacts>;
  /**
   * Additional targeted recapture evidence. Supplemental images are explicitly
   * not part of captureArtifacts.imageIds and carry no sweep adjacency/order.
   */
  supplementalCaptureSets?: readonly RouteAssistSupplementalCaptureSetV1[];
  /** Review intent only. A provider may use it to revise a proposal, but it is not evidence. */
  reviewCorrections?: readonly RouteAssistReviewCorrectionV1[];
};

export type RouteAssistVisibleSceneProviderV1 = {
  providerKey: string;
  analyze(input: RouteAssistVisibleSceneProviderInputV1): Promise<RouteAssistVisibleSceneSemanticsV1>;
};

export type RouteAssistVisibleSceneProviderRunV1 = {
  providerKey: string;
  semantics: RouteAssistVisibleSceneSemanticsV1 | null;
  problems: string[];
};

function validProviderKey(value: string): boolean {
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validateSupplementalCaptureSetsV1(input: RouteAssistVisibleSceneProviderInputV1): string[] {
  const problems: string[] = [];
  const primaryIds = input.captureArtifacts.imageIds;
  const primarySet = new Set(primaryIds);
  const requestIds = new Set<string>();
  const supplementalIds = new Set<string>();

  for (const set of input.supplementalCaptureSets ?? []) {
    if (!set.requestId || requestIds.has(set.requestId)) problems.push(`supplemental capture set has duplicate or empty requestId: ${set.requestId || "<empty>"}`);
    else requestIds.add(set.requestId);

    if (
      set.primarySweepImageIds.length !== primaryIds.length ||
      set.primarySweepImageIds.some((id, index) => id !== primaryIds[index])
    ) problems.push(`supplemental capture set ${set.requestId || "<empty>"} does not reference the exact primary sweep`);

    if (!set.supplementalImageIds.length) problems.push(`supplemental capture set ${set.requestId || "<empty>"} contains no supplemental images`);
    for (const imageId of set.supplementalImageIds) {
      if (!imageId) problems.push(`supplemental capture set ${set.requestId || "<empty>"} contains an empty image id`);
      else if (primarySet.has(imageId)) problems.push(`supplemental image ${imageId} collides with a primary sweep image`);
      else if (supplementalIds.has(imageId)) problems.push(`supplemental image ${imageId} is reused across recapture sets`);
      else supplementalIds.add(imageId);
    }
  }
  return problems;
}

function supplementalImageIds(input: RouteAssistVisibleSceneProviderInputV1): string[] {
  return (input.supplementalCaptureSets ?? []).flatMap((set) => set.supplementalImageIds);
}

function canonicalSupplementalSets(
  sets: readonly RouteAssistSupplementalCaptureSetV1[] | undefined,
): RouteAssistSupplementalCaptureSetV1[] | undefined {
  if (!sets) return undefined;
  return sets
    .map((set) => ({
      ...set,
      primarySweepImageIds: [...set.primarySweepImageIds],
      // Supplemental evidence membership is meaningful; capture chronology is not.
      supplementalImageIds: [...set.supplementalImageIds].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.requestId.localeCompare(b.requestId));
}

function inputSnapshot(input: RouteAssistVisibleSceneProviderInputV1): RouteAssistVisibleSceneProviderInputV1 {
  return {
    version: 1,
    mode: input.mode,
    destinationType: input.destinationType,
    points: input.points.map((point) => ({ ...point })),
    segments: input.segments.map((segment) => ({ ...segment })),
    captureArtifacts: {
      imageIds: [...input.captureArtifacts.imageIds],
      overlayImageIds: [...input.captureArtifacts.overlayImageIds],
    },
    supplementalCaptureSets: canonicalSupplementalSets(input.supplementalCaptureSets),
    reviewCorrections: input.reviewCorrections?.map((correction) => ({
      ...correction,
      point: { ...correction.point },
    })),
  };
}

function semanticsSnapshot(value: RouteAssistVisibleSceneSemanticsV1): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: value.version,
    captureImageIds: [...value.captureImageIds],
    objects: value.objects.map((object) => ({ ...object, box: { ...object.box } })),
    segmentObservations: value.segmentObservations.map((observation) => ({ ...observation, objectIds: [...observation.objectIds] })),
    doorwayGroups: value.doorwayGroups?.map((group) => ({ ...group })),
    qualityIssues: value.qualityIssues?.map((issue) => ({ ...issue, imageIds: [...issue.imageIds] })),
  };
}

/** Run semantic CV and stop at validated, detached visible-scene observations. */
export async function runRouteAssistVisibleSceneProviderV1(
  provider: RouteAssistVisibleSceneProviderV1,
  input: RouteAssistVisibleSceneProviderInputV1,
): Promise<RouteAssistVisibleSceneProviderRunV1> {
  if (!validProviderKey(provider.providerKey)) return { providerKey: provider.providerKey, semantics: null, problems: ["providerKey must be a short opaque identifier"] };

  const correctionProblems = validateRouteAssistReviewCorrectionsV1({
    corrections: input.reviewCorrections ?? [],
    captureImageIds: input.captureArtifacts.imageIds,
  });
  if (correctionProblems.length) return { providerKey: provider.providerKey, semantics: null, problems: correctionProblems };

  const supplementalProblems = validateSupplementalCaptureSetsV1(input);
  if (supplementalProblems.length) return { providerKey: provider.providerKey, semantics: null, problems: supplementalProblems };

  let providerSemantics: RouteAssistVisibleSceneSemanticsV1;
  try { providerSemantics = await provider.analyze(inputSnapshot(input)); }
  catch { return { providerKey: provider.providerKey, semantics: null, problems: ["visible scene provider failed without producing semantics"] }; }

  let semantics: RouteAssistVisibleSceneSemanticsV1;
  try { semantics = semanticsSnapshot(providerSemantics); }
  catch { return { providerKey: provider.providerKey, semantics: null, problems: ["visible scene provider returned malformed semantics"] }; }

  const problems = validateRouteAssistVisibleSceneSemanticsV1({
    semantics,
    expectedCaptureImageIds: input.captureArtifacts.imageIds,
    authorizedSupplementalImageIds: supplementalImageIds(input),
    points: input.points,
    segments: input.segments,
  });

  return { providerKey: provider.providerKey, semantics: problems.length === 0 ? semantics : null, problems };
}
