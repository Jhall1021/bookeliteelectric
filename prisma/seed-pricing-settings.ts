/**
 * Pricing settings.
 *
 *   npx tsx prisma/seed-pricing-settings.ts
 *
 * The service-call minimum has been $225 since the original import, but
 * handoff §3.3 sets it at $250 — the amount that recovers mobilization,
 * truck, travel and the overhead of originating a visit. Every suggested
 * price for a job of an hour or less has been reading $25 light.
 *
 * Only the minimum is forced. The tech-hour rate, rounding and permit default
 * are created if the row is missing but never overwritten — those are values
 * an admin may have deliberately changed, and a seed shouldn't quietly undo
 * that.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

const prisma = new PrismaClient();

const PRIMARY_MINIMUM_CENTS = 25000;

async function main() {
  // Required as of pass three's contract: PricingSettings now carries an owner.
  const contractorId = await eliteContractorId(prisma);
  const existing = await prisma.pricingSettings.findUnique({ where: { contractorId } });

  if (!existing) {
    await prisma.pricingSettings.create({
      data: {
        contractorId,
        crewHourRateCents: 25000,
        primaryMinimumCents: PRIMARY_MINIMUM_CENTS,
        roundingIncrementCents: 500,
        defaultPermitAdminCents: 0,
      },
    });
    console.log("  ✓ pricing settings created — $250/hr, $250 minimum, $5 rounding");
    return;
  }

  if (existing.primaryMinimumCents === PRIMARY_MINIMUM_CENTS) {
    console.log(`  · service-call minimum already $${PRIMARY_MINIMUM_CENTS / 100} — nothing to do`);
  } else {
    await prisma.pricingSettings.update({
      where: { contractorId },
      data: { primaryMinimumCents: PRIMARY_MINIMUM_CENTS },
    });
    console.log(
      `  ✓ service-call minimum $${existing.primaryMinimumCents / 100} -> $${PRIMARY_MINIMUM_CENTS / 100}`
    );
  }

  console.log(`
  Current settings
    tech-hour rate      $${(existing.crewHourRateCents / 100).toFixed(2)}
    service-call min    $${(PRIMARY_MINIMUM_CENTS / 100).toFixed(2)}
    rounding            $${(existing.roundingIncrementCents / 100).toFixed(2)}
    permit default      $${(existing.defaultPermitAdminCents / 100).toFixed(2)}

  This changes SUGGESTED prices only. Nothing published moves until it's
  approved in the editor.

  The minimum applies to a primary service of one tech-hour or less, and never
  to While We're There pricing or to add-on-only items — the technician is
  already on site, so there's no visit to originate.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
