/**
 * Publish the Generator Inlet + Interlock starting package — Phase F rescue #2.
 *
 *   npx tsx scripts/publish-generator-package.ts          report
 *   npx tsx scripts/publish-generator-package.ts --apply  publish
 *
 * Same three gates as the doorbell publisher, plus the one this service needed
 * and the doorbell did not:
 *
 *   1. the price is DERIVED, never typed, and a null from the engine refuses
 *   2. the TREE must enforce the scope the price assumes — exactly one route
 *      prices, several reach review, none reaches nothing
 *   3. no price already exists, because repricing is not a build step
 *   4. NO ROLE IN THE RECIPE IS ON A COST HOLD
 *
 * The fourth is why this service waited. Its 10 ft of WIRE_10_3 was costed
 * from a short package at $4.48/ft; the recheck came back $1.60/ft from a
 * 250 ft roll, which moved the material by $28.80 and the price with it.
 * Publishing before that would have promised a number built on a figure
 * nobody had confirmed — and been wrong by more than the rounding.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "../lib/pricing";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { publicationHold } from "../lib/materialHolds";
import { serviceSlugKey } from "../prisma/_serviceKey";

const prisma = new PrismaClient();

const SLUG = "generator-inlet-interlock";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nGENERATOR INLET + INTERLOCK — DERIVED PRICE\n`);

  const svc = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: {
      id: true, name: true, contractorId: true, bookingType: true,
      basePrice: true, whileWeThereBasePrice: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialCostResolved: true, materialMultiplier: true,
      permitAdminCents: true, otherDirectCostCents: true, isPrimaryEligible: true,
    },
  });
  if (!svc) { console.error(`  ${SLUG} not in the catalog.\n`); process.exit(1); }

  if (svc.basePrice !== null || svc.whileWeThereBasePrice !== null) {
    console.log(`  Already published. Repricing is a reconciliation decision.\n`);
    return;
  }
  if (svc.fieldLaborHours === null || svc.wwtLaborHours === null) {
    console.error(`  No crew-hours. Refusing.\n`); process.exit(1);
  }
  if (!svc.materialCostResolved) {
    console.error(`  Material cost unresolved. Refusing to price over a gap.\n`); process.exit(1);
  }

  // The hold gate, asked of the RECIPE rather than a remembered list.
  const hold = await publicationHold(prisma as any, svc.contractorId, SLUG);
  if (hold) {
    console.error(`  REFUSED — ${hold}`);
    console.error(`\n  Build and derive on a held cost freely; publishing on one is a`);
    console.error(`  promise built from a figure nobody stands behind.\n`);
    process.exit(1);
  }
  console.log(`  ✓ no role in this recipe is on a cost hold`);

  const settings = await loadPricingSettings(prisma as any, svc.contractorId);
  const full = await loadServiceForResolution(prisma as any, svc.id);
  if (!full || full.questions.length === 0) {
    console.error(`  No tree. Refusing to promise a price with no boundary behind it.\n`);
    process.exit(1);
  }

  const byId = new Map(full.questions.map((q: any) => [q.id, q]));
  const nk = (o: any) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId ? (byId.get(o.nextQuestionId) as any)?.key ?? null : null;
  let priced = 0, review = 0, handoff = 0, dead = 0;
  const walk = (k: string | null, ans: Record<string, string>) => {
    if (!k) {
      const r: any = resolveRoute(full as any, ans, true, settings!);
      if (r.status === "PRICED") priced++;
      else if (r.status === "REVIEW") review++;
      else if (r.status === "REROUTE") handoff++;
      else if (/has no published (base|add-on) price/.test(String(r.reason))) priced++;
      else { dead++; console.log(`      dead route: ${r.reason}`); }
      return;
    }
    const q: any = full.questions.find((x: any) => x.key === k);
    if (!q) return;
    for (const o of q.options) walk(nk(o), { ...ans, [q.key]: o.value });
  };
  walk(full.questions[0]?.key ?? null, {});

  console.log(`  ✓ routes: ${priced} priced / ${review} review / ${handoff} hand-off / ${dead} dead`);
  if (dead > 0) { console.error(`\n  Refusing: ${dead} route(s) reach nothing.\n`); process.exit(1); }
  if (priced !== 1) { console.error(`\n  Refusing: expected 1 pricing route, found ${priced}.\n`); process.exit(1); }
  if (review < 8) { console.error(`\n  Refusing: only ${review} review routes for a panel-adjacent job.\n`); process.exit(1); }

  const inputs = {
    fieldLaborHours: svc.fieldLaborHours, wwtLaborHours: svc.wwtLaborHours,
    requiresTechCount: svc.requiresTechCount, materialCostCents: svc.materialCostCents,
    materialMultiplier: svc.materialMultiplier, permitAdminCents: svc.permitAdminCents,
    otherDirectCostCents: svc.otherDirectCostCents, isPrimaryEligible: svc.isPrimaryEligible,
  };
  const primary = suggestPrimaryPrice(inputs, settings as unknown as PricingSettings);
  const wwt = suggestWwtPrice(inputs, settings as unknown as PricingSettings);
  if (primary.totalCents === null || wwt.totalCents === null) {
    console.error(`\n  The engine produced no price. Refusing.\n`); process.exit(1);
  }

  console.log();
  console.log(`  ${svc.fieldLaborHours} crew-hours          $${(primary.laborCents / 100).toFixed(2)}`);
  console.log(`  material @ ${primary.multiplierUsed.toFixed(3)}x      $${(primary.materialCents / 100).toFixed(2)}   ($${((svc.materialCostCents ?? 0) / 100).toFixed(2)} direct)`);
  console.log(`                        --------`);
  console.log(`  standalone            $${(primary.totalCents / 100).toFixed(2)}`);
  console.log(`  same-visit            $${(wwt.totalCents / 100).toFixed(2)}`);
  console.log();

  if (!apply) { console.log(`  Report only. Re-run with --apply to publish.\n`); return; }

  await prisma.service.update({
    where: { id: svc.id },
    data: {
      basePrice: primary.totalCents,
      whileWeThereBasePrice: wwt.totalCents,
      publishedPriceApprovedAt: new Date(),
    },
  });
  console.log(`  ✓ Published $${(primary.totalCents / 100).toFixed(0)} / $${(wwt.totalCents / 100).toFixed(0)}.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
