/**
 * `maintenanceScope` — HVAC's one metadata addition, approved. H2.
 *
 * NOT A PRIMITIVE AND NOT A MECHANISM. A fifth declaration alongside
 * Plumbing's four (`permit`, `photo`, `preWork`, `visit` —
 * lib/plumbing/metadata.ts). It carries the canonical list of what a
 * maintenance visit includes, so §21's separation — what the visit
 * PROMISES versus what it might DISCOVER — is a property of the data
 * instead of living in `shortDescription`, which is customer copy nobody
 * verifies.
 *
 * Its complement already exists on the platform and needs no new
 * mechanism: a discovery is `PreWorkScopeState.OUT_OF_SCOPE_REVIEW` applied
 * to a service visit — a conversation, never a reprice.
 *
 * WHY EACH ITEM CARRIES `at` — THE G1 RE-AUDIT'S OWN FIX
 *
 * Prose ("cleans the coil, checks the drain") is exactly what let three
 * tune-ups declare a narrower `locationScope` than the work they promised —
 * nothing could check a sentence. A structured `at: "INDOOR" | "OUTDOOR"`
 * per item is what lets `location_scope_matches_promised_work` (a future
 * H3 verifier, not built here) compare a service's declared scope against
 * its promised work mechanically instead of trusting the sentence.
 *
 * NOT POPULATED PER SERVICE IN H2. No service tree existed yet to populate a
 * real `maintenanceScope` array against — doing so then would have meant
 * inventing the four tune-ups' actual scope items ahead of the slice that
 * builds their trees. This file declared the SHAPE the review already
 * approved; H6 is that slice — `HVAC_MAINTENANCE_SCOPE`, below, is the
 * canonical review's own Part 6.2 table, verbatim, structured per item.
 */

export type MaintenanceScopeLocation = "INDOOR" | "OUTDOOR";

export type MaintenanceScopeItem = {
  /** What the visit does, in the customer's own terms — never a diagnosis. */
  item: string;
  /** Where the item is performed. Structured, not prose — see the header. */
  at: MaintenanceScopeLocation;
};

/** Every location an item in a scope actually touches, deduplicated. */
export function maintenanceScopeLocations(
  scope: readonly MaintenanceScopeItem[]
): readonly MaintenanceScopeLocation[] {
  const seen = new Set<MaintenanceScopeLocation>();
  for (const item of scope) seen.add(item.at);
  return [...seen].sort();
}

/**
 * Whether a scope's own locations are covered by a declared locationScope.
 *
 * Pure and total: given `["INDOOR", "OUTDOOR"]` from the scope and a
 * declared `"INDOOR"`, this returns false — a narrower declaration than the
 * promised work. This is the check the G1 re-audit named
 * (`location_scope_matches_promised_work`); it is exercised here as a pure
 * function so H3 can call it once real scope data exists, without this file
 * needing to know what a service or a tree is.
 */
export function maintenanceScopeMatchesDeclaredLocations(
  scope: readonly MaintenanceScopeItem[],
  declared: "INDOOR" | "OUTDOOR" | "BOTH"
): boolean {
  const locations = maintenanceScopeLocations(scope);
  if (declared === "BOTH") return true;
  return locations.every((l) => l === declared);
}

/**
 * H6. The four tune-ups' real `maintenanceScope` — catalog review Part
 * 6.2's own table, item for item, each carrying `at` per the G1 re-audit's
 * own fix. PROMISE-ONLY DATA: what the visit performs, never a diagnosis,
 * never a condition, never a repair. "Clear the condensate drain" is
 * routine included maintenance, not evidence that a blockage was found —
 * the same distinction condensate-pump-installation's own H3 resolver
 * already draws between explicit known work and a symptom report.
 *
 * ac-tune-up and heat-pump-tune-up share their outdoor/indoor core items
 * (Part 6.2: "All of the above, plus..." for the heat pump) — written out
 * in full for each rather than composed from a shared array, so this stays
 * data a reviewer can read against the source table directly, item by
 * item, with nothing assembled at read time.
 *
 * Keyed exactly like `HVAC_SERVICE_FAMILIES` and `HVAC_SERVICE_ACCESS_SLOTS`
 * — a plain service-key map, not a new declaration shape.
 */
export const HVAC_MAINTENANCE_SCOPE: Readonly<Record<string, readonly MaintenanceScopeItem[]>> = {
  "ac-tune-up": [
    { item: "Clean the condenser coil", at: "OUTDOOR" },
    { item: "Clear debris from around the outdoor unit", at: "OUTDOOR" },
    { item: "Check the contactor", at: "OUTDOOR" },
    { item: "Check the capacitor", at: "OUTDOOR" },
    { item: "Check the disconnect", at: "OUTDOOR" },
    { item: "Check the fan motor", at: "OUTDOOR" },
    { item: "Verify operating pressures", at: "OUTDOOR" },
    { item: "Check the filter", at: "INDOOR" },
    { item: "Check the blower", at: "INDOOR" },
    { item: "Check the evaporator coil", at: "INDOOR" },
    { item: "Verify thermostat operation", at: "INDOOR" },
    { item: "Check the temperature split", at: "INDOOR" },
    { item: "Clear the condensate drain", at: "INDOOR" },
  ],

  "furnace-tune-up": [
    { item: "Check the burners", at: "INDOOR" },
    { item: "Check the heat exchanger", at: "INDOOR" },
    { item: "Check ignition", at: "INDOOR" },
    { item: "Check the blower", at: "INDOOR" },
    { item: "Check the filter", at: "INDOOR" },
    { item: "Check venting", at: "INDOOR" },
    { item: "Check the safety controls", at: "INDOOR" },
  ],

  "heat-pump-tune-up": [
    // The AC outdoor scope, plus defrost and reversing-valve operation.
    { item: "Clean the condenser coil", at: "OUTDOOR" },
    { item: "Clear debris from around the outdoor unit", at: "OUTDOOR" },
    { item: "Check the contactor", at: "OUTDOOR" },
    { item: "Check the capacitor", at: "OUTDOOR" },
    { item: "Check the disconnect", at: "OUTDOOR" },
    { item: "Check the fan motor", at: "OUTDOOR" },
    { item: "Verify operating pressures", at: "OUTDOOR" },
    { item: "Check defrost operation", at: "OUTDOOR" },
    { item: "Check reversing-valve operation in heating mode", at: "OUTDOOR" },
    // The AC indoor scope, plus backup heat at the air handler.
    { item: "Check the filter", at: "INDOOR" },
    { item: "Check the blower", at: "INDOOR" },
    { item: "Check the evaporator coil", at: "INDOOR" },
    { item: "Verify thermostat operation", at: "INDOOR" },
    { item: "Check the temperature split", at: "INDOOR" },
    { item: "Clear the condensate drain", at: "INDOOR" },
    { item: "Check backup heat operation at the air handler", at: "INDOOR" },
  ],

  "mini-split-tune-up": [
    { item: "Check the condenser coil", at: "OUTDOOR" },
    { item: "Check electrical connections", at: "OUTDOOR" },
    { item: "Check mounting", at: "OUTDOOR" },
    // Per included indoor head — quantity is head_count, not a location.
    { item: "Check filters on every included indoor head", at: "INDOOR" },
    { item: "Check the blower wheel on every included indoor head", at: "INDOOR" },
    { item: "Check the drain pan on every included indoor head", at: "INDOOR" },
    { item: "Check the drain line on every included indoor head", at: "INDOOR" },
  ],
} as const;
