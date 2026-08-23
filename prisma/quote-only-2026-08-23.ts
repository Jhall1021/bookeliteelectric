/**
 * Five services become quote-only — 23 August 2026.
 *
 *   npx tsx prisma/quote-only-2026-08-23.ts          report
 *   npx tsx prisma/quote-only-2026-08-23.ts --apply  write
 *
 * SEPARATE FROM THE PRICE BOOK ON PURPOSE.
 *
 * These five carried a published price with no crew-hours behind it, which
 * meant the reconciliation couldn't judge them. The easy fix would have been
 * to assign each an average and clear the report — which is exactly how the
 * catalog got into this state the first time. A fixed price with no scope
 * model behind it is a guess wearing a number.
 *
 * So instead the price comes off. A quote is an honest answer to a job whose
 * scope genuinely varies; an invented average is not.
 *
 * Three of them vary too much to price from a form at all:
 *
 *   panel condition · breaker and circuit requirements · conductor size and
 *   run length · access · permits · load calculations · trenching
 *
 * The other two are eventually very bookable — they just need boundaries
 * defined before they can be priced, and that's service design rather than
 * pricing cleanup.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type QuoteOnly = {
  slug: string;
  why: string;
  /** What would have to be true for this to become a fixed price later. */
  toRevisit?: string;
};

const SERVICES: QuoteOnly[] = [
  {
    slug: "200a-service-upgrade",
    why:
      "Panel condition, utility coordination, permits, load calculation and " +
      "conductor sizing all move the job substantially. No standard scope exists.",
  },
  {
    slug: "electrical-panel-replacement",
    why:
      "Same variability as a service upgrade — existing panel condition and " +
      "circuit count dominate the work.",
  },
  {
    slug: "level-2-ev-charger",
    why:
      "Quote-only for launch. Run length, conductor size, panel capacity and " +
      "any exterior trenching vary too widely for a form to establish.",
  },
  {
    slug: "remove-and-replace-existing-chandelier",
    why:
      "No standard qualifying scope defined yet, and inventing hours to clear " +
      "the report would be guessing.",
    toRevisit:
      "Becomes bookable once bounded: existing electrical location, " +
      "customer-supplied fixture, a weight limit, defined ceiling-height and " +
      "access bands, no lift or scaffolding, no major assembly. Then measure " +
      "the crew-hours rather than estimate them.",
  },
  {
    slug: "new-exterior-flood-camera",
    why:
      "Review and quote until its labor, material and access matrix is defined.",
    toRevisit:
      "Should reuse the existing new-light and outlet access infrastructure " +
      "once we settle where the power comes from and how much wiring is " +
      "included.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nQUOTE-ONLY CONVERSION — 23 August 2026\n`);
  console.log(`  ${SERVICES.length} service(s) losing a price they couldn't justify\n`);

  let changed = 0;

  for (const q of SERVICES) {
    const svc = await prisma.service.findUnique({
      where: { slug: q.slug },
      select: {
        id: true, name: true, basePrice: true, whileWeThereBasePrice: true,
        bookingType: true, fieldLaborHours: true,
      },
    });
    if (!svc) {
      console.log(`  ! ${q.slug} not in the catalog — skipped\n`);
      continue;
    }

    const hadPrice = svc.basePrice !== null || svc.whileWeThereBasePrice !== null;
    console.log(`  ${svc.name.trim()}`);
    if (hadPrice) {
      console.log(
        `      clearing $${((svc.basePrice ?? 0) / 100).toFixed(0)}` +
          (svc.whileWeThereBasePrice !== null
            ? ` / $${(svc.whileWeThereBasePrice / 100).toFixed(0)} same-visit`
            : "")
      );
    } else {
      console.log(`      already quote-only`);
    }
    console.log(`      ${q.why}`);
    if (q.toRevisit) console.log(`      LATER: ${q.toRevisit}`);
    console.log();

    if (apply && (hadPrice || svc.bookingType !== "REMOTE_QUOTE")) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          basePrice: null,
          whileWeThereBasePrice: null,
          bookingType: "REMOTE_QUOTE",
          startingPriceLabel: "Get a quote",
          // Null on purpose, and correct: a quote service establishes hours
          // per job when the office builds the price.
          fieldLaborHours: null,
          wwtLaborHours: null,
        },
      });
      changed++;
    }
  }

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to convert.\n`);
    return;
  }

  console.log(`  ✓ ${changed} service(s) converted to quote-only.\n`);
  console.log(`  They'll now read as "quote-only" in the reconciliation rather`);
  console.log(`  than "no crew-hours recorded" — which is the difference between`);
  console.log(`  a deliberate decision and an unfinished one.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
