/**
 * Publish the New Video Doorbell Wiring starting package — Phase F rescue #1.
 *
 *   npx tsx scripts/publish-doorbell-package.ts          report
 *   npx tsx scripts/publish-doorbell-package.ts --apply  publish
 *
 * The price is DERIVED, not chosen. This script runs the package's own
 * economics — 2.0 crew-hours and a three-role recipe — through the same
 * suggestPrimaryPrice the admin uses, and refuses to write anything the
 * engine cannot produce.
 *
 * PUBLISHING IS CONDITIONAL ON THE BOUNDARY EXISTING.
 *
 * A starting price is a promise about scope. Before writing one, this checks
 * that the tree actually enforces the scope the price assumes: that there is
 * exactly one route that prices, that every other route reaches a review or a
 * reroute, and that no route reaches nothing at all. A price published over a
 * one-step "send us photos" tree would be the chandelier defect committed
 * deliberately instead of by accident.
 *
 * It also refuses to move a price that already exists. Repricing is a
 * reconciliation decision and does not belong in a build script.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "../lib/pricing";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { serviceSlugKey } from "../prisma/_serviceKey";

const prisma = new PrismaClient();

const SLUG = "new-video-doorbell-wiring";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nNEW VIDEO DOORBELL WIRING — DERIVED PRICE\n`);

  const svc = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: {
      id: true, name: true, contractorId: true, active: true, bookingType: true,
      basePrice: true, whileWeThereBasePrice: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialCostResolved: true, materialMultiplier: true,
      permitAdminCents: true, otherDirectCostCents: true, isPrimaryEligible: true,
    },
  });
  if (!svc) { console.error(`  ${SLUG} not in the catalog.\n`); process.exit(1); }

  if (svc.basePrice !== null || svc.whileWeThereBasePrice !== null) {
    console.log(`  Already published at $${((svc.basePrice ?? 0) / 100).toFixed(2)} / $${((svc.whileWeThereBasePrice ?? 0) / 100).toFixed(2)}.`);
    console.log(`  Repricing is a reconciliation decision, not a build step.\n`);
    return;
  }
  if (svc.fieldLaborHours === null || svc.wwtLaborHours === null) {
    console.error(`  No crew-hours. Refusing to price labor that nobody established.\n`);
    process.exit(1);
  }
  if (!svc.materialCostResolved) {
    console.error(`  Material cost unresolved. Refusing to publish a price built on a gap.\n`);
    process.exit(1);
  }

  // ── the boundary must exist before the promise does ─────────────────────
  const settings = await loadPricingSettings(prisma as any, svc.contractorId);
  const full = await loadServiceForResolution(prisma as any, svc.id);
  if (!full || full.questions.length === 0) {
    console.error(`  No question tree. A starting price with no boundary behind it is`);
    console.error(`  a quote wearing a number. Refusing.\n`);
    process.exit(1);
  }

  const byId = new Map(full.questions.map((q: any) => [q.id, q]));
  const nk = (o: any) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId ? (byId.get(o.nextQuestionId) as any)?.key ?? null : null;
  let priced = 0, review = 0, handoff = 0, dead = 0;
  const walk = async (k: string | null, ans: Record<string, string>): Promise<void> => {
    if (!k) {
      const r: any = resolveRoute(full as any, ans, true, settings!);
      if (r.status === "PRICED") priced++;
      else if (r.status === "REVIEW") review++;
      else if (r.status === "REROUTE") handoff++;
      // The one path meant to price cannot price yet, precisely because this
      // script has not run. That specific reason is expected; anything else
      // is a broken tree.
      else if (/has no published (base|add-on) price/.test(String(r.reason))) priced++;
      else { dead++; console.log(`      dead route: ${r.reason}`); }
      return;
    }
    const q: any = full.questions.find((x: any) => x.key === k);
    if (!q) return;
    for (const o of q.options) await walk(nk(o), { ...ans, [q.key]: o.value });
  };
  await walk(full.questions[0]?.key ?? null, {});

  console.log(`  routes: ${priced} priced / ${review} review / ${handoff} reroute / ${dead} dead`);
  if (dead > 0) { console.error(`\n  Refusing: ${dead} route(s) reach nothing.\n`); process.exit(1); }
  if (priced !== 1) { console.error(`\n  Refusing: expected exactly 1 pricing route, found ${priced}.\n`); process.exit(1); }
  if (review < 5) { console.error(`\n  Refusing: only ${review} review routes — the boundary looks unenforced.\n`); process.exit(1); }

  // ── derive ─────────────────────────────────────────────────────────────
  const inputs = {
    fieldLaborHours: svc.fieldLaborHours, wwtLaborHours: svc.wwtLaborHours,
    requiresTechCount: svc.requiresTechCount, materialCostCents: svc.materialCostCents,
    materialMultiplier: svc.materialMultiplier, permitAdminCents: svc.permitAdminCents,
    otherDirectCostCents: svc.otherDirectCostCents, isPrimaryEligible: svc.isPrimaryEligible,
  };
  const primary = suggestPrimaryPrice(inputs, settings as unknown as PricingSettings);
  const wwt = suggestWwtPrice(inputs, settings as unknown as PricingSettings);
  if (primary.totalCents === null || wwt.totalCents === null) {
    console.error(`\n  The engine produced no price. Refusing to publish one it cannot derive.\n`);
    process.exit(1);
  }

  console.log();
  console.log(`  ${svc.fieldLaborHours} crew-hours          $${(primary.laborCents / 100).toFixed(2)}`);
  console.log(`  material @ ${primary.multiplierUsed.toFixed(2)}x        $${(primary.materialCents / 100).toFixed(2)}   ($${((svc.materialCostCents ?? 0) / 100).toFixed(2)} direct)`);
  console.log(`                        --------`);
  console.log(`  standalone            $${(primary.totalCents / 100).toFixed(2)}`);
  console.log(`  same-visit            $${(wwt.totalCents / 100).toFixed(2)}`);
  console.log();

  // Calibration, reported and never used as an input.
  const neighbors = await prisma.service.findMany({
    where: { contractorId: svc.contractorId, slug: { in: ["video-doorbell-existing-wiring", "doorbell-transformer-replacement"] } },
    select: { slug: true, basePrice: true, fieldLaborHours: true },
  });
  const sum = neighbors.reduce((n, s) => n + (s.basePrice ?? 0), 0);
  const hrs = neighbors.reduce((n, s) => n + (s.fieldLaborHours ?? 0), 0);
  console.log(`  calibration — this job is both neighbors plus a fish:`);
  for (const n of neighbors) console.log(`      ${n.slug.padEnd(36)} $${((n.basePrice ?? 0) / 100).toFixed(0)}  ${n.fieldLaborHours}h`);
  console.log(`      ${"sum".padEnd(36)} $${(sum / 100).toFixed(0)}  ${hrs}h`);
  console.log(`      ${"derived".padEnd(36)} $${(primary.totalCents / 100).toFixed(0)}  ${svc.fieldLaborHours}h   (delta $${((primary.totalCents - sum) / 100).toFixed(0)})`);
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
  console.log(`  ✓ Published $${(primary.totalCents / 100).toFixed(0)} / $${(wwt.totalCents / 100).toFixed(0)}, owner-approved 29 Aug 2026.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
