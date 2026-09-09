/**
 * HVAC Template V1 — H1 canonical catalog foundation.
 *
 *   npx tsx scripts/verify-hvac-template.ts
 *
 * PURE SOURCE. NO DATABASE. HVAC provisions nothing yet, so nothing here
 * needs DATABASE_URL, and nothing here mutates anything.
 *
 * WHAT THIS PROVES, AND WHY MOST OF IT IS STRUCTURAL
 *
 * H1/H2 shipped a catalog and a domain vocabulary, not a pricing engine, so
 * most checks here are a count, a uniqueness check, or a source-level scan
 * — the same kind of proof G4's verify-contractor-credentials.ts used for a
 * fact-only slice with no consumer yet. H3 adds the first REAL resolution
 * calls: scripts/verify-plumbing-template.ts's `scopePlumbingService`
 * proof, applied to lib/hvac/scope.ts's one executable service.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HVAC_CATEGORIES,
  HVAC_CATEGORY_KEYS,
  HVAC_SERVICES,
  HVAC_SERVICE_KEYS,
  HVAC_DEFERRED_CANONICAL_KEYS,
  HVAC_REJECTED_OR_MERGED_SAMPLE,
  hvacServiceCall,
  type HvacDisposition,
} from "../lib/hvac/catalog";
import { HVAC_SERVICE_CALL_SHELL, hvacServiceCallIsSchedulable } from "../lib/hvac/appointments";
import { HVAC_INTENTS, allHvacIntentPhrases } from "../lib/hvac/intents";
import { HVAC_TEMPLATE_TRADE } from "../lib/hvac";
import { HVAC_PRIMITIVE_KEYS, HVAC_PRIMITIVES, type HvacPrimitiveKey } from "../lib/hvac/primitives";
import {
  HVAC_GATE_KEYS,
  capacityGate,
  conditionGate,
  controlGate,
  accessGate,
  type EquipmentCondition,
  type OutdoorLocation,
} from "../lib/hvac/gates";
import {
  HVAC_FAMILIES,
  HVAC_FAMILY_KEYS,
  HVAC_SERVICE_FAMILIES,
  HVAC_SERVICE_ACCESS_SLOTS,
  type HvacFamilyKey,
} from "../lib/hvac/families";
import { EXISTING_CONDITION_SCOPE, EVIDENCE_ONLY_FACTS, REPORTED_SYMPTOMS } from "../lib/hvac/mappings";
import {
  maintenanceScopeLocations,
  maintenanceScopeMatchesDeclaredLocations,
  HVAC_MAINTENANCE_SCOPE,
} from "../lib/hvac/metadata";
import type { AccessSlot } from "../lib/accessSlots";
import {
  resolveCondensatePumpInstallation,
  CONDENSATE_PUMP_QUESTIONS,
  type CondensatePumpInstallationFacts,
  resolveThermostatInstallation,
  THERMOSTAT_QUESTIONS,
  type ThermostatInstallationFacts,
  resolveCondensateSafetySwitchInstallation,
  CONDENSATE_SAFETY_SWITCH_QUESTIONS,
  type CondensateSafetySwitchFacts,
  resolveAirFilterReplacement,
  AIR_FILTER_REPLACEMENT_QUESTIONS,
  type AirFilterReplacementFacts,
  resolveAcTuneUp,
  AC_TUNE_UP_QUESTIONS,
  type AcTuneUpFacts,
  resolveFurnaceTuneUp,
  FURNACE_TUNE_UP_QUESTIONS,
  type FurnaceTuneUpFacts,
  resolveHeatPumpTuneUp,
  HEAT_PUMP_TUNE_UP_QUESTIONS,
  type HeatPumpTuneUpFacts,
  resolveMiniSplitTuneUp,
  MINI_SPLIT_TUNE_UP_QUESTIONS,
  type MiniSplitTuneUpFacts,
  resolveAirCleanerCabinetInstallation,
  AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS,
  type AirCleanerCabinetInstallationFacts,
  resolveDuctAirTreatmentInstallation,
  DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS,
  type DuctAirTreatmentInstallationFacts,
  resolveAccessoryConsumableReplacement,
  ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS,
  type AccessoryConsumableReplacementFacts,
  resolveMiniSplitHeadCleaning,
  MINI_SPLIT_HEAD_CLEANING_QUESTIONS,
  type MiniSplitHeadCleaningFacts,
  resolveWholeHouseHumidifier,
  WHOLE_HOUSE_HUMIDIFIER_QUESTIONS,
  type WholeHouseHumidifierFacts,
  resolveVentCoverReplacement,
  VENT_COVER_REPLACEMENT_QUESTIONS,
  type VentCoverReplacementFacts,
  resolveFurnaceReplacement,
  FURNACE_REPLACEMENT_QUESTIONS,
  type FurnaceReplacementFacts,
  resolveAcReplacement,
  AC_REPLACEMENT_QUESTIONS,
  type AcReplacementFacts,
  resolveHeatPumpReplacement,
  HEAT_PUMP_REPLACEMENT_QUESTIONS,
  type HeatPumpReplacementFacts,
  resolveWholeSystemReplacement,
  WHOLE_SYSTEM_REPLACEMENT_QUESTIONS,
  type WholeSystemReplacementFacts,
  resolveMiniSplitInstallation,
  MINI_SPLIT_INSTALLATION_QUESTIONS,
  type MiniSplitInstallationFacts,
  type LinesetStatus,
  type ReplacementVsNew,
} from "../lib/hvac/scope";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function strip(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Slice `src` from `startMarker` to `endMarker` (or to the end of `src` if
 * `endMarker` is omitted). MECHANICAL — exact substring search, nothing
 * more; this is not a parser and never will be.
 *
 * THROWS if either marker cannot be found, instead of silently slicing
 * from a `-1` index. That silent failure is a real defect this function
 * exists to close: an earlier group sliced on a comment-only marker after
 * `strip()` had already deleted every `//` line, so `indexOf` returned
 * -1, `slice(-1)` produced a near-empty string, and the negative
 * assertion built on it passed vacuously — proving nothing while reading
 * as a real check.
 *
 * EVERY MARKER PASSED HERE MUST BE A REAL CODE TOKEN — an exported type,
 * function, const, or another string that appears in actual source, never
 * prose lifted from a comment. `strip()` has already removed every
 * comment by the time this function sees the text, so a comment-only
 * marker will always throw, which is exactly the point: a broken boundary
 * now fails the build instead of passing silently.
 */
function section(src: string, startMarker: string, endMarker?: string): string {
  const start = src.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`verify-hvac-template: source boundary start marker not found: ${JSON.stringify(startMarker)}`);
  }
  if (endMarker === undefined) return src.slice(start);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    throw new Error(
      `verify-hvac-template: source boundary end marker not found: ${JSON.stringify(endMarker)} (searched after ${JSON.stringify(startMarker)})`
    );
  }
  return src.slice(start, end);
}

let failures = 0;
let checks = 0;
function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}
function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

console.log("\n\x1b[1mHVAC TEMPLATE V1 — H1 CANONICAL CATALOG\x1b[0m");
console.log("Pure source. No database, no provisioning, no pricing.\n");

group("1. exactly 22 shipping services, exactly 7 categories");
ok("HVAC_SERVICES has exactly 22 entries", HVAC_SERVICES.length === 22, `got ${HVAC_SERVICES.length}`);
ok("HVAC_CATEGORIES has exactly 7 entries", HVAC_CATEGORIES.length === 7, `got ${HVAC_CATEGORIES.length}`);
ok(
  "every category actually has at least one shipping service",
  HVAC_CATEGORY_KEYS.every((c) => HVAC_SERVICES.some((s) => s.category === c))
);
ok(
  "every service's category is one of the 7",
  HVAC_SERVICES.every((s) => (HVAC_CATEGORY_KEYS as readonly string[]).includes(s.category))
);

group("2. unique canonical keys");
ok("HVAC_SERVICE_KEYS has 22 unique entries", new Set(HVAC_SERVICE_KEYS).size === 22, `got ${new Set(HVAC_SERVICE_KEYS).size} unique of ${HVAC_SERVICE_KEYS.length}`);
ok(
  "every category key is unique",
  new Set(HVAC_CATEGORY_KEYS).size === HVAC_CATEGORY_KEYS.length
);

group("3. no rejected/merged candidate resurrected as a service");
const resurrected = HVAC_REJECTED_OR_MERGED_SAMPLE.filter((k) => (HVAC_SERVICE_KEYS as readonly string[]).includes(k));
ok(
  "none of the sampled rejected/merged keys appear as a shipping service",
  resurrected.length === 0,
  resurrected.join(", ")
);
ok(
  "the merge survivor is canonical where its merged-away name is not",
  (HVAC_SERVICE_KEYS as readonly string[]).includes("air-cleaner-cabinet-installation") &&
    !(HVAC_SERVICE_KEYS as readonly string[]).includes("media-cabinet-installation")
);

group("4. deferred canonical services are absent from V1 shipping");
ok("HVAC_DEFERRED_CANONICAL_KEYS has exactly 7 entries", HVAC_DEFERRED_CANONICAL_KEYS.length === 7, `got ${HVAC_DEFERRED_CANONICAL_KEYS.length}`);
const shippedButDeferred = HVAC_DEFERRED_CANONICAL_KEYS.filter((k) => (HVAC_SERVICE_KEYS as readonly string[]).includes(k));
ok("none of the 7 deferred keys ship", shippedButDeferred.length === 0, shippedButDeferred.join(", "));
ok(
  "the 22 shipping keys and the 7 deferred keys are disjoint sets covering no overlap",
  new Set([...HVAC_SERVICE_KEYS, ...HVAC_DEFERRED_CANONICAL_KEYS]).size === 29,
  `union size ${new Set([...HVAC_SERVICE_KEYS, ...HVAC_DEFERRED_CANONICAL_KEYS]).size}, expected 29`
);

group("5. exactly one HVAC service-call shell, and it uses SERVICE_CALL");
const shellsInCatalog = HVAC_SERVICES.filter((s) => s.bookingType === "TROUBLESHOOT_ONLY");
ok("exactly one catalog entry declares bookingType TROUBLESHOOT_ONLY", shellsInCatalog.length === 1, String(shellsInCatalog.length));
ok('that entry is "hvac-service-call"', shellsInCatalog[0]?.key === "hvac-service-call");
// The runtime booking type — the G2 half. findTroubleshootingService and
// tradeOfService (lib/troubleshooting.ts) both query on this literal value;
// asserting it here, on the actual catalog row rather than on a variable
// that merely holds the right string, is what makes this a proof of the
// SHELL rather than of the test's own expectation.
ok(
  "the shell's runtime booking type is literally TROUBLESHOOT_ONLY",
  hvacServiceCall().bookingType === "TROUBLESHOOT_ONLY",
  String(hvacServiceCall().bookingType)
);
ok('HVAC_SERVICE_CALL_SHELL.key is "on_site_service"', HVAC_SERVICE_CALL_SHELL.key === "on_site_service");
ok('HVAC_SERVICE_CALL_SHELL.platformKind is "SERVICE_CALL"', HVAC_SERVICE_CALL_SHELL.platformKind === "SERVICE_CALL");
ok("the shell is schedulable (G3 shipped before H1)", hvacServiceCallIsSchedulable());
ok("hvacServiceCall() resolves the catalog entry, not a second definition", hvacServiceCall().key === "hvac-service-call");
ok(
  "no OTHER service declares a bookingType at all in H1",
  HVAC_SERVICES.filter((s) => s.key !== "hvac-service-call").every((s) => s.bookingType === undefined),
  "H1 does not assign disposition→bookingType for services with no question tree yet"
);

// The appointment-semantics half — not a comparison against our own mirrored
// PlatformAppointmentKind type (which would only prove our type agrees with
// itself), but against prisma/schema.prisma's REAL AppointmentKind enum,
// the same cross-check scripts/verify-appointment-kinds.ts (G3) uses.
{
  const schema = strip("prisma/schema.prisma");
  const enumMatch = schema.match(/^enum AppointmentKind \{([\s\S]*?)^\}/m);
  ok("prisma/schema.prisma declares an AppointmentKind enum", enumMatch !== null);
  const realKinds = (enumMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
  ok(
    "the real AppointmentKind enum includes SERVICE_CALL — G3 shipped it before H1",
    realKinds.includes("SERVICE_CALL"),
    realKinds.join(", ")
  );
  ok(
    'the shell\'s platformKind IS a member of the real AppointmentKind enum, not merely equal to a matching string',
    realKinds.includes(HVAC_SERVICE_CALL_SHELL.platformKind)
  );
  ok(
    "and specifically SERVICE_CALL, checked against the real enum value",
    HVAC_SERVICE_CALL_SHELL.platformKind === "SERVICE_CALL" &&
      realKinds.includes(HVAC_SERVICE_CALL_SHELL.platformKind)
  );
}

group("6. every shipping service is tradeKey hvac");
ok('HVAC_TEMPLATE_TRADE is "hvac" (lowercase, matching G2\'s tradeKey convention)', HVAC_TEMPLATE_TRADE === "hvac");
const wrongTrade = HVAC_SERVICES.filter((s) => s.tradeKey !== "hvac");
ok("every one of the 22 services declares tradeKey hvac", wrongTrade.length === 0, wrongTrade.map((s) => s.key).join(", "));

group("7. every service declares a valid disposition — the review's own vocabulary");
const VALID_DISPOSITIONS: readonly HvacDisposition[] = ["FIXED", "CONDITIONAL_FIXED", "REMOTE_QUOTE", "APPOINTMENT_ONLY"];
ok(
  "every disposition is one of the review's four",
  HVAC_SERVICES.every((s) => (VALID_DISPOSITIONS as readonly string[]).includes(s.disposition))
);
const byDisposition = (d: HvacDisposition) => HVAC_SERVICES.filter((s) => s.disposition === d).length;
ok("FIXED count matches the trade-pass table (8)", byDisposition("FIXED") === 8, String(byDisposition("FIXED")));
ok("CONDITIONAL_FIXED count matches the trade-pass table (7)", byDisposition("CONDITIONAL_FIXED") === 7, String(byDisposition("CONDITIONAL_FIXED")));
ok("REMOTE_QUOTE count matches the trade-pass table (5)", byDisposition("REMOTE_QUOTE") === 5, String(byDisposition("REMOTE_QUOTE")));
ok("APPOINTMENT_ONLY count matches the trade-pass table (2)", byDisposition("APPOINTMENT_ONLY") === 2, String(byDisposition("APPOINTMENT_ONLY")));

group("8. While-We're-There posture — exactly the three named services");
const wwt = HVAC_SERVICES.filter((s) => s.whileWeThereOnly === true).map((s) => s.key).sort();
ok(
  "exactly air-filter-replacement, condensate-safety-switch-installation, condenser-pad-replacement",
  JSON.stringify(wwt) === JSON.stringify(["air-filter-replacement", "condensate-safety-switch-installation", "condenser-pad-replacement"].sort()),
  wwt.join(", ")
);

group("9. default-offered posture — vent-cover-replacement is the one exception");
const notDefaultOffered = HVAC_SERVICES.filter((s) => s.defaultOffered === false).map((s) => s.key);
ok("only vent-cover-replacement declares defaultOffered: false", JSON.stringify(notDefaultOffered) === JSON.stringify(["vent-cover-replacement"]), notDefaultOffered.join(", "));

group("10. no two services share an alias phrase, and no alias is claimed twice");
{
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const s of HVAC_SERVICES) {
    for (const a of s.aliases ?? []) {
      const norm = a.toLowerCase().trim();
      const prior = seen.get(norm);
      if (prior && prior !== s.key) collisions.push(`"${norm}" -> ${prior} and ${s.key}`);
      seen.set(norm, s.key);
    }
  }
  ok("no alias phrase routes to two different services", collisions.length === 0, collisions.join(" | "));
}
{
  // Same check against HVAC_INTENTS (the search-vocabulary export), and
  // cross-checked that it agrees with catalog.ts's own aliases rather than
  // silently drifting into a second, disagreeing copy.
  const phrases = allHvacIntentPhrases();
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const { phrase, serviceKey } of phrases) {
    const norm = phrase.toLowerCase().trim();
    const prior = seen.get(norm);
    if (prior && prior !== serviceKey) collisions.push(`"${norm}" -> ${prior} and ${serviceKey}`);
    seen.set(norm, serviceKey);
  }
  ok("no HVAC_INTENTS phrase routes to two different services", collisions.length === 0, collisions.join(" | "));
  ok(
    "every HVAC_INTENTS entry points at a real shipping service",
    HVAC_INTENTS.every((i) => (HVAC_SERVICE_KEYS as readonly string[]).includes(i.serviceKey))
  );
}

group("11. symptom vocabulary cannot resolve directly to a component repair");
{
  const symptomCall = HVAC_SERVICES.find((s) => s.key === "hvac-service-call")!;
  const symptoms = symptomCall.aliases ?? [];
  ok("hvac-service-call declares the symptom vocabulary", symptoms.length > 0);
  const leaked = HVAC_SERVICES.filter((s) => s.key !== "hvac-service-call").flatMap((s) =>
    (s.aliases ?? []).filter((a) => symptoms.some((sym) => a.toLowerCase() === sym.toLowerCase()))
  );
  ok(
    "no symptom phrase appears as another service's alias — a symptom names no repair",
    leaked.length === 0,
    leaked.join(", ")
  );
  ok(
    "duct-assessment (the other APPOINTMENT_ONLY, non-shell service) declares no aliases at all",
    (HVAC_SERVICES.find((s) => s.key === "duct-assessment")?.aliases ?? []).length === 0,
    "every candidate alias for it is flagged as symptom language in the review — see catalog.ts"
  );
  ok(
    'mini-split-head-cleaning excludes "mold smell from mini split" — an odor is a symptom, not an alias',
    !(HVAC_SERVICES.find((s) => s.key === "mini-split-head-cleaning")?.aliases ?? [])
      .some((a) => /smell|odor|odour|mold/i.test(a))
  );
}

group("12. no component-named or diagnostic-conclusion service in the canonical set");
{
  // Structural, not a wordlist: the same shape §22/audit 3 forbids — a
  // service whose NAME asserts a specific failed part or a diagnosed cause,
  // which is exactly what would give a symptom something to resolve to.
  const diagnosticLanguage = /\b(capacitor|contactor|blower motor|igniter|circuit board|compressor|failed|broken|defective|diagnos\w*|repair)\b/i;
  const suspect = HVAC_SERVICES.filter((s) => diagnosticLanguage.test(s.name));
  ok("no service name names a specific failed component or a diagnosis", suspect.length === 0, suspect.map((s) => s.name).join(", "));
  const suspectAliases = HVAC_SERVICES.flatMap((s) => (s.aliases ?? []).filter((a) => diagnosticLanguage.test(a)).map((a) => `${s.key}: ${a}`));
  ok("no alias names a specific failed component or a diagnosis", suspectAliases.length === 0, suspectAliases.join(" | "));
}

group("13. no HVAC file imports or changes Plumbing/Electrical trade-owned definitions");
{
  const hvacFiles = ["lib/hvac/catalog.ts", "lib/hvac/appointments.ts", "lib/hvac/intents.ts", "lib/hvac/index.ts"];
  for (const f of hvacFiles) {
    const src = strip(f);
    ok(`${f} imports nothing from lib/plumbing`, !/from ["'`]\.\.?\/.*plumbing/.test(src));
    ok(`${f} imports nothing electrical-specific`, !/from ["'`]\.\.?\/.*electrical/.test(src));
  }
  const plumbingCatalog = strip("lib/plumbing/catalog.ts");
  const plumbingIntents = strip("lib/plumbing/intents.ts");
  ok("lib/plumbing/catalog.ts is untouched by H1 (no HVAC reference in it)", !/hvac/i.test(plumbingCatalog));
  ok(
    "lib/plumbing/intents.ts's Plumbing content is untouched (still declares PLUMBING_EMERGENCY_PATTERNS)",
    /export const PLUMBING_EMERGENCY_PATTERNS/.test(plumbingIntents)
  );
}

group("14. canonical catalog contains no diagnostic repair inference");
{
  // The governing invariant, checked at the source level: nothing in the
  // catalog module claims to identify a CAUSE. "establishes what the work
  // is" (the shell's own purpose) is an observation of outcome, not a
  // diagnosis of cause, and is explicitly allowed.
  const catalogSrc = strip("lib/hvac/catalog.ts");
  ok(
    "no service's declared data infers a cause (checked as a structural absence, not a keyword ban on prose)",
    !/diagnos(e|is|ed|ing)\s+(the|a|which)/i.test(catalogSrc)
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H2 — the domain vocabulary and family layer
// ═══════════════════════════════════════════════════════════════════════

group("15. exactly nineteen HVAC families — H2's own \"fifteen\" check, superseded again by H11's own narrow addition");
// H2 declared fifteen; H8 added indoor_unit_form and water_supply_availability
// (seventeen); H9 added vent_cover_configuration (eighteen); H11 adds
// equipment_installation_context — four narrowly-scoped families total
// since H2, each settling facts approved authority required but H2 never
// declared a home for. This group now proves the CURRENT boundary, the
// same discipline every prior phase applied to its own predecessor's
// version of a count check.
ok("HVAC_FAMILIES has exactly 19 entries", HVAC_FAMILIES.length === 19, `got ${HVAC_FAMILIES.length}`);
ok("HVAC_FAMILY_KEYS has 19 unique entries", new Set(HVAC_FAMILY_KEYS).size === 19, `got ${new Set(HVAC_FAMILY_KEYS).size}`);
ok(
  '"dedicated_power_availability" is one of the fifteen — the H2 audit correction',
  (HVAC_FAMILY_KEYS as readonly string[]).includes("dedicated_power_availability")
);
ok(
  "every family declares at least one established fact",
  HVAC_FAMILIES.every((f) => f.establishes.length > 0)
);

group("16. exactly seven HVAC gates — not eight, on the stale summary count");
ok("HVAC_GATE_KEYS has exactly 7 entries", HVAC_GATE_KEYS.length === 7, `got ${HVAC_GATE_KEYS.length}`);
ok("HVAC_GATE_KEYS has 7 unique entries", new Set(HVAC_GATE_KEYS).size === 7);
ok(
  "every gate a family references is one of the seven",
  HVAC_FAMILIES.every((f) => f.gates.every((g) => (HVAC_GATE_KEYS as readonly string[]).includes(g)))
);
{
  const gatesSrc = strip("lib/hvac/gates.ts");
  ok(
    "gates.ts itself declares exactly seven gate functions",
    ["identityGate", "fuelGate", "ventingGate", "capacityGate", "accessGate", "controlGate", "conditionGate"].every(
      (fn) => new RegExp(`export function ${fn}\\(`).test(gatesSrc)
    )
  );
  ok(
    "and no eighth (no function beyond the seven, firstRefusal, and toRouteAction)",
    (gatesSrc.match(/export function \w+\(/g) ?? []).length === 9 // 7 gates + firstRefusal + toRouteAction
  );
}

group("17. no eighth shared primitive");
ok("HVAC_PRIMITIVE_KEYS has exactly 7 entries", HVAC_PRIMITIVE_KEYS.length === 7, `got ${HVAC_PRIMITIVE_KEYS.length}`);
ok(
  "the seven are exactly access/band/supply/component/material/photo/disclaimer",
  JSON.stringify([...HVAC_PRIMITIVE_KEYS].sort()) ===
    JSON.stringify(
      [
        "access_classification",
        "band_policy",
        "supply_arrangement",
        "component_increment",
        "material_role",
        "photo_gate",
        "conditional_disclaimer",
      ].sort()
    )
);
ok(
  "every family's primitive references are among the seven",
  HVAC_FAMILIES.every((f) => f.primitives.every((p) => (HVAC_PRIMITIVE_KEYS as readonly string[]).includes(p)))
);

group("18. capacity facts are HVAC structured facts feeding capacity_gate, not component_increment");
{
  const heating = HVAC_FAMILIES.find((f) => f.key === "heating_equipment")!;
  const cooling = HVAC_FAMILIES.find((f) => f.key === "cooling_equipment")!;
  ok(
    "heating_equipment establishes heating_input_btu and binds NO shared primitive",
    heating.establishes.includes("heating_input_btu") && heating.primitives.length === 0
  );
  ok(
    "cooling_equipment establishes cooling_tons and binds NO shared primitive",
    cooling.establishes.includes("cooling_tons") && cooling.primitives.length === 0
  );
  ok(
    "both route to capacity_gate, not to component_increment",
    heating.gates.includes("capacity_gate") && cooling.gates.includes("capacity_gate")
  );
  const primitivesSrc = strip("lib/hvac/primitives.ts");
  const componentPrimitive = HVAC_PRIMITIVES.find((p) => p.key === "component_increment")!;
  ok(
    "component_increment's platform binding is the additive-component binding, unchanged from Plumbing",
    componentPrimitive.platformBinding === "TemplateAnswerOptionComponent -> ContractorComponent.approvedPriceCents"
  );
  ok(
    "gates.ts's capacityGate implementation never references component_increment",
    !strip("lib/hvac/gates.ts").includes("component_increment")
  );
  void primitivesSrc;
}

group("19. capacity_gate consumes both axes independently — approved, whole-system-replacement");
{
  const cooling = capacityGate(3, { axis: "COOLING", unit: "tons", covers: [1.5, 2, 2.5, 3, 3.5, 4, 5] });
  const heating = capacityGate(80000, { axis: "HEATING", unit: "BTU/h", covers: [40000, 60000, 80000, 100000, 120000] });
  ok("the cooling axis resolves on cooling_tons", cooling.factKey === "cooling_tons" && cooling.action === "CONTINUE");
  ok("the heating axis resolves on heating_input_btu", heating.factKey === "heating_input_btu" && heating.action === "CONTINUE");
  ok("the two calls are independent — neither axis's outcome depends on the other", cooling.observed !== heating.observed);
  ok(
    "no new gate or primitive was needed to support both — same function, two calls",
    HVAC_GATE_KEYS.length === 7 && HVAC_PRIMITIVE_KEYS.length === 7
  );
}

group("20. the four corrected branch-conditional family declarations");
{
  const thermostat = HVAC_SERVICE_FAMILIES["thermostat-installation"];
  ok("thermostat-installation declares run_distance on a branch", thermostat.some((u) => u.family === "run_distance" && !!u.branch));
  ok("thermostat-installation declares finish_disruption_ack on a branch", thermostat.some((u) => u.family === "finish_disruption_ack" && !!u.branch));

  const condensate = HVAC_SERVICE_FAMILIES["condensate-pump-installation"];
  ok("condensate-pump-installation declares run_distance on a branch", condensate.some((u) => u.family === "run_distance" && !!u.branch));
  ok(
    "condensate-pump-installation declares dedicated_power_availability on a branch",
    condensate.some((u) => u.family === "dedicated_power_availability" && !!u.branch)
  );

  const humidifier = HVAC_SERVICE_FAMILIES["whole-house-humidifier"];
  ok(
    "whole-house-humidifier declares dedicated_power_availability on a branch",
    humidifier.some((u) => u.family === "dedicated_power_availability" && !!u.branch)
  );

  const ductTreatment = HVAC_SERVICE_FAMILIES["duct-air-treatment-installation"];
  ok(
    "duct-air-treatment-installation declares dedicated_power_availability (unconditional — both merge sources need it)",
    ductTreatment.some((u) => u.family === "dedicated_power_availability" && !u.branch)
  );

  ok(
    "air-cleaner-cabinet-installation was rechecked and correctly declares NO dedicated_power_availability",
    !(HVAC_SERVICE_FAMILIES["air-cleaner-cabinet-installation"] ?? []).some((u) => u.family === "dedicated_power_availability")
  );
}

group("21. service → family declaration matches the H1 catalog exactly");
{
  const declared = Object.keys(HVAC_SERVICE_FAMILIES).sort();
  const catalog = [...HVAC_SERVICE_KEYS].sort();
  ok(
    "HVAC_SERVICE_FAMILIES declares exactly the 22 H1 catalog keys, no more, no fewer",
    JSON.stringify(declared) === JSON.stringify(catalog),
    `only in declaration: ${declared.filter((k) => !catalog.includes(k)).join(",")}; only in catalog: ${catalog.filter((k) => !declared.includes(k)).join(",")}`
  );
  const badFamilyRefs = Object.entries(HVAC_SERVICE_FAMILIES).flatMap(([svc, usages]) =>
    usages.filter((u) => !(HVAC_FAMILY_KEYS as readonly string[]).includes(u.family)).map((u) => `${svc}:${u.family}`)
  );
  ok("every family a service declares actually exists", badFamilyRefs.length === 0, badFamilyRefs.join(", "));
  ok(
    "every service declares at least one family (hvac-service-call included)",
    Object.values(HVAC_SERVICE_FAMILIES).every((usages) => usages.length > 0)
  );
}

group("22. G1 access-slot split — 14 single-location + hvac-service-call on PRIMARY, 7 dual-location");
{
  const declared = Object.keys(HVAC_SERVICE_ACCESS_SLOTS).sort();
  const catalog = [...HVAC_SERVICE_KEYS].sort();
  ok(
    "HVAC_SERVICE_ACCESS_SLOTS declares exactly the 22 H1 catalog keys",
    JSON.stringify(declared) === JSON.stringify(catalog)
  );
  const primaryOnly = Object.entries(HVAC_SERVICE_ACCESS_SLOTS).filter(
    ([, slots]) => slots.length === 1 && slots[0] === "PRIMARY"
  );
  const dualLocation = Object.entries(HVAC_SERVICE_ACCESS_SLOTS).filter((entry) => entry[1].length === 2);
  ok(
    "exactly 15 services (14 ordinary + hvac-service-call) declare PRIMARY only",
    primaryOnly.length === 15,
    `got ${primaryOnly.length}: ${primaryOnly.map(([k]) => k).join(", ")}`
  );
  ok("exactly 7 services declare two slots", dualLocation.length === 7, `got ${dualLocation.length}`);
  ok(
    "the seven dual-location slot lists are exactly INDOOR_EQUIPMENT + OUTDOOR_EQUIPMENT",
    dualLocation.every(([, slots]) => {
      const sorted = [...slots].sort();
      return JSON.stringify(sorted) === JSON.stringify(["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"].sort());
    })
  );
  const expectedDual = [
    "whole-system-replacement",
    "mini-split-installation",
    "ac-replacement",
    "heat-pump-replacement",
    "ac-tune-up",
    "heat-pump-tune-up",
    "mini-split-tune-up",
  ].sort();
  ok(
    "the seven dual-location services are exactly the approved seven",
    JSON.stringify(dualLocation.map(([k]) => k).sort()) === JSON.stringify(expectedDual)
  );
}

group("23. hvac-service-call uses PRIMARY, with no symptom-driven slot refinement");
{
  const shellSlots = HVAC_SERVICE_ACCESS_SLOTS["hvac-service-call"];
  ok('hvac-service-call declares exactly ["PRIMARY"]', JSON.stringify(shellSlots) === JSON.stringify(["PRIMARY"]));
  const familiesSrc = strip("lib/hvac/families.ts");
  ok(
    "no source reference ties reported_symptom to an access-slot decision",
    !/reported_symptom[\s\S]{0,80}(INDOOR_EQUIPMENT|OUTDOOR_EQUIPMENT)/i.test(familiesSrc) &&
      !/(INDOOR_EQUIPMENT|OUTDOOR_EQUIPMENT)[\s\S]{0,80}reported_symptom/i.test(familiesSrc)
  );
}

group("24. no dual-location service ever references PRIMARY");
{
  const offenders = Object.entries(HVAC_SERVICE_ACCESS_SLOTS)
    .filter(([, slots]) => slots.length > 1)
    .filter(([, slots]) => (slots as readonly AccessSlot[]).includes("PRIMARY"))
    .map(([k]) => k);
  ok("zero dual-location services include PRIMARY in their slot list", offenders.length === 0, offenders.join(", "));
}

group("25. evidence-only facts cannot feed a gate or a mapping");
{
  ok(
    "EVIDENCE_ONLY_FACTS names exactly manufacturer/model/serial/manufacture_date",
    JSON.stringify([...EVIDENCE_ONLY_FACTS].sort()) ===
      JSON.stringify(["manufacturer", "model", "serial", "manufacture_date"].sort())
  );
  const gatesSrc = strip("lib/hvac/gates.ts");
  const mappingsSrc = strip("lib/hvac/mappings.ts");
  const familiesSrc = strip("lib/hvac/families.ts");
  for (const fact of EVIDENCE_ONLY_FACTS) {
    ok(`gates.ts never uses "${fact}" as a factKey or reads it`, !new RegExp(`factKey:\\s*["'\`]${fact}["'\`]`).test(gatesSrc));
    ok(`mappings.ts never keys a mapping on "${fact}"`, !new RegExp(`Record<${fact}`, "i").test(mappingsSrc));
    ok(`no family establishes "${fact}"`, !HVAC_FAMILIES.some((f) => f.establishes.includes(fact)));
  }
  void familiesSrc;
}

group("26. reported_symptom maps to no known-work service");
{
  ok(
    "REPORTED_SYMPTOMS is the closed thirteen-labeled (fourteen-item) vocabulary",
    REPORTED_SYMPTOMS.length === 13 || REPORTED_SYMPTOMS.length === 14
  );
  ok(
    "no family establishes reported_symptom (it is booking-level context, not a gated fact)",
    !HVAC_FAMILIES.some((f) => f.establishes.includes("reported_symptom"))
  );
  const mappingsSrc = strip("lib/hvac/mappings.ts");
  ok(
    "mappings.ts declares no mapping FROM reported_symptom to a service key",
    !new RegExp(`REPORTED_SYMPTOMS[\\s\\S]{0,200}HVAC_SERVICES`).test(mappingsSrc)
  );
  // Re-affirms group 11's existing HVAC catalog check from the caller's side:
  // every reported_symptom string is also one of hvac-service-call's own
  // aliases, and none is any OTHER service's alias — proven again here
  // against the mappings.ts copy so the two lists cannot silently diverge.
  const shellAliases = hvacServiceCall().aliases ?? [];
  const symptomTextForms = ["not cooling", "no heat", "won't start", "weak airflow", "leaking water", "strange noise"];
  ok(
    "a sample of symptom text forms all resolve only through hvac-service-call's own alias list",
    symptomTextForms.every((t) => shellAliases.some((a) => a.toLowerCase() === t.toLowerCase()))
  );
}

group("27. existing_condition is effect-free — structural, not a comment");
{
  const conditions: readonly EquipmentCondition[] = ["SERVICEABLE", "DEGRADED", "ACTIVE_FAILURE", "UNKNOWN"];
  for (const c of conditions) {
    const consequence = EXISTING_CONDITION_SCOPE[c];
    ok(
      `EXISTING_CONDITION_SCOPE.${c} attaches no material role, component or prerequisite`,
      consequence.materialRoles.length === 0 && consequence.components.length === 0 && consequence.prerequisites.length === 0
    );
  }
  const existingCondition = HVAC_FAMILIES.find((f) => f.key === "existing_condition")!;
  ok("existing_condition binds no shared primitive", existingCondition.primitives.length === 0);
  ok(
    "an active failure routes to ON_SITE_SERVICE, never to a selected repair",
    conditionGate("ACTIVE_FAILURE").action === "ON_SITE_SERVICE"
  );
}

group("28. no refrigerant-charge dimension exists anywhere");
{
  const linesetFamily = HVAC_FAMILIES.find((f) => f.key === "refrigerant_lineset")!;
  ok(
    "refrigerant_lineset establishes only lineset_status — presence and path, nothing else",
    JSON.stringify(linesetFamily.establishes) === JSON.stringify(["lineset_status"])
  );
  const allSrc = ["lib/hvac/families.ts", "lib/hvac/gates.ts", "lib/hvac/mappings.ts", "lib/hvac/catalog.ts"]
    .map((f) => strip(f))
    .join("\n");
  ok(
    'no HVAC file mentions "refrigerant charge", "recharge", or a charge-level reading',
    !/refrigerant charge|re-?charge|charge level|charge state/i.test(allSrc)
  );
}

group("29. maintenanceScope location attribution");
{
  const sample = [
    { item: "clean the condenser coil", at: "OUTDOOR" as const },
    { item: "clear the condensate drain", at: "INDOOR" as const },
  ];
  ok(
    "maintenanceScopeLocations reports both locations for a mixed scope",
    JSON.stringify(maintenanceScopeLocations(sample)) === JSON.stringify(["INDOOR", "OUTDOOR"])
  );
  ok(
    "a BOTH-declared service is satisfied by any combination of locations",
    maintenanceScopeMatchesDeclaredLocations(sample, "BOTH")
  );
  ok(
    "an INDOOR-declared service is NOT satisfied by scope items reaching outdoor equipment — the G1 re-audit's own defect",
    !maintenanceScopeMatchesDeclaredLocations(sample, "INDOOR")
  );
  ok(
    "a single-location scope matches its own narrower declaration",
    maintenanceScopeMatchesDeclaredLocations([{ item: "furnace inspection", at: "INDOOR" }], "INDOOR")
  );
}

group("30. no H2 file imports or changes Plumbing/Electrical trade-owned definitions");
{
  const h2Files = ["lib/hvac/primitives.ts", "lib/hvac/gates.ts", "lib/hvac/families.ts", "lib/hvac/mappings.ts", "lib/hvac/metadata.ts"];
  for (const f of h2Files) {
    const src = strip(f);
    ok(`${f} imports nothing from lib/plumbing`, !/from ["'\`]\.\.?\/.*plumbing/.test(src));
    ok(`${f} imports nothing electrical-specific`, !/from ["'\`]\.\.?\/.*electrical/.test(src));
  }
  const plumbingGates = strip("lib/plumbing/gates.ts");
  const plumbingMappings = strip("lib/plumbing/mappings.ts");
  ok("lib/plumbing/gates.ts is untouched by H2 (no HVAC reference in it)", !/hvac/i.test(plumbingGates));
  ok("lib/plumbing/mappings.ts is untouched by H2 (no HVAC reference in it)", !/hvac/i.test(plumbingMappings));
}

group("31. no composition/publish/provisioning surface exists yet — scope.ts is H3's one sanctioned exception");
{
  // H2's own check here read "lib/hvac/scope.ts does not exist" — true at
  // the time, and superseded now: H3 is exactly the ONE executable service
  // this file exists to add. Composition (many services -> one contractor
  // catalog) and publish (writing to the database) remain unbuilt; this
  // group now proves that boundary instead of the one scope.ts itself
  // already crossed on purpose.
  ok("lib/hvac/scope.ts now exists — H3's one sanctioned exception", existsSync(join(ROOT, "lib/hvac/scope.ts")));
  ok("lib/hvac/composition.ts still does not exist (composition is H3+, not this slice)", !existsSync(join(ROOT, "lib/hvac/composition.ts")));
  ok("lib/hvac/publish.ts still does not exist (provisioning is H3+, not this slice)", !existsSync(join(ROOT, "lib/hvac/publish.ts")));
  ok(
    "no HVAC family manifest declares actual Question/AnswerOption content — that content stays scope.ts's own, service-specific",
    HVAC_FAMILIES.every((f) => !("questions" in f))
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H3 — the first executable tree: condensate-pump-installation
// ═══════════════════════════════════════════════════════════════════════

const BASE_FACTS: CondensatePumpInstallationFacts = {
  accessClass: "ACCESSIBLE",
  condensateRoute: "PUMP_PRESENT",
  supplyArrangement: "CUSTOMER_SUPPLIED",
  dedicatedCircuitPresent: "PRESENT",
  runBand: "STANDARD",
};

group("32. explicit known work reaches the approved CONDITIONAL_FIXED terminal");
{
  const replacement = resolveCondensatePumpInstallation(BASE_FACTS);
  ok(
    "a fully-resolved replacement path RESOLVES to RESOLVE_ADJUSTED",
    replacement.status === "RESOLVED" && replacement.routeAction === "RESOLVE_ADJUSTED" && replacement.branch === "REPLACEMENT"
  );
  const newInstall = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE" });
  ok(
    "a fully-resolved new-installation path (NONE_VISIBLE) RESOLVES to RESOLVE_ADJUSTED",
    newInstall.status === "RESOLVED" && newInstall.routeAction === "RESOLVE_ADJUSTED" && newInstall.branch === "NEW_INSTALLATION"
  );
}

group("33. both no-existing-pump observations stay inside this one service — no REROUTE_SERVICE");
{
  const noneVisible = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE" });
  const gravityDrain = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "GRAVITY_DRAIN_PRESENT" });
  ok(
    "NONE_VISIBLE resolves within condensate-pump-installation (NEW_INSTALLATION branch)",
    noneVisible.status === "RESOLVED" && noneVisible.branch === "NEW_INSTALLATION"
  );
  ok(
    "GRAVITY_DRAIN_PRESENT resolves within condensate-pump-installation (the SAME branch)",
    gravityDrain.status === "RESOLVED" && gravityDrain.branch === "NEW_INSTALLATION"
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok('scope.ts never produces REROUTE_SERVICE — old F.3\'s "a different service" is fully superseded', !/REROUTE_SERVICE/.test(scopeSrc));
}

group("34. condensate-pump-installation does not read equipment_condition — old F.3's ACTIVE_FAILURE reroute is fully superseded on THIS service — H11's own narrowing of this check, superseded on purpose");
{
  // H11 correction: this group originally scanned the WHOLE file for
  // ACTIVE_FAILURE/conditionGate/EquipmentCondition, which was accurate
  // only because nothing anywhere in scope.ts read equipment_condition
  // before H11. resolveFurnaceReplacement now legitimately does (with the
  // known-work opt-in — see group 121) — so this group narrows to prove
  // its original, still-true claim about condensate-pump-installation
  // SPECIFICALLY, not about the file as a whole.
  const scopeSrc = strip("lib/hvac/scope.ts");
  const condensatePumpSection = section(scopeSrc, "export function resolveCondensatePumpInstallation", "export type ThermostatInstallationFacts");
  ok(
    "CondensatePumpInstallationFacts has no field for equipment_condition — structurally unreadable, not merely unused",
    !/equipmentCondition|equipment_condition/.test(condensatePumpSection)
  );
  ok("condensate-pump-installation's own section never references ACTIVE_FAILURE", !/ACTIVE_FAILURE/.test(condensatePumpSection));
  ok("condensate-pump-installation's own section never calls conditionGate or reads EquipmentCondition", !/conditionGate|EquipmentCondition/.test(condensatePumpSection));
  ok("condensate-pump-installation's own section never produces ON_SITE_SERVICE (the old F.3 reroute target)", !/ON_SITE_SERVICE/.test(condensatePumpSection));
}

group("35. every unresolved fact fails closed to PHOTO_REVIEW");
{
  const accessUnknown = resolveCondensatePumpInstallation({ ...BASE_FACTS, accessClass: "UNKNOWN" });
  ok("unresolved access -> PHOTO_REVIEW", accessUnknown.status === "REFUSED" && accessUnknown.routeAction === "PHOTO_REVIEW");

  const routeUnknown = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "UNKNOWN" });
  ok("unresolved condensate_route -> PHOTO_REVIEW, before either branch is chosen", routeUnknown.status === "REFUSED" && routeUnknown.routeAction === "PHOTO_REVIEW");

  const powerUnknown = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE", dedicatedCircuitPresent: "UNKNOWN" });
  ok("unresolved dedicated_circuit_present -> PHOTO_REVIEW", powerUnknown.status === "REFUSED" && powerUnknown.routeAction === "PHOTO_REVIEW");

  const runUnknown = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE", runBand: "UNKNOWN" });
  ok("unresolved run_band -> PHOTO_REVIEW", runUnknown.status === "REFUSED" && runUnknown.routeAction === "PHOTO_REVIEW");
}

group("36. missing power and an over-band run leave fixed pricing — the settled product decision");
{
  const powerAbsent = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE", dedicatedCircuitPresent: "ABSENT" });
  ok(
    "dedicated_circuit_present=ABSENT -> REMOTE_QUOTE, never priced with a prerequisite noted",
    powerAbsent.status === "REFUSED" && powerAbsent.routeAction === "REMOTE_QUOTE"
  );
  const overBand = resolveCondensatePumpInstallation({ ...BASE_FACTS, condensateRoute: "NONE_VISIBLE", runBand: "OVER_BAND" });
  ok("run_band=OVER_BAND -> REMOTE_QUOTE", overBand.status === "REFUSED" && overBand.routeAction === "REMOTE_QUOTE");
  ok(
    'no third "EXTENDED" band exists for this service — condensate_run.breakpoints has exactly one boundary',
    !CONDENSATE_PUMP_QUESTIONS.some((q) => q.options.some((o) => o.value === "EXTENDED"))
  );
}

group("37. symptom vocabulary cannot enter this tree — it stays exclusive to hvac-service-call");
{
  const treeSrc = strip("lib/hvac/scope.ts");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}"`, !treeSrc.includes(symptom));
  }
  const optionValues = CONDENSATE_PUMP_QUESTIONS.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );
  const symptomPhrases = [
    "leaking water",
    "not cooling",
    "no cooling",
    "no heat",
    "water observed",
    "ac is leaking",
  ];
  const allWording = CONDENSATE_PUMP_QUESTIONS.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)])
    .join(" ")
    .toLowerCase();
  ok(
    "no question prompt or answer label contains symptom phrasing",
    symptomPhrases.every((p) => !allWording.includes(p))
  );
  ok(
    "hvac-service-call's own aliases are exactly where these symptom text forms still resolve (unchanged since G5/H1)",
    ["not cooling", "leaking water"].every((p) => (hvacServiceCall().aliases ?? []).some((a) => a.toLowerCase() === p))
  );
}

group("38. no question or answer names a cause — observation only");
{
  const diagnosticLanguage =
    /\b(blocked|clogged|failed|failing|broken|defective|refrigerant|low on|leaking from|leak in|worn|corroded internally|burnt out|malfunction)\b/i;
  for (const q of CONDENSATE_PUMP_QUESTIONS) {
    ok(`"${q.key}"'s prompt names no cause`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no cause`, !diagnosticLanguage.test(o.label), o.label);
    }
  }
  const scopeSrc = strip("lib/hvac/scope.ts");
  // H11 correction: scoped to condensate-pump-installation's own section —
  // the file as a whole now legitimately says "refrigerant" (refrigerant_
  // lineset, a real H2 family several H11 resolvers read), which is not a
  // diagnosed refrigerant ISSUE and was never what this check meant to catch.
  const condensatePumpSection = section(scopeSrc, "export function resolveCondensatePumpInstallation", "export type ThermostatInstallationFacts");
  ok(
    "no refusal reason in condensate-pump-installation's own section names a blocked drain, a failed pump, or a refrigerant issue",
    !/blocked drain|failed pump|refrigerant/i.test(condensatePumpSection)
  );
}

group("39. no answer selects a repair, a material, or a component");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "scope.ts declares no material role, component, or prerequisite — no pricing/scope-consequence surface exists yet",
    !/materialRoles|components:|ScopeConsequence/.test(scopeSrc)
  );
  ok("scope.ts imports nothing from lib/hvac/mappings.ts (no scope-consequence layer wired in H3)", !/from ["'`]\.\/mappings["'`]/.test(scopeSrc));
}

group("40. the tree's questions match H2's own family declaration for this service");
{
  const declaredFamilies = HVAC_SERVICE_FAMILIES["condensate-pump-installation"].map((u) => u.family);
  const establishedFacts = new Set(CONDENSATE_PUMP_QUESTIONS.map((q) => q.establishes));
  ok(
    "indoor_equipment_access is asked (establishes indoor_location)",
    declaredFamilies.includes("indoor_equipment_access") && establishedFacts.has("indoor_location")
  );
  ok(
    "condensate_route is asked (establishes condensate_route)",
    declaredFamilies.includes("condensate_route") && establishedFacts.has("condensate_route")
  );
  ok(
    "supply_arrangement is asked on both branches (establishes supply_arrangement)",
    declaredFamilies.includes("supply_arrangement") &&
      CONDENSATE_PUMP_QUESTIONS.filter((q) => q.establishes === "supply_arrangement").length === 2
  );
  ok(
    "dedicated_power_availability is asked only on the new-installation branch",
    declaredFamilies.includes("dedicated_power_availability") &&
      CONDENSATE_PUMP_QUESTIONS.filter((q) => q.establishes === "dedicated_circuit_present").every((q) => q.branch === "NEW_INSTALLATION")
  );
  ok(
    "run_distance is asked only on the new-installation branch",
    declaredFamilies.includes("run_distance") &&
      CONDENSATE_PUMP_QUESTIONS.filter((q) => q.establishes === "run_band").every((q) => q.branch === "NEW_INSTALLATION")
  );
  ok(
    "existing_condition is declared for domain completeness but asks no live question",
    declaredFamilies.includes("existing_condition") && !establishedFacts.has("equipment_condition")
  );
  ok("access slot is PRIMARY, per the settled decision", JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["condensate-pump-installation"]) === JSON.stringify(["PRIMARY"]));
}

group("41. exactly NINETEEN HVAC service trees exist — H3-H9's own check, superseded again on purpose");
{
  // H3's version read "exactly one"; H4's "exactly two"; H5's "exactly
  // four"; H6's "exactly eight"; H7's "exactly eleven"; H8's "exactly
  // thirteen"; H9's "exactly fourteen". Each was true when written, and
  // each is superseded on the same terms: H11 adds five more —
  // furnace-replacement, ac-replacement, heat-pump-replacement,
  // whole-system-replacement, mini-split-installation — the five
  // REMOTE_QUOTE-disposition equipment services H10's audit settled.
  // This group now proves the CURRENT boundary — nineteen, not fourteen,
  // not twenty — the same discipline every prior phase applied to its
  // own predecessor's version of this check.
  //
  // NOT ALL NINETEEN ARE "PRICED" ANY LONGER. The fourteen from H3-H9
  // terminate RESOLVE_INSTANT or RESOLVE_ADJUSTED — an actual price. The
  // five H11 adds terminate RESOLVE_INSTANT for nothing: their disposition
  // is REMOTE_QUOTE, and a fully established modeled scope on any of them
  // is its own successful terminal (HvacRemoteQuoteResolved, scope.ts's
  // own file header), never a price. "Executable HVAC scope resolvers" is
  // this group's own, and the file's own, language from here on —
  // "priced resolvers" stopped being accurate the moment H11 landed.
  //
  // duct-assessment and hvac-service-call are DELIBERATELY not among
  // these nineteen and never will be through this file — both are
  // APPOINTMENT_ONLY, never produce a priced RouteAction, and H9's own
  // audit settled that direct-selection context capture for both belongs
  // to a later booking/intake integration, not a scope.ts resolver.
  const resolveFns = strip("lib/hvac/scope.ts").match(/export function resolve\w+\(/g) ?? [];
  ok("lib/hvac/scope.ts exports exactly nineteen resolve functions", resolveFns.length === 19, `got ${resolveFns.length}: ${resolveFns.join(", ")}`);
  ok("resolveCondensatePumpInstallation is one of them", resolveFns.some((f) => f.includes("resolveCondensatePumpInstallation")));
  ok("resolveThermostatInstallation is one of them", resolveFns.some((f) => f.includes("resolveThermostatInstallation")));
  ok("resolveCondensateSafetySwitchInstallation is one of them", resolveFns.some((f) => f.includes("resolveCondensateSafetySwitchInstallation")));
  ok("resolveAirFilterReplacement is one of them", resolveFns.some((f) => f.includes("resolveAirFilterReplacement")));
  ok("resolveAcTuneUp is one of them", resolveFns.some((f) => f.includes("resolveAcTuneUp")));
  ok("resolveFurnaceTuneUp is one of them", resolveFns.some((f) => f.includes("resolveFurnaceTuneUp")));
  ok("resolveHeatPumpTuneUp is one of them", resolveFns.some((f) => f.includes("resolveHeatPumpTuneUp")));
  ok("resolveMiniSplitTuneUp is one of them", resolveFns.some((f) => f.includes("resolveMiniSplitTuneUp")));
  ok("resolveAirCleanerCabinetInstallation is one of them", resolveFns.some((f) => f.includes("resolveAirCleanerCabinetInstallation")));
  ok("resolveDuctAirTreatmentInstallation is one of them", resolveFns.some((f) => f.includes("resolveDuctAirTreatmentInstallation")));
  ok("resolveAccessoryConsumableReplacement is one of them", resolveFns.some((f) => f.includes("resolveAccessoryConsumableReplacement")));
  ok("resolveMiniSplitHeadCleaning is one of them", resolveFns.some((f) => f.includes("resolveMiniSplitHeadCleaning")));
  ok("resolveWholeHouseHumidifier is one of them", resolveFns.some((f) => f.includes("resolveWholeHouseHumidifier")));
  ok("resolveVentCoverReplacement is one of them", resolveFns.some((f) => f.includes("resolveVentCoverReplacement")));
  ok("resolveFurnaceReplacement is one of the five H11 adds", resolveFns.some((f) => f.includes("resolveFurnaceReplacement")));
  ok("resolveAcReplacement is one of the five H11 adds", resolveFns.some((f) => f.includes("resolveAcReplacement")));
  ok("resolveHeatPumpReplacement is one of the five H11 adds", resolveFns.some((f) => f.includes("resolveHeatPumpReplacement")));
  ok("resolveWholeSystemReplacement is one of the five H11 adds", resolveFns.some((f) => f.includes("resolveWholeSystemReplacement")));
  ok("resolveMiniSplitInstallation is the nineteenth", resolveFns.some((f) => f.includes("resolveMiniSplitInstallation")));
  ok(
    "no resolveCondenserPadReplacement exists — deferred, per the H5 pad audit decision, still deferred; not reopened by H9 or H11",
    !resolveFns.some((f) => f.includes("resolveCondenserPadReplacement"))
  );
  ok(
    "no resolveDuctAssessment exists — APPOINTMENT_ONLY, never priced, deliberately kept out of this file",
    !resolveFns.some((f) => f.includes("resolveDuctAssessment"))
  );
  ok(
    "no resolveHvacServiceCall exists — APPOINTMENT_ONLY/TROUBLESHOOT_ONLY, existing G2/G3 shell remains authority",
    !resolveFns.some((f) => f.includes("resolveHvacServiceCall"))
  );
  ok("no second HVAC service resolver file exists anywhere in lib/hvac", !existsSync(join(ROOT, "lib/hvac/scope2.ts")));
}

// ═══════════════════════════════════════════════════════════════════════
// H4 — the second executable tree: thermostat-installation
// ═══════════════════════════════════════════════════════════════════════

const THERMOSTAT_REPLACEMENT_FACTS: ThermostatInstallationFacts = {
  systemType: "FURNACE_AND_AC",
  controlPresent: "PRESENT_WORKING",
  terminalScheme: "STANDARD_LETTERED",
  commonWire: "PRESENT",
  supplyArrangement: "CUSTOMER_SUPPLIED",
  runBand: "STANDARD",
};

const THERMOSTAT_NEW_LOCATION_FACTS: ThermostatInstallationFacts = {
  systemType: "FURNACE_AND_AC",
  controlPresent: "ABSENT",
  terminalScheme: "UNKNOWN",
  commonWire: "UNKNOWN",
  supplyArrangement: "CUSTOMER_SUPPLIED",
  runBand: "STANDARD",
};

group("42. H3's condensate behavior is byte-for-byte unchanged by the H4 restructure");
{
  // Re-runs H3's own group-32/33/35/36 assertions verbatim against the
  // POST-restructure scope.ts — proving the shared-code extraction
  // (HvacRefusal, refuse(), SupplyArrangementChoice) changed nothing
  // observable about the condensate resolver's behavior.
  const BASE: CondensatePumpInstallationFacts = {
    accessClass: "ACCESSIBLE",
    condensateRoute: "PUMP_PRESENT",
    supplyArrangement: "CUSTOMER_SUPPLIED",
    dedicatedCircuitPresent: "PRESENT",
    runBand: "STANDARD",
  };
  const replacement = resolveCondensatePumpInstallation(BASE);
  ok(
    "condensate replacement still resolves to RESOLVE_ADJUSTED/REPLACEMENT",
    replacement.status === "RESOLVED" && replacement.routeAction === "RESOLVE_ADJUSTED" && replacement.branch === "REPLACEMENT"
  );
  const newInstall = resolveCondensatePumpInstallation({ ...BASE, condensateRoute: "NONE_VISIBLE" });
  ok(
    "condensate new-installation still resolves to RESOLVE_ADJUSTED/NEW_INSTALLATION",
    newInstall.status === "RESOLVED" && newInstall.routeAction === "RESOLVE_ADJUSTED" && newInstall.branch === "NEW_INSTALLATION"
  );
  const accessUnknown = resolveCondensatePumpInstallation({ ...BASE, accessClass: "UNKNOWN" });
  ok("condensate unresolved access still fails to PHOTO_REVIEW", accessUnknown.status === "REFUSED" && accessUnknown.routeAction === "PHOTO_REVIEW");
  const powerAbsent = resolveCondensatePumpInstallation({ ...BASE, condensateRoute: "NONE_VISIBLE", dedicatedCircuitPresent: "ABSENT" });
  ok("condensate dedicated_circuit_present=ABSENT still REMOTE_QUOTEs", powerAbsent.status === "REFUSED" && powerAbsent.routeAction === "REMOTE_QUOTE");
  ok("CONDENSATE_PUMP_QUESTIONS still has its original question count", CONDENSATE_PUMP_QUESTIONS.length > 0);
}

group("43. thermostat-installation is the second, and only the second, executable service");
{
  const declaredFamilies = HVAC_SERVICE_FAMILIES["thermostat-installation"].map((u) => u.family);
  ok("thermostat-installation is declared in H2's family map", declaredFamilies.length > 0);
  ok("thermostat-installation's access slot is PRIMARY, per H2's own declaration", JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["thermostat-installation"]) === JSON.stringify(["PRIMARY"]));
  const replacement = resolveThermostatInstallation(THERMOSTAT_REPLACEMENT_FACTS);
  ok(
    "a fully-resolved replacement path RESOLVES to RESOLVE_ADJUSTED/REPLACEMENT",
    replacement.status === "RESOLVED" && replacement.routeAction === "RESOLVE_ADJUSTED" && replacement.branch === "REPLACEMENT"
  );
  const newLocation = resolveThermostatInstallation(THERMOSTAT_NEW_LOCATION_FACTS);
  ok(
    "a fully-resolved new-location path RESOLVES to RESOLVE_ADJUSTED/NEW_LOCATION",
    newLocation.status === "RESOLVED" && newLocation.routeAction === "RESOLVE_ADJUSTED" && newLocation.branch === "NEW_LOCATION"
  );
}

group("44. exact supported/excluded system types — Q1");
{
  const excluded: readonly ThermostatInstallationFacts["systemType"][] = ["BOILER_HYDRONIC", "MINI_SPLIT_DUCTLESS"];
  for (const systemType of excluded) {
    const r = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, systemType });
    ok(`${systemType} is excluded — refused before any control question`, r.status === "REFUSED" && r.outcome.factKey === "system_type", r.status === "REFUSED" ? r.outcome.factKey : "resolved");
  }
  const supported: readonly ThermostatInstallationFacts["systemType"][] = [
    "FURNACE_AND_AC",
    "HEAT_PUMP_SPLIT",
    "DUAL_FUEL",
    "PACKAGE_UNIT",
    "AIR_HANDLER_ONLY",
  ];
  for (const systemType of supported) {
    const r = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, systemType });
    ok(`${systemType} is supported — resolves past identity`, r.status === "RESOLVED" || (r.status === "REFUSED" && r.outcome.factKey !== "system_type"));
  }
  const unknown = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, systemType: "UNKNOWN" });
  ok("UNKNOWN system_type fails to PHOTO_REVIEW, not to a diagnosis", unknown.status === "REFUSED" && unknown.routeAction === "PHOTO_REVIEW");
}

group("45. control_present=ABSENT stays inside this one canonical service — the merge decision");
{
  const absent = resolveThermostatInstallation({ ...THERMOSTAT_NEW_LOCATION_FACTS, controlPresent: "ABSENT" });
  ok("ABSENT resolves within thermostat-installation itself (NEW_LOCATION branch)", absent.status === "RESOLVED" && absent.branch === "NEW_LOCATION");
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok('scope.ts never produces REROUTE_SERVICE — the presence/absence merge rule holds for both trees', !/REROUTE_SERVICE/.test(scopeSrc));
}

group("46. generic controlGate(PRESENT_NOT_RESPONDING) still produces ON_SITE_SERVICE by default");
{
  const generic = controlGate("PRESENT_NOT_RESPONDING", { requiresCommonWire: false, commonWirePresent: "PRESENT" });
  ok(
    "with no opt-in, PRESENT_NOT_RESPONDING is still an on-site symptom, unchanged from H2",
    generic.action === "ON_SITE_SERVICE" && generic.factKey === "control_present"
  );
  const genericWithOptInFalse = controlGate("PRESENT_NOT_RESPONDING", {
    presentNotRespondingIsKnownWork: false,
    requiresCommonWire: false,
    commonWirePresent: "PRESENT",
  });
  ok("explicitly passing false reproduces the same default behavior", genericWithOptInFalse.action === "ON_SITE_SERVICE");
}

group("47. the known-work branch accepts PRESENT_NOT_RESPONDING as supporting evidence, not a reroute trigger");
{
  const notResponding = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, controlPresent: "PRESENT_NOT_RESPONDING" });
  ok(
    "thermostat-installation's replacement branch RESOLVES on PRESENT_NOT_RESPONDING, never ON_SITE_SERVICE",
    notResponding.status === "RESOLVED" && notResponding.branch === "REPLACEMENT"
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "the known-work opt-in is passed explicitly and only from resolveThermostatInstallation, not made the new default",
    /presentNotRespondingIsKnownWork:\s*true/.test(scopeSrc)
  );
  const gatesSrc = strip("lib/hvac/gates.ts");
  ok(
    "controlGate's own PRESENT_NOT_RESPONDING branch is still gated behind the opt-in, not unconditional",
    /present === "PRESENT_NOT_RESPONDING" && !opts\.presentNotRespondingIsKnownWork/.test(gatesSrc)
  );
}

group("48. symptom-only phrasing cannot enter the thermostat tree");
{
  const treeSrc = strip("lib/hvac/scope.ts");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" (thermostat section included)`, !treeSrc.includes(symptom));
  }
  const optionValues = THERMOSTAT_QUESTIONS.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no thermostat answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );
  const symptomPhrases = ["not working", "no heat", "no cooling", "won't turn on", "blank screen"];
  const allWording = THERMOSTAT_QUESTIONS.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)])
    .join(" ")
    .toLowerCase();
  ok("no thermostat question prompt or answer label contains symptom phrasing", symptomPhrases.every((p) => !allWording.includes(p)));
}

group("49. terminal_scheme lives inside existing_control — no new family, no new gate, no new primitive");
{
  ok("HVAC_FAMILIES is now exactly 19 — no new family was added for terminal_scheme specifically (H8 and H9 later added three, for unrelated facts)", HVAC_FAMILIES.length === 19);
  ok("HVAC_GATE_KEYS is still exactly 7 — no new gate was added", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS is still exactly 7 — no new primitive was added", HVAC_PRIMITIVE_KEYS.length === 7);
  const existingControl = HVAC_FAMILIES.find((f) => f.key === "existing_control")!;
  ok(
    "existing_control now establishes terminal_scheme, alongside its original four facts",
    existingControl.establishes.includes("terminal_scheme") &&
      existingControl.establishes.includes("control_present") &&
      existingControl.establishes.includes("conductor_count") &&
      existingControl.establishes.includes("common_wire") &&
      existingControl.establishes.includes("thermostat_count")
  );
  ok("existing_control still routes only through control_gate", JSON.stringify(existingControl.gates) === JSON.stringify(["control_gate"]));
}

group("50. proprietary/communicating terminal labeling REMOTE_QUOTEs; unknown labeling PHOTO_REVIEWs");
{
  const proprietary = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, terminalScheme: "MANUFACTURER_SPECIFIC" });
  ok(
    "MANUFACTURER_SPECIFIC -> REMOTE_QUOTE, never priced as a standard swap",
    proprietary.status === "REFUSED" && proprietary.routeAction === "REMOTE_QUOTE" && proprietary.outcome.factKey === "terminal_scheme"
  );
  const unknownScheme = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, terminalScheme: "UNKNOWN" });
  ok(
    "UNKNOWN terminal_scheme -> PHOTO_REVIEW, before common_wire is even asked",
    unknownScheme.status === "REFUSED" && unknownScheme.routeAction === "PHOTO_REVIEW" && unknownScheme.outcome.factKey === "terminal_scheme"
  );
}

group("51. common_wire present/absent/unknown behaviors, only reached after terminal_scheme clears");
{
  const present = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, commonWire: "PRESENT" });
  ok("common_wire=PRESENT resolves", present.status === "RESOLVED");
  const absent = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, commonWire: "ABSENT" });
  ok(
    "common_wire=ABSENT -> REMOTE_QUOTE, unconditionally — no automatic adapter",
    absent.status === "REFUSED" && absent.routeAction === "REMOTE_QUOTE" && absent.outcome.factKey === "common_wire"
  );
  const unknown = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, commonWire: "UNKNOWN" });
  ok(
    "common_wire=UNKNOWN -> PHOTO_REVIEW",
    unknown.status === "REFUSED" && unknown.routeAction === "PHOTO_REVIEW" && unknown.outcome.factKey === "common_wire"
  );
}

group("52. no automatic C-wire adapter or component — conductor_count is declared but not read by the live resolver");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "ThermostatInstallationFacts has no conductorCount field — structurally unreadable by this resolver, not merely unused",
    !/conductorCount/.test(scopeSrc)
  );
  ok(
    "scope.ts's thermostat section never references a C-wire adapter or component_increment",
    !/adapter|component_increment/i.test(section(scopeSrc, "export type ThermostatInstallationFacts", "export type CondensateSafetySwitchFacts"))
  );
  const existingControl = HVAC_FAMILIES.find((f) => f.key === "existing_control")!;
  ok(
    "conductor_count remains declared on existing_control for domain completeness, per the H4 decision",
    existingControl.establishes.includes("conductor_count")
  );
  ok(
    "but it is not one of the facts the live THERMOSTAT_QUESTIONS tree asks",
    !THERMOSTAT_QUESTIONS.some((q) => q.establishes === "conductor_count")
  );
}

group("53. new-location run band: STANDARD/EXTENDED resolve, OVER_BAND REMOTE_QUOTEs, UNKNOWN PHOTO_REVIEWs");
{
  const standard = resolveThermostatInstallation({ ...THERMOSTAT_NEW_LOCATION_FACTS, runBand: "STANDARD" });
  ok("STANDARD run resolves", standard.status === "RESOLVED" && standard.branch === "NEW_LOCATION");
  const extended = resolveThermostatInstallation({ ...THERMOSTAT_NEW_LOCATION_FACTS, runBand: "EXTENDED" });
  ok(
    "EXTENDED run also resolves — control_wire_run.breakpoints has TWO boundaries, a real three-band policy",
    extended.status === "RESOLVED" && extended.branch === "NEW_LOCATION"
  );
  const overBand = resolveThermostatInstallation({ ...THERMOSTAT_NEW_LOCATION_FACTS, runBand: "OVER_BAND" });
  ok("OVER_BAND -> REMOTE_QUOTE", overBand.status === "REFUSED" && overBand.routeAction === "REMOTE_QUOTE" && overBand.outcome.factKey === "run_band");
  const unknownBand = resolveThermostatInstallation({ ...THERMOSTAT_NEW_LOCATION_FACTS, runBand: "UNKNOWN" });
  ok("UNKNOWN run -> PHOTO_REVIEW", unknownBand.status === "REFUSED" && unknownBand.routeAction === "PHOTO_REVIEW" && unknownBand.outcome.factKey === "run_band");
  ok(
    "THERMOSTAT_QUESTIONS' run_distance question offers all three real bands, unlike condensate's one-boundary policy",
    THERMOSTAT_QUESTIONS.find((q) => q.key === "run_distance")!.options.some((o) => o.value === "EXTENDED")
  );
}

group("54. finish_disruption_ack stays a disclaimer, never a route gate or a price switch");
{
  const familiesSrc = strip("lib/hvac/families.ts");
  ok(
    "finish_disruption_ack's own family declaration binds conditional_disclaimer, not a gate",
    /finish_disruption_ack[\s\S]{0,400}gates:\s*\[\]/.test(familiesSrc)
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "resolveThermostatInstallation never branches on a finish-disruption fact",
    !/finishDisruption|finish_disruption/.test(scopeSrc)
  );
}

group("55. no diagnosis, repair, or component inference anywhere in the thermostat tree");
{
  const diagnosticLanguage =
    /\b(blocked|clogged|failed|failing|broken|defective|refrigerant|low on|leaking from|leak in|worn|corroded internally|burnt out|malfunction)\b/i;
  for (const q of THERMOSTAT_QUESTIONS) {
    ok(`"${q.key}"'s prompt names no cause`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no cause`, !diagnosticLanguage.test(o.label), o.label);
    }
  }
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "scope.ts declares no material role, component, or prerequisite for the thermostat tree either",
    !/materialRoles|components:|ScopeConsequence/.test(scopeSrc)
  );
}

group("56. the thermostat tree's questions match H2's own family declaration for this service");
{
  const declaredFamilies = HVAC_SERVICE_FAMILIES["thermostat-installation"].map((u) => u.family);
  const establishedFacts = new Set(THERMOSTAT_QUESTIONS.map((q) => q.establishes));
  ok("system_identity is asked (establishes system_type)", declaredFamilies.includes("system_identity") && establishedFacts.has("system_type"));
  ok("existing_control is asked (establishes control_present, terminal_scheme, common_wire)", declaredFamilies.includes("existing_control") && establishedFacts.has("control_present") && establishedFacts.has("terminal_scheme") && establishedFacts.has("common_wire"));
  ok(
    "supply_arrangement is asked on both branches",
    declaredFamilies.includes("supply_arrangement") && THERMOSTAT_QUESTIONS.filter((q) => q.establishes === "supply_arrangement").length === 2
  );
  ok(
    "run_distance is asked only on the NEW_LOCATION branch",
    declaredFamilies.includes("run_distance") && THERMOSTAT_QUESTIONS.filter((q) => q.establishes === "run_band").every((q) => q.branch === "NEW_LOCATION")
  );
  ok(
    "finish_disruption_ack is declared on the NEW_LOCATION branch and asks no live question (disclaimer-only)",
    HVAC_SERVICE_FAMILIES["thermostat-installation"].some((u) => u.family === "finish_disruption_ack" && u.branch) &&
      !establishedFacts.has("finish_disruption_ack")
  );
  ok(
    "thermostat_count is asked on the REPLACEMENT branch as a quantity, gating nothing",
    THERMOSTAT_QUESTIONS.some((q) => q.key === "thermostat_count" && q.branch === "REPLACEMENT" && q.options.length === 0)
  );
}

group("57. all prior H1-H3/G5 invariants remain green after the H4 restructure");
{
  ok("HVAC_SERVICES still has exactly 22 entries", HVAC_SERVICES.length === 22);
  ok("HVAC_FAMILIES has exactly 19 entries (fifteen from H2, plus H8's two and H9's one narrow additions)", HVAC_FAMILIES.length === 19);
  ok("HVAC_GATE_KEYS still has exactly 7 entries", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS still has exactly 7 entries", HVAC_PRIMITIVE_KEYS.length === 7);
  ok("lib/hvac/composition.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/composition.ts")));
  ok("lib/hvac/publish.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/publish.ts")));
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok("scope.ts still imports nothing from lib/plumbing", !/from ["'`]\.\.?\/.*plumbing/.test(scopeSrc));
  ok("scope.ts still imports nothing electrical-specific", !/from ["'`]\.\.?\/.*electrical/.test(scopeSrc));
  ok("scope.ts still imports nothing from lib/hvac/mappings.ts", !/from ["'`]\.\/mappings["'`]/.test(scopeSrc));
  ok("scope.ts still imports nothing from lib/hvac/primitives.ts — no primitive is activated by either tree", !/from ["'`]\.\/primitives["'`]/.test(scopeSrc));
}

// ═══════════════════════════════════════════════════════════════════════
// H5 — two more executable trees: condensate-safety-switch-installation
// and air-filter-replacement. condenser-pad-replacement is explicitly
// DEFERRED — no resolver, no facts type, no question data for it anywhere
// in this file (group 41, above, already proves its resolver's absence).
// ═══════════════════════════════════════════════════════════════════════

group("58. H3's condensate and H4's thermostat behavior are unchanged by the H5 addition");
{
  // Re-runs the same probes group 42 already ran after H4 — proving the
  // H5 addition (two new, independent resolvers, one new shared helper)
  // changed nothing observable about either earlier tree.
  const BASE: CondensatePumpInstallationFacts = {
    accessClass: "ACCESSIBLE",
    condensateRoute: "PUMP_PRESENT",
    supplyArrangement: "CUSTOMER_SUPPLIED",
    dedicatedCircuitPresent: "PRESENT",
    runBand: "STANDARD",
  };
  const condensatePump = resolveCondensatePumpInstallation(BASE);
  ok(
    "condensate-pump-installation still resolves to RESOLVE_ADJUSTED/REPLACEMENT",
    condensatePump.status === "RESOLVED" && condensatePump.routeAction === "RESOLVE_ADJUSTED" && condensatePump.branch === "REPLACEMENT"
  );
  const thermostat = resolveThermostatInstallation(THERMOSTAT_REPLACEMENT_FACTS);
  ok(
    "thermostat-installation still resolves to RESOLVE_ADJUSTED/REPLACEMENT",
    thermostat.status === "RESOLVED" && thermostat.routeAction === "RESOLVE_ADJUSTED" && thermostat.branch === "REPLACEMENT"
  );
  const thermostatNotResponding = resolveThermostatInstallation({ ...THERMOSTAT_REPLACEMENT_FACTS, controlPresent: "PRESENT_NOT_RESPONDING" });
  ok(
    "thermostat-installation's known-work PRESENT_NOT_RESPONDING opt-in still resolves, not ON_SITE_SERVICE",
    thermostatNotResponding.status === "RESOLVED"
  );
  const generic = controlGate("PRESENT_NOT_RESPONDING", { requiresCommonWire: false, commonWirePresent: "PRESENT" });
  ok("controlGate's un-opted-in default still refuses to ON_SITE_SERVICE", generic.action === "ON_SITE_SERVICE");
}

const SAFETY_SWITCH_BASE: CondensateSafetySwitchFacts = {
  accessClass: "ACCESSIBLE",
  condensateRoute: "PUMP_PRESENT",
};

group("59. condensate-safety-switch-installation resolves FIXED (RESOLVE_INSTANT), not CONDITIONAL_FIXED");
{
  const pumpPresent = resolveCondensateSafetySwitchInstallation(SAFETY_SWITCH_BASE);
  ok(
    "PUMP_PRESENT resolves to RESOLVE_INSTANT",
    pumpPresent.status === "RESOLVED" && pumpPresent.routeAction === "RESOLVE_INSTANT"
  );
  const gravityDrain = resolveCondensateSafetySwitchInstallation({ ...SAFETY_SWITCH_BASE, condensateRoute: "GRAVITY_DRAIN_PRESENT" });
  ok(
    "GRAVITY_DRAIN_PRESENT ALSO resolves to RESOLVE_INSTANT — same one-price terminal, no branch adjustment",
    gravityDrain.status === "RESOLVED" && gravityDrain.routeAction === "RESOLVE_INSTANT"
  );
  ok(
    "the catalog's own disposition for this service is FIXED, matching the RESOLVE_INSTANT terminal used here",
    HVAC_SERVICES.find((s) => s.key === "condensate-safety-switch-installation")?.disposition === "FIXED"
  );
}

group("60. condensate-safety-switch-installation's fixed branches stay inside the same service — no REROUTE_SERVICE");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const safetySwitchSection = section(scopeSrc, "export type CondensateSafetySwitchFacts", "export type AirFilterReplacementFacts");
  ok("no REROUTE_SERVICE anywhere in the safety-switch section", !/REROUTE_SERVICE/.test(safetySwitchSection));
  const pumpPresent = resolveCondensateSafetySwitchInstallation(SAFETY_SWITCH_BASE);
  const gravityDrain = resolveCondensateSafetySwitchInstallation({ ...SAFETY_SWITCH_BASE, condensateRoute: "GRAVITY_DRAIN_PRESENT" });
  ok(
    "both PUMP_PRESENT and GRAVITY_DRAIN_PRESENT resolve — neither leaves this one canonical service",
    pumpPresent.status === "RESOLVED" && gravityDrain.status === "RESOLVED"
  );
}

group("61. condensate-safety-switch-installation fails closed — access, route UNKNOWN, and NONE_VISIBLE all PHOTO_REVIEW");
{
  const accessUnknown = resolveCondensateSafetySwitchInstallation({ ...SAFETY_SWITCH_BASE, accessClass: "UNKNOWN" });
  ok("unresolved access -> PHOTO_REVIEW", accessUnknown.status === "REFUSED" && accessUnknown.routeAction === "PHOTO_REVIEW");

  const routeUnknown = resolveCondensateSafetySwitchInstallation({ ...SAFETY_SWITCH_BASE, condensateRoute: "UNKNOWN" });
  ok(
    "condensate_route=UNKNOWN -> PHOTO_REVIEW, observed carried as UNKNOWN",
    routeUnknown.status === "REFUSED" && routeUnknown.routeAction === "PHOTO_REVIEW" && routeUnknown.outcome.observed === "UNKNOWN"
  );

  const noneVisible = resolveCondensateSafetySwitchInstallation({ ...SAFETY_SWITCH_BASE, condensateRoute: "NONE_VISIBLE" });
  ok(
    "condensate_route=NONE_VISIBLE -> PHOTO_REVIEW (the settled H5 decision — NOT the same treatment condensate-pump-installation gives it)",
    noneVisible.status === "REFUSED" && noneVisible.routeAction === "PHOTO_REVIEW"
  );
  ok(
    "NONE_VISIBLE's own observed value is carried through, not silently rewritten to UNKNOWN",
    noneVisible.status === "REFUSED" && noneVisible.outcome.observed === "NONE_VISIBLE"
  );
  ok(
    "and it is never REMOTE_QUOTE — a FIXED-disposition service has no such branch to reach",
    noneVisible.status === "REFUSED" && (noneVisible.routeAction as string) !== "REMOTE_QUOTE"
  );
}

group("62. condensate-safety-switch-installation's base scope is exactly one switch — no quantity, no supply_arrangement");
{
  ok(
    "CondensateSafetySwitchFacts has no quantity field",
    !/CondensateSafetySwitchFacts[\s\S]{0,300}quantity/i.test(strip("lib/hvac/scope.ts"))
  );
  ok(
    "CondensateSafetySwitchFacts has no supplyArrangement field",
    !/CondensateSafetySwitchFacts\s*=\s*\{[\s\S]{0,300}supplyArrangement/i.test(strip("lib/hvac/scope.ts"))
  );
  ok(
    "no supply_arrangement question appears in CONDENSATE_SAFETY_SWITCH_QUESTIONS",
    !CONDENSATE_SAFETY_SWITCH_QUESTIONS.some((q) => q.establishes === "supply_arrangement")
  );
  ok("CONDENSATE_SAFETY_SWITCH_QUESTIONS has exactly two questions", CONDENSATE_SAFETY_SWITCH_QUESTIONS.length === 2);
  const declaredFamilies = HVAC_SERVICE_FAMILIES["condensate-safety-switch-installation"].map((u) => u.family);
  ok(
    "matches H2's own family declaration exactly: indoor_equipment_access + condensate_route, nothing else",
    JSON.stringify([...declaredFamilies].sort()) === JSON.stringify(["condensate_route", "indoor_equipment_access"].sort())
  );
}

const FILTER_BASE: AirFilterReplacementFacts = { filterSlotSize: "16x25x1", quantity: 1 };

group("63. air-filter-replacement: a readable size and quantity resolve FIXED (RESOLVE_INSTANT)");
{
  const resolved = resolveAirFilterReplacement(FILTER_BASE);
  ok("a readable size resolves to RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  const multiple = resolveAirFilterReplacement({ ...FILTER_BASE, quantity: 3 });
  ok("quantity gates nothing — 3 filters resolves exactly the same as 1", multiple.status === "RESOLVED" && multiple.routeAction === "RESOLVE_INSTANT");
  ok(
    "the catalog's own disposition for this service is FIXED, matching the RESOLVE_INSTANT terminal used here",
    HVAC_SERVICES.find((s) => s.key === "air-filter-replacement")?.disposition === "FIXED"
  );
}

group("64. air-filter-replacement: an unreadable size fails to PHOTO_REVIEW, and there is no REMOTE_QUOTE branch");
{
  const unreadable = resolveAirFilterReplacement({ ...FILTER_BASE, filterSlotSize: null });
  ok(
    "filterSlotSize=null -> PHOTO_REVIEW",
    unreadable.status === "REFUSED" && unreadable.routeAction === "PHOTO_REVIEW" && unreadable.outcome.factKey === "filter_slot_size"
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  const filterSection = section(scopeSrc, "export type AirFilterReplacementFacts", "export type TuneUpResolution");
  ok("no REMOTE_QUOTE anywhere in the air-filter section", !/REMOTE_QUOTE/.test(filterSection));
  ok("no filter compatibility language (fits, compatible, works with) anywhere in the air-filter section", !/\b(fits|compatible|works with)\b/i.test(filterSection));
}

group("65. no accessory-presence or location question leaks into air-filter-replacement");
{
  ok(
    "AirFilterReplacementFacts has no accessoryPresent or replacementVsNew field",
    !/AirFilterReplacementFacts[\s\S]{0,300}(accessoryPresent|replacementVsNew)/i.test(strip("lib/hvac/scope.ts"))
  );
  ok(
    "AirFilterReplacementFacts has no indoor-location or access-class field",
    !/AirFilterReplacementFacts\s*=\s*\{[\s\S]{0,300}(indoorLocation|accessClass)/i.test(strip("lib/hvac/scope.ts"))
  );
  ok(
    "no accessory_present, replacement_vs_new, or indoor_location question in AIR_FILTER_REPLACEMENT_QUESTIONS",
    !AIR_FILTER_REPLACEMENT_QUESTIONS.some((q) => ["accessory_present", "replacement_vs_new", "indoor_location"].includes(q.establishes))
  );
  ok("AIR_FILTER_REPLACEMENT_QUESTIONS has exactly two questions", AIR_FILTER_REPLACEMENT_QUESTIONS.length === 2);
  const declaredFamilies = HVAC_SERVICE_FAMILIES["air-filter-replacement"].map((u) => u.family);
  ok(
    "matches H2's own family declaration exactly: accessory_and_media only, nothing else",
    JSON.stringify(declaredFamilies) === JSON.stringify(["accessory_and_media"])
  );
}

group("66. no symptom vocabulary enters either new H5 tree");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" (H5 sections included)`, !scopeSrc.includes(symptom));
  }
  const allQuestions = [...CONDENSATE_SAFETY_SWITCH_QUESTIONS, ...AIR_FILTER_REPLACEMENT_QUESTIONS];
  const optionValues = allQuestions.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no H5 answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );
  const symptomPhrases = ["leaking water", "not cooling", "no cooling", "no heat", "overflowing", "blocked", "failed", "won't turn on"];
  const allWording = allQuestions
    .flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)])
    .join(" ")
    .toLowerCase();
  ok("no H5 question prompt or answer label contains symptom phrasing", symptomPhrases.every((p) => !allWording.includes(p)));
}

group("67. no diagnosis or component-repair inference in either new H5 tree");
{
  const diagnosticLanguage =
    /\b(blocked|clogged|failed|failing|broken|defective|refrigerant|low on|leaking from|leak in|worn|corroded internally|burnt out|malfunction|overflow(ing)?)\b/i;
  const allQuestions = [...CONDENSATE_SAFETY_SWITCH_QUESTIONS, ...AIR_FILTER_REPLACEMENT_QUESTIONS];
  for (const q of allQuestions) {
    ok(`"${q.key}"'s prompt names no cause`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no cause`, !diagnosticLanguage.test(o.label), o.label);
    }
  }
  const scopeSrc = strip("lib/hvac/scope.ts");
  const bothH5Sections = section(scopeSrc, "export type CondensateSafetySwitchFacts", "export type TuneUpResolution");
  ok(
    "no refusal reason in either H5 section names a blocked drain or an overflow diagnosis",
    !/blocked drain|overflow(ing)? (drain|switch)|diagnos/i.test(bothH5Sections)
  );
}

group("68. WWT stays catalog/commercial metadata only — H5 touches no booking, cart, or scheduling surface");
{
  const safetySwitch = HVAC_SERVICES.find((s) => s.key === "condensate-safety-switch-installation")!;
  const airFilter = HVAC_SERVICES.find((s) => s.key === "air-filter-replacement")!;
  ok("condensate-safety-switch-installation still declares whileWeThereOnly: true, unchanged since H1", safetySwitch.whileWeThereOnly === true);
  ok("air-filter-replacement still declares whileWeThereOnly: true, unchanged since H1", airFilter.whileWeThereOnly === true);
  const scopeSrc = strip("lib/hvac/scope.ts");
  const bothH5Sections = section(scopeSrc, "export type CondensateSafetySwitchFacts", "export type TuneUpResolution");
  ok(
    "neither H5 section references cart, scheduling, booking capacity, or technician-bonus concepts",
    !/liveCart|LiveCart|schedul|bookingCapacity|technicianBonus|serviceFee|checkout/i.test(bothH5Sections)
  );
  ok("lib/hvac/appointments.ts is untouched by H5 (still exports the same shell)", strip("lib/hvac/appointments.ts").includes("HVAC_SERVICE_CALL_SHELL"));
}

group("69. condenser-pad-replacement's H1 catalog entry is untouched — deferred, not removed or altered");
{
  const pad = HVAC_SERVICES.find((s) => s.key === "condenser-pad-replacement");
  ok("condenser-pad-replacement still exists in the catalog", pad !== undefined);
  ok("its disposition is still CONDITIONAL_FIXED, unchanged", pad?.disposition === "CONDITIONAL_FIXED");
  ok("it is still whileWeThereOnly: true, unchanged", pad?.whileWeThereOnly === true);
  ok(
    "HVAC_SERVICES is still exactly 22 entries — deferring the resolver did not touch the catalog count",
    HVAC_SERVICES.length === 22
  );
  ok(
    "its H2 family declaration (outdoor_equipment_access + existing_condition) is still intact, unchanged",
    JSON.stringify([...HVAC_SERVICE_FAMILIES["condenser-pad-replacement"].map((u) => u.family)].sort()) ===
      JSON.stringify(["existing_condition", "outdoor_equipment_access"].sort())
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H6 — the four tune-ups: ac-tune-up, furnace-tune-up, heat-pump-tune-up,
// mini-split-tune-up. condenser-pad-replacement remains deferred (group 41
// and group 69, above, already prove its resolver's continued absence).
// ═══════════════════════════════════════════════════════════════════════

group("70. H3-H5 behavior is unchanged by the H6 addition");
{
  const BASE: CondensatePumpInstallationFacts = {
    accessClass: "ACCESSIBLE",
    condensateRoute: "PUMP_PRESENT",
    supplyArrangement: "CUSTOMER_SUPPLIED",
    dedicatedCircuitPresent: "PRESENT",
    runBand: "STANDARD",
  };
  const condensatePump = resolveCondensatePumpInstallation(BASE);
  ok("condensate-pump-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", condensatePump.status === "RESOLVED" && condensatePump.routeAction === "RESOLVE_ADJUSTED");
  const thermostat = resolveThermostatInstallation(THERMOSTAT_REPLACEMENT_FACTS);
  ok("thermostat-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", thermostat.status === "RESOLVED" && thermostat.routeAction === "RESOLVE_ADJUSTED");
  const safetySwitch = resolveCondensateSafetySwitchInstallation({ accessClass: "ACCESSIBLE", condensateRoute: "PUMP_PRESENT" });
  ok("condensate-safety-switch-installation still resolves RESOLVE_INSTANT", safetySwitch.status === "RESOLVED" && safetySwitch.routeAction === "RESOLVE_INSTANT");
  const filter = resolveAirFilterReplacement({ filterSlotSize: "16x25x1", quantity: 1 });
  ok("air-filter-replacement still resolves RESOLVE_INSTANT", filter.status === "RESOLVED" && filter.routeAction === "RESOLVE_INSTANT");
  ok(
    "H3/H4/H5's own condensate-safety-switch, air-filter and thermostat question data are all still exported and non-empty",
    CONDENSATE_SAFETY_SWITCH_QUESTIONS.length === 2 && AIR_FILTER_REPLACEMENT_QUESTIONS.length === 2 && THERMOSTAT_QUESTIONS.length > 0
  );
}

const AC_TUNE_UP_BASE: AcTuneUpFacts = {
  systemType: "FURNACE_AND_AC",
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  systemCount: 1,
};

group("71. ac-tune-up resolves FIXED (RESOLVE_INSTANT) on the fully-resolved bounded path");
{
  const resolved = resolveAcTuneUp(AC_TUNE_UP_BASE);
  ok("supported identity + both known access slots + valid quantity -> RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  ok(
    "the catalog's own disposition for ac-tune-up is FIXED, matching the RESOLVE_INSTANT terminal used here",
    HVAC_SERVICES.find((s) => s.key === "ac-tune-up")?.disposition === "FIXED"
  );
  const multiSystem = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, systemCount: 3 });
  ok("quantity gates nothing — 3 systems resolves exactly the same as 1", multiSystem.status === "RESOLVED" && multiSystem.routeAction === "RESOLVE_INSTANT");
}

group("72. ac-tune-up's first V1 fixed tree supports exactly FURNACE_AND_AC");
{
  const supported = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, systemType: "FURNACE_AND_AC" });
  ok("FURNACE_AND_AC resolves", supported.status === "RESOLVED");
  const otherKnownTypes: readonly AcTuneUpFacts["systemType"][] = [
    "HEAT_PUMP_SPLIT",
    "DUAL_FUEL",
    "BOILER_HYDRONIC",
    "MINI_SPLIT_DUCTLESS",
    "PACKAGE_UNIT",
    "AIR_HANDLER_ONLY",
  ];
  for (const systemType of otherKnownTypes) {
    const r = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, systemType });
    ok(`${systemType} -> REMOTE_QUOTE, not silently accepted`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE" && r.outcome.factKey === "system_type");
  }
  const unknown = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN system_type -> PHOTO_REVIEW", unknown.status === "REFUSED" && unknown.routeAction === "PHOTO_REVIEW");
}

group("73. ac-tune-up gates both access slots independently, and outdoor_location=NONE fails closed");
{
  const indoorUnknown = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, indoorAccessClass: "UNKNOWN" });
  ok("indoor access UNKNOWN -> PHOTO_REVIEW", indoorUnknown.status === "REFUSED" && indoorUnknown.routeAction === "PHOTO_REVIEW");
  const outdoorAccessUnknown = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorAccessClass: "UNKNOWN" });
  ok("outdoor access UNKNOWN -> PHOTO_REVIEW", outdoorAccessUnknown.status === "REFUSED" && outdoorAccessUnknown.routeAction === "PHOTO_REVIEW");
  const outdoorLocationUnknown = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorLocation: "UNKNOWN" });
  ok("outdoor_location UNKNOWN -> PHOTO_REVIEW", outdoorLocationUnknown.status === "REFUSED" && outdoorLocationUnknown.routeAction === "PHOTO_REVIEW");
  const none = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorLocation: "NONE" });
  ok(
    "outdoor_location=NONE fails closed to PHOTO_REVIEW as a contradiction — a service whose scope requires an outdoor unit",
    none.status === "REFUSED" && none.routeAction === "PHOTO_REVIEW" && none.outcome.factKey === "outdoor_location" && none.outcome.observed === "NONE"
  );
  ok(
    "both indoor and outdoor are read as SEPARATE facts, never collapsed to one scalar access answer",
    !/AcTuneUpFacts\s*=\s*\{[\s\S]{0,400}\baccessClass\s*:\s*AccessClass;/.test(
      section(strip("lib/hvac/scope.ts"), "export type AcTuneUpFacts", "export type FurnaceTuneUpFacts")
    )
  );
}

group("74. ac-tune-up: known roof/wall location does NOT create a REMOTE_QUOTE branch — the settled post-G1 correction");
{
  const roof = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorLocation: "ROOF" });
  ok("ROOF with a known access class resolves -- NOT REMOTE_QUOTE", roof.status === "RESOLVED" && roof.routeAction === "RESOLVE_INSTANT");
  const wall = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorLocation: "WALL_OR_BALCONY_MOUNT" });
  ok("WALL_OR_BALCONY_MOUNT with a known access class resolves -- NOT REMOTE_QUOTE", wall.status === "RESOLVED" && wall.routeAction === "RESOLVE_INSTANT");
  const remote = resolveAcTuneUp({ ...AC_TUNE_UP_BASE, outdoorLocation: "GROUND_LEVEL_REMOTE" });
  ok("GROUND_LEVEL_REMOTE resolves identically to GROUND_LEVEL_ADJACENT", remote.status === "RESOLVED" && remote.routeAction === "RESOLVE_INSTANT");
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "no equipment_height or band-policy binding was introduced in H6",
    !/equipment_height|HEIGHT_BREAKPOINTS/i.test(scopeSrc)
  );
  ok(
    "outdoor_location's ROOF/WALL values never produce REMOTE_QUOTE anywhere in gateTwoSlotAccess",
    !/ROOF[\s\S]{0,200}REMOTE_QUOTE|WALL_OR_BALCONY_MOUNT[\s\S]{0,200}REMOTE_QUOTE/.test(scopeSrc)
  );
}

const FURNACE_TUNE_UP_BASE: FurnaceTuneUpFacts = {
  systemType: "FURNACE_AND_AC",
  fuelType: "NATURAL_GAS",
  accessClass: "ACCESSIBLE",
  systemCount: 1,
};

group("75. furnace-tune-up: exact system/fuel support, PRIMARY-only access, RESOLVE_INSTANT on the bounded path");
{
  const resolved = resolveFurnaceTuneUp(FURNACE_TUNE_UP_BASE);
  ok("NATURAL_GAS resolves to RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  const propane = resolveFurnaceTuneUp({ ...FURNACE_TUNE_UP_BASE, fuelType: "PROPANE" });
  ok("PROPANE also resolves to RESOLVE_INSTANT", propane.status === "RESOLVED" && propane.routeAction === "RESOLVE_INSTANT");

  const otherFuels: readonly FurnaceTuneUpFacts["fuelType"][] = ["OIL", "ELECTRIC", "DUAL_FUEL"];
  for (const fuelType of otherFuels) {
    const r = resolveFurnaceTuneUp({ ...FURNACE_TUNE_UP_BASE, fuelType });
    ok(`fuel ${fuelType} -> REMOTE_QUOTE, not silently accepted as gas/propane`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE" && r.outcome.factKey === "fuel_type");
  }
  const unknownFuel = resolveFurnaceTuneUp({ ...FURNACE_TUNE_UP_BASE, fuelType: "UNKNOWN" });
  ok("fuel UNKNOWN -> PHOTO_REVIEW", unknownFuel.status === "REFUSED" && unknownFuel.routeAction === "PHOTO_REVIEW");

  const otherTypes: readonly FurnaceTuneUpFacts["systemType"][] = ["HEAT_PUMP_SPLIT", "BOILER_HYDRONIC", "MINI_SPLIT_DUCTLESS", "PACKAGE_UNIT"];
  for (const systemType of otherTypes) {
    const r = resolveFurnaceTuneUp({ ...FURNACE_TUNE_UP_BASE, systemType });
    ok(`system type ${systemType} -> REMOTE_QUOTE`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE" && r.outcome.factKey === "system_type");
  }
  const unknownAccess = resolveFurnaceTuneUp({ ...FURNACE_TUNE_UP_BASE, accessClass: "UNKNOWN" });
  ok("access UNKNOWN -> PHOTO_REVIEW", unknownAccess.status === "REFUSED" && unknownAccess.routeAction === "PHOTO_REVIEW");

  ok(
    "the catalog's own disposition for furnace-tune-up is FIXED",
    HVAC_SERVICES.find((s) => s.key === "furnace-tune-up")?.disposition === "FIXED"
  );
  ok(
    "furnace-tune-up's G1 access slot is PRIMARY only, per H2's own declaration — no second slot",
    JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["furnace-tune-up"]) === JSON.stringify(["PRIMARY"])
  );
  ok(
    "FurnaceTuneUpFacts has no outdoor-facing field at all — genuinely single-location",
    !/FurnaceTuneUpFacts[\s\S]{0,300}outdoor/i.test(strip("lib/hvac/scope.ts"))
  );
}

group("76. furnace-tune-up does not render venting_class, heating_input_btu, or equipment_condition");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const furnaceSection = section(scopeSrc, "export type FurnaceTuneUpFacts", "export type HeatPumpTuneUpFacts");
  ok("no ventingClass field or venting_class question in the furnace-tune-up section", !/ventingClass|venting_class/i.test(furnaceSection));
  ok("no heatingInputBtu field or heating_input_btu question in the furnace-tune-up section", !/heatingInputBtu|heating_input_btu/i.test(furnaceSection));
  ok("no equipmentCondition field in the furnace-tune-up section", !/equipmentCondition|equipment_condition/i.test(furnaceSection));
  ok(
    "no question or refusal reason asks whether burners, ignition, venting, the heat exchanger, or safeties are good, bad, or safe",
    !/burners? (is|are) (good|bad|dirty)|ignition (is|good|bad)|venting (is )?(improper|bad)|heat exchanger (is )?(cracked|bad)|(is|are) (it |this )?(unsafe|safe)/i.test(furnaceSection)
  );
  ok(
    "FURNACE_TUNE_UP_QUESTIONS names no combustion-safety judgment",
    FURNACE_TUNE_UP_QUESTIONS.every((q) => !/crack|unsafe|dirty|improper/i.test(q.prompt))
  );
}

const HEAT_PUMP_TUNE_UP_BASE: HeatPumpTuneUpFacts = {
  systemType: "HEAT_PUMP_SPLIT",
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  systemCount: 1,
};

group("77. heat-pump-tune-up: exact identity support (HEAT_PUMP_SPLIT only), both access slots, NONE and roof/wall behavior");
{
  const resolved = resolveHeatPumpTuneUp(HEAT_PUMP_TUNE_UP_BASE);
  ok("HEAT_PUMP_SPLIT + both known access slots + valid quantity -> RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");

  const notAutoAccepted: readonly HeatPumpTuneUpFacts["systemType"][] = ["DUAL_FUEL", "PACKAGE_UNIT", "FURNACE_AND_AC", "BOILER_HYDRONIC", "MINI_SPLIT_DUCTLESS", "AIR_HANDLER_ONLY"];
  for (const systemType of notAutoAccepted) {
    const r = resolveHeatPumpTuneUp({ ...HEAT_PUMP_TUNE_UP_BASE, systemType });
    ok(`${systemType} -> REMOTE_QUOTE, NOT auto-accepted (DUAL_FUEL/PACKAGE_UNIT's maintenance topology is not represented by this H6 scope)`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE" && r.outcome.factKey === "system_type");
  }
  const unknownIdentity = resolveHeatPumpTuneUp({ ...HEAT_PUMP_TUNE_UP_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN identity -> PHOTO_REVIEW", unknownIdentity.status === "REFUSED" && unknownIdentity.routeAction === "PHOTO_REVIEW");

  const indoorUnknown = resolveHeatPumpTuneUp({ ...HEAT_PUMP_TUNE_UP_BASE, indoorAccessClass: "UNKNOWN" });
  ok("indoor access UNKNOWN -> PHOTO_REVIEW", indoorUnknown.status === "REFUSED" && indoorUnknown.routeAction === "PHOTO_REVIEW");
  const none = resolveHeatPumpTuneUp({ ...HEAT_PUMP_TUNE_UP_BASE, outdoorLocation: "NONE" });
  ok("outdoor_location=NONE fails closed", none.status === "REFUSED" && none.routeAction === "PHOTO_REVIEW" && none.outcome.observed === "NONE");
  const roof = resolveHeatPumpTuneUp({ ...HEAT_PUMP_TUNE_UP_BASE, outdoorLocation: "ROOF" });
  ok("known ROOF access does NOT create a REMOTE_QUOTE branch", roof.status === "RESOLVED" && roof.routeAction === "RESOLVE_INSTANT");

  ok(
    "the catalog's own disposition for heat-pump-tune-up is FIXED",
    HVAC_SERVICES.find((s) => s.key === "heat-pump-tune-up")?.disposition === "FIXED"
  );
  ok(
    "heat-pump-tune-up uses both scoped access slots, per H2's own declaration",
    JSON.stringify([...HVAC_SERVICE_ACCESS_SLOTS["heat-pump-tune-up"]].sort()) === JSON.stringify(["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"].sort())
  );
}

group("78. heat-pump-tune-up does not ask about defrost, reversing valve, backup heat, or refrigerant");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const heatPumpSection = section(scopeSrc, "export type HeatPumpTuneUpFacts", "export type MiniSplitTuneUpFacts");
  ok("no defrost, reversing-valve, backup-heat, or refrigerant field or question in the heat-pump-tune-up section", !/defrost|reversing.valve|backupHeat|backup heat|refrigerant/i.test(heatPumpSection));
  ok("no equipment_condition field in the heat-pump-tune-up section", !/equipmentCondition|equipment_condition/i.test(heatPumpSection));
  ok(
    "HEAT_PUMP_TUNE_UP_QUESTIONS asks only system identity, indoor access, outdoor access, and quantity",
    JSON.stringify(HEAT_PUMP_TUNE_UP_QUESTIONS.map((q) => q.key)) === JSON.stringify(["system_identity", "indoor_access", "outdoor_access", "system_count"])
  );
}

const MINI_SPLIT_TUNE_UP_BASE: MiniSplitTuneUpFacts = {
  systemCount: 1,
  headCount: 3,
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
};

group("79. mini-split-tune-up asks NO system_type question, and asks both system_count and head_count");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const miniSplitSection = section(scopeSrc, "export type MiniSplitTuneUpFacts", "export type AirCleanerCabinetInstallationFacts");
  ok("MiniSplitTuneUpFacts has no systemType field", !/MiniSplitTuneUpFacts[\s\S]{0,400}systemType/.test(miniSplitSection));
  ok("resolveMiniSplitTuneUp never calls identityGate", !/identityGate/.test(miniSplitSection));
  ok(
    "H2 declares distribution_and_zoning for mini-split-tune-up, never system_identity — matched exactly, nothing added",
    JSON.stringify(HVAC_SERVICE_FAMILIES["mini-split-tune-up"].map((u) => u.family)) === JSON.stringify(["distribution_and_zoning", "indoor_equipment_access", "outdoor_equipment_access"])
  );
  ok(
    "MINI_SPLIT_TUNE_UP_QUESTIONS asks both system_count and head_count, plus both access questions, nothing else",
    JSON.stringify(MINI_SPLIT_TUNE_UP_QUESTIONS.map((q) => q.key)) === JSON.stringify(["system_count", "head_count", "indoor_access", "outdoor_access"])
  );

  const resolved = resolveMiniSplitTuneUp(MINI_SPLIT_TUNE_UP_BASE);
  ok("known access + valid positive quantities -> RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  const zeroSystems = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, systemCount: 0 });
  ok("systemCount=0 fails closed to PHOTO_REVIEW, not a legitimate zero-priced job", zeroSystems.status === "REFUSED" && zeroSystems.routeAction === "PHOTO_REVIEW" && zeroSystems.outcome.factKey === "system_count");
  const zeroHeads = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, headCount: 0 });
  ok("headCount=0 fails closed to PHOTO_REVIEW", zeroHeads.status === "REFUSED" && zeroHeads.routeAction === "PHOTO_REVIEW" && zeroHeads.outcome.factKey === "head_count");
  const twoSystems = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, systemCount: 2, headCount: 5 });
  ok("two independent outdoor systems with five heads still resolves — head_count alone never has to describe this", twoSystems.status === "RESOLVED" && twoSystems.routeAction === "RESOLVE_INSTANT");
}

group("80. mini-split-tune-up's access matches indoor/outdoor behavior, and stays distinct from Deep Cleaning");
{
  const indoorUnknown = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, indoorAccessClass: "UNKNOWN" });
  ok("indoor access UNKNOWN -> PHOTO_REVIEW", indoorUnknown.status === "REFUSED" && indoorUnknown.routeAction === "PHOTO_REVIEW");
  const none = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, outdoorLocation: "NONE" });
  ok("outdoor_location=NONE fails closed", none.status === "REFUSED" && none.routeAction === "PHOTO_REVIEW" && none.outcome.observed === "NONE");
  const wall = resolveMiniSplitTuneUp({ ...MINI_SPLIT_TUNE_UP_BASE, outdoorLocation: "WALL_OR_BALCONY_MOUNT" });
  ok("known WALL_OR_BALCONY_MOUNT access does NOT create a REMOTE_QUOTE branch", wall.status === "RESOLVED" && wall.routeAction === "RESOLVE_INSTANT");
  ok(
    "mini-split-tune-up uses both scoped access slots, per H2's own declaration",
    JSON.stringify([...HVAC_SERVICE_ACCESS_SLOTS["mini-split-tune-up"]].sort()) === JSON.stringify(["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"].sort())
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  const miniSplitSection = section(scopeSrc, "export type MiniSplitTuneUpFacts", "export type AirCleanerCabinetInstallationFacts");
  ok("no disassembly, deep-clean, or wash question in the mini-split-tune-up section", !/disassembl|deep.?clean|\bwash/i.test(miniSplitSection));
  ok(
    "the catalog's own disposition for mini-split-tune-up is FIXED",
    HVAC_SERVICES.find((s) => s.key === "mini-split-tune-up")?.disposition === "FIXED"
  );
  ok(
    "mini-split-head-cleaning remains a separate service, untouched by H6",
    HVAC_SERVICES.some((s) => s.key === "mini-split-head-cleaning") &&
      !/mini-split-head-cleaning/i.test(miniSplitSection)
  );
}

group("81. maintenanceScope is populated, promise-only, and its structured locations match the H2 access-slot declarations");
{
  ok(
    "HVAC_MAINTENANCE_SCOPE declares all four tune-ups",
    JSON.stringify(Object.keys(HVAC_MAINTENANCE_SCOPE).sort()) ===
      JSON.stringify(["ac-tune-up", "furnace-tune-up", "heat-pump-tune-up", "mini-split-tune-up"].sort())
  );
  ok(
    "ac-tune-up's maintenanceScope touches both INDOOR and OUTDOOR, matching its two-slot access declaration",
    JSON.stringify(maintenanceScopeLocations(HVAC_MAINTENANCE_SCOPE["ac-tune-up"])) === JSON.stringify(["INDOOR", "OUTDOOR"])
  );
  ok(
    "heat-pump-tune-up's maintenanceScope touches both INDOOR and OUTDOOR",
    JSON.stringify(maintenanceScopeLocations(HVAC_MAINTENANCE_SCOPE["heat-pump-tune-up"])) === JSON.stringify(["INDOOR", "OUTDOOR"])
  );
  ok(
    "mini-split-tune-up's maintenanceScope touches both INDOOR and OUTDOOR",
    JSON.stringify(maintenanceScopeLocations(HVAC_MAINTENANCE_SCOPE["mini-split-tune-up"])) === JSON.stringify(["INDOOR", "OUTDOOR"])
  );
  ok(
    "furnace-tune-up's maintenanceScope is INDOOR only, matching its PRIMARY (single-location) access declaration",
    JSON.stringify(maintenanceScopeLocations(HVAC_MAINTENANCE_SCOPE["furnace-tune-up"])) === JSON.stringify(["INDOOR"])
  );
  ok(
    "ac-tune-up's declared work matches a BOTH locationScope — the G1 re-audit's own check, applied",
    maintenanceScopeMatchesDeclaredLocations(HVAC_MAINTENANCE_SCOPE["ac-tune-up"], "BOTH")
  );
  ok(
    "furnace-tune-up's declared work matches an INDOOR locationScope",
    maintenanceScopeMatchesDeclaredLocations(HVAC_MAINTENANCE_SCOPE["furnace-tune-up"], "INDOOR")
  );
  ok(
    "furnace-tune-up's declared work does NOT satisfy a narrower-than-actual claim against OUTDOOR alone",
    !maintenanceScopeMatchesDeclaredLocations(HVAC_MAINTENANCE_SCOPE["furnace-tune-up"], "OUTDOOR")
  );
  ok(
    "AC tune-up's condensate-drain item is present and carries no diagnostic language",
    HVAC_MAINTENANCE_SCOPE["ac-tune-up"].some((i) => /condensate drain/i.test(i.item)) &&
      !HVAC_MAINTENANCE_SCOPE["ac-tune-up"].some((i) => /block|clog|fail|leak/i.test(i.item))
  );
  const diagnosticLanguage = /\b(cracked|failed|failing|broken|defective|unsafe|dirty|bad|improper|diagnos\w*)\b/i;
  for (const [key, items] of Object.entries(HVAC_MAINTENANCE_SCOPE)) {
    for (const item of items) {
      ok(`${key}'s maintenanceScope item "${item.item}" names no diagnosis or condition judgment`, !diagnosticLanguage.test(item.item));
    }
  }
}

group("82. no tune-up reads equipment_condition, and no technician finding selects a repair, component, or service");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const tuneUpSection = section(scopeSrc, "export type AcTuneUpFacts", "export type AirCleanerCabinetInstallationFacts");
  ok("conditionGate is never called anywhere in the tune-up section", !/conditionGate/.test(tuneUpSection));
  ok("EquipmentCondition is never referenced anywhere in the tune-up section", !/EquipmentCondition/.test(tuneUpSection));
  ok("no tune-up resolver declares a materialRoles, components, or ScopeConsequence field", !/materialRoles|components:|ScopeConsequence/.test(tuneUpSection));
  ok("no tune-up resolver ever produces REROUTE_SERVICE or a component-repair reference", !/REROUTE_SERVICE|component.?repair/i.test(tuneUpSection));
  ok(
    "no tune-up resolver imports anything from lib/hvac/mappings.ts (no scope-consequence layer wired in for H6 either)",
    !/from ["'`]\.\/mappings["'`]/.test(scopeSrc)
  );
}

group("83. no symptom vocabulary enters any of the four H6 trees, and no symptom points at a tune-up as a priced alternative");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const tuneUpSection = section(scopeSrc, "export type AcTuneUpFacts", "export type AirCleanerCabinetInstallationFacts");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" in the tune-up sections`, !tuneUpSection.includes(symptom));
  }
  const allQuestions = [...AC_TUNE_UP_QUESTIONS, ...FURNACE_TUNE_UP_QUESTIONS, ...HEAT_PUMP_TUNE_UP_QUESTIONS, ...MINI_SPLIT_TUNE_UP_QUESTIONS];
  const optionValues = allQuestions.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no H6 answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );

  const tuneUpKeys = ["ac-tune-up", "furnace-tune-up", "heat-pump-tune-up", "mini-split-tune-up"];
  const shellAliases = (hvacServiceCall().aliases ?? []).map((a) => a.toLowerCase());
  for (const key of tuneUpKeys) {
    const svc = HVAC_SERVICES.find((s) => s.key === key)!;
    const overlap = (svc.aliases ?? []).filter((a) => shellAliases.includes(a.toLowerCase()));
    ok(`${key}'s own aliases share no phrase with hvac-service-call's symptom vocabulary`, overlap.length === 0, overlap.join(", "));
  }
  const intentPhrases = allHvacIntentPhrases();
  const symptomPointingAtTuneUp = intentPhrases.filter(
    (p) => tuneUpKeys.includes(p.serviceKey) && shellAliases.includes(p.phrase.toLowerCase())
  );
  ok(
    "no HVAC_INTENTS entry routes a symptom phrase at a tune-up — the G.6 invariant, checked against these four specifically",
    symptomPointingAtTuneUp.length === 0,
    symptomPointingAtTuneUp.map((p) => p.phrase).join(", ")
  );
}

group("84. all four H1 dispositions remain FIXED, and no family/gate/primitive count changed");
{
  for (const key of ["ac-tune-up", "furnace-tune-up", "heat-pump-tune-up", "mini-split-tune-up"]) {
    ok(`${key}'s disposition is still FIXED`, HVAC_SERVICES.find((s) => s.key === key)?.disposition === "FIXED");
  }
  ok("HVAC_SERVICES is still exactly 22 entries", HVAC_SERVICES.length === 22);
  ok("HVAC_FAMILIES is exactly 19 entries — no new family was added for H6 specifically (H8 and H9 later added three, for unrelated facts)", HVAC_FAMILIES.length === 19);
  ok("HVAC_GATE_KEYS is still exactly 7 entries — no new gate was added", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS is still exactly 7 entries — no new primitive was added", HVAC_PRIMITIVE_KEYS.length === 7);
  ok("lib/hvac/composition.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/composition.ts")));
  ok("lib/hvac/publish.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/publish.ts")));
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok("scope.ts still imports nothing from lib/plumbing", !/from ["'`]\.\.?\/.*plumbing/.test(scopeSrc));
  ok("scope.ts still imports nothing electrical-specific", !/from ["'`]\.\.?\/.*electrical/.test(scopeSrc));
}

group("85. gateTwoSlotAccess is a narrow, mechanical helper — not a generic tree engine");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const callSites = scopeSrc.match(/gateTwoSlotAccess\(/g) ?? [];
  // One definition + three H6 tune-up call sites (ac, heat-pump, mini-split
  // tune-up) + four H11 call sites (ac-replacement, heat-pump-replacement,
  // whole-system-replacement, mini-split-installation) — H11's own
  // narrowing of this count, superseded on purpose.
  ok(
    "gateTwoSlotAccess is called exactly 7 times — three H6 tune-ups plus four H11 REMOTE_QUOTE equipment services",
    callSites.length === 8,
    `got ${callSites.length} occurrences (definition + call sites)`
  );
  ok("gateTwoSlotAccess is never called from furnace-tune-up (single-location, no second slot)", !section(scopeSrc, "export type FurnaceTuneUpFacts", "export type HeatPumpTuneUpFacts").includes("gateTwoSlotAccess"));
  ok(
    "gateTwoSlotAccess knows nothing about system identity, fuel, or quantity — it takes only the three access-shaped fields",
    /function gateTwoSlotAccess\(facts: TwoSlotAccessFacts\)/.test(scopeSrc)
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H7 — three accessory/IAQ services: air-cleaner-cabinet-installation,
// duct-air-treatment-installation, accessory-consumable-replacement.
//
// mini-split-head-cleaning was implemented in H7, then REMOVED before
// push — the final applied trade review requires it to capture indoor-unit
// type as a CONDITIONAL_FIXED scope driver, and no approved vocabulary for
// that fact existed anywhere in authority at the time. H8's own audit
// confirmed the gap was real and settled it as an explicit product
// decision (groups 87-90, below, prove the resolver, the settled
// seven-value vocabulary, and the still-service-specific access rule).
// whole-house-humidifier was blocked for the same reason — two facts
// (humidifier device type, water supply presence) genuinely missing from
// H2's declared vocabulary — and H8 settles both (groups 99+, below).
// ═══════════════════════════════════════════════════════════════════════

group("86. H3-H6 behavior is unchanged by the H7 addition");
{
  const BASE: CondensatePumpInstallationFacts = {
    accessClass: "ACCESSIBLE",
    condensateRoute: "PUMP_PRESENT",
    supplyArrangement: "CUSTOMER_SUPPLIED",
    dedicatedCircuitPresent: "PRESENT",
    runBand: "STANDARD",
  };
  const condensatePump = resolveCondensatePumpInstallation(BASE);
  ok("condensate-pump-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", condensatePump.status === "RESOLVED" && condensatePump.routeAction === "RESOLVE_ADJUSTED");
  const thermostat = resolveThermostatInstallation(THERMOSTAT_REPLACEMENT_FACTS);
  ok("thermostat-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", thermostat.status === "RESOLVED" && thermostat.routeAction === "RESOLVE_ADJUSTED");
  const safetySwitch = resolveCondensateSafetySwitchInstallation({ accessClass: "ACCESSIBLE", condensateRoute: "PUMP_PRESENT" });
  ok("condensate-safety-switch-installation still resolves RESOLVE_INSTANT", safetySwitch.status === "RESOLVED" && safetySwitch.routeAction === "RESOLVE_INSTANT");
  const filter = resolveAirFilterReplacement({ filterSlotSize: "16x25x1", quantity: 1 });
  ok("air-filter-replacement still resolves RESOLVE_INSTANT", filter.status === "RESOLVED" && filter.routeAction === "RESOLVE_INSTANT");
  const acTuneUp = resolveAcTuneUp({
    systemType: "FURNACE_AND_AC",
    indoorAccessClass: "ACCESSIBLE",
    outdoorLocation: "GROUND_LEVEL_ADJACENT",
    outdoorAccessClass: "ACCESSIBLE",
    systemCount: 1,
  });
  ok("ac-tune-up still resolves RESOLVE_INSTANT", acTuneUp.status === "RESOLVED" && acTuneUp.routeAction === "RESOLVE_INSTANT");
  const miniSplitTuneUp = resolveMiniSplitTuneUp({
    systemCount: 1,
    headCount: 3,
    indoorAccessClass: "ACCESSIBLE",
    outdoorLocation: "GROUND_LEVEL_ADJACENT",
    outdoorAccessClass: "ACCESSIBLE",
  });
  ok("mini-split-tune-up still resolves RESOLVE_INSTANT", miniSplitTuneUp.status === "RESOLVED" && miniSplitTuneUp.routeAction === "RESOLVE_INSTANT");
  ok(
    "H3-H6's own question data is all still exported and non-empty",
    CONDENSATE_SAFETY_SWITCH_QUESTIONS.length === 2 &&
      AIR_FILTER_REPLACEMENT_QUESTIONS.length === 2 &&
      THERMOSTAT_QUESTIONS.length > 0 &&
      AC_TUNE_UP_QUESTIONS.length > 0 &&
      MINI_SPLIT_TUNE_UP_QUESTIONS.length > 0
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H8 — mini-split-head-cleaning (settling indoor_unit_type) and
// whole-house-humidifier (settling humidifier_type and
// water_supply_present). Both were blocked after H7's own audit; both are
// executable now. condenser-pad-replacement remains deferred, untouched,
// and was NOT reopened by this audit — group 41, above, still proves its
// resolver's absence, and group 69's own catalog-entry check (H5) still
// stands unchanged.
// ═══════════════════════════════════════════════════════════════════════

const MINI_SPLIT_HEAD_CLEANING_BASE: MiniSplitHeadCleaningFacts = {
  headCount: 2,
  indoorUnitType: "WALL_MOUNTED",
  accessClass: "ACCESSIBLE",
};

group("87. mini-split-head-cleaning resolves on the bounded happy path, and quantity fails closed");
{
  const resolved = resolveMiniSplitHeadCleaning(MINI_SPLIT_HEAD_CLEANING_BASE);
  ok("WALL_MOUNTED + ACCESSIBLE + positive quantity -> RESOLVE_ADJUSTED", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_ADJUSTED");
  const zeroHeads = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, headCount: 0 });
  ok("headCount=0 fails closed to PHOTO_REVIEW, not a legitimate zero-priced job", zeroHeads.status === "REFUSED" && zeroHeads.routeAction === "PHOTO_REVIEW" && zeroHeads.outcome.factKey === "head_count");
  const multipleHeads = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, headCount: 4 });
  ok("multiple heads resolves the same way as one", multipleHeads.status === "RESOLVED");
  ok(
    "the catalog's own disposition for mini-split-head-cleaning is CONDITIONAL_FIXED, matching the RESOLVE_ADJUSTED terminal used here",
    HVAC_SERVICES.find((s) => s.key === "mini-split-head-cleaning")?.disposition === "CONDITIONAL_FIXED"
  );
}

group("88. indoor_unit_type: exact seven-value vocabulary, indoor_unit_form is a separate narrow family, distribution_and_zoning stays quantity-only");
{
  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("indoor_unit_form exists as its own H2 family", familyKeys.includes("indoor_unit_form"));
  const indoorUnitForm = HVAC_FAMILIES.find((f) => f.key === "indoor_unit_form")!;
  ok("indoor_unit_form establishes exactly indoor_unit_type, nothing else", JSON.stringify(indoorUnitForm.establishes) === JSON.stringify(["indoor_unit_type"]));
  ok("indoor_unit_form binds no gate", indoorUnitForm.gates.length === 0);
  ok("indoor_unit_form binds no shared primitive", indoorUnitForm.primitives.length === 0);
  const distributionAndZoning = HVAC_FAMILIES.find((f) => f.key === "distribution_and_zoning")!;
  ok(
    "distribution_and_zoning remains exactly zone_count + head_count — quantity-only, indoor_unit_type was NOT added here",
    JSON.stringify([...distributionAndZoning.establishes].sort()) === JSON.stringify(["zone_count", "head_count"].sort())
  );
  ok(
    "mini-split-head-cleaning declares indoor_unit_form alongside its original two families",
    JSON.stringify([...HVAC_SERVICE_FAMILIES["mini-split-head-cleaning"].map((u) => u.family)].sort()) ===
      JSON.stringify(["distribution_and_zoning", "indoor_equipment_access", "indoor_unit_form"].sort())
  );
  ok(
    "indoor_unit_form is declared for mini-split-head-cleaning only — not added to mini-split-tune-up or any other service",
    !HVAC_SERVICE_FAMILIES["mini-split-tune-up"].some((u) => u.family === "indoor_unit_form") &&
      Object.entries(HVAC_SERVICE_FAMILIES).filter(([, usages]) => usages.some((u) => u.family === "indoor_unit_form")).length === 1
  );

  const typeValues = MINI_SPLIT_HEAD_CLEANING_QUESTIONS.find((q) => q.key === "indoor_unit_type")!.options.map((o) => o.value);
  ok(
    "the indoor_unit_type question offers exactly the seven approved values, no more, no fewer",
    JSON.stringify([...typeValues].sort()) ===
      JSON.stringify(["WALL_MOUNTED", "CEILING_CASSETTE", "FLOOR_CONSOLE", "CONCEALED_DUCTED", "OTHER", "MIXED_TYPES", "UNKNOWN"].sort())
  );

  const bounded: readonly MiniSplitHeadCleaningFacts["indoorUnitType"][] = ["WALL_MOUNTED", "CEILING_CASSETTE", "FLOOR_CONSOLE"];
  for (const indoorUnitType of bounded) {
    const r = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, indoorUnitType });
    ok(`${indoorUnitType} stays in the bounded branch and resolves`, r.status === "RESOLVED" && r.routeAction === "RESOLVE_ADJUSTED");
  }
  const leavesPrice: readonly MiniSplitHeadCleaningFacts["indoorUnitType"][] = ["CONCEALED_DUCTED", "OTHER", "MIXED_TYPES"];
  for (const indoorUnitType of leavesPrice) {
    const r = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, indoorUnitType });
    ok(`${indoorUnitType} -> REMOTE_QUOTE`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE" && r.outcome.factKey === "indoor_unit_type" && r.outcome.observed === indoorUnitType);
  }
  const unknownType = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, indoorUnitType: "UNKNOWN" });
  ok("UNKNOWN indoor_unit_type -> PHOTO_REVIEW", unknownType.status === "REFUSED" && unknownType.routeAction === "PHOTO_REVIEW" && unknownType.outcome.factKey === "indoor_unit_type");

  const diagnosticLanguage = /\b(capacity|refrigerant|serviceab\w*|compatib\w*|needs? cleaning|condition)\b/i;
  ok(
    "no indoor_unit_type option label makes a capacity, refrigerant, serviceability, compatibility, or need-based claim",
    MINI_SPLIT_HEAD_CLEANING_QUESTIONS.find((q) => q.key === "indoor_unit_type")!.options.every((o) => !diagnosticLanguage.test(o.label))
  );
}

group("89. mini-split-head-cleaning's access stays service-specific, and the generic accessGate is unaffected");
{
  const finished = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, accessClass: "FINISHED" });
  ok(
    "FINISHED -> REMOTE_QUOTE — the service-specific H7/H8 correction, unique to this resolver",
    finished.status === "REFUSED" && finished.routeAction === "REMOTE_QUOTE" && finished.outcome.factKey === "access_class" && finished.outcome.observed === "FINISHED"
  );
  const unknownAccess = resolveMiniSplitHeadCleaning({ ...MINI_SPLIT_HEAD_CLEANING_BASE, accessClass: "UNKNOWN" });
  ok("UNKNOWN access -> PHOTO_REVIEW", unknownAccess.status === "REFUSED" && unknownAccess.routeAction === "PHOTO_REVIEW");

  const genericFinished = accessGate("FINISHED");
  ok("accessGate(FINISHED) still CONTINUEs by default, outside mini-split-head-cleaning", genericFinished.action === "CONTINUE");
  const genericAccessible = accessGate("ACCESSIBLE");
  ok("accessGate(ACCESSIBLE) still CONTINUEs", genericAccessible.action === "CONTINUE");
  const genericUnknown = accessGate("UNKNOWN");
  ok("accessGate(UNKNOWN) still PHOTO_REVIEWs", genericUnknown.action === "PHOTO_REVIEW");
  const filterCabinetFinished = resolveAirCleanerCabinetInstallation({
    systemType: "FURNACE_AND_AC",
    accessClass: "FINISHED",
    accessoryPresent: "PRESENT",
    filterSlotSize: "20x25x4",
  });
  ok(
    "air-cleaner-cabinet-installation's own FINISHED still resolves — the ordinary generic-gate behavior, not mini-split-head-cleaning's service-specific one",
    filterCabinetFinished.status === "RESOLVED"
  );
  const gatesSrc = strip("lib/hvac/gates.ts");
  ok("lib/hvac/gates.ts's accessGate function body is unchanged — still checks only UNKNOWN", /export function accessGate\(access: AccessClass\): GateOutcome \{\s*if \(access === "UNKNOWN"\)/.test(gatesSrc));
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "the FINISHED->REMOTE_QUOTE refusal exists exactly once in scope.ts, inside resolveMiniSplitHeadCleaning only",
    (scopeSrc.match(/observed: "FINISHED"/g) ?? []).length === 1
  );
}

group("90. mini-split-head-cleaning stays distinct from mini-split-tune-up");
{
  ok(
    "mini-split-head-cleaning's access slot is PRIMARY — single-location, unlike mini-split-tune-up's two-slot scope",
    JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["mini-split-head-cleaning"]) === JSON.stringify(["PRIMARY"])
  );
  ok(
    "mini-split-tune-up's own access slot is still both scoped slots, unchanged by H8",
    JSON.stringify([...HVAC_SERVICE_ACCESS_SLOTS["mini-split-tune-up"]].sort()) === JSON.stringify(["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"].sort())
  );
  ok(
    "mini-split-head-cleaning declares no system_identity family — H2 never declared one, and this resolver does not add one",
    !HVAC_SERVICE_FAMILIES["mini-split-head-cleaning"].some((u) => u.family === "system_identity")
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  const cleaningSection = section(scopeSrc, "export type IndoorUnitType", "export type HumidifierType");
  ok("mini-split-head-cleaning never calls identityGate", !/identityGate/.test(cleaningSection));
  ok("mini-split-head-cleaning never references disassembly/deep-clean/wash language in a diagnostic sense — no symptom or condition question", !/why (it'?s|is) dirty|symptom|equipment_condition|EquipmentCondition/i.test(cleaningSection));
  ok("HVAC_SERVICES is still exactly 22 entries", HVAC_SERVICES.length === 22);
}

const FILTER_CABINET_BASE: AirCleanerCabinetInstallationFacts = {
  systemType: "FURNACE_AND_AC",
  accessClass: "ACCESSIBLE",
  accessoryPresent: "PRESENT",
  filterSlotSize: "20x25x4",
};

group("91. air-cleaner-cabinet-installation: no powered variant, no dedicated-power question, no sheet-metal judgment question");
{
  const resolved = resolveAirCleanerCabinetInstallation(FILTER_CABINET_BASE);
  ok("PRESENT (replacement) resolves to RESOLVE_ADJUSTED", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_ADJUSTED");
  const absent = resolveAirCleanerCabinetInstallation({ ...FILTER_CABINET_BASE, accessoryPresent: "ABSENT" });
  ok(
    "ABSENT (first-time insertion) -> REMOTE_QUOTE, unconditionally — no observable proxy exists to bound it narrower",
    absent.status === "REFUSED" && absent.routeAction === "REMOTE_QUOTE" && absent.outcome.factKey === "accessory_present"
  );
  const unknownPresence = resolveAirCleanerCabinetInstallation({ ...FILTER_CABINET_BASE, accessoryPresent: "UNKNOWN" });
  ok("UNKNOWN presence -> PHOTO_REVIEW", unknownPresence.status === "REFUSED" && unknownPresence.routeAction === "PHOTO_REVIEW");
  const unreadableSize = resolveAirCleanerCabinetInstallation({ ...FILTER_CABINET_BASE, filterSlotSize: null });
  ok("unreadable filter size -> PHOTO_REVIEW", unreadableSize.status === "REFUSED" && unreadableSize.routeAction === "PHOTO_REVIEW" && unreadableSize.outcome.factKey === "filter_slot_size");

  const scopeSrc = strip("lib/hvac/scope.ts");
  const cabinetSection = section(scopeSrc, "export type AirCleanerCabinetInstallationFacts", "export type DuctAirTreatmentInstallationFacts");
  ok("no dedicatedCircuitPresent field or dedicated_power question in the filter-cabinet section", !/dedicatedCircuitPresent|dedicated_circuit_present|dedicated_power/i.test(cabinetSection));
  ok("no electrical/electronic-air-cleaner reference in the filter-cabinet section", !/electronic air cleaner|electrical prerequisite/i.test(cabinetSection));
  ok(
    "no question asks whether duct transitions are standard, easy, or adequate",
    !/standard|easy to service|adequate/i.test(AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS.map((q) => q.prompt).join(" "))
  );
  ok(
    "the catalog's own disposition for air-cleaner-cabinet-installation is CONDITIONAL_FIXED",
    HVAC_SERVICES.find((s) => s.key === "air-cleaner-cabinet-installation")?.disposition === "CONDITIONAL_FIXED"
  );
  ok(
    "H2's own family declaration has no dedicated_power_availability for this service, unchanged",
    !HVAC_SERVICE_FAMILIES["air-cleaner-cabinet-installation"].some((u) => u.family === "dedicated_power_availability")
  );
}

const DUCT_TREATMENT_BASE: DuctAirTreatmentInstallationFacts = {
  systemType: "FURNACE_AND_AC",
  accessClass: "ACCESSIBLE",
  dedicatedCircuitPresent: "PRESENT",
};

group("92. duct-air-treatment-installation: power stays unconditional, and no health/performance claim exists anywhere");
{
  const resolved = resolveDuctAirTreatmentInstallation(DUCT_TREATMENT_BASE);
  ok("resolved power + access + identity -> RESOLVE_ADJUSTED", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_ADJUSTED");
  const powerAbsent = resolveDuctAirTreatmentInstallation({ ...DUCT_TREATMENT_BASE, dedicatedCircuitPresent: "ABSENT" });
  ok(
    "dedicated_circuit_present=ABSENT -> REMOTE_QUOTE, on every path — unconditional, matching H2's own declaration",
    powerAbsent.status === "REFUSED" && powerAbsent.routeAction === "REMOTE_QUOTE" && powerAbsent.outcome.factKey === "dedicated_circuit_present"
  );
  const powerUnknown = resolveDuctAirTreatmentInstallation({ ...DUCT_TREATMENT_BASE, dedicatedCircuitPresent: "UNKNOWN" });
  ok("dedicated_circuit_present=UNKNOWN -> PHOTO_REVIEW", powerUnknown.status === "REFUSED" && powerUnknown.routeAction === "PHOTO_REVIEW");
  ok(
    "H2's own family declaration for this service includes dedicated_power_availability, unconditional (not branch-only)",
    HVAC_SERVICE_FAMILIES["duct-air-treatment-installation"].some((u) => u.family === "dedicated_power_availability" && !u.branch)
  );

  const scopeSrc = strip("lib/hvac/scope.ts");
  const treatmentSection = section(scopeSrc, "export type DuctAirTreatmentInstallationFacts", "export type AccessoryKind");
  ok(
    "no health, performance, or air-quality claim anywhere in the duct-treatment section",
    !/\b(dirty|contaminated|unhealthy|moldy|mold|purif|air quality|kills? germs|allergen)\b/i.test(treatmentSection)
  );
  const allWording = DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS.map((q) => [q.prompt, ...q.options.map((o) => o.label)].join(" ")).join(" ");
  ok("no H7 duct-treatment question or answer makes a health/performance claim", !/dirty|contaminated|unhealthy|moldy|mold|purif|needs? treatment/i.test(allWording));
  ok(
    "device configuration (UV lamp/PCO/ionizer) is never a live question — no device-type field or question exists",
    !/deviceType|device_type/i.test(treatmentSection)
  );
  ok(
    "the catalog's own disposition for duct-air-treatment-installation is CONDITIONAL_FIXED",
    HVAC_SERVICES.find((s) => s.key === "duct-air-treatment-installation")?.disposition === "CONDITIONAL_FIXED"
  );
}

const CONSUMABLE_BASE: AccessoryConsumableReplacementFacts = {
  accessoryKind: "HUMIDIFIER",
  accessClass: "ACCESSIBLE",
  identifierText: "Aprilaire 35",
};

group("93. accessory-consumable-replacement: accessory_kind exists, exact three kinds + UNKNOWN, accessory_present semantics unchanged");
{
  const existingFamily = HVAC_FAMILIES.find((f) => f.key === "accessory_and_media")!;
  ok(
    "accessory_and_media now establishes accessory_kind, alongside its original three facts",
    existingFamily.establishes.includes("accessory_kind") &&
      existingFamily.establishes.includes("accessory_present") &&
      existingFamily.establishes.includes("replacement_vs_new") &&
      existingFamily.establishes.includes("filter_slot_size")
  );
  ok("HVAC_FAMILIES is exactly 19 entries — no new family was added for accessory_kind specifically (H8 and H9 later added three, for unrelated facts)", HVAC_FAMILIES.length === 19);
  ok("HVAC_GATE_KEYS is still exactly 7 entries — no new gate was added", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS is still exactly 7 entries — no new primitive was added", HVAC_PRIMITIVE_KEYS.length === 7);

  const humidifier = resolveAccessoryConsumableReplacement(CONSUMABLE_BASE);
  ok("HUMIDIFIER resolves to RESOLVE_INSTANT", humidifier.status === "RESOLVED" && humidifier.routeAction === "RESOLVE_INSTANT");
  const airCleaner = resolveAccessoryConsumableReplacement({ ...CONSUMABLE_BASE, accessoryKind: "AIR_CLEANER" });
  ok("AIR_CLEANER also resolves to RESOLVE_INSTANT", airCleaner.status === "RESOLVED" && airCleaner.routeAction === "RESOLVE_INSTANT");
  const uvTreatment = resolveAccessoryConsumableReplacement({ ...CONSUMABLE_BASE, accessoryKind: "UV_TREATMENT" });
  ok("UV_TREATMENT also resolves to RESOLVE_INSTANT", uvTreatment.status === "RESOLVED" && uvTreatment.routeAction === "RESOLVE_INSTANT");
  const unknownKind = resolveAccessoryConsumableReplacement({ ...CONSUMABLE_BASE, accessoryKind: "UNKNOWN" });
  ok(
    "UNKNOWN accessory kind -> PHOTO_REVIEW",
    unknownKind.status === "REFUSED" && unknownKind.routeAction === "PHOTO_REVIEW" && unknownKind.outcome.factKey === "accessory_kind"
  );

  const kindValues = ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS.find((q) => q.key === "accessory_kind")!.options.map((o) => o.value);
  ok(
    "the accessory_kind question offers exactly HUMIDIFIER, AIR_CLEANER, UV_TREATMENT, UNKNOWN — no more, no fewer",
    JSON.stringify([...kindValues].sort()) === JSON.stringify(["HUMIDIFIER", "AIR_CLEANER", "UV_TREATMENT", "UNKNOWN"].sort())
  );

  const scopeSrc = strip("lib/hvac/scope.ts");
  const consumableSection = section(scopeSrc, "export type AccessoryKind", "export const ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS");
  ok("resolveAccessoryConsumableReplacement never reads an accessoryPresent field — accessory_present's presence semantics are untouched", !/accessoryPresent/.test(consumableSection));
  ok(
    "no OTHER accessory_and_media-declared service renders accessory_kind — checked structurally across the whole file",
    (scopeSrc.match(/accessoryKind:/g) ?? []).length === 1 // only inside AccessoryConsumableReplacementFacts's own declaration
  );
}

group("94. accessory-consumable-replacement declares no supply_arrangement question or family, and never modifies H2");
{
  ok(
    "H2's own family declaration for accessory-consumable-replacement is exactly accessory_and_media + indoor_equipment_access — no supply_arrangement",
    JSON.stringify([...HVAC_SERVICE_FAMILIES["accessory-consumable-replacement"].map((u) => u.family)].sort()) ===
      JSON.stringify(["accessory_and_media", "indoor_equipment_access"].sort())
  );
  ok(
    "no supply_arrangement question in ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS",
    !ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS.some((q) => q.establishes === "supply_arrangement")
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  const consumableSection = section(scopeSrc, "export type AccessoryKind", "export const ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS");
  ok("no supplyArrangement field anywhere in the consumable-replacement section", !/supplyArrangement/.test(consumableSection));
  ok(
    "the catalog's own disposition for accessory-consumable-replacement is FIXED, matching the RESOLVE_INSTANT terminal used here",
    HVAC_SERVICES.find((s) => s.key === "accessory-consumable-replacement")?.disposition === "FIXED"
  );
}

group("95. no compatibility is ever inferred from a printed identifier's content");
{
  const differentModel = resolveAccessoryConsumableReplacement({ ...CONSUMABLE_BASE, identifierText: "some other text entirely" });
  ok("any non-null identifier text resolves identically — content is never read for meaning", differentModel.status === "RESOLVED" && differentModel.routeAction === "RESOLVE_INSTANT");
  const nullIdentifier = resolveAccessoryConsumableReplacement({ ...CONSUMABLE_BASE, identifierText: null });
  ok("null identifier (unreadable) -> PHOTO_REVIEW, the only thing its absence ever triggers", nullIdentifier.status === "REFUSED" && nullIdentifier.routeAction === "PHOTO_REVIEW");
  const scopeSrc = strip("lib/hvac/scope.ts");
  const consumableSection = section(scopeSrc, "export type AccessoryKind", "export const ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS");
  ok(
    "no compatible/fits/works-with language anywhere in the consumable-replacement section",
    !/\b(compatible|fits|works with)\b/i.test(consumableSection)
  );
}

group("96. no symptom vocabulary enters any of the three H7 trees");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const h7Section = section(scopeSrc, "export type AirCleanerCabinetInstallationFacts", "export type MiniSplitHeadCleaningFacts");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" in the H7 sections`, !h7Section.includes(symptom));
  }
  const allQuestions = [
    ...AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS,
    ...DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS,
    ...ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS,
  ];
  const optionValues = allQuestions.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no H7 answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );
  const symptomPhrases = ["mold smell", "odor", "not cooling", "no heat", "won't turn on", "leaking water"];
  const allWording = allQuestions.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]).join(" ").toLowerCase();
  ok("no H7 question prompt or answer label contains symptom phrasing", symptomPhrases.every((p) => !allWording.includes(p)));

  const h7Keys = ["air-cleaner-cabinet-installation", "duct-air-treatment-installation", "accessory-consumable-replacement"];
  const shellAliases = (hvacServiceCall().aliases ?? []).map((a) => a.toLowerCase());
  for (const key of h7Keys) {
    const svc = HVAC_SERVICES.find((s) => s.key === key)!;
    const overlap = (svc.aliases ?? []).filter((a) => shellAliases.includes(a.toLowerCase()));
    ok(`${key}'s own aliases share no phrase with hvac-service-call's symptom vocabulary`, overlap.length === 0, overlap.join(", "));
  }
  // mini-split-head-cleaning's own aliases are still checked — its catalog
  // entry is untouched, and its symptom exclusion (⚠️ "mold smell from
  // mini split") predates and survives this removal, per group 3, above.
  const cleaningSvc = HVAC_SERVICES.find((s) => s.key === "mini-split-head-cleaning")!;
  const cleaningOverlap = (cleaningSvc.aliases ?? []).filter((a) => shellAliases.includes(a.toLowerCase()));
  ok("mini-split-head-cleaning's own aliases still share no phrase with hvac-service-call's symptom vocabulary", cleaningOverlap.length === 0, cleaningOverlap.join(", "));
}

group("97. no equipment observation selects a repair, a diagnosis, or a component anywhere in the H7 trees");
{
  const diagnosticLanguage =
    /\b(blocked|clogged|failed|failing|broken|defective|refrigerant|low on|leaking from|leak in|worn|corroded internally|burnt out|malfunction|cracked|unsafe)\b/i;
  const allQuestions = [
    ...AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS,
    ...DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS,
    ...ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS,
  ];
  for (const q of allQuestions) {
    ok(`"${q.key}"'s prompt names no cause`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no cause`, !diagnosticLanguage.test(o.label), o.label);
    }
  }
  const scopeSrc = strip("lib/hvac/scope.ts");
  const h7Section = section(scopeSrc, "export type AirCleanerCabinetInstallationFacts", "export type MiniSplitHeadCleaningFacts");
  ok("no H7 resolver reads equipment_condition anywhere", !/EquipmentCondition|conditionGate|equipmentCondition/.test(h7Section));
  ok("no H7 resolver declares a materialRoles, components, or ScopeConsequence field", !/materialRoles|components:|ScopeConsequence/.test(h7Section));
  ok("no H7 resolver imports anything from lib/hvac/mappings.ts", !/from ["'`]\.\/mappings["'`]/.test(scopeSrc));
  ok("no H7 resolver ever produces REROUTE_SERVICE", !/REROUTE_SERVICE/.test(h7Section));
}

group("98. H1 dispositions for the three original H7 services remain unchanged, and no schema/pricing/provisioning surface was touched");
{
  ok(
    "mini-split-head-cleaning's disposition is still CONDITIONAL_FIXED — now executable, not weakened",
    HVAC_SERVICES.find((s) => s.key === "mini-split-head-cleaning")?.disposition === "CONDITIONAL_FIXED"
  );
  ok("air-cleaner-cabinet-installation's disposition is still CONDITIONAL_FIXED", HVAC_SERVICES.find((s) => s.key === "air-cleaner-cabinet-installation")?.disposition === "CONDITIONAL_FIXED");
  ok("duct-air-treatment-installation's disposition is still CONDITIONAL_FIXED", HVAC_SERVICES.find((s) => s.key === "duct-air-treatment-installation")?.disposition === "CONDITIONAL_FIXED");
  ok("accessory-consumable-replacement's disposition is still FIXED", HVAC_SERVICES.find((s) => s.key === "accessory-consumable-replacement")?.disposition === "FIXED");
  ok("whole-house-humidifier's disposition is still CONDITIONAL_FIXED — now executable, not weakened", HVAC_SERVICES.find((s) => s.key === "whole-house-humidifier")?.disposition === "CONDITIONAL_FIXED");
  ok("HVAC_SERVICES is still exactly 22 entries", HVAC_SERVICES.length === 22);
  ok("lib/hvac/composition.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/composition.ts")));
  ok("lib/hvac/publish.ts still does not exist", !existsSync(join(ROOT, "lib/hvac/publish.ts")));
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok("scope.ts still imports nothing from lib/plumbing", !/from ["'`]\.\.?\/.*plumbing/.test(scopeSrc));
  ok("scope.ts still imports nothing electrical-specific", !/from ["'`]\.\.?\/.*electrical/.test(scopeSrc));
}

// ═══════════════════════════════════════════════════════════════════════
// H8 — whole-house-humidifier. mini-split-head-cleaning's own groups are
// 87-90, above.
// ═══════════════════════════════════════════════════════════════════════

const HUMIDIFIER_REPLACEMENT_BASE: WholeHouseHumidifierFacts = {
  accessoryPresent: "PRESENT",
  humidifierType: "BYPASS",
  accessClass: "ACCESSIBLE",
  waterSupplyPresent: "PRESENT",
  condensateRoute: "PUMP_PRESENT",
  dedicatedCircuitPresent: "PRESENT",
  runBand: "STANDARD",
  supplyArrangement: "CUSTOMER_SUPPLIED",
};

const HUMIDIFIER_NEW_INSTALL_BASE: WholeHouseHumidifierFacts = {
  ...HUMIDIFIER_REPLACEMENT_BASE,
  accessoryPresent: "ABSENT",
};

group("99. whole-house-humidifier's replacement branch: bypass/fan-powered resolve, steam reviews, UNKNOWN photo-reviews");
{
  const bypass = resolveWholeHouseHumidifier(HUMIDIFIER_REPLACEMENT_BASE);
  ok("BYPASS replacement resolves to RESOLVE_ADJUSTED/REPLACEMENT", bypass.status === "RESOLVED" && bypass.routeAction === "RESOLVE_ADJUSTED" && bypass.branch === "REPLACEMENT");
  const fanPowered = resolveWholeHouseHumidifier({ ...HUMIDIFIER_REPLACEMENT_BASE, humidifierType: "FAN_POWERED" });
  ok("FAN_POWERED replacement also resolves", fanPowered.status === "RESOLVED" && fanPowered.branch === "REPLACEMENT");
  const steam = resolveWholeHouseHumidifier({ ...HUMIDIFIER_REPLACEMENT_BASE, humidifierType: "STEAM" });
  ok(
    "STEAM replacement -> REMOTE_QUOTE",
    steam.status === "REFUSED" && steam.routeAction === "REMOTE_QUOTE" && steam.outcome.factKey === "humidifier_type" && steam.outcome.observed === "STEAM"
  );
  const unknownType = resolveWholeHouseHumidifier({ ...HUMIDIFIER_REPLACEMENT_BASE, humidifierType: "UNKNOWN" });
  ok(
    "UNKNOWN existing type -> PHOTO_REVIEW — an installed device exists and a photo can classify it",
    unknownType.status === "REFUSED" && unknownType.routeAction === "PHOTO_REVIEW" && unknownType.outcome.factKey === "humidifier_type"
  );
  const unknownAccessory = resolveWholeHouseHumidifier({ ...HUMIDIFIER_REPLACEMENT_BASE, accessoryPresent: "UNKNOWN" });
  ok("UNKNOWN accessory_present -> PHOTO_REVIEW, before either branch is chosen", unknownAccessory.status === "REFUSED" && unknownAccessory.routeAction === "PHOTO_REVIEW");
  const unknownAccess = resolveWholeHouseHumidifier({ ...HUMIDIFIER_REPLACEMENT_BASE, accessClass: "UNKNOWN" });
  ok("UNKNOWN access on the replacement branch -> PHOTO_REVIEW", unknownAccess.status === "REFUSED" && unknownAccess.routeAction === "PHOTO_REVIEW");
}

group("100. whole-house-humidifier's new-installation branch: bypass/fan-powered resolve, steam reviews, UNKNOWN desired type REMOTE_QUOTEs (not PHOTO_REVIEW)");
{
  const bypass = resolveWholeHouseHumidifier(HUMIDIFIER_NEW_INSTALL_BASE);
  ok("BYPASS new install resolves to RESOLVE_ADJUSTED/NEW_INSTALLATION", bypass.status === "RESOLVED" && bypass.routeAction === "RESOLVE_ADJUSTED" && bypass.branch === "NEW_INSTALLATION");
  const fanPowered = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, humidifierType: "FAN_POWERED" });
  ok("FAN_POWERED new install also resolves", fanPowered.status === "RESOLVED" && fanPowered.branch === "NEW_INSTALLATION");
  const steam = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, humidifierType: "STEAM" });
  ok("STEAM new install -> REMOTE_QUOTE", steam.status === "REFUSED" && steam.routeAction === "REMOTE_QUOTE" && steam.outcome.factKey === "humidifier_type");
  const unknownType = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, humidifierType: "UNKNOWN" });
  ok(
    "UNKNOWN desired type on new install -> REMOTE_QUOTE, NOT PHOTO_REVIEW — the H8 settled distinction: no installed device exists for a photo to classify",
    unknownType.status === "REFUSED" && unknownType.routeAction === "REMOTE_QUOTE" && unknownType.outcome.factKey === "humidifier_type" && unknownType.outcome.observed === "UNKNOWN"
  );
}

group("101. humidifier_type belongs to accessory_and_media, with exactly the four approved values");
{
  const accessoryAndMedia = HVAC_FAMILIES.find((f) => f.key === "accessory_and_media")!;
  ok(
    "accessory_and_media now establishes humidifier_type, alongside its original facts (accessory_present, accessory_kind, replacement_vs_new, filter_slot_size)",
    accessoryAndMedia.establishes.includes("humidifier_type") &&
      accessoryAndMedia.establishes.includes("accessory_present") &&
      accessoryAndMedia.establishes.includes("accessory_kind") &&
      accessoryAndMedia.establishes.includes("replacement_vs_new") &&
      accessoryAndMedia.establishes.includes("filter_slot_size")
  );
  const existingType = WHOLE_HOUSE_HUMIDIFIER_QUESTIONS.find((q) => q.key === "humidifier_type_existing")!.options.map((o) => o.value);
  const newType = WHOLE_HOUSE_HUMIDIFIER_QUESTIONS.find((q) => q.key === "humidifier_type_new")!.options.map((o) => o.value);
  const expected = ["BYPASS", "FAN_POWERED", "STEAM", "UNKNOWN"].sort();
  ok("the replacement-branch type question offers exactly the four approved values", JSON.stringify([...existingType].sort()) === JSON.stringify(expected));
  ok("the new-install-branch type question offers exactly the same four approved values", JSON.stringify([...newType].sort()) === JSON.stringify(expected));
  ok(
    "no humidifier_type option label infers type from a manufacturer or model string",
    WHOLE_HOUSE_HUMIDIFIER_QUESTIONS.filter((q) => q.establishes === "humidifier_type").every((q) => q.options.every((o) => !/model|manufacturer|brand/i.test(o.label)))
  );
}

group("102. water_supply_availability is a separate narrow H2 family, establishing exactly water_supply_present, no gate or primitive");
{
  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("water_supply_availability exists as its own H2 family", familyKeys.includes("water_supply_availability"));
  const waterFamily = HVAC_FAMILIES.find((f) => f.key === "water_supply_availability")!;
  ok("water_supply_availability establishes exactly water_supply_present, nothing else", JSON.stringify(waterFamily.establishes) === JSON.stringify(["water_supply_present"]));
  ok("water_supply_availability binds no gate", waterFamily.gates.length === 0);
  ok("water_supply_availability binds no shared primitive", waterFamily.primitives.length === 0);
  ok(
    "water_supply_availability is NOT folded into condensate_route, dedicated_power_availability, or run_distance — it is its own family",
    waterFamily.key !== "condensate_route" && waterFamily.key !== "dedicated_power_availability" && waterFamily.key !== "run_distance"
  );
  ok(
    "whole-house-humidifier declares water_supply_availability branch-only, on the same accessory_present=ABSENT branch as dedicated_power_availability",
    HVAC_SERVICE_FAMILIES["whole-house-humidifier"].some((u) => u.family === "water_supply_availability" && u.branch) &&
      HVAC_SERVICE_FAMILIES["whole-house-humidifier"].some((u) => u.family === "dedicated_power_availability" && u.branch)
  );
  ok(
    "water_supply_availability is declared for whole-house-humidifier only",
    Object.entries(HVAC_SERVICE_FAMILIES).filter(([, usages]) => usages.some((u) => u.family === "water_supply_availability")).length === 1
  );
  const waterQuestion = WHOLE_HOUSE_HUMIDIFIER_QUESTIONS.find((q) => q.key === "water_supply")!;
  ok(
    "the water_supply question asks about visible existing tubing/connection only — no adequacy, permission, or pressure judgment",
    !/adequate|permit|pressure|suitable|technically/i.test(waterQuestion.prompt)
  );
}

group("103. new-installation water/drain/power: PRESENT continues, ABSENT REMOTE_QUOTEs, UNKNOWN PHOTO_REVIEWs");
{
  const waterAbsent = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, waterSupplyPresent: "ABSENT" });
  ok("water_supply_present=ABSENT -> REMOTE_QUOTE", waterAbsent.status === "REFUSED" && waterAbsent.routeAction === "REMOTE_QUOTE" && waterAbsent.outcome.factKey === "water_supply_present");
  const waterUnknown = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, waterSupplyPresent: "UNKNOWN" });
  ok("water_supply_present=UNKNOWN -> PHOTO_REVIEW", waterUnknown.status === "REFUSED" && waterUnknown.routeAction === "PHOTO_REVIEW" && waterUnknown.outcome.factKey === "water_supply_present");

  const noneVisible = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, condensateRoute: "NONE_VISIBLE" });
  ok("condensate_route=NONE_VISIBLE -> REMOTE_QUOTE", noneVisible.status === "REFUSED" && noneVisible.routeAction === "REMOTE_QUOTE" && noneVisible.outcome.factKey === "condensate_route");
  const condensateUnknown = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, condensateRoute: "UNKNOWN" });
  ok("condensate_route=UNKNOWN -> PHOTO_REVIEW", condensateUnknown.status === "REFUSED" && condensateUnknown.routeAction === "PHOTO_REVIEW");
  const gravityDrain = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, condensateRoute: "GRAVITY_DRAIN_PRESENT" });
  ok("condensate_route=GRAVITY_DRAIN_PRESENT continues and resolves — a visible usable drain route", gravityDrain.status === "RESOLVED");

  const powerAbsent = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, dedicatedCircuitPresent: "ABSENT" });
  ok("dedicated_circuit_present=ABSENT -> REMOTE_QUOTE", powerAbsent.status === "REFUSED" && powerAbsent.routeAction === "REMOTE_QUOTE" && powerAbsent.outcome.factKey === "dedicated_circuit_present");
  const powerUnknown = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, dedicatedCircuitPresent: "UNKNOWN" });
  ok("dedicated_circuit_present=UNKNOWN -> PHOTO_REVIEW", powerUnknown.status === "REFUSED" && powerUnknown.routeAction === "PHOTO_REVIEW");

  const overBand = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, runBand: "OVER_BAND" });
  ok("run_band=OVER_BAND -> REMOTE_QUOTE", overBand.status === "REFUSED" && overBand.routeAction === "REMOTE_QUOTE" && overBand.outcome.factKey === "run_band");
  const runUnknown = resolveWholeHouseHumidifier({ ...HUMIDIFIER_NEW_INSTALL_BASE, runBand: "UNKNOWN" });
  ok("run_band=UNKNOWN -> PHOTO_REVIEW", runUnknown.status === "REFUSED" && runUnknown.routeAction === "PHOTO_REVIEW");
  ok(
    "run_band reuses condensate-pump-installation's own one-boundary CondensateRunBand shape — no new numeric threshold invented in H8",
    // H11 correction: bounded to whole-house-humidifier's own section — an
    // unbounded scan now also covers H9's and H11's own, unrelated
    // EXTENDED-shaped run-band types (mini-split-installation's own
    // MiniSplitInstallationRunBand genuinely has three bands, and legitimately
    // isn't this check's business).
    !section(strip("lib/hvac/scope.ts"), "export type HumidifierType", "export type OpeningSizePattern").includes("EXTENDED")
  );
}

group("104. water, drain, and power are NOT re-asked or required on the bounded existing-replacement branch");
{
  // The replacement branch resolves without ever reading waterSupplyPresent,
  // condensateRoute, or dedicatedCircuitPresent — structurally proven by
  // varying them freely with no effect on a replacement resolution.
  const withAbsentEverything = resolveWholeHouseHumidifier({
    ...HUMIDIFIER_REPLACEMENT_BASE,
    waterSupplyPresent: "ABSENT",
    condensateRoute: "NONE_VISIBLE",
    dedicatedCircuitPresent: "ABSENT",
    runBand: "OVER_BAND",
  });
  ok(
    "a replacement resolves RESOLVE_ADJUSTED even when water/drain/power/run are all set to their worst-case values — none of them is read on this branch",
    withAbsentEverything.status === "RESOLVED" && withAbsentEverything.routeAction === "RESOLVE_ADJUSTED" && withAbsentEverything.branch === "REPLACEMENT"
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  // Bounded by a code token, not the ("New-installation branch") comment
  // that strip() has already removed — `branch: "REPLACEMENT"` is the
  // literal return value that closes the replacement branch's own code.
  const replacementBranch = section(scopeSrc, "export function resolveWholeHouseHumidifier", 'branch: "REPLACEMENT"');
  ok(
    "the replacement branch's own code never reads waterSupplyPresent, condensateRoute, or dedicatedCircuitPresent",
    !/waterSupplyPresent|condensateRoute|dedicatedCircuitPresent/.test(replacementBranch)
  );
}

group("105. no diagnostic humidity/comfort language, and no symptom vocabulary, in either H8 tree");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const h8Section = section(scopeSrc, "export type IndoorUnitType");
  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" in the H8 sections`, !h8Section.includes(symptom));
  }
  const allQuestions = [...MINI_SPLIT_HEAD_CLEANING_QUESTIONS, ...WHOLE_HOUSE_HUMIDIFIER_QUESTIONS];
  const optionValues = allQuestions.flatMap((q) => q.options.map((o) => o.value));
  ok(
    "no H8 answer option value is any of the closed reported_symptom vocabulary",
    optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v))
  );
  // Deliberately NOT a bare `need(s|ed)?` catch-all — that also matches
  // ordinary logistics phrasing this file legitimately uses ("how many
  // units need deep cleaning", "how far would a run need to travel").
  // Each alternative here targets the diagnostic/comfort-judgment SENSE
  // specifically, not the bare word.
  const humidityDiagnosticLanguage = /humidity complaint|too dry|too humid|comfort complaint|is (it |this )?needed\b|do(es)? (it|this|the \w+) need\b|undersized|working properly|is it working/i;
  const allWording = allQuestions.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]).join(" ");
  ok("no H8 question prompt or answer label uses humidity/comfort/need/sizing/diagnosis language", !humidityDiagnosticLanguage.test(allWording));

  const h8Keys = ["mini-split-head-cleaning", "whole-house-humidifier"];
  const shellAliases = (hvacServiceCall().aliases ?? []).map((a) => a.toLowerCase());
  for (const key of h8Keys) {
    const svc = HVAC_SERVICES.find((s) => s.key === key)!;
    const overlap = (svc.aliases ?? []).filter((a) => shellAliases.includes(a.toLowerCase()));
    ok(`${key}'s own aliases share no phrase with hvac-service-call's symptom vocabulary`, overlap.length === 0, overlap.join(", "));
  }
}

group("106. exactly 19 H2 families after H8's two, H9's one, and H11's one narrow additions — H9's own check, superseded again on purpose");
{
  // H9 moved this group's own boundary from seventeen to eighteen
  // (vent_cover_configuration); H11 moves it again, eighteen to nineteen
  // (equipment_installation_context) — the same discipline this group's
  // own title already documents H8 applying to H2's original fifteen.
  ok(
    "HVAC_FAMILIES is now exactly 19 entries — fifteen original, plus H8's indoor_unit_form and water_supply_availability, plus H9's vent_cover_configuration, plus H11's equipment_installation_context",
    HVAC_FAMILIES.length === 19
  );
  ok("HVAC_FAMILY_KEYS has 19 unique entries", new Set(HVAC_FAMILY_KEYS).size === 19);
  ok("HVAC_GATE_KEYS is still exactly 7 entries — no new gate was added", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS is still exactly 7 entries — no new primitive was added", HVAC_PRIMITIVE_KEYS.length === 7);
  ok("no HVAC family manifest declares actual Question/AnswerOption content — vent_cover_configuration included", HVAC_FAMILIES.every((f) => !("questions" in f)));
}

group("107. H3-H7 behavior is unchanged by the H8 addition");
{
  const condensatePump = resolveCondensatePumpInstallation({
    accessClass: "ACCESSIBLE",
    condensateRoute: "PUMP_PRESENT",
    supplyArrangement: "CUSTOMER_SUPPLIED",
    dedicatedCircuitPresent: "PRESENT",
    runBand: "STANDARD",
  });
  ok("condensate-pump-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", condensatePump.status === "RESOLVED" && condensatePump.routeAction === "RESOLVE_ADJUSTED");
  const thermostat = resolveThermostatInstallation(THERMOSTAT_REPLACEMENT_FACTS);
  ok("thermostat-installation still resolves RESOLVE_ADJUSTED/REPLACEMENT", thermostat.status === "RESOLVED" && thermostat.routeAction === "RESOLVE_ADJUSTED");
  const safetySwitch = resolveCondensateSafetySwitchInstallation({ accessClass: "ACCESSIBLE", condensateRoute: "PUMP_PRESENT" });
  ok("condensate-safety-switch-installation still resolves RESOLVE_INSTANT", safetySwitch.status === "RESOLVED" && safetySwitch.routeAction === "RESOLVE_INSTANT");
  const filter = resolveAirFilterReplacement({ filterSlotSize: "16x25x1", quantity: 1 });
  ok("air-filter-replacement still resolves RESOLVE_INSTANT", filter.status === "RESOLVED" && filter.routeAction === "RESOLVE_INSTANT");
  const acTuneUp = resolveAcTuneUp({
    systemType: "FURNACE_AND_AC",
    indoorAccessClass: "ACCESSIBLE",
    outdoorLocation: "GROUND_LEVEL_ADJACENT",
    outdoorAccessClass: "ACCESSIBLE",
    systemCount: 1,
  });
  ok("ac-tune-up still resolves RESOLVE_INSTANT", acTuneUp.status === "RESOLVED" && acTuneUp.routeAction === "RESOLVE_INSTANT");
  const filterCabinet = resolveAirCleanerCabinetInstallation(FILTER_CABINET_BASE);
  ok("air-cleaner-cabinet-installation still resolves RESOLVE_ADJUSTED", filterCabinet.status === "RESOLVED" && filterCabinet.routeAction === "RESOLVE_ADJUSTED");
  const consumable = resolveAccessoryConsumableReplacement(CONSUMABLE_BASE);
  ok("accessory-consumable-replacement still resolves RESOLVE_INSTANT", consumable.status === "RESOLVED" && consumable.routeAction === "RESOLVE_INSTANT");
  ok(
    "H3-H7's own question data is all still exported and non-empty",
    CONDENSATE_SAFETY_SWITCH_QUESTIONS.length === 2 &&
      AIR_FILTER_REPLACEMENT_QUESTIONS.length === 2 &&
      THERMOSTAT_QUESTIONS.length > 0 &&
      AC_TUNE_UP_QUESTIONS.length > 0 &&
      MINI_SPLIT_TUNE_UP_QUESTIONS.length > 0 &&
      AIR_CLEANER_CABINET_INSTALLATION_QUESTIONS.length > 0 &&
      ACCESSORY_CONSUMABLE_REPLACEMENT_QUESTIONS.length > 0
  );
}


group("108. vent-cover-replacement's own catalog entry is unchanged — still FIXED, still defaultOffered false");
{
  const svc = HVAC_SERVICES.find((s) => s.key === "vent-cover-replacement")!;
  ok("vent-cover-replacement is still disposition FIXED", svc.disposition === "FIXED");
  ok("vent-cover-replacement is still defaultOffered false", svc.defaultOffered === false);
  ok("vent-cover-replacement's category is still ducts-vents", svc.category === "ducts-vents");
  ok("vent-cover-replacement still has no bookingType", svc.bookingType === undefined);
  ok("vent-cover-replacement's G1 access slot is still exactly PRIMARY", JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["vent-cover-replacement"]) === JSON.stringify(["PRIMARY"]));
}

group("109. vent_cover_configuration is a separate H9 family, establishes exactly the three approved facts, no gate, no primitive");
{
  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("vent_cover_configuration exists as its own H9 family", familyKeys.includes("vent_cover_configuration"));
  const family = HVAC_FAMILIES.find((f) => f.key === "vent_cover_configuration")!;
  ok(
    "vent_cover_configuration establishes exactly opening_size_pattern, opening_dimensions, mount_surface — nothing else",
    JSON.stringify(family.establishes) === JSON.stringify(["opening_size_pattern", "opening_dimensions", "mount_surface"])
  );
  ok("vent_cover_configuration binds no gate", family.gates.length === 0);
  ok("vent_cover_configuration binds no shared primitive", family.primitives.length === 0);
  ok(
    "vent_cover_configuration is declared for vent-cover-replacement only, and for no other service",
    Object.entries(HVAC_SERVICE_FAMILIES).filter(([, usages]) => usages.some((u) => u.family === "vent_cover_configuration")).length === 1 &&
      HVAC_SERVICE_FAMILIES["vent-cover-replacement"].some((u) => u.family === "vent_cover_configuration")
  );
  ok(
    "vent-cover-replacement declares exactly one family usage — vent_cover_configuration, unbranched",
    HVAC_SERVICE_FAMILIES["vent-cover-replacement"].length === 1 && HVAC_SERVICE_FAMILIES["vent-cover-replacement"][0].branch === undefined
  );
}

group("110. indoor_equipment_access was removed from vent-cover-replacement only — the generic family and every other service's usage are untouched");
{
  ok(
    "vent-cover-replacement no longer declares indoor_equipment_access",
    !HVAC_SERVICE_FAMILIES["vent-cover-replacement"].some((u) => u.family === "indoor_equipment_access")
  );
  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("indoor_equipment_access still exists as a family — not deleted, only unhooked from this one service", familyKeys.includes("indoor_equipment_access"));
  const accessFamily = HVAC_FAMILIES.find((f) => f.key === "indoor_equipment_access")!;
  ok(
    "indoor_equipment_access's own purpose text is untouched — still framed around reaching indoor EQUIPMENT",
    /indoor equipment/i.test(accessFamily.purpose)
  );
  const stillUsing = Object.entries(HVAC_SERVICE_FAMILIES).filter(([, usages]) => usages.some((u) => u.family === "indoor_equipment_access"));
  ok(
    "every other service that declared indoor_equipment_access before H9 still declares it — duct-assessment is one of them",
    stillUsing.some(([key]) => key === "duct-assessment") && stillUsing.some(([key]) => key === "ac-tune-up") && stillUsing.length >= 10
  );
  ok("no service other than vent-cover-replacement lost an indoor_equipment_access usage this phase", !stillUsing.some(([key]) => key === "vent-cover-replacement"));
}

group("111. count is a direct quantity, not a family — and a single opening skips the size-consistency question entirely");
{
  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("no family named count, quantity, or vent_cover_count exists", !familyKeys.some((k) => /count|quantity/i.test(k)));
  const countQuestion = VENT_COVER_REPLACEMENT_QUESTIONS.find((q) => q.key === "count")!;
  ok("count is asked directly, with no options list — a number, not a closed vocabulary", countQuestion.options.length === 0);

  const zero = resolveVentCoverReplacement({ count: 0, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("count 0 is unresolved -> PHOTO_REVIEW, never treated as a valid quantity", zero.status === "REFUSED" && zero.routeAction === "PHOTO_REVIEW" && zero.outcome.factKey === "count");
  const negative = resolveVentCoverReplacement({ count: -1, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("a negative count is unresolved -> PHOTO_REVIEW", negative.status === "REFUSED" && negative.routeAction === "PHOTO_REVIEW");

  const singleUnknownPattern = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNKNOWN", openingDimensions: "10x6", mountSurface: "WALL" });
  ok(
    "count === 1 never reads opening_size_pattern — an UNKNOWN pattern value does not block a singleton from resolving",
    singleUnknownPattern.status === "RESOLVED" && singleUnknownPattern.routeAction === "RESOLVE_INSTANT"
  );
  const singleMixedPattern = resolveVentCoverReplacement({ count: 1, openingSizePattern: "MIXED", openingDimensions: "10x6", mountSurface: "WALL" });
  ok(
    "count === 1 never reads opening_size_pattern — a MIXED pattern value (which cannot even be truthfully asked of one opening) does not block resolution either",
    singleMixedPattern.status === "RESOLVED" && singleMixedPattern.routeAction === "RESOLVE_INSTANT"
  );
}

group("112. opening_size_pattern: read only when count > 1 — UNIFORM continues, MIXED REMOTE_QUOTEs, UNKNOWN PHOTO_REVIEWs");
{
  const patternQuestion = VENT_COVER_REPLACEMENT_QUESTIONS.find((q) => q.key === "opening_size_pattern")!;
  ok(
    "opening_size_pattern has exactly the three approved values, in this order",
    patternQuestion.options.map((o) => o.value).join(",") === "UNIFORM,MIXED,UNKNOWN"
  );

  const uniform = resolveVentCoverReplacement({ count: 3, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("count > 1, UNIFORM -> continues to RESOLVE_INSTANT (with dimensions and surface known)", uniform.status === "RESOLVED" && uniform.routeAction === "RESOLVE_INSTANT");

  const mixed = resolveVentCoverReplacement({ count: 3, openingSizePattern: "MIXED", openingDimensions: null, mountSurface: "UNKNOWN" });
  ok(
    "count > 1, MIXED sizes -> REMOTE_QUOTE, before dimensions or mount_surface are even read — a single fixed price cannot bound mixed-size openings",
    mixed.status === "REFUSED" && mixed.routeAction === "REMOTE_QUOTE" && mixed.outcome.factKey === "opening_size_pattern" && mixed.outcome.observed === "MIXED"
  );

  const unknownPattern = resolveVentCoverReplacement({ count: 2, openingSizePattern: "UNKNOWN", openingDimensions: "10x6", mountSurface: "WALL" });
  ok(
    "count > 1, UNKNOWN pattern -> PHOTO_REVIEW",
    unknownPattern.status === "REFUSED" && unknownPattern.routeAction === "PHOTO_REVIEW" && unknownPattern.outcome.factKey === "opening_size_pattern"
  );
}

group("113. opening_dimensions is a direct measurement/readout only — missing or unreadable PHOTO_REVIEWs, and no standard-size vocabulary exists");
{
  const dimensionsQuestion = VENT_COVER_REPLACEMENT_QUESTIONS.find((q) => q.key === "opening_dimensions")!;
  ok("opening_dimensions is asked directly, with no closed options list — a free-text reading, not a picklist", dimensionsQuestion.options.length === 0);
  ok(
    "the opening_dimensions prompt asks for the existing opening's size, not a duct or airflow judgment",
    /size/i.test(dimensionsQuestion.prompt) && !/duct|airflow|adequa|balance/i.test(dimensionsQuestion.prompt)
  );

  const missing = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: null, mountSurface: "WALL" });
  ok(
    "null opening_dimensions -> PHOTO_REVIEW",
    missing.status === "REFUSED" && missing.routeAction === "PHOTO_REVIEW" && missing.outcome.factKey === "opening_dimensions"
  );

  const scopeSrc = strip("lib/hvac/scope.ts");
  // H11 correction: bounded to vent-cover-replacement's own section — an
  // unbounded scan now also covers H11's own, unrelated STANDARD-shaped
  // run-band and fuel/venting vocabularies (mini-split-installation's
  // run_band, ac-tune-up-style STANDARD values), which legitimately are
  // not this check's business.
  const ventSection = section(scopeSrc, "export type OpeningSizePattern", "type HvacRemoteQuoteResolved");
  ok("opening_dimensions is typed as string | null — no STANDARD/NONSTANDARD or enum classification exists", /openingDimensions: string \| null/.test(ventSection));
  ok(
    "no STANDARD/NONSTANDARD or size-classification vocabulary was invented anywhere in the vent-cover-replacement section",
    !/STANDARD|NONSTANDARD/.test(ventSection)
  );
  ok(
    "opening_dimensions carries no duct sizing, airflow, or compatibility inference anywhere in its handling",
    !/duct.?siz|airflow|compat/i.test(ventSection)
  );
}

group("114. mount_surface: WALL/CEILING/FLOOR resolve, MIXED REMOTE_QUOTEs, UNKNOWN PHOTO_REVIEWs — never flattened into one scalar");
{
  const surfaceQuestion = VENT_COVER_REPLACEMENT_QUESTIONS.find((q) => q.key === "mount_surface")!;
  ok(
    "mount_surface has exactly the five approved values, in this order",
    surfaceQuestion.options.map((o) => o.value).join(",") === "WALL,CEILING,FLOOR,MIXED,UNKNOWN"
  );

  for (const surface of ["WALL", "CEILING", "FLOOR"] as const) {
    const resolved = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: surface });
    ok(`mount_surface ${surface} -> RESOLVE_INSTANT`, resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  }

  const mixedSurface = resolveVentCoverReplacement({ count: 2, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "MIXED" });
  ok(
    "mount_surface MIXED -> REMOTE_QUOTE — covers on more than one kind of surface are never flattened into a single scalar",
    mixedSurface.status === "REFUSED" && mixedSurface.routeAction === "REMOTE_QUOTE" && mixedSurface.outcome.factKey === "mount_surface" && mixedSurface.outcome.observed === "MIXED"
  );

  const unknownSurface = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "UNKNOWN" });
  ok(
    "mount_surface UNKNOWN -> PHOTO_REVIEW",
    unknownSurface.status === "REFUSED" && unknownSurface.routeAction === "PHOTO_REVIEW" && unknownSurface.outcome.factKey === "mount_surface"
  );
}

group("115. the fully-resolved path terminates RESOLVE_INSTANT only — no REROUTE_SERVICE or REROUTE_TROUBLESHOOTING exists anywhere in this tree");
{
  const resolved = resolveVentCoverReplacement({ count: 4, openingSizePattern: "UNIFORM", openingDimensions: "12x6", mountSurface: "CEILING" });
  ok("a fully-established multi-cover, uniform-size, single-surface case resolves RESOLVE_INSTANT", resolved.status === "RESOLVED" && resolved.routeAction === "RESOLVE_INSTANT");
  ok("resolveVentCoverReplacement never returns RESOLVE_ADJUSTED — FIXED disposition, one price, no branch adjustment", (resolved as { routeAction: string }).routeAction !== "RESOLVE_ADJUSTED");

  const scopeSrc = strip("lib/hvac/scope.ts");
  const ventSection = section(scopeSrc, "export type OpeningSizePattern", "export type VentCoverReplacementQuestionKey");
  ok("no REROUTE_SERVICE exists anywhere in the vent-cover-replacement resolver", !/REROUTE_SERVICE/.test(ventSection));
  ok("no REROUTE_TROUBLESHOOTING exists anywhere in the vent-cover-replacement resolver", !/REROUTE_TROUBLESHOOTING/.test(ventSection));
  ok("no identityGate, fuelGate, ventingGate, capacityGate, or controlGate is called in this resolver", !/identityGate|fuelGate|ventingGate|capacityGate|controlGate/.test(ventSection));
  ok("no accessGate is called in this resolver — access is out of scope for H9, per the recorded G1-slot decision", !/accessGate/.test(ventSection));
}

group("116. no duct-sizing, adequacy, airflow, or condition language anywhere in the vent-cover-replacement tree, and no symptom vocabulary");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const ventSection = section(scopeSrc, "export type OpeningSizePattern", "export type VentCoverReplacementQuestionKey");
  const diagnosticLanguage = /duct siz|adequa|airflow|air flow|balanc|condition of the duct|leaky duct|insulat|damaged duct/i;
  ok("no diagnostic duct/airflow/adequacy/condition language appears in the resolver source", !diagnosticLanguage.test(ventSection));

  for (const q of VENT_COVER_REPLACEMENT_QUESTIONS) {
    ok(`"${q.key}"'s prompt names no duct-sizing, adequacy, airflow, or condition judgment`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no duct-sizing, adequacy, airflow, or condition judgment`, !diagnosticLanguage.test(o.label), o.label);
    }
  }

  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" in the vent-cover-replacement section`, !ventSection.includes(symptom));
  }
  const allWording = VENT_COVER_REPLACEMENT_QUESTIONS.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]).join(" ").toLowerCase();
  const symptomPhrases = ["mold smell", "odor", "not cooling", "no heat", "won't turn on", "leaking water", "rattling", "whistling"];
  ok("no vent-cover-replacement question prompt or answer label contains symptom phrasing", symptomPhrases.every((p) => !allWording.includes(p)));

  ok("no EquipmentCondition or conditionGate is read in this resolver", !/EquipmentCondition|conditionGate|equipmentCondition/.test(ventSection));
  ok("no materialRoles, components, or ScopeConsequence field is declared in this resolver", !/materialRoles|components:|ScopeConsequence/.test(ventSection));
}

group("117. appointment-only services remain without scope.ts resolvers, and condenser-pad-replacement remains without one — H9's own \"exactly one new resolver\" check, superseded again on purpose by H11's five");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok("no resolveDuctAssessment function exists anywhere in scope.ts", !/export function resolveDuctAssessment\(/.test(scopeSrc));
  ok("no resolveHvacServiceCall function exists anywhere in scope.ts", !/export function resolveHvacServiceCall\(/.test(scopeSrc));
  ok("no resolveCondenserPadReplacement function exists anywhere in scope.ts", !/export function resolveCondenserPadReplacement\(/.test(scopeSrc));

  const ductAssessment = HVAC_SERVICES.find((s) => s.key === "duct-assessment")!;
  ok("duct-assessment is still disposition APPOINTMENT_ONLY", ductAssessment.disposition === "APPOINTMENT_ONLY");
  const hvacServiceCallSvc = HVAC_SERVICES.find((s) => s.key === "hvac-service-call")!;
  ok("hvac-service-call is still disposition APPOINTMENT_ONLY", hvacServiceCallSvc.disposition === "APPOINTMENT_ONLY");
  ok("hvac-service-call still carries bookingType TROUBLESHOOT_ONLY", hvacServiceCallSvc.bookingType === "TROUBLESHOOT_ONLY");
  ok("HVAC_SERVICE_CALL_SHELL is still schedulable through the existing G2/G3 mechanism, unchanged by H9 or H11", hvacServiceCallIsSchedulable());
  ok("HVAC_SERVICE_CALL_SHELL itself is still exported and unchanged in shape", typeof HVAC_SERVICE_CALL_SHELL === "object" && HVAC_SERVICE_CALL_SHELL !== null);

  const resolveFnNames = (scopeSrc.match(/export function (resolve\w+)\(/g) ?? []).map((m) => m.replace(/export function |\(/g, ""));
  ok(
    "H9 added exactly one new resolve function (resolveVentCoverReplacement) and H11 added exactly five more — nineteen total, not fourteen",
    resolveFnNames.includes("resolveVentCoverReplacement") &&
      ["resolveFurnaceReplacement", "resolveAcReplacement", "resolveHeatPumpReplacement", "resolveWholeSystemReplacement", "resolveMiniSplitInstallation"].every((f) =>
        resolveFnNames.includes(f)
      ) &&
      resolveFnNames.length === 19
  );
}

group("118. H3-H8 behavior is unchanged by the H9 addition");
{
  const heatPump = resolveHeatPumpTuneUp({
    systemType: "HEAT_PUMP_SPLIT",
    indoorAccessClass: "ACCESSIBLE",
    outdoorLocation: "GROUND_LEVEL_ADJACENT",
    outdoorAccessClass: "ACCESSIBLE",
    systemCount: 1,
  });
  ok("heat-pump-tune-up still resolves RESOLVE_INSTANT", heatPump.status === "RESOLVED" && heatPump.routeAction === "RESOLVE_INSTANT");
  const ductTreatment = resolveDuctAirTreatmentInstallation({
    systemType: "FURNACE_AND_AC",
    accessClass: "ACCESSIBLE",
    dedicatedCircuitPresent: "PRESENT",
  });
  ok("duct-air-treatment-installation still resolves RESOLVE_ADJUSTED", ductTreatment.status === "RESOLVED" && ductTreatment.routeAction === "RESOLVE_ADJUSTED");
  const humidifierReplacement = resolveWholeHouseHumidifier(HUMIDIFIER_REPLACEMENT_BASE);
  ok(
    "whole-house-humidifier's replacement branch still resolves RESOLVE_ADJUSTED, unaffected by the H9 addition",
    humidifierReplacement.status === "RESOLVED" && humidifierReplacement.routeAction === "RESOLVE_ADJUSTED"
  );
  ok(
    "H2's family count moved from 18 to 19 with H11's own equipment_installation_context — this group's own H9-era check, superseded again on purpose",
    HVAC_FAMILIES.length === 19 && HVAC_FAMILY_KEYS.length === 19
  );
  ok(
    "H3-H8's own question data is all still exported and non-empty",
    HEAT_PUMP_TUNE_UP_QUESTIONS.length > 0 && DUCT_AIR_TREATMENT_INSTALLATION_QUESTIONS.length > 0 && WHOLE_HOUSE_HUMIDIFIER_QUESTIONS.length > 0
  );
}

group("119. quantity fails closed to PHOTO_REVIEW for anything that is not a positive integer — fractional, NaN, and Infinity are never coerced");
{
  const zero = resolveVentCoverReplacement({ count: 0, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("count 0 -> PHOTO_REVIEW", zero.status === "REFUSED" && zero.routeAction === "PHOTO_REVIEW" && zero.outcome.factKey === "count");
  const negative = resolveVentCoverReplacement({ count: -3, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("a negative count -> PHOTO_REVIEW", negative.status === "REFUSED" && negative.routeAction === "PHOTO_REVIEW" && negative.outcome.factKey === "count");
  const fractional = resolveVentCoverReplacement({ count: 1.5, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok(
    "a fractional count (1.5) -> PHOTO_REVIEW, never rounded or floored into a valid quantity",
    fractional.status === "REFUSED" && fractional.routeAction === "PHOTO_REVIEW" && fractional.outcome.factKey === "count"
  );
  const notANumber = resolveVentCoverReplacement({ count: NaN, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("NaN count -> PHOTO_REVIEW", notANumber.status === "REFUSED" && notANumber.routeAction === "PHOTO_REVIEW" && notANumber.outcome.factKey === "count");
  const infinite = resolveVentCoverReplacement({ count: Infinity, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("Infinity count -> PHOTO_REVIEW", infinite.status === "REFUSED" && infinite.routeAction === "PHOTO_REVIEW" && infinite.outcome.factKey === "count");
  const negativeInfinite = resolveVentCoverReplacement({ count: -Infinity, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("negative Infinity count -> PHOTO_REVIEW", negativeInfinite.status === "REFUSED" && negativeInfinite.routeAction === "PHOTO_REVIEW");

  const validInteger = resolveVentCoverReplacement({ count: 3, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("a valid positive integer count still follows the existing tree and resolves RESOLVE_INSTANT", validInteger.status === "RESOLVED" && validInteger.routeAction === "RESOLVE_INSTANT");
  const validSingleton = resolveVentCoverReplacement({ count: 1, openingSizePattern: "MIXED", openingDimensions: "10x6", mountSurface: "WALL" });
  ok(
    "count === 1 still ignores opening_size_pattern entirely — Q2 is not part of that branch, unaffected by the boundary fix",
    validSingleton.status === "RESOLVED" && validSingleton.routeAction === "RESOLVE_INSTANT"
  );

  const scopeSrc = strip("lib/hvac/scope.ts");
  const ventSection = section(scopeSrc, "export type OpeningSizePattern", "export type VentCoverReplacementQuestionKey");
  ok("the quantity boundary reads Number.isInteger — not a manual modulo, floor, or round check", /Number\.isInteger\(facts\.count\)/.test(ventSection));
  ok("no Math.floor, Math.round, Math.ceil, or Math.trunc silently coerces the observed quantity", !/Math\.(floor|round|ceil|trunc)/.test(ventSection));
}

group("120. opening_dimensions fails closed to PHOTO_REVIEW for null, empty, and whitespace-only readings — the stored value is never rewritten");
{
  const missing = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: null, mountSurface: "WALL" });
  ok("null opening_dimensions -> PHOTO_REVIEW", missing.status === "REFUSED" && missing.routeAction === "PHOTO_REVIEW" && missing.outcome.factKey === "opening_dimensions");
  const empty = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "", mountSurface: "WALL" });
  ok("an empty string opening_dimensions -> PHOTO_REVIEW", empty.status === "REFUSED" && empty.routeAction === "PHOTO_REVIEW" && empty.outcome.factKey === "opening_dimensions");
  const whitespaceOnly = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "   ", mountSurface: "WALL" });
  ok(
    "a whitespace-only opening_dimensions (\"   \") -> PHOTO_REVIEW",
    whitespaceOnly.status === "REFUSED" && whitespaceOnly.routeAction === "PHOTO_REVIEW" && whitespaceOnly.outcome.factKey === "opening_dimensions"
  );
  const tabsAndNewlines = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "\t\n  \t", mountSurface: "WALL" });
  ok("a tabs/newlines-only opening_dimensions -> PHOTO_REVIEW", tabsAndNewlines.status === "REFUSED" && tabsAndNewlines.routeAction === "PHOTO_REVIEW");

  const nonEmpty = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("a non-empty reading still resolves RESOLVE_INSTANT when every other fact is bounded", nonEmpty.status === "RESOLVED" && nonEmpty.routeAction === "RESOLVE_INSTANT");
  const paddedReading = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: " 10x6 ", mountSurface: "WALL" });
  ok(
    "a padded reading (\" 10x6 \") counts as established — .trim() only decides whether a reading exists, it never rewrites the stored value",
    paddedReading.status === "RESOLVED" && paddedReading.routeAction === "RESOLVE_INSTANT"
  );

  const scopeSrc = strip("lib/hvac/scope.ts");
  const ventSection = section(scopeSrc, "export type OpeningSizePattern", "export type VentCoverReplacementQuestionKey");
  ok("the dimensions boundary calls .trim() only to test for emptiness, on the same line as the null check", /openingDimensions === null \|\| facts\.openingDimensions\.trim\(\) === ""/.test(ventSection));
  ok(
    "openingDimensions is never reassigned, parsed, or normalized anywhere in the resolver — no .replace, .split, .toUpperCase, or regex rewrite of it",
    !/openingDimensions\s*=(?!=)/.test(ventSection) &&
      !/openingDimensions\.(replace|split|toUpperCase|toLowerCase|match)/.test(ventSection)
  );
  ok("no width/height parsing, standard-size list, or compatibility inference was added alongside the trim fix", !/parseInt|parseFloat|STANDARD_SIZE|COMPATIBLE/.test(ventSection));
}

// ═══════════════════════════════════════════════════════════════════════
// H11 — five REMOTE_QUOTE equipment-replacement resolvers
// ═══════════════════════════════════════════════════════════════════════

const FURNACE_REPLACEMENT_BASE: FurnaceReplacementFacts = {
  systemType: "FURNACE_AND_AC",
  fuelType: "NATURAL_GAS",
  ventingClass: "INDUCED_DRAFT",
  heatingInputBtu: 80000,
  accessClass: "ACCESSIBLE",
  condensateRoute: "PUMP_PRESENT",
  supplyArrangement: "CONTRACTOR_SUPPLIED",
  equipmentCondition: "SERVICEABLE",
};

const AC_REPLACEMENT_BASE: AcReplacementFacts = {
  systemType: "FURNACE_AND_AC",
  coolingTons: 3,
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  linesetStatus: "PRESENT_VISIBLE",
  supplyArrangement: "CONTRACTOR_SUPPLIED",
};

const HEAT_PUMP_REPLACEMENT_BASE: HeatPumpReplacementFacts = {
  systemType: "HEAT_PUMP_SPLIT",
  coolingTons: 3,
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  linesetStatus: "PRESENT_VISIBLE",
};

const WHOLE_SYSTEM_FURNACE_AND_AC_BASE: WholeSystemReplacementFacts = {
  systemType: "FURNACE_AND_AC",
  fuelType: "NATURAL_GAS",
  ventingClass: "INDUCED_DRAFT",
  heatingInputBtu: 80000,
  coolingTons: 3,
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  linesetStatus: "PRESENT_VISIBLE",
  condensateRoute: "PUMP_PRESENT",
  supplyArrangement: "CONTRACTOR_SUPPLIED",
};

// systemType=HEAT_PUMP_SPLIT with fuel/venting/heating deliberately UNKNOWN/null
// — the branch must resolve WITHOUT reading them, so if it ever regresses to
// reading them unconditionally, these otherwise-refusing values would catch it.
const WHOLE_SYSTEM_HEAT_PUMP_SPLIT_BASE: WholeSystemReplacementFacts = {
  ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE,
  systemType: "HEAT_PUMP_SPLIT",
  fuelType: "UNKNOWN",
  ventingClass: "UNKNOWN",
  heatingInputBtu: null,
};

const WHOLE_SYSTEM_DUAL_FUEL_BASE: WholeSystemReplacementFacts = {
  ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE,
  systemType: "DUAL_FUEL",
  fuelType: "DUAL_FUEL",
};

// NEW_INSTALLATION baseline — deliberately UNUSABLE access values
// (UNKNOWN/NONE/UNKNOWN). This is the H11 patch-review correction's own
// proof shape: if this baseline still resolves RESOLVED/REMOTE_QUOTE, the
// access fields are genuinely unread on this branch, not merely happening
// to pass. Every other, actually-consumed shared fact is valid.
const MINI_SPLIT_INSTALLATION_BASE: MiniSplitInstallationFacts = {
  replacementVsNew: "NEW_INSTALLATION",
  headCount: 2,
  indoorAccessClass: "UNKNOWN",
  outdoorLocation: "NONE",
  outdoorAccessClass: "UNKNOWN",
  runBand: "STANDARD",
  linesetStatus: "NONE",
  condensateRoute: "GRAVITY_DRAIN_PRESENT",
};

// REPLACEMENT baseline — real, valid access. On this branch the two
// access families are genuine decision facts, gated exactly like every
// other two-slot REMOTE_QUOTE service in this file.
const MINI_SPLIT_REPLACEMENT_BASE: MiniSplitInstallationFacts = {
  replacementVsNew: "REPLACEMENT",
  headCount: 2,
  indoorAccessClass: "ACCESSIBLE",
  outdoorLocation: "GROUND_LEVEL_ADJACENT",
  outdoorAccessClass: "ACCESSIBLE",
  runBand: "STANDARD",
  linesetStatus: "NONE",
  condensateRoute: "GRAVITY_DRAIN_PRESENT",
};

group("121. conditionGate's known-work replacement opt-in — default behavior unchanged, opt-in scoped to exactly one caller");
{
  ok("default SERVICEABLE -> CONTINUE, no opts", conditionGate("SERVICEABLE").action === "CONTINUE");
  ok("default DEGRADED -> PHOTO_REVIEW, no opts", conditionGate("DEGRADED").action === "PHOTO_REVIEW");
  ok("default ACTIVE_FAILURE -> ON_SITE_SERVICE, no opts", conditionGate("ACTIVE_FAILURE").action === "ON_SITE_SERVICE");
  ok("default UNKNOWN -> PHOTO_REVIEW, no opts", conditionGate("UNKNOWN").action === "PHOTO_REVIEW");

  ok("knownWorkReplacement:false SERVICEABLE -> CONTINUE, same as default", conditionGate("SERVICEABLE", { knownWorkReplacement: false }).action === "CONTINUE");
  ok("knownWorkReplacement:false DEGRADED -> PHOTO_REVIEW, same as default", conditionGate("DEGRADED", { knownWorkReplacement: false }).action === "PHOTO_REVIEW");
  ok("knownWorkReplacement:false ACTIVE_FAILURE -> ON_SITE_SERVICE, same as default", conditionGate("ACTIVE_FAILURE", { knownWorkReplacement: false }).action === "ON_SITE_SERVICE");

  ok("knownWorkReplacement:true SERVICEABLE -> CONTINUE", conditionGate("SERVICEABLE", { knownWorkReplacement: true }).action === "CONTINUE");
  ok("knownWorkReplacement:true DEGRADED -> CONTINUE", conditionGate("DEGRADED", { knownWorkReplacement: true }).action === "CONTINUE");
  ok("knownWorkReplacement:true ACTIVE_FAILURE -> CONTINUE", conditionGate("ACTIVE_FAILURE", { knownWorkReplacement: true }).action === "CONTINUE");
  ok("knownWorkReplacement:true UNKNOWN -> PHOTO_REVIEW — the opt-in never weakens the UNKNOWN case", conditionGate("UNKNOWN", { knownWorkReplacement: true }).action === "PHOTO_REVIEW");

  const gatesSrc = strip("lib/hvac/gates.ts");
  ok("HVAC_GATE_KEYS is still exactly 7 — the opt-in extends conditionGate, it is not an eighth gate", HVAC_GATE_KEYS.length === 7);
  ok("conditionGate's own signature carries an optional opts parameter, not a required one", /function conditionGate\(condition: EquipmentCondition, opts\?: \{ knownWorkReplacement\?: boolean \}\)/.test(gatesSrc));
  ok("knownWorkReplacement appears exactly once in gates.ts, on conditionGate's own signature — no second caller-side vocabulary invented", (gatesSrc.match(/knownWorkReplacement/g) ?? []).length >= 1);

  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "knownWorkReplacement: true is passed exactly once in scope.ts — only resolveFurnaceReplacement opts in",
    (scopeSrc.match(/knownWorkReplacement: true/g) ?? []).length === 1
  );
  const furnaceSection = section(scopeSrc, "export function resolveFurnaceReplacement", "export type FurnaceReplacementQuestionKey");
  ok("resolveFurnaceReplacement itself calls conditionGate with the known-work opt-in", /conditionGate\(facts\.equipmentCondition, \{ knownWorkReplacement: true \}\)/.test(furnaceSection));
  for (const fnName of [
    "resolveAcReplacement",
    "resolveHeatPumpReplacement",
    "resolveWholeSystemReplacement",
    "resolveMiniSplitInstallation",
    "resolveVentCoverReplacement",
    "resolveWholeHouseHumidifier",
    "resolveAcTuneUp",
  ]) {
    const startMarker = `export function ${fnName}(`;
    const fnStart = scopeSrc.indexOf(startMarker);
    const nextExportFn = scopeSrc.indexOf("export function", fnStart + startMarker.length);
    const fnBody = nextExportFn === -1 ? scopeSrc.slice(fnStart) : scopeSrc.slice(fnStart, nextExportFn);
    ok(`${fnName} never calls conditionGate at all`, fnStart !== -1 && !fnBody.includes("conditionGate"));
  }
  ok("EXISTING_CONDITION_SCOPE stays effect-free — every member still attaches no material role, component or prerequisite", Object.values(EXISTING_CONDITION_SCOPE).every((c) => c.materialRoles.length === 0 && c.components.length === 0 && c.prerequisites.length === 0));
}

group("122. furnace-replacement: FURNACE_AND_AC only, gas/propane only, exact venting/heating coverage, known-work condition, successful REMOTE_QUOTE terminal");
{
  const resolved = resolveFurnaceReplacement(FURNACE_REPLACEMENT_BASE);
  ok("a fully established scope resolves RESOLVED/REMOTE_QUOTE, not REFUSED", resolved.status === "RESOLVED" && resolved.routeAction === "REMOTE_QUOTE");
  ok("the successful shape carries no HvacRefusal outcome field", !("outcome" in resolved));

  const heatPumpMismatch = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, systemType: "HEAT_PUMP_SPLIT" });
  ok("HEAT_PUMP_SPLIT system -> REFUSED/REMOTE_QUOTE (incompatible identity, not the successful shape)", heatPumpMismatch.status === "REFUSED" && heatPumpMismatch.routeAction === "REMOTE_QUOTE");
  const dualFuelMismatch = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, systemType: "DUAL_FUEL" });
  ok("DUAL_FUEL system -> REFUSED/REMOTE_QUOTE — NOT accepted, per the explicit exclusion", dualFuelMismatch.status === "REFUSED" && dualFuelMismatch.routeAction === "REMOTE_QUOTE");
  const unknownSystem = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN system -> PHOTO_REVIEW", unknownSystem.status === "REFUSED" && unknownSystem.routeAction === "PHOTO_REVIEW");

  const oilFuel = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, fuelType: "OIL" });
  ok("OIL fuel -> REFUSED/REMOTE_QUOTE — oil stays outside V1 structured scope", oilFuel.status === "REFUSED" && oilFuel.routeAction === "REMOTE_QUOTE");
  const electricFuel = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, fuelType: "ELECTRIC" });
  ok("ELECTRIC fuel -> REFUSED/REMOTE_QUOTE", electricFuel.status === "REFUSED" && electricFuel.routeAction === "REMOTE_QUOTE");
  const dualFuelFuel = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, fuelType: "DUAL_FUEL" });
  ok("DUAL_FUEL fuel -> REFUSED/REMOTE_QUOTE", dualFuelFuel.status === "REFUSED" && dualFuelFuel.routeAction === "REMOTE_QUOTE");
  const unknownFuel = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, fuelType: "UNKNOWN" });
  ok("UNKNOWN fuel -> PHOTO_REVIEW", unknownFuel.status === "REFUSED" && unknownFuel.routeAction === "PHOTO_REVIEW");
  const propaneFuel = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, fuelType: "PROPANE" });
  ok("PROPANE fuel still resolves", propaneFuel.status === "RESOLVED");

  for (const venting of ["ATMOSPHERIC", "INDUCED_DRAFT", "DIRECT_VENT_SEALED"] as const) {
    const r = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, ventingClass: venting });
    ok(`venting ${venting} continues to a successful terminal`, r.status === "RESOLVED");
  }
  const nonCombustionVenting = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, ventingClass: "NON_COMBUSTION" });
  ok("NON_COMBUSTION venting -> REFUSED/REMOTE_QUOTE", nonCombustionVenting.status === "REFUSED" && nonCombustionVenting.routeAction === "REMOTE_QUOTE");
  const unknownVenting = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, ventingClass: "UNKNOWN" });
  ok("UNKNOWN venting -> PHOTO_REVIEW", unknownVenting.status === "REFUSED" && unknownVenting.routeAction === "PHOTO_REVIEW");

  for (const btu of [40000, 60000, 80000, 100000, 120000]) {
    const r = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, heatingInputBtu: btu });
    ok(`heating input ${btu} BTU/h continues`, r.status === "RESOLVED");
  }
  const offListBtu = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, heatingInputBtu: 75000 });
  ok("an off-list heating input (75000) -> REFUSED/REMOTE_QUOTE, not silently accepted", offListBtu.status === "REFUSED" && offListBtu.routeAction === "REMOTE_QUOTE");
  const nullBtu = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, heatingInputBtu: null });
  ok("null heating input -> PHOTO_REVIEW", nullBtu.status === "REFUSED" && nullBtu.routeAction === "PHOTO_REVIEW");

  const unknownAccess = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, accessClass: "UNKNOWN" });
  ok("UNKNOWN access -> PHOTO_REVIEW", unknownAccess.status === "REFUSED" && unknownAccess.routeAction === "PHOTO_REVIEW");
  const finishedAccess = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, accessClass: "FINISHED" });
  ok("FINISHED access still resolves (only UNKNOWN blocks the PRIMARY slot)", finishedAccess.status === "RESOLVED");

  for (const route of ["PUMP_PRESENT", "GRAVITY_DRAIN_PRESENT", "NONE_VISIBLE"] as const) {
    const r = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, condensateRoute: route });
    ok(`condensate_route ${route} continues — NONE_VISIBLE is useful scope context, not an automatic-pricing failure`, r.status === "RESOLVED");
  }
  const unknownCondensate = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, condensateRoute: "UNKNOWN" });
  ok("UNKNOWN condensate_route -> PHOTO_REVIEW", unknownCondensate.status === "REFUSED" && unknownCondensate.routeAction === "PHOTO_REVIEW");

  for (const supply of ["CUSTOMER_SUPPLIED", "CONTRACTOR_SUPPLIED"] as const) {
    const r = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, supplyArrangement: supply });
    ok(`supply_arrangement ${supply} continues`, r.status === "RESOLVED");
  }

  const serviceable = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, equipmentCondition: "SERVICEABLE" });
  ok("equipment_condition SERVICEABLE resolves", serviceable.status === "RESOLVED");
  const degraded = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, equipmentCondition: "DEGRADED" });
  ok("equipment_condition DEGRADED still resolves — known-work replacement, not a symptom", degraded.status === "RESOLVED");
  const activeFailure = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, equipmentCondition: "ACTIVE_FAILURE" });
  ok("equipment_condition ACTIVE_FAILURE still resolves — the homeowner already selected replacement", activeFailure.status === "RESOLVED");
  const unknownCondition = resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, equipmentCondition: "UNKNOWN" });
  ok("equipment_condition UNKNOWN -> PHOTO_REVIEW, even with the known-work opt-in", unknownCondition.status === "REFUSED" && unknownCondition.routeAction === "PHOTO_REVIEW");

  ok("FURNACE_REPLACEMENT_QUESTIONS has exactly 8 questions", FURNACE_REPLACEMENT_QUESTIONS.length === 8);
  ok("no supply_arrangement or equipment_condition question is missing", FURNACE_REPLACEMENT_QUESTIONS.some((q) => q.key === "supply_arrangement") && FURNACE_REPLACEMENT_QUESTIONS.some((q) => q.key === "equipment_condition"));
}

group("123. ac-replacement: FURNACE_AND_AC/AIR_HANDLER_ONLY only, two-slot access, lineset all-continue, no equipment-match question, successful REMOTE_QUOTE terminal");
{
  const resolved = resolveAcReplacement(AC_REPLACEMENT_BASE);
  ok("a fully established scope resolves RESOLVED/REMOTE_QUOTE", resolved.status === "RESOLVED" && resolved.routeAction === "REMOTE_QUOTE");

  const airHandlerOnly = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, systemType: "AIR_HANDLER_ONLY" });
  ok("AIR_HANDLER_ONLY system also resolves", airHandlerOnly.status === "RESOLVED");
  for (const excluded of ["HEAT_PUMP_SPLIT", "DUAL_FUEL", "PACKAGE_UNIT", "MINI_SPLIT_DUCTLESS", "BOILER_HYDRONIC"] as const) {
    const r = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, systemType: excluded });
    ok(`system type ${excluded} -> REFUSED/REMOTE_QUOTE — explicitly excluded`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE");
  }
  const unknownSystem = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN system -> PHOTO_REVIEW", unknownSystem.status === "REFUSED" && unknownSystem.routeAction === "PHOTO_REVIEW");

  for (const tons of [1.5, 2, 2.5, 3, 3.5, 4, 5]) {
    const r = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, coolingTons: tons });
    ok(`cooling capacity ${tons} tons continues`, r.status === "RESOLVED");
  }
  const offListTons = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, coolingTons: 2.75 });
  ok("an off-list cooling capacity -> REFUSED/REMOTE_QUOTE", offListTons.status === "REFUSED" && offListTons.routeAction === "REMOTE_QUOTE");
  const nullTons = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, coolingTons: null });
  ok("null cooling capacity -> PHOTO_REVIEW", nullTons.status === "REFUSED" && nullTons.routeAction === "PHOTO_REVIEW");

  const finishedIndoor = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, indoorAccessClass: "FINISHED" });
  ok("indoor access FINISHED still continues (ordinary accessGate behavior, not mini-split-head-cleaning's own override)", finishedIndoor.status === "RESOLVED");
  const unknownIndoor = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, indoorAccessClass: "UNKNOWN" });
  ok("indoor access UNKNOWN -> PHOTO_REVIEW", unknownIndoor.status === "REFUSED" && unknownIndoor.routeAction === "PHOTO_REVIEW");
  for (const loc of ["GROUND_LEVEL_ADJACENT", "GROUND_LEVEL_REMOTE", "ROOF", "WALL_OR_BALCONY_MOUNT"] as const) {
    const r = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, outdoorLocation: loc });
    ok(`outdoor location ${loc} continues — no pre-G1 roof/wall refusal restored`, r.status === "RESOLVED");
  }
  const noOutdoor = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, outdoorLocation: "NONE" });
  ok("outdoor location NONE -> PHOTO_REVIEW, a contradiction for a service that requires an outdoor unit", noOutdoor.status === "REFUSED" && noOutdoor.routeAction === "PHOTO_REVIEW");
  const unknownOutdoorLoc = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, outdoorLocation: "UNKNOWN" });
  ok("outdoor location UNKNOWN -> PHOTO_REVIEW", unknownOutdoorLoc.status === "REFUSED" && unknownOutdoorLoc.routeAction === "PHOTO_REVIEW");

  for (const lineset of ["PRESENT_VISIBLE", "PRESENT_CONCEALED", "NONE"] as const) {
    const r = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, linesetStatus: lineset });
    ok(`lineset_status ${lineset} continues — reusability is never asked`, r.status === "RESOLVED");
  }
  const unknownLineset = resolveAcReplacement({ ...AC_REPLACEMENT_BASE, linesetStatus: "UNKNOWN" });
  ok("lineset_status UNKNOWN -> PHOTO_REVIEW", unknownLineset.status === "REFUSED" && unknownLineset.routeAction === "PHOTO_REVIEW");

  ok("AC_REPLACEMENT_QUESTIONS has exactly 6 questions", AC_REPLACEMENT_QUESTIONS.length === 6);
  ok("no coil/air-handler identity or equipment-match question exists", !AC_REPLACEMENT_QUESTIONS.some((q) => /match|compat/i.test(q.prompt)));
}

group("124. heat-pump-replacement: HEAT_PUMP_SPLIT/DUAL_FUEL only, no existing_control, no controlGate, no supply_arrangement, successful REMOTE_QUOTE terminal");
{
  const resolved = resolveHeatPumpReplacement(HEAT_PUMP_REPLACEMENT_BASE);
  ok("a fully established scope resolves RESOLVED/REMOTE_QUOTE", resolved.status === "RESOLVED" && resolved.routeAction === "REMOTE_QUOTE");

  const dualFuel = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, systemType: "DUAL_FUEL" });
  ok("DUAL_FUEL system also resolves — replacing the outdoor heat-pump half while the furnace stays", dualFuel.status === "RESOLVED");
  const furnaceAndAc = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, systemType: "FURNACE_AND_AC" });
  ok("FURNACE_AND_AC system -> REFUSED/REMOTE_QUOTE — that is ac-replacement's own territory", furnaceAndAc.status === "REFUSED" && furnaceAndAc.routeAction === "REMOTE_QUOTE");
  const unknownSystem = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN system -> PHOTO_REVIEW", unknownSystem.status === "REFUSED" && unknownSystem.routeAction === "PHOTO_REVIEW");

  for (const tons of [1.5, 2, 2.5, 3, 3.5, 4, 5]) {
    const r = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, coolingTons: tons });
    ok(`cooling capacity ${tons} tons continues`, r.status === "RESOLVED");
  }
  const offListTons = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, coolingTons: 6 });
  ok("an off-list cooling capacity -> REFUSED/REMOTE_QUOTE", offListTons.status === "REFUSED" && offListTons.routeAction === "REMOTE_QUOTE");

  const unknownIndoor = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, indoorAccessClass: "UNKNOWN" });
  ok("indoor access UNKNOWN -> PHOTO_REVIEW", unknownIndoor.status === "REFUSED" && unknownIndoor.routeAction === "PHOTO_REVIEW");
  const noOutdoor = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, outdoorLocation: "NONE" });
  ok("outdoor location NONE -> PHOTO_REVIEW, a contradiction", noOutdoor.status === "REFUSED" && noOutdoor.routeAction === "PHOTO_REVIEW");

  for (const lineset of ["PRESENT_VISIBLE", "PRESENT_CONCEALED", "NONE"] as const) {
    const r = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, linesetStatus: lineset });
    ok(`lineset_status ${lineset} continues`, r.status === "RESOLVED");
  }
  const unknownLineset = resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, linesetStatus: "UNKNOWN" });
  ok("lineset_status UNKNOWN -> PHOTO_REVIEW", unknownLineset.status === "REFUSED" && unknownLineset.routeAction === "PHOTO_REVIEW");

  ok("HEAT_PUMP_REPLACEMENT_QUESTIONS has exactly 5 questions", HEAT_PUMP_REPLACEMENT_QUESTIONS.length === 5);
  ok("no supply_arrangement question exists for heat-pump-replacement", !HEAT_PUMP_REPLACEMENT_QUESTIONS.some((q) => (q as { establishes: string }).establishes === "supply_arrangement"));
  ok(
    "heat-pump-replacement no longer declares existing_control",
    !HVAC_SERVICE_FAMILIES["heat-pump-replacement"].some((u) => u.family === "existing_control")
  );
  const scopeSrc = strip("lib/hvac/scope.ts");
  const heatPumpSection = section(scopeSrc, "export function resolveHeatPumpReplacement", "export type HeatPumpReplacementQuestionKey");
  ok("resolveHeatPumpReplacement never calls controlGate", !heatPumpSection.includes("controlGate"));
  ok("resolveHeatPumpReplacement never reads a supplyArrangement fact", !heatPumpSection.includes("supplyArrangement") && !heatPumpSection.includes("supply_arrangement"));
  const existingControlFamily = HVAC_FAMILIES.find((f) => f.key === "existing_control")!;
  ok(
    "the existing_control family itself is untouched — same four gated facts, same control_gate binding",
    JSON.stringify(existingControlFamily.establishes) === JSON.stringify(["control_present", "terminal_scheme", "conductor_count", "common_wire", "thermostat_count"]) &&
      JSON.stringify(existingControlFamily.gates) === JSON.stringify(["control_gate"])
  );
}

group("125. whole-system-replacement: three system types, heating_equipment branch-only for FURNACE_AND_AC/DUAL_FUEL, HEAT_PUMP_SPLIT never reads fuel/venting/heating-BTU, every branch resolves REMOTE_QUOTE");
{
  const furnaceAndAc = resolveWholeSystemReplacement(WHOLE_SYSTEM_FURNACE_AND_AC_BASE);
  ok("FURNACE_AND_AC branch, fully established, resolves RESOLVED/REMOTE_QUOTE", furnaceAndAc.status === "RESOLVED" && furnaceAndAc.routeAction === "REMOTE_QUOTE");
  const heatPumpSplit = resolveWholeSystemReplacement(WHOLE_SYSTEM_HEAT_PUMP_SPLIT_BASE);
  ok(
    "HEAT_PUMP_SPLIT branch resolves RESOLVED/REMOTE_QUOTE even with fuelType/ventingClass UNKNOWN and heatingInputBtu null — those facts are never read on this branch",
    heatPumpSplit.status === "RESOLVED" && heatPumpSplit.routeAction === "REMOTE_QUOTE"
  );
  const dualFuel = resolveWholeSystemReplacement(WHOLE_SYSTEM_DUAL_FUEL_BASE);
  ok("DUAL_FUEL branch, fully established, resolves RESOLVED/REMOTE_QUOTE", dualFuel.status === "RESOLVED" && dualFuel.routeAction === "REMOTE_QUOTE");

  for (const excluded of ["PACKAGE_UNIT", "AIR_HANDLER_ONLY", "MINI_SPLIT_DUCTLESS", "BOILER_HYDRONIC"] as const) {
    const r = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, systemType: excluded });
    ok(`system type ${excluded} -> REFUSED/REMOTE_QUOTE — outside the three supported types`, r.status === "REFUSED" && r.routeAction === "REMOTE_QUOTE");
  }
  const unknownSystem = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, systemType: "UNKNOWN" });
  ok("UNKNOWN system -> PHOTO_REVIEW", unknownSystem.status === "REFUSED" && unknownSystem.routeAction === "PHOTO_REVIEW");

  // FURNACE_AND_AC branch's own fuel/venting/capacity gating.
  const furnaceUnknownFuel = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, fuelType: "UNKNOWN" });
  ok("FURNACE_AND_AC branch: UNKNOWN fuel -> PHOTO_REVIEW (fuel IS read on this branch)", furnaceUnknownFuel.status === "REFUSED" && furnaceUnknownFuel.routeAction === "PHOTO_REVIEW");
  const furnaceDualFuelObserved = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, fuelType: "DUAL_FUEL" });
  ok(
    "FURNACE_AND_AC branch: an observed DUAL_FUEL fuel -> REFUSED/REMOTE_QUOTE — contradicts the FURNACE_AND_AC identity already selected",
    furnaceDualFuelObserved.status === "REFUSED" && furnaceDualFuelObserved.routeAction === "REMOTE_QUOTE"
  );
  const furnaceNonCombustion = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, ventingClass: "NON_COMBUSTION" });
  ok("FURNACE_AND_AC branch: NON_COMBUSTION venting -> REFUSED/REMOTE_QUOTE", furnaceNonCombustion.status === "REFUSED" && furnaceNonCombustion.routeAction === "REMOTE_QUOTE");
  const furnaceOffListBtu = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, heatingInputBtu: 75000 });
  ok("FURNACE_AND_AC branch: an off-list heating input -> REFUSED/REMOTE_QUOTE", furnaceOffListBtu.status === "REFUSED" && furnaceOffListBtu.routeAction === "REMOTE_QUOTE");

  // DUAL_FUEL branch accepts DUAL_FUEL as an observed fuel value, where FURNACE_AND_AC does not.
  const dualFuelFuelObserved = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_DUAL_FUEL_BASE, fuelType: "DUAL_FUEL" });
  ok("DUAL_FUEL branch: an observed DUAL_FUEL fuel continues", dualFuelFuelObserved.status === "RESOLVED");
  const dualFuelGasObserved = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_DUAL_FUEL_BASE, fuelType: "NATURAL_GAS" });
  ok("DUAL_FUEL branch: an observed NATURAL_GAS fuel also continues", dualFuelGasObserved.status === "RESOLVED");
  const dualFuelOil = resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_DUAL_FUEL_BASE, fuelType: "OIL" });
  ok("DUAL_FUEL branch: OIL fuel -> REFUSED/REMOTE_QUOTE", dualFuelOil.status === "REFUSED" && dualFuelOil.routeAction === "REMOTE_QUOTE");

  // Shared facts, every branch.
  for (const base of [WHOLE_SYSTEM_FURNACE_AND_AC_BASE, WHOLE_SYSTEM_HEAT_PUMP_SPLIT_BASE, WHOLE_SYSTEM_DUAL_FUEL_BASE]) {
    const nullCooling = resolveWholeSystemReplacement({ ...base, coolingTons: null });
    ok(`${base.systemType} branch: null cooling capacity -> PHOTO_REVIEW — cooling_equipment is unconditional on every branch`, nullCooling.status === "REFUSED" && nullCooling.routeAction === "PHOTO_REVIEW");
    const noOutdoor = resolveWholeSystemReplacement({ ...base, outdoorLocation: "NONE" });
    ok(`${base.systemType} branch: outdoor location NONE -> PHOTO_REVIEW`, noOutdoor.status === "REFUSED" && noOutdoor.routeAction === "PHOTO_REVIEW");
    const unknownLineset = resolveWholeSystemReplacement({ ...base, linesetStatus: "UNKNOWN" });
    ok(`${base.systemType} branch: lineset_status UNKNOWN -> PHOTO_REVIEW`, unknownLineset.status === "REFUSED" && unknownLineset.routeAction === "PHOTO_REVIEW");
    const unknownCondensate = resolveWholeSystemReplacement({ ...base, condensateRoute: "UNKNOWN" });
    ok(`${base.systemType} branch: condensate_route UNKNOWN -> PHOTO_REVIEW`, unknownCondensate.status === "REFUSED" && unknownCondensate.routeAction === "PHOTO_REVIEW");
  }

  const familyUsage = HVAC_SERVICE_FAMILIES["whole-system-replacement"];
  ok(
    "heating_equipment is declared branch-only, exactly twice — FURNACE_AND_AC and DUAL_FUEL",
    familyUsage.filter((u) => u.family === "heating_equipment").length === 2 &&
      familyUsage.some((u) => u.family === "heating_equipment" && u.branch === "system_type=FURNACE_AND_AC") &&
      familyUsage.some((u) => u.family === "heating_equipment" && u.branch === "system_type=DUAL_FUEL")
  );
  ok(
    "cooling_equipment, both access families, refrigerant_lineset, condensate_route and supply_arrangement all stay unconditional",
    ["cooling_equipment", "indoor_equipment_access", "outdoor_equipment_access", "refrigerant_lineset", "condensate_route", "supply_arrangement"].every(
      (key) => familyUsage.some((u) => u.family === key && u.branch === undefined)
    )
  );

  ok("WHOLE_SYSTEM_REPLACEMENT_QUESTIONS has exactly 13 questions", WHOLE_SYSTEM_REPLACEMENT_QUESTIONS.length === 13);
  ok(
    "HEAT_PUMP_SPLIT is never named as a branch value on any fuel/venting/heating-input question",
    !WHOLE_SYSTEM_REPLACEMENT_QUESTIONS.some((q) => ["fuel_type_furnace_and_ac", "fuel_type_dual_fuel", "venting_class_furnace_and_ac", "venting_class_dual_fuel", "heating_input_btu_furnace_and_ac", "heating_input_btu_dual_fuel"].includes(q.key) && (q as { branch: string }).branch === "HEAT_PUMP_SPLIT")
  );
}

group("126. mini-split-installation: replacement_vs_new first live consumer, access is REPLACEMENT-only, no system_identity question, zone_count not rendered, run band informational, successful REMOTE_QUOTE terminal");
{
  // NEW_INSTALLATION, with deliberately unusable access values — proves
  // those three facts are genuinely UNREAD on this branch, not merely
  // happening to pass. This is the H11 patch-review correction's own core
  // proof.
  const newInstall = resolveMiniSplitInstallation(MINI_SPLIT_INSTALLATION_BASE);
  ok(
    "NEW_INSTALLATION resolves RESOLVED/REMOTE_QUOTE even with indoorAccessClass=UNKNOWN, outdoorLocation=NONE, outdoorAccessClass=UNKNOWN — those facts are not read on this branch",
    newInstall.status === "RESOLVED" && newInstall.routeAction === "REMOTE_QUOTE"
  );

  // REPLACEMENT, with real access — the branch where access genuinely gates.
  const replacement = resolveMiniSplitInstallation(MINI_SPLIT_REPLACEMENT_BASE);
  ok("REPLACEMENT with valid access resolves RESOLVED/REMOTE_QUOTE", replacement.status === "RESOLVED" && replacement.routeAction === "REMOTE_QUOTE");
  const unknownReplacement = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, replacementVsNew: "UNKNOWN" });
  ok("UNKNOWN replacement_vs_new -> PHOTO_REVIEW", unknownReplacement.status === "REFUSED" && unknownReplacement.routeAction === "PHOTO_REVIEW");

  const replacementUnknownIndoor = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, indoorAccessClass: "UNKNOWN" });
  ok(
    "REPLACEMENT branch: indoor access UNKNOWN -> PHOTO_REVIEW — access genuinely gates on this branch",
    replacementUnknownIndoor.status === "REFUSED" && replacementUnknownIndoor.routeAction === "PHOTO_REVIEW"
  );
  const replacementNoOutdoor = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, outdoorLocation: "NONE" });
  ok("REPLACEMENT branch: outdoor location NONE -> PHOTO_REVIEW", replacementNoOutdoor.status === "REFUSED" && replacementNoOutdoor.routeAction === "PHOTO_REVIEW");
  const replacementUnknownOutdoorLoc = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, outdoorLocation: "UNKNOWN" });
  ok("REPLACEMENT branch: outdoor location UNKNOWN -> PHOTO_REVIEW", replacementUnknownOutdoorLoc.status === "REFUSED" && replacementUnknownOutdoorLoc.routeAction === "PHOTO_REVIEW");
  const replacementUnknownOutdoorAccess = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, outdoorAccessClass: "UNKNOWN" });
  ok(
    "REPLACEMENT branch: outdoor access UNKNOWN -> PHOTO_REVIEW",
    replacementUnknownOutdoorAccess.status === "REFUSED" && replacementUnknownOutdoorAccess.routeAction === "PHOTO_REVIEW"
  );
  const replacementFinishedIndoor = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, indoorAccessClass: "FINISHED" });
  ok("REPLACEMENT branch: indoor access FINISHED still continues", replacementFinishedIndoor.status === "RESOLVED");
  const replacementFinishedOutdoor = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, outdoorAccessClass: "FINISHED" });
  ok("REPLACEMENT branch: outdoor access FINISHED still continues", replacementFinishedOutdoor.status === "RESOLVED");
  for (const loc of ["GROUND_LEVEL_ADJACENT", "GROUND_LEVEL_REMOTE", "ROOF", "WALL_OR_BALCONY_MOUNT"] as const) {
    const r = resolveMiniSplitInstallation({ ...MINI_SPLIT_REPLACEMENT_BASE, outdoorLocation: loc });
    ok(`REPLACEMENT branch: outdoor location ${loc} continues`, r.status === "RESOLVED");
  }

  const zeroHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: 0 });
  ok("head_count 0 -> PHOTO_REVIEW", zeroHeads.status === "REFUSED" && zeroHeads.routeAction === "PHOTO_REVIEW");
  const negativeHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: -1 });
  ok("negative head_count -> PHOTO_REVIEW", negativeHeads.status === "REFUSED" && negativeHeads.routeAction === "PHOTO_REVIEW");
  const fractionalHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: 1.5 });
  ok("fractional head_count -> PHOTO_REVIEW, never rounded or floored", fractionalHeads.status === "REFUSED" && fractionalHeads.routeAction === "PHOTO_REVIEW");
  const nanHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: NaN });
  ok("NaN head_count -> PHOTO_REVIEW", nanHeads.status === "REFUSED" && nanHeads.routeAction === "PHOTO_REVIEW");
  const infiniteHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: Infinity });
  ok("Infinity head_count -> PHOTO_REVIEW", infiniteHeads.status === "REFUSED" && infiniteHeads.routeAction === "PHOTO_REVIEW");
  const validHeads = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, headCount: 5 });
  ok("a valid positive integer head_count still resolves", validHeads.status === "RESOLVED");

  for (const band of ["STANDARD", "EXTENDED", "OVER_BAND"] as const) {
    const r = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, runBand: band });
    ok(`run_band ${band} continues — informational for this REMOTE_QUOTE service, never a refusal`, r.status === "RESOLVED");
  }
  const unknownBand = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, runBand: "UNKNOWN" });
  ok("run_band UNKNOWN -> PHOTO_REVIEW", unknownBand.status === "REFUSED" && unknownBand.routeAction === "PHOTO_REVIEW");

  for (const lineset of ["PRESENT_VISIBLE", "PRESENT_CONCEALED", "NONE"] as const) {
    const r = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, linesetStatus: lineset });
    ok(`lineset_status ${lineset} continues`, r.status === "RESOLVED");
  }
  for (const route of ["PUMP_PRESENT", "GRAVITY_DRAIN_PRESENT", "NONE_VISIBLE"] as const) {
    const r = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, condensateRoute: route });
    ok(`condensate_route ${route} continues`, r.status === "RESOLVED");
  }

  ok("no system_identity question exists for mini-split-installation", !MINI_SPLIT_INSTALLATION_QUESTIONS.some((q) => (q as { establishes: string }).establishes === "system_type"));
  ok("no zone_count question exists for mini-split-installation", !MINI_SPLIT_INSTALLATION_QUESTIONS.some((q) => (q as { establishes: string }).establishes === "zone_count"));
  ok("head_count is asked directly, no options list", MINI_SPLIT_INSTALLATION_QUESTIONS.find((q) => q.key === "head_count")!.options.length === 0);
  ok("MINI_SPLIT_INSTALLATION_QUESTIONS has exactly 7 questions", MINI_SPLIT_INSTALLATION_QUESTIONS.length === 7);
  ok("no electrical-source, disconnect, or mounting-method question exists", !MINI_SPLIT_INSTALLATION_QUESTIONS.some((q) => /electrical|disconnect|mounting/i.test(q.prompt)));
  ok(
    "no proposed-position wording appears anywhere in mini-split-installation's own questions",
    !MINI_SPLIT_INSTALLATION_QUESTIONS.some((q) => /proposed|which wall or ceiling would/i.test(q.prompt))
  );

  const indoorAccessQuestion = MINI_SPLIT_INSTALLATION_QUESTIONS.find((q) => q.key === "indoor_access")!;
  const outdoorAccessQuestion = MINI_SPLIT_INSTALLATION_QUESTIONS.find((q) => q.key === "outdoor_access")!;
  ok("the indoor_access question is REPLACEMENT-only", indoorAccessQuestion.branch === "REPLACEMENT");
  ok("the outdoor_access question is REPLACEMENT-only", outdoorAccessQuestion.branch === "REPLACEMENT");
  ok(
    "no NEW_INSTALLATION-branch question establishes indoor_location or outdoor_location",
    !MINI_SPLIT_INSTALLATION_QUESTIONS.some((q) => q.branch === "NEW_INSTALLATION" && (q.establishes === "indoor_location" || q.establishes === "outdoor_location"))
  );
  ok(
    "replacement_vs_new, head_count, run_band, lineset_status and condensate_route are all SHARED",
    ["replacement_vs_new", "head_count", "run_band", "lineset_status", "condensate_route"].every(
      (key) => MINI_SPLIT_INSTALLATION_QUESTIONS.find((q) => q.key === key)!.branch === "SHARED"
    )
  );

  ok(
    "mini-split-installation declares equipment_installation_context, not accessory_and_media",
    HVAC_SERVICE_FAMILIES["mini-split-installation"].some((u) => u.family === "equipment_installation_context") &&
      !HVAC_SERVICE_FAMILIES["mini-split-installation"].some((u) => u.family === "accessory_and_media")
  );
  const familyUsage = HVAC_SERVICE_FAMILIES["mini-split-installation"];
  ok(
    "indoor_equipment_access and outdoor_equipment_access are both branch-qualified to replacement_vs_new=REPLACEMENT",
    familyUsage.some((u) => u.family === "indoor_equipment_access" && u.branch === "replacement_vs_new=REPLACEMENT") &&
      familyUsage.some((u) => u.family === "outdoor_equipment_access" && u.branch === "replacement_vs_new=REPLACEMENT")
  );
  ok(
    "equipment_installation_context, distribution_and_zoning, run_distance, refrigerant_lineset and condensate_route stay unconditional",
    ["equipment_installation_context", "distribution_and_zoning", "run_distance", "refrigerant_lineset", "condensate_route"].every((key) =>
      familyUsage.some((u) => u.family === key && u.branch === undefined)
    )
  );
  ok(
    "HVAC_SERVICE_ACCESS_SLOTS still declares both slots for mini-split-installation — genuinely owned, just branch-conditionally read",
    JSON.stringify(HVAC_SERVICE_ACCESS_SLOTS["mini-split-installation"]) === JSON.stringify(["INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"])
  );

  // run_band's own presentation — the {b1}/{b2} contractor-boundary
  // placeholder shape, not a subjective "typical/usual" judgment the
  // homeowner would have to supply themselves.
  const runBandQuestion = MINI_SPLIT_INSTALLATION_QUESTIONS.find((q) => q.key === "run_band")!;
  const runBandLabels = Object.fromEntries(runBandQuestion.options.map((o) => [o.value, o.label]));
  ok('STANDARD label is exactly "{b1} feet or less"', runBandLabels.STANDARD === "{b1} feet or less");
  ok('EXTENDED label is exactly "{b1} to {b2} feet"', runBandLabels.EXTENDED === "{b1} to {b2} feet");
  ok('OVER_BAND label is exactly "More than {b2} feet"', runBandLabels.OVER_BAND === "More than {b2} feet");
  ok('UNKNOWN label is exactly "Not sure"', runBandLabels.UNKNOWN === "Not sure");
  const subjectiveLanguage = /typical distance|farther than usual|much farther than usual|standard installation|normal distance|\beasy\b/i;
  ok(
    "no run_band option label or prompt contains subjective classification",
    !subjectiveLanguage.test(runBandQuestion.prompt) && runBandQuestion.options.every((o) => !subjectiveLanguage.test(o.label))
  );
  ok('run_band prompt stays observational: "Roughly how far apart would the indoor and outdoor units be?"', runBandQuestion.prompt === "Roughly how far apart would the indoor and outdoor units be?");

  const standardBand = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, runBand: "STANDARD" });
  ok("run_band STANDARD still continues to the successful terminal", standardBand.status === "RESOLVED" && standardBand.routeAction === "REMOTE_QUOTE");
  const extendedBand = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, runBand: "EXTENDED" });
  ok("run_band EXTENDED still continues to the successful terminal", extendedBand.status === "RESOLVED" && extendedBand.routeAction === "REMOTE_QUOTE");
  const overBandStillContinues = resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, runBand: "OVER_BAND" });
  ok("run_band OVER_BAND still continues to the successful terminal — presentation changed, routing semantics did not", overBandStillContinues.status === "RESOLVED" && overBandStillContinues.routeAction === "REMOTE_QUOTE");
}

group("127. every REMOTE_QUOTE terminal is RESOLVED, never REFUSED — and every interrupted path is REFUSED, never the successful shape");
{
  const resolvedCases: Array<{ label: string; result: { status: string } }> = [
    { label: "furnace-replacement", result: resolveFurnaceReplacement(FURNACE_REPLACEMENT_BASE) },
    { label: "ac-replacement", result: resolveAcReplacement(AC_REPLACEMENT_BASE) },
    { label: "heat-pump-replacement", result: resolveHeatPumpReplacement(HEAT_PUMP_REPLACEMENT_BASE) },
    { label: "whole-system-replacement", result: resolveWholeSystemReplacement(WHOLE_SYSTEM_FURNACE_AND_AC_BASE) },
    { label: "mini-split-installation", result: resolveMiniSplitInstallation(MINI_SPLIT_INSTALLATION_BASE) },
  ];
  for (const { label, result } of resolvedCases) {
    ok(`${label}'s fully-established scope is status "RESOLVED"`, result.status === "RESOLVED");
    ok(`${label}'s successful result is never status "REFUSED"`, (result as { status: string }).status !== "REFUSED");
  }

  const refusedCases: Array<{ label: string; result: { status: string } }> = [
    { label: "furnace-replacement UNKNOWN system", result: resolveFurnaceReplacement({ ...FURNACE_REPLACEMENT_BASE, systemType: "UNKNOWN" }) },
    { label: "ac-replacement UNKNOWN system", result: resolveAcReplacement({ ...AC_REPLACEMENT_BASE, systemType: "UNKNOWN" }) },
    { label: "heat-pump-replacement UNKNOWN system", result: resolveHeatPumpReplacement({ ...HEAT_PUMP_REPLACEMENT_BASE, systemType: "UNKNOWN" }) },
    { label: "whole-system-replacement UNKNOWN system", result: resolveWholeSystemReplacement({ ...WHOLE_SYSTEM_FURNACE_AND_AC_BASE, systemType: "UNKNOWN" }) },
    { label: "mini-split-installation UNKNOWN replacement_vs_new", result: resolveMiniSplitInstallation({ ...MINI_SPLIT_INSTALLATION_BASE, replacementVsNew: "UNKNOWN" }) },
  ];
  for (const { label, result } of refusedCases) {
    ok(`${label} is status "REFUSED"`, result.status === "REFUSED");
    ok(`${label} is never status "RESOLVED"`, (result as { status: string }).status !== "RESOLVED");
  }

  const scopeSrc = strip("lib/hvac/scope.ts");
  const h11Section = section(scopeSrc, "type HvacRemoteQuoteResolved");
  ok("HvacRemoteQuoteResolved's own status literal is RESOLVED, never REFUSED", /status: "RESOLVED"/.test(h11Section) && !/HvacRemoteQuoteResolved[\s\S]{0,80}status: "REFUSED"/.test(h11Section));
  ok("REMOTE_QUOTE_RESOLVED is declared exactly once, as a single shared constant", (h11Section.match(/const REMOTE_QUOTE_RESOLVED/g) ?? []).length === 1);
}

group("128. no symptom vocabulary, no diagnosis, no equipment-match inference, no lineset-suitability inference, no duct sizing, no age-based replacement, no manufacturer/model lookup, no component-repair selection in any H11 tree");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  const h11Section = section(scopeSrc, "type HvacRemoteQuoteResolved");

  for (const symptom of REPORTED_SYMPTOMS) {
    ok(`scope.ts never references the symptom "${symptom}" in the H11 section`, !h11Section.includes(symptom));
  }
  const allQuestions = [
    ...FURNACE_REPLACEMENT_QUESTIONS,
    ...AC_REPLACEMENT_QUESTIONS,
    ...HEAT_PUMP_REPLACEMENT_QUESTIONS,
    ...WHOLE_SYSTEM_REPLACEMENT_QUESTIONS,
    ...MINI_SPLIT_INSTALLATION_QUESTIONS,
  ];
  const optionValues = allQuestions.flatMap((q) => q.options.map((o) => o.value));
  ok("no H11 answer option value is any of the closed reported_symptom vocabulary", optionValues.every((v) => !(REPORTED_SYMPTOMS as readonly string[]).includes(v)));
  const symptomPhrases = ["mold smell", "odor", "not cooling", "no heat", "won't turn on", "leaking water", "rattling", "whistling"];
  const allWording = allQuestions.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]).join(" ").toLowerCase();
  ok("no H11 question prompt or answer label contains symptom phrasing", symptomPhrases.every((p) => !allWording.includes(p)));

  const diagnosticLanguage =
    /\b(blocked|clogged|failed|failing|broken|defective|leaking from|leak in|worn|corroded internally|burnt out|malfunction|cracked|unsafe)\b/i;
  for (const q of allQuestions) {
    ok(`"${q.key}"'s prompt names no cause`, !diagnosticLanguage.test(q.prompt), q.prompt);
    for (const o of q.options) {
      ok(`"${q.key}" option "${o.value}" names no cause`, !diagnosticLanguage.test(o.label), o.label);
    }
  }

  ok("no equipment-match/compatibility inference language anywhere in the H11 section", !/equipment.?match|matches the (proposed|new)|compatib/i.test(h11Section));
  ok("no lineset suitability/reusability/correct-sizing language anywhere in the H11 section", !/reusab|suitab.{0,20}line|correctly sized|should be replaced/i.test(h11Section));
  ok("no duct sizing or adequacy language anywhere in the H11 section", !/duct siz|duct adequa|duct condition/i.test(h11Section));
  ok("no age-based or manufacture-date replacement inference anywhere in the H11 section", !/manufacture_date|manufactureDate|too old|age.?based/i.test(h11Section));
  ok("no manufacturer or model lookup anywhere in the H11 section", !/\bmanufacturer\b|\bmodel\b/i.test(h11Section));
  ok("no component, material role, or repair selection anywhere in the H11 section", !/materialRoles|components:|ScopeConsequence|selectRepair/i.test(h11Section));
  ok("no H11 resolver imports anything from lib/hvac/mappings.ts", !/from ["'`]\.\/mappings["'`]/.test(scopeSrc));
  ok("no H11 resolver ever produces REROUTE_SERVICE", !/REROUTE_SERVICE/.test(h11Section));
  ok("no H11 resolver ever produces REROUTE_TROUBLESHOOTING directly (conditionGate's own ON_SITE_SERVICE translation is the only path there, and only for furnace-replacement's non-opted-in callers, which do not exist)", !/REROUTE_TROUBLESHOOTING/.test(h11Section));
}

group("129. H3-H10 runtime behavior is unchanged by H11, appointment-only services and condenser-pad-replacement remain resolver-free");
{
  const ventCover = resolveVentCoverReplacement({ count: 1, openingSizePattern: "UNIFORM", openingDimensions: "10x6", mountSurface: "WALL" });
  ok("vent-cover-replacement still resolves RESOLVE_INSTANT, unaffected by H11", ventCover.status === "RESOLVED" && ventCover.routeAction === "RESOLVE_INSTANT");
  const acTuneUp = resolveAcTuneUp({
    systemType: "FURNACE_AND_AC",
    indoorAccessClass: "ACCESSIBLE",
    outdoorLocation: "GROUND_LEVEL_ADJACENT",
    outdoorAccessClass: "ACCESSIBLE",
    systemCount: 1,
  });
  ok("ac-tune-up still resolves RESOLVE_INSTANT, unaffected by H11", acTuneUp.status === "RESOLVED" && acTuneUp.routeAction === "RESOLVE_INSTANT");
  const filter = resolveAirFilterReplacement({ filterSlotSize: "16x25x1", quantity: 1 });
  ok("air-filter-replacement still resolves RESOLVE_INSTANT, unaffected by H11", filter.status === "RESOLVED" && filter.routeAction === "RESOLVE_INSTANT");
  const humidifier = resolveWholeHouseHumidifier(HUMIDIFIER_REPLACEMENT_BASE);
  ok("whole-house-humidifier still resolves RESOLVE_ADJUSTED, unaffected by H11", humidifier.status === "RESOLVED" && humidifier.routeAction === "RESOLVE_ADJUSTED");

  const scopeSrc = strip("lib/hvac/scope.ts");
  ok("no resolveDuctAssessment function exists anywhere in scope.ts", !/export function resolveDuctAssessment\(/.test(scopeSrc));
  ok("no resolveHvacServiceCall function exists anywhere in scope.ts", !/export function resolveHvacServiceCall\(/.test(scopeSrc));
  ok("no resolveCondenserPadReplacement function exists anywhere in scope.ts", !/export function resolveCondenserPadReplacement\(/.test(scopeSrc));

  const ductAssessment = HVAC_SERVICES.find((s) => s.key === "duct-assessment")!;
  ok("duct-assessment is still disposition APPOINTMENT_ONLY", ductAssessment.disposition === "APPOINTMENT_ONLY");
  const hvacServiceCallSvc = HVAC_SERVICES.find((s) => s.key === "hvac-service-call")!;
  ok("hvac-service-call is still disposition APPOINTMENT_ONLY", hvacServiceCallSvc.disposition === "APPOINTMENT_ONLY");
  ok("HVAC_SERVICE_CALL_SHELL is still schedulable through the existing G2/G3 mechanism, unchanged by H11", hvacServiceCallIsSchedulable());

  const condenserPad = HVAC_SERVICES.find((s) => s.key === "condenser-pad-replacement")!;
  ok("condenser-pad-replacement is still disposition CONDITIONAL_FIXED, untouched by H11", condenserPad.disposition === "CONDITIONAL_FIXED");
  ok(
    "condenser-pad-replacement's own family declaration is untouched",
    JSON.stringify(HVAC_SERVICE_FAMILIES["condenser-pad-replacement"]) === JSON.stringify([{ family: "outdoor_equipment_access" }, { family: "existing_condition" }])
  );

  for (const key of ["furnace-replacement", "ac-replacement", "heat-pump-replacement", "whole-system-replacement", "mini-split-installation"] as const) {
    const svc = HVAC_SERVICES.find((s) => s.key === key)!;
    ok(`${key}'s own catalog disposition is still REMOTE_QUOTE`, svc.disposition === "REMOTE_QUOTE");
  }

  ok("HVAC_GATE_KEYS is still exactly 7 entries after H11", HVAC_GATE_KEYS.length === 7);
  ok("HVAC_PRIMITIVE_KEYS is still exactly 7 entries after H11", HVAC_PRIMITIVE_KEYS.length === 7);
}

group("130. LinesetStatus vocabulary, canonical capacity arrays, and equipment_installation_context's exact shape");
{
  const linesetValues: readonly LinesetStatus[] = ["PRESENT_VISIBLE", "PRESENT_CONCEALED", "NONE", "UNKNOWN"];
  ok("LinesetStatus has exactly the four canonical values", linesetValues.length === 4);

  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "COOLING_TONS_COVERED is exactly [1.5, 2, 2.5, 3, 3.5, 4, 5]",
    /const COOLING_TONS_COVERED: readonly number\[\] = \[1\.5, 2, 2\.5, 3, 3\.5, 4, 5\];/.test(scopeSrc)
  );
  ok(
    "HEATING_INPUT_BTU_COVERED is exactly [40000, 60000, 80000, 100000, 120000]",
    /const HEATING_INPUT_BTU_COVERED: readonly number\[\] = \[40000, 60000, 80000, 100000, 120000\];/.test(scopeSrc)
  );
  ok("COOLING_TONS_COVERED is declared exactly once — every resolver reuses the same array, none invents its own", (scopeSrc.match(/const COOLING_TONS_COVERED/g) ?? []).length === 1);
  ok("HEATING_INPUT_BTU_COVERED is declared exactly once", (scopeSrc.match(/const HEATING_INPUT_BTU_COVERED/g) ?? []).length === 1);

  const familyKeys = HVAC_FAMILY_KEYS as readonly string[];
  ok("equipment_installation_context exists as its own H11 family", familyKeys.includes("equipment_installation_context"));
  const family = HVAC_FAMILIES.find((f) => f.key === "equipment_installation_context")!;
  ok("equipment_installation_context establishes exactly replacement_vs_new, nothing else", JSON.stringify(family.establishes) === JSON.stringify(["replacement_vs_new"]));
  ok("equipment_installation_context binds no gate", family.gates.length === 0);
  ok("equipment_installation_context binds no shared primitive", family.primitives.length === 0);
  ok(
    "equipment_installation_context is declared for mini-split-installation only",
    Object.entries(HVAC_SERVICE_FAMILIES).filter(([, usages]) => usages.some((u) => u.family === "equipment_installation_context")).length === 1 &&
      HVAC_SERVICE_FAMILIES["mini-split-installation"].some((u) => u.family === "equipment_installation_context")
  );
  ok(
    "accessory_and_media's own replacement_vs_new is untouched — same four facts, still not equipment_installation_context",
    HVAC_FAMILIES.find((f) => f.key === "accessory_and_media")!.establishes.includes("replacement_vs_new")
  );

  const replacementVsNewValues: readonly ReplacementVsNew[] = ["REPLACEMENT", "NEW_INSTALLATION", "UNKNOWN"];
  ok("ReplacementVsNew has exactly the three canonical values", replacementVsNewValues.length === 3);
}
console.log();
console.log(failures === 0 ? `All ${checks} checks passed.\n` : `${failures}/${checks} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
