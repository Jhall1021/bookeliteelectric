/**
 * A published price and its approval are one fact, enforced by Postgres.
 *
 *   npx tsx scripts/install-price-approval-constraint.ts
 *
 * `basePrice` is what a homeowner pays. `publishedPriceApprovedAt` is the
 * moment a human accepted that number. Either both are set or neither is —
 * a price nobody approved is not a price, and an approval with no price is
 * the chandelier defect, which is exactly how that service lost its money:
 * a reconciliation stamped an approval 91ms before it wrote the amount, the
 * write did not land, and nothing anywhere noticed the pair had come apart.
 *
 * A CHECK CONSTRAINT RATHER THAN A CONVENTION, for the same reason the payment
 * ledger is append-only by trigger: the rule has to hold against code nobody
 * has written yet — a seed, a reconciliation script, a future admin route.
 *
 * ADDED `NOT VALID`, DELIBERATELY.
 *
 * Four services carry a price published before this boundary existed and have
 * no stamp. NOT VALID enforces the rule on every insert and update from now
 * on while leaving those rows alone, so the constraint starts working today
 * instead of waiting on a backlog. Stamping them here to make the constraint
 * clean would be a script approving four prices on a contractor's behalf.
 *
 * When the backlog clears, run with --validate to check the history too.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NAME = "services_price_requires_approval";
const VALIDATE = process.argv.includes("--validate");

async function main() {
  const existing = await prisma.$queryRawUnsafe<{ convalidated: boolean }[]>(
    `select convalidated from pg_constraint where conname = '${NAME}'`
  );

  if (VALIDATE) {
    if (existing.length === 0) { console.error(`\n  ${NAME} is not installed.\n`); process.exit(1); }
    if (existing[0].convalidated) { console.log(`\n  ${NAME} is already validated.\n`); return; }

    const unapproved = await prisma.service.count({
      where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
    });
    if (unapproved > 0) {
      console.error(`\n  ${unapproved} service(s) still carry an unapproved price.`);
      console.error(`  They must be re-approved through the pricing screen first.\n`);
      process.exit(1);
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE services VALIDATE CONSTRAINT ${NAME}`);
    console.log(`\n  ${NAME} now holds for every row, past and future.\n`);
    return;
  }

  if (existing.length > 0) {
    console.log(`\n  ${NAME} is already installed (validated: ${existing[0].convalidated}).\n`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE services ADD CONSTRAINT ${NAME} CHECK (
       ("basePrice" IS NULL) = ("publishedPriceApprovedAt" IS NULL)
     ) NOT VALID`
  );

  const legacy = await prisma.service.count({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
  });
  console.log(`\n  ${NAME} installed.`);
  console.log(`  Every new write must carry a price and its approval together.`);
  console.log(`  ${legacy} pre-existing row(s) left as they are, pending re-approval.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
