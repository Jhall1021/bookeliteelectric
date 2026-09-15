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

function sameReviewPoint(a: RouteAssistReviewCorrectionV1, b: RouteAssistReviewCorrectionV1): boolean {
  return a.imageId === b.imageId && a.point.x === b.point.x && a.point.y === b.point.y;
}

function opposingRouteIntent(a: RouteAssistReviewCorrectionKindV1, b: RouteAssistReviewCorrectionKindV1): boolean {
  return (
    (a === "ROUTE_SHOULD_PASS_HERE" && b === "ROUTE_SHOULD_AVOID_HERE") ||
    (a === "ROUTE_SHOULD_AVOID_HERE" && b === "ROUTE_SHOULD_PASS_HERE")
  );
}

/**
 * Validate homeowner review corrections as an ordered intent stream.
 *
 * Order is meaningful and preserved, but it is never used as hidden
 * "last-write-wins" conflict resolution. Exact opposite route instructions at
 * the same marked image point fail closed so the homeowner must remove one.
 * This contract remains review intent only; it creates no route geometry,
 * obstacle fact, measurement, material, labor, pricing, or acceptance state.
 */
export function validateRouteAssistReviewCorrectionsV1(args: {
  corrections: readonly RouteAssistReviewCorrectionV1[];
  captureImageIds: readonly string[];
}): string[] {
  const problems: string[] = [];
  const imageIds = new Set(args.captureImageIds);
  const ids = new Set<string>();
  const prior: RouteAssistReviewCorrectionV1[] = [];
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

    const conflict = prior.find((candidate) => sameReviewPoint(candidate, correction) && opposingRouteIntent(candidate.kind, correction.kind));
    if (conflict) problems.push(`corrections ${conflict.correctionId} and ${correction.correctionId} give opposite route guidance at the same review point`);
    prior.push(correction);
  }
  return problems;
}

/** Remove one explicit review instruction without rewriting any remaining IDs or order. */
export function removeRouteAssistReviewCorrectionV1(
  corrections: readonly RouteAssistReviewCorrectionV1[],
  correctionId: string,
): RouteAssistReviewCorrectionV1[] {
  return corrections.filter((correction) => correction.correctionId !== correctionId).map((correction) => ({ ...correction, point: { ...correction.point } }));
}

/** Undo means remove the latest review instruction only; nothing else is reinterpreted. */
export function undoLatestRouteAssistReviewCorrectionV1(
  corrections: readonly RouteAssistReviewCorrectionV1[],
): RouteAssistReviewCorrectionV1[] {
  if (!corrections.length) return [];
  return corrections.slice(0, -1).map((correction) => ({ ...correction, point: { ...correction.point } }));
}
