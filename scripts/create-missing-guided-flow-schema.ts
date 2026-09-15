/**
 * Create the GuidedFlowSession/DeviceHandoff/GuidedFlowVisualAssistTask
 * schema that `db push` was supposed to create.
 *
 * WHAT WENT WRONG
 *
 * `991de44` (10 Sep 2026) added GuidedFlowSession, DeviceHandoff and
 * GuidedFlowVisualAssistTask to prisma/schema.prisma and merged to main.
 * `npm run db:push` — the sanctioned, and only, way schema changes reach this
 * production database (see docs/debt/no-prisma-migration-history-2026-09-01.md;
 * there is no prisma/migrations/ directory and no _prisma_migrations table in
 * this repository or this database) — was never run against production
 * afterward. The tables do not exist. Confirmed directly, not inferred:
 * `information_schema.tables` has zero rows for all three names, and
 * `pg_indexes` has zero rows for all three as well — there is nothing to
 * index because there is nothing to index it on.
 *
 * This is the exact same failure shape scripts/create-missing-tenant-indexes.ts
 * exists to close for a different incident: a schema change that reached
 * schema.prisma and a merge but never reached the live database, discovered
 * only by a check that reads the database directly rather than trusting the
 * file.
 *
 * WHY NAMED, EXPLICIT SQL RATHER THAN `db push`
 *
 * Same reasoning as create-missing-tenant-indexes.ts: `db push` diffs the
 * WHOLE schema against the WHOLE database and decides for itself how to
 * reconcile every difference it finds, not just this one. Against a database
 * with real bookings, contractors and payment records, an unreviewed `db
 * push` is the risk docs/debt/no-prisma-migration-history-2026-09-01.md
 * describes — up to and including silent data loss on an unrelated table if
 * any other drift exists. This file's SQL is exactly and only the statements
 * `prisma migrate diff --from-url <production> --to-schema-datamodel
 * prisma/schema.prisma --script` produced (read-only command; nothing
 * executed) — confirmed to contain nothing but CREATE TYPE / CREATE TABLE /
 * CREATE INDEX / ADD CONSTRAINT for these three models. No DROP, no ALTER
 * COLUMN, no RENAME anywhere in that diff.
 *
 * WHY ORDINARY CREATE INDEX, NOT CONCURRENTLY
 *
 * CONCURRENTLY exists to avoid locking an EXISTING, populated table while
 * indexing it. These are brand-new, empty tables created in the same
 * statement batch — there is no data to scan and no concurrent writer to
 * block. Ordinary CREATE INDEX is standard practice here, including in
 * Prisma's own generated migrations for a new table.
 *
 * Idempotent throughout — IF NOT EXISTS / DO $$ ... EXCEPTION guards — so a
 * second run after a partial failure does not error on what already landed.
 * Verified afterward by reading information_schema/pg_indexes directly, not
 * by trusting that the statements ran without error.
 *
 *   npx tsx scripts/create-missing-guided-flow-schema.ts            dry run
 *   npx tsx scripts/create-missing-guided-flow-schema.ts --apply    apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const ENUMS: { name: string; sql: string }[] = [
  { name: "GuidedFlowSessionStatus",
    sql: `DO $$ BEGIN
      CREATE TYPE "GuidedFlowSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "VisualAssistTaskType",
    sql: `DO $$ BEGIN
      CREATE TYPE "VisualAssistTaskType" AS ENUM ('ROUTE_ASSIST', 'PHOTO_CAPTURE');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "VisualAssistTaskStatus",
    sql: `DO $$ BEGIN
      CREATE TYPE "VisualAssistTaskStatus" AS ENUM ('PENDING', 'COMPLETED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "DeviceHandoffTaskType",
    sql: `DO $$ BEGIN
      CREATE TYPE "DeviceHandoffTaskType" AS ENUM ('ROUTE_ASSIST', 'PHOTO_CAPTURE', 'VISUAL_ASSIST');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "DeviceHandoffStatus",
    sql: `DO $$ BEGIN
      CREATE TYPE "DeviceHandoffStatus" AS ENUM ('AVAILABLE', 'CONNECTED', 'COMPLETED', 'EXPIRED', 'REVOKED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
];

const TABLES: { name: string; sql: string }[] = [
  { name: "guided_flow_sessions",
    sql: `CREATE TABLE IF NOT EXISTS "guided_flow_sessions" (
      "id" TEXT NOT NULL,
      "contractorId" TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "serviceId" TEXT NOT NULL,
      "serviceSlug" TEXT NOT NULL,
      "consumedAnswers" JSONB NOT NULL DEFAULT '{}',
      "customerNote" TEXT,
      "status" "GuidedFlowSessionStatus" NOT NULL DEFAULT 'ACTIVE',
      "version" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "lineItemId" TEXT,
      "quoteId" TEXT,
      CONSTRAINT "guided_flow_sessions_pkey" PRIMARY KEY ("id")
    );` },
  { name: "guided_flow_visual_assist_tasks",
    sql: `CREATE TABLE IF NOT EXISTS "guided_flow_visual_assist_tasks" (
      "id" TEXT NOT NULL,
      "guidedFlowSessionId" TEXT NOT NULL,
      "taskType" "VisualAssistTaskType" NOT NULL,
      "taskKey" TEXT,
      "status" "VisualAssistTaskStatus" NOT NULL DEFAULT 'PENDING',
      "result" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      CONSTRAINT "guided_flow_visual_assist_tasks_pkey" PRIMARY KEY ("id")
    );` },
  { name: "device_handoffs",
    sql: `CREATE TABLE IF NOT EXISTS "device_handoffs" (
      "id" TEXT NOT NULL,
      "guidedFlowSessionId" TEXT NOT NULL,
      "taskType" "DeviceHandoffTaskType" NOT NULL,
      "taskId" TEXT,
      "tokenHash" TEXT NOT NULL,
      "status" "DeviceHandoffStatus" NOT NULL DEFAULT 'AVAILABLE',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "connectedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "device_handoffs_pkey" PRIMARY KEY ("id")
    );` },
];

const INDEXES: { name: string; sql: string; why: string }[] = [
  { name: "guided_flow_sessions_contractorId_sessionId_serviceId_statu_idx",
    sql: `CREATE INDEX IF NOT EXISTS "guided_flow_sessions_contractorId_sessionId_serviceId_statu_idx" ON "guided_flow_sessions"("contractorId", "sessionId", "serviceId", "status")`,
    why: "the tenant-owner index verify-tenant-indexes.ts requires for a DIRECT-OWNED model" },
  { name: "guided_flow_visual_assist_tasks_guidedFlowSessionId_taskTyp_idx",
    sql: `CREATE INDEX IF NOT EXISTS "guided_flow_visual_assist_tasks_guidedFlowSessionId_taskTyp_idx" ON "guided_flow_visual_assist_tasks"("guidedFlowSessionId", "taskType")`,
    why: "the derived-ownership index verify-tenant-indexes.ts requires, via guidedFlowSessionId" },
  { name: "device_handoffs_tokenHash_key",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "device_handoffs_tokenHash_key" ON "device_handoffs"("tokenHash")`,
    why: "tokenHash is @unique in schema.prisma" },
  { name: "device_handoffs_guidedFlowSessionId_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "device_handoffs_guidedFlowSessionId_status_idx" ON "device_handoffs"("guidedFlowSessionId", "status")`,
    why: "the derived-ownership index verify-tenant-indexes.ts requires, via guidedFlowSessionId" },
];

const FOREIGN_KEYS: { name: string; sql: string }[] = [
  { name: "guided_flow_sessions_contractorId_fkey",
    sql: `DO $$ BEGIN
      ALTER TABLE "guided_flow_sessions" ADD CONSTRAINT "guided_flow_sessions_contractorId_fkey"
        FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "guided_flow_sessions_serviceId_fkey",
    sql: `DO $$ BEGIN
      ALTER TABLE "guided_flow_sessions" ADD CONSTRAINT "guided_flow_sessions_serviceId_fkey"
        FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "guided_flow_visual_assist_tasks_guidedFlowSessionId_fkey",
    sql: `DO $$ BEGIN
      ALTER TABLE "guided_flow_visual_assist_tasks" ADD CONSTRAINT "guided_flow_visual_assist_tasks_guidedFlowSessionId_fkey"
        FOREIGN KEY ("guidedFlowSessionId") REFERENCES "guided_flow_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
  { name: "device_handoffs_guidedFlowSessionId_fkey",
    sql: `DO $$ BEGIN
      ALTER TABLE "device_handoffs" ADD CONSTRAINT "device_handoffs_guidedFlowSessionId_fkey"
        FOREIGN KEY ("guidedFlowSessionId") REFERENCES "guided_flow_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
];

async function tableExists(name: string): Promise<boolean> {
  const r: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='${name}'`
  );
  return r[0].n > 0;
}
async function typeExists(name: string): Promise<boolean> {
  const r: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_type WHERE typname='${name}'`
  );
  return r[0].n > 0;
}
async function indexExists(name: string): Promise<boolean> {
  const r: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${name}'`
  );
  return r[0].n > 0;
}
async function fkExists(name: string): Promise<boolean> {
  const r: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_name='${name}'`
  );
  return r[0].n > 0;
}

async function main() {
  console.log(`\nMISSING GUIDED FLOW SCHEMA   ${APPLY ? "APPLY" : "DRY RUN (--apply to create)"}\n`);

  console.log("  ENUMS");
  for (const e of ENUMS) {
    const present = await typeExists(e.name);
    if (present) { console.log(`    present  ${e.name}`); continue; }
    if (!APPLY) { console.log(`    would    CREATE TYPE ${e.name}`); continue; }
    await prisma.$executeRawUnsafe(e.sql);
    console.log(`    CREATED  ${e.name}`);
  }

  console.log("\n  TABLES");
  for (const t of TABLES) {
    const present = await tableExists(t.name);
    if (present) { console.log(`    present  ${t.name}`); continue; }
    if (!APPLY) { console.log(`    would    CREATE TABLE ${t.name}`); continue; }
    await prisma.$executeRawUnsafe(t.sql);
    console.log(`    CREATED  ${t.name}`);
  }

  console.log("\n  FOREIGN KEYS");
  for (const f of FOREIGN_KEYS) {
    const present = await fkExists(f.name);
    if (present) { console.log(`    present  ${f.name}`); continue; }
    if (!APPLY) { console.log(`    would    ${f.name}`); continue; }
    await prisma.$executeRawUnsafe(f.sql);
    console.log(`    CREATED  ${f.name}`);
  }

  console.log("\n  INDEXES");
  for (const i of INDEXES) {
    const present = await indexExists(i.name);
    if (present) { console.log(`    present  ${i.name}`); continue; }
    if (!APPLY) { console.log(`    would    ${i.name}\n               ${i.why}`); continue; }
    await prisma.$executeRawUnsafe(i.sql);
    console.log(`    CREATED  ${i.name}\n               ${i.why}`);
  }

  console.log(`\n  VERIFY — read back from information_schema / pg_type / pg_indexes, not from statement success`);
  let missing = 0;
  for (const e of ENUMS) { const ok = await typeExists(e.name); if (!ok) missing++; console.log(`    ${ok ? "ok     " : "MISSING"} type ${e.name}`); }
  for (const t of TABLES) { const ok = await tableExists(t.name); if (!ok) missing++; console.log(`    ${ok ? "ok     " : "MISSING"} table ${t.name}`); }
  for (const f of FOREIGN_KEYS) { const ok = await fkExists(f.name); if (!ok) missing++; console.log(`    ${ok ? "ok     " : "MISSING"} fk ${f.name}`); }
  for (const i of INDEXES) { const ok = await indexExists(i.name); if (!ok) missing++; console.log(`    ${ok ? "ok     " : "MISSING"} index ${i.name}`); }

  console.log("\n" + "─".repeat(76));
  if (!APPLY) { console.log(`\n  Dry run — nothing written.\n`); return; }
  if (missing) { console.log(`\n  ${missing} object(s) MISSING after apply.\n`); process.exitCode = 1; }
  else console.log(`\n  All objects present. Schema now matches prisma/schema.prisma for these three models.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
