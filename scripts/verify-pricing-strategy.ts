/**
 * A contractor can make either customer promise, and neither leaks — ADR-018.
 *
 * FLAT_RATE promises a price. TIME_AND_MATERIALS promises a rate and a range.
 * The dangerous failures are the two crossings: a fixed price rendered as a
 * T&M guarantee, or an estimate rendered as a fixed price. Both would be
 * legible, plausible and wrong, so both are asserted rather than assumed.
 *
 * MUTATES REAL DATA (a throwaway contractor). Runs in `npm run verify:template`,
 * never in the deploy gate.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";
import { loadEnv } from "./_env";
import { readiness, validateEstimateBounds, suggestBounds } from "../lib/pricingReadiness";
import { estimateRange } from "../lib/timeAndMaterials";
import { pricingCopy, FORBIDDEN_TOTAL_LABELS, TM_RANGE_LABELS } from "../lib/pricingCopy";
import { withThrowaway } from "./_throwaway";
import { startConfiguration, applyBranch } from "../lib/pricing";

loadEnv();
const prisma = new PrismaClient();
const THROWAWAY = "__pricing-strategy-proof__";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const SETTINGS = { crewHourRateCents: 14900, primaryMinimumCents: 25000,
                   roundingIncrementCents: 500, defaultPermitAdminCents: 0 };

const BASE = {
  bookingType: "INSTANT", active: true,
  publishedPriceApprovedAt: null as Date | null, basePrice: null as number | null,
  materialCostResolved: true, unresolvedMaterialKeys: [] as string[], unresolvedPolicyKeys: [] as string[],
  estimateLowCrewHours: null as number | null, estimateHighCrewHours: null as number | null,
  estimateApprovedAt: null as Date | null,
};

function bounds() {
  console.log("\n  BOUNDS ARE VALIDATED STRUCTURALLY");
  ok(validateEstimateBounds(5, 8).length === 0, "5–8 is valid");
  ok(validateEstimateBounds(5, 5).length === 0, "a single-value band (5–5) is valid");
  ok(validateEstimateBounds(null, 8).some((b) => b.code === "unset"), "a missing low is unresolved");
  ok(validateEstimateBounds(5, null).some((b) => b.code === "unset"), "a missing high is unresolved");
  ok(validateEstimateBounds(0, 8).some((b) => b.code === "low-not-positive"),
    "ZERO IS REFUSED as a low bound, never read as unknown");
  ok(validateEstimateBounds(-2, 8).some((b) => b.code === "low-not-positive"), "negative is refused");
  ok(validateEstimateBounds(8, 5).some((b) => b.code === "high-below-low"), "an inverted band is refused");
  ok(validateEstimateBounds(NaN, 8).length > 0, "NaN is refused");

  // The midpoint is NOT required to equal the baseline: asymmetric risk is
  // real, and forcing symmetry would make contractors lie to the form.
  const r = readiness({ ...BASE, estimateLowCrewHours: 2, estimateHighCrewHours: 9,
                        estimateApprovedAt: new Date() }, "TIME_AND_MATERIALS");
  ok(r.ready, "a 2–9 band against any baseline is accepted — no midpoint rule");
}

function suggestion() {
  console.log("\n  PRICE2BOOK SUGGESTS; THE CONTRACTOR APPROVES");
  const s = suggestBounds(4)!;
  ok(s.low < 4 && s.high > 4, `a suggestion straddles the baseline (${s.low}–${s.high} from 4)`);
  ok(s.high - 4 > 4 - s.low, "…asymmetrically, because jobs overrun more often than they finish early");
  ok(suggestBounds(null) === null && suggestBounds(0) === null,
    "no baseline yields no suggestion rather than a made-up one");

  // A suggestion is not an approval. This is the rule the whole design rests on.
  const suggested = readiness({ ...BASE, estimateLowCrewHours: s.low, estimateHighCrewHours: s.high,
                                estimateApprovedAt: null }, "TIME_AND_MATERIALS");
  ok(!suggested.ready && suggested.blockers.some((b) => b.code === "estimate-not-approved"),
    "bounds present but unapproved are NOT publishable");
}

function strategySpecific() {
  console.log("\n  READINESS IS STRATEGY-SPECIFIC");
  const flatOnly = { ...BASE, publishedPriceApprovedAt: new Date(), basePrice: 28000 };
  ok(readiness(flatOnly, "FLAT_RATE").ready, "a priced service is ready for flat rate");
  ok(!readiness(flatOnly, "TIME_AND_MATERIALS").ready,
    "…and NOT ready for T&M, because it has no approved bounds");

  const tmOnly = { ...BASE, estimateLowCrewHours: 5, estimateHighCrewHours: 8, estimateApprovedAt: new Date() };
  ok(readiness(tmOnly, "TIME_AND_MATERIALS").ready, "a calibrated service is ready for T&M");
  ok(!readiness(tmOnly, "FLAT_RATE").ready,
    "…and NOT ready for flat rate, because it has no approved price");

  // Shared gates apply under both.
  const noMaterials = { ...flatOnly, materialCostResolved: false, unresolvedMaterialKeys: ["WIRE_14_2"] };
  ok(!readiness(noMaterials, "FLAT_RATE").ready && !readiness(noMaterials, "TIME_AND_MATERIALS").ready,
    "an unresolved material blocks BOTH strategies");

  const quote = { ...BASE, bookingType: "REMOTE_QUOTE" };
  ok(readiness(quote, "FLAT_RATE").ready && readiness(quote, "TIME_AND_MATERIALS").ready,
    "a quote-only service is ready under both — a human prices it by design");
}

function estimating() {
  console.log("\n  THE ESTIMATE FAILS CLOSED");
  const approved = new Date();
  const good = estimateRange({ estimateLowCrewHours: 5, estimateHighCrewHours: 8,
    estimateApproved: true, addedCrewHours: 0, materialCostCents: 15000 }, SETTINGS);
  ok(good.ok && good.lowHours === 5 && good.highHours === 8, "a valid band estimates");
  ok(good.ok && good.lowLaborCents === 74500 && good.highLaborCents === 119200,
    `labor is hours x crew-hour rate (${good.ok ? good.lowLaborCents : "-"}–${good.ok ? good.highLaborCents : "-"} at $149)`);
  ok(good.ok && good.lowTotalCents === 89500 && good.highTotalCents === 134200,
    "…and materials are added once, as a single estimated figure");

  // The floor is a fixed-price concept. Applying it here would advertise a
  // charge the final invoice may not contain.
  ok(good.ok && good.lowTotalCents !== SETTINGS.primaryMinimumCents,
    "the flat-rate minimum is not applied to an estimate");

  for (const [label, inp] of [
    ["unset bounds", { estimateLowCrewHours: null, estimateHighCrewHours: null }],
    ["zero low", { estimateLowCrewHours: 0, estimateHighCrewHours: 8 }],
    ["inverted", { estimateLowCrewHours: 9, estimateHighCrewHours: 2 }],
  ] as const) {
    const r = estimateRange({ ...inp, estimateApproved: true, addedCrewHours: 0, materialCostCents: null }, SETTINGS);
    ok(!r.ok, `${label} produces a refusal, never a manufactured range`);
  }
  const unapproved = estimateRange({ estimateLowCrewHours: 5, estimateHighCrewHours: 8,
    estimateApproved: false, addedCrewHours: 0, materialCostCents: null }, SETTINGS);
  ok(!unapproved.ok, "unapproved bounds produce a refusal");

  const noRate = estimateRange({ estimateLowCrewHours: 5, estimateHighCrewHours: 8,
    estimateApproved: true, addedCrewHours: 0, materialCostCents: null },
    { ...SETTINGS, crewHourRateCents: 0 });
  ok(!noRate.ok, "a zero crew-hour rate produces a refusal, not a free job");

  // Answer-driven duration widens the estimate rather than being averaged out.
  const withAdds = estimateRange({ estimateLowCrewHours: 5, estimateHighCrewHours: 8,
    estimateApproved: true, addedCrewHours: 1.5, materialCostCents: null }, SETTINGS);
  ok(withAdds.ok && withAdds.lowHours === 6.5 && withAdds.highHours === 9.5,
    "crew-hours the answers add move BOTH ends of the range");
}

function noCrossing() {
  console.log("\n  NEITHER PROMISE LEAKS INTO THE OTHER");
  const flat = pricingCopy("FLAT_RATE"), tm = pricingCopy("TIME_AND_MATERIALS");
  ok(flat.estimateNotice === null, "a fixed price carries no estimate notice");
  ok(tm.estimateNotice !== null && /estimate/i.test(tm.estimateNotice!),
    "an estimate always carries one");
  ok(!/estimate/i.test(flat.resolvedPriceLabel) && /estimat/i.test(tm.resolvedPriceLabel),
    `the resolved figure is labeled differently ("${flat.resolvedPriceLabel}" vs "${tm.resolvedPriceLabel}")`);
  ok(/book/i.test(flat.commitCta) && /authori/i.test(tm.commitCta),
    `the commitment differs ("${flat.commitCta}" vs "${tm.commitCta}")`);
  ok(!/price/i.test(tm.headline), "T&M's headline promises no price");

  // V1 quotes LABOR and discloses materials separately, so no label the
  // customer sees may promote that range into the whole bill.
  const mislabeled = TM_RANGE_LABELS(tm).filter((l) => FORBIDDEN_TOTAL_LABELS.test(l));
  ok(mislabeled.length === 0,
    `no T&M label calls the labor-only range a total ("${tm.resolvedPriceLabel}")`,
    mislabeled.join(", "));
  ok(/labor/i.test(tm.resolvedPriceLabel),
    "…and it says what the range actually covers");
  ok(tm.materialsNotice !== null && /materials/i.test(tm.materialsNotice!),
    "materials are disclosed as a separate charge");
  // The flat-rate price DOES include everything, so it is free to be a total.
  ok(!/labor/i.test(flat.resolvedPriceLabel),
    "a flat-rate price is not described as labor — it includes materials");

  // The estimate card must not author its own contractual wording.
  const card = readFileSync("components/guided-flow/EstimateRangeCard.tsx", "utf8");
  ok(/copy\.estimateNotice/.test(card), "the estimate card renders the authored notice");
  ok(!/final invoice|not a fixed[- ]price|actual time and materials/i.test(
       card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")),
    "…and contains no contractual wording of its own");

  // Copy must change through the strategy, never through who the contractor is.
  const src = sourceFiles(["components/guided-flow", "lib/timeAndMaterials.ts", "lib/pricingReadiness.ts"]).join("\n")
    .split("\n").filter((f) => /\.tsx?$/.test(f))
    .map((f) => readFileSync(f, "utf8")).join("\n");
  ok(!/contractorS(lug|ubdomain)\s*===|contractorId\s*===\s*["'`]/.test(src),
    "no pricing component branches on which contractor it is");
}

async function switching() {
  console.log("\n  SWITCHING PRESERVES THE OTHER STRATEGY'S CONFIGURATION");
  await withThrowaway(prisma, THROWAWAY, "Pricing Strategy Proof", async (id) => {
    // Service still carries the DEPRECATED platform-level categoryId. An
    // existing row is reused rather than a new one created: it is platform
    // data, and a throwaway proof has no business adding to it.
    const cat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
    const svc = await prisma.service.create({
      data: {
        contractorId: id, categoryId: cat.id, slug: "proof-service", name: "Proof Service",
        bookingType: "INSTANT", photoState: "NONE",
        basePrice: 28000, publishedPriceApprovedAt: new Date(),
        fieldLaborHours: 2, estimatedMinutes: 120,
        estimateLowCrewHours: 1.5, estimateHighCrewHours: 3.5, estimateApprovedAt: new Date(),
      },
      select: { id: true, basePrice: true, publishedPriceApprovedAt: true,
                estimateLowCrewHours: true, estimateHighCrewHours: true },
    });
    const before = JSON.stringify(svc);

    await prisma.contractor.update({ where: { id }, data: { pricingStrategy: "TIME_AND_MATERIALS" } });
    const afterTm = await prisma.service.findUniqueOrThrow({
      where: { id: svc.id },
      select: { id: true, basePrice: true, publishedPriceApprovedAt: true,
                estimateLowCrewHours: true, estimateHighCrewHours: true } });
    ok(JSON.stringify(afterTm) === before,
      "switching FLAT_RATE -> T&M erases no flat-rate configuration", JSON.stringify(afterTm));

    await prisma.contractor.update({ where: { id }, data: { pricingStrategy: "FLAT_RATE" } });
    const back = await prisma.service.findUniqueOrThrow({
      where: { id: svc.id },
      select: { id: true, basePrice: true, publishedPriceApprovedAt: true,
                estimateLowCrewHours: true, estimateHighCrewHours: true } });
    ok(JSON.stringify(back) === before,
      "…and switching back finds everything exactly as it was", JSON.stringify(back));

    // A service calibrated for neither surfaces as unresolved under both.
    const bare = await prisma.service.create({
      data: { contractorId: id, categoryId: cat.id, slug: "bare-service", name: "Bare Service",
              bookingType: "INSTANT", photoState: "NONE" },
      select: { bookingType: true, active: true, publishedPriceApprovedAt: true, basePrice: true,
                materialCostResolved: true, unresolvedMaterialKeys: true, unresolvedPolicyKeys: true,
                estimateLowCrewHours: true, estimateHighCrewHours: true, estimateApprovedAt: true } });
    ok(!readiness(bare, "FLAT_RATE").ready && !readiness(bare, "TIME_AND_MATERIALS").ready,
      "a service configured for neither is unresolved under both — never zero");
    ok(bare.estimateLowCrewHours === null && bare.estimateHighCrewHours === null,
      "…and its bounds are NULL, not 0", JSON.stringify(bare));
  });
}

/**
 * The failure this guards against: a beautiful T&M screen whose customer range
 * ignores the scope decisions that made the job bigger.
 *
 * Runs the REAL engine — startConfiguration and applyBranch, the same
 * functions the guided flow calls — rather than asserting against a number
 * typed into the test.
 */
function scopeDrivesTheRange() {
  console.log("\n  SCOPE DECISIONS MOVE THE CUSTOMER'S RANGE");
  const approved = true;
  const svc = { fieldLaborHours: 2.5, materialCostCents: 0, estimatedMinutes: 150, requiresTechCount: 1 };

  const base = startConfiguration(svc);
  ok(base.addedCrewHours === 0, "a fresh configuration has added nothing");

  // An answer selecting a component that adds an hour of crew time.
  const withComponent = applyBranch(base, {
    components: [{
      quantity: 1,
      conditionAccessClass: null, conditionAnswerKey: null, conditionAnswerValue: null,
      component: { key: "EXTRA_RUN", customerFacingLabel: "Extra run", approvedPriceCents: 9900,
                   addFieldLaborHours: 1, addMaterialCostCents: 0, addScheduleMinutes: 0, addTechCount: 0 },
    }],
  } as never, {});
  ok(withComponent.addedCrewHours === 1,
    `the engine records the component's hour as an increment (${withComponent.addedCrewHours})`);

  // THE RULE: the contractor's approved band describes the BASE service's
  // uncertainty; a component adds a known, already-decided quantity of work.
  // So both bounds move by the same amount — the band does not widen or
  // rescale around a new midpoint.
  const e = estimateRange({ estimateLowCrewHours: 2, estimateHighCrewHours: 3,
    estimateApproved: approved, addedCrewHours: withComponent.addedCrewHours,
    materialCostCents: null }, SETTINGS);
  ok(e.ok && e.lowHours === 3 && e.highHours === 4,
    `2–3 hours plus a 1-hour component estimates 3–4 hours`,
    e.ok ? `${e.lowHours}–${e.highHours}` : e.reason);
  ok(e.ok && (e.highHours - e.lowHours) === 1,
    "…and the band's WIDTH is unchanged — the component is known work, not new uncertainty");

  // Quantity multiplies the increment.
  const three = applyBranch(base, {
    components: [{
      quantity: 3,
      conditionAccessClass: null, conditionAnswerKey: null, conditionAnswerValue: null,
      component: { key: "EXTRA_RUN", customerFacingLabel: "Extra run", approvedPriceCents: 9900,
                   addFieldLaborHours: 0.5, addMaterialCostCents: 0, addScheduleMinutes: 0, addTechCount: 0 },
    }],
  } as never, {});
  ok(three.addedCrewHours === 1.5, `quantity multiplies the increment (${three.addedCrewHours} from 3 x 0.5)`);

  // Increments accumulate across successive answers, not just the last one.
  const twice = applyBranch(withComponent, {
    components: [{
      quantity: 1,
      conditionAccessClass: null, conditionAnswerKey: null, conditionAnswerValue: null,
      component: { key: "SECOND", customerFacingLabel: "Second", approvedPriceCents: 4900,
                   addFieldLaborHours: 0.75, addMaterialCostCents: 0, addScheduleMinutes: 0, addTechCount: 0 },
    }],
  } as never, {});
  ok(twice.addedCrewHours === 1.75, `increments accumulate along the route (${twice.addedCrewHours})`);

  // A branch whose condition does not match must add nothing.
  const unmatched = applyBranch(base, {
    components: [{
      quantity: 1,
      conditionAccessClass: "FINISHED", conditionAnswerKey: null, conditionAnswerValue: null,
      component: { key: "ONLY_FINISHED", customerFacingLabel: null, approvedPriceCents: 100,
                   addFieldLaborHours: 4, addMaterialCostCents: 0, addScheduleMinutes: 0, addTechCount: 0 },
    }],
  } as never, {});
  ok(unmatched.addedCrewHours === 0,
    "a component whose condition does not match adds no hours",
    String(unmatched.addedCrewHours));

  // And the engine wired into the flow reads the SAME accumulator the flow
  // passes through, so a screen cannot show a range the scope did not produce.
  const flow = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
  ok(/addedCrewHours:\s*nextConfig\.addedCrewHours/.test(flow),
    "the guided flow carries the engine's increment into the resolved state");
  ok(/addedCrewHours:\s*state\.addedCrewHours/.test(flow),
    "…and passes that same value into the estimate");
  const materialArgs = [...flow.matchAll(/materialCostCents:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  ok(materialArgs.length > 0 && materialArgs.every((v) => v === "null"),
    `the flow passes no materials figure it cannot compute correctly (${materialArgs.join(", ") || "none"})`);
}

async function main() {
  console.log("\nPRICING STRATEGY");
  bounds(); suggestion(); strategySpecific(); estimating(); noCrossing(); scopeDrivesTheRange();
  await switching();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
