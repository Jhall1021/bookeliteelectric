/**
 * The category split's structural invariant — ADR-006.
 *
 *   npx tsx scripts/verify-category-integrity.ts
 *
 * READ ONLY. Counts and reads; writes nothing, creates nothing, and touches no
 * throwaway fixture. That is why it belongs in `npm run verify` and the build
 * gate while reconciliation does not: this is a structural invariant that
 * production reads REQUIRE in order to function, not a judgment about mutable
 * pricing data.
 *
 * WHAT IT DEFENDS
 *
 * Every operational category read now roots at ContractorCategory and fails
 * closed on a null one — `requireContractorCategory` throws rather than
 * putting the string "undefined" into a customer-facing URL. That makes a
 * service without a contractor category a page that 500s, not a page that
 * looks slightly wrong.
 *
 * Before the seed helper existed, seeds wrote only the pre-split
 * ServiceCategory and left contractorCategoryId null, so the rule was "re-run
 * the backfill after any seed" — an ordering rule a human had to remember. The
 * write path now encodes it (prisma/_categoryHelpers.ts) and this is the
 * backstop that proves it, which is stronger than either alone.
 *
 * ON "ACTIVE"
 *
 * Inactive services are checked too. An inactive service is one flip away from
 * being customer-facing, and finding out at that moment is finding out too
 * late.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n${detail}`}`);
}

async function main() {
  console.log(`\nCATEGORY INTEGRITY — ADR-006\n`);

  const total = await prisma.service.count();
  if (total === 0) {
    console.log(`  No services. Nothing to check.\n`);
    return;
  }

  // 1. No service without a contractor category.
  const orphans = await prisma.service.findMany({
    where: { contractorCategoryId: null },
    select: { slug: true, active: true },
    orderBy: { slug: "asc" },
  });
  ok(
    orphans.length === 0,
    `all ${total} services carry a contractorCategoryId`,
    orphans
      .map(
        (s) =>
          `      Service ${s.slug} has no ContractorCategory. Seed/migration must ` +
          `create the split category relationship${s.active ? "" : " (inactive, but one flip from live)"}.`
      )
      .join("\n") +
      `\n\n      Fix: prisma/_categoryHelpers.ts at seed time, or\n` +
      `      npx tsx prisma/backfill-category-split-2026-08-27.ts --apply to repair.`
  );

  // 2. No service pointing at a ContractorCategory that isn't there.
  //
  // The foreign key should make this impossible. It is checked anyway because
  // the column was added nullable during expand, and a constraint you believe
  // in but never test is a constraint you are trusting rather than relying on.
  const withCategory = await prisma.service.findMany({
    where: { contractorCategoryId: { not: null } },
    select: { slug: true, contractorCategoryId: true, contractorCategory: { select: { id: true } } },
  });
  const dangling = withCategory.filter((s) => s.contractorCategory === null);
  ok(
    dangling.length === 0,
    `all ${withCategory.length} pointers resolve to a real ContractorCategory`,
    dangling.map((s) => `      ${s.slug} -> ${s.contractorCategoryId} (missing)`).join("\n")
  );

  // 3. Every ContractorCategory resolves to a canonical row. Also FK-protected.
  const contractorCategories = await prisma.contractorCategory.findMany({
    select: {
      id: true,
      contractorId: true,
      canonicalCategory: { select: { slug: true } },
    },
  });
  const noCanonical = contractorCategories.filter((c) => c.canonicalCategory === null);
  ok(
    noCanonical.length === 0,
    `all ${contractorCategories.length} contractor categories resolve to a canonical row`,
    noCanonical.map((c) => `      ${c.id}`).join("\n")
  );

  // 4. A service and its category must belong to the SAME contractor.
  //
  // No foreign key can express this — both columns are individually valid
  // while pointing at different tenants. It is the exact shape of the
  // cross-tenant FK the new-service route now rejects, and this is what would
  // catch one written by a seed or a migration instead.
  const crossTenant = await prisma.service.findMany({
    where: { contractorCategoryId: { not: null } },
    select: {
      slug: true,
      contractorId: true,
      contractorCategory: { select: { contractorId: true } },
    },
  });
  const mismatched = crossTenant.filter(
    (s) => s.contractorCategory && s.contractorId !== s.contractorCategory.contractorId
  );
  ok(
    mismatched.length === 0,
    `no service points at another contractor's category`,
    mismatched
      .map(
        (s) =>
          `      ${s.slug}: service belongs to ${s.contractorId}, ` +
          `its category to ${s.contractorCategory?.contractorId}`
      )
      .join("\n")
  );

  console.log(
    fail === 0
      ? `\n  Category structure is intact.\n`
      : `\n  ${fail} structural check(s) FAILED. Production category reads will throw.\n`
  );
  process.exitCode = fail === 0 ? 0 : 1;
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
