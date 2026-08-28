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
  // would otherwise have priced instantly.
  const r = resolveRoute(
    service({ materialCostResolved: false, basePrice: 25500, questions: [] }),
    {},
    true,
    settings
  );
  ok(r.status === "REVIEW", "the treeless fast path is guarded too");
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

console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
