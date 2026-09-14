/**
 * A service's questions have ONE order, and every reader gets the same one.
 *
 *   npx tsx scripts/verify-question-order.ts
 *
 * The resolver, the activation outcome walker and the storefront all begin a
 * customer at `questions[0]`. Question.order is the only thing deciding which
 * question that is, and two questions at the same order were being ordered by
 * the query plan — no rule reproduced it. Three Elite services on the rehearsal
 * database carried such ties, none at the starting position; one at the start
 * would make the question a customer is first asked a matter of chance.
 *
 * So: (1) the data holds no ties, (2) every Prisma read that orders a
 * service's questions uses the shared QUESTION_ORDER, and (3) that rule is a
 * total order. Each check carries a negative control proving it still fails on
 * the thing it exists to catch. READ ONLY.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QUESTION_ORDER } from "../lib/serviceTreeQuery";
import { preservingPositions } from "./repair-duplicate-question-order";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (label: string, c: boolean, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "✓" : "✗"} ${label}${c || !detail ? "" : `  (${detail})`}`);
};

/** Services with two or more questions sharing a position. */
export function tiedServices(rows: { serviceId: string; order: number }[]): string[] {
  const seen = new Map<string, Set<number>>(); const tied = new Set<string>();
  for (const r of rows) {
    const s = seen.get(r.serviceId) ?? new Set<number>();
    if (s.has(r.order)) tied.add(r.serviceId);
    s.add(r.order); seen.set(r.serviceId, s);
  }
  return [...tied];
}

/**
 * Prisma reads that order QUESTIONS by anything other than QUESTION_ORDER:
 * a `questions:` relation whose own orderBy is not the constant, or a
 * question.findMany/findFirst carrying an orderBy at all.
 */
export function rawQuestionOrderings(src: string): string[] {
  const hits: string[] = [];
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of clean.matchAll(/\bquestions\s*:\s*\{\s*orderBy\s*:\s*([^,\n]+)/g)) {
    if (m[1].trim() !== "QUESTION_ORDER") hits.push(m[0].replace(/\s+/g, " ").trim());
  }
  for (const m of clean.matchAll(/\.question\.(?:findMany|findFirst)\(\s*\{[^;]*?\borderBy\s*:\s*([^,\n}]+)/g)) {
    if (m[1].trim() !== "QUESTION_ORDER") hits.push(m[0].replace(/\s+/g, " ").slice(0, 90));
  }
  return hits;
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

async function main() {
  console.log("\nQUESTION ORDER");

  console.log("\n  DATA");
  const rows = await prisma.question.findMany({ select: { serviceId: true, order: true } });
  const tied = tiedServices(rows);
  const names = tied.length
    ? (await prisma.service.findMany({ where: { id: { in: tied } }, select: { slug: true, contractor: { select: { slug: true } } } }))
        .map((s) => `${s.contractor?.slug}/${s.slug}`)
    : [];
  ok(`no service has two questions at the same order (${rows.length} questions checked)`,
    tied.length === 0, `${names.join(", ")} — repair with scripts/repair-duplicate-question-order.ts`);
  ok(`negative control: a service with two questions at one position is caught`,
    tiedServices([{ serviceId: "a", order: 0 }, { serviceId: "a", order: 3 }, { serviceId: "a", order: 3 }, { serviceId: "b", order: 3 }])
      .join() === "a");

  console.log("\n  READERS");
  const files = ["app", "lib", "components"].flatMap(sourceFiles);
  const offenders = files.flatMap((f) => rawQuestionOrderings(readFileSync(f, "utf8")).map((h) => `${f}: ${h}`));
  ok(`every Prisma read ordering a service's questions uses QUESTION_ORDER (${files.length} files)`,
    offenders.length === 0, offenders.join(" | "));
  const RAW = [
    `db.service.findUnique({ where: { id }, include: { questions: { orderBy: { order: "asc" }, include: { options: true } } } })`,
    `const qs = await db.question.findMany({ where: { serviceId }, orderBy: { order: "asc" } });`,
    `include: {\n  questions: {\n    orderBy: [{ order: "asc" }],\n  },\n}`,
  ];
  ok(`negative control: raw question orderings are caught`,
    RAW.every((s) => rawQuestionOrderings(s).length > 0), RAW.filter((s) => rawQuestionOrderings(s).length === 0).join(" | "));
  const SHARED = [
    `db.service.findUnique({ where: { id }, include: { questions: { orderBy: QUESTION_ORDER, include: { options: { orderBy: { order: "asc" } } } } } })`,
    `const existing = await db.question.findMany({ where: { serviceId }, select: { id: true, key: true } });`,
  ];
  ok(`  and the shared rule, option ordering and unordered reads are not`,
    SHARED.every((s) => rawQuestionOrderings(s).length === 0), SHARED.filter((s) => rawQuestionOrderings(s).length > 0).join(" | "));

  console.log("\n  RULE");
  const last = QUESTION_ORDER[QUESTION_ORDER.length - 1] as unknown as Record<string, string>;
  ok(`QUESTION_ORDER is position first, then a unique key`,
    JSON.stringify(QUESTION_ORDER[0]) === JSON.stringify({ order: "asc" }) && Object.keys(last)[0] === "id");
  ok(`the repair keeps positions and never reorders: [1,2,6,7,7,16,17] -> [1,2,6,7,8,16,17]`,
    (() => {
      const ids = ["a", "b", "c", "d", "e", "f", "g"]; const cur = new Map(ids.map((id, i) => [id, [1, 2, 6, 7, 7, 16, 17][i]]));
      return JSON.stringify(ids.map((id) => preservingPositions(ids, cur).get(id))) === "[1,2,6,7,8,16,17]";
    })());

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
