/**
 * THE STOREFRONT ASKS THE SERVER FOR A DERIVED PRICE — and nothing else moved.
 *
 *   npx tsx scripts/verify-storefront-derived-pricing.ts
 *
 * Stage 1A's rehearsal found every homeowner sent to review on the FIRST answer
 * of a derived service: the guided flow priced in the browser from a published
 * base price that a DERIVED_RESOLVED_SCOPE service does not have. The fix keeps
 * tree navigation in the browser and makes the server the pricing authority at
 * the terminal answer (POST /api/price-evaluation), through the SAME read-only
 * plan POST /api/visit runs before it writes.
 *
 * This suite covers the decision, the boundary and the server outcomes. The
 * browser itself is driven by verify-storefront-derived-pricing-browser.ts.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { flowPriceSource } from "../lib/guidedFlowPricing";
import { startDisplayConfiguration, type JobConfiguration } from "../lib/pricing";
import { evaluateStorefrontPrice, REVIEW_MESSAGE } from "../lib/storefrontPriceEvaluation";
import { planNewLine } from "../lib/visitLinePlanning";
import { loadServiceForResolution } from "../lib/routeResolver";
import { PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS } from "../prisma/seed-new-outlet-v2";
import { withContractor } from "../lib/tenantRoute";
import { asTenant, buildPricedDerivedContractor, changeChannelCost, fixtureSlug, reapprove, removeFixture } from "./_derivedStorefrontFixture";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const SLUG = fixtureSlug("sfprice");
const TM_SLUG = fixtureSlug("sfprice-tm");
const src = (f: string) => readFileSync(f, "utf8");
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function main() {
  console.log("\nSTOREFRONT DERIVED PRICING — THE SERVER IS THE AUTHORITY\n");

  console.log("  U  WHERE A FLOW PRICE COMES FROM\n");
  const cfg = (over: Partial<JobConfiguration> = {}) => ({ ...startDisplayConfiguration({ questions: [] } as never), ...over }) as JobConfiguration;
  const d0 = flowPriceSource("DERIVED_RESOLVED_SCOPE", cfg(), null);
  ok(d0.source === "SERVER", "U  derived service with basePrice null → SERVER, not review", JSON.stringify(d0));
  const d1 = flowPriceSource("DERIVED_RESOLVED_SCOPE", cfg({ awaitingComponentApproval: true } as never), null);
  ok(d1.source === "SERVER", "U  …even when its components carry no approved customer price", JSON.stringify(d1));
  const l0 = flowPriceSource("LEGACY_PUBLISHED", cfg(), null);
  ok(l0.source === "PUBLISHED_REVIEW", "U  legacy service with no published price → review, unchanged", JSON.stringify(l0));
  const l1 = flowPriceSource("LEGACY_PUBLISHED", cfg({ approvedIncrementCents: 2500 } as never), 21500);
  ok(l1.source === "PUBLISHED" && l1.totalCents === 24000, "U  legacy published $215 + approved $25 increment → $240, unchanged", JSON.stringify(l1));
  const l2 = flowPriceSource("LEGACY_PUBLISHED", cfg({ awaitingComponentApproval: true } as never), 21500);
  ok(l2.source === "PUBLISHED_REVIEW", "U  legacy branch awaiting component approval → review, unchanged", JSON.stringify(l2));
  ok(flowPriceSource(undefined, cfg(), 21500).source === "PUBLISHED", "U  a flow without a pricing method keeps the legacy path");

  console.log("\n  S  NO DERIVED ECONOMICS IN THE BROWSER, NO WRITES IN THE EVALUATOR\n");
  const engine = code("components/guided-flow/GuidedFlowEngine.tsx");
  ok(/import \{ flowPriceSource \} from "@\/lib\/guidedFlowPricing";/.test(engine) && !/\bcustomerPrice\b/.test(engine),
    "S  the guided flow decides through flowPriceSource and never calls customerPrice itself");
  // The time-and-materials range card legitimately shows the rate the server
  // sent for THAT strategy (ADR-018); those lines are not derived economics.
  const browserSide = (engine + code("lib/guidedFlowPricing.ts")).split("\n").filter((l) => !/timeAndMaterials/.test(l)).join("\n");
  const economics = browserSide.match(/suggestConfigurationPrice|suggestPrimaryPrice|calculateMaterialSellCents|materialTakeoff|derivedScopePricing|loadDerivedScope|resolveWithDerivedPricing|crewHourRateCents|packagePriceCents|ContractorComponent|approvedBasisFingerprint/g);
  ok(!economics, "S  no labor, material, markup, approval or derived-scope code reaches the browser bundle's pricing path", String(economics));
  ok(/siteFetch\("\/api\/price-evaluation"/.test(engine) && /pricingMethod === "DERIVED_RESOLVED_SCOPE"/.test(engine),
    "S  a derived flow asks POST /api/price-evaluation");
  const dto = code("app/api/services/[slug]/route.ts");
  ok(/pricingMethod: service\.pricingMethod,/.test(dto), "S  the service payload carries the pricing METHOD label only");
  const evalLib = code("lib/storefrontPriceEvaluation.ts"), evalRoute = code("app/api/price-evaluation/route.ts"), planLib = code("lib/visitLinePlanning.ts");
  const writes = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$transaction|findOrCreateOpenVisit|getOrCreateSessionId|pilotLog/;
  ok(!writes.test(evalLib) && !writes.test(evalRoute) && !writes.test(planLib),
    "S  evaluator, its route and the shared plan contain no write, no visit creation, no session issuing",
    [evalLib, evalRoute, planLib].map((t) => t.match(writes)?.[0]).join(" | "));
  ok(/getSessionId\(\)/.test(evalRoute) && /requireSiteFromRequest\(req\)/.test(evalRoute) && /withSite\(site/.test(evalRoute),
    "S  the evaluator takes the tenant from the storefront identifier and reads the session without issuing one");
  const visit = code("app/api/visit/route.ts");
  ok(/const plan = await planNewLine\(db, \{ contractorId: site\.contractorId, service, answersSnapshot, existing \}\);/.test(visit)
    && /await planNewLine\(guarded,/.test(evalLib),
    "S  /api/visit and the evaluator consume the SAME planNewLine");
  ok(!/computedPriceCents/.test(evalRoute) && !/priceCents/.test(visit.match(/const \{ serviceId, answersSnapshot, photos \} = body;/)?.[0] ?? "x"),
    "S  the browser still cannot hand a price to either endpoint");

  await removeFixture(prisma, SLUG);
  await removeFixture(prisma, TM_SLUG);
  try {
    console.log("\n  D  THE SERVER'S ANSWERS, ON A REAL REHEARSAL CONTRACTOR\n");
    const f = await buildPricedDerivedContractor(prisma, SLUG);
    const other = await prisma.service.findFirstOrThrow({ where: { contractor: { slug: "elite-electric" } }, select: { id: true } });
    const legacy = await prisma.service.findFirstOrThrow({ where: { contractorId: f.contractorId, pricingMethod: "LEGACY_PUBLISHED" }, select: { id: true } });
    // Fixture state only: an ACTIVE published-price service to ask about (an
    // inactive one is unknown to the storefront before its method is read).
    await prisma.service.update({ where: { id: legacy.id }, data: { active: true } });
    const evaluate = (answers: Record<string, string>, serviceId = f.serviceId, sessionId: string | null = null) =>
      withContractor(f.contractorId, "site-identifier", (db) => evaluateStorefrontPrice(db as never, { contractorId: f.contractorId, sessionId, serviceId, answers }));
    const counts = async () => ({
      visits: await prisma.visit.count({ where: { contractorId: f.contractorId } }),
      lineItems: await prisma.lineItem.count({ where: { visit: { contractorId: f.contractorId } } }),
      approval: (await prisma.contractorDerivedPricingApproval.findUniqueOrThrow({ where: { contractorId_serviceId: { contractorId: f.contractorId, serviceId: f.serviceId } }, select: { updatedAt: true, approvedTotalCents: true } })),
      // A READ, one field per line: the published price columns must still be empty.
      service: await prisma.service.findUniqueOrThrow({
        where: { id: f.serviceId },
        select: {
          active: true,
          basePrice: true,
          whileWeThereBasePrice: true,
          publishedPriceApprovedAt: true,
          pricingMethod: true,
        },
      }),
      pricing: await prisma.pricingSettings.findUniqueOrThrow({ where: { contractorId: f.contractorId }, select: { updatedAt: true } }),
    });
    const before = await counts();

    const priced = await evaluate(PILOT_ANSWERS, f.serviceId, "no-such-session-token");
    ok(priced.ok && priced.evaluation.outcome === "PRICED", "D  straight surface route → PRICED", JSON.stringify(priced));
    const shown = priced.ok && priced.evaluation.outcome === "PRICED" ? priced.evaluation.priceCents : -1;
    ok(shown === f.approvedTotalCents, `D  …at the approved derived price ($${shown / 100}, approved $${(f.approvedTotalCents ?? 0) / 100})`);
    ok(priced.ok && Object.keys(priced.evaluation).sort().join() === "outcome,priceCents",
      "D  …and the PRICED answer carries only the outcome and the customer's price", JSON.stringify(priced));

    const ordinaryOutletAnswers = {
      outlet_load_type: "everyday",
      outlet_power_source: "tap_existing",
    };
    const accessible = await evaluate({
      ...ordinaryOutletAnswers,
      below_above_access: "has_access",
      [OUTLET_V2_KEYS.accessibleSide]: "below",
      [OUTLET_V2_KEYS.accessibleExterior]: "interior",
      [OUTLET_V2_KEYS.accessibleSurface]: "drywall",
      [ACCESSIBLE_KEYS.feet]: "15",
    });
    ok(accessible.ok && accessible.evaluation.outcome === "PRICED",
      "D  the SAME service approval covers an accessible route → PRICED", JSON.stringify(accessible));

    const finishedAnswers = {
      ...ordinaryOutletAnswers,
      below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "concealed",
      [FINISHED_KEYS.backToBack]: "no",
      [FINISHED_KEYS.feet]: "15",
      [FINISHED_KEYS.surface]: "drywall",
      [FINISHED_KEYS.obstacles]: "clear",
    };
    const baseboard = await evaluate({ ...finishedAnswers, [FINISHED_KEYS.method]: "baseboard" });
    ok(baseboard.ok && baseboard.evaluation.outcome === "PRICED",
      "D  the SAME service approval covers a baseboard route → PRICED", JSON.stringify(baseboard));
    const drywall = await evaluate({ ...finishedAnswers, [FINISHED_KEYS.method]: "drywall_access" });
    ok(drywall.ok && drywall.evaluation.outcome === "PRICED",
      "D  the SAME service approval covers a drywall-access route → PRICED", JSON.stringify(drywall));

    const loaded = await loadServiceForResolution(prisma, f.serviceId);
    const plan = await withContractor(f.contractorId, "site-identifier", (db) => planNewLine(db as never, { contractorId: f.contractorId, service: loaded as never, answersSnapshot: PILOT_ANSWERS, existing: [] }));
    ok(plan.kind === "PLACED" && plan.resolved.status === "PRICED" && plan.resolved.priceCents === shown,
      "D  the evaluator's price is exactly what /api/visit's plan would store", JSON.stringify(plan.kind === "PLACED" ? { s: plan.resolved.status, p: (plan.resolved as { priceCents?: number }).priceCents } : plan));

    const turned = await evaluate({ ...PILOT_ANSWERS, [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.flat]: "1" });
    ok(turned.ok && turned.evaluation.outcome === "REVIEW", "D  turned surface route → REVIEW", JSON.stringify(turned));
    const reviewText = JSON.stringify(turned);
    ok(turned.ok && turned.evaluation.outcome === "REVIEW" && turned.evaluation.message === REVIEW_MESSAGE && !/approv|econom|contractor|takeoff|segment|offcut|fingerprint|labor|markup/i.test(reviewText),
      "D  …with customer-safe words only — no contractor-facing reason", reviewText);

    const after = await counts();
    ok(JSON.stringify(after) === JSON.stringify(before), "D  evaluation wrote nothing: no visit, line item, approval, service or pricing change",
      `${JSON.stringify(before)}\n         ${JSON.stringify(after)}`);

    const foreign = await evaluate(PILOT_ANSWERS, other.id);
    ok(!foreign.ok && foreign.refusal.status === 404, "D  another tenant's service id reads as unknown (404)", JSON.stringify(foreign));
    const leg = await evaluate({}, legacy.id);
    ok(!leg.ok && leg.refusal.error === "NOT_SERVER_PRICED", "D  a published-price service is not server-priced (legacy path untouched)", JSON.stringify(leg));
    const bad = await evaluate({ x: 1 } as never);
    ok(!bad.ok && bad.refusal.status === 400, "D  malformed answers are refused, not guessed at");

    await changeChannelCost(f.contractorId, 1699);
    const stale = await evaluate(PILOT_ANSWERS);
    ok(stale.ok && stale.evaluation.outcome === "REVIEW", "D  a material cost change makes the approval stale → REVIEW, not the old price", JSON.stringify(stale));
    const newTotal = await reapprove(prisma, f.contractorId, f.serviceId);
    const back = await evaluate(PILOT_ANSWERS);
    ok(back.ok && back.evaluation.outcome === "PRICED" && back.evaluation.priceCents === newTotal && newTotal !== shown,
      `D  re-approved → PRICED again at the NEW derived amount ($${newTotal / 100})`, JSON.stringify(back));

    console.log("\n  T  AN INELIGIBLE CONTRACTOR\n");
    const t = await buildPricedDerivedContractor(prisma, TM_SLUG, "TIME_AND_MATERIALS");
    await prisma.service.update({ where: { id: t.serviceId }, data: { active: true } });   // fixture: live without the pilot path, to ask the evaluator
    const tm = await withContractor(t.contractorId, "site-identifier", (db) => evaluateStorefrontPrice(db as never, { contractorId: t.contractorId, sessionId: null, serviceId: t.serviceId, answers: PILOT_ANSWERS }));
    ok(tm.ok && tm.evaluation.outcome === "REVIEW", "T  a time-and-materials contractor's derived service → REVIEW, never a price", JSON.stringify(tm));
  } finally {
    await removeFixture(prisma, SLUG);
    await removeFixture(prisma, TM_SLUG);
    ok(await prisma.contractor.count({ where: { slug: { in: [SLUG, TM_SLUG] } } }) === 0, "   every fixture contractor this run created is gone");
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await removeFixture(prisma, SLUG).catch(() => {}); await removeFixture(prisma, TM_SLUG).catch(() => {}); await prisma.$disconnect(); process.exit(1); });
