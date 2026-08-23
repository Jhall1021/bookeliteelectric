/**
 * Clear imported multipliers that don't do anything.
 *
 *   npx tsx prisma/clear-inert-multipliers.ts          report
 *   npx tsx prisma/clear-inert-multipliers.ts --apply  write
 *
 * An imported multiplier blocks a service from reconciliation, because an
 * override means "ignore the standard rule" and the reconciliation can't tell
 * a deliberate exception from leftover workbook data.
 *
 * But most of them do nothing at all:
 *
 *   19 services have NO material recorded. Any multiplier x $0 is $0.
 *    2 are already at 1.3x, which is what the standard rule gives anyway.
 *
 * Clearing those 21 changes not one customer price, and takes 42 rows out of
 * the blocked list. That's worth doing on its own, separately from the 12 that
 * genuinely move — those need a decision and, in most cases, real materials
 * itemized first.
 *
 * NO PUBLISHED PRICE CHANGES HERE. This only removes an override so the
 * standard rule applies to the SUGGESTED price. Published prices move through
 * the admin, as always.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 30% of the first $750, 20% above. Mirrors lib/pricing. */
function standardSell(costCents: number): number {
  if (costCents <= 0) return 0;
  const BREAK = 75000;
  if (costCents <= BREAK) return Math.round(costCents * 1.3);
  return Math.round(BREAK * 1.3 + (costCents - BREAK) * 1.2);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const services = await prisma.service.findMany({
    where: { active: true, materialMultiplier: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      materialMultiplier: true,
      materialCostCents: true,
    },
    orderBy: { name: "asc" },
  });

  const inert: typeof services = [];
  const moves: typeof services = [];

  for (const s of services) {
    const cost = s.materialCostCents ?? 0;
    if (cost === 0) {
      // Nothing to multiply.
      inert.push(s);
      continue;
    }
    const overrideSell = Math.round(cost * (s.materialMultiplier ?? 1));
    if (overrideSell === standardSell(cost)) {
      // The override happens to agree with the rule, so it's redundant.
      inert.push(s);
    } else {
      moves.push(s);
    }
  }

  console.log(`\n${services.length} active service(s) carry an imported multiplier.\n`);
  console.log(`  ${inert.length} are inert — clearing them changes no price:\n`);
  for (const s of inert) {
    const why = (s.materialCostCents ?? 0) === 0 ? "no material" : "already matches the rule";
    console.log(`      ${s.materialMultiplier}x   ${s.name.trim()}  (${why})`);
  }

  console.log(`\n  ${moves.length} would move the SUGGESTED price and are left alone:\n`);
  for (const s of moves) {
    const cost = s.materialCostCents ?? 0;
    const now = Math.round(cost * (s.materialMultiplier ?? 1));
    const std = standardSell(cost);
    console.log(
      `      ${s.name.trim()}  —  material sells at $${(now / 100).toFixed(2)}, ` +
        `would be $${(std / 100).toFixed(2)}`
    );
  }

  if (!apply) {
    console.log(`\n  Report only. Re-run with --apply to clear the ${inert.length} inert ones.\n`);
    return;
  }

  const result = await prisma.service.updateMany({
    where: { id: { in: inert.map((s) => s.id) } },
    data: { materialMultiplier: null, materialMultiplierReason: null },
  });

  console.log(`\n  ✓ cleared ${result.count} inert multiplier(s). No customer price moved.`);
  console.log(`\n  Still to decide: the ${moves.length} above. Most carry an imported material`);
  console.log(`  allowance rather than an itemized list, so the honest order is to`);
  console.log(`  itemize the materials first and clear the override as part of that.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
