/**
 * Make Question.order unique within each service WITHOUT changing the order
 * anyone currently sees.
 *
 *   npx tsx scripts/repair-duplicate-question-order.ts                          # report ties, write nothing
 *   P2B_REPAIR_ALLOWED_HOST=<endpoint> npx tsx scripts/repair-duplicate-question-order.ts \
 *     --snapshot <order.json> --apply                                           # repair
 *
 * WHY A SNAPSHOT, AND NOT THE ORDERING RULE. Tied positions come back in
 * whatever order the query plan produces, and no rule reproduces that order:
 * on the rehearsal data `id asc` matched two services and `id desc` the third.
 * QUESTION_ORDER breaks ties by id so the order is total from now on — but
 * using it to renumber would silently swap a pair of questions for any service
 * whose plan happened to return them the other way. So the order to preserve
 * is read from a snapshot captured WITH THE CODE THAT WAS SERVING, before the
 * rule changed: `{ [contractorSlug]: { [serviceSlug]: { questionIds: [...] } } }`,
 * which scripts/proto-dump/fingerprint.ts writes.
 *
 * FEWEST CHANGES, NO REORDERING. Walking the snapshot order, each question
 * keeps its position unless that would not be strictly greater than the one
 * before it, in which case it takes previous + 1. `[1, 2, 6, 7, 7, 16, 17]`
 * becomes `[1, 2, 6, 7, 8, 16, 17]` — one row.
 *
 * REFUSES rather than guesses: a service whose questions differ from the
 * snapshot's, a database whose host is not explicitly allowed, or --apply
 * without a snapshot. Each service is repaired in one transaction.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const APPLY = process.argv.includes("--apply");

type Snapshot = Record<string, Record<string, { questionIds: string[] }>>;

/** Positions for `ids` in snapshot order: keep each unless it would not ascend. */
export function preservingPositions(ids: string[], current: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let prev = -Infinity;
  for (const id of ids) {
    const next = Math.max(current.get(id)!, prev + 1);
    out.set(id, next);
    prev = next;
  }
  return out;
}

async function main() {
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`\nDUPLICATE QUESTION ORDER — ${APPLY ? "REPAIR" : "report only"}  (${host})\n`);

  const groups = await prisma.question.groupBy({ by: ["serviceId", "order"], _count: { _all: true } });
  const tiedServiceIds = [...new Set(groups.filter((g) => g._count._all > 1).map((g) => g.serviceId))];
  if (tiedServiceIds.length === 0) {
    console.log("  no service has two questions at the same order — nothing to do\n");
    return;
  }

  if (APPLY) {
    if (process.env.P2B_REPAIR_ALLOWED_HOST !== host) {
      throw new Error(`REFUSED: set P2B_REPAIR_ALLOWED_HOST=${host} to name this database deliberately.`);
    }
    if (!arg("snapshot")) throw new Error("REFUSED: --apply needs --snapshot captured with the code that was serving.");
  }
  const snapshot: Snapshot | null = arg("snapshot") ? JSON.parse(readFileSync(arg("snapshot")!, "utf8")) : null;

  for (const serviceId of tiedServiceIds) {
    const svc = await prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
      select: { slug: true, contractor: { select: { slug: true } }, questions: { select: { id: true, key: true, order: true } } },
    });
    const label = `${svc.contractor?.slug ?? "?"}/${svc.slug}`;
    const current = new Map(svc.questions.map((q) => [q.id, q.order]));
    const orders = svc.questions.map((q) => q.order).sort((a, b) => a - b);
    const ties = [...new Set(orders.filter((o, i) => orders.indexOf(o) !== i))];
    const lowest = orders[0];
    console.log(`  ${label}: tied at ${ties.join(", ")}; lowest position ${lowest}; tie at the start: ${ties.includes(lowest)}`);
    if (ties.includes(lowest)) {
      throw new Error(`REFUSED: ${label} is tied at its STARTING position — which question a customer starts on is ambiguous and needs a person, not a script.`);
    }
    if (!snapshot) continue;

    const want = snapshot[svc.contractor?.slug ?? ""]?.[svc.slug]?.questionIds;
    if (!want) throw new Error(`REFUSED: ${label} is not in the snapshot.`);
    const same = want.length === current.size && want.every((id) => current.has(id));
    if (!same) throw new Error(`REFUSED: ${label}'s questions no longer match the snapshot.`);

    const next = preservingPositions(want, current);
    const changes = want.filter((id) => next.get(id) !== current.get(id));
    for (const id of changes) {
      const q = svc.questions.find((x) => x.id === id)!;
      console.log(`      ${q.key}: ${current.get(id)} -> ${next.get(id)}`);
    }
    if (APPLY && changes.length) {
      await prisma.$transaction(changes.map((id) => prisma.question.update({ where: { id }, data: { order: next.get(id)! } })));
      console.log(`      applied ${changes.length} change(s)`);
    }
  }

  if (APPLY) {
    const after = await prisma.question.groupBy({ by: ["serviceId", "order"], _count: { _all: true } });
    const left = after.filter((g) => g._count._all > 1).length;
    console.log(`\n  duplicate positions remaining: ${left}\n`);
    if (left) process.exit(1);
  }
}

if (process.argv[1]?.endsWith("repair-duplicate-question-order.ts")) {
  main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(`\n  ${e.message}\n`); await prisma.$disconnect(); process.exit(1); });
}
