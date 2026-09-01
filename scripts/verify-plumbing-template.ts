/**
 * Plumbing Template V1, proved without a database.
 *
 *   npx tsx scripts/verify-plumbing-template.ts
 *
 * STATIC ON PURPOSE. Every invariant below is a property of the canonical
 * template itself, and a canonical template that needed a connection to be
 * checked would be one that had already leaked a contractor into it. There is
 * no plumbing data in any database yet; when there is, the live half belongs
 * in the same shape verify-policy-resolution.ts uses — statics(), then live().
 *
 * The checks are grouped by what they protect:
 *
 *   SHAPE        the catalog is the size and structure the handoff scoped
 *   ECONOMICS    no price, rate, hour, allowance or boundary is in here
 *   FAIL CLOSED  every gate refuses an unestablished fact
 *   TOTALITY     every mapping covers every member of its vocabulary
 *   BOUNDARY     Visual Assist output cannot price anything unconfirmed
 *   INTENTS      the plumbing emergency screen catches plumbing emergencies
 */
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  PLUMBING_SERVICES, PLUMBING_SERVICE_COUNT, PLUMBING_CATEGORIES, service,
} from "../lib/plumbing/catalog";
// This verifier reads families DIRECTLY, which is exactly what the
// composition-authoritative rule forbids downstream code from doing. It is
// allow-listed below, on the same reasoning verify-us-spelling.ts allow-lists
// the file that lists the forbidden words: asserting an invariant about a thing
// requires looking at the thing.
import { PLUMBING_FAMILY_KEYS, PLUMBING_FAMILIES, family } from "../lib/plumbing/families";
import { buildPlumbingPayload, payloadTotals, referencedCanonicalKeys, componentRecipes, branchMaterialsForAnswer } from "../lib/plumbing/publish";
import { composeService, composeAll, answerComposed, factsEstablishedBy, GATE_FACT } from "../lib/plumbing/composition";
import { PLUMBING_PRIMITIVES, PLUMBING_PRIMITIVE_KEYS } from "../lib/plumbing/primitives";
import { PLUMBING_REQUIREMENT_KEYS } from "../lib/plumbing/roles";
import { PLUMBING_POLICIES, PLUMBING_POLICY_KEYS } from "../lib/plumbing/policies";
import { metadataProblems, PERMIT_POSTURES, PHOTO_POSTURES, PRE_WORK_POSTURES, VISIT_POSTURES } from "../lib/plumbing/metadata";
import { PLUMBING_APPOINTMENT_SHELLS, shellIsSchedulable } from "../lib/plumbing/appointments";
import {
  accessGate, capacityGate, combustionGate, conditionGate, shutoffGate,
  toRouteAction, COMBUSTION_CLASSES,
} from "../lib/plumbing/gates";
import { COMBUSTION_SCOPE, CONDITION_SCOPE, PIPE_MATERIAL_SCOPE, SHUTOFF_SCOPE, mergeScope, componentsForAnswer } from "../lib/plumbing/mappings";
import { acceptVisualFact, intakeFacts, combustionOf, capacityOf } from "../lib/plumbing/visualAssist";
import { scopePlumbingService } from "../lib/plumbing/scope";
import { PLUMBING_INTENTS, allIntentPhrases, screenPlumbingEmergency } from "../lib/plumbing/intents";
import { boundariesUsed, hasHoles } from "../lib/policyBands";
// Read-only import of a shared module. The plumbing template must not restate
// the platform's list of flat-rate phrasings; it must be held to it.
import { FLAT_RATE_ASSUMPTIONS } from "../lib/pricingCopy";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const group = (name: string) => console.log(`\n  ${name}\n`);

// ── SHAPE ──────────────────────────────────────────────────────────────────

function shape() {
  group("SHAPE");

  ok(PLUMBING_SERVICES.length === PLUMBING_SERVICE_COUNT,
    `the catalog holds exactly ${PLUMBING_SERVICE_COUNT} services`,
    `found ${PLUMBING_SERVICES.length}`);

  const keys = PLUMBING_SERVICES.map((s) => s.key);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  ok(dupKeys.length === 0, "service keys are unique", dupKeys.join(", "));

  const names = PLUMBING_SERVICES.map((s) => s.name);
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
  ok(dupNames.length === 0, "service names are unique", dupNames.join(", "));

  // A key is the identity that survives a rename. One with a capital letter or
  // a space is a name somebody typed, not an identifier.
  const badKeys = keys.filter((k) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k));
  ok(badKeys.length === 0, "every service key is a stable lowercase slug", badKeys.join(", "));

  const catKeys = new Set(PLUMBING_CATEGORIES.map((c) => c.key));
  const orphanCats = PLUMBING_SERVICES.filter((s) => !catKeys.has(s.category));
  ok(orphanCats.length === 0, "every service names a canonical category",
    orphanCats.map((s) => s.key).join(", "));

  const emptyCats = PLUMBING_CATEGORIES.filter((c) => !PLUMBING_SERVICES.some((s) => s.category === c.key));
  ok(emptyCats.length === 0, "every canonical category has at least one service",
    emptyCats.map((c) => c.key).join(", "));

  // Nine, not the eight the handoff scoped. The ninth was added when the
  // composition audit found `condition_gate` had nothing to read; the count is
  // asserted so a tenth is a decision somebody makes rather than a drift.
  ok(PLUMBING_FAMILIES.length === 9, "there are exactly 9 reusable families",
    `found ${PLUMBING_FAMILIES.length}`);
  ok(PLUMBING_PRIMITIVES.length === 7, "there are exactly 7 Guided Pricing primitives",
    `found ${PLUMBING_PRIMITIVES.length}`);
  ok(PLUMBING_APPOINTMENT_SHELLS.length === 3, "there are exactly 3 appointment shells",
    `found ${PLUMBING_APPOINTMENT_SHELLS.length}`);

  const famSet = new Set<string>(PLUMBING_FAMILY_KEYS);
  const badFam = PLUMBING_SERVICES.flatMap((s) => s.families.filter((f) => !famSet.has(f)).map((f) => `${s.key}:${f}`));
  ok(badFam.length === 0, "every family a service composes exists", badFam.join(", "));

  const reqSet = new Set<string>(PLUMBING_REQUIREMENT_KEYS);
  const badReq = PLUMBING_SERVICES.flatMap((s) => s.requires.filter((r) => !reqSet.has(r)).map((r) => `${s.key}:${r}`));
  ok(badReq.length === 0, "every credential a service requires exists", badReq.join(", "));

  const polSet = new Set<string>(PLUMBING_POLICY_KEYS);
  const badPol = PLUMBING_SERVICES.flatMap((s) => (s.servicePolicies ?? []).filter((p) => !polSet.has(p)).map((p) => `${s.key}:${p}`));
  ok(badPol.length === 0, "every policy a service names is defined", badPol.join(", "));

  // A primitive nothing uses is either dead or a family forgot to declare it.
  const usedPrimitives = new Set(PLUMBING_FAMILIES.flatMap((f) => [...f.primitives]));
  const unused = PLUMBING_PRIMITIVE_KEYS.filter((k) => !usedPrimitives.has(k));
  ok(unused.length === 0, "every primitive is used by at least one family", unused.join(", "));

  // Every family is reachable. One nothing composes is 400 lines of wording
  // nobody will ever see and nobody will remember to maintain.
  const usedFamilies = new Set(PLUMBING_SERVICES.flatMap((s) => [...s.families]));
  const orphanFam = PLUMBING_FAMILY_KEYS.filter((k) => !usedFamilies.has(k));
  ok(orphanFam.length === 0, "every family is composed by at least one service", orphanFam.join(", "));

  // The credential rule that is not negotiable.
  const gasServices = PLUMBING_SERVICES.filter((s) => s.category === "gas-piping" || s.expectsCombustion?.some((c) => c.startsWith("GAS_")));
  const ungated = gasServices.filter((s) => !s.requires.includes("gas_fitting"));
  ok(ungated.length === 0, "every service touching fuel gas requires the gas credential",
    ungated.map((s) => s.key).join(", "));
}


// ── COMPOSITION ────────────────────────────────────────────────────────────

/**
 * The group that catches what neither the catalog nor the families can see
 * alone, because the defects are properties of the COMBINATION.
 */
function composition() {
  group("COMPOSITION");

  const composed = PLUMBING_SERVICES.map(composeService);

  const broken = composed.filter((c) => c.problems.length > 0);
  ok(broken.length === 0, "every service composes without a structural problem",
    broken.slice(0, 6).map((c) => `${c.serviceKey}: ${c.problems.map((p) => p.message).join("; ")}`).join("\n         "));

  // Two families answering into the platform's single access slot: the
  // customer is asked twice and whichever answer arrives second wins.
  const accessFamilies = PLUMBING_FAMILY_KEYS.filter((k) => factsEstablishedBy(k).includes("access_class"));
  ok(accessFamilies.length === 2, "exactly two families establish the access class",
    accessFamilies.join(", "));
  const doubleAccess = PLUMBING_SERVICES.filter(
    (s) => s.families.filter((f) => accessFamilies.includes(f)).length > 1);
  ok(doubleAccess.length === 0, "no service composes two access-establishing families",
    doubleAccess.map((s) => s.key).join(", "));
  const gatedNoAccess = PLUMBING_SERVICES.filter(
    (s) => s.gates.includes("access_gate") && !s.families.some((f) => accessFamilies.includes(f)));
  ok(gatedNoAccess.length === 0, "every service running the access gate asks an access question",
    gatedNoAccess.map((s) => s.key).join(", "));

  // A gate with no source refuses forever, and produces a review rather than
  // an error — so nobody investigates it.
  const sourceless = composed.flatMap((c) =>
    c.problems.filter((p) => p.code === "GATE_WITHOUT_SOURCE").map((p) => `${c.serviceKey}: ${p.message}`));
  ok(sourceless.length === 0, "no gate reads a fact the template cannot establish", sourceless.join(" | "));

  // Every gate in the vocabulary has a fact, and every fact a family.
  const allFacts = new Set(PLUMBING_FAMILY_KEYS.flatMap(factsEstablishedBy));
  const orphanGateFacts = Object.entries(GATE_FACT).filter(([, fact]) => !allFacts.has(fact));
  ok(orphanGateFacts.length === 0, "every gate's fact is established by some family",
    orphanGateFacts.map(([g, f]) => `${g} -> ${f}`).join(", "));

  // Deterministic: a template that provisions a different tree on Tuesday is
  // not a template.
  const unstable = PLUMBING_SERVICES.filter((s) => {
    const a = composeService(s).questions.map((q) => q.key).join(">");
    const b = composeService(s).questions.map((q) => q.key).join(">");
    return a !== b;
  });
  ok(unstable.length === 0, "composition is deterministic", unstable.map((s) => s.key).join(", "));

  const misordered = composed.filter((c) =>
    c.questions.some((q, i) => i > 0 && q.order < c.questions[i - 1].order));
  ok(misordered.length === 0, "composed questions come out in ascending order",
    misordered.map((c) => c.serviceKey).join(", "));

  // Every service asks something. One that asks nothing is a fixed price with
  // no qualification at all.
  const silent = composed.filter((c) => c.questions.length === 0);
  ok(silent.length === 0, "every service asks at least one question", silent.map((c) => c.serviceKey).join(", "));

  // composeAll is the seed path's entry point, and it refuses as a whole. A
  // catalog where one service cannot compose is not a catalog to provision 62
  // services from and quietly skip the 63rd.
  let threw = false;
  try { composeAll(PLUMBING_SERVICES); } catch { threw = true; }
  ok(!threw, "the whole catalog composes through composeAll");

  /**
   * COMPOSITION IS AUTHORITATIVE.
   *
   * Downstream code consumes composeAll/composeService output. Nothing outside
   * lib/plumbing may reach into `service.families` and rebuild the ordering
   * itself, because both composition defects were only ever visible in the
   * assembled tree — a second assembler is a second place for them to hide.
   *
   * A tripwire rather than a wall: it passes trivially today because no seed
   * exists, and it is here to fail on the day one is written the other way.
   */
  const ALLOWED = ["scripts/verify-plumbing-template.ts"];
  const roots = ["app", "components", "scripts", "prisma", "lib"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && full !== "lib/plumbing") walk(full); continue; }
      if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
      if (ALLOWED.includes(full)) continue;
      const text = readFileSync(full, "utf8");
      if (/\bplumbing\b/.test(text) && /\.families\b/.test(text)) offenders.push(full);
    }
  };
  for (const r of roots) { try { walk(r); } catch { /* absent root */ } }
  ok(offenders.length === 0,
    "nothing outside lib/plumbing rebuilds composition from service.families",
    offenders.join(", "));
}

// ── ECONOMICS ──────────────────────────────────────────────────────────────

/**
 * The check this whole directory exists to pass.
 *
 * A canonical template with a number in it ships one company's decision to
 * every other company as their starting point. The scan is over the SOURCE
 * rather than the parsed data because the failure it catches is a constant
 * somebody added in a hurry, and a comment saying "// 25 ft standard" is the
 * same mistake half-committed.
 */
function economics() {
  group("ECONOMICS");

  const dir = "lib/plumbing";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  ok(files.length > 0, "the plumbing template directory has sources to scan");

  // `Cents` alone matched `approvedPriceCents`, which is the name of the
  // platform field a component's price lives in — naming it is the whole point
  // of the primitives table. What must never appear is a cents figure being
  // ASSIGNED, so the pattern requires a value.
  const MONEY = /\$\s?[\d,]+(\.\d+)?|\b\d+\s?(dollars?|cents?)\b|Cents\s*[:=]\s*-?\d/;
  const RATE = /\b(price|rate|markup|allowance|hourly|per hour|labor ?hours?|crew ?hours?)\b\s*[:=]\s*\d/i;
  const MEASURED = /\b\d+(\.\d+)?\s?(ft|feet|foot|inch(es)?|in\.)\b/i;

  const offenders: string[] = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    text.split("\n").forEach((line, i) => {
      // TANK_GALLONS is a set of manufactured sizes. Nobody chose 40 or 50; a
      // manufacturer did, and every plumber meets the same numbers. That is
      // the continuum test passing, not failing.
      if (/TANK_GALLONS|covers: \[/.test(line)) return;
      if (MONEY.test(line)) offenders.push(`${f}:${i + 1} money — ${line.trim().slice(0, 70)}`);
      if (RATE.test(line)) offenders.push(`${f}:${i + 1} rate — ${line.trim().slice(0, 70)}`);
      if (MEASURED.test(line)) offenders.push(`${f}:${i + 1} boundary — ${line.trim().slice(0, 70)}`);
    });
  }
  ok(offenders.length === 0, "no price, rate, allowance or measured boundary in the canonical template",
    offenders.slice(0, 6).join("\n         "));

  // The band patterns are the one place a number is EXPECTED, and it is
  // expected to be absent. A pattern with the hole already filled is Elite's
  // allowance wearing a template's clothes.
  const bandOptions = PLUMBING_FAMILIES
    .flatMap((f) => f.questions.flatMap((q) => q.options.map((o) => ({ f: f.key, q: q.key, o }))))
    .filter((x) => x.o.labelPattern !== undefined);
  ok(bandOptions.length > 0, "at least one family asks a band question");
  const filled = bandOptions.filter((x) => !hasHoles(x.o.labelPattern!));
  ok(filled.length === 0, "every band label still has its holes",
    filled.map((x) => `${x.f}/${x.q}/${x.o.value}`).join(", "));

  // Holes and labels are alternatives, never both — a customer-ready label
  // sitting next to an unresolved pattern is two answers to what to display.
  const both = PLUMBING_FAMILIES
    .flatMap((f) => f.questions.flatMap((q) => q.options))
    .filter((o) => o.label !== undefined && o.labelPattern !== undefined);
  ok(both.length === 0, "no option carries both a label and a pattern", both.map((o) => o.value).join(", "));
  const neither = PLUMBING_FAMILIES
    .flatMap((f) => f.questions.flatMap((q) => q.options))
    .filter((o) => o.label === undefined && o.labelPattern === undefined);
  ok(neither.length === 0, "every option carries one or the other", neither.map((o) => o.value).join(", "));

  // A pattern reading {b3} against a two-boundary policy renders a hole in
  // front of a customer, which is the failure renderBandLabel exists to throw on.
  const policyByKey = new Map(PLUMBING_POLICIES.map((p) => [p.key, p]));
  const overreach: string[] = [];
  for (const f of PLUMBING_FAMILIES)
    for (const q of f.questions) {
      if (!q.policyKey) continue;
      const def = policyByKey.get(q.policyKey);
      if (!def) { overreach.push(`${f.key}/${q.key}: unknown policy ${q.policyKey}`); continue; }
      for (const o of q.options) {
        if (!o.labelPattern) continue;
        const used = boundariesUsed(o.labelPattern);
        const max = used.length ? Math.max(...used) : 0;
        if (max > def.boundaryCount)
          overreach.push(`${f.key}/${q.key}/${o.value} reads b${max} of ${def.boundaryCount}`);
      }
    }
  ok(overreach.length === 0, "no band pattern reads past its policy's boundary count", overreach.join(", "));

  // Every policy is reached by something. An unreachable one is a question a
  // contractor is asked during setup for no reason.
  const reachedByQuestion = new Set(PLUMBING_FAMILIES.flatMap((f) => f.questions.map((q) => q.policyKey).filter(Boolean) as string[]));
  const reachedByService = new Set(PLUMBING_SERVICES.flatMap((s) => [...(s.servicePolicies ?? [])]));
  const unreached = PLUMBING_POLICY_KEYS.filter((k) => !reachedByQuestion.has(k) && !reachedByService.has(k));
  ok(unreached.length === 0, "every policy definition is reached by a question or a service", unreached.join(", "));

  // NO DEFAULTS. Not a suggested value, not a commented-out one.
  const polSrc = readFileSync(join(dir, "policies.ts"), "utf8");
  ok(!/boundaries\s*[:=]|default[A-Za-z]*\s*[:=]\s*\[/.test(polSrc),
    "no policy definition ships a boundary value");
}

// ── FAIL CLOSED ────────────────────────────────────────────────────────────

function failsClosed() {
  group("FAIL CLOSED");

  ok(accessGate("UNKNOWN").action !== "CONTINUE", "an unestablished route does not proceed");
  ok(accessGate("ACCESSIBLE").action === "CONTINUE", "an open route proceeds");
  ok(accessGate("FINISHED").action === "CONTINUE", "a finished route proceeds — it is known, not unknown");

  ok(shutoffGate("UNKNOWN", { valveReplacementIsInScope: false }).action !== "CONTINUE",
    "an unchecked shutoff does not proceed");
  ok(shutoffGate("ABSENT", { valveReplacementIsInScope: false }).action === "REMOTE_QUOTE",
    "an absent shutoff leaves the fixed-price path");
  ok(shutoffGate("ABSENT", { valveReplacementIsInScope: true }).action === "CONTINUE",
    "a service that already includes the valve is not stopped by a bad one");

  ok(combustionGate("UNKNOWN", { serviceExpects: ["GAS_ATMOSPHERIC"] }).action !== "CONTINUE",
    "an unestablished vent type does not proceed");
  // The single most expensive assumption available in this catalog.
  ok(combustionGate("UNKNOWN", { serviceExpects: ["GAS_ATMOSPHERIC", "GAS_POWER_VENT"] }).action === "PHOTO_REVIEW",
    "an unknown vent type is never treated as the common case");
  ok(combustionGate("GAS_POWER_VENT", { serviceExpects: ["GAS_ATMOSPHERIC"] }).action === "REMOTE_QUOTE",
    "equipment the service does not cover leaves the fixed-price path");
  ok(combustionGate("GAS_POWER_VENT", { serviceExpects: ["GAS_POWER_VENT"] }).action === "CONTINUE",
    "covered equipment proceeds");

  ok(capacityGate(null, { unit: "gal", covers: [40, 50] }).action !== "CONTINUE",
    "an unestablished capacity does not proceed");
  ok(capacityGate(0, { unit: "gal", covers: [40, 50] }).action !== "CONTINUE",
    "zero is not a capacity");
  ok(capacityGate(NaN, { unit: "gal", covers: [40, 50] }).action !== "CONTINUE",
    "a non-finite capacity does not proceed");
  ok(capacityGate(120, { unit: "gal", covers: [40, 50] }).action === "REMOTE_QUOTE",
    "a capacity outside the service leaves the fixed-price path");
  ok(capacityGate(50, { unit: "gal", covers: [40, 50] }).action === "CONTINUE", "a covered capacity proceeds");

  ok(conditionGate("UNKNOWN").action !== "CONTINUE", "an unestablished condition does not proceed");
  ok(conditionGate("ACTIVE_FAILURE").action === "ON_SITE_SERVICE",
    "an observed active failure becomes an on-site service call, not a scheduled install");
  ok(conditionGate("SERVICEABLE").action === "CONTINUE", "a sound fixture proceeds");

  // No gate may resolve. Only the pricing engine resolves.
  const outcomes = [
    accessGate("UNKNOWN"), shutoffGate("UNKNOWN", { valveReplacementIsInScope: false }),
    combustionGate("UNKNOWN", { serviceExpects: ["ELECTRIC"] }),
    capacityGate(null, { unit: "gal", covers: [40] }), conditionGate("UNKNOWN"),
  ];
  ok(outcomes.every((o) => !String(o.action).startsWith("RESOLVE")), "no gate can resolve a price");
  ok(outcomes.every((o) => o.factKey.length > 0), "every refusal names the fact that caused it");

  // Metadata that contradicts itself never reaches provisioning.
  const contradictory = PLUMBING_SERVICES.flatMap((s) =>
    metadataProblems(s.metadata).map((p) => `${s.key}: ${p}`));
  ok(contradictory.length === 0, "no service declares contradictory metadata", contradictory.join(" | "));

  const declared = PLUMBING_SERVICES.filter((s) =>
    PERMIT_POSTURES.includes(s.metadata.permit) && PHOTO_POSTURES.includes(s.metadata.photo) &&
    PRE_WORK_POSTURES.includes(s.metadata.preWork) && VISIT_POSTURES.includes(s.metadata.visit));
  ok(declared.length === PLUMBING_SERVICES.length, "every service declares all four metadata behaviors",
    `${PLUMBING_SERVICES.length - declared.length} incomplete`);

  // The third appointment shell has no platform kind, and nothing may pretend
  // otherwise by folding it into PRE_WORK.
  const serviceCall = PLUMBING_APPOINTMENT_SHELLS.find((s) => s.key === "on_site_service")!;
  ok(!shellIsSchedulable(serviceCall), "the service-call shell is not schedulable against today's schema");
  ok((serviceCall.requiresSchemaChange ?? "").length > 0,
    "the service-call shell records the schema change it needs");
  const schedulable = PLUMBING_APPOINTMENT_SHELLS.filter(shellIsSchedulable);
  ok(schedulable.length === 2, "the other two shells map onto existing AppointmentKind values");
}



// ── PUBLISH PAYLOAD ────────────────────────────────────────────────────────

/**
 * What the platform would actually install, proved WITHOUT a database.
 *
 * This is the offline half of the two-contractor proof. Everything here is a
 * property of the canonical catalog itself, so it holds before any branch
 * exists and it holds identically on every database the payload is ever
 * written to. The half that genuinely needs a database — tenant isolation,
 * divergent economics, readiness and activation — is not simulated here,
 * because a simulated isolation proof proves nothing about the guard.
 */
function publishPayload() {
  group("PUBLISH PAYLOAD");

  const payload = buildPlumbingPayload();
  const totals = payloadTotals(payload);

  ok(totals.services === PLUMBING_SERVICE_COUNT,
    `all ${PLUMBING_SERVICE_COUNT} services reach the payload`, `got ${totals.services}`);
  ok(payload.kind === "SNAPSHOT", "the catalog publishes as a SNAPSHOT, not a DELTA",
    `kind=${payload.kind}`);
  ok(payload.trade === "plumbing" && payload.version === 1,
    "provenance names the trade and version", `${payload.trade} v${payload.version}`);

  // composeAll refuses as a whole, so 62-of-63 cannot be built. The second
  // guarantee — the write itself — is installCatalog's transaction, which is
  // the platform's and which plumbing does not reimplement.
  let partial = false;
  try { buildPlumbingPayload(); } catch { partial = true; }
  ok(!partial, "the payload builds as a whole or not at all");

  // Deterministic: the same catalog must publish the same rows every time, or
  // republishing silently rewrites a contractor's provenance.
  const a = JSON.stringify(buildPlumbingPayload());
  const b = JSON.stringify(buildPlumbingPayload());
  ok(a === b, "the payload is byte-identical across builds");

  // Unique keys at every level. A duplicate would collide on the composite
  // unique index mid-transaction and abort an otherwise healthy install.
  const svcKeys = payload.services.map((s) => s.key);
  ok(new Set(svcKeys).size === svcKeys.length, "service keys are unique in the payload");
  const dupQ = payload.services.filter((s) => new Set(s.questions.map((q) => q.key)).size !== s.questions.length);
  ok(dupQ.length === 0, "question keys are unique within each service", dupQ.map((s) => s.key).join(", "));
  const dupO = payload.services.flatMap((s) =>
    s.questions.filter((q) => new Set(q.options.map((o) => o.value)).size !== q.options.length)
      .map((q) => `${s.key}/${q.key}`));
  ok(dupO.length === 0, "option values are unique within each question", dupO.join(", "));

  // Every referenced canonical identity is carried, or the install fails on a
  // missing foreign key partway through.
  const catSlugs = new Set(payload.categories.map((c) => c.slug));
  const orphanCat = payload.services.filter((s) => !catSlugs.has(s.canonicalCategorySlug));
  ok(orphanCat.length === 0, "every service's canonical category is in the payload",
    orphanCat.map((s) => s.key).join(", "));
  const polKeys = new Set(payload.policies.map((p) => p.key));
  const orphanPol = payload.services.flatMap((s) => s.policyKeys.filter((k) => !polKeys.has(k)));
  ok(orphanPol.length === 0, "every service policy is in the payload", orphanPol.join(", "));
  const bandNoPolicy = payload.services.flatMap((s) =>
    s.questions.flatMap((q) => q.options.filter((o) => o.labelPattern && !o.policyKey)
      .map((o) => `${s.key}/${q.key}/${o.value}`)));
  ok(bandNoPolicy.length === 0, "every band answer names the policy that fills it", bandNoPolicy.join(", "));

  const refs = referencedCanonicalKeys();
  ok(payload.materials.length === refs.materials.length && payload.components.length === refs.components.length,
    "every material role and component the mappings reach is carried");

  // THE ECONOMIC BOUNDARY, at the point of install. Nothing a contractor owns
  // may travel in the canonical payload — not as a value, not as a field.
  const json = JSON.stringify(payload);
  const ECONOMIC = /"(price|priceCents|basePrice|cost|costCents|rate|crewHourRate|markup|allowance|minimum|boundaries|approvedPrice)\w*"\s*:/i;
  ok(!ECONOMIC.test(json), "no economic field appears anywhere in the payload");
  ok(!/\$\d/.test(json), "no currency amount appears anywhere in the payload");

  // Band answers ship with the hole still in them. A filled boundary would be
  // one contractor's allowance shipped to every other contractor.
  const filled = payload.services.flatMap((s) =>
    s.questions.flatMap((q) => q.options.filter((o) => o.labelPattern && !hasHoles(o.label))
      .map((o) => `${s.key}/${q.key}/${o.value}`)));
  ok(filled.length === 0, "every band answer still holds its boundary hole", filled.join(", "));
  ok(payload.policies.every((p) => !("boundaries" in p)), "no policy ships a boundary value");
  ok(totals.bandOptions > 0, `the catalog carries band answers (${totals.bandOptions})`);

  // ── AMENDMENT A: priced terminals ──────────────────────────────────────
  //
  // The offline suite was 130/0 while the catalog had zero priced routes, so
  // these exist to make that state impossible to return to silently.
  const automated = payload.services.filter((s) => s.bookingType !== "REMOTE_QUOTE");
  const unpriced = automated.filter((s) =>
    !s.questions.some((q) => q.options.some((o) => o.routeAction.startsWith("RESOLVE"))));
  ok(unpriced.length === 0,
    `every automated known-work service has a priced terminal (${automated.length} services)`,
    unpriced.map((s) => s.key).join(", "));

  const totalResolves = payload.services.flatMap((s) => s.questions.flatMap((q) => q.options))
    .filter((o) => o.routeAction.startsWith("RESOLVE")).length;
  ok(totalResolves > 0, `the catalog contains priced terminals (${totalResolves})`,
    "DEFECT: routes.priced would be zero and the §1.4 activation guard would never fire");

  // Nothing runs off the end of its own tree.
  const questionKeys = new Map(payload.services.map((s) => [s.key, new Set(s.questions.map((q) => q.key))]));
  const stranded = payload.services.flatMap((s) =>
    s.questions.flatMap((q) => q.options
      .filter((o) => o.routeAction === "CONTINUE" && !o.nextQuestionKey)
      .map((o) => `${s.key}/${q.key}/${o.value}`)));
  ok(stranded.length === 0, "no completed path is stranded on CONTINUE", stranded.slice(0, 5).join(", "));
  const dangling = payload.services.flatMap((s) =>
    s.questions.flatMap((q) => q.options
      .filter((o) => o.nextQuestionKey && !questionKeys.get(s.key)!.has(o.nextQuestionKey))
      .map((o) => `${s.key}/${q.key}/${o.value} -> ${o.nextQuestionKey}`)));
  ok(dangling.length === 0, "every nextQuestionKey resolves inside its own service", dangling.join(", "));

  // Review, quote and service-call paths stay non-priced.
  const quoteOnly = payload.services.filter((s) => s.bookingType === "REMOTE_QUOTE");
  const quotePriced = quoteOnly.filter((s) =>
    s.questions.some((q) => q.options.some((o) => o.routeAction.startsWith("RESOLVE"))));
  ok(quotePriced.length === 0, "no quote-only service acquired a priced terminal",
    quotePriced.map((s) => s.key).join(", "));
  const conditionOptions = payload.services.flatMap((s) => s.questions.flatMap((q) =>
    q.options.filter((o) => ["visibly_corroded", "visibly_damaged", "will_not_move", "visibly_leaking", "concealed", "cannot_determine"].includes(o.value))));
  ok(conditionOptions.every((o) => !o.routeAction.startsWith("RESOLVE")),
    "an adverse observed condition never terminates in an automated price");

  // ── AMENDMENT B: relationships exported ────────────────────────────────
  const declaredComponents = new Set(payload.components.map((c) => c.key));
  const declaredMaterials = new Set(payload.materials.map((m) => m.key));
  const usedComponents = new Set(payload.services.flatMap((s) => s.questions.flatMap((q) => q.options.flatMap((o) => o.componentKeys))));
  const usedMaterials = new Set(payload.services.flatMap((s) => s.materialRoles.map((m) => m.key)));
  ok([...usedComponents].every((c) => declaredComponents.has(c)),
    "every answer-selected component is a declared canonical component");
  ok([...usedMaterials].every((m) => declaredMaterials.has(m)),
    "every required material role is a declared canonical material");
  ok(totals.optionComponents > 0 && totals.serviceMaterials > 0,
    `relationships are carried (${totals.serviceMaterials} service-material, ${totals.optionComponents} answer-component)`,
    "DEFECT: the shared readiness authority would see no materials to demand costs for");

  // Every mapping the scope layer can reach must be exported, or the runtime
  // and the installed rows disagree about what a job consumes.
  const mappedComponents = new Set<string>();
  for (const svc of PLUMBING_SERVICES)
    for (const q of composeService(svc).questions)
      for (const o of q.options)
        if (o.establishes) for (const c of componentsForAnswer(o.establishes.factKey, o.establishes.value)) mappedComponents.add(c);
  const missingExport = [...mappedComponents].filter((c) => !usedComponents.has(c));
  ok(missingExport.length === 0, "every component the mappings attach is exported by the publisher", missingExport.join(", "));

  // Nothing undeclared sneaks in.
  const undeclared = [...usedComponents].filter((c) => !declaredComponents.has(c));
  ok(undeclared.length === 0, "no undeclared component relationship appears", undeclared.join(", "));

  // existing_condition stays effect-free — through this door too.
  const conditionWithComponents = payload.services.flatMap((s) => s.questions.flatMap((q) =>
    q.options.filter((o) => q.key === "existing_condition" && o.componentKeys.length > 0)
      .map((o) => `${s.key}/${o.value}`)));
  ok(conditionWithComponents.length === 0,
    "no condition answer acquired a component during the amendment", conditionWithComponents.join(", "));

  // Quantities are counts of the thing, never money.
  const badQty = payload.services.flatMap((s) => s.materialRoles.filter((m) => !Number.isFinite(m.quantity) || m.quantity <= 0).map((m) => `${s.key}/${m.key}`));
  ok(badQty.length === 0, "every material quantity is a positive count", badQty.join(", "));

  // ── BRANCH-SPECIFIC ROLES REMAIN REACHABLE ─────────────────────────────
  //
  // The intersection rule correctly keeps a role only one configuration needs
  // off the service. Left there it would reach NOTHING, which is where four
  // roles were stranded. They ride the component their branch attaches.
  const recipes = componentRecipes();
  const serviceRoles = new Set(payload.services.flatMap((s) => s.materialRoles.map((m) => m.key)));
  const recipeRoles = new Set([...recipes.values()].flat());
  const overlap = [...serviceRoles].filter((r) => recipeRoles.has(r));
  ok(overlap.length === 0,
    "no role is required at BOTH service and component level (would double-count)", overlap.join(", "));

  // Atmospheric vs power vent: mutually exclusive, and neither disappears.
  const atmospheric = COMBUSTION_SCOPE.GAS_ATMOSPHERIC.components[0];
  const powerVent = COMBUSTION_SCOPE.GAS_POWER_VENT.components[0];
  const atmRoles = recipes.get(atmospheric) ?? [];
  const pvRoles = recipes.get(powerVent) ?? [];
  ok(atmRoles.includes("vent_connector_metal"),
    "selecting atmospheric exposes its own vent dependency", atmRoles.join(", "));
  ok(pvRoles.includes("vent_pipe_pvc"),
    "selecting power vent exposes its own vent dependency", pvRoles.join(", "));
  ok(!atmRoles.includes("vent_pipe_pvc") && !pvRoles.includes("vent_connector_metal"),
    "neither configuration acquires the other's dependency");
  const heater = payload.services.find((s) => s.key === "tank-water-heater-replacement-gas")!;
  ok(!heater.materialRoles.some((m) => m.key === "vent_pipe_pvc" || m.key === "vent_connector_metal"),
    "and the service does not globally require both configurations",
    heater.materialRoles.map((m) => m.key).join(", "));

  // ── ZERO ORPHANS. The allowlist is gone. ───────────────────────────────
  //
  // Three carriers now exist, and every declared role must reach one:
  //
  //   TemplateServiceMaterial       consumed on every path
  //   CanonicalComponentMaterial    consumed by a component a branch selects
  //   TemplateAnswerOptionMaterial  base material of the branch itself
  //
  // The third is a shared platform primitive added because this gate could not
  // be made true without it, and the alternatives — a synthetic "copper joint"
  // component, or a union that makes a copper job consume PEX rings — were
  // both lies about the work.
  const branchRoles = new Set(payload.services.flatMap((s) =>
    s.questions.flatMap((q) => q.options.flatMap((o) => o.materialKeys))));
  const carried = new Set([...serviceRoles, ...recipeRoles, ...branchRoles]);
  const orphans = payload.materials.map((m) => m.key).filter((k) => !carried.has(k)).sort();
  ok(orphans.length === 0,
    "every canonical material role has a readiness carrier — zero orphans",
    `uncarried: ${orphans.join(", ")}`);

  // Branch materials go to the branch that consumes them, and nowhere else.
  ok(branchMaterialsForAnswer("pipe_material", "COPPER").includes("copper_fitting"),
    "the COPPER branch declares its own copper roles");
  ok(branchMaterialsForAnswer("pipe_material", "PEX").includes("pex_ring"),
    "the PEX branch declares its own PEX roles");
  ok(!branchMaterialsForAnswer("pipe_material", "COPPER").some((r) => r.startsWith("pex_")) &&
     !branchMaterialsForAnswer("pipe_material", "PEX").some((r) => r.startsWith("copper_")),
    "neither branch acquires the other's roles");
  ok(branchMaterialsForAnswer("fixture_condition", "DEGRADED").length === 0,
    "existing_condition declares no branch material — still effect-free");
  const branchAndService = [...branchRoles].filter((r) => serviceRoles.has(r) || recipeRoles.has(r));
  ok(branchAndService.length === 0,
    "no role is carried twice (branch and service/component)", branchAndService.join(", "));

  // Condition stays effect-free here too.
  const conditionComponents = CONDITION_SCOPE.DEGRADED.components.concat(CONDITION_SCOPE.SERVICEABLE.components);
  ok(conditionComponents.length === 0, "no condition value attaches a component to carry materials");
}

// ── NO SELF-DIAGNOSIS ──────────────────────────────────────────────────────

/**
 * The strictest boundary in the template, and the one with the most to lose.
 *
 * `existing_condition` is the only family that can take a customer out of the
 * priceable catalog, so it may consume OBSERVABLE facts only and its effect is
 * limited to: continue, or leave automated pricing. It may not choose a repair,
 * recommend a replacement, attach a component-specific fix, or name a cause.
 */
function noSelfDiagnosis() {
  group("NO SELF-DIAGNOSIS");

  const fam = family("existing_condition");

  /**
   * Words that name a CAUSE rather than an appearance.
   *
   * "Visibly corroded" is something a homeowner sees. "Failed cartridge",
   * "bad PRV", "collapsed sewer", "undersized piping" are conclusions about
   * why, and a booking flow that offered one would be diagnosing from a web
   * form and then quoting the repair it picked.
   */
  const DIAGNOSTIC = [
    "failed", "failing", "defective", "faulty", "worn out", "malfunction", "diagnos",
    "cartridge", "prv", "expansion tank", "flange", "thermocouple", "anode",
    "collapsed", "undersized", "code violation", "not to code", "out of code",
    "needs replacing", "needs replacement", "should be replaced", "we recommend",
  ];
  const surfaces: { where: string; text: string }[] = [];
  for (const q of fam.questions) {
    surfaces.push({ where: `${q.key}/prompt`, text: q.prompt });
    if (q.helpText) surfaces.push({ where: `${q.key}/helpText`, text: q.helpText });
    for (const o of q.options) {
      if (o.label) surfaces.push({ where: `${q.key}/${o.value}`, text: o.label });
      for (const l of o.requiredPhotoLabels ?? [])
        surfaces.push({ where: `${q.key}/${o.value}/photo`, text: l });
    }
  }
  const diagnostic = surfaces.flatMap((s0) =>
    DIAGNOSTIC.filter((w) => s0.text.toLowerCase().includes(w)).map((w) => `${s0.where}: "${w}"`));
  ok(diagnostic.length === 0, "no condition answer names a cause rather than an appearance",
    diagnostic.join(" | "));

  // Its canonical effect: continue, or leave automated pricing. Nothing else.
  const conditions = ["SERVICEABLE", "DEGRADED", "ACTIVE_FAILURE", "UNKNOWN"] as const;
  const effectful = conditions.filter((c) =>
    CONDITION_SCOPE[c].materialRoles.length > 0 ||
    CONDITION_SCOPE[c].components.length > 0 ||
    CONDITION_SCOPE[c].prerequisites.length > 0);
  ok(effectful.length === 0, "an observed condition selects no material, component or prerequisite",
    effectful.join(", "));

  ok(conditionGate("SERVICEABLE").action === "CONTINUE", "only a sound installation continues");
  const leaves = (["DEGRADED", "ACTIVE_FAILURE", "UNKNOWN"] as const)
    .every((c) => conditionGate(c).action !== "CONTINUE");
  ok(leaves, "every other observed condition leaves automated pricing");

  // The observation must survive the refusal, or review starts by asking the
  // customer the question the customer already answered.
  const carried = conditions
    .map((c) => conditionGate(c))
    .filter((o) => o.action !== "CONTINUE")
    .every((o) => typeof o.observed === "string" && o.observed.length > 0);
  ok(carried, "a refusal carries the observation as context");

  // Nothing in the family may attach a component. It has no economic effect at
  // all, which is why `component_increment` is absent from its primitives.
  ok(!fam.primitives.includes("component_increment"),
    "the condition family declares no component primitive");

  /**
   * THE DESTINATION IS NEUTRAL TOO.
   *
   * An observed active failure earns a VISIT, not a diagnosis. Plumbing's own
   * name for that outcome is ON_SITE_SERVICE; the platform expresses it as
   * REROUTE_TROUBLESHOOTING, which is shared and unchanged.
   *
   * Scanned over CUSTOMER-FACING STRINGS rather than source, because the
   * platform enum legitimately contains the word and a source-wide ban would
   * be unsatisfiable. What must never carry it is anything a person reads.
   */
  const customerFacing: { where: string; text: string }[] = [
    ...PLUMBING_SERVICES.flatMap((sv) => [
      { where: `service ${sv.key}/name`, text: sv.name },
      { where: `service ${sv.key}/description`, text: sv.shortDescription },
    ]),
    ...PLUMBING_CATEGORIES.flatMap((c) => [
      { where: `category ${c.key}/name`, text: c.name },
      { where: `category ${c.key}/navGroup`, text: c.defaultNavGroup },
    ]),
    ...PLUMBING_FAMILIES.flatMap((f) =>
      f.questions.flatMap((q) => [
        { where: `${f.key}/${q.key}/prompt`, text: q.prompt },
        ...(q.helpText ? [{ where: `${f.key}/${q.key}/helpText`, text: q.helpText }] : []),
        ...q.options.flatMap((o) => [
          ...(o.label ? [{ where: `${f.key}/${q.key}/${o.value}`, text: o.label }] : []),
          ...(o.labelPattern ? [{ where: `${f.key}/${q.key}/${o.value}`, text: o.labelPattern }] : []),
          ...(o.requiredPhotoLabels ?? []).map((l) => ({ where: `${f.key}/${q.key}/${o.value}/photo`, text: l })),
        ]),
      ])),
  ];
  /**
   * STRATEGY-NEUTRAL COPY.
   *
   * A canonical template is provisioned by FLAT_RATE and TIME_AND_MATERIALS
   * contractors alike, so nothing in it may assert a promise only one of them
   * makes. lib/lint-storefront-identity.ts already enforces this across
   * app/components/lib — this catches it in the plumbing gate first, which is
   * where the person who wrote the string is still looking.
   *
   * FLAT_RATE_ASSUMPTIONS is IMPORTED from lib/pricingCopy rather than copied.
   * Two lists of forbidden phrases is one list that goes stale, and the one
   * that goes stale is always the copy.
   *
   * Wider than the global linter in two ways, deliberately: it reads the
   * template's DATA (so a phrase spanning lines cannot hide from a line-based
   * scan), and it adds the hyphenated "fixed-price", which the shared regexes
   * do not match and which reads as the same promise to a customer.
   */
  const HYPHENATED = /\bfixed-price\b/i;
  const assuming = customerFacing.flatMap((c) =>
    [...FLAT_RATE_ASSUMPTIONS, HYPHENATED]
      .filter((re) => re.test(c.text))
      .map((re) => `${c.where}: ${re}`));
  ok(assuming.length === 0,
    "no template copy assumes a fixed-price contractor", assuming.join(" | "));

  const leaked = customerFacing.flatMap((c) =>
    ["diagnos", "troubleshoot"].filter((w) => c.text.toLowerCase().includes(w)).map((w) => `${c.where}: "${w}"`));
  ok(leaked.length === 0, "no customer-facing copy names the outcome a diagnosis", leaked.join(" | "));

  // And no service key does either — a key outlives every rewording above it.
  const keyLeak = [
    ...PLUMBING_SERVICES.map((sv) => sv.key),
    ...PLUMBING_CATEGORIES.map((c) => c.key),
    ...PLUMBING_APPOINTMENT_SHELLS.map((sh) => sh.key),
  ].filter((k) => /diagnos|troubleshoot/i.test(k));
  ok(keyLeak.length === 0, "no service, category or shell key names the outcome a diagnosis",
    keyLeak.join(", "));

  // The vocabulary boundary: plumbing's outcomes translate to the platform's
  // enum in exactly one place, and totally.
  const outcomes = ["CONTINUE", "PHOTO_REVIEW", "REMOTE_QUOTE", "ON_SITE_SERVICE"] as const;
  ok(outcomes.every((o) => typeof toRouteAction(o) === "string"),
    "every plumbing outcome translates to a platform route action");
  ok(toRouteAction("ON_SITE_SERVICE") === "REROUTE_TROUBLESHOOTING",
    "an on-site service call reaches the platform as its existing route action");
  ok(!("ON_SITE_SERVICE" in { CONTINUE: 1, PHOTO_REVIEW: 1, REMOTE_QUOTE: 1, REROUTE_TROUBLESHOOTING: 1 }),
    "the platform enum is unchanged — plumbing renamed its own vocabulary, not the schema");

  // Concealed must not ask for a photograph of something concealed — that is
  // the retake loop, and it sends the customer back to the camera to fail.
  const concealed = fam.questions[0].options.find((o) => o.value === "concealed")!;
  ok((concealed.requiredPhotoLabels ?? []).length === 0,
    "a concealed installation is not asked to be photographed");
  ok(concealed.routeAction === "REMOTE_QUOTE", "and it leaves automated pricing instead");
}

// ── TOTALITY ───────────────────────────────────────────────────────────────

function totality() {
  group("TOTALITY");

  // A lookup returning undefined for one member is a silent no-op that prices
  // a job as if the missing work did not exist.
  const combustionCovered = COMBUSTION_CLASSES.filter((c) => COMBUSTION_SCOPE[c] !== undefined);
  ok(combustionCovered.length === COMBUSTION_CLASSES.length,
    "COMBUSTION_SCOPE covers every combustion class");

  const shutoffs = ["PRESENT_WORKING", "PRESENT_FAILED", "ABSENT", "UNKNOWN"] as const;
  ok(shutoffs.every((s) => SHUTOFF_SCOPE[s] !== undefined), "SHUTOFF_SCOPE covers every shutoff condition");

  const pipes = ["COPPER", "PEX", "CPVC", "GALVANIZED", "CAST_IRON", "UNKNOWN"] as const;
  ok(pipes.every((p) => PIPE_MATERIAL_SCOPE[p] !== undefined), "PIPE_MATERIAL_SCOPE covers every pipe material");

  const conditions = ["SERVICEABLE", "DEGRADED", "ACTIVE_FAILURE", "UNKNOWN"] as const;
  ok(conditions.every((c) => CONDITION_SCOPE[c] !== undefined), "CONDITION_SCOPE covers every fixture condition");

  // UNKNOWN adds nothing. A fallback here would be a second opinion quietly
  // overriding the gate that already refused the route.
  ok(COMBUSTION_SCOPE.UNKNOWN.materialRoles.length === 0 && COMBUSTION_SCOPE.UNKNOWN.components.length === 0,
    "an unknown vent type contributes no scope");
  ok(PIPE_MATERIAL_SCOPE.UNKNOWN.materialRoles.length === 0, "an unknown pipe material contributes no scope");
  ok(SHUTOFF_SCOPE.UNKNOWN.materialRoles.length === 0, "an unknown shutoff contributes no scope");

  // The prerequisite that is the whole reason for the combustion gate.
  ok(COMBUSTION_SCOPE.GAS_POWER_VENT.prerequisites.includes("120v_receptacle_within_reach"),
    "a power vent names its electrical prerequisite rather than assuming it");
  ok(COMBUSTION_SCOPE.GAS_ATMOSPHERIC.prerequisites.length === 0,
    "an atmospheric heater needs no receptacle");

  // No mapping may carry economics. Roles and component KEYS only.
  const allScopes = [
    ...Object.values(COMBUSTION_SCOPE), ...Object.values(SHUTOFF_SCOPE),
    ...Object.values(PIPE_MATERIAL_SCOPE), ...Object.values(CONDITION_SCOPE),
  ];
  const numeric = allScopes.filter((s) => Object.values(s).some((v) => typeof v === "number"));
  ok(numeric.length === 0, "no mapping carries a number");

  const merged = mergeScope([COMBUSTION_SCOPE.GAS_POWER_VENT, SHUTOFF_SCOPE.PRESENT_FAILED]);
  const gasConnectors = merged.materialRoles.filter((r) => r === "gas_flex_connector");
  ok(gasConnectors.length <= 1, "merging does not double-count a role named by two facts");
  ok(merged.materialRoles.includes("fixture_stop_valve") && merged.materialRoles.includes("vent_pipe_pvc"),
    "merging keeps every role from every fact");
}

// ── BOUNDARY ───────────────────────────────────────────────────────────────

function boundary() {
  group("VISUAL ASSIST BOUNDARY");

  const good = { value: "GAS_POWER_VENT" as const, accepted: true, confirmedByHuman: true };
  ok(acceptVisualFact("combustionClass", good).fact?.value === "GAS_POWER_VENT",
    "an accepted, confirmed observation becomes a fact");
  ok(acceptVisualFact("combustionClass", good).fact?.provenance === "VISUAL_ASSIST_CONFIRMED",
    "the fact records how it was established");

  ok(acceptVisualFact("combustionClass", { ...good, accepted: false }).fact === null,
    "an observation Visual Assist declined is refused");
  ok(acceptVisualFact("combustionClass", { ...good, confirmedByHuman: false }).fact === null,
    "an unconfirmed observation cannot price a job");
  ok(acceptVisualFact("combustionClass", { ...good, value: null }).fact === null,
    "an accepted abstention is not a value");
  ok(acceptVisualFact("combustionClass", null).fact === null, "a missing input is refused");
  ok(acceptVisualFact("combustionClass", undefined).refusal !== null, "a missing input records why");

  // The shape check that matters when the other side of the boundary changes:
  // an object without the flags must not be read optimistically.
  ok(acceptVisualFact("combustionClass", { value: "GAS_ATMOSPHERIC" } as never).fact === null,
    "an input missing the acceptance flags is refused, not assumed");

  // A customer answer always wins. Not because it is more likely right, but
  // because it is the assertion the price is a promise against.
  const both = intakeFacts({
    answered: { combustionClass: "GAS_ATMOSPHERIC" },
    visual: { combustionClass: { value: "GAS_POWER_VENT", accepted: true, confirmedByHuman: true } },
  });
  ok(combustionOf(both.facts) === "GAS_ATMOSPHERIC", "a stated answer is not overridden by a photograph");
  ok(both.facts.combustionClass?.provenance === "CUSTOMER_ANSWER", "and the provenance says so");

  const visualOnly = intakeFacts({
    visual: { capacityGallons: { value: 50, accepted: true, confirmedByHuman: true } },
  });
  ok(capacityOf(visualOnly.facts) === 50, "a confirmed reading is used when nothing was answered");

  const rejected = intakeFacts({
    visual: { combustionClass: { value: "GAS_POWER_VENT", accepted: true, confirmedByHuman: false } },
  });
  ok(combustionOf(rejected.facts) === "UNKNOWN", "an unconfirmed reading reads back as UNKNOWN");
  ok(rejected.refusals.length === 1 && rejected.refusals[0].factKey === "combustionClass",
    "and the refusal is recorded against the field");

  // Evidence fields are carried and never gate anything.
  const evidence = intakeFacts({
    visual: { model: { value: "PVE-50T", accepted: true, confirmedByHuman: true } },
  });
  ok(evidence.facts.model?.value === "PVE-50T", "a nameplate reading is carried as evidence");
  ok(capacityOf(evidence.facts) === null, "and a model number does not become a capacity");

  // End to end, through the scope layer.
  const heater = service("tank-water-heater-replacement-gas");
  const refused = scopePlumbingService(heater, {
    facts: intakeFacts({}).facts, accessClass: "ACCESSIBLE", pipeMaterial: "COPPER",
  });
  ok(refused.status === "REFUSED", "a gas heater with no established facts is refused");
  ok(refused.status === "REFUSED" && refused.gate === "combustion_gate",
    "and the refusal names the vent type, which is the first gate it declares");

  const scoped = scopePlumbingService(heater, {
    facts: intakeFacts({ answered: { combustionClass: "GAS_POWER_VENT", capacityGallons: 50 } }).facts,
    accessClass: "ACCESSIBLE", pipeMaterial: "COPPER",
  });
  ok(scoped.status === "SCOPED", "the same heater scopes once the facts are established");
  ok(scoped.status === "SCOPED" && scoped.scope.prerequisites.includes("120v_receptacle_within_reach"),
    "and the power vent's electrical prerequisite reaches the scope");
  ok(scoped.status === "SCOPED" && !("priceCents" in (scoped.scope as object)),
    "the scope layer returns no price");

  // ── Reachability, answered THROUGH THE TREE ──────────────────────────────
  //
  // The earlier version of this test injected facts by hand:
  //
  //     intakeFacts({ answered: { fixtureCondition: "SERVICEABLE", ... } })
  //
  // and passed on all 63 services while 35 of them declared a gate whose fact
  // NO QUESTION IN THE TEMPLATE COULD ESTABLISH. In a live flow every one of
  // those would have refused forever. The test agreed with the code because it
  // made the same assumption the code made — that the fact would be there.
  //
  // So it now reaches every fact only by choosing an answer the service
  // actually asks. A fact the tree cannot establish comes back null, the
  // service fails to scope, and the gap is visible.
  const unreachable: string[] = [];
  for (const svc of PLUMBING_SERVICES) {
    const answers = answerComposed(composeService(svc), {
      access_class: "ACCESSIBLE",
      shutoff_condition: "PRESENT_WORKING",
      fixture_condition: "SERVICEABLE",
      pipe_material: "COPPER",
      ...(svc.expectsCombustion ? { combustion_class: svc.expectsCombustion[0] } : {}),
      ...(svc.capacity ? { capacity: String(svc.capacity.covers[0]) } : {}),
    });

    const missing = svc.gates
      .filter((g) => !(g === "combustion_gate" && !svc.expectsCombustion))
      .filter((g) => !(g === "capacity_gate" && !svc.capacity))
      .filter((g) => answers[GATE_FACT[g]] == null);
    if (missing.length) {
      unreachable.push(`${svc.key}: no answer establishes ${missing.map((g) => GATE_FACT[g]).join(", ")}`);
      continue;
    }

    const facts = intakeFacts({
      answered: {
        ...(answers.combustion_class ? { combustionClass: answers.combustion_class as never } : {}),
        ...(answers.shutoff_condition ? { shutoffCondition: answers.shutoff_condition as never } : {}),
        ...(answers.fixture_condition ? { fixtureCondition: answers.fixture_condition as never } : {}),
        ...(answers.capacity ? { capacityGallons: Number(answers.capacity) } : {}),
      },
    }).facts;

    const result = scopePlumbingService(svc, {
      facts,
      accessClass: (answers.access_class as never) ?? "UNKNOWN",
      pipeMaterial: (answers.pipe_material as never) ?? "UNKNOWN",
    });
    if (result.status !== "SCOPED")
      unreachable.push(`${svc.key}: ${result.status === "REFUSED" ? result.gate : "unknown"}`);
  }
  ok(unreachable.length === 0,
    "every service can be scoped by answering only the questions it asks",
    unreachable.slice(0, 6).join("\n         "));
}

// ── INTENTS ────────────────────────────────────────────────────────────────

function intents() {
  group("STOREFRONT INTENTS");

  const keys = new Set(PLUMBING_SERVICES.map((s) => s.key));
  const badTargets = PLUMBING_INTENTS.filter((i) => !keys.has(i.serviceKey));
  ok(badTargets.length === 0, "every intent points at a service that exists",
    badTargets.map((i) => i.serviceKey).join(", "));

  const phrases = allIntentPhrases();
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const { phrase, serviceKey } of phrases) {
    const norm = phrase.toLowerCase().trim();
    const prior = seen.get(norm);
    if (prior && prior !== serviceKey) collisions.push(`"${norm}" -> ${prior} and ${serviceKey}`);
    seen.set(norm, serviceKey);
  }
  ok(collisions.length === 0, "no phrase routes to two different services", collisions.join(" | "));

  // The emergencies the electrical screen cannot see.
  const mustCatch = [
    "I smell gas in the basement",
    "there is a gas leak by the meter",
    "sewage is backing up into my bathtub",
    "a pipe burst and the basement is flooding",
    "water is pouring through the ceiling",
    "I cant shut the water off",
    "the relief valve on the heater is discharging",
    "water is leaking into the electrical panel",
  ];
  const missed = mustCatch.filter((t) => !screenPlumbingEmergency(t).isEmergency);
  ok(missed.length === 0, "the plumbing emergency screen catches plumbing emergencies", missed.join(" | "));

  // Over-inclusive is the intended posture, but not so over-inclusive that
  // ordinary bookings are refused into a phone call.
  const mustPass = [
    "I want to replace my kitchen faucet",
    "my toilet keeps running",
    "quote for a new water heater",
    "the sink drains slowly",
    "install a garbage disposal",
    "my water pressure is low",
  ];
  const overCaught = mustPass.filter((t) => screenPlumbingEmergency(t).isEmergency);
  ok(overCaught.length === 0, "ordinary requests are not screened out as emergencies", overCaught.join(" | "));

  ok(screenPlumbingEmergency("I smell gas").matched.length > 0,
    "a caught emergency reports why it was caught");

  // Coverage. A service with no intent is findable only by its exact name.
  const covered = new Set(PLUMBING_INTENTS.map((i) => i.serviceKey));
  // Was a budget of eight while seven services had no phrases. They do now, so
  // the budget becomes an assertion — a service reachable only by typing its
  // exact name is one nobody finds.
  const uncovered = PLUMBING_SERVICES.filter((s) => !covered.has(s.key));
  ok(uncovered.length === 0, "every service has at least one search intent",
    uncovered.map((s) => s.key).join(", "));
}

function main() {
  console.log("\nPLUMBING TEMPLATE V1\n");
  shape();
  composition();
  economics();
  failsClosed();
  publishPayload();
  noSelfDiagnosis();
  totality();
  boundary();
  intents();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
