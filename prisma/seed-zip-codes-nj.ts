/**
 * Monmouth and Ocean ZIP codes — a starting point.
 *
 *   npx tsx prisma/seed-zip-codes-nj.ts
 *
 * Not the whole reference table. The full one is imported from a CSV with
 * import-zip-codes.ts — 721 ZIPs in New Jersey, ~42,000 nationally, and
 * hardcoding that would go stale the first time USPS retires one.
 *
 * These two counties are here because Elite works in them and because they
 * make the service-area editor usable the moment it's installed, rather than
 * showing an empty county list until someone finds a CSV.
 *
 * Figures from zip-codes.com's county pages, August 2026, which is the only
 * source consulted that gave a classification AND a population per ZIP. That
 * distinction is what the other sources were disagreeing about: Monmouth is
 * variously reported as having 50, 58 or 61 ZIPs depending on whether PO Box
 * and single-entity codes are counted. It has 58 — of which 49 are standard
 * delivery, 8 are PO Box, and one belongs to NJ Natural Gas.
 *
 * Idempotent, and safe to run before or after the CSV import.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ZIPS: {
  zip: string; city: string; county: string; state: string;
  type: string; population: number | null;
}[] = [
  { zip: "07728", city: "Freehold", county: "Monmouth", state: "NJ", type: "STANDARD", population: 55984 },
  { zip: "07726", city: "Englishtown", county: "Monmouth", state: "NJ", type: "STANDARD", population: 44764 },
  { zip: "07731", city: "Howell", county: "Monmouth", state: "NJ", type: "STANDARD", population: 40322 },
  { zip: "07712", city: "Asbury Park", county: "Monmouth", state: "NJ", type: "STANDARD", population: 40194 },
  { zip: "07753", city: "Neptune", county: "Monmouth", state: "NJ", type: "STANDARD", population: 37297 },
  { zip: "07740", city: "Long Branch", county: "Monmouth", state: "NJ", type: "STANDARD", population: 32917 },
  { zip: "07747", city: "Matawan", county: "Monmouth", state: "NJ", type: "STANDARD", population: 32330 },
  { zip: "07748", city: "Middletown", county: "Monmouth", state: "NJ", type: "STANDARD", population: 28633 },
  { zip: "07701", city: "Red Bank", county: "Monmouth", state: "NJ", type: "STANDARD", population: 24376 },
  { zip: "07724", city: "Eatontown", county: "Monmouth", state: "NJ", type: "STANDARD", population: 24016 },
  { zip: "07719", city: "Belmar", county: "Monmouth", state: "NJ", type: "STANDARD", population: 22138 },
  { zip: "07751", city: "Morganville", county: "Monmouth", state: "NJ", type: "STANDARD", population: 21109 },
  { zip: "07735", city: "Keyport", county: "Monmouth", state: "NJ", type: "STANDARD", population: 19159 },
  { zip: "07746", city: "Marlboro", county: "Monmouth", state: "NJ", type: "STANDARD", population: 18476 },
  { zip: "07730", city: "Hazlet", county: "Monmouth", state: "NJ", type: "STANDARD", population: 17534 },
  { zip: "07733", city: "Holmdel", county: "Monmouth", state: "NJ", type: "STANDARD", population: 17166 },
  { zip: "08736", city: "Manasquan", county: "Monmouth", state: "NJ", type: "STANDARD", population: 13223 },
  { zip: "07734", city: "Keansburg", county: "Monmouth", state: "NJ", type: "STANDARD", population: 12925 },
  { zip: "07722", city: "Colts Neck", county: "Monmouth", state: "NJ", type: "STANDARD", population: 9990 },
  { zip: "07760", city: "Rumson", county: "Monmouth", state: "NJ", type: "STANDARD", population: 9692 },
  { zip: "07716", city: "Atlantic Highlands", county: "Monmouth", state: "NJ", type: "STANDARD", population: 8893 },
  { zip: "07764", city: "West Long Branch", county: "Monmouth", state: "NJ", type: "STANDARD", population: 8586 },
  { zip: "07762", city: "Spring Lake", county: "Monmouth", state: "NJ", type: "STANDARD", population: 8262 },
  { zip: "07727", city: "Farmingdale", county: "Monmouth", state: "NJ", type: "STANDARD", population: 7787 },
  { zip: "07738", city: "Lincroft", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6939 },
  { zip: "07718", city: "Belford", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6658 },
  { zip: "08501", city: "Allentown", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6364 },
  { zip: "07757", city: "Oceanport", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6195 },
  { zip: "07704", city: "Fair Haven", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6170 },
  { zip: "07739", city: "Little Silver", county: "Monmouth", state: "NJ", type: "STANDARD", population: 6105 },
  { zip: "07755", city: "Oakhurst", county: "Monmouth", state: "NJ", type: "STANDARD", population: 5613 },
  { zip: "08510", city: "Millstone Township", county: "Monmouth", state: "NJ", type: "STANDARD", population: 5386 },
  { zip: "08535", city: "Millstone Township", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4999 },
  { zip: "08730", city: "Brielle", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4956 },
  { zip: "08514", city: "Cream Ridge", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4917 },
  { zip: "07732", city: "Highlands", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4527 },
  { zip: "07721", city: "Cliffwood", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4277 },
  { zip: "07702", city: "Shrewsbury", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4179 },
  { zip: "07720", city: "Bradley Beach", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4158 },
  { zip: "07758", city: "Port Monmouth", county: "Monmouth", state: "NJ", type: "STANDARD", population: 4076 },
  { zip: "07737", city: "Leonardo", county: "Monmouth", state: "NJ", type: "STANDARD", population: 3945 },
  { zip: "08750", city: "Sea Girt", county: "Monmouth", state: "NJ", type: "STANDARD", population: 3483 },
  { zip: "07750", city: "Monmouth Beach", county: "Monmouth", state: "NJ", type: "STANDARD", population: 3207 },
  { zip: "07756", city: "Ocean Grove", county: "Monmouth", state: "NJ", type: "STANDARD", population: 3092 },
  { zip: "07717", city: "Avon By The Sea", county: "Monmouth", state: "NJ", type: "STANDARD", population: 2030 },
  { zip: "07711", city: "Allenhurst", county: "Monmouth", state: "NJ", type: "STANDARD", population: 1641 },
  { zip: "08555", city: "Roosevelt", county: "Monmouth", state: "NJ", type: "PO_BOX", population: 996 },
  { zip: "07723", city: "Deal", county: "Monmouth", state: "NJ", type: "STANDARD", population: 884 },
  { zip: "08720", city: "Allenwood", county: "Monmouth", state: "NJ", type: "PO_BOX", population: 735 },
  { zip: "07703", city: "Fort Monmouth", county: "Monmouth", state: "NJ", type: "STANDARD", population: 0 },
  { zip: "07765", city: "Wickatunk", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "07752", city: "Navesink", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "08526", city: "Imlaystown", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "07715", city: "Belmar", county: "Monmouth", state: "NJ", type: "UNIQUE", population: null },
  { zip: "07710", city: "Adelphia", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "07754", city: "Neptune", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "07799", city: "Eatontown", county: "Monmouth", state: "NJ", type: "STANDARD", population: null },
  { zip: "07763", city: "Tennent", county: "Monmouth", state: "NJ", type: "PO_BOX", population: null },
  { zip: "08701", city: "Lakewood", county: "Ocean", state: "NJ", type: "STANDARD", population: 139149 },
  { zip: "08753", city: "Toms River", county: "Ocean", state: "NJ", type: "STANDARD", population: 65448 },
  { zip: "08527", city: "Jackson", county: "Ocean", state: "NJ", type: "STANDARD", population: 58991 },
  { zip: "08724", city: "Brick", county: "Ocean", state: "NJ", type: "STANDARD", population: 42345 },
  { zip: "08757", city: "Toms River", county: "Ocean", state: "NJ", type: "STANDARD", population: 36087 },
  { zip: "08759", city: "Manchester Township", county: "Ocean", state: "NJ", type: "STANDARD", population: 34237 },
  { zip: "08723", city: "Brick", county: "Ocean", state: "NJ", type: "STANDARD", population: 32141 },
  { zip: "08755", city: "Toms River", county: "Ocean", state: "NJ", type: "STANDARD", population: 29670 },
  { zip: "08050", city: "Manahawkin", county: "Ocean", state: "NJ", type: "STANDARD", population: 28053 },
  { zip: "08005", city: "Barnegat", county: "Ocean", state: "NJ", type: "STANDARD", population: 26866 },
  { zip: "08742", city: "Point Pleasant Beach", county: "Ocean", state: "NJ", type: "STANDARD", population: 25732 },
  { zip: "08087", city: "Tuckerton", county: "Ocean", state: "NJ", type: "STANDARD", population: 25342 },
  { zip: "08721", city: "Bayville", county: "Ocean", state: "NJ", type: "STANDARD", population: 22783 },
  { zip: "08731", city: "Forked River", county: "Ocean", state: "NJ", type: "STANDARD", population: 21629 },
  { zip: "08722", city: "Beachwood", county: "Ocean", state: "NJ", type: "STANDARD", population: 11088 },
  { zip: "08734", city: "Lanoka Harbor", county: "Ocean", state: "NJ", type: "STANDARD", population: 7879 },
  { zip: "08758", city: "Waretown", county: "Ocean", state: "NJ", type: "STANDARD", population: 7868 },
  { zip: "08533", city: "New Egypt", county: "Ocean", state: "NJ", type: "STANDARD", population: 7563 },
  { zip: "08008", city: "Beach Haven", county: "Ocean", state: "NJ", type: "STANDARD", population: 6837 },
  { zip: "08751", city: "Seaside Heights", county: "Ocean", state: "NJ", type: "STANDARD", population: 4185 },
  { zip: "08735", city: "Lavallette", county: "Ocean", state: "NJ", type: "STANDARD", population: 3451 },
  { zip: "08092", city: "West Creek", county: "Ocean", state: "NJ", type: "STANDARD", population: 3119 },
  { zip: "08733", city: "Lakehurst", county: "Ocean", state: "NJ", type: "STANDARD", population: 2816 },
  { zip: "08741", city: "Pine Beach", county: "Ocean", state: "NJ", type: "STANDARD", population: 2709 },
  { zip: "08752", city: "Seaside Park", county: "Ocean", state: "NJ", type: "STANDARD", population: 2338 },
  { zip: "08740", city: "Ocean Gate", county: "Ocean", state: "NJ", type: "PO_BOX", population: 1599 },
  { zip: "08732", city: "Island Heights", county: "Ocean", state: "NJ", type: "PO_BOX", population: 1558 },
  { zip: "08738", city: "Mantoloking", county: "Ocean", state: "NJ", type: "STANDARD", population: 1381 },
  { zip: "08006", city: "Barnegat Light", county: "Ocean", state: "NJ", type: "PO_BOX", population: 500 },
  { zip: "08756", city: "Toms River", county: "Ocean", state: "NJ", type: "PO_BOX", population: null },
  { zip: "08754", city: "Toms River", county: "Ocean", state: "NJ", type: "PO_BOX", population: null },
  { zip: "08739", city: "Normandy Beach", county: "Ocean", state: "NJ", type: "PO_BOX", population: null },
];

async function main() {
  for (const z of ZIPS) {
    await prisma.zipCode.upsert({ where: { zip: z.zip }, update: z, create: z });
  }

  const standard = ZIPS.filter((z) => z.type === "STANDARD" && (z.population ?? 0) > 0);
  const byCounty = new Map<string, number>();
  for (const z of standard) byCounty.set(z.county, (byCounty.get(z.county) ?? 0) + 1);

  console.log(`\n  ${ZIPS.length} ZIP codes across Monmouth and Ocean\n`);
  for (const [c, n] of byCounty) {
    console.log(`      ${c}: ${n} with residents`);
  }
  console.log(`\n  ${ZIPS.length - standard.length} are PO Box, single-entity, or unpopulated —`);
  console.log(`  imported, but nobody can have one as a home address.\n`);
  console.log(`  Pick counties in the admin at /admin/service-area.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
