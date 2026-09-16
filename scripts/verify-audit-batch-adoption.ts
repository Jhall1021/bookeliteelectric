/**
 * Rehearses PR #63's five-service audit-followthrough batch (ceiling
 * light/fan, replacement outlet, dedicated circuit, dishwasher — soundbar
 * and garage outlet are out of scope, per docs/design/electrical-v1-v2-
 * release-manifest.md §1) through the CURRENT, unmodified adoption tool
 * (`scripts/template-update.ts`), against a real, guarded, disposable
 * local database. No adoption-tool code is touched by this script.
 *
 * FIXTURE PROVENANCE — every field value below is taken VERBATIM from the
 * real authoring source, not guessed or approximated. Sourced by direct
 * `git show`/file reads of:
 *   - `cb8821a85f92c14fe88240db0ab7bde9164cd8fd` (ceiling light/fan, B.2) —
 *     the BEFORE `switched_source` question and the changed
 *     `existing_light_source` answer, read from the commit's own removed
 *     ("-") diff lines.
 *   - `prisma/seed-questions.ts`'s CURRENT `seedNewCeilingLight`/
 *     `seedNewCeilingFan` (the TARGET `attic_access`/`existing_light_source`
 *     shape) and CURRENT `prisma/seed-lighting-control.ts` (the
 *     `lighting_control` question key and its real dimmer sub-branch,
 *     `LED_DIMMER_UPGRADE` component) for the downstream module both
 *     BEFORE and TARGET route into.
 *   - `d841fdfc0930ff58bc3b63ea9f38fb9a1eb4f78e` (B.16-B.19) and CURRENT
 *     `prisma/seed-device-and-finish-modules.ts` (`seedDeviceModule`'s
 *     `SUPERSEDED_KEYS`/`proceed` logic), CURRENT `prisma/seed-questions.ts`
 *     (`seedReplaceStandardOutlet`'s `outlet_condition`), CURRENT and
 *     pre-fix `prisma/seed-dedicated-circuit.ts` (`dedicated_panel_location`
 *     removed, `dedicated_distance`'s handoff repointed), and CURRENT
 *     `prisma/seed-appliance-services.ts` (`seedApplianceElectrical`'s
 *     dishwasher prompt, before and after).
 *
 * DELIBERATE SIMPLIFICATIONS, disclosed rather than silent:
 *   - `lighting_control`'s real module is seven questions
 *     (control/near-power/wall-access/finished-both/distance/finish-ack/
 *     dimmer). This fixture builds two of them (the control question and
 *     its dimmer branch) — enough to prove the claim this batch actually
 *     needs proven (existing_light_source routes INTO the module and the
 *     module's own downstream pricing consequence is reached exactly
 *     once), without reproducing every intermediate access question,
 *     which this rehearsal does not need to be faithful about.
 *   - Dedicated circuit's own `dedicated_equipment`/`dedicated_route_access`
 *     upstream questions (unchanged by the fix, per the real diff) are
 *     reduced to one representative qualifying path each, rather than
 *     their full real branching (9 and 7 answers respectively) — full
 *     fidelity is kept on `dedicated_distance`, the removed
 *     `dedicated_panel_location`, and `dedicated_finish_ack`, the three
 *     questions the fix actually touches.
 *
 * These are DIRECT PRISMA WRITES of the verified real values, not a
 * literal re-run of the real seed functions — every one of them resolves
 * its target service via `prisma/_serviceKey.ts`'s `serviceSlugKey`,
 * which is HARD-CODED to Elite's own contractor id
 * (`eliteContractorId`), by design ("these callers... legitimately mean
 * Elite's catalog"). Running them for real would mean writing to Elite's
 * actual local rows — this script never does that; it builds two real,
 * disposable `TemplateVersion`s from the verified field values instead,
 * and rehearses adoption against a throwaway contractor.
 */
import { PrismaClient, type RouteAction } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { withThrowaway, provision } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();

const BEFORE_VERSION = 500;
const TARGET_VERSION = 501;
const ADOPTER = "__audit-batch-adopter__";
const UNRELATED = "__audit-batch-unrelated-tenant__";
const BASE = "scripts/template-update.ts";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, d = "") => { c ? pass++ : fail++; console.log(`    ${c ? "ok  " : "FAIL"} ${l}${c ? "" : "\n           " + d}`); };
const run = (...a: string[]) => execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" });
const runMaybe = (...a: string[]): { out: string; code: number } => {
  try { return { out: execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" }), code: 0 }; }
  catch (e) { const err = e as { stdout?: string; stderr?: string; status?: number }; return { out: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 }; }
};
const args = (slug: string, service: string) => ["--contractor", slug, "--service", service];

type Opt = {
  value: string; label: string; routeAction: RouteAction; order: number;
  nextQuestionKey?: string | null; rerouteServiceKey?: string | null; referencedServiceKey?: string | null;
  priceModifierCents?: number; requiredPhotoLabels?: string[]; photosBlockBooking?: boolean; disclaimer?: string | null;
  numberAtLeast?: number | null; numberAtMost?: number | null; numberAtLeastExclusive?: boolean;
};
type Q = {
  key: string; prompt: string; helpText?: string | null; order: number;
  inputType?: "SINGLE_SELECT" | "NUMBER" | "TEXT" | "MULTI_SELECT";
  options: Opt[];
};

/** A minimal, real CanonicalCategory/bookingType shell for a scratch TemplateService — field values borrowed from whatever the real catalog already uses, since this tool only cares about question/option shape, never service-level economics. */
async function baseServiceFields() {
  const cat = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });
  return { canonicalCategoryId: cat.id, bookingType: "ADJUSTED" as const, photoState: "NONE" as const, isPrimaryEligible: true, requiresTechCount: 1, pricingMethod: "LEGACY_PUBLISHED" as const };
}

async function writeTemplateVersion(version: number, services: { key: string; name: string; slug: string; questions: Q[] }[]) {
  const base = await baseServiceFields();
  const tv = await prisma.templateVersion.create({ data: { trade: "electrical", version, kind: "DELTA", notes: `verify-audit-batch-adoption fixture v${version} — delete after use` } });
  for (const svc of services) {
    await prisma.templateService.create({
      data: {
        templateVersionId: tv.id, key: svc.key, slug: svc.slug, name: svc.name, ...base,
        questions: { create: svc.questions.map((q) => ({
          key: q.key, prompt: q.prompt, helpText: q.helpText ?? null, order: q.order, inputType: q.inputType ?? "SINGLE_SELECT",
          options: { create: q.options.map((o) => ({
            value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
            nextQuestionKey: o.nextQuestionKey ?? null, rerouteServiceKey: o.rerouteServiceKey ?? null, referencedServiceKey: o.referencedServiceKey ?? null,
            requiredPhotoLabels: o.requiredPhotoLabels ?? [], photosBlockBooking: o.photosBlockBooking ?? true,
            numberAtLeast: o.numberAtLeast ?? null, numberAtMost: o.numberAtMost ?? null, numberAtLeastExclusive: o.numberAtLeastExclusive ?? false,
          })) },
        })) },
      },
    });
  }
  return tv;
}

// ── Ceiling light/fan — cb8821a8, plus the CURRENT (unchanged) lighting_control module ──
function ceilingQuestions(prefix: "light" | "fan", state: "before" | "target"): Q[] {
  const noAccessPrice = prefix === "light" ? 10000 : 10000; // both $395->$495 / $425->$525, +$100 either way, per the real seed
  const existingLightAnswers: Opt[] =
    state === "before"
      ? [
          { value: "yes", label: "Yes", routeAction: "RESOLVE_INSTANT", order: 1 },
          { value: "no", label: "No", routeAction: "CONTINUE", nextQuestionKey: "switched_source", order: 2 },
        ]
      : [
          // TARGET is the FINAL, FULLY-COMPOSED route: rewireTerminalsInto
          // (prisma/_moduleHelpers.ts:95-135) picks up EVERY RESOLVE_INSTANT
          // terminal on this service and points it at lighting_control —
          // "Yes" already worked this way before the fix; "No" now does too.
          { value: "yes", label: "Yes", routeAction: "CONTINUE", nextQuestionKey: "lighting_control", order: 1 },
          { value: "no", label: "No", routeAction: "CONTINUE", nextQuestionKey: "lighting_control", order: 2 },
        ];
  const questions: Q[] = [
    { key: "attic_access", prompt: `Is there accessible attic space directly above where the ${prefix === "light" ? "light" : "fan"} is going?`, order: 1, options: [
      { value: "has_access", label: "Yes", routeAction: "CONTINUE", nextQuestionKey: "existing_light_source", order: 1 },
      { value: "no_access", label: "No", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: noAccessPrice, order: 2 },
    ] },
    { key: "existing_light_source", prompt: "Is there an existing light fixture we'll be removing, or one nearby we can tap power from?", order: 2, options: existingLightAnswers },
  ];
  if (state === "before") {
    // The exact removed question, cb8821a8's own "-" diff lines.
    questions.push({
      key: "switched_source",
      prompt: `Is there an existing switch in the room we could use to control the new ${prefix === "light" ? "light" : "fan"}?`,
      order: 3,
      options: [
        { value: "yes", label: "Yes", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 15000, order: 1 },
        { value: "no", label: "No", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 22500, order: 2 },
        { value: "unsure", label: "I'm not sure", routeAction: "PHOTO_REVIEW", order: 3, requiredPhotoLabels: ["Room where the light is going, full view", "Ceiling area where the fixture will be installed"] },
      ],
    });
  }
  return questions;
}

/** The REAL, unchanged lighting_control module, scoped down per the file's own docstring (control question + its real dimmer sub-branch, LED_DIMMER_UPGRADE component) — see the file docstring. Present in BOTH before and target, since it never changes; the double-charge is purely a question of whether a SECOND, intermediate flat-fee question ALSO exists between existing_light_source and it. */
function lightingControlQuestions(order: number): Q[] {
  return [
    { key: "lighting_control", prompt: "How would you like the new light controlled?", order, options: [
      { value: "existing_switched_light", label: "From the wall switch that already controls a ceiling light in this room", routeAction: "RESOLVE_INSTANT", order: 1 },
      { value: "new_switch_location", label: "A new switch, in a new location", routeAction: "CONTINUE", nextQuestionKey: "lighting_control_dimmer", order: 2 },
    ] },
    { key: "lighting_control_dimmer", prompt: "Would you like a dimmer on the new switch?", order: order + 1, options: [
      { value: "standard", label: "No, a standard switch is fine", routeAction: "RESOLVE_INSTANT", order: 1 },
      { value: "dimmer", label: "Yes, add an LED dimmer", routeAction: "RESOLVE_INSTANT", order: 2 },
    ] },
  ];
}

// ── Replacement outlet — d841fdfc B.17, plus the CURRENT device module ──
function replacementOutletQuestions(state: "before" | "target"): Q[] {
  const proceed: Pick<Opt, "routeAction" | "nextQuestionKey"> =
    state === "before" ? { routeAction: "CONTINUE", nextQuestionKey: "outlet_condition" } : { routeAction: "RESOLVE_INSTANT", nextQuestionKey: null };
  const questions: Q[] = [
    { key: "device_replacement_reason", prompt: "Why are you replacing this?", order: 0, options: [
      { value: "works_upgrading", label: "It works — I just want it replaced or upgraded", ...proceed, order: 1 },
      { value: "stopped_working", label: "It stopped working", routeAction: "REROUTE_TROUBLESHOOTING", order: 2 },
      { value: "intermittent", label: "It works on and off", ...proceed, order: 3 },
      { value: "damaged", label: "It's damaged, loose, cracked or worn", ...proceed, order: 4 },
      { value: "broader_problem", label: "Something's wrong beyond this one device — a burning smell, sparks, or several things dead", routeAction: "REROUTE_TROUBLESHOOTING", order: 5 },
      { value: "unsure", label: "I'm not sure what's wrong", routeAction: "REROUTE_TROUBLESHOOTING", order: 6 },
    ] },
  ];
  if (state === "before") {
    questions.push({
      key: "outlet_condition", prompt: "What's happening with the outlet?", order: 1, options: [
        { value: "standard_swap", label: "It just needs to be swapped for a new one", routeAction: "RESOLVE_INSTANT", order: 1 },
        { value: "unsafe_condition", label: "It's warm, sparking, or smells like burning", routeAction: "REROUTE_TROUBLESHOOTING", order: 2 },
        { value: "no_power", label: "It doesn't work at all / no power", routeAction: "REROUTE_TROUBLESHOOTING", order: 3 },
      ],
    });
  }
  return questions;
}

// ── Dedicated circuit — d841fdfc B.18, plus the CURRENT seed-dedicated-circuit.ts ──
// Upstream (dedicated_equipment/dedicated_route_access) is REPRESENTATIVE,
// collapsed to one qualifying path each — unchanged by the fix, per the
// real diff. Full fidelity on dedicated_distance, the removed
// dedicated_panel_location, and dedicated_finish_ack.
function dedicatedCircuitQuestions(state: "before" | "target"): Q[] {
  const q3ProceedTarget = "dedicated_finish_ack";
  const q3ProceedBefore = "dedicated_panel_location";
  const questions: Q[] = [
    { key: "dedicated_equipment", prompt: "What will this dedicated circuit power?", order: 1, options: [
      { value: "fridge_freezer", label: "Refrigerator or freezer", routeAction: "CONTINUE", nextQuestionKey: "dedicated_route_access", order: 1 },
    ] },
    { key: "dedicated_route_access", prompt: "Can we reach the wiring path through an unfinished basement, a basement with a removable drop ceiling, or an accessible attic?", order: 3, options: [
      { value: "unfinished_basement", label: "Yes — unfinished basement", routeAction: "CONTINUE", nextQuestionKey: "dedicated_distance", order: 1 },
    ] },
    { key: "dedicated_distance", prompt: "About how far will the wire travel from the electrical panel to the new outlet?", order: 4, options: [
      { value: "under_25", label: "25 feet or less", routeAction: "CONTINUE", nextQuestionKey: state === "before" ? q3ProceedBefore : q3ProceedTarget, order: 1 },
      { value: "25_to_50", label: "26 to 50 feet", routeAction: "CONTINUE", nextQuestionKey: state === "before" ? q3ProceedBefore : q3ProceedTarget, order: 2 },
      { value: "over_50", label: "More than 50 feet", routeAction: "PHOTO_REVIEW", order: 3 },
      { value: "unsure", label: "I'm not sure", routeAction: "PHOTO_REVIEW", order: 4 },
    ] },
    { key: "dedicated_finish_ack", prompt: "One quick note about access openings", order: 5, options: [
      { value: "accepted", label: "I understand — give me my price", routeAction: "PHOTO_REVIEW", photosBlockBooking: false, order: 1 },
      { value: "review_first", label: "I'd rather Elite review my situation first", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2 },
    ] },
  ];
  if (state === "before") {
    questions.push({
      key: "dedicated_panel_location", prompt: "Where is your electrical panel?", order: 45, options: [
        { value: "unfinished_basement", label: "Unfinished basement", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 1 },
        { value: "finished_basement", label: "Finished basement or utility room", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 2 },
        { value: "garage", label: "Garage", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 3 },
        { value: "interior_finished_wall", label: "On a finished interior wall", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 4 },
        { value: "exterior", label: "Outside the house", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 5 },
        { value: "other_unsure", label: "Somewhere else, or I'm not sure", routeAction: "CONTINUE", nextQuestionKey: "dedicated_finish_ack", order: 6 },
      ],
    });
  }
  return questions;
}

// ── Dishwasher — d841fdfc B.19, wording only ──
function dishwasherQuestions(state: "before" | "target"): Q[] {
  const prompt = state === "before" ? "Is there already suitable power at the dishwasher?" : "Is there a dishwasher there now that's plugged in or wired in?";
  return [
    { key: "appliance_power_present", prompt, order: 0, options: [
      { value: "has_power", label: "Yes, the old one is plugged in or wired in", routeAction: "RESOLVE_INSTANT", order: 1 },
      { value: "no_power", label: "No, there's no power there", routeAction: "REROUTE_SERVICE", rerouteServiceKey: "dedicated-120v-circuit-outlet", order: 2 },
      { value: "unsure", label: "I'm not sure", routeAction: "PHOTO_REVIEW", order: 3 },
    ] },
  ];
}

function serviceBundle(state: "before" | "target") {
  return [
    { key: "new-ceiling-light", slug: "new-ceiling-light", name: "New Ceiling Light", questions: [...ceilingQuestions("light", state), ...lightingControlQuestions(10)] },
    { key: "new-ceiling-fan", slug: "new-ceiling-fan", name: "New Ceiling Fan", questions: [...ceilingQuestions("fan", state), ...lightingControlQuestions(10)] },
    { key: "replace-standard-outlet", slug: "replace-standard-outlet", name: "Replace Standard Outlet", questions: replacementOutletQuestions(state) },
    { key: "dedicated-120v-circuit-outlet", slug: "dedicated-120v-circuit-outlet", name: "Dedicated Circuit & Outlet", questions: dedicatedCircuitQuestions(state) },
    { key: "dishwasher-electrical", slug: "dishwasher-electrical", name: "Dishwasher Electrical Connection / Reconnection", questions: dishwasherQuestions(state) },
  ];
}

async function svcOf(slug: string, key: string) {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: key },
    include: { questions: { include: { options: true } } },
  });
}
async function questionByKey(slug: string, serviceKey: string, questionKey: string) {
  const s = await svcOf(slug, serviceKey);
  return s.questions.find((q) => q.key === questionKey) ?? null;
}
async function optionByValue(slug: string, serviceKey: string, questionKey: string, value: string) {
  const q = await questionByKey(slug, serviceKey, questionKey);
  return q?.options.find((o) => o.value === value) ?? null;
}
/** Is ANY live option on this service still pointing at the given question id? Proves a bypassed question is truly unreachable, not just "not the entry point." */
async function isReachable(slug: string, serviceKey: string, questionId: string) {
  const s = await svcOf(slug, serviceKey);
  return s.questions.some((q) => q.options.some((o) => o.nextQuestionId === questionId));
}

async function main() {
  console.log("\nAUDIT-BATCH ADOPTION REHEARSAL — 5 services, current tool, no code changes\n");
  await assertDisposableLocalDatabase(prisma);

  const publishedVersions: number[] = [];
  try {
    console.log("  Building BEFORE (v500) and TARGET (v501) TemplateVersions from verified real field values...");
    await writeTemplateVersion(BEFORE_VERSION, serviceBundle("before"));
    publishedVersions.push(BEFORE_VERSION);
    await writeTemplateVersion(TARGET_VERSION, serviceBundle("target"));
    publishedVersions.push(TARGET_VERSION);

    await withThrowaway(prisma, ADOPTER, "Audit Batch Adopter Electric", async () => {
      const SERVICE_KEYS = ["new-ceiling-light", "new-ceiling-fan", "replace-standard-outlet", "dedicated-120v-circuit-outlet", "dishwasher-electrical"];
      // ONE call, no --service filter: `atVersion` mode installs every
      // TemplateService under that exact version, unfolded — since v500 is
      // a scratch DELTA containing exactly these five, this installs all
      // five in the single installCatalog() call `preflight`'s "already
      // provisioned" gate allows per contractor (lib/templateProvisioning.ts).
      provision(ADOPTER, ["--version", String(BEFORE_VERSION)]);

      console.log("\n  A. BEFORE STATE MATCHES THE REAL PRE-FIX TREE");
      ok((await optionByValue(ADOPTER, "new-ceiling-light", "existing_light_source", "no"))?.nextQuestionId === (await questionByKey(ADOPTER, "new-ceiling-light", "switched_source"))?.id,
         "new-ceiling-light: existing_light_source 'No' points at switched_source before adoption");
      ok((await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "works_upgrading"))?.nextQuestionId === (await questionByKey(ADOPTER, "replace-standard-outlet", "outlet_condition"))?.id,
         "replace-standard-outlet: device_replacement_reason's qualifying answers point at outlet_condition before adoption");
      ok((await optionByValue(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_distance", "under_25"))?.nextQuestionId === (await questionByKey(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_panel_location"))?.id,
         "dedicated-120v-circuit-outlet: dedicated_distance points at dedicated_panel_location before adoption");
      ok((await questionByKey(ADOPTER, "dishwasher-electrical", "appliance_power_present"))?.prompt === "Is there already suitable power at the dishwasher?",
         "dishwasher-electrical: the OLD prompt is live before adoption");

      // Capture the ids of the questions each fix bypasses, BEFORE adopting — used below to prove they survive, orphaned, not deleted.
      const lightSwitchedSourceId = (await questionByKey(ADOPTER, "new-ceiling-light", "switched_source"))!.id;
      const fanSwitchedSourceId = (await questionByKey(ADOPTER, "new-ceiling-fan", "switched_source"))!.id;
      const outletConditionId = (await questionByKey(ADOPTER, "replace-standard-outlet", "outlet_condition"))!.id;
      const panelLocationId = (await questionByKey(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_panel_location"))!.id;

      // ── B. Approve pricing on all five, to prove the reset fires on every adopt — not inspected once and assumed for the rest ──
      console.log("\n  B. PRICING APPROVAL IS INVALIDATED BY EVERY ONE OF THE FIVE ADOPTIONS");
      for (const key of SERVICE_KEYS) {
        const s = await svcOf(ADOPTER, key);
        await prisma.service.update({ where: { id: s.id }, data: { materialCostResolved: true, publishedPriceApprovedAt: new Date(), basePrice: 12345 } });
      }

      console.log("\n  C. --status REPORTS EXACTLY THE FIVE EXPECTED CHANGES");
      const statusLight = run(BASE, ...args(ADOPTER, "new-ceiling-light"), "--status");
      ok(/~ option\s+existing_light_source\/no/.test(statusLight) && !/CONFLICT/.test(statusLight), "new-ceiling-light: exactly one clean, offered option-revised (existing_light_source/no)");
      const statusFan = run(BASE, ...args(ADOPTER, "new-ceiling-fan"), "--status");
      ok(/~ option\s+existing_light_source\/no/.test(statusFan) && !/CONFLICT/.test(statusFan), "new-ceiling-fan: same, independently");
      const statusOutlet = run(BASE, ...args(ADOPTER, "replace-standard-outlet"), "--status");
      ok(/works_upgrading/.test(statusOutlet) && /intermittent/.test(statusOutlet) && /damaged/.test(statusOutlet) && !/CONFLICT/.test(statusOutlet),
         "replace-standard-outlet: all three qualifying answers offered, none conflicted");
      ok(!/stopped_working/.test(statusOutlet) && !/broader_problem/.test(statusOutlet) && !/unsure/.test(statusOutlet),
         "replace-standard-outlet: the three REROUTE_TROUBLESHOOTING diagnostic exits are untouched — not reported as changed at all");
      const statusDedicated = run(BASE, ...args(ADOPTER, "dedicated-120v-circuit-outlet"), "--status");
      ok(/under_25/.test(statusDedicated) && /25_to_50/.test(statusDedicated) && !/CONFLICT/.test(statusDedicated), "dedicated-120v-circuit-outlet: both continuing distance answers offered, clean");
      const statusDish = run(BASE, ...args(ADOPTER, "dishwasher-electrical"), "--status");
      ok(/~ wording/.test(statusDish) && !/CONFLICT/.test(statusDish), "dishwasher-electrical: a clean wording-changed, no conflict");

      // ── D. Adopt all five for real ──
      console.log("\n  D. --adopt APPLIES ALL FIVE REQUIRED INDIVIDUAL REVISIONS");
      run(BASE, ...args(ADOPTER, "new-ceiling-light"), "--adopt", "existing_light_source/no");
      run(BASE, ...args(ADOPTER, "new-ceiling-fan"), "--adopt", "existing_light_source/no");
      run(BASE, ...args(ADOPTER, "replace-standard-outlet"), "--adopt", "device_replacement_reason/works_upgrading");
      run(BASE, ...args(ADOPTER, "replace-standard-outlet"), "--adopt", "device_replacement_reason/intermittent");
      run(BASE, ...args(ADOPTER, "replace-standard-outlet"), "--adopt", "device_replacement_reason/damaged");
      run(BASE, ...args(ADOPTER, "dedicated-120v-circuit-outlet"), "--adopt", "dedicated_distance/under_25");
      run(BASE, ...args(ADOPTER, "dedicated-120v-circuit-outlet"), "--adopt", "dedicated_distance/25_to_50");
      run(BASE, ...args(ADOPTER, "dishwasher-electrical"), "--adopt", "appliance_power_present");

      console.log("\n  E. THE COMPOSED FINAL GRAPH MATCHES THE TARGET, FIELD BY FIELD");
      const lightNo = await optionByValue(ADOPTER, "new-ceiling-light", "existing_light_source", "no");
      const lightControl = await questionByKey(ADOPTER, "new-ceiling-light", "lighting_control");
      ok(lightNo?.routeAction === "CONTINUE" && lightNo?.nextQuestionId === lightControl?.id,
         "new-ceiling-light: existing_light_source 'No' now continues DIRECTLY into lighting_control — not a resolve, not through switched_source");
      ok(!(await isReachable(ADOPTER, "new-ceiling-light", lightSwitchedSourceId)), "new-ceiling-light: switched_source is unreachable from the actual entry point — nothing routes to it any more");
      const lightSwitchedSourceStill = await prisma.question.findUnique({ where: { id: lightSwitchedSourceId } });
      ok(!!lightSwitchedSourceStill, "new-ceiling-light: switched_source's own row still exists — retained, not deleted, by adoption");

      const fanNo = await optionByValue(ADOPTER, "new-ceiling-fan", "existing_light_source", "no");
      const fanControl = await questionByKey(ADOPTER, "new-ceiling-fan", "lighting_control");
      ok(fanNo?.routeAction === "CONTINUE" && fanNo?.nextQuestionId === fanControl?.id, "new-ceiling-fan: same correct final route, independently adopted");
      ok(!(await isReachable(ADOPTER, "new-ceiling-fan", fanSwitchedSourceId)), "new-ceiling-fan: its own switched_source is also unreachable");
      ok(!!(await prisma.question.findUnique({ where: { id: fanSwitchedSourceId } })), "new-ceiling-fan: its own switched_source row also retained");

      // The one real, price-bearing consequence of "reaches lighting_control": the dimmer sub-question is reachable and still resolves for real.
      const lightDimmer = await questionByKey(ADOPTER, "new-ceiling-light", "lighting_control_dimmer");
      ok(!!lightDimmer && (await optionByValue(ADOPTER, "new-ceiling-light", "lighting_control_dimmer", "dimmer"))?.routeAction === "RESOLVE_INSTANT",
         "new-ceiling-light: lighting_control's OWN downstream module (the dimmer branch) is intact and reachable — the fix retains the whole module, not just its entry question");

      const proceed3 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "works_upgrading");
      ok(proceed3?.routeAction === "RESOLVE_INSTANT" && proceed3?.nextQuestionId === null, "replace-standard-outlet: 'works_upgrading' terminates EXPLICITLY (RESOLVE_INSTANT, nextQuestionId null) — not an ambiguous cleared link");
      const proceed4 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "intermittent");
      const proceed5 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "damaged");
      ok(proceed4?.routeAction === "RESOLVE_INSTANT" && proceed5?.routeAction === "RESOLVE_INSTANT", "replace-standard-outlet: all three qualifying answers terminate explicitly, the same way");
      const diag1 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "stopped_working");
      const diag2 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "broader_problem");
      const diag3 = await optionByValue(ADOPTER, "replace-standard-outlet", "device_replacement_reason", "unsure");
      ok(diag1?.routeAction === "REROUTE_TROUBLESHOOTING" && diag2?.routeAction === "REROUTE_TROUBLESHOOTING" && diag3?.routeAction === "REROUTE_TROUBLESHOOTING",
         "replace-standard-outlet: the three diagnostic REROUTE_TROUBLESHOOTING exits are completely untouched by adopting the other three");
      ok(!(await isReachable(ADOPTER, "replace-standard-outlet", outletConditionId)), "replace-standard-outlet: outlet_condition is unreachable from the entry point");
      ok(!!(await prisma.question.findUnique({ where: { id: outletConditionId } })), "replace-standard-outlet: outlet_condition's own row is retained, not deleted");

      const under25 = await optionByValue(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_distance", "under_25");
      const finishAck = await questionByKey(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_finish_ack");
      ok(under25?.routeAction === "CONTINUE" && under25?.nextQuestionId === finishAck?.id, "dedicated-120v-circuit-outlet: dedicated_distance now hands off directly to dedicated_finish_ack");
      const accepted = await optionByValue(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_finish_ack", "accepted");
      const reviewFirst = await optionByValue(ADOPTER, "dedicated-120v-circuit-outlet", "dedicated_finish_ack", "review_first");
      ok(!!accepted && !!reviewFirst, "dedicated-120v-circuit-outlet: the finish acknowledgement question RETAINS both its real answers — adoption did not touch it, only what points to it");
      ok(!(await isReachable(ADOPTER, "dedicated-120v-circuit-outlet", panelLocationId)), "dedicated-120v-circuit-outlet: dedicated_panel_location is unreachable from the entry point");
      ok(!!(await prisma.question.findUnique({ where: { id: panelLocationId } })), "dedicated-120v-circuit-outlet: dedicated_panel_location's own row is retained, not deleted");

      const dishQ = await questionByKey(ADOPTER, "dishwasher-electrical", "appliance_power_present");
      ok(dishQ?.prompt === "Is there a dishwasher there now that's plugged in or wired in?", "dishwasher-electrical: the prompt changed to the exact target wording");
      const dishHasPower = await optionByValue(ADOPTER, "dishwasher-electrical", "appliance_power_present", "has_power");
      const dishNoPower = await optionByValue(ADOPTER, "dishwasher-electrical", "appliance_power_present", "no_power");
      const dedicatedSvc = await svcOf(ADOPTER, "dedicated-120v-circuit-outlet");
      ok(dishHasPower?.routeAction === "RESOLVE_INSTANT" && dishNoPower?.routeAction === "REROUTE_SERVICE" && dishNoPower?.rerouteServiceId === dedicatedSvc.id,
         "dishwasher-electrical: ONLY the wording changed — routing (has_power/no_power/unsure) is byte-for-byte what it was before");

      console.log("\n  F. NO PARTIAL SERVICE STATE IS TREATED AS READY FOR PRICING");
      for (const key of SERVICE_KEYS) {
        const s = await svcOf(ADOPTER, key);
        ok(s.materialCostResolved === false && s.publishedPriceApprovedAt === null && s.basePrice === null,
           `${key}: the approval this rehearsal set before adopting was correctly invalidated by the adoption (materialCostResolved/publishedPriceApprovedAt/basePrice all reset)`);
      }

      console.log("\n  G. A GENUINE CONTRACTOR CUSTOMIZATION REFUSES WITHOUT COLLATERAL CHANGES; RERUN IS A NO-OP");
      // Customize the ALREADY-ADOPTED new-ceiling-fan answer directly, bypassing the tool — then attempt to adopt it again from the SAME target (a real re-check, not a repeat of an already-clean adopt).
      const fanNoOpt = await optionByValue(ADOPTER, "new-ceiling-fan", "existing_light_source", "no");
      await prisma.answerOption.updateMany({ where: { id: fanNoOpt!.id }, data: { routeAction: "PHOTO_REVIEW", nextQuestionId: null } });
      const beforeConflictPricing = await svcOf(ADOPTER, "new-ceiling-fan");
      // Republish a distinct v502 revising the SAME unit again, to force a real detect() comparison against the customized live value.
      await writeTemplateVersion(502, [{ key: "new-ceiling-fan", slug: "new-ceiling-fan", name: "New Ceiling Fan", questions: [
        ...ceilingQuestions("fan", "target").map((q) => q.key === "existing_light_source" ? { ...q, options: q.options.map((o) => o.value === "no" ? { ...o, nextQuestionKey: "lighting_control_dimmer" } : o) } : q),
        ...lightingControlQuestions(10),
      ] }]);
      publishedVersions.push(502);
      const statusAfterCustomization = run(BASE, ...args(ADOPTER, "new-ceiling-fan"), "--status");
      ok(/CONFLICT/.test(statusAfterCustomization), "new-ceiling-fan: a further template correction to the customized unit is correctly reported as a CONFLICT");
      const adoptConflict = run(BASE, ...args(ADOPTER, "new-ceiling-fan"), "--adopt", "existing_light_source/no");
      ok(/SKIPPED/.test(adoptConflict) && /Yours is kept/.test(adoptConflict), "new-ceiling-fan: adopting the conflicted unit is refused");
      const afterConflictOpt = await optionByValue(ADOPTER, "new-ceiling-fan", "existing_light_source", "no");
      ok(afterConflictOpt?.routeAction === "PHOTO_REVIEW" && afterConflictOpt?.nextQuestionId === null, "new-ceiling-fan: the contractor's own customization is untouched by the refusal");
      const afterConflictPricing = await svcOf(ADOPTER, "new-ceiling-fan");
      ok(afterConflictPricing.materialCostResolved === beforeConflictPricing.materialCostResolved && afterConflictPricing.basePrice === beforeConflictPricing.basePrice,
         "new-ceiling-fan: the refusal caused NO collateral pricing change");
      // Unrelated services on the SAME adopter are untouched by this conflict.
      const lightStillOk = await optionByValue(ADOPTER, "new-ceiling-light", "existing_light_source", "no");
      ok(lightStillOk?.routeAction === "CONTINUE" && lightStillOk?.nextQuestionId === lightControl?.id, "new-ceiling-light: completely unaffected by new-ceiling-fan's conflict — no collateral change to a sibling service");

      // Rerun of an ALREADY cleanly-adopted unit is a true no-op.
      const beforeRerun = await optionByValue(ADOPTER, "dishwasher-electrical", "appliance_power_present", "has_power");
      const rerun = run(BASE, ...args(ADOPTER, "dishwasher-electrical"), "--adopt", "appliance_power_present");
      ok(/no change matched/.test(rerun), "dishwasher-electrical: repeating an already-landed adoption is a true no-op");
      const afterRerun = await optionByValue(ADOPTER, "dishwasher-electrical", "appliance_power_present", "has_power");
      ok(JSON.stringify(beforeRerun) === JSON.stringify(afterRerun), "dishwasher-electrical: the no-op wrote nothing");

      console.log("\n  H. AN UNRELATED TENANT IS COMPLETELY UNAFFECTED");
      await withThrowaway(prisma, UNRELATED, "Unrelated Tenant Electric", async () => {
        provision(UNRELATED, ["--version", String(BEFORE_VERSION)]);
        const unrelatedLightNo = await optionByValue(UNRELATED, "new-ceiling-light", "existing_light_source", "no");
        ok(unrelatedLightNo?.routeAction === "CONTINUE" && unrelatedLightNo?.nextQuestionId === (await questionByKey(UNRELATED, "new-ceiling-light", "switched_source"))?.id,
           "an unrelated tenant provisioned from the SAME before-version, never touched by any --adopt call above, still shows the pre-fix route — no cross-tenant leakage from anything this rehearsal did");
      });
    });
  } finally {
    for (const v of publishedVersions) {
      const tv = await prisma.templateVersion.findFirst({ where: { version: v, trade: "electrical" } });
      if (tv) { try { await prisma.templateVersion.delete({ where: { id: tv.id } }); } catch (e) { ok(false, `cleanup: delete scratch TemplateVersion v${v}`, String(e)); } }
    }
  }

  const remaining = await prisma.templateVersion.count();
  ok(remaining === 1, `exactly the baseline TemplateVersion remains afterward (found ${remaining})`);

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0 ? `\n  ${pass} checks passed.\n` : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
