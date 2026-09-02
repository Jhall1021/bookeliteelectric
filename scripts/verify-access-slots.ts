/**
 * G1 — scoped access, proved.
 *
 * Runs with NO DATABASE, NO NETWORK and NO PROVIDER. Everything below is pure
 * functions and hand-built fixtures, which is what lets the platform invariants
 * be proved independently of anything that might be wrong with a catalog.
 *
 * TWO INVARIANTS, DELIBERATELY SEPARATE — they close different failures:
 *
 *   one_access_writer_per_slot            prevents RUNTIME AMBIGUITY. Two
 *                                         answers claiming one scoped fact.
 *   location_scope_matches_promised_work  prevents an AUTHOR understating where
 *                                         a service works at all. Needed with
 *                                         or without scoped access.
 *
 * Plus two supporting platform checks found while designing the first:
 *
 *   access_slot_reader_has_writer                 a condition on a slot no answer
 *                                                 can establish never matches —
 *                                                 silently. The electrical
 *                                                 synonym bug in slot form.
 *   non_primary_access_slot_requires_classification
 *                                                 a slot on a row whose access
 *                                                 class is null carries no
 *                                                 meaning and must not be stored
 *                                                 as though it did.
 *
 * THE FIXTURES REPRODUCE THE REAL DEFECT, NOT AN ABSTRACT ONE. Case A below is
 * the AC Tune-Up exactly as it was authored — promising indoor and outdoor work
 * while declaring OUTDOOR — because a verifier that only proves the rule fires
 * on a synthetic input has not proved it would have caught what shipped.
 *
 * Run: npx tsx scripts/verify-access-slots.ts
 */

import {
  ACCESS_SLOTS,
  PRIMARY_SLOT,
  isAccessSlot,
  orderAccessSlots,
  parseAccessSlot,
  writeSlot,
  isRefinement,
  type AccessBySlot,
  type AccessSlot,
} from "../lib/accessSlots";
import {
  locationScopeProblems,
  locationsCovered,
  promisedLocations,
  requiredAccessSlots,
  type LocationScopedService,
} from "../lib/locationScope";
import {
  applyBranch,
  startConfiguration,
  answerPriceDelta,
  assertAccessEquivalence,
  type BranchContribution,
  type JobConfiguration,
} from "../lib/pricing";

let failures = 0;
let checks = 0;

function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}
function ok(condition: boolean, label: string, detail = "") {
  checks++;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures — a job with no economics. Every number here is a count or a zero.
// ---------------------------------------------------------------------------

const BARE_SERVICE = {
  fieldLaborHours: 1,
  materialCostCents: 0,
  estimatedMinutes: 60,
  requiresTechCount: 1,
};

function fresh(): JobConfiguration {
  return startConfiguration(BARE_SERVICE);
}

/** An answer that establishes a classification in a named slot. */
function accessAnswer(slot: AccessSlot, cls: "ACCESSIBLE" | "FINISHED" | "UNKNOWN"): BranchContribution {
  return { accessClassification: cls, accessSlot: slot };
}

// ---------------------------------------------------------------------------
// 1. THE SLOT VOCABULARY
// ---------------------------------------------------------------------------

function vocabulary() {
  group("SLOT VOCABULARY — closed, validated, no ordinals");

  ok(ACCESS_SLOTS.length === 3, "three slots, and three is the whole set", ACCESS_SLOTS.join(", "));
  ok(
    ACCESS_SLOTS.includes("PRIMARY") &&
      ACCESS_SLOTS.includes("INDOOR_EQUIPMENT") &&
      ACCESS_SLOTS.includes("OUTDOOR_EQUIPMENT"),
    "the three approved V1 slots, and no others"
  );
  ok(PRIMARY_SLOT === "PRIMARY", "PRIMARY is the default every existing row means");

  // Ordinals are NOT an API promise. Accepting one "harmlessly" would turn an
  // implementation detail into a contract before anyone has decided whether
  // ordinals are even the right representation for per-head access.
  ok(parseAccessSlot("INDOOR_EQUIPMENT#2") === null, "an ordinal key is rejected, not tolerated");
  ok(parseAccessSlot("indoor_equipment") === null, "slot keys are case-sensitive");
  ok(parseAccessSlot("") === null && parseAccessSlot(null) === null && parseAccessSlot(undefined) === null,
    "empty, null and undefined all refuse rather than defaulting");
  ok(parseAccessSlot("SECONDARY") === null, "an unknown key returns null — there is no nearest match");
  ok(isAccessSlot("PRIMARY") && !isAccessSlot(7), "the type guard agrees with the parser");

  // Deterministic order, so a published slot list is a contract rather than an
  // artifact of which question happened to be authored first.
  const scrambled = ["OUTDOOR_EQUIPMENT", "PRIMARY", "INDOOR_EQUIPMENT", "OUTDOOR_EQUIPMENT"];
  ok(
    orderAccessSlots(scrambled).join(",") === "PRIMARY,INDOOR_EQUIPMENT,OUTDOOR_EQUIPMENT",
    "slots sort to the declared platform order, de-duplicated"
  );
  ok(orderAccessSlots(["NONSENSE"]).length === 0, "an unparseable slot is dropped, never passed through");
}

// ---------------------------------------------------------------------------
// 2. MISSING IS NOT UNKNOWN
// ---------------------------------------------------------------------------

function missingIsNotUnknown() {
  group("MISSING ≠ UNKNOWN — two different facts, never collapsed");

  const empty: AccessBySlot = {};
  const answeredUnknown: AccessBySlot = { PRIMARY: "UNKNOWN" };

  ok(empty.PRIMARY === undefined, "an unestablished slot reads as undefined");
  ok(answeredUnknown.PRIMARY === "UNKNOWN", "a slot answered UNKNOWN holds UNKNOWN");
  ok(
    (empty.PRIMARY as unknown) !== (answeredUnknown.PRIMARY as unknown),
    "nobody-was-asked and they-could-not-tell are distinguishable"
  );

  // The behavior that must be preserved for a zero price delta: a condition
  // against an unestablished slot excludes the component, exactly as
  // `FINISHED !== null` excluded it before scoped access.
  const conditioned: BranchContribution = {
    components: [
      {
        quantity: 1,
        conditionAccessClass: "FINISHED",
        conditionAccessSlot: PRIMARY_SLOT,
        component: { key: "opening", customerFacingLabel: null, approvedPriceCents: 5000 },
      },
    ],
  };
  // PRE-EXISTING BEHAVIOR, PRESERVED EXACTLY. When a branch declares components
  // and none match, `answerPriceDelta` returns null cents and needsReview —
  // "we don't know which variant applies" — rather than pricing the branch at
  // zero. That is on main and it is fail-closed; scoped access changes only
  // WHICH value the condition is compared against, never what happens when the
  // comparison fails.
  const unmatched = (map: AccessBySlot) => {
    const d = answerPriceDelta(conditioned, {}, map);
    return d.cents === null && d.needsReview === true;
  };

  ok(unmatched({}), "a component conditioned on an UNESTABLISHED slot does not apply");
  ok(
    answerPriceDelta(conditioned, {}, { PRIMARY: "FINISHED" }).cents === 5000,
    "the same component applies once its slot is established to match"
  );
  ok(unmatched({ PRIMARY: "ACCESSIBLE" }), "and not when the slot holds a different class");
  ok(
    unmatched({ OUTDOOR_EQUIPMENT: "FINISHED" }),
    "a matching class in the WRONG slot does not apply it"
  );
  ok(
    answerPriceDelta({ priceModifierCents: 0 }, {}, {}).cents === 0,
    "a branch declaring no components still prices at zero — the null is about unmatched variants"
  );
}

// ---------------------------------------------------------------------------
// 3. one_access_writer_per_slot — the runtime half
// ---------------------------------------------------------------------------

function slotIsolationAndRefinement() {
  group("SLOT ISOLATION + REFINEMENT — different slots never collide, same slot refines");

  // ── THE COEXISTENCE PROOF, WITH DELIBERATELY MISMATCHED VALUES ───────────
  //
  // FINISHED indoors and ACCESSIBLE outdoors. Two MATCHING values could hide an
  // overwrite — if one write clobbered the other, a test using ACCESSIBLE twice
  // would still pass and report a false green.
  let config = fresh();
  config = applyBranch(config, accessAnswer("INDOOR_EQUIPMENT", "FINISHED"), {});
  config = applyBranch(config, accessAnswer("OUTDOOR_EQUIPMENT", "ACCESSIBLE"), {});

  ok(config.accessBySlot.INDOOR_EQUIPMENT === "FINISHED", "indoor holds FINISHED");
  ok(config.accessBySlot.OUTDOOR_EQUIPMENT === "ACCESSIBLE", "outdoor holds ACCESSIBLE — a DIFFERENT value");
  ok(
    config.accessBySlot.INDOOR_EQUIPMENT !== config.accessBySlot.OUTDOOR_EQUIPMENT,
    "the two slots hold different classifications simultaneously"
  );
  ok(config.accessClass === null, "a non-PRIMARY slot never touches the legacy scalar");

  // Order must not matter.
  let reversed = fresh();
  reversed = applyBranch(reversed, accessAnswer("OUTDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  reversed = applyBranch(reversed, accessAnswer("INDOOR_EQUIPMENT", "FINISHED"), {});
  ok(
    reversed.accessBySlot.INDOOR_EQUIPMENT === "FINISHED" &&
      reversed.accessBySlot.OUTDOOR_EQUIPMENT === "ACCESSIBLE",
    "answering in the opposite order produces the same state"
  );

  // ── SCOPED VALUES CANNOT OVERWRITE ONE ANOTHER ──────────────────────────
  //
  // The bug scoped access removes. Refining one slot repeatedly must leave
  // every other slot untouched.
  let isolated = fresh();
  isolated = applyBranch(isolated, accessAnswer("OUTDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  isolated = applyBranch(isolated, accessAnswer("INDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  isolated = applyBranch(isolated, accessAnswer("INDOOR_EQUIPMENT", "FINISHED"), {});
  isolated = applyBranch(isolated, accessAnswer("INDOOR_EQUIPMENT", "UNKNOWN"), {});
  ok(
    isolated.accessBySlot.OUTDOOR_EQUIPMENT === "ACCESSIBLE",
    "three refinements of INDOOR leave OUTDOOR exactly as it was"
  );
  ok(isolated.accessBySlot.INDOOR_EQUIPMENT === "UNKNOWN", "and INDOOR holds the last one");
  ok(
    isolated.accessClass === null,
    "PRIMARY is untouched by either — no slot can reach into another"
  );

  // ── SUCCESSIVE REFINEMENT, LAST APPLICABLE WRITER WINS ──────────────────
  //
  // The live Electrical shape: below_above_access says ACCESSIBLE, then
  // finished_space_both_sides narrows it to FINISHED. The second is the more
  // specific answer and it must win.
  let refined = fresh();
  refined = applyBranch(refined, accessAnswer(PRIMARY_SLOT, "ACCESSIBLE"), {});
  refined = applyBranch(refined, accessAnswer(PRIMARY_SLOT, "FINISHED"), {});
  ok(
    refined.accessBySlot[PRIMARY_SLOT] === "FINISHED",
    "successive writes to one slot REFINE it — the last applicable writer wins"
  );
  ok(refined.accessClass === "FINISHED", "and the legacy scalar follows the refinement");

  // Three-deep, the shape new-ceiling-fan actually has.
  let deep = fresh();
  deep = applyBranch(deep, accessAnswer(PRIMARY_SLOT, "ACCESSIBLE"), {});
  deep = applyBranch(deep, accessAnswer(PRIMARY_SLOT, "ACCESSIBLE"), {});
  deep = applyBranch(deep, accessAnswer(PRIMARY_SLOT, "FINISHED"), {});
  ok(deep.accessBySlot[PRIMARY_SLOT] === "FINISHED", "three writers, the last still wins");

  // No special case for PRIMARY: refinement behaves identically in every slot.
  let equally = fresh();
  equally = applyBranch(equally, accessAnswer("INDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  equally = applyBranch(equally, accessAnswer("INDOOR_EQUIPMENT", "FINISHED"), {});
  ok(
    equally.accessBySlot.INDOOR_EQUIPMENT === "FINISHED",
    "a non-PRIMARY slot refines the same way — PRIMARY is not grandfathered"
  );

  // A branch with no access answer changes nothing.
  let untouched = fresh();
  untouched = applyBranch(untouched, accessAnswer(PRIMARY_SLOT, "FINISHED"), {});
  untouched = applyBranch(untouched, { priceModifierCents: 0 }, {});
  ok(
    untouched.accessBySlot[PRIMARY_SLOT] === "FINISHED",
    "a non-access answer does not disturb an established slot"
  );

  // The primitive, independent of the engine.
  ok(
    writeSlot({ PRIMARY: "ACCESSIBLE" }, "PRIMARY", "FINISHED").PRIMARY === "FINISHED",
    "writeSlot refines rather than refusing"
  );
  ok(
    writeSlot({ PRIMARY: "ACCESSIBLE" }, "INDOOR_EQUIPMENT", "FINISHED").PRIMARY === "ACCESSIBLE",
    "and writing one slot leaves the others alone"
  );
  ok(
    isRefinement({ PRIMARY: "ACCESSIBLE" }, "PRIMARY", "FINISHED") &&
      !isRefinement({}, "PRIMARY", "FINISHED") &&
      !isRefinement({ PRIMARY: "FINISHED" }, "PRIMARY", "FINISHED"),
    "isRefinement reports a narrowing, and reports it for the baseline only"
  );
}

// ---------------------------------------------------------------------------
// 4. PARALLEL-PHASE EQUIVALENCE
// ---------------------------------------------------------------------------

function parallelEquivalence() {
  group("PARALLEL PHASE — accessClass === accessBySlot.PRIMARY, or it fails loudly");

  let config = fresh();
  ok(config.accessClass === null && config.accessBySlot.PRIMARY === undefined,
    "a fresh configuration has neither, and they agree");

  config = applyBranch(config, accessAnswer("PRIMARY", "FINISHED"), {});
  ok(config.accessClass === "FINISHED", "a PRIMARY answer dual-writes the legacy scalar");
  ok(config.accessBySlot.PRIMARY === "FINISHED", "and the map");
  ok(config.accessClass === (config.accessBySlot.PRIMARY ?? null), "the two agree");

  let outdoor = fresh();
  outdoor = applyBranch(outdoor, accessAnswer("OUTDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  ok(outdoor.accessClass === null, "a non-PRIMARY answer leaves the scalar alone");

  // The assertion must actually throw — a guard that has only ever been seen to
  // pass is a guard nobody knows is connected.
  let threw = false;
  try {
    assertAccessEquivalence("ACCESSIBLE", { PRIMARY: "FINISHED" });
  } catch {
    threw = true;
  }
  ok(threw, "a divergence throws rather than choosing a winner");

  let alsoThrew = false;
  try {
    assertAccessEquivalence("ACCESSIBLE", {});
  } catch {
    alsoThrew = true;
  }
  ok(alsoThrew, "a scalar with no matching slot value also throws");

  ok(
    (() => {
      try {
        assertAccessEquivalence(null, {});
        assertAccessEquivalence("FINISHED", { PRIMARY: "FINISHED" });
        return true;
      } catch {
        return false;
      }
    })(),
    "agreement passes in both the empty and the established case"
  );
}

// ---------------------------------------------------------------------------
// 5. access_slot_reader_has_writer  +  non_primary_access_slot_requires_classification
// ---------------------------------------------------------------------------

/** The authored shape these two invariants read. */
type AuthoredOption = {
  value: string;
  accessClassification: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
  accessSlot: string;
  componentConditions?: { conditionAccessClass: string | null; conditionAccessSlot: string }[];
};
type AuthoredService = {
  key: string;
  options: AuthoredOption[];
  disclaimerConditions?: { accessClass: string | null; accessSlot: string }[];
};

export function writerSlots(svc: AuthoredService): AccessSlot[] {
  return orderAccessSlots(
    svc.options.filter((o) => o.accessClassification !== null).map((o) => o.accessSlot)
  );
}

export function readerSlots(svc: AuthoredService): AccessSlot[] {
  const raw: string[] = [];
  for (const o of svc.options)
    for (const c of o.componentConditions ?? [])
      if (c.conditionAccessClass !== null) raw.push(c.conditionAccessSlot);
  for (const d of svc.disclaimerConditions ?? [])
    if (d.accessClass !== null) raw.push(d.accessSlot);
  return orderAccessSlots(raw);
}

export function slotAuthoringProblems(svc: AuthoredService): string[] {
  const problems: string[] = [];

  // non_primary_access_slot_requires_classification — a slot on a row with no
  // class carries no meaning, so storing a non-default one is metadata that
  // reads as significant and is not.
  for (const o of svc.options) {
    if (o.accessClassification === null && o.accessSlot !== PRIMARY_SLOT)
      problems.push(`${svc.key}/${o.value}: accessSlot ${o.accessSlot} with no accessClassification`);
    for (const c of o.componentConditions ?? [])
      if (c.conditionAccessClass === null && c.conditionAccessSlot !== PRIMARY_SLOT)
        problems.push(
          `${svc.key}/${o.value}: component conditionAccessSlot ${c.conditionAccessSlot} with no class`
        );
  }
  for (const d of svc.disclaimerConditions ?? [])
    if (d.accessClass === null && d.accessSlot !== PRIMARY_SLOT)
      problems.push(`${svc.key}: disclaimer accessSlot ${d.accessSlot} with no accessClass`);

  // access_slot_reader_has_writer — readers ⊆ writers.
  const writers = writerSlots(svc);
  for (const r of readerSlots(svc))
    if (!writers.includes(r))
      problems.push(`${svc.key}: a condition reads slot ${r}, which no answer in this service establishes`);

  return problems;
}

function authoringInvariants() {
  group("access_slot_reader_has_writer + non_primary_access_slot_requires_classification");

  const healthy: AuthoredService = {
    key: "healthy",
    options: [
      { value: "attic", accessClassification: "ACCESSIBLE", accessSlot: "INDOOR_EQUIPMENT" },
      { value: "ground", accessClassification: "ACCESSIBLE", accessSlot: "OUTDOOR_EQUIPMENT" },
      {
        value: "go",
        accessClassification: null,
        accessSlot: "PRIMARY",
        componentConditions: [
          { conditionAccessClass: "FINISHED", conditionAccessSlot: "INDOOR_EQUIPMENT" },
        ],
      },
    ],
    disclaimerConditions: [{ accessClass: "FINISHED", accessSlot: "OUTDOOR_EQUIPMENT" }],
  };
  ok(slotAuthoringProblems(healthy).length === 0, "a service whose readers all have writers passes");
  ok(
    writerSlots(healthy).join(",") === "INDOOR_EQUIPMENT,OUTDOOR_EQUIPMENT",
    "referencedAccessSlots derives from WRITERS only, in platform order"
  );

  // The failure this closes: a condition waiting on a fact the flow can never
  // establish. It would never match, silently, and nobody would investigate.
  const orphanReader: AuthoredService = {
    key: "orphan",
    options: [
      { value: "attic", accessClassification: "ACCESSIBLE", accessSlot: "INDOOR_EQUIPMENT" },
      {
        value: "go",
        accessClassification: null,
        accessSlot: "PRIMARY",
        componentConditions: [
          { conditionAccessClass: "FINISHED", conditionAccessSlot: "OUTDOOR_EQUIPMENT" },
        ],
      },
    ],
  };
  const orphanProblems = slotAuthoringProblems(orphanReader);
  ok(orphanProblems.length === 1, "a component conditioned on a slot nothing writes FAILS");
  ok(
    orphanProblems[0]?.includes("OUTDOOR_EQUIPMENT"),
    "and the failure names the unwritten slot",
    orphanProblems.join(" | ")
  );

  const orphanDisclaimer: AuthoredService = {
    key: "orphan-disclaimer",
    options: [{ value: "attic", accessClassification: "ACCESSIBLE", accessSlot: "INDOOR_EQUIPMENT" }],
    disclaimerConditions: [{ accessClass: "FINISHED", accessSlot: "OUTDOOR_EQUIPMENT" }],
  };
  ok(slotAuthoringProblems(orphanDisclaimer).length === 1, "a DISCLAIMER on an unwritten slot fails too");

  const meaninglessSlot: AuthoredService = {
    key: "meaningless",
    options: [
      { value: "attic", accessClassification: "ACCESSIBLE", accessSlot: "INDOOR_EQUIPMENT" },
      { value: "noop", accessClassification: null, accessSlot: "OUTDOOR_EQUIPMENT" },
    ],
  };
  ok(
    slotAuthoringProblems(meaninglessSlot).some((p) => p.includes("no accessClassification")),
    "a non-PRIMARY slot with no classification fails"
  );

  // A null class with the DEFAULT slot is the ordinary, correct state of every
  // row authored before scoped access — it must not be flagged.
  const legacyShape: AuthoredService = {
    key: "legacy",
    options: [
      { value: "basement", accessClassification: "ACCESSIBLE", accessSlot: "PRIMARY" },
      { value: "plain", accessClassification: null, accessSlot: "PRIMARY" },
    ],
  };
  ok(slotAuthoringProblems(legacyShape).length === 0, "an existing PRIMARY-only service is untouched by both rules");
}

// ---------------------------------------------------------------------------
// 6. location_scope_matches_promised_work — THE REAL DEFECT
// ---------------------------------------------------------------------------

/**
 * The AC Tune-Up, as it was actually authored.
 *
 * `at: "INDOOR"` on the condensate drain is the fact that made the declaration
 * a lie — the drain is flushed at the indoor equipment, and the service claimed
 * to work outdoors only.
 */
const AC_TUNE_UP_SCOPE = [
  { item: "Clean the outdoor condenser coil and clear debris", at: "OUTDOOR" as const },
  { item: "Check the contactor, capacitor, disconnect and fan motor", at: "OUTDOOR" as const },
  { item: "Check the blower, filter and evaporator coil", at: "INDOOR" as const },
  { item: "Clear the condensate drain", at: "INDOOR" as const },
];

function locationScopeInvariant() {
  group("location_scope_matches_promised_work — the AC Tune-Up regression fixture");

  // ── CASE A — THE MISDECLARATION MUST FAIL ────────────────────────────────
  const caseA: LocationScopedService = {
    key: "ac-tune-up",
    locationScope: "OUTDOOR",
    maintenanceScope: AC_TUNE_UP_SCOPE,
  };
  const aProblems = locationScopeProblems(caseA);

  ok(aProblems.length > 0, "CASE A — the AC Tune-Up as authored FAILS verification");
  ok(
    aProblems[0]?.code === "PROMISED_WORK_OUTSIDE_DECLARED_SCOPE",
    "and fails for the right reason: promised work outside the declared scope",
    aProblems.map((p) => p.code).join(", ")
  );
  ok(
    aProblems[0]?.message.includes("INDOOR"),
    "naming the location that was promised and not declared",
    aProblems[0]?.message
  );
  ok(
    promisedLocations(caseA).join(",") === "INDOOR,OUTDOOR",
    "its promised work really is at both locations"
  );
  ok(locationsCovered("OUTDOOR").join(",") === "OUTDOOR", "and its declaration really did cover only one");

  // ── CASE B — THE HONEST DECLARATION PASSES ───────────────────────────────
  const caseB: LocationScopedService = {
    key: "ac-tune-up",
    locationScope: "BOTH",
    maintenanceScope: AC_TUNE_UP_SCOPE,
  };
  ok(locationScopeProblems(caseB).length === 0, "CASE B — declaring BOTH passes verification");
  ok(
    requiredAccessSlots("BOTH").join(",") === "INDOOR_EQUIPMENT,OUTDOOR_EQUIPMENT",
    "and BOTH requires exactly the two equipment slots"
  );

  // Coexistence, end to end, through the real engine — mismatched on purpose.
  let config = fresh();
  for (const slot of requiredAccessSlots(caseB.locationScope)) {
    config = applyBranch(
      config,
      accessAnswer(slot, slot === "INDOOR_EQUIPMENT" ? "FINISHED" : "ACCESSIBLE"),
      {}
    );
  }
  ok(
    config.accessBySlot.INDOOR_EQUIPMENT === "FINISHED" &&
      config.accessBySlot.OUTDOOR_EQUIPMENT === "ACCESSIBLE",
    "CASE B — indoor FINISHED and outdoor ACCESSIBLE coexist in one job"
  );
  ok(
    config.accessBySlot.INDOOR_EQUIPMENT !== config.accessBySlot.OUTDOOR_EQUIPMENT,
    "held independently, so neither location's answer displaced the other"
  );

  // ── THE PRICING CLAIM, PROVED SEPARATELY ─────────────────────────────────
  //
  // Coexistence and "the fixed-price route still resolves" are different
  // claims, and conflating them in one assertion would let a broken engine
  // pass on the strength of the state check.
  let permitted = fresh();
  permitted = applyBranch(permitted, accessAnswer("INDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  permitted = applyBranch(permitted, accessAnswer("OUTDOOR_EQUIPMENT", "ACCESSIBLE"), {});
  ok(
    Object.keys(permitted.accessBySlot).length === 2,
    "a permitted pair establishes both slots and nothing else"
  );
  ok(
    permitted.accessBySlot.INDOOR_EQUIPMENT === "ACCESSIBLE" &&
      permitted.accessBySlot.OUTDOOR_EQUIPMENT === "ACCESSIBLE",
    "both slots established, so a fixed-price route has everything it needs"
  );
  ok(
    permitted.awaitingComponentApproval === false && permitted.fieldLaborHours !== null,
    "and the configuration is priceable — nothing about scoped access blocked it"
  );

  // ── OVER-DECLARATION IS NOT A FAILURE ────────────────────────────────────
  const overDeclared: LocationScopedService = {
    key: "furnace-tune-up",
    locationScope: "BOTH",
    maintenanceScope: [{ item: "Check the burners and heat exchanger", at: "INDOOR" }],
  };
  ok(
    locationScopeProblems(overDeclared).length === 0,
    "declaring BOTH while working indoors only is over-declaration, not a lie"
  );

  // The genuinely single-location tune-up, correctly declared.
  const furnace: LocationScopedService = {
    key: "furnace-tune-up",
    locationScope: "INDOOR",
    maintenanceScope: [
      { item: "Check the burners, ignition and heat exchanger", at: "INDOOR" },
      { item: "Check the blower, filter and venting", at: "INDOOR" },
    ],
  };
  ok(locationScopeProblems(furnace).length === 0, "the Furnace Tune-Up, genuinely indoor-only, passes as INDOOR");

  // Replacement services declare work locations without an itemized scope.
  const replacement: LocationScopedService = {
    key: "whole-system-replacement",
    locationScope: "BOTH",
    performsWorkAt: ["INDOOR", "OUTDOOR"],
  };
  ok(locationScopeProblems(replacement).length === 0, "a replacement declaring performsWorkAt passes");

  const understatedReplacement: LocationScopedService = {
    key: "ac-replacement",
    locationScope: "OUTDOOR",
    performsWorkAt: ["INDOOR", "OUTDOOR"],
  };
  ok(
    locationScopeProblems(understatedReplacement).length > 0,
    "and an understated one fails, even with no maintenance scope"
  );

  // An empty promise must not satisfy the invariant by omission.
  const empty: LocationScopedService = { key: "empty", locationScope: "BOTH", maintenanceScope: [] };
  ok(
    locationScopeProblems(empty).some((p) => p.code === "DECLARED_SCOPE_PROMISES_NOTHING"),
    "a declared scope promising nothing anywhere is refused"
  );

  // IDENTITY IS NOT PROMISED WORK. Asking about equipment is not working on it.
  const identityOnly: LocationScopedService = {
    key: "ac-replacement-identity",
    locationScope: "OUTDOOR",
    performsWorkAt: ["OUTDOOR"],
  };
  ok(
    locationScopeProblems(identityOnly).length === 0,
    "a service capturing indoor coil IDENTITY but working outdoors stays OUTDOOR"
  );
}

// ---------------------------------------------------------------------------

function main() {
  console.log("\n\x1b[1mG1 — scoped access\x1b[0m");
  console.log("No database, no network. Pure functions and fixtures.");

  vocabulary();
  missingIsNotUnknown();
  slotIsolationAndRefinement();
  parallelEquivalence();
  authoringInvariants();
  locationScopeInvariant();

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed\x1b[0m\n`
  );
  if (failures > 0) process.exit(1);
}

main();
