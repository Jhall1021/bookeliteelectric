/**
 * ADR-007, enforced.
 *
 *   npx tsx scripts/audit-platform-tenant-relations.ts
 *
 * THE RULE
 *
 *   Tenant-owned data must never be operationally loaded through a
 *   platform-owned TOP-LEVEL Prisma query. Root those queries at the
 *   tenant-owned model so the guard executes.
 *
 * WHY IT NEEDS A SCRIPT
 *
 * Prisma query extensions fire on the top-level operation only — nested
 * include/select reads are part of the parent query and are never intercepted.
 * That was measured, not assumed: scripts/verify-tenant-isolation-live.ts
 * reads one contractor's component economics from another's context through a
 * platform root.
 *
 * So a query rooted at a PLATFORM model with a tenant-owned relation nested
 * under it is isolated only by a hand-written `where: { contractorId }`.
 * Correct exactly as long as someone remembers it, and silent when they don't
 * — which is the failure the guard exists to remove.
 *
 * This finds those shapes in the schema, then reports which of them
 * operational code actually reaches for. Seeds and scripts are excluded: they
 * construct their own client, are platform-level by design, and write across
 * tenants deliberately.
 *
 * WHAT IT CANNOT DO
 *
 * It greps rather than type-checks. A nested include IS flagged wherever the
 * relation field name appears as `field: {` or `field: true` under app/, lib/
 * or components/ — including, unavoidably, a same-named relation on a
 * tenant-owned parent, which is safe. Those are reported for review rather
 * than failed outright, and the reviewed-and-safe ones are listed below with
 * their reason. A finding that is not on that list fails the audit.
 */

import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PLATFORM_MODELS,
  TENANT_SCOPED_MODELS,
  PENDING_TENANT_SCOPE,
  DERIVED_TENANT_MODELS,
} from "../lib/tenantGuard";

/**
 * Relation reads reviewed and found safe, with the reason.
 *
 * A `field: {` under a tenant-owned root is safe — the root establishes
 * ownership and the foreign key constrains the rest. These entries record
 * WHICH root, so the reasoning can be rechecked rather than trusted.
 */
/**
 * An exception may be a bare reason, or a reason plus `mustMatch`.
 *
 * `mustMatch` anchors the exception to the CONTENT of the flagged line AND the
 * few lines after it, not merely to file+field. Without it, exempting `lib/jobber.ts:visits` for
 * a Jobber GraphQL response type would also exempt a genuine
 * `contractor.findMany({ include: { visits: true } })` in the same file —
 * silencing exactly the traversal this audit exists to catch, and doing it
 * invisibly. With it, a line that stops matching stops being excused.
 */
type Exception = string | { reason: string; mustMatch: RegExp };

const REVIEWED_SAFE: Record<string, Exception> = {
  "app/api/admin/materials/route.ts:activeSupplierLink":
    "Rooted at contractorMaterial.findMany — ContractorMaterial is tenant-owned, " +
    "so the guard scopes it. This is the relation on ContractorMaterial, not the " +
    "same-named one on the deprecated Material.",
  "app/admin/(protected)/categories/page.tsx:services":
    "ContractorCategory.services, not Contractor.services. The root is " +
    "ContractorCategory, which is tenant-owned, so the guard scopes it.",
  "app/admin/(protected)/services/page.tsx:services": "As above.",
  "app/[site]/services/page.tsx:services":
    "ContractorCategory.services under a §2.2 site-resolved tenant context.",
  "app/[site]/services/[category]/page.tsx:services": "As above.",
  "app/api/visit/while-we-there/route.ts:services": "As above.",
  "app/api/service-match/route.ts:services": "Local DTO field, not a Prisma include.",
  "lib/serviceMatch.ts:services": "Local DTO field, not a Prisma include.",
  "app/admin/(protected)/services/[serviceId]/page.tsx:options":
    "Question.options beneath a Service root. Service is tenant-owned.",
  "app/api/admin/services/[serviceId]/tree/route.ts:options":
    "Question.options beneath a Service root.",
  "app/api/services/[slug]/route.ts:options": "Question.options beneath a Service root.",
  "lib/routeResolver.ts:options": "Question.options beneath a Service root.",
  "app/api/quotes/route.ts:photos": {
    reason:
      "Nested create beneath tx.quote.create. Quote is tenant-owned (derived " +
      "through Service, ADR-011), so the root is not a platform model. Prisma " +
      "never fires the guard for a nested write, so the owner is stamped " +
      "explicitly — and this exception REQUIRES that stamp to be present, so " +
      "removing it re-fires this gate rather than passing silently.",
    mustMatch: /contractorId:\s*site\.contractorId/,
  },
  "lib/jobber.ts:visits": {
    reason:
      "Jobber's GraphQL response type, not Prisma. `visits` here is a field on " +
      "Jobber's own schema inside a jobberGraphQL<...> type argument; it has no " +
      "relation to Contractor.visits. Anchored to the call so that a real Prisma " +
      "read of Contractor.visits in this file would still be flagged.",
    mustMatch: /jobberGraphQL</,
  },
};

type Shape = { parent: string; field: string; child: string; childState: string };

function tenantState(model: string): string | null {
  if (TENANT_SCOPED_MODELS.has(model)) return "tenant";
  // ADR-010. Derived models are tenant-OWNED; they simply carry no column.
  // Omitting them here would have quietly stopped watching every relation
  // pointing at Question, AnswerOption, ServiceMaterial and the joins at the
  // moment they were reclassified.
  if (DERIVED_TENANT_MODELS.has(model)) return "derived -> tenant";
  if (PENDING_TENANT_SCOPE.has(model)) return "pending -> tenant";
  return null;
}

function schemaShapes(): Shape[] {
  const src = readFileSync("prisma/schema.prisma", "utf8");
  const out: Shape[] = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src)) !== null) {
    const [, parent, body] = m;
    if (!PLATFORM_MODELS.has(parent)) continue;
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const f = /^(\w+)\s+(\w+)(\[\])?\??/.exec(line);
      if (!f) continue;
      const [, field, child] = f;
      const childState = tenantState(child);
      if (childState) out.push({ parent, field, child, childState });
    }
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function main() {
  const shapes = schemaShapes();
  console.log(`\nADR-007 — PLATFORM parent -> TENANT child\n`);
  console.log(`  ${shapes.length} such relation(s) exist in the schema:\n`);
  for (const s of shapes) {
    console.log(
      `    ${s.parent}.${s.field}`.padEnd(48) + `-> ${s.child} [${s.childState}]`
    );
  }

  const fields = new Map<string, Shape[]>();
  for (const s of shapes) {
    const list = fields.get(s.field) ?? [];
    list.push(s);
    fields.set(s.field, list);
  }

  // iCloud Drive drops "name 2.ts" conflict copies into the tree. They are
  // untracked, so git never shows them, but tsconfig's **/*.ts picks them up
  // and they audit as real findings. Skip them here and delete them there.
  const files = ["app", "lib", "components"]
    .flatMap((d) => walk(d))
    .filter((f) => !/ \d+\.tsx?$/.test(f));
  const findings: { file: string; line: number; field: string; text: string; context: string }[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const field of fields.keys()) {
        // `field: {` inside a TYPE annotation is a shape declaration, not a
        // query. The tell is a `[]` or `;` closing it on the same line —
        // Prisma includes are multi-line objects.
        const isTypeAnnotation = /\}\s*\[\]|;\s*$/.test(text) && !text.includes("await");
        if (
          new RegExp(`\\b${field}\\s*:\\s*(\\{|true)`).test(text) &&
          !isTypeAnnotation
        ) {
          findings.push({
            file,
            line: i + 1,
            field,
            text: text.trim(),
            // The flagged line plus the block it opens, so an exception can
            // require what makes the access safe rather than just naming it.
            context: lines.slice(i, i + 8).join("\n"),
          });
        }
      }
    });
  }

  console.log(`\n  Operational code reaching one of those relation names:\n`);
  let unreviewed = 0;
  if (findings.length === 0) console.log(`    (none)`);
  for (const f of findings) {
    const key = `${f.file}:${f.field}`;
    const exc = REVIEWED_SAFE[key];
    const reason =
      typeof exc === "string"
        ? exc
        : exc && exc.mustMatch.test(f.context)
          ? exc.reason
          : undefined;
    if (reason) {
      console.log(`    ok  ${f.file}:${f.line}  ${f.field}`);
      console.log(`          ${reason}`);
    } else {
      if (exc && typeof exc !== "string") {
        // There IS an exception on file+field, but this line is not the one it
        // describes. Say so loudly — a stale exception reads as coverage.
        console.log(`    !!  ${f.file}:${f.line}  ${f.field}`);
        console.log(`          ${f.text}`);
        console.log(
          `          an exception exists for ${key} but requires ` +
            `${exc.mustMatch} — this line does not match it`
        );
        unreviewed++;
        continue;
      }
      unreviewed++;
      console.log(`    !!  ${f.file}:${f.line}  ${f.field}`);
      console.log(`          ${f.text}`);
    }
  }

  console.log(
    `\n${"─".repeat(74)}\n\n  ${unreviewed} unreviewed platform-rooted read(s) of tenant data.\n`
  );
  if (unreviewed > 0) {
    console.log(
      `  Either root the query at the tenant-owned model — see\n` +
        `  lib/contractorComponents.ts for the pattern — or, if the root really\n` +
        `  is tenant-owned and this is a same-named relation, add it to\n` +
        `  REVIEWED_SAFE in this file with the reason.\n`
    );
  }
  process.exitCode = unreviewed === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
