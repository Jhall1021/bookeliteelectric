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
 * NOT POPULATED PER SERVICE IN H2. No service tree exists yet to populate a
 * real `maintenanceScope` array against — doing so now would be inventing
 * the four tune-ups' actual scope items ahead of the H3 slice that builds
 * them. This file declares the SHAPE the review already approved; H3 fills
 * it in service by service.
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
