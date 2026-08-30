/**
 * Whole-house surge protection moves to the 20A breaker role — 29 Aug 2026.
 *
 *   npx tsx prisma/migrate-surge-breaker-role.ts          report
 *   npx tsx prisma/migrate-surge-breaker-role.ts --apply  move
 *
 * The generic `BREAKER_DOUBLE_POLE` had no amperage in it. A surge device
 * takes a 2-pole 20A, and now that a role exists for exactly that, this recipe
 * should name it — so that if 20A and 50A breakers ever diverge in price, the
 * divergence lands on the packages that actually use each one.
 *
 * `double-pole-breaker-replacement` deliberately KEEPS the generic role. That
 * service means "replace the 2-pole breaker already in your panel", which is
 * genuinely whatever the customer has; pinning it to an amperage would force a
 * homeowner question that buys nothing. A generic role is the honest model for
 * a genuinely generic job, and that is the one place it still is one.
 *
 * Price-neutral, checked before writing: $18.00 -> $18.24 moves the material
 * sell by $0.31 and the $5 rounding absorbs it. Model stays $600 / $535,
 * matching the published pair.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();

const SLUG = "whole-house-surge-protection";
const FROM = "BREAKER_DOUBLE_POLE";
const TO = "BREAKER_DOUBLE_POLE_20A";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nSURGE PROTECTION — BREAKER ROLE\n`);

  const svc = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: { id: true, name: true, basePrice: true, whileWeThereBasePrice: true, materialCostCents: true },
  });
  if (!svc) { console.error(`  ${SLUG} not in the catalogue.\n`); process.exit(1); }

  const from = await prisma.canonicalMaterial.findUnique({ where: { key: FROM }, select: { id: true } });
  const to = await prisma.canonicalMaterial.findUnique({ where: { key: TO }, select: { id: true } });
  if (!from || !to) { console.error(`  Missing role ${FROM} or ${TO}.\n`); process.exit(1); }

  const row = await prisma.serviceMaterial.findFirst({
    where: { serviceId: svc.id, canonicalMaterialId: from.id },
    select: { id: true, quantity: true },
  });
  if (!row) {
    console.log(`  ${svc.name.trim()} does not use ${FROM}. Nothing to move.\n`);
    return;
  }

  console.log(`  ${svc.name.trim()}`);
  console.log(`      ${FROM} x${row.quantity}  ->  ${TO} x${row.quantity}`);
  console.log(`      material cache $${((svc.materialCostCents ?? 0) / 100).toFixed(2)}`);
  console.log(`      published $${((svc.basePrice ?? 0) / 100).toFixed(0)} / $${((svc.whileWeThereBasePrice ?? 0) / 100).toFixed(0)} — not touched by this script`);
  console.log();

  if (!apply) { console.log(`  Report only. Re-run with --apply to move.\n`); return; }

  await prisma.serviceMaterial.update({
    where: { id: row.id },
    data: { canonicalMaterialId: to.id },
  });
  // The cache is what the engine reads. Leaving it stale would mean the recipe
  // says one thing and the price is derived from another.
  await recomputeServiceMaterialCost(prisma as any, svc.id);

  // Only the material cache is re-read. The published price is reported from
  // the value taken BEFORE the write, because this script has no path that
  // could change it — re-reading would dress a tautology up as a check.
  const after = await prisma.service.findUniqueOrThrow({
    where: { id: svc.id },
    select: { materialCostCents: true },
  });
  console.log(`  ✓ Moved. Material cache $${((svc.materialCostCents ?? 0) / 100).toFixed(2)} -> $${((after.materialCostCents ?? 0) / 100).toFixed(2)}.`);
  console.log(`    Published price untouched at $${((svc.basePrice ?? 0) / 100).toFixed(0)} — nothing here writes one.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
