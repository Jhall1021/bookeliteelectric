/**
 * The two Elite mounts have no labor hours, so the engine derives nothing.
 *
 *   npx tsx scripts/complete-mount-labor-inputs.ts            dry run
 *   npx tsx scripts/complete-mount-labor-inputs.ts --commit   writes inputs
 *
 * They are supplied hardware, not labor. Both are `isPrimaryEligible: false`
 * and inactive — reached only as an add-on inside a TV installation, where
 * the van is already at the house and the visit is already paid for. Fitting
 * the mount is part of hanging the TV.
 *
 * So their hours are not UNKNOWN, they are ZERO, and null was recording the
 * wrong one of those. Both published prices are pure material at a deliberate
 * multiplier — 2.0x and 2.5x on Elite's own cost — and at zero hours the
 * engine reproduces $200.00 and $125.00 to the cent.
 *
 * WHAT THIS WRITES, AND WHAT IT REFUSES TO
 *
 * Inputs only: fieldLaborHours and wwtLaborHours. It does not touch
 * basePrice, does not stamp publishedPriceApprovedAt, and changes nothing a
 * customer sees. That leaves the services exactly where the other four
 * legacy rows are — carrying a price a contractor still has to approve
 * through the pricing screen. Completing an input is configuration;
 * approving a price is a decision, and a script does not get to make it.
 *
 * It REFUSES if the engine would then derive anything other than the price
 * already published, because that would mean this is a repricing wearing the
 * clothes of a data fix.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const SLUGS = ["elite-articulating-mount", "elite-tilt-mount"];
const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

async function main() {
  console.log(`\nMOUNT LABOR INPUTS`);
  console.log(COMMIT ? `  COMMITTING inputs only\n` : `  DRY RUN — nothing is written.\n`);
  let refuse = 0;

  for (const slug of SLUGS) {
    const s = await prisma.service.findFirstOrThrow({ where: { slug } });
    const settings = await prisma.pricingSettings.findUniqueOrThrow({
      where: { contractorId: s.contractorId },
    });

    const primary = suggestPrimaryPrice({ ...s, fieldLaborHours: 0 } as never, settings as never);
    const wwt = suggestWwtPrice({ ...s, wwtLaborHours: 0 } as never, settings as never);

    console.log(`  ${slug}`);
    console.log(`     active               ${s.active}`);
    console.log(`     add-on only          ${!s.isPrimaryEligible}`);
    console.log(`     material cost        ${money(s.materialCostCents)} x ${s.materialMultiplier}`);
    console.log(`     published            ${money(s.basePrice)} / ${money(s.whileWeThereBasePrice)}`);
    console.log(`     hours  null -> 0     derives ${money(primary.totalCents)} / ${money(wwt.totalCents)}`);

    if (s.isPrimaryEligible) {
      console.log(`     REFUSED: this is bookable on its own, so zero labor is the wrong answer`);
      refuse++; continue;
    }
    if (primary.totalCents !== s.basePrice || wwt.totalCents !== s.whileWeThereBasePrice) {
      console.log(`     REFUSED: zero hours would CHANGE the price, so this is not a data fix`);
      refuse++; continue;
    }

    if (COMMIT) {
      await prisma.service.update({
        where: { id: s.id },
        data: { fieldLaborHours: 0, wwtLaborHours: 0 },
      });
      console.log(`     WRITTEN — still unapproved, still needs a contractor to publish it`);
    }
    console.log();
  }

  if (refuse) { console.log(`\n  ${refuse} refused. Nothing written.\n`); process.exit(1); }
  console.log(COMMIT
    ? `  Inputs complete. Both now DERIVE their published price, and both still\n  await a real approval through the pricing screen.\n`
    : `  Both would reproduce their published price exactly. Rerun with --commit.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
