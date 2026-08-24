/**
 * Split Material into CanonicalMaterial + ContractorMaterial — 24 Aug 2026.
 *
 *   npx tsx prisma/migrate-material-split-2026-08-24.ts            (report)
 *   npx tsx prisma/migrate-material-split-2026-08-24.ts --apply    (write)
 *
 * EXPAND PHASE. Copies data forward. Deletes nothing, changes no existing
 * row's meaning, and leaves every current read path working exactly as it
 * does today.
 *
 * WHY IT HAS TO BE DONE THIS WAY
 *
 * This project has no migrations folder — schema changes go through
 * `prisma db push`. Push compares the schema to the database and reshapes it.
 * Replace Material with two new models in one step and push will drop the
 * materials table: forty costs, every supplier link, every cost event, and
 * every ServiceMaterial row pointing at them. Gone, on a live database, with
 * a confirmation prompt that reads like routine.
 *
 * So the change is expand-contract:
 *
 *   1. db push — additive only. New models appear; Material is untouched.
 *   2. THIS SCRIPT — copy Material into the new shape.
 *   3. Verify. The reconciler still reads the OLD path and must still say
 *      108 of 108. Nothing has switched over yet.
 *   4. Switch the read paths (lib/materialCost.ts, the Materials API, seeds)
 *      and verify again.
 *   5. Only then remove Material and the deprecated columns.
 *
 * Between every step the application works. That is the point: at no moment
 * is there a window where a mistake loses data rather than failing a check.
 *
 * WHAT GOES WHERE
 *
 *   identity  -> CanonicalMaterial   key, name, unit, notes
 *   economics -> ContractorMaterial  cost, package basis, confidence,
 *                                    status, supplier links, cost events
 *
 * The key is carried across unchanged. The audit identified these keys as
 * stable role identity used throughout the pricing and seeding system.
 *
 * Idempotent. Re-running finds the rows already there and reports no work.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Elite becomes the first contractor. */
const CONTRACTOR = {
  slug: "elite-electric",
  name: "Elite Electric & Lighting",
  trade: "residential electrician",
  phone: "732-204-7003",
};

const $ = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : `$${(c / 100).toFixed(2)}`;

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nMATERIAL SPLIT — expand phase`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const materials = await prisma.material.findMany({
    orderBy: { key: "asc" },
    include: {
      supplierLinks: { select: { id: true } },
      costEvents: { select: { id: true } },
      services: { select: { id: true } },
    },
  });

  if (materials.length === 0) {
    console.error(`No materials found. Nothing to migrate — stopping rather than`);
    console.error(`creating an empty contractor.\n`);
    process.exit(1);
  }

  // Fail loudly on anything that would produce a broken canonical row.
  const badKeys = materials.filter((m) => !m.key || !m.key.trim());
  if (badKeys.length) {
    console.error(`STOPPING — ${badKeys.length} material(s) have no key. The key is the`);
    console.error(`canonical role identity and cannot be derived. Fix these first.\n`);
    process.exit(1);
  }

  const existingCanonical = await prisma.canonicalMaterial.count();
  const existingContractor = await prisma.contractor.count();

  console.log(`  ${materials.length} material(s) to split`);
  console.log(`  ${existingCanonical} canonical material(s) already present`);
  console.log(`  ${existingContractor} contractor(s) already present\n`);

  const linkCount = materials.reduce((n, m) => n + m.supplierLinks.length, 0);
  const eventCount = materials.reduce((n, m) => n + m.costEvents.length, 0);
  const useCount = materials.reduce((n, m) => n + m.services.length, 0);

  console.log(`${"─".repeat(72)}`);
  console.log(`  identity  -> CanonicalMaterial   ${materials.length} row(s)`);
  console.log(`  economics -> ContractorMaterial  ${materials.length} row(s)`);
  console.log(`  repoint      supplier links      ${linkCount}`);
  console.log(`  repoint      cost events         ${eventCount}`);
  console.log(`  repoint      service materials   ${useCount}`);
  console.log(`${"─".repeat(72)}\n`);

  // A sample, so the shape of the split is visible before it happens.
  for (const m of materials.slice(0, 5)) {
    console.log(`  ${m.key}`);
    console.log(`      canonical   ${m.name}  (${m.unit})`);
    console.log(
      `      Elite       ${$(m.unitCostCents)}/unit` +
        (m.packagePriceCents
          ? `  from ${$(m.packagePriceCents)} per ${m.packageQuantity} ${m.packageUnit ?? ""}`
          : "") +
        `  [${m.costConfidence}]`
    );
  }
  if (materials.length > 5) console.log(`  ...and ${materials.length - 5} more\n`);

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  // ---- write ------------------------------------------------------------
  //
  // BATCHED, and deliberately so.
  //
  // The first version of this did five sequential queries per material inside
  // one interactive transaction — roughly two hundred round trips. Against a
  // remote Neon database at ~25ms each that is well past Prisma's five-second
  // interactive transaction limit, and it timed out partway through. The
  // transaction rolled back cleanly and nothing was written, which is the
  // whole reason it is one transaction, but the script was still wrong.
  //
  // Now it is about seven queries regardless of catalog size. The three
  // repointing steps are single UPDATE ... FROM statements joined on the key,
  // because Prisma's updateMany cannot set a different value per row and
  // doing it per material is what caused the problem.
  //
  // The timeout is also raised. Batching alone should make it unnecessary,
  // but a slow connection should not be able to half-apply a migration.
  const result = await prisma.$transaction(
    async (tx) => {
      const contractor = await tx.contractor.upsert({
        where: { slug: CONTRACTOR.slug },
        update: {},
        create: CONTRACTOR,
      });

      // 1. Identity -> canonical. skipDuplicates makes a re-run a no-op
      //    rather than a unique-constraint error.
      await tx.canonicalMaterial.createMany({
        data: materials.map((m) => ({
          key: m.key,
          name: m.name,
          unit: m.unit,
          notes: m.notes,
          active: m.active,
        })),
        skipDuplicates: true,
      });

      // 2. Read back the ids we need to point at.
      const canonicals = await tx.canonicalMaterial.findMany({
        where: { key: { in: materials.map((m) => m.key) } },
        select: { id: true, key: true },
      });
      const idByKey = new Map(canonicals.map((c) => [c.key, c.id]));

      const missing = materials.filter((m) => !idByKey.has(m.key));
      if (missing.length) {
        // Cannot happen unless a key changed underneath us mid-transaction.
        // Throwing rolls the whole thing back rather than writing a partial
        // catalog.
        throw new Error(
          `Canonical rows missing for: ${missing.map((m) => m.key).join(", ")}`
        );
      }

      // 3. Economics -> contractor.
      await tx.contractorMaterial.createMany({
        data: materials.map((m) => ({
          contractorId: contractor.id,
          canonicalMaterialId: idByKey.get(m.key)!,
          unitCostCents: m.unitCostCents,
          unitCostMilliCents: m.unitCostMilliCents,
          packagePriceCents: m.packagePriceCents,
          packageQuantity: m.packageQuantity,
          packageUnit: m.packageUnit,
          costSource: m.costSource,
          costConfidence: m.costConfidence,
          costStatus: m.costStatus,
          costStatusNote: m.costStatusNote,
          costUpdatedAt: m.costUpdatedAt,
          notes: m.notes,
          active: m.active,
        })),
        skipDuplicates: true,
      });

      // 4. Recipes point at the ROLE. One statement, joined on the key.
      const usesRepointed: number = await tx.$executeRaw`
        UPDATE "service_materials" sm
        SET "canonicalMaterialId" = cm."id"
        FROM "materials" m
        JOIN "canonical_materials" cm ON cm."key" = m."key"
        WHERE sm."materialId" = m."id"
          AND sm."canonicalMaterialId" IS NULL
      `;

      // 5. Supplier products are a contractor's choice, so links follow the
      //    contractor material.
      const linksRepointed: number = await tx.$executeRaw`
        UPDATE "material_supplier_links" l
        SET "contractorMaterialId" = cmat."id"
        FROM "materials" m
        JOIN "canonical_materials" cm ON cm."key" = m."key"
        JOIN "contractor_materials" cmat
          ON cmat."canonicalMaterialId" = cm."id"
         AND cmat."contractorId" = ${contractor.id}
        WHERE l."materialId" = m."id"
          AND l."contractorMaterialId" IS NULL
      `;

      // 6. A cost movement is always one contractor's.
      const eventsRepointed: number = await tx.$executeRaw`
        UPDATE "material_cost_events" e
        SET "contractorMaterialId" = cmat."id"
        FROM "materials" m
        JOIN "canonical_materials" cm ON cm."key" = m."key"
        JOIN "contractor_materials" cmat
          ON cmat."canonicalMaterialId" = cm."id"
         AND cmat."contractorId" = ${contractor.id}
        WHERE e."materialId" = m."id"
          AND e."contractorMaterialId" IS NULL
      `;

      return {
        contractorId: contractor.id,
        canonicalCreated: canonicals.length,
        contractorCreated: materials.length,
        linksRepointed,
        eventsRepointed,
        usesRepointed,
      };
    },
    {
      // Generous, because a half-applied migration is far worse than a slow
      // one. Batching should keep this to a couple of seconds.
      timeout: 120_000,
      maxWait: 20_000,
    }
  );

  // ---- read back ---------------------------------------------------------
  const canonicalTotal = await prisma.canonicalMaterial.count();
  const contractorTotal = await prisma.contractorMaterial.count();
  const unlinkedUses = await prisma.serviceMaterial.count({
    where: { canonicalMaterialId: null },
  });

  console.log(`\n  MIGRATED — read back from the database:\n`);
  console.log(`      contractor           ${CONTRACTOR.name} (${result.contractorId})`);
  console.log(`      canonical materials  ${canonicalTotal}`);
  console.log(`      contractor materials ${contractorTotal}`);
  console.log(`      supplier links       ${result.linksRepointed} repointed`);
  console.log(`      cost events          ${result.eventsRepointed} repointed`);
  console.log(`      service materials    ${result.usesRepointed} repointed`);
  console.log(`      still unlinked       ${unlinkedUses}`);

  if (unlinkedUses > 0) {
    console.error(
      `\n  ${unlinkedUses} service material(s) still have no canonical link.\n` +
        `  Do NOT proceed to the contract phase. Investigate these first —\n` +
        `  removing Material now would orphan them.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Nothing was removed. Material and every existing read path are intact.`);
  console.log(`  Next: npm run db:reconcile — must still be 108 of 108, because`);
  console.log(`  nothing has switched over yet.\n`);
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
