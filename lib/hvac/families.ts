/**
 * Fifteen HVAC question families — H2, corrected.
 *
 * A family is a MANIFEST, not a tree — exactly Plumbing's definition
 * (lib/plumbing/families.ts): which canonical facts a family establishes,
 * which gate consumes them, which of the seven shared primitives it binds.
 * Independently authored: no HVAC business logic is copied from Plumbing,
 * only the organizational shape.
 *
 * DELIBERATELY LIGHTER THAN A PLUMBING FAMILY — H2 IS NOT H3.
 *
 * Plumbing's `PlumbingFamily` requires `questions: readonly FamilyQuestion[]`
 * — the actual homeowner-facing wording, answer options and routeActions,
 * which is the tree. HVAC's `HvacFamily` below has no such field. Writing
 * real questions now, with no service tree composing them, would be
 * exactly the "executable service tree" H2 is scoped not to build. H3
 * composes families into real Question/AnswerOption manifests, family by
 * family, once a first proving slice is chosen.
 *
 * FOURTEEN NAMED IN THE ORIGINAL PACKAGE, FIFTEEN NOW — H2 audit correction.
 * `dedicated_power_availability` was missing: three services' absent/new-
 * installation branches (`condensate-pump-installation`,
 * `whole-house-humidifier`, `duct-air-treatment-installation`) need it, and
 * the original family table never named it because Part 3's per-service
 * summary dropped every branch-only fact. See HVAC_SERVICE_FAMILIES below,
 * where the branch is preserved explicitly rather than folded away.
 */

import type { HvacGateKey } from "./gates";
import type { HvacPrimitiveKey } from "./primitives";
import type { AccessSlot } from "../accessSlots";

export type HvacFamilyKey =
  | "system_identity"
  | "heating_equipment"
  | "cooling_equipment"
  | "indoor_equipment_access"
  | "outdoor_equipment_access"
  | "existing_control"
  | "supply_arrangement"
  | "accessory_and_media"
  | "distribution_and_zoning"
  | "condensate_route"
  | "refrigerant_lineset"
  | "run_distance"
  | "existing_condition"
  | "finish_disruption_ack"
  | "dedicated_power_availability"
  | "indoor_unit_form"
  | "water_supply_availability";

export type HvacFamily = {
  key: HvacFamilyKey;
  title: string;
  /** Why this family exists as a family, in one sentence. */
  purpose: string;
  /** The canonical facts this family establishes, in §E's own names. */
  establishes: readonly string[];
  /** Gate(s) that consume what this family establishes. Often none. */
  gates: readonly HvacGateKey[];
  /** Shared primitives this family binds, if any. */
  primitives: readonly HvacPrimitiveKey[];
};

export const HVAC_FAMILIES: readonly HvacFamily[] = [
  {
    key: "system_identity",
    title: "What kind of system is it",
    purpose: "Asked first on nearly every service — the root fact everything else is read against.",
    establishes: ["system_type"],
    gates: ["identity_gate"],
    primitives: [],
  },
  {
    key: "heating_equipment",
    title: "The heating appliance",
    purpose:
      "Three questions, one family — fuel, venting and heating input are all read off the same appliance in the same photograph, the reasoning Plumbing used to pair venting with capacity.",
    establishes: ["fuel_type", "venting_class", "heating_input_btu"],
    gates: ["fuel_gate", "venting_gate", "capacity_gate"],
    primitives: [],
  },
  {
    key: "cooling_equipment",
    title: "The cooling appliance",
    purpose: "The outdoor half of the identity pair — cooling capacity, read off the outdoor unit's nameplate.",
    establishes: ["cooling_tons"],
    gates: ["capacity_gate"],
    primitives: [],
  },
  {
    key: "indoor_equipment_access",
    title: "Route to the indoor equipment",
    purpose:
      "Whether there is an open path to the indoor equipment. Mutually exclusive with outdoor_equipment_access — each writes its own G1 slot and neither can overwrite the other.",
    establishes: ["indoor_location", "access_class"],
    gates: ["access_gate"],
    primitives: ["access_classification"],
  },
  {
    key: "outdoor_equipment_access",
    title: "Route to the outdoor equipment",
    purpose:
      "Whether there is an open path to the outdoor equipment. Mutually exclusive with indoor_equipment_access, for the same G1 reason.",
    establishes: ["outdoor_location", "access_class"],
    gates: ["access_gate"],
    primitives: ["access_classification"],
  },
  {
    key: "existing_control",
    title: "The existing thermostat or control",
    purpose: "The highest-volume family in the catalog. control_present, terminal_scheme, conductor_count and common_wire are read off one photograph of the sub-base.",
    // H4: terminal_scheme added — what's printed on the plate (standard
    // lettered vs. manufacturer-specific), the safety check for a
    // proprietary or communicating control, asked before common_wire since
    // "is there a C wire" presumes a lettered scheme in the first place.
    // conductor_count stays declared: a real, valid observable fact for a
    // future compatibility refinement, but the V1 tree does not render it
    // as a live question — see lib/hvac/scope.ts's thermostat resolver.
    establishes: ["control_present", "terminal_scheme", "conductor_count", "common_wire", "thermostat_count"],
    gates: ["control_gate"],
    primitives: [],
  },
  {
    key: "supply_arrangement",
    title: "Who supplies the equipment",
    purpose:
      "Policy-keyed, and decisive more often than in Plumbing — a homeowner-bought smart thermostat is the commonest customer-supplied item in any residential trade. Equipment, accessories and thermostats are three SEPARATE policies (Q5), never one overloaded answer.",
    establishes: ["supply_arrangement"],
    gates: [],
    primitives: ["supply_arrangement"],
  },
  {
    key: "accessory_and_media",
    title: "The accessory or media device",
    purpose:
      "One family because accessory presence, whether it's a replacement or a new fit, and the filter/media size are all read off the same cabinet in the same look.",
    // H7: accessory_kind added — HUMIDIFIER | AIR_CLEANER | UV_TREATMENT |
    // UNKNOWN, which existing accessory contains the consumable being
    // replaced. Deliberately separate from accessory_present, which stays
    // about PRESENCE (is one there) — accessory_kind is a different
    // observation (which one), needed only by accessory-consumable-
    // replacement, the one merged service without its own accessory_and_media-
    // declared service to read presence against. Not rendered by any other
    // accessory_and_media-declared service; each renders only what it needs
    // (lib/hvac/scope.ts's own per-service resolvers).
    //
    // H8: humidifier_type added — BYPASS | FAN_POWERED | STEAM | UNKNOWN,
    // read directly off the unit (a bypass humidifier has no visible
    // fan/motor, a fan-powered one does, a steam one has a distinct
    // canister/electrode assembly) — never inferred from a manufacturer or
    // model string. Needed only by whole-house-humidifier; no other
    // accessory_and_media-declared service renders it.
    establishes: ["accessory_present", "accessory_kind", "humidifier_type", "replacement_vs_new", "filter_slot_size"],
    gates: [],
    primitives: [],
  },
  {
    key: "distribution_and_zoning",
    title: "Zones and indoor units",
    purpose: "Quantities, not capacity — how many heads or zones, never how big any one of them is.",
    establishes: ["zone_count", "head_count"],
    gates: [],
    primitives: [],
  },
  {
    key: "condensate_route",
    title: "Where condensate goes",
    purpose: "Cross-cutting: condensing furnaces, cooling coils and mini-splits all produce water, and this is asked once regardless of which produces it here.",
    establishes: ["condensate_route"],
    gates: [],
    primitives: [],
  },
  {
    key: "refrigerant_lineset",
    title: "The refrigerant line set",
    purpose:
      "Presence and path ONLY (Q7, locked) — never size, age or reusability. A homeowner can see whether an insulated pair of copper lines exists and roughly where it runs; whether it may be reused is a contractor determination, never inferred here.",
    establishes: ["lineset_status"],
    gates: [],
    primitives: [],
  },
  {
    key: "run_distance",
    title: "How far a run travels",
    purpose: "Policy-keyed — line set, control wire, condensate, or relocation distance. The template holds the question and the band shape; the boundary numbers are the contractor's.",
    establishes: ["run_band"],
    gates: [],
    primitives: ["band_policy"],
  },
  {
    key: "existing_condition",
    title: "The condition of the existing installation",
    purpose:
      "EFFECT-FREE, copied in shape from Plumbing. An observation that can take a job out of automated pricing; it may never select what the job then consumes. See lib/hvac/mappings.ts's EXISTING_CONDITION_SCOPE.",
    establishes: ["equipment_condition"],
    gates: ["condition_gate"],
    primitives: [],
  },
  {
    key: "finish_disruption_ack",
    title: "Fishing a run through finished construction",
    purpose:
      "Conditional disclaimer, copied shape from Plumbing. Confirmed consumer: thermostat-installation's absent/new-location branch — a new control run through finished construction is a fact of the route, not a reason to refuse outright.",
    establishes: ["finish_ack"],
    gates: [],
    primitives: ["conditional_disclaimer"],
  },
  {
    key: "dedicated_power_availability",
    title: "Whether a socket or dedicated circuit is within reach",
    purpose:
      "H2 audit addition. An observable fact — is there a socket within reach of the installation point — not a diagnosis of the circuit's adequacy. Confirmed by the catalog review's own observable-question column for two services, and by the original candidate-level analysis for a third (whole-house-humidifier's absent/new-installation branch, dropped from the summarized family table but never revoked).",
    establishes: ["dedicated_circuit_present"],
    gates: [],
    primitives: [],
  },
  {
    key: "indoor_unit_form",
    title: "The physical form of the indoor mini-split unit",
    purpose:
      "H8 addition. An observable fact — what the unit looks like and where it sits (wall, ceiling, floor, or concealed) — never a diagnosis of capacity, refrigerant configuration, serviceability, manufacturer compatibility, or whether the unit needs cleaning. Deliberately its own narrow family, not folded into distribution_and_zoning: that family stays quantity/zoning-oriented (how many, never what kind), the same distinction capacity_gate's families draw between counting equipment and describing it. Needed only by mini-split-head-cleaning; not added to mini-split-tune-up or any other service merely because it might be useful later.",
    establishes: ["indoor_unit_type"],
    gates: [],
    primitives: [],
  },
  {
    key: "water_supply_availability",
    title: "Whether a water connection is within reach",
    purpose:
      "H8 addition. An observable fact — is there visible existing water tubing or a connection point within reach of the proposed installation — not a diagnosis of whether that connection is adequate, whether tapping it is permitted, or whether pressure is sufficient. The same narrow shape dedicated_power_availability already established for electrical prerequisites, here for water: F.7's own worked example asks this question and its resolution depends on the answer, but no family or fact was ever declared for it — families.ts's own dedicated_power_availability comment already flagged the gap (\"water supply, condensate_route, dedicated_circuit_present, run_band\" was the original candidate-level branch; the water half was dropped from the summary table and never restored). A genuinely independent physical-domain concept — not condensate (drain, a different pipe), not power (electrical), not run_distance (a length policy) — so it is not hidden inside any of them.",
    establishes: ["water_supply_present"],
    gates: [],
    primitives: [],
  },
] as const;

export const HVAC_FAMILY_KEYS: readonly HvacFamilyKey[] = HVAC_FAMILIES.map((f) => f.key);

export function family(key: HvacFamilyKey): HvacFamily {
  const found = HVAC_FAMILIES.find((f) => f.key === key);
  if (!found) throw new Error(`Unknown HVAC family "${key}".`);
  return found;
}

/**
 * Which families a service consumes — H2's service→family declaration.
 *
 * `branch` is present ONLY when a family applies on one path through the
 * service, not the whole thing — preserved explicitly rather than folded
 * into an unconditional list, per the H2 audit correction. A family with no
 * `branch` applies on every reachable path.
 */
export type HvacFamilyUsage = {
  family: HvacFamilyKey;
  /** Present only when this family is branch-conditional. Absent = every path. */
  branch?: string;
};

/**
 * All 22 shipping services, keyed by lib/hvac/catalog.ts's own service keys.
 * scripts/verify-hvac-template.ts cross-checks this set against
 * HVAC_SERVICE_KEYS so the two files cannot silently drift apart.
 */
export const HVAC_SERVICE_FAMILIES: Readonly<Record<string, readonly HvacFamilyUsage[]>> = {
  "thermostat-installation": [
    { family: "system_identity" },
    { family: "existing_control" },
    { family: "supply_arrangement" },
    // H2 correction: the control_present=ABSENT (new thermostat location)
    // branch, merged in from the retired thermostat-new-installation
    // candidate. See F.2's own worked example: "New cable through finished
    // construction is a run whose length and route nobody has established."
    { family: "run_distance", branch: "control_present=ABSENT (new thermostat location)" },
    { family: "finish_disruption_ack", branch: "control_present=ABSENT (new thermostat location)" },
  ],
  "furnace-replacement": [
    { family: "system_identity" },
    { family: "heating_equipment" },
    { family: "indoor_equipment_access" },
    { family: "condensate_route" },
    { family: "supply_arrangement" },
    { family: "existing_condition" },
  ],
  "ac-replacement": [
    { family: "system_identity" },
    { family: "cooling_equipment" },
    // G1 re-audit correction (catalog review §6.6): the indoor coil is
    // worked too. locationScope is BOTH, not OUTDOOR as first declared.
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
    { family: "refrigerant_lineset" },
    { family: "supply_arrangement" },
  ],
  "heat-pump-replacement": [
    { family: "system_identity" },
    { family: "cooling_equipment" },
    // Same G1 correction as ac-replacement — indoor equipment and backup
    // heat are worked.
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
    { family: "refrigerant_lineset" },
    { family: "existing_control" },
  ],
  "whole-system-replacement": [
    { family: "system_identity" },
    { family: "heating_equipment" },
    { family: "cooling_equipment" },
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
    { family: "refrigerant_lineset" },
    { family: "condensate_route" },
    { family: "supply_arrangement" },
  ],
  "condensate-pump-installation": [
    { family: "condensate_route" },
    { family: "indoor_equipment_access" },
    { family: "supply_arrangement" },
    { family: "existing_condition" },
    // H2 correction: the "no pump visible" (first-time installation) branch.
    // Part 7: "First-time installation must also bound the discharge/tubing
    // route; unbounded route -> review." Confirmed live: catalog review
    // Part 5's own question column asks "Is there a socket within reach?".
    { family: "run_distance", branch: "condensate_route=NONE_VISIBLE (first-time installation)" },
    { family: "dedicated_power_availability", branch: "condensate_route=NONE_VISIBLE (first-time installation)" },
  ],
  "condensate-safety-switch-installation": [
    { family: "condensate_route" },
    { family: "indoor_equipment_access" },
  ],
  "condenser-pad-replacement": [
    { family: "outdoor_equipment_access" },
    { family: "existing_condition" },
  ],
  "mini-split-installation": [
    { family: "distribution_and_zoning" },
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
    { family: "run_distance" },
    { family: "refrigerant_lineset" },
    { family: "condensate_route" },
  ],
  "mini-split-head-cleaning": [
    { family: "distribution_and_zoning" },
    { family: "indoor_equipment_access" },
    // H8: the observable physical form of the unit(s) being cleaned — the
    // final applied trade review's own third scope driver, alongside
    // quantity and access.
    { family: "indoor_unit_form" },
  ],
  "whole-house-humidifier": [
    { family: "accessory_and_media" },
    { family: "indoor_equipment_access" },
    { family: "condensate_route" },
    { family: "supply_arrangement" },
    { family: "run_distance" },
    // H2 correction: the accessory_present=ABSENT (first-time installation)
    // branch, merged in from the retired whole-house-humidifier-installation
    // candidate — "+ water supply, condensate_route, dedicated_circuit_
    // present, run_band" over the -replacement base. Dropped from Part 3's
    // summary, never revoked.
    { family: "dedicated_power_availability", branch: "accessory_present=ABSENT (first-time installation)" },
    // H8: the water-supply half of that same original candidate-level
    // branch, restored — the H2 gap families.ts's own comment above has
    // flagged since H2.
    { family: "water_supply_availability", branch: "accessory_present=ABSENT (first-time installation)" },
  ],
  "air-cleaner-cabinet-installation": [
    { family: "accessory_and_media" },
    { family: "indoor_equipment_access" },
    { family: "system_identity" },
    // Rechecked in the H2 audit, no correction: the ELECTRONIC (powered)
    // air cleaner variant that carried dedicated_circuit_present was
    // removed outright at candidate stage (Part 1 §28), not merged in. The
    // passive media-cabinet survivor genuinely needs no power fact.
  ],
  "duct-air-treatment-installation": [
    { family: "accessory_and_media" },
    { family: "indoor_equipment_access" },
    { family: "system_identity" },
    // H2 correction — unconditional, not branch-only. Both retired
    // candidates merged into this service (uv-lamp-installation,
    // duct-mounted-air-purifier-installation) list dedicated_circuit_present
    // unconditionally, and it is confirmed live in the catalog review's own
    // question column: "Is there a socket within reach?" A UV/treatment
    // device is powered whether it is a first fit or a replacement.
    { family: "dedicated_power_availability" },
  ],
  "accessory-consumable-replacement": [
    { family: "accessory_and_media" },
    { family: "indoor_equipment_access" },
    // H2 audit note, deliberately unresolved: Part A's uv-lamp-bulb-
    // replacement (one of three merge sources) lists supply_arrangement;
    // Part 3's consolidated family list for the merged service does not,
    // and nothing in Part 7 restores it. Left exactly at the
    // already-approved declaration, per instruction — flagged for the H3
    // tree to settle, not decided here.
  ],
  "air-filter-replacement": [
    { family: "accessory_and_media" },
  ],
  "vent-cover-replacement": [
    { family: "indoor_equipment_access" },
    // "count" is a quantity, not a family (H2 audit item 2) — not listed
    // here because it establishes no canonical fact a gate or mapping
    // reads; it is a number the tree asks directly.
  ],
  "duct-assessment": [
    { family: "system_identity" },
    { family: "indoor_equipment_access" },
  ],
  "ac-tune-up": [
    { family: "system_identity" },
    // G1 re-audit correction (catalog review §6.6, RESOLVED 2 Sep 2026):
    // truthfully BOTH — condenser coil outside, condensate drain inside.
    // Kept FIXED; the fix was the declaration, not the scope.
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
  ],
  "furnace-tune-up": [
    { family: "system_identity" },
    { family: "heating_equipment" },
    { family: "indoor_equipment_access" },
    // Genuinely single-location — the one tune-up whose original INDOOR
    // declaration was already correct (§6.2's control case).
  ],
  "heat-pump-tune-up": [
    { family: "system_identity" },
    // Same G1 correction as ac-tune-up.
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
  ],
  "mini-split-tune-up": [
    { family: "distribution_and_zoning" },
    // Same G1 correction — indoor heads and outdoor condenser coil both
    // worked.
    { family: "indoor_equipment_access" },
    { family: "outdoor_equipment_access" },
  ],
  "hvac-service-call": [
    { family: "system_identity" },
    { family: "indoor_equipment_access", branch: "equipment concerned is indoor" },
    { family: "outdoor_equipment_access", branch: "equipment concerned is outdoor" },
    // reported_symptom is not a family — it establishes no gated fact and
    // maps to nothing (lib/hvac/mappings.ts's REPORTED_SYMPTOMS). It is
    // structured intake context on the booking, declared there, not here.
  ],
} as const;

/**
 * G1 access-slot declaration — H2, settled decisions applied.
 *
 * Mirrors lib/accessSlots.ts's own words: "most services reference only
 * PRIMARY; an HVAC dual-location tune-up references indoor and outdoor and
 * never PRIMARY." Applied literally, not by convention:
 *
 *   14 ordinary single-location services -> PRIMARY only
 *   7 approved dual-location services    -> INDOOR_EQUIPMENT + OUTDOOR_EQUIPMENT, never PRIMARY
 *   hvac-service-call                    -> PRIMARY (settled; no symptom-driven refinement)
 *
 * scripts/verify-hvac-template.ts checks every one of the 22 keys appears
 * exactly once and that no dual-location service's slot list contains
 * PRIMARY.
 */
export const HVAC_SERVICE_ACCESS_SLOTS: Readonly<Record<string, readonly AccessSlot[]>> = {
  "thermostat-installation": ["PRIMARY"],
  "furnace-replacement": ["PRIMARY"],
  "condensate-pump-installation": ["PRIMARY"],
  "condensate-safety-switch-installation": ["PRIMARY"],
  "condenser-pad-replacement": ["PRIMARY"],
  "whole-house-humidifier": ["PRIMARY"],
  "air-cleaner-cabinet-installation": ["PRIMARY"],
  "duct-air-treatment-installation": ["PRIMARY"],
  "accessory-consumable-replacement": ["PRIMARY"],
  "air-filter-replacement": ["PRIMARY"],
  "vent-cover-replacement": ["PRIMARY"],
  "duct-assessment": ["PRIMARY"],
  "furnace-tune-up": ["PRIMARY"],
  "mini-split-head-cleaning": ["PRIMARY"],
  "hvac-service-call": ["PRIMARY"],

  "whole-system-replacement": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "mini-split-installation": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "ac-replacement": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "heat-pump-replacement": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "ac-tune-up": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "heat-pump-tune-up": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
  "mini-split-tune-up": ["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"],
} as const;
