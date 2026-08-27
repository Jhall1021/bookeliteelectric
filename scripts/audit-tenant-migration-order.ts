/**
 * ADR-008's ordering constraint, enforced against the schema.
 *
 *   npx tsx scripts/audit-tenant-migration-order.ts [--schema <path>]
 *
 * THE INVARIANT, AND ONLY THIS ONE
 *
 *   If Service.slug stops being globally unique, ServiceQuery must already be
 *   re-keyed on (contractorId, normalizedText).
 *
 * WHY THIS ONE GETS A GATE WHEN A DOCUMENTED ORDERING RULE USUALLY DOES NOT
 *
 * Every other failure this week was loud once it happened — a build error, a
 * throw, a red check. This one is silent. Today the service-match cache is
 * protected by accident: a cache hit is only trusted if the matched slug
 * exists in this contractor's catalog, and because Service.slug is globally
 * unique it never does across tenants, so the cache degrades to asking the
 * model instead of leaking.
 *
 * Make slugs per-contractor first and that protection disappears with nothing
 * failing. Green build, plausible-looking answer, wrong contractor's
 * suggestion. Two open items that are each harmless alone, where the ORDER
 * decides whether the defect exists.
 *
 * WHAT IT READS
 *
 * The schema's actual shape, with comments stripped first. A comment saying
 * what the schema should be is the same category as an audit that reports
 * without failing, and this must not be satisfiable by writing a nicer
 * comment.
 *
 * WHAT IT DOES NOT PROVE
 *
 * The shape only. A correctly-keyed table read without a tenant filter still
 * leaks, and no schema check can see that. The read and write paths are
 * covered by scripts/audit-platform-tenant-relations.ts and the live harness.
 * The output says so, so a green run is never read as "ADR-008 is done".
 *
 * FAILS ON UNREADABLE INPUT
 *
 * Cannot parse, model missing, field missing — all failures. A guard that
 * passes silently when its input is unreadable is the monitoring problem one
 * level down.
 */

import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

class SchemaUnreadable extends Error {}

/** Strip `///` and `//` comments so no comment can satisfy a check. */
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith("///") || t.startsWith("//")) return "";
      // Trailing comment on a field line.
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

function modelBody(src: string, model: string): string {
  const re = new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  const m = re.exec(src);
  if (!m) {
    throw new SchemaUnreadable(
      `model ${model} not found. If it was deliberately removed, this audit ` +
        `must be updated in the same commit — see ADR-008.`
    );
  }
  return m[1];
}

/** The raw declaration line for a field, or throw. */
function fieldLine(body: string, model: string, field: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\w+)\s+/.exec(line);
    if (m && m[1] === field) return line;
  }
  throw new SchemaUnreadable(`${model}.${field} not found.`);
}

/** Every `@@unique([...])` on a model, as arrays of field names. */
function blockUniques(body: string): string[][] {
  const out: string[][] = [];
  const re = /@@unique\(\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1].split(",").map((f) => f.trim()).filter(Boolean));
  }
  return out;
}

function hasInlineUnique(line: string): boolean {
  return /@unique\b/.test(line) && !/@@unique/.test(line);
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export type Audit = {
  slugGloballyUnique: boolean;
  serviceQueryHasRequiredContractorId: boolean;
  serviceQueryHasCompoundUnique: boolean;
  serviceQueryGlobalUniqueRemoved: boolean;
};

export function auditSchema(rawSrc: string): Audit {
  const src = stripComments(rawSrc);

  // ---- trigger: has Service.slug lost its GLOBAL uniqueness guarantee? ----
  //
  // Deliberately phrased as loss-of-guarantee rather than "did it become a
  // compound key". Dropping the constraint entirely as an intermediate step
  // removes the protection just as thoroughly, and would sail past a check
  // that only looked for @@unique([contractorId, slug]).
  const serviceBody = modelBody(src, "Service");
  const slugLine = fieldLine(serviceBody, "Service", "slug");
  const slugInline = hasInlineUnique(slugLine);
  const slugBlockAlone = blockUniques(serviceBody).some((u) => sameSet(u, ["slug"]));
  const slugGloballyUnique = slugInline || slugBlockAlone;

  // ---- dependency: is ServiceQuery fully re-keyed? -----------------------
  //
  // All three, not any one. Adding the compound key while the global unique
  // survives leaves the cache globally keyed — the dependency is not met, and
  // a check looking only for the compound key would go quiet at exactly the
  // wrong moment.
  const sqBody = modelBody(src, "ServiceQuery");

  let contractorIdRequired = false;
  try {
    const line = fieldLine(sqBody, "ServiceQuery", "contractorId");
    // `String` required; `String?` optional. Optional is not re-keyed.
    contractorIdRequired = /^\w+\s+String(?!\?)/.test(line);
  } catch {
    contractorIdRequired = false; // absent is simply not done yet
  }

  const normalizedLine = fieldLine(sqBody, "ServiceQuery", "normalizedText");
  const globalUniqueRemoved = !hasInlineUnique(normalizedLine)
    && !blockUniques(sqBody).some((u) => sameSet(u, ["normalizedText"]));

  const compound = blockUniques(sqBody).some((u) =>
    sameSet(u, ["contractorId", "normalizedText"])
  );

  return {
    slugGloballyUnique,
    serviceQueryHasRequiredContractorId: contractorIdRequired,
    serviceQueryHasCompoundUnique: compound,
    serviceQueryGlobalUniqueRemoved: globalUniqueRemoved,
  };
}

function main() {
  const i = process.argv.indexOf("--schema");
  const path = i !== -1 ? process.argv[i + 1] : "prisma/schema.prisma";

  console.log(`\nADR-008 — tenant migration ORDER\n`);

  let src: string;
  try {
    src = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`  ✗ cannot read ${path}: ${(e as Error).message}`);
    console.error(`\n  Refusing to pass on unreadable input.\n`);
    process.exitCode = 1;
    return;
  }

  let a: Audit;
  try {
    a = auditSchema(src);
  } catch (e) {
    console.error(`  ✗ cannot parse the schema: ${(e as Error).message}`);
    console.error(`\n  Refusing to pass on unparseable input.\n`);
    process.exitCode = 1;
    return;
  }

  const reKeyed =
    a.serviceQueryHasRequiredContractorId &&
    a.serviceQueryHasCompoundUnique &&
    a.serviceQueryGlobalUniqueRemoved;

  console.log(`  Service.slug globally unique ......... ${a.slugGloballyUnique ? "yes" : "NO"}`);
  console.log(`  ServiceQuery.contractorId required ... ${a.serviceQueryHasRequiredContractorId ? "yes" : "no"}`);
  console.log(`  @@unique([contractorId, normalizedText]) ${a.serviceQueryHasCompoundUnique ? "yes" : "no"}`);
  console.log(`  global unique on normalizedText gone . ${a.serviceQueryGlobalUniqueRemoved ? "yes" : "no"}`);

  if (a.slugGloballyUnique) {
    console.log(
      `\n  Service.slug is still globally unique, so the service-match cache is\n` +
        `  still protected by that accident. ServiceQuery re-keying is ${reKeyed ? "done" : "not yet required"}.\n`
    );
    process.exitCode = 0;
    return;
  }

  if (!reKeyed) {
    const missing = [
      !a.serviceQueryHasRequiredContractorId && "a REQUIRED ServiceQuery.contractorId",
      !a.serviceQueryHasCompoundUnique && "@@unique([contractorId, normalizedText])",
      !a.serviceQueryGlobalUniqueRemoved &&
        "removal of the global unique on normalizedText (a compound key " +
          "alongside it still leaves the cache globally keyed)",
    ].filter(Boolean) as string[];

    console.error(
      `\n  ✗ ORDERING VIOLATION — ADR-008\n\n` +
        `  Service.slug is no longer globally unique, and ServiceQuery is not\n` +
        `  re-keyed. Missing:\n` +
        missing.map((m) => `      - ${m}`).join("\n") +
        `\n\n` +
        `  Until Service.slug was globally unique, the service-match cache was\n` +
        `  protected by accident: a slug cached by another contractor was never\n` +
        `  found in this contractor's catalog, so the cache degraded to asking\n` +
        `  the model. That protection is now gone, and nothing else replaces it.\n` +
        `  One contractor's customer can receive another contractor's suggestion,\n` +
        `  with a green build and a plausible-looking answer.\n\n` +
        `  Re-key ServiceQuery first, or restore the global unique on\n` +
        `  Service.slug until it is done.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n  ✓ ORDER RESPECTED — ServiceQuery was re-keyed before Service.slug\n` +
      `    stopped being globally unique.\n\n` +
      `  THIS PROVES THE SCHEMA SHAPE ONLY. It does not mean ADR-008 is done.\n` +
      `  A correctly-keyed table read without a tenant filter still leaks, and\n` +
      `  no schema check can see that. The read, write and feedback paths are\n` +
      `  covered by scripts/audit-platform-tenant-relations.ts and the live\n` +
      `  two-contractor harness.\n`
  );
  process.exitCode = 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
