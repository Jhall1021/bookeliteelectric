/**
 * Snapshot and diff a database's STRUCTURE — columns, indexes, constraints.
 *
 * The contract release's hardest question is not "did the intended changes
 * happen" but "did anything ELSE change". `prisma db push` computes a diff
 * from the schema file and applies it; if the schema file is wrong in a way
 * nobody noticed, push will faithfully apply the wrong thing. That is exactly
 * how twelve indexes went missing during expand — push did precisely what the
 * schema said, and the schema was wrong.
 *
 * So: snapshot before, snapshot after, diff, and require every difference to
 * be one that was expected. Anything else fails.
 *
 *   snapshot <file>            capture structure to JSON
 *   diff <before> <after>      classify every change as expected or NOT
 *
 * Reads REHEARSAL_DATABASE_URL when --rehearsal is passed, DATABASE_URL
 * otherwise, so the same tool serves the branch rehearsal and production.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

type Snapshot = {
  columns: Record<string, string>;   // "table.column" -> "type|nullable"
  indexes: Record<string, string>;   // indexname -> indexdef
  constraints: Record<string, string>; // conname -> definition
};

async function snapshot(prisma: PrismaClient): Promise<Snapshot> {
  const cols: { t: string; c: string; d: string; n: string }[] = await prisma.$queryRawUnsafe(
    `SELECT table_name AS t, column_name AS c, data_type AS d, is_nullable AS n
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY 1,2`
  );
  const idx: { name: string; def: string }[] = await prisma.$queryRawUnsafe(
    `SELECT indexname AS name, indexdef AS def FROM pg_indexes
     WHERE schemaname = 'public' ORDER BY 1`
  );
  const cons: { name: string; def: string }[] = await prisma.$queryRawUnsafe(
    `SELECT conname AS name, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace ORDER BY 1`
  );
  const s: Snapshot = { columns: {}, indexes: {}, constraints: {} };
  for (const c of cols) s.columns[`${c.t}.${c.c}`] = `${c.d}|${c.n === "YES" ? "null" : "notnull"}`;
  for (const i of idx) s.indexes[i.name] = i.def;
  for (const c of cons) s.constraints[c.name] = c.def;
  return s;
}

/** Changes the contract release is allowed to make. Anything else is a bug. */
const EXPECTED = {
  columnsRemoved: new Set(["photos.bookingId", "visits.customerId"]),
  columnsChanged: new Set([
    "services.contractorId", "service_areas.contractorId", "pricing_settings.contractorId",
    "jobber_connections.contractorId", "business_hours.contractorId",
    "contractor_material_settings.contractorId", "visits.contractorId",
    "customers.contractorId", "photos.contractorId", "jobber_crew_members.contractorId",
  ]),
  indexesRemoved: new Set(["jobber_crew_members_jobberUserId_key"]),
  indexesAdded: new Set([
    "arrival_windows_date_startTime_endTime_serviceAreaId_key",
    "visits_open_per_contractor_session",
  ]),
  constraintsRemoved: new Set(["jobber_crew_members_jobberUserId_key", "visits_customerId_fkey"]),
  constraintsAdded: new Set(["arrival_windows_date_startTime_endTime_serviceAreaId_key"]),
};

/**
 * Making a column NOT NULL shows up TWICE in the catalog: once as the
 * column's is_nullable flipping, and once as a new `<table>_<column>_not_null`
 * row in pg_constraint. They are one change seen through two views.
 *
 * DERIVED from columnsChanged rather than listed, so the two cannot drift.
 * Hardcoding ten constraint names beside ten column names is exactly the shape
 * of hand-maintained inventory that has already gone stale twice in this
 * migration — and here it would be worse than stale, because an unnoticed
 * mismatch would show up as an UNEXPECTED change and abort a correct release.
 */
for (const col of EXPECTED.columnsChanged) {
  const [table, column] = col.split(".");
  EXPECTED.constraintsAdded.add(`${table}_${column}_not_null`);
}

function diff(before: Snapshot, after: Snapshot): number {
  let unexpected = 0;
  const line = (mark: string, s: string) => console.log(`    ${mark} ${s}`);

  const section = <T>(
    title: string,
    beforeMap: Record<string, T>,
    afterMap: Record<string, T>,
    expectedRemoved: Set<string>,
    expectedAdded: Set<string>,
    expectedChanged?: Set<string>
  ) => {
    console.log(`\n  ${title}`);
    let any = false;
    for (const k of Object.keys(beforeMap)) {
      if (!(k in afterMap)) {
        any = true;
        const ok = expectedRemoved.has(k);
        if (!ok) unexpected++;
        line(ok ? "removed (expected)" : "REMOVED — UNEXPECTED", k);
      } else if (String(beforeMap[k]) !== String(afterMap[k])) {
        any = true;
        const ok = expectedChanged?.has(k) ?? false;
        if (!ok) unexpected++;
        line(ok ? "changed (expected)" : "CHANGED — UNEXPECTED",
             `${k}\n         ${beforeMap[k]}  ->  ${afterMap[k]}`);
      }
    }
    for (const k of Object.keys(afterMap)) {
      if (!(k in beforeMap)) {
        any = true;
        const ok = expectedAdded.has(k);
        if (!ok) unexpected++;
        line(ok ? "added   (expected)" : "ADDED — UNEXPECTED", k);
      }
    }
    if (!any) console.log("    (no changes)");
  };

  section("COLUMNS", before.columns, after.columns,
          EXPECTED.columnsRemoved, new Set(), EXPECTED.columnsChanged);
  section("INDEXES", before.indexes, after.indexes,
          EXPECTED.indexesRemoved, EXPECTED.indexesAdded);
  section("CONSTRAINTS", before.constraints, after.constraints,
          EXPECTED.constraintsRemoved, EXPECTED.constraintsAdded);

  return unexpected;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
  const useRehearsal = process.argv.includes("--rehearsal");
  const url = useRehearsal ? process.env.REHEARSAL_DATABASE_URL : process.env.DATABASE_URL;

  if (cmd === "snapshot") {
    if (useRehearsal && !url) { console.error("REHEARSAL_DATABASE_URL is not set"); process.exit(1); }
    const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    const s = await snapshot(prisma);
    writeFileSync(a, JSON.stringify(s, null, 2));
    console.log(
      `  snapshot -> ${a}   ${Object.keys(s.columns).length} columns, ` +
      `${Object.keys(s.indexes).length} indexes, ${Object.keys(s.constraints).length} constraints`
    );
    await prisma.$disconnect();
    return;
  }

  if (cmd === "diff") {
    const before: Snapshot = JSON.parse(readFileSync(a, "utf8"));
    const after: Snapshot = JSON.parse(readFileSync(b, "utf8"));
    console.log(`\nSTRUCTURAL DIFF   ${a} -> ${b}`);
    const unexpected = diff(before, after);
    console.log("\n" + "─".repeat(76));
    if (unexpected) {
      console.log(`\n  ${unexpected} UNEXPECTED structural change(s). Do not proceed.\n`);
      process.exitCode = 1;
    } else {
      console.log(`\n  Every structural change was expected. Nothing else moved.\n`);
    }
    return;
  }

  console.error("usage: db-structure.ts snapshot <file> | diff <before> <after>  [--rehearsal]");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
