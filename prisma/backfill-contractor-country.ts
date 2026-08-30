/**
 * Elite's country, as known data — 29 August 2026.
 *
 *   npx tsx prisma/backfill-contractor-country.ts          report
 *   npx tsx prisma/backfill-contractor-country.ts --apply  write
 *
 * One contractor, one fact: they operate in New Jersey, which is in the United
 * States. That is not an inference — the address, the state, the "NJ
 * Electrical License" label and the service area are all already in the row.
 *
 * BACKFILLED HERE RATHER THAN DEFAULTED IN THE SCHEMA. A default would make
 * every future contractor American until somebody noticed, which is exactly
 * the assumption this field exists to prevent. Naming a contractor on purpose
 * is fine; defaulting to one silently is not.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Only contractors whose country is genuinely known. */
const KNOWN: Record<string, string> = {
  "elite-electric": "US",
};

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nCONTRACTOR COUNTRY\n`);

  const all = await prisma.contractor.findMany({
    select: { id: true, slug: true, state: true, city: true, countryCode: true },
    orderBy: { slug: "asc" },
  });

  for (const c of all) {
    const known = KNOWN[c.slug];
    const where = [c.city, c.state].filter(Boolean).join(", ") || "no address on file";
    if (c.countryCode) {
      console.log(`  · ${c.slug.padEnd(22)} already ${c.countryCode}   (${where})`);
      continue;
    }
    if (!known) {
      // Left null on purpose. Unknown must stay distinguishable from assumed,
      // and a contractor with no country simply cannot open a Stripe account
      // until somebody says where they are.
      console.log(`  ! ${c.slug.padEnd(22)} UNKNOWN — left null   (${where})`);
      continue;
    }
    console.log(`  + ${c.slug.padEnd(22)} -> ${known}   (${where})`);
    if (apply) {
      await prisma.contractor.update({ where: { id: c.id }, data: { countryCode: known } });
    }
  }

  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply.\n`); return; }
  console.log(`  ✓ Written.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
