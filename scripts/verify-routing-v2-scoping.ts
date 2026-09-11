/**
 * NO ROUTING V2 PROOF MAY IDENTIFY A SERVICE BY SLUG ALONE.
 *
 * Four contractors own a service called `new-120v-outlet`. Every Routing V2
 * seeder and verifier resolved it with `findFirst({ where: { slug } })`, which
 * has no ordering and therefore no defined answer. They all landed on
 * BrightPath's copy. The migration ran against the wrong tenant, the
 * acceptance suite then reported BrightPath's empty economics as a Routing V2
 * blocker, and Elite's outlet — the one carrying the V1 assembly the migration
 * exists to retire — was never touched.
 *
 * Every structural assertion in that run was true. Every conclusion drawn from
 * it was about the wrong service. That is the failure mode worth a permanent
 * check: not a broken proof, a proof of the wrong thing.
 *
 * WHY AN AST RATHER THAN A GREP
 *
 * The thing being judged is the `where` clause of a specific call, and a
 * regex cannot tell `where: { slug }` from `where: { slug, contractorId }`
 * spread over three lines, nor a Prisma call from an identically named method
 * on something else. A grep that is wrong in the safe direction still trains
 * people to ignore it.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER
 *
 * It reads the `where` clause, not the client. Request paths reach the database
 * through a tenant-guarded client -- `withSite`, `withAdminContractor` -- where
 * a bare `where: { slug }` is already scoped by the guard and is correct;
 * app/api/services/[slug]/route.ts is exactly that, and says so. Pointed at the
 * whole repository this check reports about ninety such lines, and they are a
 * census of a shape rather than a list of defects.
 *
 * So it is scoped to the Routing V2 files, which drive the raw client directly
 * and have no guard standing behind them. Widening it means teaching it to
 * recognise the guarded clients first -- otherwise it produces a wall of false
 * positives, which is how a check stops being read.
 *
 * DELIBERATE EXCEPTIONS carry `TENANT-SCOPE-EXEMPT: <reason>` on or above the
 * statement. The identity module itself needs two — enumerating every
 * contractor's copy is its whole job. The marker is greppable, so the set of
 * exceptions is a list somebody can read rather than a property of this file.
 */
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** Every Routing V2 file that touches the database. */
const ROUTING_V2_FILES = [
  "prisma/_serviceTargets.ts",
  "prisma/_surfaceRouteModule.ts",
  "prisma/_concealedRouteModules.ts",
  "prisma/_finishedWallModule.ts",
  "prisma/seed-routing-v2-components.ts",
  "prisma/seed-routing-v2-fixtures.ts",
  "prisma/seed-surface-mounted-services.ts",
  "prisma/seed-new-outlet-v2.ts",
  "scripts/verify-new-outlet-v2.ts",
  "scripts/verify-surface-route-module.ts",
  "scripts/verify-concealed-route-modules.ts",
  "scripts/verify-finished-wall-module.ts",
  "scripts/verify-contractor-capability.ts",
  "scripts/verify-route-quantity-binding.ts",
  "scripts/verify-numeric-route-ranges.ts",
  "scripts/verify-routing-v2-components.ts",
  "scripts/verify-quantity-binding-provisioning.ts",
];

const READ_METHODS = new Set([
  "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow",
  "count", "updateMany", "deleteMany", "update", "delete",
]);

export type Finding = { file: string; line: number; text: string; reason: string };

const EXEMPT = /TENANT-SCOPE-EXEMPT/;

/** Comment trivia attached to the statement containing `node`. */
function leadingComments(sf: ts.SourceFile, text: string, node: ts.Node): string {
  let stmt: ts.Node = node;
  while (stmt.parent && !ts.isSourceFile(stmt.parent) && !ts.isBlock(stmt.parent)) {
    stmt = stmt.parent;
  }
  const ranges = ts.getLeadingCommentRanges(text, stmt.getFullStart()) ?? [];
  return ranges.map((r) => text.slice(r.pos, r.end)).join("\n");
}

export function auditSource(file: string, text: string): Finding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const found: Finding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const target = node.expression.expression;
      if (READ_METHODS.has(method) && ts.isPropertyAccessExpression(target)) {
        const model = target.name.text;
        if (model === "service" || model === "contractor") {
          const start = node.getStart(sf);
          const line = sf.getLineAndCharacterOfPosition(start).line + 1;
          const full = node.getText(sf);
          // The marker lives in the enclosing statement's LEADING TRIVIA, read
          // from the AST rather than by counting lines above the call. A fixed
          // line window silently stops honouring a marker the moment somebody
          // adds a sentence to the comment explaining it.
          if (!EXEMPT.test(leadingComments(sf, text, node)) && !EXEMPT.test(full)) {
            const arg = node.arguments[0];
            const whereText =
              arg && ts.isObjectLiteralExpression(arg)
                ? arg.properties
                    .filter((p) => p.name && p.name.getText(sf) === "where")
                    .map((p) => p.getText(sf))
                    .join(" ")
                : "";
            const scoped = /\bcontractorId\b|\bcontractor\s*:/.test(whereText);
            const bySlug = /\bslug\b/.test(whereText);
            const oneLine = full.replace(/\s+/g, " ").slice(0, 110);

            if (model === "service" && bySlug && !scoped) {
              found.push({ file, line, text: oneLine,
                reason: `service.${method} selects by slug with no contractor scope` });
            } else if (model === "service" && !whereText && method !== "create") {
              found.push({ file, line, text: oneLine,
                reason: `service.${method} has no where clause at all` });
            } else if (model === "contractor" && !whereText) {
              found.push({ file, line, text: oneLine,
                reason: `contractor.${method} takes an arbitrary tenant` });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

function main() {
  console.log("\nROUTING V2 — TENANT SCOPING\n");

  console.log("  A  THE CHECKER CATCHES THE DEFECT IT EXISTS FOR\n");
  // Positive control. Runs on every invocation, so this check cannot rot into
  // a function that returns an empty array for everything.
  const bad = `
    const svc = await prisma.service.findFirstOrThrow({ where: { slug }, select: { id: true } });
    const c = await prisma.contractor.findFirstOrThrow({ select: { id: true } });
  `;
  const badFindings = auditSource("<control-bad>", bad);
  ok(badFindings.length === 2,
    "A  the exact pattern that mis-targeted the migration is flagged",
    `expected 2 findings, got ${badFindings.length}: ${JSON.stringify(badFindings)}`);
  ok(badFindings.some((f) => /no contractor scope/.test(f.reason)),
    "A  …the slug-only service lookup specifically");
  ok(badFindings.some((f) => /arbitrary tenant/.test(f.reason)),
    "A  …and the arbitrary-contractor lookup specifically");

  const good = `
    const a = await prisma.service.findMany({ where: { contractorId, slug }, select: { id: true } });
    const b = await prisma.service.findFirst({ where: { slug: f.slug, contractorId: anchor.contractorId } });
    const c = await prisma.contractor.findUnique({ where: { slug: ELITE_SLUG } });
  `;
  ok(auditSource("<control-good>", good).length === 0,
    "A  a contractor-scoped lookup is NOT flagged — the check discriminates",
    JSON.stringify(auditSource("<control-good>", good)));

  const exempt = `
    // TENANT-SCOPE-EXEMPT: enumerating every copy is the point
    const all = await db.service.findMany({ where: { slug } });
  `;
  ok(auditSource("<control-exempt>", exempt).length === 0,
    "A  a marked deliberate exception is honoured");

  console.log("\n  B  EVERY ROUTING V2 FILE IS PRESENT\n");
  const missing = ROUTING_V2_FILES.filter((f) => !existsSync(f));
  ok(missing.length === 0,
    `B  all ${ROUTING_V2_FILES.length} Routing V2 files exist — no path typo silently passes`,
    `missing: ${missing.join(", ")}`);
  ok(ROUTING_V2_FILES.length >= 15, "B  the audited set is the whole workstream, not a sample");

  console.log("\n  C  NO UNSCOPED SERVICE OR CONTRACTOR LOOKUP\n");
  const all: Finding[] = [];
  for (const f of ROUTING_V2_FILES) {
    if (!existsSync(f)) continue;
    all.push(...auditSource(f, readFileSync(f, "utf8")));
  }
  ok(all.length === 0,
    "C  no Routing V2 file identifies a service or contractor ambiguously",
    all.map((f) => `${f.file}:${f.line}  ${f.reason}\n           ${f.text}`).join("\n         "));

  console.log("\n  D  THE REAL-SERVICE PROOF NAMES ELITE\n");
  for (const f of ["prisma/seed-new-outlet-v2.ts", "scripts/verify-new-outlet-v2.ts"]) {
    const src = readFileSync(f, "utf8");
    ok(/eliteService\s*\(/.test(src),
      `D  ${f} resolves its target through the canonical Elite helper`);
    ok(!/"elite-electric"/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")) &&
       !/cm[a-z0-9]{20,}/.test(src),
      `D  ${f} hard-codes neither a contractor slug nor a database id`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

// Guarded so `auditSource` can be imported and pointed at other files without
// running the suite as a side effect — which is how you find out whether this
// defect exists outside the Routing V2 workstream.
if (process.argv[1] && process.argv[1].endsWith("verify-routing-v2-scoping.ts")) {
  main();
}
