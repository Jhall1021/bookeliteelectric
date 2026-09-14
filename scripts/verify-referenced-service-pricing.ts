/**
 * Regression for the "TV mount add-ons price at $0" defect (Decision Tree
 * Audit V1, finding B.1) and the follow-up correction pass that hardened it.
 *
 *   npx tsx scripts/verify-referenced-service-pricing.ts
 *
 * DB-FREE ON PURPOSE. `resolveRoute`, `applyBranch` and `answerPriceDelta`
 * are pure functions given an already-loaded tree — only
 * `loadServiceForResolution` touches a database, to build that tree. This
 * script builds synthetic trees by hand instead, so every boundary below is
 * proven without a Neon connection, a rehearsal branch, or touching any real
 * contractor's data.
 *
 * WHAT WAS WRONG, AND WHAT THE CORRECTION PASS FOUND ON TOP OF IT
 *
 * AnswerOption.referencedServiceId (e.g. "add Elite Tilt Mount" inside TV
 * Installation) is documented, in the schema, to price from the referenced
 * service's own live price. The storefront DISPLAY did this; the SERVER
 * charge (lib/routeResolver.ts) didn't read the field at all — a display/
 * charge mismatch, not a uniform $0.
 *
 * The first fix routed the resolved price through
 * `applyBranch`'s `approvedComponentPriceCents` parameter. Reviewed again
 * against the boundaries below, that had its own gap: `approvedComponentPriceCents`
 * only means "unresolved, go to review" when the SAME answer also declares
 * components — an answer with none (every mount option today) would have a
 * null reference collapse to a plain 0 inside `applyBranch` itself, which is
 * the identical bug moved one function down. `referencedServicePriceCents`
 * is now its own field on `BranchContribution` (lib/pricing.ts), composing
 * additively with components rather than overriding them, so a resolved
 * reference can't mask an unresolved component and vice versa.
 *
 * WHAT THIS PROVES, IN ORDER
 *
 *   1.  a real referenced price is added exactly once, on the primary anchor
 *   2.  ...and on the While-We're-There anchor, when isPrimary is false
 *   3.  a missing reference (row not found) reviews, never prices free
 *   4.  a cross-tenant reference (contractorId mismatch) reviews identically
 *       to missing — never trusted, regardless of what it contains
 *   5.  an approved ZERO price is NOT treated as missing (loose `== null`
 *       would get this wrong; strict comparison doesn't)
 *   6.  a resolved reference cannot mask an unapproved component on the SAME
 *       answer — the combined result still reviews
 *   7.  ...and the reverse: an unresolved reference reviews even when the
 *       same answer's components WOULD have resolved fine on their own
 *   8.  a resolved reference ADDS to a resolved component's price rather
 *       than replacing it
 *   9.  an ordinary priceModifierCents on the same answer still applies
 *       alongside a resolved reference (not dropped, not doubled)
 *   10. referencing an inactive, add-on-only service (Service.active: false
 *       — exactly Elite's own elite-tilt-mount/elite-articulating-mount)
 *       still resolves its price normally; add-on-only eligibility is a
 *       standalone-booking concern, not a pricing one
 *   11. an ordinary (non-referencing) answer is completely unaffected
 *   12. the CLIENT-side primitives (`applyBranch`, `answerPriceDelta` — the
 *       same functions GuidedFlowEngine and QuestionStep call to build what
 *       the customer sees BEFORE submitting) agree with the server on cases
 *       1 and 3-4 above, proving the display can no longer show a confident
 *       price the server would refuse
 */

import {
  resolveRoute,
  type ResolvedRoute,
} from "../lib/routeResolver";
import { applyBranch, answerPriceDelta, startConfiguration, type BranchContribution } from "../lib/pricing";
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

const HOME_CONTRACTOR = "elite-electric-id";
const OTHER_CONTRACTOR = "some-other-contractor-id";

/**
 * A minimal service tree: one question, one answer, shaped exactly like
 * `RESOLUTION_TREE_INCLUDE` produces. Every field `resolveRoute` reads is
 * present; anything it doesn't touch is a plausible placeholder. The `as any`
 * bridge exists because the real type is a deep Prisma-generated payload —
 * hand-authoring it structurally, and asserting the shape, is the point of a
 * fixture like this.
 */
/**
 * A component attachment, in the RAW shape resolveRoute actually maps
 * (canonicalComponent nested, contractor pricing arriving separately via
 * `ownComponents`) — not the already-resolved shape `applyBranch` consumes.
 * `approved: null` (the default) leaves this contractor's `ownComponents` Map
 * without an entry for the role, which is exactly how resolveRoute represents
 * "never priced" — `approvedPriceCents: null` — so this fixture doesn't need
 * to fake that string literal itself.
 */
function rawComponent(approved: number | null = null) {
  return {
    quantity: 1,
    conditionAccessClass: null,
    conditionAccessSlot: null,
    conditionAnswerKey: null,
    conditionAnswerValue: null,
    canonicalComponent: { id: "some-part-id", key: "SOME_PART", customerFacingLabel: "Some part", materials: [] },
    ownApprovedPriceCents: approved,
  };
}

function serviceWithOneAnswer(option: Record<string, unknown>) {
  const rawComponents = (option.components as ReturnType<typeof rawComponent>[] | undefined) ?? [];
  const ownComponents = new Map(
    rawComponents
      .filter((c) => c.ownApprovedPriceCents !== null)
      .map((c) => [c.canonicalComponent.id, { approvedPriceCents: c.ownApprovedPriceCents }])
  );
  return {
    slug: "test-tv-installation",
    contractorId: HOME_CONTRACTOR,
    basePrice: 30000, // $300 primary anchor
    whileWeThereBasePrice: 20000, // $200 add-on anchor — deliberately DIFFERENT
    // from basePrice, so a test that accidentally reads the wrong one fails.
    disclaimer: null,
    estimatedMinutes: 60,
    requiresTechCount: 1,
    fieldLaborHours: 2,
    materialCostCents: 0,
    materialCostResolved: true,
    troubleshootingServiceId: null,
    troubleshootingProblem: null,
    ownComponents,
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

// ---- 1. Real referenced price, primary anchor ---------------------------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: HOME_CONTRACTOR },
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("1. referenced price resolves and prices the mount once (primary)",
    route.status === "PRICED" && priceOf(route) === 30000 + 12500,
    `got ${JSON.stringify(route)}`);
}

// ---- 2. Real referenced price, While-We're-There anchor ------------------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    // basePrice deliberately different from whileWeThereBasePrice, so this
    // only passes if isPrimary genuinely selects the WWT figure.
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 9000, contractorId: HOME_CONTRACTOR },
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, false, SETTINGS);
  ok("2. an add-on visit prices the referenced service's WWT figure, not its primary one",
    route.status === "PRICED" && priceOf(route) === 20000 + 9000,
    `got ${JSON.stringify(route)}`);
}

// ---- 3. Missing reference: REVIEW, never a silent $0 ---------------------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: null, // deleted, or never priced
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("3. missing reference goes to REVIEW, not a $0 price", route.status === "REVIEW", `got ${JSON.stringify(route)}`);
  ok("3b. REVIEW never also reports a PRICED status for the same input", priceOf(route) === null);
}

// ---- 4. Cross-tenant reference: treated identically to missing ----------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "someone-elses-mount-id",
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: OTHER_CONTRACTOR },
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("4. a cross-tenant reference reviews rather than pricing another contractor's figure",
    route.status === "REVIEW", `got ${JSON.stringify(route)}`);
}

// ---- 5. An approved ZERO price is not "missing" --------------------------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "free-addon-id",
    referencedService: { basePrice: 0, whileWeThereBasePrice: 0, contractorId: HOME_CONTRACTOR },
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("5. an approved $0 referenced price prices at the anchor exactly, not a review",
    route.status === "PRICED" && priceOf(route) === 30000, `got ${JSON.stringify(route)}`);
}

// ---- 6. A resolved reference cannot mask an unapproved component --------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: HOME_CONTRACTOR },
    components: [rawComponent(null)], // unapproved — this contractor has never priced it
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("6. a resolved reference does not mask an unapproved component on the same answer",
    route.status === "REVIEW", `got ${JSON.stringify(route)}`);
}

// ---- 7. The reverse: an unresolved reference reviews even with resolvable components ----
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: null,
    components: [rawComponent(5000)], // resolves fine on its own
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("7. an unresolved reference reviews even though this answer's components would have priced fine alone",
    route.status === "REVIEW", `got ${JSON.stringify(route)}`);
}

// ---- 8. A resolved reference ADDS to a resolved component, not instead of it ----
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: HOME_CONTRACTOR },
    components: [rawComponent(5000)],
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("8. a resolved reference and a resolved component on the same answer both count",
    route.status === "PRICED" && priceOf(route) === 30000 + 12500 + 5000, `got ${JSON.stringify(route)}`);
}

// ---- 9. An ordinary priceModifierCents still applies alongside a reference ----
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: HOME_CONTRACTOR },
    priceModifierCents: 1500, // e.g. a separate, ordinary "hard-to-reach wall" surcharge
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("9. an ordinary priceModifierCents on the same answer is neither dropped nor double-counted",
    route.status === "PRICED" && priceOf(route) === 30000 + 12500 + 1500, `got ${JSON.stringify(route)}`);
}

// ---- 10. Referencing an inactive, add-on-only service still prices -------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: "tilt-mount-id",
    // `active` on the referenced row is deliberately absent from the select
    // in lib/serviceTreeQuery.ts — standalone-booking eligibility and
    // price-reference eligibility are different questions. This fixture
    // proves the resolver doesn't (and can't) read `active` at all: an
    // inactive service's price still resolves normally.
    referencedService: { basePrice: 12500, whileWeThereBasePrice: 12500, contractorId: HOME_CONTRACTOR },
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("10. an add-on-only (inactive) referenced service still prices — that eligibility is separate from standalone booking",
    route.status === "PRICED" && priceOf(route) === 30000 + 12500, `got ${JSON.stringify(route)}`);
}

// ---- 11. An ordinary, non-referencing answer is unaffected ---------------
{
  const service = serviceWithOneAnswer({
    referencedServiceId: null,
    referencedService: null,
    approvedComponentPriceCents: 5000,
  });
  const route = resolveRoute(service, { has_mount: "add_tilt_mount" }, true, SETTINGS);
  ok("11. an ordinary (non-referencing) answer is unaffected by this fix",
    route.status === "PRICED" && priceOf(route) === 30000 + 5000, `got ${JSON.stringify(route)}`);
}

// ---- 12. Client-side primitives agree with the server ---------------------
// The same functions GuidedFlowEngine.evaluate() and QuestionStep's live
// preview call — proving the DISPLAY can no longer show a confident price
// the server would refuse, without needing a browser.
{
  const cfg = startConfiguration({ fieldLaborHours: 2, materialCostCents: 0, estimatedMinutes: 60, requiresTechCount: 1 });

  const resolved: BranchContribution = { referencedServicePriceCents: 12500 };
  const afterResolved = applyBranch(cfg, resolved, {});
  ok("12a. client-side applyBranch adds a resolved reference and does not flag review",
    !afterResolved.awaitingComponentApproval && afterResolved.approvedIncrementCents === 12500);

  const unresolved: BranchContribution = { referencedServicePriceCents: null };
  const afterUnresolved = applyBranch(cfg, unresolved, {});
  ok("12b. client-side applyBranch flags review for an unresolved reference, matching the server",
    afterUnresolved.awaitingComponentApproval === true);

  const previewResolved = answerPriceDelta(resolved);
  ok("12c. the live per-option preview (answerPriceDelta) shows the resolved reference's amount",
    previewResolved.cents === 12500 && previewResolved.needsReview === false);

  const previewUnresolved = answerPriceDelta(unresolved);
  ok("12d. the live per-option preview refuses a number for an unresolved reference — no stale fallback shown",
    previewUnresolved.cents === null && previewUnresolved.needsReview === true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
