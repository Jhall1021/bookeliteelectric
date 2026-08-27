/**
 * Every tenant-owned model is indexed on its owner — in the DATABASE.
 *
 * WHY THIS EXISTS
 *
 * The expand step's schema edit silently no-oped on several replacements, so
 * `@@index` lines never entered schema.prisma. `prisma db push` then reported
 * "already in sync" — truthfully, because the schema it was syncing did not
 * contain them. Six tenant models ended up with no index on contractorId, and
 * the gap survived a push, a build, a merge and a production deploy. It was
 * found only because the contract rehearsal asserted a specific index existed.
 *
 * The failure was not the typo. It was that nothing ever compared the schema
 * file to the live database, so "the file says so" stood in for "the database
 * has it" for as long as nobody looked.
 *
 * So this check reads pg_indexes, not schema.prisma. A schema file cannot
 * satisfy it; only the database can.
 *
 * WHAT IT REQUIRES
 *
 *   direct-owned  an index whose definition mentions contractorId
 *   derived-owned an index on the foreign key it derives ownership through
 *
 * The model list is read from lib/tenantGuard.ts at runtime and the table
 * names from schema.prisma's @@map, so neither can drift from the thing it
 * describes — ADR-007a applied to this check's own inventory.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { TENANT_SCOPED_MODELS, DERIVED_TENANT_MODELS } from "../lib/tenantGuard";

const prisma = new PrismaClient();

/** model -> table, straight from @@map. */
function tableMap(): Map<string, string> {
  const src = readFileSync("prisma/schema.prisma", "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapped = m[2].match(/@@map\("([^"]+)"\)/);
    out.set(m[1], mapped ? mapped[1] : m[1]);
  }
  return out;
}

/** The scalar a derived model actually stores — the first hop's foreign key. */
function derivedForeignKey(model: string, path: readonly string[]): string {
  const src = readFileSync("prisma/schema.prisma", "utf8");
  const body = src.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, "m"));
  if (!body) return `${path[0]}Id`;
  const rel = body[1].match(new RegExp(`^\\s*${path[0]}\\s+\\w+\\??\\s+@relation\\(fields:\\s*\\[(\\w+)\\]`, "m"));
  return rel ? rel[1] : `${path[0]}Id`;
}

async function main() {
  console.log("\nTENANT INDEX COVERAGE — read from the database, not the schema file\n");
  const tables = tableMap();
  let missing = 0;

  const check = async (model: string, column: string, kind: string) => {
    const table = tables.get(model);
    if (!table) {
      console.log(`    FAIL ${model.padEnd(30)} no table mapping in schema.prisma`);
      missing++;
      return;
    }
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename = '${table}' AND indexdef ILIKE '%${column}%'`
    );
    const ok = r[0].n > 0;
    if (!ok) missing++;
    console.log(`    ${ok ? "ok  " : "FAIL"} ${model.padEnd(30)} ${kind} on ${column}`);
  };

  console.log("  DIRECT-OWNED — indexed on contractorId");
  for (const model of [...TENANT_SCOPED_MODELS].sort()) {
    await check(model, "contractorId", "index");
  }

  console.log("\n  DERIVED-OWNED — indexed on the foreign key ownership travels through");
  for (const [model, path] of [...DERIVED_TENANT_MODELS].sort()) {
    await check(model, derivedForeignKey(model, path), `via ${path.join(".")}`);
  }

  console.log("\n" + "─".repeat(76));
  if (missing) {
    console.log(`\n  ${missing} tenant model(s) NOT indexed on their owner in the live database.\n`);
    console.log(`  Every guarded query on those does a sequential scan. Adding the line to`);
    console.log(`  schema.prisma is not enough — confirm it reached the database.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  Every tenant-owned model is indexed on its owner.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
