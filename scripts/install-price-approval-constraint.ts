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
 * ORDERING — LEARNED THE HARD WAY.
 *
 * This was first installed `NOT VALID`, on the belief that it would enforce
 * new writes while leaving six pre-boundary rows alone until they could be
 * re-approved. NOT VALID does skip the one-time full-table scan — but every
 * later UPDATE is still checked, so a row that already violates the rule
 * cannot be edited AT ALL. Completing a mount's missing labor hours failed,
 * and so would a contractor trying to fix inputs before re-approving. The
 * constraint had locked the door to its own remedy.
 *
 * So the order is: clear the legacy rows FIRST, then install, then validate.
 * In the meantime the boundary is held by the closed write paths (no route or
 * form can set a price) and by §1.4, which fails a service carrying a price
 * nobody approved.
 *
 *   --drop       remove it, to unblock remediation
 *   (no flag)    install NOT VALID
 *   --validate   extend it over the existing dataset, once nothing violates it
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NAME = "services_price_requires_approval";
const VALIDATE = process.argv.includes("--validate");
const DROP = process.argv.includes("--drop");

async function main() {
  const existing = await prisma.$queryRawUnsafe<{ convalidated: boolean }[]>(
    `select convalidated from pg_constraint where conname = '${NAME}'`
  );

  if (DROP) {
    if (existing.length === 0) { console.log(`\n  ${NAME} is not installed.\n`); return; }
    await prisma.$executeRawUnsafe(`ALTER TABLE services DROP CONSTRAINT ${NAME}`);
    console.log(`\n  ${NAME} dropped.`);
    console.log(`  The boundary is still held by the closed write paths and by §1.4.`);
    console.log(`  Reinstall once no service carries an unapproved price.\n`);
    return;
  }

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

  const legacy = await prisma.service.count({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
  });
  if (legacy > 0) {
    console.error(`\n  ${legacy} service(s) still carry an unapproved price.`);
    console.error(`  Installing now would lock those rows against the very edits`);
    console.error(`  needed to fix them. Re-approve them first, then install.\n`);
    process.exit(1);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE services ADD CONSTRAINT ${NAME} CHECK (
       ("basePrice" IS NULL) = ("publishedPriceApprovedAt" IS NULL)
     )`
  );
  console.log(`\n  ${NAME} installed and validated.`);
  console.log(`  A price and its approval are one fact, for every row.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
