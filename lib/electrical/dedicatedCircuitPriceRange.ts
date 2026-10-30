import { routeSectionsAnswerKey } from "./mixedRouteSections";

export const DEDICATED_PRICE_RANGE_KEY = "dedicated_price_range";
export const DEDICATED_PRICE_RANGE_VALUE = "open_to_finished";

/**
 * Price the same measured geometry twice. Only the horizontal access method
 * changes; equipment, distance, garage conduit and vertical floor work stay
 * identical so the two endpoints are an honest comparison.
 */
export function dedicatedCircuitPriceRangeAnswers(
  answers: Record<string, string>,
): { low: Record<string, string>; high: Record<string, string> } {
  const shared: Record<string, string> = { ...answers };
  delete shared[routeSectionsAnswerKey("dedicated_distance")];
  delete shared.dedicated_distance_doorway;

  return {
    low: { ...shared, dedicated_route_access: "accessible" },
    high: { ...shared, dedicated_route_access: "finished" },
  };
}

export function requestsDedicatedCircuitPriceRange(
  answers: Record<string, string | null | undefined>,
): boolean {
  return answers[DEDICATED_PRICE_RANGE_KEY] === DEDICATED_PRICE_RANGE_VALUE;
}
