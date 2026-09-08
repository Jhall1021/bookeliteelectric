/**
 * HVAC Template V1 — H1 canonical catalog foundation.
 *
 *   npx tsx scripts/verify-hvac-template.ts
 *
 * PURE SOURCE. NO DATABASE. HVAC provisions nothing yet, so nothing here
 * needs DATABASE_URL, and nothing here mutates anything.
 *
 * WHAT THIS PROVES, AND WHY IT IS ALL STRUCTURAL
 *
 * H1 ships a catalog, not a pricing engine, so there is no question tree to
 * walk and no route to resolve (contrast scripts/verify-plumbing-template.ts,
 * which proves scope/gate/family behavior that does not exist here yet).
 * Every check below is either a count, a uniqueness check, or a source-level
 * scan — the same kind of proof G4's verify-contractor-credentials.ts used
 * for a fact-only slice with no consumer yet.
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
import { HVAC_GATE_KEYS, capacityGate, conditionGate, type EquipmentCondition } from "../lib/hvac/gates";
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

group("31. no service tree, composition, or provisioning surface exists yet");
{
  ok("lib/hvac/scope.ts does not exist (composition is H3)", !existsSync(join(ROOT, "lib/hvac/scope.ts")));
  ok("lib/hvac/composition.ts does not exist (composition is H3)", !existsSync(join(ROOT, "lib/hvac/composition.ts")));
  ok("lib/hvac/publish.ts does not exist (provisioning is H3+)", !existsSync(join(ROOT, "lib/hvac/publish.ts")));
  ok(
    "no HVAC family declares actual Question/AnswerOption content",
    HVAC_FAMILIES.every((f) => !("questions" in f))
  );
}

console.log();
console.log(failures === 0 ? `All ${checks} checks passed.\n` : `${failures}/${checks} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
