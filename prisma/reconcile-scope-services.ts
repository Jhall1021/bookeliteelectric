/**
 * Chandelier becomes bookable — 23 August 2026.
 *
 *   npx tsx prisma/reconcile-chandelier.ts          report
 *   npx tsx prisma/reconcile-chandelier.ts --apply  publish
 *
 * This morning the chandelier was made quote-only, because it carried a
 * published price with no crew-hours behind it and inventing some to clear a
 * report would have been guessing.
 *
 * It now has a scope model: a narrow standard job at 2.0 crew-hours, with
 * everything outside that envelope going to review. So it can carry a price
 * again — and unlike the old one, this price is derived.
 *
 *   2.0 crew-hours          $500.00
 *   rated box + consumables  $27.30   ($21 direct, marked up 30%)
 *                           -------
 *                            $527.30  ->  $530
 *
 * Same figure for same-visit. Nothing about the job gets shorter because a
 * crew is already at the house: the ladder still goes up, the old fixture
 * still comes down piece by piece, the new one still gets assembled and
 * levelled.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

/**
 * Both services that gained a scope model today.
 *
 * Each was made quote-only this morning for the same reason: a published
 * price with no crew-hours behind it. Both now have a tree, real labor and
 * itemized materials, so both can carry a derived price again.
 */
const CHANGES: {
  slug: string;
  basePrice: number;
  whileWeThereBasePrice: number;
  why: string;
}[] = [
  {
    slug: "remove-and-replace-existing-chandelier",
    basePrice: 53000,
    whileWeThereBasePrice: 53000,
    why:
      "2.0 crew-hours both ways plus a rated box and consumables. Same figure " +
      "for same-visit: the ladder still goes up, the old fixture still comes " +
      "down piece by piece.",
  },
  {
    slug: "new-exterior-flood-camera",
    basePrice: 70500,
    whileWeThereBasePrice: 64500,
    why:
      "1.5 crew-hours for the exterior receptacle plus 1.0 to mount, aim and " +
      "run the cord, with $60.44 of materials. Same-visit saves only the " +
      "receptacle's quarter hour — the mount is discrete work.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nSCOPE-MODEL PRICING — 23 August 2026\n`);

  for (const c of CHANGES) {
    const svc = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, c.slug),
      select: {
        id: true, name: true, basePrice: true, whileWeThereBasePrice: true,
        fieldLaborHours: true, materialCostCents: true,
      },
    });
    if (!svc) {
      console.log(`  ! ${c.slug} not in the catalog — skipped\n`);
      continue;
    }

    // The scope seed must have run first, or this publishes a price with no
    // tree behind it — the same failure this governance exists to prevent,
    // just in the other direction.
    if (svc.fieldLaborHours === null) {
      console.log(`  ! ${svc.name.trim()} has no crew-hours — run its seed first\n`);
      continue;
    }

    console.log(`  ${svc.name.trim()}`);
    console.log(
      `      ${svc.fieldLaborHours} crew-hours + $${((svc.materialCostCents ?? 0) / 100).toFixed(2)} material`
    );
    console.log(
      `      standalone $${((svc.basePrice ?? 0) / 100).toFixed(0)} -> $${c.basePrice / 100}`
    );
    console.log(
      `      same-visit $${((svc.whileWeThereBasePrice ?? 0) / 100).toFixed(0)} -> $${c.whileWeThereBasePrice / 100}`
    );
    console.log(`      ${c.why}\n`);

    if (apply) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          basePrice: c.basePrice,
          whileWeThereBasePrice: c.whileWeThereBasePrice,
          publishedPriceApprovedAt: new Date(),
        },
      });
    }
  }

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to publish.\n`);
    return;
  }
  console.log(`  ✓ Published and stamped as owner-approved.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
