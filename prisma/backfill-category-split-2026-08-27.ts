/**
 * Split ServiceCategory into canonical taxonomy and contractor presentation —
 * 27 August 2026. ADR-006.
 *
 *   npx tsx prisma/backfill-category-split-2026-08-27.ts            (report)
 *   npx tsx prisma/backfill-category-split-2026-08-27.ts --apply    (write)
 *
 * EXPAND PHASE, continued. Additive only: creates rows in two new tables and
 * fills a column that is currently null everywhere. `ServiceCategory` is read
 * but never written, never deleted, and keeps every row. Retiring it is the
 * contract phase, several steps away.
 *
 * WHAT IT WRITES
 *
 *   CanonicalCategory          one per existing ServiceCategory, by slug
 *   ContractorCategory         one per (contractor, canonical) pair
 *   Service.contractorCategoryId
 *
 * No price, no material, no labor, no published figure. It cannot move a
 * customer's price.
 *
 * HOW PRESENTATION IS PRESERVED
 *
 * Elite's current values BECOME the canonical defaults — `name` and
 * `defaultIcon` are copied straight across — so `nameOverride` and
 * `iconOverride` are left null. That is what makes the catalog render
 * identically afterwards: every fallback resolves to the same string it
 * resolves to today.
 *
 * `sortOrder` and `navGroup` move to ContractorCategory, because they are
 * storefront organization rather than electrical truth. Elite's current values
 * are carried over exactly.
 *
 * The seam already existed: prisma/seed.ts deliberately does not sync
 * sortOrder, with a comment that it is set in the admin now.
 *
 * FAIL CLOSED
 *
 * Refuses to write if any service has no contractor, or if any service's
 * category cannot be mapped. A partially-backfilled catalog is worse than an
 * unbackfilled one, because the read switch that follows would silently drop
 * services whose pointer never got set.
 *
 * Idempotent. Upserts by natural key and only fills a null
 * contractorCategoryId, so a re-run reports nothing to do and a row later
 * adjusted by hand is left alone.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nBACKFILL — category split (ADR-006)`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { services: true } } },
  });

  if (categories.length === 0) {
    console.error(`  No ServiceCategory rows. Nothing to split.\n`);
    process.exit(1);
    return;
  }

  // Every service must have an owner before its category can be assigned to
  // one. This is the condition that decides WHOSE ContractorCategory a service
  // points at, so an unowned service is not a row to skip — it is a stop.
  // Was a query for services with no contractor. Pass three's contract made
  // Service.contractorId NOT NULL, so the database now enforces what this
  // check looked for, and the query no longer type-checks. Kept as an empty
  // list rather than deleted, so the stop-condition below still reads as the
  // rule it always was.
  const unowned: { slug: string }[] = [];
  if (unowned.length > 0) {
    console.error(
      `  ${unowned.length} service(s) have no contractor, so their category\n` +
        `  cannot be assigned to one:\n` +
        unowned.map((s) => `      ${s.slug}`).join("\n") +
        `\n\n  Run prisma/backfill-service-contractor-2026-08-25.ts first.\n`
    );
    process.exit(1);
    return;
  }

  const services = await prisma.service.findMany({
    select: {
      id: true,
      slug: true,
      categoryId: true,
      contractorId: true,
      contractorCategoryId: true,
    },
  });

  const contractors = await prisma.contractor.findMany({
    select: { id: true, slug: true, name: true },
  });
  const contractorById = new Map(contractors.map((c) => [c.id, c]));

  // Which (contractor, category) pairs are actually in use.
  const pairs = new Map<string, { contractorId: string; categoryId: string; services: number }>();
  for (const s of services) {
    const key = `${s.contractorId}::${s.categoryId}`;
    const seen = pairs.get(key);
    if (seen) seen.services++;
    else
      pairs.set(key, {
        contractorId: s.contractorId!,
        categoryId: s.categoryId,
        services: 1,
      });
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const unmapped = [...pairs.values()].filter((p) => !categoryById.has(p.categoryId));
  if (unmapped.length > 0) {
    console.error(
      `  ${unmapped.length} service group(s) point at a category that does not exist.\n` +
        `  Refusing rather than dropping them.\n`
    );
    process.exit(1);
    return;
  }

  console.log(`  ${categories.length} categories, ${services.length} services, ` +
    `${contractors.length} contractor(s)\n`);
  console.log(`  sort  slug                    name                        ` +
    `icon        navGroup             svcs`);
  console.log(`  ${"─".repeat(96)}`);
  for (const c of categories) {
    console.log(
      `  ${String(c.sortOrder).padStart(4)}  ${c.slug.padEnd(22)} ${c.name.padEnd(26)} ` +
        `${String(c.icon ?? "—").padEnd(11)} ${String(c.navGroup ?? "—").padEnd(20)} ` +
        `${String(c._count.services).padStart(4)}`
    );
  }

  const alreadyPointed = services.filter((s) => s.contractorCategoryId !== null).length;
  console.log(
    `\n  Services already carrying contractorCategoryId: ${alreadyPointed} of ${services.length}`
  );
  console.log(`  Contractor categories to ensure: ${pairs.size}`);
  for (const p of pairs.values()) {
    const c = categoryById.get(p.categoryId)!;
    const owner = contractorById.get(p.contractorId);
    console.log(`      ${(owner?.slug ?? "?").padEnd(18)} ${c.slug.padEnd(22)} ${p.services} service(s)`);
  }

  // Categories with no services still get an Elite row, so the admin ordering
  // screen keeps every category it has today. An empty category is a real
  // catalog entry, not a leftover.
  const orphanCategories = categories.filter(
    (c) => ![...pairs.values()].some((p) => p.categoryId === c.id)
  );
  if (orphanCategories.length > 0) {
    console.log(`\n  Categories with no services (still given a contractor row):`);
    for (const c of orphanCategories) console.log(`      ${c.slug}`);
  }

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  // ---- write -------------------------------------------------------------

  // The contractor that inherits categories which no service uses. Only
  // meaningful when there is exactly one; with more, an empty category has no
  // obvious owner and is left alone rather than guessed at.
  const soleContractor = contractors.length === 1 ? contractors[0] : null;

  let canonicalWritten = 0;
  let contractorWritten = 0;
  const canonicalBySourceId = new Map<string, string>();

  for (const c of categories) {
    const canonical = await prisma.canonicalCategory.upsert({
      where: { slug: c.slug },
      // Name and icon are the platform defaults. A re-run refreshes them from
      // the pre-split row, which is still the source of truth until the
      // contract phase; it does NOT touch any contractor's overrides.
      update: { name: c.name, defaultIcon: c.icon },
      create: { slug: c.slug, name: c.name, defaultIcon: c.icon },
    });
    canonicalBySourceId.set(c.id, canonical.id);
    canonicalWritten++;
  }

  for (const p of pairs.values()) {
    const c = categoryById.get(p.categoryId)!;
    await prisma.contractorCategory.upsert({
      where: {
        contractorId_canonicalCategoryId: {
          contractorId: p.contractorId,
          canonicalCategoryId: canonicalBySourceId.get(c.id)!,
        },
      },
      // Deliberately empty. A re-run must not stamp a contractor's ordering
      // back to whatever the pre-split row says — sortOrder is edited in the
      // admin, and overwriting it here is exactly the bug prisma/seed.ts
      // avoids by not syncing it.
      update: {},
      create: {
        contractorId: p.contractorId,
        canonicalCategoryId: canonicalBySourceId.get(c.id)!,
        sortOrder: c.sortOrder,
        navGroup: c.navGroup,
        // Null on purpose: the canonical defaults ARE Elite's current values,
        // so every fallback resolves to the same string it does today.
        nameOverride: null,
        iconOverride: null,
        active: true,
      },
    });
    contractorWritten++;
  }

  for (const c of orphanCategories) {
    if (!soleContractor) continue;
    await prisma.contractorCategory.upsert({
      where: {
        contractorId_canonicalCategoryId: {
          contractorId: soleContractor.id,
          canonicalCategoryId: canonicalBySourceId.get(c.id)!,
        },
      },
      update: {},
      create: {
        contractorId: soleContractor.id,
        canonicalCategoryId: canonicalBySourceId.get(c.id)!,
        sortOrder: c.sortOrder,
        navGroup: c.navGroup,
        nameOverride: null,
        iconOverride: null,
        active: true,
      },
    });
    contractorWritten++;
  }

  // Point each service at its own contractor's row.
  let pointed = 0;
  for (const s of services) {
    if (s.contractorCategoryId !== null) continue;
    const canonicalId = canonicalBySourceId.get(s.categoryId)!;
    const cc = await prisma.contractorCategory.findUnique({
      where: {
        contractorId_canonicalCategoryId: {
          contractorId: s.contractorId!,
          canonicalCategoryId: canonicalId,
        },
      },
      select: { id: true },
    });
    if (!cc) {
      console.error(`\n  ${s.slug}: no contractor category was created for it. Stopping.\n`);
      process.exit(1);
      return;
    }
    await prisma.service.update({
      where: { id: s.id },
      data: { contractorCategoryId: cc.id },
    });
    pointed++;
  }

  console.log(`\n  ${canonicalWritten} canonical categories`);
  console.log(`  ${contractorWritten} contractor categories`);
  console.log(`  ${pointed} services pointed`);

  // ---- verify ------------------------------------------------------------
  const stillNull = await prisma.service.count({ where: { contractorCategoryId: null } });
  const canonicalTotal = await prisma.canonicalCategory.count();
  const contractorTotal = await prisma.contractorCategory.count();

  console.log(
    `\n  VERIFY: ${canonicalTotal} canonical, ${contractorTotal} contractor, ` +
      `${stillNull} service(s) still unpointed`
  );
  if (stillNull > 0) {
    console.error(`\n  INCOMPLETE — some services carry no contractor category.\n`);
    process.exitCode = 1;
    return;
  }

  // Every service must resolve to the SAME visible category it does today.
  const check = await prisma.service.findMany({
    select: {
      slug: true,
      category: { select: { slug: true, name: true, icon: true } },
      contractorCategory: {
        select: {
          nameOverride: true,
          iconOverride: true,
          canonicalCategory: { select: { slug: true, name: true, defaultIcon: true } },
        },
      },
    },
  });
  const drifted = check.filter((s) => {
    const cc = s.contractorCategory;
    if (!cc) return true;
    const slugSame = cc.canonicalCategory.slug === s.category.slug;
    const nameSame = (cc.nameOverride ?? cc.canonicalCategory.name) === s.category.name;
    const iconSame = (cc.iconOverride ?? cc.canonicalCategory.defaultIcon) === s.category.icon;
    return !(slugSame && nameSame && iconSame);
  });
  console.log(
    `  VERIFY: ${check.length - drifted.length} of ${check.length} services resolve to an ` +
      `identical slug, name and icon`
  );
  if (drifted.length > 0) {
    console.error(`\n  DRIFT on:\n` + drifted.map((s) => `      ${s.slug}`).join("\n") + `\n`);
    process.exitCode = 1;
    return;
  }

  // Ordering and grouping are the other half of "renders identically", and
  // are NOT covered by the per-service check above — a category could carry
  // the right name and icon while sitting in the wrong place on the page.
  const ordering = await prisma.contractorCategory.findMany({
    select: {
      sortOrder: true,
      navGroup: true,
      canonicalCategory: { select: { slug: true } },
    },
  });
  const sourceBySlug = new Map(categories.map((c) => [c.slug, c]));
  const misordered = ordering.filter((cc) => {
    const src = sourceBySlug.get(cc.canonicalCategory.slug);
    if (!src) return true;
    return cc.sortOrder !== src.sortOrder || cc.navGroup !== src.navGroup;
  });
  console.log(
    `  VERIFY: ${ordering.length - misordered.length} of ${ordering.length} categories keep ` +
      `their exact sortOrder and navGroup`
  );
  if (misordered.length > 0) {
    console.error(
      `\n  ORDERING DRIFT on:\n` +
        misordered.map((c) => `      ${c.canonicalCategory.slug}`).join("\n") +
        `\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Done. ServiceCategory untouched; nothing reads the new rows yet.\n`);
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
