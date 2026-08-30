/**
 * Elite's crew rate and service-call minimum go back to $250/$250.
 *
 *   npx tsx scripts/restore-pricing-settings.ts          report
 *   npx tsx scripts/restore-pricing-settings.ts --apply  restore
 *
 * On 29 August the row moved to $150/hr with a $290 minimum. That was
 * exploratory — the owner trying figures in the admin — and it was never
 * meant to reach the catalog. It did not reach published prices, because
 * basePrice is stored rather than recomputed. What it did reach was the
 * MODEL: 111 published price points stopped agreeing with the contractor's
 * own stated economics, and every price this engine derived from that moment
 * on would have been drawn against a rate nobody had decided to adopt.
 *
 * The settings are owner data, so this script does not guess what they should
 * be. It restores the figures the catalog was actually built on — the ones
 * prisma/seed-pricing-settings.ts documents and every published price
 * reconciles against — and refuses if the row already holds them.
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "../prisma/_componentHelpers";

const prisma = new PrismaClient();

/** What the catalog was priced at, and what it reconciles against. */
const RATE_CENTS = 25000;
const MINIMUM_CENTS = 25000;

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nRESTORE PRICING SETTINGS\n`);

  const contractorId = await eliteContractorId(prisma);
  const now = await prisma.pricingSettings.findUnique({ where: { contractorId } });
  if (!now) {
    console.error(`  Elite has no pricing settings row. Refusing to create one here —\n`);
    console.error(`  that is prisma/seed-pricing-settings.ts's job.\n`);
    process.exit(1);
  }

  console.log(`      crew-hour rate     $${(now.crewHourRateCents / 100).toFixed(2)}  ->  $${(RATE_CENTS / 100).toFixed(2)}`);
  console.log(`      service-call min   $${(now.primaryMinimumCents / 100).toFixed(2)}  ->  $${(MINIMUM_CENTS / 100).toFixed(2)}`);
  console.log(`      rounding           $${(now.roundingIncrementCents / 100).toFixed(2)}  (unchanged)`);
  console.log();

  if (now.crewHourRateCents === RATE_CENTS && now.primaryMinimumCents === MINIMUM_CENTS) {
    console.log(`  Already restored. Nothing to do.\n`);
    return;
  }

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to restore.\n`);
    return;
  }

  await prisma.pricingSettings.update({
    where: { contractorId },
    data: { crewHourRateCents: RATE_CENTS, primaryMinimumCents: MINIMUM_CENTS },
  });

  console.log(`  ✓ Restored. No published price was touched — none had moved.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
