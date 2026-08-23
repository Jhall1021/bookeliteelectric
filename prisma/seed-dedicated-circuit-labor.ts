/**
 * Dedicated 120V Circuit & Outlet — labor.
 *
 *   npx tsx prisma/seed-dedicated-circuit-labor.ts
 *
 * This service has never had labor recorded. The 2.5 figure people referred
 * to lived in seed-pricing-inputs.ts, which was never run against the
 * database — so fieldLaborHours has been null throughout, and the $795 has
 * had nothing behind it.
 *
 * The figures below apply to the QUALIFYING INSTANT-PRICE BRANCH only:
 *
 *   standard 120V equipment · one technician · suitable existing panel
 *   accessible route (attic, unfinished basement, drop ceiling, or a mix)
 *   50 ft or less · new breaker · one new receptacle · normal construction
 *
 * Anything outside that already routes to review, where the office
 * establishes hours per job.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "dedicated-120v-circuit-outlet";

async function main() {
  const service = await prisma.service.findUnique({ where: { slug: SLUG } });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      // One technician for 150 minutes. Clock time and tech-hours agree here
      // precisely because the crew is one — they diverge the moment it isn't,
      // which is why they're separate fields.
      fieldLaborHours: 2.5,
      estimatedMinutes: 150,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,

      // Same as standalone. No saving.
      //
      // The half-hour I originally took off was reasoning by analogy — most
      // services save the arrival overhead, so this one should too. But
      // nothing about this job shrinks: the cable run, the breaker, the box,
      // the terminations and the testing all happen in full regardless of
      // why the van is in the driveway.
      //
      // The published price was $170 — a quarter of the standalone — which
      // is a legacy figure treating "add-on" as a discount category rather
      // than a description of incremental work.
      //
      // If a measured saving turns up in the field, put it back then.
      wwtLaborHours: 2.5,

      // Deliberately NOT published. Establishing the labor doesn't oblige us
      // to sell it as an add-on, and at 2.0 hours it computes to $590 —
      // which is not an impulse addition to another visit. Left null until
      // there's a reason to offer it.
      whileWeThereBasePrice: null,

      // Unchanged. The model suggests $715 against this; that variance is
      // real and the editor shows it. Back-solving the hours to make them
      // land on $795 is the flaw this whole field exists to replace.
      // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
    },
  });

  console.log(`  ✓ ${SLUG}`);
  console.log(`      field labor    2.5 hr, one technician, 150 minutes on the clock`);
  console.log(`      add-on labor   2.0 hr recorded — no add-on price published`);
  console.log(`      published      $795   suggested $715   variance $80`);
  console.log(`
  The distance question already separates 25 ft and under from 26-50 ft, so
  the data to split the labor later is being collected. 2.5 hours across the
  whole qualifying range is the conservative launch assumption; whether a
  20-foot run is reliably faster is a question for field experience rather
  than arithmetic.

  Material is still the imported $68 allowance and isn't itemized, so it
  carries whatever multiplier the import left on it. Itemizing it would clear
  that and move the suggestion again.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
