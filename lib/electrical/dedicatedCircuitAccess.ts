export const DEDICATED_ROUTE_ACCESS_PROMPT =
  "Is there open access along the wiring route?";

export const DEDICATED_ROUTE_ACCESS_HELP =
  "Choose Yes for an attic, unfinished basement, crawl space, removable drop ceiling, or open framing between the electrical panel and the new outlet.";

export const DEDICATED_ROUTE_ACCESS_VALUES = {
  accessible: "accessible",
  finished: "finished",
  unsure: "unsure",
} as const;

const LEGACY_ACCESSIBLE_VALUES = new Set([
  "unfinished_basement",
  "drop_ceiling",
  "accessible_attic",
  "combination",
]);

/** Keeps already-saved answers price-compatible after the storefront is simplified. */
export function isDedicatedCircuitAccessibleRoute(value: string | undefined): boolean {
  return value === DEDICATED_ROUTE_ACCESS_VALUES.accessible
    || LEGACY_ACCESSIBLE_VALUES.has(value ?? "");
}

export function isDedicatedCircuitFinishedRoute(value: string | undefined): boolean {
  return value === DEDICATED_ROUTE_ACCESS_VALUES.finished;
}
