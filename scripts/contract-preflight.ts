/**
 * Contract preflight — pass three.
 *
 * The gate immediately before the contract release. Every check must be zero.
 *
 * ABORT, DO NOT REPAIR
 *
 * If any check is non-zero, the release is abandoned and the cause
 * investigated separately. It is NOT repaired opportunistically during the
 * release window. A release that starts by fixing unexpected production data
 * is a release whose starting state nobody understands, and every later step
 * is then reasoning from a premise that was wrong minutes ago.
 *
 * WHY SOME CHECKS READ CODE RATHER THAN DATA
 *
 * Two of the conditions are not properties of the database at all:
 *
 *   - nothing may still read or write the columns about to be dropped
 *   - nothing may still depend on the global crew unique
 *
 * Those are properties of the deployed source. A data-only preflight would
 * pass while the running application still needs what is about to disappear,
 * which is the exact failure ADR-008 produced. So this reads the tree too.
 *
 * Run with no arguments against whatever DATABASE_URL points at. It only ever
 * reads; it changes nothing.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

let failures = 0;
function report(label: string, count: number, detail?: string) {
  const bad = count !== 0;
  if (bad) failures++;
  console.log(`  ${bad ? "ABORT" : "ok   "} ${label.padEnd(58)} ${count}`);
  if (bad && detail) console.log(`         ${detail}`);
}

/** Every model contract is about to make NOT NULL, with its table. */
const OWNED: [string, string][] = [
  ["Service", "services"],
  ["ServiceArea", "service_areas"],
  ["PricingSettings", "pricing_settings"],
  ["JobberConnection", "jobber_connections"],
  ["BusinessHours", "business_hours"],
  ["ContractorMaterialSettings", "contractor_material_settings"],
  ["Visit", "visits"],
  ["Customer", "customers"],
  ["Photo", "photos"],
  ["JobberCrewMember", "jobber_crew_members"],
];

function sourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
  };
  dirs.forEach(walk);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").split("/")[0];
  console.log(`\nCONTRACT PREFLIGHT — pass three`);
  console.log(`  target: ${host}\n`);

  // ---- 1. ownership columns ready to be required -------------------------
  console.log("  OWNERSHIP — every column contract will require");
  for (const [model, table] of OWNED) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE "contractorId" IS NULL)::int AS n FROM "${table}"`
    );
    report(`${model}.contractorId nulls`, r[0].n);
  }

  // ---- 2..4. constraints the contract will add ---------------------------
  console.log("\n  CONSTRAINTS — rows that would violate what contract adds");
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM (
         SELECT 1 FROM visits WHERE status = 'OPEN' AND "sessionId" IS NOT NULL
         GROUP BY "contractorId","sessionId" HAVING count(*) > 1) x`
    );
    report("more than one OPEN visit per (contractor, session)", r[0].n);
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM (
         SELECT 1 FROM jobber_crew_members
         GROUP BY "contractorId","jobberUserId" HAVING count(*) > 1) x`
    );
    report("duplicate (contractorId, jobberUserId) crew", r[0].n);
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM (
         SELECT 1 FROM arrival_windows
         GROUP BY date,"startTime","endTime","serviceAreaId" HAVING count(*) > 1) x`
    );
    report("ArrivalWindow rows violating the proposed unique", r[0].n);
  }

  // ---- 5. cross-tenant references ----------------------------------------
  console.log("\n  CROSS-TENANT REFERENCES");
  const crossChecks: [string, string][] = [
    ["Booking.customer vs its Visit",
     `SELECT count(*)::int AS n FROM bookings b JOIN visits v ON v.id=b."visitId"
      JOIN customers c ON c.id=b."customerId"
      WHERE c."contractorId" IS DISTINCT FROM v."contractorId"`],
    ["Booking.arrivalWindow vs its Visit",
     `SELECT count(*)::int AS n FROM bookings b JOIN visits v ON v.id=b."visitId"
      JOIN arrival_windows aw ON aw.id=b."arrivalWindowId"
      JOIN service_areas sa ON sa.id=aw."serviceAreaId"
      WHERE sa."contractorId" IS DISTINCT FROM v."contractorId"`],
    ["Quote.customer vs its Service",
     `SELECT count(*)::int AS n FROM quotes q JOIN services s ON s.id=q."serviceId"
      JOIN customers c ON c.id=q."customerId"
      WHERE c."contractorId" IS DISTINCT FROM s."contractorId"`],
    ["Quote.visit vs its Service",
     `SELECT count(*)::int AS n FROM quotes q JOIN services s ON s.id=q."serviceId"
      JOIN visits v ON v.id=q."visitId"
      WHERE q."visitId" IS NOT NULL AND v."contractorId" IS DISTINCT FROM s."contractorId"`],
    ["Photo.quote vs the Photo",
     `SELECT count(*)::int AS n FROM photos p JOIN quotes q ON q.id=p."quoteId"
      JOIN services s ON s.id=q."serviceId"
      WHERE p."quoteId" IS NOT NULL AND s."contractorId" IS DISTINCT FROM p."contractorId"`],
    ["Photo.lineItem vs the Photo",
     `SELECT count(*)::int AS n FROM photos p JOIN line_items li ON li.id=p."lineItemId"
      JOIN visits v ON v.id=li."visitId"
      WHERE p."lineItemId" IS NOT NULL AND v."contractorId" IS DISTINCT FROM p."contractorId"`],
    ["LineItem.service vs its Visit",
     `SELECT count(*)::int AS n FROM line_items li JOIN visits v ON v.id=li."visitId"
      JOIN services s ON s.id=li."serviceId"
      WHERE s."contractorId" IS DISTINCT FROM v."contractorId"`],
  ];
  for (const [label, sql] of crossChecks) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(sql);
    report(label, r[0].n);
  }

  // ---- 6. the columns about to be dropped --------------------------------
  console.log("\n  DEAD COLUMNS — must be dead in data AND in source");
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE "bookingId" IS NOT NULL)::int AS n FROM photos`
    );
    report("Photo.bookingId rows in use", r[0].n);
    const v: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE "customerId" IS NOT NULL)::int AS n FROM visits`
    );
    report("Visit.customerId rows in use", v[0].n);
  }

  const files = sourceFiles(["app", "lib", "components", "scripts", "prisma"]);

  /**
   * Source with comments removed.
   *
   * Load-bearing, not tidiness. This codebase deliberately quotes the code it
   * replaced — the crew sync's comment contains the literal string
   * `upsert({ where: { jobberUserId } })` to explain the bug it fixed. A
   * scanner that reads comments flags that as a live dependency on the global
   * unique and aborts a release for a sentence. Comments describe code; they
   * are not code.
   */
  const readCode = (f: string) => {
    let t: string;
    try { t = readFileSync(f, "utf8"); } catch { return ""; }
    return t
      .replace(/\/\*[\s\S]*?\*\//g, "")   // block and doc comments
      .replace(/^[ \t]*\/\/.*$/gm, "")      // whole-line line comments
      .replace(/([^:"'`\\])\/\/.*$/gm, "$1"); // trailing line comments
  };

  {
    // Photo.bookingId: any mention alongside a photo context.
    const hits = files.filter((f) => {
      if (f.endsWith("contract-preflight.ts")) return false;
      const t = readCode(f);
      return /\bbookingId\b/.test(t) && /\bphoto/i.test(t);
    });
    report("source files touching Photo.bookingId", hits.length, hits.join(", "));
  }
  {
    // Visit.customerId: a customerId written or selected on a visit shape.
    const hits = files.filter((f) => {
      if (f.endsWith("contract-preflight.ts")) return false;
      const t = readCode(f);
      return /visit\.(create|update|findFirst|findUnique)/i.test(t) && /customerId/.test(t)
        && !/booking|quote/i.test(t);
    });
    report("source files touching Visit.customerId", hits.length, hits.join(", "));
  }

  // ---- 7. the global crew unique -----------------------------------------
  console.log("\n  GLOBAL CREW UNIQUE — nothing may still key on it");
  {
    const hits: string[] = [];
    for (const f of files) {
      if (f.endsWith("contract-preflight.ts")) continue;
      const t = readCode(f);
      // A whereUnique keyed on jobberUserId alone: upsert/findUnique/update
      // whose `where` names jobberUserId. The compound selector is fine.
      const re = /(upsert|findUnique|findUniqueOrThrow|update|delete)\s*\(\s*\{[\s\S]{0,220}?where:\s*\{[\s\S]{0,120}?jobberUserId/g;
      if (re.test(t)) hits.push(f);
    }
    report("source keying a unique lookup on jobberUserId alone", hits.length, hits.join(", "));
  }
  {
    // And the index itself must still be the only thing enforcing it, i.e.
    // report what exists so the release can see what it is dropping.
    const idx: { indexname: string }[] = await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename='jobber_crew_members' ORDER BY indexname`
    );
    console.log(`  info  jobber_crew_members indexes:`);
    for (const i of idx) console.log(`          ${i.indexname}`);
  }

  console.log("\n" + "─".repeat(76));
  if (failures) {
    console.log(`\n  ${failures} check(s) ABORT the contract release.\n`);
    console.log(`  Do not repair production during the release window. Investigate the`);
    console.log(`  cause first and re-run this preflight afterwards.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  All clear. The contract release may proceed.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
