/**
 * The sixty-three canonical plumbing services — Plumbing Template V1.
 *
 * AUTHORED, NOT EXTRACTED. The electrical template was pulled out of Elite's
 * live catalog by scripts/extract-template-catalog.ts, with a wording manifest
 * recording every place a human had to decide. There is no plumbing contractor
 * to extract from, so this file is the source of truth instead, and it carries
 * the same burden the extractor did: nothing in it may be one company's way of
 * doing things.
 *
 * WHAT A SERVICE ENTRY IS
 *
 * A NAME, a CATEGORY, a BOOKING TYPE, the FAMILIES of questions it composes,
 * the GATES that can refuse it, the CREDENTIALS the work requires, and four
 * metadata declarations. That is the whole vocabulary. There is no field here
 * for a price, an hour, a material cost, a markup or an allowance, and adding
 * one would be adding contractor economics to a canonical template.
 *
 * WHY THERE ARE ONLY EIGHT QUESTION FAMILIES FOR SIXTY-THREE SERVICES
 *
 * Because the deciding facts repeat. A water heater, a gas dryer connection
 * and a gas line extension all turn on how the appliance vents; a faucet, a
 * toilet and a disposal all turn on whether the stop valve holds. Written per
 * service those questions drift, and the electrical catalog has already paid
 * for that drift once — six access questions in three vocabularies, and a
 * component condition that matched none of them.
 *
 * WHY SO MANY SERVICES ARE REMOTE_QUOTE
 *
 * Because they should be. Anything that breaks ground, opens a wall, or
 * re-pipes a house has a scope nobody can bound from a web form, and a price
 * quoted on one of those is a promise made in ignorance.
 *
 * The platform states the rule as "Uncertain scope = review; known scope =
 * fixed price" (lib/routeResolver.ts). Quoted rather than reworded, because it
 * is the shared vocabulary and paraphrasing it here would fork it — but read
 * the second half as "known scope = the engine prices it", since a
 * TIME_AND_MATERIALS contractor provisions this same template and makes no
 * fixed-price promise at all. It is not a fallback here, it is the answer.
 */

import type { CombustionClass, PlumbingGateKey } from "./gates";
import type { PlumbingFamilyKey } from "./families";
import type { PlumbingMetadata } from "./metadata";
import type { PlumbingRequirementKey } from "./roles";

export type PlumbingCategoryKey =
  | "water-heaters"
  | "toilets"
  | "faucets-fixtures"
  | "sinks-disposals"
  | "drains-sewer"
  | "sump-drainage"
  | "water-supply-piping"
  | "water-treatment"
  | "gas-piping"
  | "appliance-connections"
  | "service-calls";

export type PlumbingCategory = {
  key: PlumbingCategoryKey;
  name: string;
  /** Grouping is presentation and a contractor may override it. */
  defaultNavGroup: string;
};

/**
 * Canonical categories. `name` is the platform default; a contractor renames
 * it for display without creating a new canonical category (ADR-006).
 */
export const PLUMBING_CATEGORIES: readonly PlumbingCategory[] = [
  { key: "water-heaters", name: "Water Heaters", defaultNavGroup: "Equipment" },
  { key: "toilets", name: "Toilets", defaultNavGroup: "Fixtures" },
  { key: "faucets-fixtures", name: "Faucets & Fixtures", defaultNavGroup: "Fixtures" },
  { key: "sinks-disposals", name: "Sinks & Disposals", defaultNavGroup: "Fixtures" },
  { key: "drains-sewer", name: "Drains & Sewer", defaultNavGroup: "Drainage" },
  { key: "sump-drainage", name: "Sump & Ejector Pumps", defaultNavGroup: "Drainage" },
  { key: "water-supply-piping", name: "Water Supply & Piping", defaultNavGroup: "Piping" },
  { key: "water-treatment", name: "Water Treatment", defaultNavGroup: "Equipment" },
  { key: "gas-piping", name: "Gas Piping", defaultNavGroup: "Piping" },
  { key: "appliance-connections", name: "Appliance Connections", defaultNavGroup: "Equipment" },
  { key: "service-calls", name: "Service Calls", defaultNavGroup: "Service Calls" },
] as const;

export type PlumbingBookingType = "INSTANT" | "ADJUSTED" | "REMOTE_QUOTE" | "TROUBLESHOOT_ONLY";

/**
 * ONE ACCESS-ESTABLISHING FAMILY PER SERVICE.
 *
 * `fixture_access` and `drain_route` both answer into the platform's single
 * `accessClassification` slot, and `JobConfiguration.accessClass` holds one
 * value per route. A service composing both asks the customer twice and keeps
 * whichever answer happened to come second — which is the electrical synonym
 * bug (six access questions, three vocabularies, a component that matched
 * none of them) in a new costume, and it had reached sixteen services here
 * before the composition audit caught it.
 *
 * The split is by what the job IS, not by what it touches. Clearing, jetting,
 * camera work and drain repair are work ON the drain line, so the cleanout
 * question is their access question. A sink, a disposal, a softener or a
 * dishwasher merely CONNECTS to a drain; asking where its cleanout is answers
 * nothing about reaching the work, and the supply-side route decides.
 *
 * A service that genuinely needs both routes classified separately is asking
 * for a platform change, not a second family — see
 * docs/design/plumbing-shared-integrations.md.
 *
 * Enforced by scripts/verify-plumbing-template.ts.
 */
export type PlumbingService = {
  /** Stable identity ACROSS template versions. Never renamed. */
  key: string;
  name: string;
  category: PlumbingCategoryKey;
  bookingType: PlumbingBookingType;
  shortDescription: string;
  families: readonly PlumbingFamilyKey[];
  gates: readonly PlumbingGateKey[];
  requires: readonly PlumbingRequirementKey[];
  metadata: PlumbingMetadata;
  /** Policies the SERVICE needs that no question introduces. */
  servicePolicies?: readonly string[];
  /** Combustion classes this service covers. Present only where it has one. */
  expectsCombustion?: readonly Exclude<CombustionClass, "UNKNOWN">[];
  /** Capacities this service covers, and their unit. Trade sizes, not stock. */
  capacity?: { unit: string; covers: readonly number[] };
  requiresTechCount?: number;
};

// Metadata shorthands. Written out rather than defaulted: a service that did
// not declare its permit posture would inherit somebody's guess, and the
// verifier requires all four on every entry.
const M = (
  permit: PlumbingMetadata["permit"],
  photo: PlumbingMetadata["photo"],
  preWork: PlumbingMetadata["preWork"],
  visit: PlumbingMetadata["visit"]
): PlumbingMetadata => ({ permit, photo, preWork, visit });

/** Standard residential tank sizes, in gallons. Manufactured sizes, not stock. */
const TANK_GALLONS = [30, 40, 50, 55, 65, 75, 80] as const;

export const PLUMBING_SERVICES: readonly PlumbingService[] = [
  // ── Water heaters ────────────────────────────────────────────────────────
  //
  // Every gas entry here runs the combustion gate, and every one of them stops
  // on UNKNOWN rather than assuming atmospheric. Atmospheric is the common
  // case and that is exactly why guessing it is expensive: the customers it is
  // wrong for are the ones whose install needs a receptacle and PVC that
  // nobody quoted.
  {
    key: "tank-water-heater-replacement-gas",
    name: "Gas Tank Water Heater Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an existing gas storage water heater with a new one of the same type.",
    families: ["supply_arrangement", "venting_and_combustion", "fixture_access", "pipe_material", "run_distance"],
    gates: ["combustion_gate", "capacity_gate", "access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_heater.supply_arrangement", "water_heater_relocation.breakpoints"],
    expectsCombustion: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT"],
    capacity: { unit: "gal", covers: TANK_GALLONS },
  },
  {
    key: "tank-water-heater-replacement-electric",
    name: "Electric Tank Water Heater Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an existing electric storage water heater with a new one of the same type.",
    families: ["supply_arrangement", "venting_and_combustion", "fixture_access", "pipe_material"],
    gates: ["combustion_gate", "capacity_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_heater.supply_arrangement", "water_heater_relocation.breakpoints"],
    expectsCombustion: ["ELECTRIC"],
    capacity: { unit: "gal", covers: TANK_GALLONS },
  },
  {
    key: "tankless-water-heater-replacement",
    name: "Tankless Water Heater Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an existing tankless water heater where the gas, water and vent arrangement stays as it is.",
    families: ["supply_arrangement", "venting_and_combustion", "fixture_access", "pipe_material"],
    gates: ["combustion_gate", "access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_heater.supply_arrangement"],
    expectsCombustion: ["GAS_POWER_VENT", "GAS_DIRECT_VENT"],
  },
  {
    key: "tank-to-tankless-conversion",
    name: "Tank to Tankless Conversion",
    category: "water-heaters",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Replacing a storage water heater with a tankless unit, including the new gas and vent arrangement it needs.",
    // A conversion changes the gas load, the vent path and often the water
    // routing at once. There is no configuration of a web form that bounds
    // that, so it does not pretend to.
    families: ["supply_arrangement", "venting_and_combustion", "fixture_access", "pipe_material", "run_distance", "existing_condition"],
    gates: ["combustion_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_heater.supply_arrangement", "gas_line_run.breakpoints"],
    expectsCombustion: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT", "GAS_DIRECT_VENT"],
  },
  {
    key: "heat-pump-water-heater-replacement",
    name: "Heat Pump Water Heater Installation",
    category: "water-heaters",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Installing a hybrid heat pump water heater, including the condensate and clearance the unit requires.",
    families: ["supply_arrangement", "venting_and_combustion", "fixture_access", "pipe_material"],
    gates: ["combustion_gate", "capacity_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_heater.supply_arrangement"],
    expectsCombustion: ["ELECTRIC"],
    capacity: { unit: "gal", covers: [50, 65, 80] },
  },
  {
    key: "water-heater-expansion-tank",
    name: "Thermal Expansion Tank Installation",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Adding a thermal expansion tank above a water heater on a closed supply system.",
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "water-heater-tpr-valve-replacement",
    name: "Temperature & Pressure Relief Valve Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the safety relief valve on a water heater, and its discharge pipe where needed.",
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "water-heater-flush",
    name: "Water Heater Flush",
    category: "water-heaters",
    bookingType: "INSTANT",
    shortDescription: "Draining and flushing sediment from a storage water heater.",
    families: ["fixture_access"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "water-heater-anode-rod-replacement",
    name: "Anode Rod Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the sacrificial anode rod in a storage water heater to extend the life of the tank.",
    families: ["fixture_access"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "water-heater-element-thermostat-replacement",
    name: "Electric Element or Thermostat Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing a failed heating element or thermostat in an electric storage water heater.",
    families: ["venting_and_combustion", "fixture_access"],
    gates: ["combustion_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    expectsCombustion: ["ELECTRIC"],
  },
  {
    key: "water-heater-gas-control-valve-replacement",
    name: "Gas Control Valve Replacement",
    category: "water-heaters",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the gas control valve and thermocouple assembly on a gas storage water heater.",
    families: ["venting_and_combustion", "fixture_access"],
    gates: ["combustion_gate", "access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    expectsCombustion: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT"],
  },

  // ── Toilets ──────────────────────────────────────────────────────────────
  {
    key: "toilet-replacement",
    name: "Toilet Replacement",
    category: "toilets",
    bookingType: "ADJUSTED",
    shortDescription: "Removing an existing toilet and setting a new one on the same flange.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "toilet-reset-wax-ring",
    name: "Toilet Reset & Seal Replacement",
    category: "toilets",
    bookingType: "ADJUSTED",
    shortDescription: "Lifting a toilet, replacing the floor seal, and resetting it level and sealed.",
    families: ["shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "toilet-internals-repair",
    name: "Toilet Fill Valve & Flapper Repair",
    category: "toilets",
    bookingType: "INSTANT",
    shortDescription: "Replacing the fill valve, flapper or flush assembly inside a running toilet.",
    families: ["shutoff_condition"],
    gates: ["shutoff_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "toilet-flange-repair",
    name: "Toilet Flange Repair",
    category: "toilets",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Repairing or replacing a broken closet flange under a toilet.",
    // A broken flange is anywhere between a repair ring and cutting into the
    // floor, and which one it is cannot be known until the toilet is off.
    families: ["shutoff_condition", "fixture_access", "pipe_material", "finish_disruption_ack", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "OPTIONAL", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "bidet-seat-installation",
    name: "Bidet Seat Installation",
    category: "toilets",
    bookingType: "ADJUSTED",
    shortDescription: "Fitting a bidet seat to an existing toilet and connecting it to the supply.",
    families: ["supply_arrangement", "shutoff_condition"],
    gates: ["shutoff_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "toilet-supply-line-replacement",
    name: "Toilet Supply Line Replacement",
    category: "toilets",
    bookingType: "INSTANT",
    shortDescription: "Replacing the flexible supply line between the stop valve and the toilet tank.",
    families: ["shutoff_condition"],
    gates: ["shutoff_gate"],
    requires: ["licensed_plumber"],
    // A weeping or burst supply line is its own reason to call a plumber, so
    // this is primary-capable. Whether a contractor thinks a dedicated trip is
    // worth making is their minimum's business, not the template's.
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },

  // ── Faucets & fixtures ───────────────────────────────────────────────────
  {
    key: "kitchen-faucet-replacement",
    name: "Kitchen Faucet Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Removing an existing kitchen faucet and installing a new one on the same sink.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "bathroom-faucet-replacement",
    name: "Bathroom Faucet Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Removing an existing bathroom faucet and installing a new one on the same sink.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "laundry-faucet-replacement",
    name: "Laundry Faucet Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing a utility or laundry sink faucet.",
    families: ["supply_arrangement", "shutoff_condition", "pipe_material", "existing_condition"],
    gates: ["shutoff_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "shower-valve-trim-replacement",
    name: "Shower Trim Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the visible handle, escutcheon and spout on an existing shower valve.",
    families: ["supply_arrangement", "fixture_access", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "shower-valve-body-replacement",
    name: "Shower Valve Body Replacement",
    category: "faucets-fixtures",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Replacing the valve body behind the wall, where the existing trim can no longer be repaired.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "finish_disruption_ack", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "OPTIONAL", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "shower-valve-cartridge-replacement",
    name: "Shower Cartridge Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the cartridge inside an existing shower valve to stop a drip or restore temperature control.",
    families: ["fixture_access", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "tub-spout-diverter-replacement",
    name: "Tub Spout & Diverter Replacement",
    category: "faucets-fixtures",
    bookingType: "INSTANT",
    shortDescription: "Replacing a tub spout, including the diverter that sends water to the showerhead.",
    families: ["supply_arrangement"],
    gates: [],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  // A standalone "Showerhead Replacement" was authored here and removed. It is
  // a component on the trim and cartridge services rather than a service: sold
  // on its own it is a van dispatched for a fifteen-minute swap, and the
  // service-call minimum then makes the customer's price look absurd for what
  // they get. Recorded rather than deleted silently, because the next person
  // to read the catalog will wonder where it went.
  {
    key: "hose-bib-replacement",
    name: "Outdoor Hose Bib Replacement",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an exterior hose bib where the existing one can be reached from inside.",
    families: ["shutoff_condition", "fixture_access", "pipe_material", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "frost-free-sillcock-installation",
    name: "Frost-Free Sillcock Installation",
    category: "faucets-fixtures",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an exterior tap with a frost-free sillcock, including the interior connection it needs.",
    families: ["shutoff_condition", "fixture_access", "pipe_material", "finish_disruption_ack"],
    gates: ["shutoff_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },

  // ── Sinks & disposals ────────────────────────────────────────────────────
  {
    key: "kitchen-sink-replacement",
    name: "Kitchen Sink Replacement",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Removing an existing kitchen sink and fitting a new one in the same opening.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "bathroom-sink-replacement",
    name: "Bathroom Sink Replacement",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Removing an existing bathroom sink or vanity basin and fitting a new one.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "garbage-disposal-replacement",
    name: "Garbage Disposal Replacement",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an existing disposal unit under a kitchen sink.",
    families: ["supply_arrangement", "fixture_access", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "garbage-disposal-new-installation",
    name: "New Garbage Disposal Installation",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Fitting a disposal where there was none, including the drain rework it requires.",
    // The electrical supply for a new disposal is not plumbing work. Where a
    // storefront offers both trades this reroutes; where it does not, the
    // disclaimer says so. Neither is decided here.
    families: ["supply_arrangement", "fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "sink-drain-assembly-replacement",
    name: "Sink Drain Assembly Replacement",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the basket strainer or pop-up drain assembly in a sink.",
    families: ["fixture_access"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "p-trap-replacement",
    name: "P-Trap Replacement",
    category: "sinks-disposals",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the trap and tailpiece under a sink.",
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },

  // ── Drains & sewer ───────────────────────────────────────────────────────
  {
    key: "drain-clearing-single-fixture",
    name: "Single Fixture Drain Clearing",
    category: "drains-sewer",
    bookingType: "ADJUSTED",
    shortDescription: "Clearing a blockage affecting one fixture, worked from an accessible opening.",
    families: ["drain_route"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["drain_line_run.breakpoints"],
  },
  {
    key: "main-line-drain-clearing",
    name: "Main Line Drain Clearing",
    category: "drains-sewer",
    bookingType: "ADJUSTED",
    shortDescription: "Clearing a blockage in the main waste line, worked through a cleanout.",
    families: ["drain_route"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["drain_line_run.breakpoints"],
  },
  {
    key: "sewer-camera-inspection",
    name: "Sewer Camera Inspection",
    category: "drains-sewer",
    bookingType: "INSTANT",
    shortDescription: "Running a camera through the main waste line and reporting what it shows.",
    families: ["drain_route"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "hydro-jetting-main-line",
    name: "Main Line Hydro Jetting",
    category: "drains-sewer",
    bookingType: "ADJUSTED",
    shortDescription: "Clearing a main waste line with high-pressure water rather than a cable.",
    families: ["drain_route"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["drain_line_run.breakpoints"],
  },
  {
    key: "drain-line-repair-accessible",
    name: "Accessible Drain Line Repair",
    category: "drains-sewer",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Repairing a damaged section of waste pipe that can be reached without excavation.",
    families: ["drain_route", "pipe_material", "finish_disruption_ack", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "sewer-line-replacement-assessment",
    name: "Sewer Line Replacement Assessment",
    category: "drains-sewer",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Assessing a failed sewer lateral and scoping its repair or replacement.",
    // Breaking ground is a utility locate, a permit, and a scope that is not
    // knowable from a photograph. The assessment is what is sold; the work is
    // quoted after it.
    families: ["drain_route", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber", "excavation"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },

  // ── Sump & ejector pumps ─────────────────────────────────────────────────
  {
    key: "sump-pump-replacement",
    name: "Sump Pump Replacement",
    category: "sump-drainage",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing a failed sump pump in an existing pit, reusing the discharge line.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "sump-pump-new-installation",
    name: "New Sump Pump Installation",
    category: "sump-drainage",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Installing a sump pit and pump where there was none, including the discharge to outside.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "run_distance"],
    gates: ["access_gate"],
    requires: ["licensed_plumber", "excavation", "confined_space"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement", "plumbing_run.breakpoints"],
  },
  {
    key: "sump-pump-battery-backup-installation",
    name: "Sump Pump Battery Backup Installation",
    category: "sump-drainage",
    bookingType: "ADJUSTED",
    shortDescription: "Adding a battery-backed secondary pump to an existing sump pit.",
    families: ["supply_arrangement", "fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },
  {
    key: "sewage-ejector-pump-replacement",
    name: "Sewage Ejector Pump Replacement",
    category: "sump-drainage",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing a failed sewage ejector pump in an existing sealed basin.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber", "confined_space"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["fixture.supply_arrangement"],
  },

  // ── Water supply & piping ────────────────────────────────────────────────
  {
    key: "main-water-shutoff-valve-replacement",
    name: "Main Water Shutoff Valve Replacement",
    category: "water-supply-piping",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Replacing the main shutoff valve where the water service enters the building.",
    // Replacing the main stop usually means the street valve has to be closed
    // by the utility, and whether that can be arranged is not something this
    // form can answer.
    families: ["fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "fixture-shutoff-valve-replacement",
    name: "Fixture Shutoff Valve Replacement",
    category: "water-supply-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing a stop valve at a sink, toilet or appliance connection.",
    families: ["fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "pressure-reducing-valve-replacement",
    name: "Pressure Reducing Valve Replacement",
    category: "water-supply-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing the pressure reducing valve on the incoming water service.",
    families: ["fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "backflow-preventer-installation",
    name: "Backflow Preventer Installation",
    category: "water-supply-piping",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Installing or replacing a backflow prevention device, including the test and certification it requires.",
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber", "backflow_prevention"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "pipe-section-repair",
    name: "Water Pipe Section Repair",
    category: "water-supply-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Cutting out and replacing a damaged length of accessible water pipe.",
    // One service rather than one per material. The pipe material family asks
    // what it is; a transition between two materials is a named component, not
    // a second service that would drift out of step with this one.
    families: ["shutoff_condition", "fixture_access", "pipe_material", "run_distance", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["plumbing_run.breakpoints"],
  },
  {
    key: "water-service-line-assessment",
    name: "Water Service Line Assessment",
    category: "water-supply-piping",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Assessing the buried supply line between the street and the building.",
    families: ["fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber", "excavation"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "whole-home-repipe-assessment",
    name: "Whole Home Repipe Assessment",
    category: "water-supply-piping",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Assessing a building's supply piping and scoping a full or partial repipe.",
    families: ["fixture_access", "pipe_material", "finish_disruption_ack", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
  },

  // ── Water treatment ──────────────────────────────────────────────────────
  {
    key: "water-softener-replacement",
    name: "Water Softener Replacement",
    category: "water-treatment",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an existing softener where the bypass, drain and supply connections stay as they are.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_treatment.supply_arrangement"],
  },
  {
    key: "water-softener-new-installation",
    name: "New Water Softener Installation",
    category: "water-treatment",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Installing a softener where there was none, including the loop, bypass and drain it needs.",
    families: ["supply_arrangement", "fixture_access", "pipe_material", "run_distance"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_treatment.supply_arrangement", "plumbing_run.breakpoints"],
  },
  {
    key: "whole-home-water-filter-installation",
    name: "Whole Home Water Filter Installation",
    category: "water-treatment",
    bookingType: "ADJUSTED",
    shortDescription: "Fitting a whole-home filter housing on the incoming supply, with a bypass.",
    families: ["supply_arrangement", "fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_treatment.supply_arrangement"],
  },
  {
    key: "under-sink-reverse-osmosis-installation",
    name: "Under-Sink Reverse Osmosis Installation",
    category: "water-treatment",
    bookingType: "ADJUSTED",
    shortDescription: "Installing an under-sink reverse osmosis system, including its faucet and drain connection.",
    families: ["supply_arrangement", "shutoff_condition", "fixture_access"],
    gates: ["shutoff_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["water_treatment.supply_arrangement"],
  },

  // ── Gas piping ───────────────────────────────────────────────────────────
  //
  // Every entry below carries the gas fitting requirement, and every one of
  // them blocks publication without it. That is the one place in this catalog
  // where a missing contractor record stops a service outright rather than
  // sending a route to review: the failure mode is somebody booking regulated
  // gas work from a contractor not permitted to perform it.
  {
    key: "gas-shutoff-valve-replacement",
    name: "Gas Shutoff Valve Replacement",
    category: "gas-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Replacing an appliance gas shutoff valve on accessible pipe.",
    families: ["fixture_access", "pipe_material", "existing_condition"],
    gates: ["access_gate", "condition_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "gas-line-extension-appliance",
    name: "Gas Line Extension to an Appliance",
    category: "gas-piping",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Extending gas piping to a new appliance location, sized for the load it will carry.",
    families: ["venting_and_combustion", "fixture_access", "pipe_material", "run_distance", "finish_disruption_ack"],
    gates: ["combustion_gate", "access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "REQUIRED", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["gas_line_run.breakpoints"],
    expectsCombustion: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT", "GAS_DIRECT_VENT"],
  },
  {
    key: "gas-appliance-reconnection",
    name: "Gas Appliance Connection",
    category: "gas-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Connecting a range, dryer or other gas appliance to an existing shutoff, and leak testing it.",
    families: ["venting_and_combustion", "fixture_access"],
    gates: ["combustion_gate", "access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    expectsCombustion: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT", "GAS_DIRECT_VENT"],
  },
  {
    key: "gas-leak-locate",
    name: "Gas Leak Locate",
    category: "gas-piping",
    bookingType: "ADJUSTED",
    shortDescription: "Locating a leak in a building's gas piping and reporting what the repair requires.",
    // Deliberately NOT sold as a repair. What the repair is cannot be known
    // until the leak is found, and a single price covering both would be a
    // promise about work nobody has seen.
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "gas-line-pressure-test",
    name: "Gas Line Pressure Test",
    category: "gas-piping",
    bookingType: "INSTANT",
    shortDescription: "Pressure testing a building's gas piping and documenting the result.",
    families: ["fixture_access"],
    gates: ["access_gate"],
    requires: ["licensed_plumber", "gas_fitting"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },

  // ── Appliance connections ────────────────────────────────────────────────
  {
    key: "dishwasher-water-connection",
    name: "Dishwasher Water & Drain Connection",
    category: "appliance-connections",
    bookingType: "ADJUSTED",
    shortDescription: "Connecting a dishwasher to the supply and drain, with an air gap or high loop as required.",
    families: ["shutoff_condition", "fixture_access"],
    gates: ["shutoff_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "refrigerator-water-line-installation",
    name: "Refrigerator Water Line Installation",
    category: "appliance-connections",
    bookingType: "ADJUSTED",
    shortDescription: "Running a water line to a refrigerator ice maker from an existing supply.",
    families: ["shutoff_condition", "fixture_access", "pipe_material", "run_distance"],
    gates: ["shutoff_gate", "access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
    servicePolicies: ["plumbing_run.breakpoints"],
  },
  {
    key: "washing-machine-outlet-box-replacement",
    name: "Washing Machine Outlet Box Replacement",
    category: "appliance-connections",
    bookingType: "REMOTE_QUOTE",
    shortDescription: "Replacing a recessed washing machine box, including the valves and drain behind it.",
    families: ["shutoff_condition", "fixture_access", "pipe_material", "finish_disruption_ack", "existing_condition"],
    gates: ["shutoff_gate", "access_gate", "condition_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "REVIEW_REQUIRED", "OPTIONAL", "PRIMARY_ELIGIBLE"),
  },
  {
    key: "water-hammer-arrestor-installation",
    name: "Water Hammer Arrestor Installation",
    category: "appliance-connections",
    bookingType: "ADJUSTED",
    shortDescription: "Fitting arrestors at a fast-closing valve to stop pipe banging.",
    families: ["fixture_access", "pipe_material"],
    gates: ["access_gate"],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "NONE", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },

  // ── Service calls ────────────────────────────────────────────────────────
  //
  // KEY RENAMED before publication. `key` is the identity that survives across
  // template versions and must never move once a version has been seeded — but
  // Plumbing V1 has never been written to a database, so the rename is free
  // today and would not be tomorrow. It was `plumbing-diagnostic-visit`, and
  // "diagnostic" asserted a conclusion the flow is forbidden to reach.
  {
    key: "plumbing-service-call",
    name: "Plumbing Service Call",
    category: "service-calls",
    // The PLATFORM booking type, shared and unchanged. Plumbing's own name for
    // this outcome is ON_SITE_SERVICE (gates.ts); the customer sees neither.
    bookingType: "TROUBLESHOOT_ONLY",
    shortDescription: "A visit to establish what the work is, where that is not yet known.",
    // Where conditionGate sends an active failure. It has its own tree, and
    // answers given to another service do not travel into it — the customer is
    // being told we do not yet know what the job IS.
    families: ["fixture_access"],
    gates: [],
    requires: ["licensed_plumber"],
    metadata: M("EXCLUDED", "PREPARATION", "NOT_APPLICABLE", "PRIMARY_ELIGIBLE"),
  },
] as const;

export const PLUMBING_SERVICE_KEYS: readonly string[] = PLUMBING_SERVICES.map((s) => s.key);

/** The count is asserted by the verifier; the handoff scoped exactly this many. */
export const PLUMBING_SERVICE_COUNT = 63;

export function service(key: string): PlumbingService {
  const found = PLUMBING_SERVICES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown plumbing service "${key}".`);
  return found;
}

export function servicesInCategory(category: PlumbingCategoryKey): PlumbingService[] {
  return PLUMBING_SERVICES.filter((s) => s.category === category);
}
