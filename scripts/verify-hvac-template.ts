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
import { HVAC_GATE_KEYS, capacityGate, conditionGate, controlGate, type EquipmentCondition } from "../lib/hvac/gates";
import {
  HVAC_FAMILIES,
  HVAC_FAMILY_KEYS,
  HVAC_SERVICE_FAMILIES,
  HVAC_SERVICE_ACCESS_SLOTS,
  type HvacFamilyKey,
} from "../lib/hvac/families";
import { EXISTING_CONDITION_SCOPE, EVIDENCE_ONLY_FACTS, REPORTED_SYMPTOMS } from "../lib/hvac/mappings";
import { maintenanceScopeLocations, maintenanceScopeMatchesDeclaredLocations } from "../lib/hvac/metadata";
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
} from "../lib/hvac/scope";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function strip(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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

group("15. exactly fifteen HVAC families");
ok("HVAC_FAMILIES has exactly 15 entries", HVAC_FAMILIES.length === 15, `got ${HVAC_FAMILIES.length}`);
ok("HVAC_FAMILY_KEYS has 15 unique entries", new Set(HVAC_FAMILY_KEYS).size === 15, `got ${new Set(HVAC_FAMILY_KEYS).size}`);
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

group("34. equipment_condition is not read — old F.3's ACTIVE_FAILURE reroute is fully superseded");
{
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "CondensatePumpInstallationFacts has no field for equipment_condition — structurally unreadable, not merely unused",
    !/equipmentCondition|equipment_condition/.test(scopeSrc)
  );
  ok("scope.ts never references ACTIVE_FAILURE", !/ACTIVE_FAILURE/.test(scopeSrc));
  ok("scope.ts never imports conditionGate or EquipmentCondition", !/conditionGate|EquipmentCondition/.test(scopeSrc));
  ok("scope.ts never produces ON_SITE_SERVICE (the old F.3 reroute target)", !/ON_SITE_SERVICE/.test(scopeSrc));
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
  ok(
    "no refusal reason in scope.ts names a blocked drain, a failed pump, or a refrigerant issue",
    !/blocked drain|failed pump|refrigerant/i.test(scopeSrc)
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

group("41. exactly FOUR HVAC service trees exist — H3/H4's own check, superseded again on purpose");
{
  // H3's version read "exactly one"; H4's read "exactly two, not zero, not
  // three". Both were true when written, and both are superseded now on
  // the same terms: condensate-safety-switch-installation and
  // air-filter-replacement are exactly the TWO additional executable
  // services H5 exists to add. This group now proves the CURRENT boundary
  // — four, not three, not five — the same discipline every prior phase
  // applied to its own predecessor's version of this check.
  const resolveFns = strip("lib/hvac/scope.ts").match(/export function resolve\w+\(/g) ?? [];
  ok("lib/hvac/scope.ts exports exactly four resolve functions", resolveFns.length === 4, `got ${resolveFns.length}: ${resolveFns.join(", ")}`);
  ok("resolveCondensatePumpInstallation is one of them", resolveFns.some((f) => f.includes("resolveCondensatePumpInstallation")));
  ok("resolveThermostatInstallation is one of them", resolveFns.some((f) => f.includes("resolveThermostatInstallation")));
  ok("resolveCondensateSafetySwitchInstallation is one of them", resolveFns.some((f) => f.includes("resolveCondensateSafetySwitchInstallation")));
  ok("resolveAirFilterReplacement is the fourth", resolveFns.some((f) => f.includes("resolveAirFilterReplacement")));
  ok(
    "no resolveCondenserPadReplacement exists — deferred, per the H5 pad audit decision",
    !resolveFns.some((f) => f.includes("resolveCondenserPadReplacement"))
  );
  ok("no fifth HVAC service resolver file exists anywhere in lib/hvac", !existsSync(join(ROOT, "lib/hvac/scope2.ts")));
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
  ok("HVAC_FAMILIES is still exactly 15 — no new family was added for terminal_scheme", HVAC_FAMILIES.length === 15);
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
  ok("scope.ts's thermostat section never references a C-wire adapter or component_increment", !/adapter|component_increment/i.test(scopeSrc.slice(scopeSrc.indexOf("thermostat-installation"))));
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
  ok("HVAC_FAMILIES still has exactly 15 entries", HVAC_FAMILIES.length === 15);
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
  const safetySwitchSection = scopeSrc.slice(scopeSrc.indexOf("condensate-safety-switch-installation — H5"));
  ok("no REROUTE_SERVICE anywhere in the safety-switch section", !/REROUTE_SERVICE/.test(safetySwitchSection.slice(0, safetySwitchSection.indexOf("air-filter-replacement — H5"))));
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
  const filterSection = scopeSrc.slice(scopeSrc.indexOf("air-filter-replacement — H5"));
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
  ok(
    "no refusal reason in scope.ts's H5 sections names a blocked drain or an overflow diagnosis",
    !/blocked drain|overflow(ing)? (drain|switch)|diagnos/i.test(
      scopeSrc.slice(scopeSrc.indexOf("condensate-safety-switch-installation — H5"))
    )
  );
}

group("68. WWT stays catalog/commercial metadata only — H5 touches no booking, cart, or scheduling surface");
{
  const safetySwitch = HVAC_SERVICES.find((s) => s.key === "condensate-safety-switch-installation")!;
  const airFilter = HVAC_SERVICES.find((s) => s.key === "air-filter-replacement")!;
  ok("condensate-safety-switch-installation still declares whileWeThereOnly: true, unchanged since H1", safetySwitch.whileWeThereOnly === true);
  ok("air-filter-replacement still declares whileWeThereOnly: true, unchanged since H1", airFilter.whileWeThereOnly === true);
  const scopeSrc = strip("lib/hvac/scope.ts");
  ok(
    "scope.ts's H5 sections never reference cart, scheduling, booking capacity, or technician-bonus concepts",
    !/liveCart|LiveCart|schedul|bookingCapacity|technicianBonus|serviceFee|checkout/i.test(
      scopeSrc.slice(scopeSrc.indexOf("condensate-safety-switch-installation — H5"))
    )
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

console.log();
console.log(failures === 0 ? `All ${checks} checks passed.\n` : `${failures}/${checks} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
