/**
 * Backfill the two facts slice two introduces, from evidence already present.
 *
 *   npx tsx scripts/backfill-selection-and-authority.ts            dry run
 *   npx tsx scripts/backfill-selection-and-authority.ts --commit   writes
 *
 * Neither is a guess dressed as a default.
 *
 *   offered              A service that is ALREADY LIVE is offered by
 *                        demonstration — a homeowner can book it today. Every
 *                        other service stays unselected, because nothing in
 *                        the data says the contractor decided to sell it.
 *
 *   schedulingAuthority  A contractor with a Jobber connection has already
 *                        answered this by connecting it. One without stays
 *                        NULL rather than defaulting to NATIVE: declaring on
 *                        their behalf is how availability nobody verified
 *                        gets shown, and undeclared is a readiness blocker
 *                        precisely so it gets asked.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  console.log(`\nBACKFILL — service selection and scheduling authority`);
  console.log(COMMIT ? `  COMMITTING\n` : `  DRY RUN — nothing is written.\n`);

  const contractors = await prisma.contractor.findMany({ select: { id: true, slug: true } });

  for (const c of contractors) {
    const active = await prisma.service.count({ where: { contractorId: c.id, active: true } });
    const total = await prisma.service.count({ where: { contractorId: c.id } });
    const conn = await prisma.jobberConnection.findFirst({ where: { contractorId: c.id } });
    const authority = conn ? "EXTERNAL" : null;

    console.log(`  ${c.slug}`);
    console.log(`     offered      ${active} of ${total} service(s) — the live ones`);
    console.log(`     authority    ${authority ?? "left undeclared (no external connection)"}`);

    if (COMMIT) {
      await prisma.service.updateMany({
        where: { contractorId: c.id, active: true },
        data: { offered: true },
      });
      if (authority) {
        await prisma.contractor.update({
          where: { id: c.id },
          data: { schedulingAuthority: "EXTERNAL" },
        });
      }
    }
  }

  if (COMMIT) {
    const offered = await prisma.service.count({ where: { offered: true } });
    const live = await prisma.service.count({ where: { active: true } });
    console.log(`\n  ${offered} offered, ${live} live.`);
    if (offered !== live) {
      console.error(`  REFUSED to finish quietly: those should match immediately after a backfill.\n`);
      process.exit(1);
    }
  }
  console.log(COMMIT ? `  Done.\n` : `  Rerun with --commit to apply.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
