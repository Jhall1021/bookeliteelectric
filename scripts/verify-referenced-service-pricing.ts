/**
 * Regression for the "TV mount add-ons price at $0" defect (Decision Tree
 * Audit V1, finding B.1).
 *
 *   npx tsx scripts/verify-referenced-service-pricing.ts
 *
 * DB-FREE ON PURPOSE. `resolveRoute` is a pure function — it takes an
 * already-loaded service tree and returns a route, with no database access of
 * its own (only `loadServiceForResolution` touches the database, to build
 * that tree). This script builds a synthetic tree by hand instead, so the
 * fix can be proven correct without a Neon connection, a rehearsal branch, or
 * touching any real contractor's data.
 *
 * WHAT WAS WRONG
 *
 * An answer that sells another catalog item (AnswerOption.referencedServiceId
 * — e.g. "add Elite Tilt Mount" inside TV Installation) is documented,
 * in the schema itself, to price from that service's own live basePrice.
 * The storefront DTO did this correctly for what the customer SAW.
 * `resolveRoute` — what the customer is actually CHARGED — never read the
 * field at all, so every such answer added $0 regardless of what it
 * referenced.
 *
 * WHAT THIS PROVES
 *
 *   1. An answer referencing a service with a real basePrice adds exactly
 *      that price once, on top of the anchor.
 *   2. An answer referencing a service with no resolvable price (deleted,
 *      or never priced) is NOT charged $0 — it fails to REVIEW, the same
 *      way an unapproved component does, per the explicit instruction that
 *      missing pricing must never look like a free item.
 *   3. An ordinary answer with no reference at all is completely unaffected
 *      — the fix is scoped to referencedServiceId and nothing else.
 */

import {
  resolveRoute,
  type ResolvedRoute,
} from "../lib/routeResolver";
import type { PricingSettings } from "../lib/pricing";

let pass = 0;
let fail = 0;
function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

const SETTINGS: PricingSettings = {
  crewHourRateCents: 25000,
  primaryMinimumCents: 0,
  roundingIncrementCents: 0,
  defaultPermitAdminCents: 0,
};

/**
 * A minimal service tree: one question, one answer, shaped exactly like
 * `RESOLUTION_TREE_INCLUDE` produces. Every field `resolveRoute` reads is
 * present; anything it doesn't touch is a plausible placeholder. The `as any`
 * bridge exists because the real type is a deep Prisma-generated payload —
 * hand-authoring it structurally, and asserting the shape, is the point of a
 * fixture like this.
 */
function serviceWithOneAnswer(option: Record<string, unknown>) {
  return {
    slug: "test-tv-installation",
    basePrice: 30000, // $300 anchor, matching how a real TV install prices
    whileWeThereBasePrice: 20000,
    disclaimer: null,
    estimatedMinutes: 60,
    requiresTechCount: 1,
    fieldLaborHours: 2,
    materialCostCents: 0,
    materialCostResolved: true,
    troubleshootingServiceId: null,
    troubleshootingProblem: null,
    ownComponents: new Map(),
    questions: [
      {
        id: "q1",
        key: "has_mount",
        options: [
          {
            value: "add_tilt_mount",
            routeAction: "RESOLVE_ADJUSTED",
            nextQuestionId: null,
            rerouteServiceId: null,
            priceModifierCents: 0,
            approvedComponentPriceCents: null,
            accessClassification: null,
            accessSlot: null,
            overrideEstimatedMinutes: null,
            overrideTechCount: null,
            overrideFieldLaborHours: null,
            addFieldLaborHours: null,
            addMaterialCostCents: null,
            addScheduleMinutes: null,
            components: [],
            photoGroups: [],
            requiredPhotoLabels: [],
            disclaimer: null,
            conditionalDisclaimers: [],
            referencedServiceId: null,
            referencedService: null,
            label: '"add Elite Tilt Mount" test answer',
            ...option,
          },
        ],
      },
    ],
  } as any;
}

function priceOf(route: ResolvedRoute): number | null {
  return route.status === "PRICED" ? route.priceCents : null;
}

// ---- 1. Reference resolves to a real price: added exactly once ----------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: { basePrice: 12500 }, // $125, matching elite-tilt-mount
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok(
    "referenced price resolves and prices the mount once",
    route.status === "PRICED" && priceOf(route) === 30000 + 12500,
    `got ${JSON.stringify(route)}`
  );
}

// ---- 2. Reference set but unresolved: REVIEW, never a silent $0 ---------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: null, // deleted, or never priced
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok(
    "unresolved reference goes to REVIEW, not a $0 price",
    route.status === "REVIEW",
    `got ${JSON.stringify(route)}`
  );
  ok(
    "REVIEW never reports a status of PRICED for the same input",
    priceOf(route) === null
  );
}

// ---- 3. No reference at all: ordinary approvedComponentPriceCents unaffected ----
{
  const service = serviceWithOneAnswer({
    referencedServiceId: null,
    referencedService: null,
    approvedComponentPriceCents: 5000,
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok(
    "an ordinary (non-referencing) answer is unaffected by this fix",
    route.status === "PRICED" && priceOf(route) === 30000 + 5000,
    `got ${JSON.stringify(route)}`
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
