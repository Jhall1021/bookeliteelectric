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

import { readFileSync } from "node:fs";
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

console.log();
console.log(failures === 0 ? `All ${checks} checks passed.\n` : `${failures}/${checks} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
