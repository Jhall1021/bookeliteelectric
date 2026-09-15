import type { RouteAssistDestinationType, RouteAssistMode } from "./taxonomy";
import type { RouteAssistCaptureArtifacts, RoutePoint, RouteSegment } from "./types";
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
  };
}

function semanticsSnapshot(value: RouteAssistVisibleSceneSemanticsV1): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: value.version,
    captureImageIds: [...value.captureImageIds],
    objects: value.objects.map((object) => ({
      ...object,
      box: { ...object.box },
    })),
    segmentObservations: value.segmentObservations.map((observation) => ({
      ...observation,
      objectIds: [...observation.objectIds],
    })),
  };
}

/**
 * Run semantic CV and stop at validated, detached visible-scene observations.
 * No confidence threshold here grants authority; confidence remains evidence.
 */
export async function runRouteAssistVisibleSceneProviderV1(
  provider: RouteAssistVisibleSceneProviderV1,
  input: RouteAssistVisibleSceneProviderInputV1,
): Promise<RouteAssistVisibleSceneProviderRunV1> {
  if (!validProviderKey(provider.providerKey)) {
    return {
      providerKey: provider.providerKey,
      semantics: null,
      problems: ["providerKey must be a short opaque identifier"],
    };
  }

  let providerSemantics: RouteAssistVisibleSceneSemanticsV1;
  try {
    providerSemantics = await provider.analyze(inputSnapshot(input));
  } catch {
    return {
      providerKey: provider.providerKey,
      semantics: null,
      problems: ["visible scene provider failed without producing semantics"],
    };
  }

  let semantics: RouteAssistVisibleSceneSemanticsV1;
  try {
    semantics = semanticsSnapshot(providerSemantics);
  } catch {
    return {
      providerKey: provider.providerKey,
      semantics: null,
      problems: ["visible scene provider returned malformed semantics"],
    };
  }

  const problems = validateRouteAssistVisibleSceneSemanticsV1({
    semantics,
    expectedCaptureImageIds: input.captureArtifacts.imageIds,
    points: input.points,
    segments: input.segments,
  });

  return {
    providerKey: provider.providerKey,
    semantics: problems.length === 0 ? semantics : null,
    problems,
  };
}
