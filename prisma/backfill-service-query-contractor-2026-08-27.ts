/**
 * Give every cached match an owner — 27 August 2026. ADR-008.
 *
 *   npx tsx prisma/backfill-service-query-contractor-2026-08-27.ts            (report)
 *   npx tsx prisma/backfill-service-query-contractor-2026-08-27.ts --apply    (write)
 *
 * ServiceQuery was a platform-wide cache: `normalizedText` globally unique, so
 * one answer per phrase for everyone. "Install an outlet in my garage" does not
 * resolve identically for every contractor — catalogs, slugs, scope policy and
 * trade vocabulary all differ — so a hit from one contractor must never decide
 * another's suggestion.
 *
 * Every existing row is Elite's: they are the only contractor, and the rows
 * were created by their storefront.
 *
 * WHY THE STATISTICS MATTER
 *
 * timesAsked, timesAccepted, timesRejected and the token counters are all
 * per-contractor facts. The token counters in particular are cost attribution,
 * which for Price2Book is billing. Assigning them to Elite is not bookkeeping
 * tidiness; it is deciding whose spend this was.
 *
 * Idempotent: only fills rows still missing an owner.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONTRACTOR_SLUG = "elite-electric";

async function main() {
  console.log(`\nBACKFILL — service query owner (ADR-008)\n`);

  // THIS SCRIPT HAS ALREADY DONE ITS JOB.
  //
  // It ran on 27 August and assigned all 23 cached queries to Elite, carrying
  // 24 asks and 36,213/1,368 tokens of attributed spend. The contract step
  // then made `contractorId` NOT NULL, so "a row without an owner" is no
  // longer a state the database can hold — which is why the unowned-row query
  // this script used to run no longer type-checks.
  //
  // Kept as the historical record of that migration, and as the place to look
  // if an older environment is ever brought forward. It reports and changes
  // nothing.
  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true },
  });
  const total = await prisma.serviceQuery.count();
  const perContractor = await prisma.serviceQuery.groupBy({
    by: ["contractorId"],
    _count: true,
    _sum: { timesAsked: true, totalInputTokens: true, totalOutputTokens: true },
  });

  console.log(`  ${total} cached queries, all owned — the column is NOT NULL.\n`);
  for (const row of perContractor) {
    const owner = row.contractorId === contractor?.id ? contractor.name : row.contractorId;
    console.log(
      `    ${owner}: ${row._count} queries, ${row._sum.timesAsked ?? 0} asked, ` +
        `${row._sum.totalInputTokens ?? 0}/${row._sum.totalOutputTokens ?? 0} tokens`
    );
  }
  console.log(
    `\n  Nothing to do. Ownership is enforced by the schema now, not by this\n` +
      `  script — which is the outcome the migration was for.\n`
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
