/**
 * Apply prisma/ddl/2026-09-02-answer-option-materials.sql — once, bounded.
 *
 *   npx tsx scripts/apply-answer-option-materials-ddl.ts --apply
 *
 * The shared database carries G1 and G2 columns that `main` does not, so
 * `prisma db push` from main would propose dropping four of them. This applies
 * ONLY the create half, from a committed file, and proves the in-flight schema
 * survived.
 *
 * Every precondition aborts before touching anything. Nothing here is
 * idempotent by design: if a target table already exists the run stops rather
 * than reconciling, because a table appearing between preflight and execution
 * means somebody else is working and this should not race them.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const FILE = "prisma/ddl/2026-09-02-answer-option-materials.sql";
const AUTHORIZED_COMMIT = "fa9bdb1";
const EXPECTED_IDENTITY = "price2book-production";
const NEW_TABLES = ["answer_option_materials", "template_answer_option_materials"];
/** In-flight columns owned by other workstreams. None of them main's to drop. */
const IN_FLIGHT: [string, string][] = [
  ["answer_option_components", "conditionAccessSlot"],
  ["answer_options", "accessSlot"],
  ["canonical_disclaimers", "accessSlot"],
  ["services", "tradeKey"],
];

let failed = false;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `  — ${detail}`}`);
};

async function tableExists(db: PrismaClient, t: string) {
  const r = await db.$queryRawUnsafe<unknown[]>(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, t);
  return r.length > 0;
}
async function columnExists(db: PrismaClient, t: string, c: string) {
  const r = await db.$queryRawUnsafe<unknown[]>(
    `select 1 from information_schema.columns where table_name=$1 and column_name=$2`, t, c);
  return r.length > 0;
}
/** Every table and column, so the postflight can prove nothing vanished. */
async function shape(db: PrismaClient) {
  const rows = await db.$queryRawUnsafe<{ t: string; c: string }[]>(
    `select table_name as t, column_name as c from information_schema.columns
     where table_schema='public' order by 1,2`);
  return new Set(rows.map((r) => `${r.t}.${r.c}`));
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nAPPLY BRANCH-MATERIAL DDL${apply ? "" : "   (DRY RUN — pass --apply)"}\n`);
  const db = new PrismaClient();

  // ── PREFLIGHT ───────────────────────────────────────────────────────────
  console.log("  PREFLIGHT\n");
  const sql = readFileSync(FILE, "utf8");
  const committed = execFileSync("git", ["show", `${AUTHORIZED_COMMIT}:${FILE}`], { encoding: "utf8" });
  check(sql === committed, `SQL is byte-for-byte the committed ${AUTHORIZED_COMMIT} file`);
  console.log(`       sha256 ${createHash("sha256").update(sql).digest("hex")}`);

  check(!/^\s*(drop|truncate|delete\s+from)/im.test(sql) && !/alter[^;]*\bdrop\b/i.test(sql),
    "SQL contains no DROP, TRUNCATE or DELETE FROM");

  const id = await db.$queryRawUnsafe<{ key: string }[]>(`select key from database_identity limit 1`);
  check(id[0]?.key === EXPECTED_IDENTITY, `database identity is ${EXPECTED_IDENTITY}`, `got ${id[0]?.key}`);

  for (const t of NEW_TABLES) check(!(await tableExists(db, t)), `${t} is absent`);
  for (const [t, c] of IN_FLIGHT) check(await columnExists(db, t, c), `${t}.${c} is present`);

  if (failed) {
    console.error(`\n  ABORTING — a precondition failed. Nothing was changed.\n`);
    await db.$disconnect(); process.exit(1);
  }
  if (!apply) {
    console.log(`\n  All preconditions hold. Re-run with --apply.\n`);
    await db.$disconnect(); return;
  }

  // ── EXECUTE ─────────────────────────────────────────────────────────────
  const before = await shape(db);
  // COMMENTS COME OUT FIRST, THEN SPLIT.
  //
  // The other order is a trap and it caught this runner once: the file's header
  // contains "at 06e41a5 lineage; d7d7573 introduced", and splitting on ";"
  // before stripping comments left " d7d7573 introduced" no longer looking like
  // a comment, so it was handed to Postgres as SQL. The transaction rolled back
  // and nothing was changed, but the SQL file was never at fault.
  const statements = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`\n  EXECUTE  ${statements.length} statement(s), one transaction\n`);
  await db.$transaction(async (tx) => {
    for (const s of statements) {
      await tx.$executeRawUnsafe(s);
      console.log(`       ${s.split("\n")[0].slice(0, 92)}`);
    }
  });

  // ── POSTFLIGHT ──────────────────────────────────────────────────────────
  console.log(`\n  POSTFLIGHT\n`);
  for (const t of NEW_TABLES) check(await tableExists(db, t), `${t} now exists`);
  for (const [t, c] of IN_FLIGHT) check(await columnExists(db, t, c), `${t}.${c} still present`);

  const after = await shape(db);
  const lost = [...before].filter((x) => !after.has(x));
  check(lost.length === 0, "no pre-existing table or column was removed", lost.slice(0, 6).join(", "));
  const added = [...after].filter((x) => !before.has(x));
  check(added.every((x) => NEW_TABLES.some((t) => x.startsWith(`${t}.`))),
    `only the two new tables were added (${added.length} columns)`,
    added.filter((x) => !NEW_TABLES.some((t) => x.startsWith(`${t}.`))).join(", "));

  await db.$disconnect();
  console.log(`\n  ${failed ? "POSTCONDITION FAILED" : "Applied cleanly."}\n`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).message}\n`); process.exit(1); });
