/**
 * The two unresolved-material guards — verification.
 *
 *   npx tsx scripts/verify-unresolved-guards.ts
 *
 * No database. resolveRoute is a pure function, so it is called directly with
 * a hand-built service; the activation guard's decision is mirrored as a
 * predicate because it lives inside a Next route handler.
 *
 * What's being defended:
 *
 *   A homeowner-facing price may never be calculated using an unresolved
 *   required material cost. Missing required cost = no price.
 */

import { resolveRoute } from "../lib/routeResolver";
import type { PricingSettings } from "../lib/pricing";
import {
  unauthoredDisclaimerKeysForService,
  unauthoredDisclaimerServices,
  type PendingDisclaimer,
} from "../lib/disclaimerAuthoring";

let fail = 0;
const ok = (c: boolean, l: string, d = "") => {
  if (!c) fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `\n      ${d}`}`);
};

const settings: PricingSettings = {
  crewHourRateCents: 25000,
  primaryMinimumCents: 25000,
  roundingIncrementCents: 500,
  defaultPermitAdminCents: 0,
};

/** A treeless service — the simplest path to a price. */
function service(over: Record<string, unknown> = {}) {
  return {
    id: "svc1",
    slug: "replace-wall-sconce",
    estimatedMinutes: 60,
    requiresTechCount: 1,
    fieldLaborHours: 0.75,
    materialCostCents: 300,
    materialMultiplier: null,
    permitAdminCents: null,
    otherDirectCostCents: null,
    isPrimaryEligible: true,
    basePrice: 25500,
    whileWeThereBasePrice: 13000,
    disclaimer: null,
    materialCostResolved: true,
    unresolvedMaterialKeys: [],
    questions: [],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

console.log("\nPRICING GUARD — resolveRoute\n");

{
  const r = resolveRoute(service(), {}, true, settings);
  ok(r.status === "PRICED", "a resolved service still prices normally", `got ${r.status}`);
  ok(r.status === "PRICED" && r.priceCents === 25500, "at its published price");
}
{
  const r = resolveRoute(service({ materialCostResolved: false }), {}, true, settings);
  ok(r.status === "REVIEW", "an unresolved service routes to REVIEW", `got ${r.status}`);
  ok(
    r.status === "REVIEW" && r.floorPriceCents === null,
    "and offers NO floor — a floor missing a material is not a floor"
  );
  ok(
    r.status === "REVIEW" && /material/i.test(r.reason),
    "with a reason naming the cause",
    r.status === "REVIEW" ? r.reason : ""
  );
}
{
  // The dangerous shape: unresolved, but the stale cached total still looks
  // plausible. It must not be used.
  const r = resolveRoute(
    service({ materialCostResolved: false, materialCostCents: 300 }),
    {},
    true,
    settings
  );
  ok(r.status !== "PRICED", "a stale-but-plausible cached total does not produce a price");
}
{
  const r = resolveRoute(service({ materialCostResolved: false }), {}, false, settings);
  ok(r.status === "REVIEW", "the same holds for a same-visit add-on");
}
{
  // Guard runs BEFORE the tree, so it cannot be skipped by a route that
  // has no routing decision to make.
  const r = resolveRoute(
    service({ materialCostResolved: false, basePrice: 25500, questions: [] }),
    {},
    true,
    settings
  );
  ok(r.status === "REVIEW", "the treeless fast path is guarded too");
}
{
  const reroute = resolveRoute(
    service({
      materialCostResolved: false,
      questions: [{
        id: "q1", key: "job_kind", inputType: "SINGLE_SELECT",
        options: [{
          id: "o1", value: "other", label: "This is another service",
          routeAction: "REROUTE_SERVICE", rerouteServiceId: "svc-target",
          requiresCapabilityKey: null, components: [], disclaimers: [],
        }],
      }],
    }),
    { job_kind: "other" },
    true,
    settings,
  );
  ok(
    reroute.status === "REROUTE" && reroute.targetServiceId === "svc-target",
    "an unresolved source service may still hand off to the service that owns the price",
    reroute.status,
  );
}

console.log("\nACTIVATION GUARD\n");

/** The route's decision, as a predicate. */
const refusesActivation = (currentlyActive: boolean, resolved: boolean, wantsActive: boolean) =>
  wantsActive && !currentlyActive && resolved === false;

ok(refusesActivation(false, false, true), "activating an unresolved service is refused");
ok(!refusesActivation(false, true, true), "activating a resolved service is allowed");
ok(!refusesActivation(true, false, false), "DEACTIVATING an unresolved service is always allowed");
ok(
  !refusesActivation(true, false, true),
  "saving an edit to an already-live unresolved service is not blocked — the pricing guard covers it"
);
ok(!refusesActivation(false, false, false), "saving an inactive service as inactive is fine");

console.log("\nDISCLAIMER AUTHORITY\n");

const currentDisclaimer: PendingDisclaimer = {
  key: "CURRENT_DISCLOSURE",
  name: "Current disclosure",
  description: null,
  accessClass: null,
  text: "",
  authored: false,
  dependentSlugs: ["current-service"],
  offeredDependentSlugs: ["current-service"],
};
const authoredDisclaimer: PendingDisclaimer = {
  ...currentDisclaimer,
  key: "AUTHORED_DISCLOSURE",
  text: "Contractor wording",
  authored: true,
};
ok(
  unauthoredDisclaimerKeysForService([currentDisclaimer, authoredDisclaimer], "current-service").join(",") === "CURRENT_DISCLOSURE",
  "activation blocks only on a currently reachable, unauthored disclosure",
);
ok(
  unauthoredDisclaimerKeysForService([], "retired-service").length === 0,
  "a retired disclosure cannot block activation merely because a historical service key survives",
);
ok(
  unauthoredDisclaimerServices([currentDisclaimer, authoredDisclaimer], new Set(["current-service"]))
    .get("CURRENT_DISCLOSURE")?.join(",") === "current-service",
  "launch readiness uses the same current disclosure authority",
);
ok(
  unauthoredDisclaimerServices([], new Set(["retired-service"])).size === 0,
  "launch readiness emits no Fix link when the policy page has no current disclosure to edit",
);

console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
