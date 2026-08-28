/**
 * Adopted routes cannot drift back to unguarded tenant access — ADR-007a.
 *
 *   npx tsx scripts/audit-guard-adoption.ts
 *   npx tsx scripts/audit-guard-adoption.ts --self-test
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 *
 * Narrow on purpose. It does NOT try to prove Prisma safety in general. It
 * proves one thing:
 *
 *   Once a file has been migrated to the guarded client, it cannot quietly
 *   go back to reaching tenant data through the unguarded one.
 *
 * Guard adoption is otherwise a convention, and a convention is exactly what
 * gets undone by a later edit that looks reasonable in isolation — an
 * `import { prisma }` added back for one "quick" query. This makes each
 * converted route a one-way door.
 *
 * WHAT IT FLAGS
 *
 * In an ADOPTED file only: an operation on a tenant-owned or derived-owned
 * model through the unguarded application client (`prisma`, `platformDb`, or a
 * locally constructed `new PrismaClient()`).
 *
 * WHAT IT ALLOWS
 *
 * Everything else, deliberately:
 *   - the guarded client, however the callback names it (`db`, and any `tx`
 *     descended from it — the guard survives $transaction, proven in the live
 *     harness)
 *   - platform models, which the guard passes through anyway
 *   - deprecated models, whose compatibility writes are expected during expand
 *   - files not yet adopted, which are tracked by ADOPTED_FILES rather than
 *     by this check
 *
 * WHY A LIST RATHER THAN A MARKER COMMENT
 *
 * A comment in the file could be deleted by the same edit that reintroduces
 * the unguarded query, and the check would go quiet. The list lives here, next
 * to the reasoning, so removing coverage is a visible edit to a governance
 * file. A listed file that no longer exists is a failure, not a skip, so a
 * rename cannot silently drop it either.
 */

import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import {
  TENANT_SCOPED_MODELS,
  DERIVED_TENANT_MODELS,
} from "../lib/tenantGuard";

/**
 * Files converted to the guarded client. Add a file here in the SAME commit
 * that converts it.
 */
const ADOPTED_FILES: string[] = [
  "app/[site]/troubleshooting/page.tsx",
  "app/[site]/page.tsx",
  "app/[site]/services/page.tsx",
  "app/[site]/services/[category]/page.tsx",
  "app/api/admin/services/[serviceId]/tree/route.ts",
  "app/api/admin/materials/route.ts",
  // Dependency-injected helpers. They hold no client of their own and must
  // not acquire one — tenant context belongs at the request boundary, and a
  // helper that imported prisma would silently reintroduce the unguarded path
  // for every caller at once.
  "lib/materialCost.ts",
  "lib/materialResolution.ts",
  // Batch A — admin routes that took a Service identifier from the request
  // with no contractor condition at all. Pre-existing cross-tenant gaps, not
  // adoption debt.
  "app/api/admin/services/[serviceId]/pricing/route.ts",
  "app/api/admin/services/[serviceId]/route.ts",
  "app/api/admin/services/route.ts",
  "app/api/admin/pricing-settings/recalculate/route.ts",
  "app/api/admin/reorder/route.ts",
  "app/dashboard/services/[serviceId]/page.tsx",
  "app/dashboard/pricing-settings/page.tsx",
  // Batch B — admin category readers. Correct before, but by a hand-written
  // `where: { contractorId }` written during the ADR-006 read switch. Behind
  // the guard the filter is no longer load-bearing application code.
  "app/dashboard/categories/page.tsx",
  "app/dashboard/services/page.tsx",
  "app/dashboard/services/new/page.tsx",
  // ADR §2.2 — storefront routes, now tenant-addressed. Every one of these
  // resolves a ContractorSite before it looks at any tenant-owned resource.
  "app/api/services/[slug]/route.ts",
  "app/api/services/by-id/[id]/route.ts",
  "app/api/service-match/route.ts",
  "app/api/visit/while-we-there/route.ts",
  "app/api/visit/route.ts",
  "app/api/quotes/route.ts",
  // The last customer-facing route without a site identifier. It read
  // ServiceArea unscoped, so with two contractors it would have validated a
  // ZIP against every contractor's area and booked whoever covered it.
  "app/api/checkout/route.ts",
  "app/[site]/checkout/schedule/page.tsx",
  "app/api/service-match/feedback/route.ts",
  // Admin surfaces, now resolving their contractor from membership.
  "app/dashboard/jobber/page.tsx",
  "app/dashboard/service-area/page.tsx",
  "app/dashboard/business-hours/page.tsx",
  "app/api/admin/business-hours/route.ts",
  "app/api/admin/jobber/disconnect/route.ts",
  "app/api/admin/pricing-settings/route.ts",
  "app/api/admin/service-area/route.ts",
];

/**
 * Deliberate exceptions, `file::model`, with the reason.
 *
 * For compatibility paths that must stay on the unguarded client during the
 * expand phase. Not a place to silence a finding you have not thought about.
 */
/**
 * Deliberate exceptions, `file::model`, with the reason.
 *
 * Empty since 27 August: the last entry was recordQuery writing ServiceQuery,
 * which ADR-008 re-keyed and moved onto the guarded client.
 */
const ALLOWED_UNGUARDED: Record<string, string> = {};

/** Identifiers that ARE the unguarded application client. */
const UNGUARDED_IDENTIFIERS = ["prisma", "platformDb"];

/** `AnswerOption` -> `answerOption`. */
function accessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Every model the guard scopes: tenant-owned outright, or derived. */
export function guardedModels(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of TENANT_SCOPED_MODELS) out.set(accessor(m), m);
  for (const m of DERIVED_TENANT_MODELS.keys()) out.set(accessor(m), m);
  return out;
}

export type Finding = { file: string; line: number; model: string; op: string; text: string };

/** Strip comments so a commented-out query is not a finding. */
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

/**
 * Pure, so the self-test below can feed it fixtures rather than temp files.
 */
export function auditFile(file: string, rawSrc: string): Finding[] {
  const models = guardedModels();
  const src = stripComments(rawSrc);
  const findings: Finding[] = [];

  // A locally constructed client is unguarded too, whatever it is called.
  const localClients: string[] = [];
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*new\s+PrismaClient\s*\(/g)) {
    localClients.push(m[1]);
  }
  const unguarded = [...UNGUARDED_IDENTIFIERS, ...localClients];

  // HANDING THE UNGUARDED CLIENT TO SOMETHING ELSE.
  //
  // The dependency-injected helpers — recomputeServiceMaterialCost,
  // loadServiceForResolution, loadOwnComponents — take a client and run tenant
  // queries on it. `helper(prisma, serviceId)` is therefore an unguarded
  // tenant query that no `prisma.<model>` search can see, because the model
  // name never appears at the call site.
  //
  // Found by the completion sweep: seven such sites, in files that looked
  // clean. An adopted file must not pass the unguarded client to anything.
  src.split("\n").forEach((text, i) => {
    for (const id of unguarded) {
      const passed = new RegExp(`\\b(\\w+)\\s*\\(\\s*${id}\\s*[,)]`, "g");
      for (const m of text.matchAll(passed)) {
        const callee = m[1];
        // `withTenantGuard(prisma)` and `withContractor(...)` are how the
        // guarded client is BUILT, not a leak.
        if (callee === "withTenantGuard" || callee === "withContractor") continue;
        // soleContractorId reads Contractor, a platform model, and must run
        // before a context exists.
        if (callee === "soleContractorId") continue;
        if (ALLOWED_UNGUARDED[`${file}::${callee}`]) continue;
        findings.push({
          file,
          line: i + 1,
          model: `(passed to ${callee})`,
          op: "unguarded client",
          text: text.trim(),
        });
      }
    }
  });

  src.split("\n").forEach((text, i) => {
    for (const id of unguarded) {
      // `prisma.question.findMany(` — identifier, model, operation.
      const re = new RegExp(`\\b${id}\\s*\\.\\s*(\\w+)\\s*\\.\\s*(\\w+)\\s*\\(`, "g");
      for (const m of text.matchAll(re)) {
        const [, acc, op] = m;
        const model = models.get(acc);
        if (!model) continue;
        if (ALLOWED_UNGUARDED[`${file}::${model}`]) continue;
        findings.push({ file, line: i + 1, model, op, text: text.trim() });
      }
    }
  });
  return findings;
}

// ---------------------------------------------------------------------------
// Self-test. Permanent rather than a one-off, so the check's own behaviour is
// re-proven on every run instead of trusted from the day it was written.
// ---------------------------------------------------------------------------

const FIXTURES: { name: string; src: string; expectFindings: number }[] = [
  {
    name: "1. adopted route + UNGUARDED tenant query -> fail",
    src: `import { prisma } from "@/lib/prisma";
      export async function GET() {
        return prisma.question.findMany({ where: { serviceId: "x" } });
      }`,
    expectFindings: 1,
  },
  {
    name: "2. same route via the GUARDED client -> pass",
    src: `import { withContractor } from "@/lib/tenantRoute";
      export async function GET() {
        return withContractor(id, "admin-session", (db) =>
          db.question.findMany({ where: { serviceId: "x" } }));
      }`,
    expectFindings: 0,
  },
  {
    name: "3. PLATFORM query on the unguarded client -> pass",
    src: `import { prisma } from "@/lib/prisma";
      const roles = await prisma.canonicalMaterial.findMany();
      const groups = await prisma.photoGroup.findMany();
      const legacy = await prisma.serviceCategory.findUnique({ where: { slug } });`,
    expectFindings: 0,
  },
  {
    name: "4. DERIVED tenant query through the guarded client -> pass",
    src: `return withContractor(id, "admin-session", async (db) => {
        const a = await db.answerOption.findUnique({ where: { id } });
        const m = await db.serviceMaterial.count();
        return { a, m };
      });`,
    expectFindings: 0,
  },
  {
    name: "5. guarded $transaction path -> pass",
    src: `return withContractor(id, "admin-session", (db) =>
        db.$transaction(async (tx) => {
          await tx.answerOption.deleteMany({ where: { id: { in: ids } } });
          await tx.question.update({ where: { id }, data: { order: 1 } });
          return tx.service.update({ where: { id }, data: { questions: { create: q } } });
        }));`,
    expectFindings: 0,
  },
  {
    name: "6. locally constructed client -> fail",
    src: `const p = new PrismaClient();
      await p.serviceMaterial.deleteMany({ where: { serviceId } });`,
    expectFindings: 1,
  },
  {
    name: "7. unguarded client PASSED to a DI helper -> fail",
    src: `import { prisma } from "@/lib/prisma";
      const service = await loadServiceForResolution(prisma, serviceId);`,
    expectFindings: 1,
  },
  {
    name: "8. guarded client passed to a DI helper -> pass",
    src: `return withContractor(id, "admin-session", async (db) => {
        const service = await loadServiceForResolution(db, serviceId);
        return recomputeServiceMaterialCost(db, serviceId);
      });`,
    expectFindings: 0,
  },
  {
    name: "9. building the guarded client is not a leak -> pass",
    src: `const guarded = withTenantGuard(prisma);
      const id = await soleContractorId(prisma, "a surface");`,
    expectFindings: 0,
  },
  {
    name: "10. commented-out unguarded query -> pass",
    src: `// return prisma.question.findMany();
      return db.question.findMany();`,
    expectFindings: 0,
  },
];

function selfTest(): number {
  console.log(`\n  SELF-TEST\n`);
  let bad = 0;
  for (const f of FIXTURES) {
    const got = auditFile("fixture.ts", f.src).length;
    const pass = got === f.expectFindings;
    if (!pass) bad++;
    console.log(
      `    ${pass ? "✓" : "✗"} ${f.name}` +
        (pass ? "" : `\n        expected ${f.expectFindings} finding(s), got ${got}`)
    );
  }
  return bad;
}

function main() {
  console.log(`\nGUARD ADOPTION — ADR-007a\n`);

  const bad = selfTest();
  if (bad > 0) {
    console.error(`\n  ${bad} self-test(s) FAILED. The check itself is wrong; fix it before\n` +
      `  trusting anything below.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ${ADOPTED_FILES.length} adopted file(s)\n`);
  if (ADOPTED_FILES.length === 0) {
    console.log(`    (none yet)\n`);
  }

  const findings: Finding[] = [];
  let missing = 0;
  for (const file of ADOPTED_FILES) {
    if (!existsSync(file)) {
      missing++;
      console.error(`    ✗ ${file} — listed as adopted but not found (renamed? deleted?)`);
      continue;
    }
    const f = auditFile(file, readFileSync(file, "utf8"));
    findings.push(...f);
    console.log(`    ${f.length === 0 ? "✓" : "✗"} ${file}`);
    for (const x of f) {
      console.log(`        line ${x.line}: unguarded ${x.model}.${x.op}`);
      console.log(`        ${x.text}`);
    }
  }

  const total = findings.length + missing;
  console.log(
    `\n${"─".repeat(74)}\n\n  ${total} adopted file(s) reaching tenant data unguarded.\n`
  );
  if (findings.length > 0) {
    console.log(
      `  An adopted file must reach tenant-owned and derived-owned models through\n` +
        `  the guarded client only — see lib/tenantRoute.ts. If a path genuinely\n` +
        `  must stay unguarded, add it to ALLOWED_UNGUARDED with the reason.\n`
    );
  }
  console.log(
    `  Scope note: this proves adopted files have not drifted. It says nothing\n` +
      `  about files not yet on the list — those are tracked by ADR-007a's\n` +
      `  adoption criterion, not by this check.\n`
  );
  process.exitCode = total === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (process.argv.includes("--self-test")) {
    process.exitCode = selfTest() === 0 ? 0 : 1;
  } else {
    main();
  }
}
