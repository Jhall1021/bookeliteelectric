/**
 * ONE-TIME BACKFILL — Service.tradeKey for the legacy Electrical catalog.
 *
 * G2 introduced a durable trade identity on live services. Provisioning stamps
 * it at creation, so everything installed from a template hereafter is correct.
 * This stamps what was already there before the column existed.
 *
 * WHY THIS IS NOT `WHERE tradeKey IS NULL -> 'electrical'`
 *
 * That query is not a backfill, it is a default with extra steps. It would be
 * right today and wrong forever after: the first Plumbing or HVAC service
 * created before someone remembered to set its trade would be silently
 * classified as Electrical, and nothing would report it. The whole point of
 * leaving the column nullable and default-free is that "we never established
 * this" stays visible and fails closed.
 *
 * So this runs over a REVIEWED SET and refuses if the live catalog no longer
 * matches it. A drifted set means somebody added services since the review, and
 * whether those are Electrical is a question for a person, not for this script.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not touch a service that already has a tradeKey, it does not create
 * ContractorTrade rows, and it does not decide anything about enrolment — a
 * separate fact with a separate owner. It writes one column on rows it has
 * already proved are the ones that were reviewed.
 *
 *   npx tsx prisma/backfill-service-trade-2026-09-02.ts --check
 *   npx tsx prisma/backfill-service-trade-2026-09-02.ts --apply
 *
 * Reads only, unless --apply is passed.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** The trade every reviewed row gets. One trade, because one is what was reviewed. */
const TRADE = "electrical";

/**
 * The reviewed set, as it stood on 2 September 2026.
 *
 * Counted per contractor rather than as one total, so a service moving between
 * tenants cannot cancel out against another and leave the total looking right.
 * Every contractor below sells Electrical and only Electrical, which is the
 * fact that makes the stamp safe — and is exactly what stops being true the
 * moment a second trade is provisioned anywhere.
 */
const REVIEWED: { contractorSlug: string; servicesWithoutTrade: number }[] = [
  { contractorSlug: "elite-electric", servicesWithoutTrade: 79 },
  { contractorSlug: "brightpath-electric", servicesWithoutTrade: 75 },
];

type Row = { contractorSlug: string; live: number };

async function survey(): Promise<Row[]> {
  const contractors = await prisma.contractor.findMany({
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });
  const out: Row[] = [];
  for (const c of contractors) {
    const live = await prisma.service.count({
      where: { contractorId: c.id, tradeKey: null },
    });
    if (live > 0) out.push({ contractorSlug: c.slug, live });
  }
  return out;
}

/**
 * Does the live catalog still look like what was reviewed?
 *
 * Refuses on ANY difference — a contractor that has appeared, one that has
 * gone, or a count that has moved in either direction. A count that dropped is
 * as much a signal as one that grew: it means somebody has already been
 * stamping rows, and this script does not know what they decided.
 */
function drift(live: Row[]): string[] {
  const problems: string[] = [];
  const reviewed = new Map(REVIEWED.map((r) => [r.contractorSlug, r.servicesWithoutTrade]));
  const seen = new Map(live.map((r) => [r.contractorSlug, r.live]));

  for (const [slug, expected] of reviewed) {
    const actual = seen.get(slug);
    if (actual === undefined) {
      problems.push(`${slug}: reviewed ${expected} untraded service(s), found none`);
    } else if (actual !== expected) {
      problems.push(`${slug}: reviewed ${expected} untraded service(s), found ${actual}`);
    }
  }
  for (const [slug, actual] of seen) {
    if (!reviewed.has(slug)) {
      problems.push(
        `${slug}: ${actual} untraded service(s), and this contractor was not in the review`
      );
    }
  }
  return problems;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("\nBACKFILL — Service.tradeKey, reviewed 2 September 2026\n");

  const live = await survey();
  console.log("  reviewed set:");
  for (const r of REVIEWED) console.log(`    ${r.contractorSlug}  ${r.servicesWithoutTrade}`);
  console.log("  live now:");
  if (live.length === 0) console.log("    (no services without a trade)");
  for (const r of live) console.log(`    ${r.contractorSlug}  ${r.live}`);
  console.log();

  const problems = drift(live);
  if (problems.length > 0) {
    console.log("  REFUSED — the live catalog no longer matches the reviewed set:");
    for (const p of problems) console.log(`    ${p}`);
    console.log(
      "\n  This is not a failure to work around. Somebody added, removed or already\n" +
        "  stamped services since the review, and whether those are Electrical is a\n" +
        "  question for a person. Re-review, update REVIEWED, and run again.\n"
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const total = live.reduce((n, r) => n + r.live, 0);
  console.log(`  ok — live catalog matches the reviewed set (${total} service(s) to stamp)`);

  if (!apply) {
    console.log("\n  --check only. Re-run with --apply to write.\n");
    await prisma.$disconnect();
    return;
  }

  // Scoped per contractor and to `tradeKey: null`, so a row somebody stamped
  // between the survey and the write is not overwritten by this script.
  let written = 0;
  for (const r of REVIEWED) {
    const c = await prisma.contractor.findFirstOrThrow({
      where: { slug: r.contractorSlug },
      select: { id: true },
    });
    const res = await prisma.service.updateMany({
      where: { contractorId: c.id, tradeKey: null },
      data: { tradeKey: TRADE },
    });
    console.log(`    ${r.contractorSlug}: stamped ${res.count} as "${TRADE}"`);
    written += res.count;
  }
  console.log(`\n  stamped ${written} service(s). Services created hereafter get their trade`);
  console.log(`  from provisioning; a null tradeKey stays "not established" and fails closed.\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
