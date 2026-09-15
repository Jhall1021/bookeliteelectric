export type RouteAssistReviewCorrectionKindV1 =
  | "ROUTE_SHOULD_PASS_HERE"
  | "ROUTE_SHOULD_AVOID_HERE"
  | "SOURCE_ANCHOR_WRONG"
  | "DESTINATION_ANCHOR_WRONG"
  | "OTHER";

export type RouteAssistReviewCorrectionV1 = {
  correctionId: string;
  imageId: string;
  kind: RouteAssistReviewCorrectionKindV1;
  /** Normalized image-space review intent only; never accepted route geometry. */
  point: { x: number; y: number };
  createdAt: string;
};

function unit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateRouteAssistReviewCorrectionsV1(args: {
  corrections: readonly RouteAssistReviewCorrectionV1[];
  captureImageIds: readonly string[];
}): string[] {
  const problems: string[] = [];
  const imageIds = new Set(args.captureImageIds);
  const ids = new Set<string>();
  let priorTime = -Infinity;

  for (const correction of args.corrections) {
    const time = Date.parse(correction.createdAt);
    if (!correction.correctionId || ids.has(correction.correctionId)) problems.push(`duplicate or empty correctionId: ${correction.correctionId || "<empty>"}`);
    ids.add(correction.correctionId);
    if (!imageIds.has(correction.imageId)) problems.push(`correction ${correction.correctionId} references unknown image ${correction.imageId}`);
    if (!unit(correction.point.x) || !unit(correction.point.y)) problems.push(`correction ${correction.correctionId} has invalid normalized point`);
    if (!Number.isFinite(time)) problems.push(`correction ${correction.correctionId} has invalid createdAt`);
    if (time < priorTime) problems.push(`correction ${correction.correctionId} is out of chronological order`);
    priorTime = Math.max(priorTime, time);
  }
  return problems;
}
