/**
 * The generated Prisma client is the one this worktree's schema describes.
 *
 * WHY THIS EXISTS
 *
 * It has bitten twice, both times in a DB-backed rehearsal, both times as a
 * confusing runtime error rather than an obvious setup problem:
 *
 *   "The column `accessSlot` does not exist in the current database"
 *
 * The cause is never the database. It is that `node_modules/.prisma` holds a
 * client generated from a DIFFERENT schema than the one the code was written
 * against — a parallel worktree sharing node_modules, a branch switch, an
 * in-flight migration from another workstream. The client is a single copy and
 * whoever ran `prisma generate` last owns it.
 *
 * A rehearsal that starts from a mismatched client can fail for reasons that
 * have nothing to do with what it is testing, or — worse — pass while
 * exercising a shape the schema no longer has.
 *
 * So: schema change -> prisma generate -> CHECK. This is the check.
 *
 * Compares MODEL and FIELD names only. Types, attributes and relations are the
 * generator's business; drift shows up as a missing name long before it shows
 * up as anything subtler, and a narrow check that always works is worth more
 * than a thorough one that needs maintaining.
 */
import { readFileSync } from "node:fs";

/** Structurally what we read, and readonly to match Prisma's own DMMF type. */
export type DmmfLike = {
  readonly models: readonly { readonly name: string; readonly fields: readonly { readonly name: string }[] }[];
};

export type ParityProblem = { kind: "MISSING_FROM_CLIENT" | "MISSING_FROM_SCHEMA"; detail: string };

/** Model -> field names, parsed from schema.prisma without a full grammar. */
function modelsFromSchema(schemaPath: string): Map<string, Set<string>> {
  const src = readFileSync(schemaPath, "utf8");
  const out = new Map<string, Set<string>>();
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src))) {
    const fields = new Set<string>();
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      // Skip comments, block attributes and blanks. A field line starts with a
      // name and is followed by a type.
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) continue;
      const f = /^(\w+)\s+\S/.exec(line);
      if (f) fields.add(f[1]);
    }
    out.set(m[1], fields);
  }
  return out;
}

/**
 * @param dmmf  `Prisma.dmmf.datamodel` from the generated client.
 *
 * Passed in rather than imported so this module stays usable when the client
 * is the very thing that is broken.
 */
export function clientParityProblems(
  dmmf: DmmfLike,
  schemaPath = "prisma/schema.prisma"
): ParityProblem[] {
  const schema = modelsFromSchema(schemaPath);
  const client = new Map(dmmf.models.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]));
  const problems: ParityProblem[] = [];

  for (const [model, fields] of schema) {
    const got = client.get(model);
    if (!got) { problems.push({ kind: "MISSING_FROM_CLIENT", detail: `model ${model}` }); continue; }
    for (const f of fields)
      if (!got.has(f)) problems.push({ kind: "MISSING_FROM_CLIENT", detail: `${model}.${f}` });
  }
  for (const [model, fields] of client) {
    const want = schema.get(model);
    if (!want) { problems.push({ kind: "MISSING_FROM_SCHEMA", detail: `model ${model}` }); continue; }
    for (const f of fields)
      if (!want.has(f)) problems.push({ kind: "MISSING_FROM_SCHEMA", detail: `${model}.${f}` });
  }
  return problems;
}

/** Print and exit non-zero on drift. For the top of any DB-backed script. */
export function requireClientParity(
  dmmf: DmmfLike,
  schemaPath = "prisma/schema.prisma"
): void {
  const problems = clientParityProblems(dmmf, schemaPath);
  if (problems.length === 0) return;
  console.error(
    `\n  REFUSING: the generated Prisma client does not match ${schemaPath}.\n\n` +
    problems.slice(0, 8).map((p) => `    ${p.kind === "MISSING_FROM_CLIENT" ? "client lacks " : "schema lacks "}${p.detail}`).join("\n") +
    (problems.length > 8 ? `\n    ... and ${problems.length - 8} more` : "") +
    `\n\n  node_modules holds ONE client and whoever generated it last owns it —\n` +
    `  a parallel worktree, a branch switch, another workstream's migration.\n` +
    `  Run:  npx prisma generate\n`
  );
  process.exit(1);
}
