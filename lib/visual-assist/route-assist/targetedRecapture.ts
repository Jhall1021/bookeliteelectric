import type {
  RouteAssistCaptureImagePersisterV1,
  RouteAssistLocalReviewFrameV1,
  RouteAssistPersistedCaptureImageV1,
} from "./captureHandoff";
import type { RouteAssistRecaptureIssueV1 } from "./recaptureIssue";

export type RouteAssistTargetedRecaptureFocusV1 =
  | "SOURCE"
  | "DESTINATION"
  | "DOORWAY"
  | "VISIBLE_ROUTE_CONTEXT";

export type RouteAssistRecapturePlanV1 =
  | {
      version: 1;
      mode: "FULL_SWEEP";
      focus: null;
      preserveOriginalImageIds: string[];
      targetImageIds: string[];
      requiresFreshProviderReview: true;
    }
  | {
      version: 1;
      mode: "TARGETED_SUPPLEMENT";
      focus: RouteAssistTargetedRecaptureFocusV1;
      preserveOriginalImageIds: string[];
      /** Existing images associated with the deficiency; context only, never replacement instructions. */
      targetImageIds: string[];
      requiresFreshProviderReview: true;
    };

/**
 * Convert a structured recapture issue into capture intent only.
 *
 * Targeted supplemental captures never replace, reorder, or reinterpret the
 * original ordered sweep. They are additional evidence for a fresh provider
 * review. Structural capture failures require a new full sweep because the
 * primary evidence set itself is not trustworthy enough to preserve.
 */
export function planRouteAssistRecaptureV1(args: {
  issue: RouteAssistRecaptureIssueV1;
  originalImageIds: readonly string[];
}): RouteAssistRecapturePlanV1 {
  const original = [...args.originalImageIds];

  if (args.issue.source === "STRUCTURAL_CAPTURE") {
    return {
      version: 1,
      mode: "FULL_SWEEP",
      focus: null,
      preserveOriginalImageIds: [],
      targetImageIds: [...args.issue.imageIds],
      requiresFreshProviderReview: true,
    };
  }

  const focus: RouteAssistTargetedRecaptureFocusV1 =
    args.issue.code === "SOURCE_NOT_CLEAR"
      ? "SOURCE"
      : args.issue.code === "DESTINATION_NOT_CLEAR"
        ? "DESTINATION"
        : args.issue.code === "DOORWAY_CONTEXT_INCOMPLETE"
          ? "DOORWAY"
          : "VISIBLE_ROUTE_CONTEXT";

  return {
    version: 1,
    mode: "TARGETED_SUPPLEMENT",
    focus,
    preserveOriginalImageIds: original,
    targetImageIds: [...args.issue.imageIds],
    requiresFreshProviderReview: true,
  };
}

export type RouteAssistSupplementalCaptureSetV1 = {
  version: 1;
  requestId: string;
  focus: RouteAssistTargetedRecaptureFocusV1;
  /** Original primary sweep remains authoritative for order/provenance. */
  primarySweepImageIds: string[];
  /** Newly captured supplemental images. They have no implied adjacency to the primary sweep or each other. */
  supplementalImageIds: string[];
};

export type RouteAssistPersistedSupplementalCaptureV1 = {
  version: 1;
  captureSet: RouteAssistSupplementalCaptureSetV1;
  persistedImages: RouteAssistPersistedCaptureImageV1[];
};

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.length > 0 && new Set(values).size === values.length && values.every((value) => value.length > 0);
}

/**
 * Bind completed supplemental media to the request without merging it into the
 * original sweep ordering. Fails closed on duplicate/colliding identities.
 */
export function buildRouteAssistSupplementalCaptureSetV1(args: {
  requestId: string;
  plan: RouteAssistRecapturePlanV1;
  supplementalImageIds: readonly string[];
}): RouteAssistSupplementalCaptureSetV1 | null {
  if (args.plan.mode !== "TARGETED_SUPPLEMENT") return null;
  if (!args.requestId || args.requestId.length > 100) return null;
  if (!uniqueNonEmpty(args.plan.preserveOriginalImageIds) || !uniqueNonEmpty(args.supplementalImageIds)) return null;
  const primary = new Set(args.plan.preserveOriginalImageIds);
  if (args.supplementalImageIds.some((id) => primary.has(id))) return null;

  return {
    version: 1,
    requestId: args.requestId,
    focus: args.plan.focus,
    primarySweepImageIds: [...args.plan.preserveOriginalImageIds],
    supplementalImageIds: [...args.supplementalImageIds],
  };
}

function persistedMatchesLocal(frame: RouteAssistLocalReviewFrameV1, persisted: RouteAssistPersistedCaptureImageV1): boolean {
  return Boolean(
    persisted.imageId === frame.imageId &&
    persisted.imageUrl &&
    persisted.mimeType === frame.mimeType &&
    persisted.width === frame.width &&
    persisted.height === frame.height &&
    Number.isFinite(persisted.width) && persisted.width > 0 &&
    Number.isFinite(persisted.height) && persisted.height > 0
  );
}

/**
 * Persist focused supplemental photos and bind their durable identities to a
 * targeted recapture request. This adapter moves media only; it does not merge
 * the photos into sweep order or create any physical route fact.
 */
export async function persistRouteAssistTargetedSupplementV1(args: {
  requestId: string;
  plan: RouteAssistRecapturePlanV1;
  frames: readonly RouteAssistLocalReviewFrameV1[];
  persister: RouteAssistCaptureImagePersisterV1;
}): Promise<RouteAssistPersistedSupplementalCaptureV1 | null> {
  if (args.plan.mode !== "TARGETED_SUPPLEMENT" || !args.frames.length) return null;
  const frameIds = args.frames.map((frame) => frame.imageId);
  if (!uniqueNonEmpty(frameIds)) return null;
  const primary = new Set(args.plan.preserveOriginalImageIds);
  if (frameIds.some((id) => primary.has(id))) return null;

  const persistedImages: RouteAssistPersistedCaptureImageV1[] = [];
  for (const frame of args.frames) {
    let persisted: RouteAssistPersistedCaptureImageV1;
    try { persisted = await args.persister.persist({ ...frame }); }
    catch { return null; }
    if (!persistedMatchesLocal(frame, persisted)) return null;
    persistedImages.push({ ...persisted });
  }

  const captureSet = buildRouteAssistSupplementalCaptureSetV1({
    requestId: args.requestId,
    plan: args.plan,
    supplementalImageIds: persistedImages.map((image) => image.imageId),
  });
  if (!captureSet) return null;

  return { version: 1, captureSet, persistedImages };
}
