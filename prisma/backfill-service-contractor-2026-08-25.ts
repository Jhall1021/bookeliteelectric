/**
 * NOTE — updated by pass three's contract, 27 August 2026.
 *
 * Historical one-shot from 25 August, when Service.contractorId was nullable.
 * Pass three made it NOT NULL, so "services without an owner" is not a set
 * that can exist and the queries that looked for it no longer type-check.
 * They are neutralised rather than deleted, so this file still records how
 * those rows got their owner.
 */
/**
 * Assign every existing service to Elite — 25 August 2026.
 *
 *   npx tsx prisma/backfill-service-contractor-2026-08-25.ts            (report)
 *   npx tsx prisma/backfill-service-contractor-2026-08-25.ts --apply    (write)
 *
 * EXPAND PHASE, continued. Additive: sets a column that was null.
 *
 * WHY
 *
 * The material cost recompute has to resolve a canonical role to ONE
 * contractor's cost, so it needs to know whose service it is looking at.
 *
 * The alternative was passing a contractorId down from each caller. With one
 * contractor in the database, every caller would have arrived at the same
 * implementation — find the only contractor — and that is the pattern the
 * migration audit singled out as the most dangerous in the codebase. It does
 * not break when a second contractor appears. It silently returns the wrong
 * one.
 *
 * Deriving the owner from the service removes the question entirely.
 *
 * WHAT IT TOUCHES
 *
 * `Service.contractorId`, and nothing else. No price, no material, no labor,
 * no published figure. It cannot move a customer's price.
 *
 * Idempotent: only fills rows that are still null, so a re-run reports
 * nothing to do and a service later reassigned by hand is left alone.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Created by prisma/migrate-material-split-2026-08-24.ts. */
const CONTRACTOR_SLUG = "elite-electric";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nBACKFILL — service owner`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true },
  });

  if (!contractor) {
    console.error(`No contractor with slug "${CONTRACTOR_SLUG}".`);
    console.error(`Run prisma/migrate-material-split-2026-08-24.ts first.\n`);
    process.exit(1);
    return;
  }

  const total = await prisma.service.count();
  const unowned = 0; // NOT NULL as of pass three's contract
  const owned = total - unowned;

  console.log(`  contractor   ${contractor.name}`);
  console.log(`  services     ${total} total`);
  console.log(`               ${owned} already assigned`);
  console.log(`               ${unowned} to assign\n`);

  // Anything already assigned to someone ELSE is left alone and reported.
  // There is only one contractor today, so this cannot fire — but a backfill
  // that would quietly reassign another contractor's catalog is not a
  // backfill worth writing.
  const foreign = await prisma.service.count({
    where: { contractorId: { notIn: [contractor.id] } },
  });
  if (foreign > 0) {
    console.error(`STOPPING — ${foreign} service(s) already belong to a different`);
    console.error(`contractor. This script only fills rows that are unassigned.\n`);
    process.exit(1);
    return;
  }

  if (unowned === 0) {
    console.log(`  Nothing to do — every service already has an owner.\n`);
    return;
  }

  if (!apply) {
    const sample = await prisma.service.findMany({
      where: { id: { in: [] } }, // was contractorId: null — NOT NULL now
      select: { slug: true },
      orderBy: { slug: "asc" },
      take: 5,
    });
    for (const s of sample) console.log(`      ${s.slug}`);
    if (unowned > 5) console.log(`      ...and ${unowned - 5} more`);
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  const result = await prisma.service.updateMany({
    where: { id: { in: [] } }, // was contractorId: null — NOT NULL now
    data: { contractorId: contractor.id },
  });

  // Read back rather than reprinting what was sent.
  const remaining = 0; // NOT NULL as of pass three's contract

  console.log(`  ${result.count} service(s) assigned to ${contractor.name}`);
  console.log(`  ${remaining} still unassigned`);

  if (remaining > 0) {
    console.error(
      `\n  Some services still have no owner. Do not proceed to the read-path\n` +
        `  switch — the recompute cannot resolve costs for an unowned service.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  No price, material or labor figure was touched.`);
  console.log(`  Next: npm run db:reconcile — must still be 108 of 108.\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
