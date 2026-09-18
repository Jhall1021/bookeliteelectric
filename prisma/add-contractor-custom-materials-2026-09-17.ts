/**
 * Contractor-scoped custom material identities — 17 September 2026.
 *
 *   DATABASE_URL_UNPOOLED=... npx tsx prisma/add-contractor-custom-materials-2026-09-17.ts
 *   DATABASE_URL_UNPOOLED=... npx tsx prisma/add-contractor-custom-materials-2026-09-17.ts --apply
 *
 * Report-only by default. The apply path is additive and idempotent: existing
 * platform CanonicalMaterial rows remain ownerless and unchanged. New columns
 * let a contractor create a private material role without inserting a shared
 * platform identity that another contractor could see or use.
 *
 * Migrations require Neon's direct connection. Refusing a pooled URL prevents
 * an apparently successful session-level migration from hopping PgBouncer
 * backends between statements.
 */

import { PrismaClient } from "@prisma/client";

const directUrl = process.env.DATABASE_URL_UNPOOLED;
if (!directUrl) throw new Error("DATABASE_URL_UNPOOLED is required for this schema migration.");
if (new URL(directUrl).hostname.includes("-pooler")) {
  throw new Error("DATABASE_URL_UNPOOLED points at a pooled host; use Neon's direct connection.");
}

const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

type ColumnRow = { column_name: string };

async function columns(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'canonical_materials'
  `;
  return new Set(rows.map((row) => row.column_name));
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("\nCONTRACTOR-SCOPED CUSTOM MATERIAL IDENTITIES\n");

  const before = await columns();
  console.log(`  ownerContractorId  : ${before.has("ownerContractorId") ? "present" : "missing"}`);
  console.log(`  ownerNormalizedName: ${before.has("ownerNormalizedName") ? "present" : "missing"}`);

  if (!apply) {
    console.log("\n  Report only. Re-run with --apply on an isolated Neon branch first.\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      ALTER TABLE "canonical_materials"
      ADD COLUMN IF NOT EXISTS "ownerContractorId" TEXT,
      ADD COLUMN IF NOT EXISTS "ownerNormalizedName" TEXT
    `);
    await tx.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'canonical_materials_ownerContractorId_fkey'
        ) THEN
          ALTER TABLE "canonical_materials"
          ADD CONSTRAINT "canonical_materials_ownerContractorId_fkey"
          FOREIGN KEY ("ownerContractorId") REFERENCES "contractors"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
    await tx.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'canonical_materials_owner_name_consistency_check'
        ) THEN
          ALTER TABLE "canonical_materials"
          ADD CONSTRAINT "canonical_materials_owner_name_consistency_check"
          CHECK (
            ("ownerContractorId" IS NULL AND "ownerNormalizedName" IS NULL)
            OR
            ("ownerContractorId" IS NOT NULL AND "ownerNormalizedName" IS NOT NULL)
          );
        END IF;
      END $$
    `);
    await tx.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "canonical_materials_ownerContractorId_ownerNormalizedName_key"
      ON "canonical_materials"("ownerContractorId", "ownerNormalizedName")
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "canonical_materials_ownerContractorId_idx"
      ON "canonical_materials"("ownerContractorId")
    `);
  });

  const after = await columns();
  if (!after.has("ownerContractorId") || !after.has("ownerNormalizedName")) {
    throw new Error("Migration did not establish both custom-material ownership columns.");
  }

  console.log("\n  ✓ Additive schema change applied and verified.");
  console.log("    Existing platform material identities remain ownerless.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
