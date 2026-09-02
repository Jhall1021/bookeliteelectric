/**
 * Where a service PROMISES WORK, and whether it says so honestly.
 *
 * THE DEFECT THIS EXISTS TO CLOSE
 *
 * Three HVAC tune-ups were authored promising work at both the indoor and the
 * outdoor equipment — an air conditioner tune-up cleans the condenser coil AND
 * flushes the condensate drain at the air handler — while declaring
 * `locationScope: "OUTDOOR"`. They shipped as fixed-price, and the pricing
 * engine accepted them, because nothing cross-checked the declaration against
 * the promise.
 *
 * The consequence is a price quoted against a location nobody classified: a
 * homeowner with an attic air handler over a finished ceiling is asked only
 * where the outdoor unit sits, gets ACCESSIBLE, and is quoted a fixed price for
 * a visit that includes work through an attic hatch.
 *
 * NOT the same failure as duplicate access writers, and deliberately a separate
 * invariant:
 *
 *   one_access_writer_per_slot          prevents RUNTIME AMBIGUITY — two
 *                                       answers claiming one scoped fact.
 *   location_scope_matches_promised_work prevents an AUTHOR from understating
 *                                       where the service works at all.
 *
 * The second is needed whether or not scoped access exists. Declaring where you
 * promise work is independent of whether the platform can classify access at
 * each location, which is why this module holds no slot logic beyond the one
 * bridge function at the bottom.
 *
 * WHY THIS IS SHARED CODE AND NOT AN HVAC FILE
 *
 * `lib/hvac` does not exist yet. The invariant is proved today against
 * standalone fixtures that reproduce the exact tune-up defect; when the
 * canonical HVAC catalog is built it consumes THIS function rather than
 * reimplementing it, so the fixture proof and the catalog proof cannot drift
 * apart. Two implementations of one invariant is one implementation that goes
 * stale, and the one that goes stale is the one nobody is watching.
 *
 * THREE THINGS THAT ARE NOT THE SAME, AND MUST NOT BE COLLAPSED
 *
 *   identity / evidence      a nameplate, a model number, an equipment type.
 *                            Rides on the job sheet. Prices nothing, and does
 *                            NOT imply the service works at that equipment.
 *   promised physical work   what the service says it will DO, and where.
 *                            This is what `locationScope` must cover.
 *   access classification    how hard that location is to reach. A scope fact
 *                            that gates, per slot.
 *
 * A service may legitimately ask an equipment-identity question about equipment
 * it never touches — an air conditioner replacement captures indoor coil
 * identity as evidence. So promised work is NEVER inferred from the questions a
 * service asks; it is read only from what the service declares it performs.
 */

import { PRIMARY_SLOT, type AccessSlot } from "./accessSlots";

/** A physical location at which work is performed. */
export type WorkLocation = "INDOOR" | "OUTDOOR";

/**
 * What a service declares about where it works.
 *
 * Deliberately not a set: a declaration is a single authored value that a
 * verifier can compare against the promise, and "BOTH" reads as a decision
 * somebody made rather than a collection somebody accumulated.
 */
export type LocationScope = "INDOOR" | "OUTDOOR" | "BOTH";

/**
 * One promised item of a maintenance visit, and WHERE it happens.
 *
 * Structured rather than prose, and that is the whole reason the invariant is
 * checkable. "A defined seasonal inspection, clean and test — including
 * clearing the condensate drain" is a true sentence in which the one word that
 * matters (the drain is INDOORS) is invisible to any machine.
 *
 * `at` is what a technician physically stands in front of to perform the item.
 */
export type MaintenanceScopeItem = {
  /** Customer-facing description of what is included. */
  item: string;
  at: WorkLocation;
};

/**
 * The shape this invariant reads. Structural on purpose.
 *
 * A canonical service carries far more than this, and nothing here should need
 * to know about the rest of it. `lib/hvac`'s own service type satisfies this
 * shape without importing anything from here beyond the types.
 */
export type LocationScopedService = {
  key: string;
  locationScope: LocationScope;
  /**
   * Present on maintenance services. Absent means the service makes no
   * itemized promise about what a visit includes — which is legitimate for,
   * say, an equipment replacement, and is not evidence that it works in one
   * place.
   */
  maintenanceScope?: readonly MaintenanceScopeItem[];
  /**
   * Locations where the service performs work that is NOT itemized in a
   * maintenance scope.
   *
   * For a replacement or an installation there is no per-item list, but the
   * service still physically works somewhere. Declared rather than inferred,
   * for the reason in the header: the questions a service asks are not
   * evidence of where it works.
   */
  performsWorkAt?: readonly WorkLocation[];
};

/** The locations a declared scope covers. */
export function locationsCovered(scope: LocationScope): WorkLocation[] {
  return scope === "BOTH" ? ["INDOOR", "OUTDOOR"] : [scope];
}

/**
 * Every location at which the service promises work.
 *
 * The union of its itemized maintenance promises and any additional declared
 * work locations. Order is stable — INDOOR before OUTDOOR — so a failure
 * message reads the same every run.
 */
export function promisedLocations(svc: LocationScopedService): WorkLocation[] {
  const found = new Set<WorkLocation>();
  for (const item of svc.maintenanceScope ?? []) found.add(item.at);
  for (const loc of svc.performsWorkAt ?? []) found.add(loc);
  const ordered: WorkLocation[] = ["INDOOR", "OUTDOOR"];
  return ordered.filter((l) => found.has(l));
}

export type LocationScopeProblem = {
  code: "PROMISED_WORK_OUTSIDE_DECLARED_SCOPE" | "DECLARED_SCOPE_PROMISES_NOTHING";
  message: string;
};

/**
 * `location_scope_matches_promised_work`.
 *
 * > A service's declared location scope must cover EVERY physical location at
 * > which it promises work. A narrower declaration fails verification.
 *
 * Asymmetric on purpose. Declaring BOTH while promising work only indoors is
 * over-declaration: it costs the service its fixed-price eligibility under G1
 * and misleads nobody, so it is reported only in the degenerate case where the
 * service promises no work at all. Declaring OUTDOOR while promising indoor
 * work is the failure that shipped, and it is refused.
 */
export function locationScopeProblems(
  svc: LocationScopedService
): LocationScopeProblem[] {
  const problems: LocationScopeProblem[] = [];
  const promised = promisedLocations(svc);
  const covered = locationsCovered(svc.locationScope);

  const uncovered = promised.filter((l) => !covered.includes(l));
  if (uncovered.length > 0) {
    problems.push({
      code: "PROMISED_WORK_OUTSIDE_DECLARED_SCOPE",
      message:
        `${svc.key} declares locationScope ${svc.locationScope} but promises work at ` +
        `${uncovered.join(" and ")}. Every location where a service promises work must ` +
        `be covered by its declared scope.`,
    });
  }

  // A service that declares a scope and promises nothing anywhere has an
  // unfalsifiable declaration. Reported so the invariant cannot be satisfied by
  // omitting the promise instead of correcting the scope.
  if (promised.length === 0 && (svc.maintenanceScope !== undefined || svc.performsWorkAt !== undefined)) {
    problems.push({
      code: "DECLARED_SCOPE_PROMISES_NOTHING",
      message:
        `${svc.key} declares a maintenance or work scope that names no location. ` +
        `An empty promise cannot be checked against a declaration.`,
    });
  }

  return problems;
}

/** True when the service's declaration honestly covers what it promises. */
export function locationScopeIsHonest(svc: LocationScopedService): boolean {
  return locationScopeProblems(svc).length === 0;
}

/**
 * THE ONE BRIDGE to scoped access.
 *
 * Which access slots a service must be able to establish, given where it
 * promises work. Separate from the invariant above because the invariant holds
 * with or without G1 — this function is what connects an honest declaration to
 * the slots the flow has to write.
 *
 * A single-location service maps to its own equipment slot rather than to
 * PRIMARY. PRIMARY means "the route to the work" for catalogs authored before
 * locations were distinguishable; a service that knows which location it works
 * at should say so, and `PRIMARY_SLOT` is exported here only so callers that
 * legitimately have no location distinction have one name for it.
 */
export function requiredAccessSlots(scope: LocationScope): AccessSlot[] {
  switch (scope) {
    case "INDOOR":
      return ["INDOOR_EQUIPMENT"];
    case "OUTDOOR":
      return ["OUTDOOR_EQUIPMENT"];
    case "BOTH":
      return ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"];
  }
}

export { PRIMARY_SLOT };
