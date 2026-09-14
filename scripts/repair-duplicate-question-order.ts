/**
 * Make Question.order unique within each service WITHOUT changing the order
 * anyone currently sees.
 *
 *   npx tsx scripts/repair-duplicate-question-order.ts                         # report, read-only
 *   npx tsx scripts/repair-duplicate-question-order.ts --capture <release.json> # report + write the plan, read-only
 *   P2B_REPAIR_ALLOWED_HOST=<host> npx tsx scripts/repair-duplicate-question-order.ts --apply --snapshot <release.json>
 *   P2B_REPAIR_ALLOWED_HOST=<host> npx tsx scripts/repair-duplicate-question-order.ts --rollback --snapshot <release.json>
 *
 * The connection string comes from the environment (DATABASE_URL), never from
 * an argument, so it does not appear in a process listing.
 *
 * WHAT IS PRESERVED. Tied positions come back in whatever order the query plan
 * produces, and no rule reproduces that order: on production on 14 Sep 2026,
 * recessed-lighting served fixture_finish_ack before recessed_light_count while
 * `id asc` would put them the other way round. So the order to keep is the
 * order the SERVING code returns today — `orderBy: { order: "asc" }`, read five
 * times inside one read-only transaction and refused unless all five agree.
 *
 * FEWEST CHANGES, NO REORDERING. Walking that served order, each question keeps
 * its position unless that would not be strictly greater than the one before
 * it, in which case it takes previous + 1. `[1, 2, 6, 7, 7, 16, 17]` becomes
 * `[1, 2, 6, 7, 8, 16, 17]` — one row.
 *
 * ONE CONTROLLED STEP.
 *   --capture   read-only. Records, per tied service, the served order with
 *               every question's current position, and the exact plan.
 *   --apply     one transaction. Re-reads the served order and re-derives the
 *               plan; refuses unless both equal the capture exactly, so nothing
 *               that changed since the capture is repaired blind. Applies the
 *               plan, then — still inside the transaction — requires no ties
 *               anywhere and each repaired service to come back in the captured
 *               order under both the old rule and QUESTION_ORDER. Any failure
 *               rolls the whole step back.
 *   --rollback  one transaction. Restores the captured positions, refusing
 *               unless every planned row still holds exactly its planned value.
 *
 * REFUSES rather than guesses: a tie at a service's starting position (which
 * question a customer starts on would be ambiguous — that needs a person), a
 * served order that is not stable, a database whose host is not explicitly
 * allowed, or a capture taken on another database.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { QUESTION_ORDER } from "../lib/serviceTreeQuery";

type Tx = Prisma.TransactionClient;
type PlannedRow = { id: string; key: string; from: number; to: number };
type ServicePlan = { serviceId: string; served: { id: string; key: string; order: number }[]; plan: PlannedRow[] };
export type ReleaseCapture = { host: string; capturedAt: string; services: Record<string, ServicePlan> };

const SERVED_READS = 5;

/** Positions for `ids` in served order: keep each unless it would not ascend. */
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

/** The plan for one service, from its served order. Pure. */
export function planFor(served: ServicePlan["served"]): PlannedRow[] {
  const current = new Map(served.map((q) => [q.id, q.order]));
  const next = preservingPositions(served.map((q) => q.id), current);
  return served.filter((q) => next.get(q.id) !== q.order).map((q) => ({ id: q.id, key: q.key, from: q.order, to: next.get(q.id)! }));
}

/** Read every tied service's served order and plan, inside the caller's transaction. */
async function derive(tx: Tx): Promise<Record<string, ServicePlan>> {
  const groups = await tx.question.groupBy({ by: ["serviceId", "order"], _count: { _all: true } });
  const tied = [...new Set(groups.filter((g) => g._count._all > 1).map((g) => g.serviceId))];
  const out: Record<string, ServicePlan> = {};
  for (const serviceId of tied) {
    const svc = await tx.service.findUniqueOrThrow({ where: { id: serviceId }, select: { slug: true, contractor: { select: { slug: true } } } });
    const label = `${svc.contractor?.slug ?? "?"}/${svc.slug}`;
    const reads: { id: string; key: string; order: number }[][] = [];
    for (let i = 0; i < SERVED_READS; i++) {
      reads.push(await tx.question.findMany({ where: { serviceId }, orderBy: { order: "asc" }, select: { id: true, key: true, order: true } }));
    }
    const served = reads[0];
    if (reads.some((r) => r.map((q) => q.id).join() !== served.map((q) => q.id).join())) {
      throw new Error(`REFUSED: ${label} is not served in a stable order across ${SERVED_READS} reads — there is no order to preserve.`);
    }
    const orders = served.map((q) => q.order);
    const lowest = Math.min(...orders);
    if (orders.filter((o) => o === lowest).length > 1) {
      throw new Error(`REFUSED: ${label} is tied at its STARTING position — which question a customer starts on is ambiguous and needs a person, not a script.`);
    }
    out[label] = { serviceId, served, plan: planFor(served) };
  }
  return out;
}

function print(services: Record<string, ServicePlan>) {
  const labels = Object.keys(services);
  if (labels.length === 0) console.log("  no service has two questions at the same order — nothing to do");
  for (const label of labels) {
    const s = services[label];
    const tiebreak = [...s.served].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    console.log(`  ${label}`);
    console.log(`    served: ${s.served.map((q) => `${q.key}@${q.order}`).join(" → ")}`);
    console.log(`    the id tiebreak alone would serve the same order: ${tiebreak.map((q) => q.id).join() === s.served.map((q) => q.id).join()}`);
    console.log(`    plan (${s.plan.length}): ${s.plan.map((p) => `${p.key} ${p.from}→${p.to}`).join(", ")}`);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const prisma = new PrismaClient();
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
  const APPLY = process.argv.includes("--apply");
  const ROLLBACK = process.argv.includes("--rollback");
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`\nDUPLICATE QUESTION ORDER — ${APPLY ? "APPLY" : ROLLBACK ? "ROLLBACK" : "report only"}  (${host})\n`);

  try {
    if (!APPLY && !ROLLBACK) {
      const services = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return derive(tx);
      }, { timeout: 60_000 });
      print(services);
      const out = arg("capture");
      if (out) {
        const capture: ReleaseCapture = { host, capturedAt: new Date().toISOString(), services };
        writeFileSync(out, JSON.stringify(capture, null, 2));
        console.log(`\n  captured ${Object.keys(services).length} service(s) -> ${out}`);
      }
      return;
    }

    if (process.env.P2B_REPAIR_ALLOWED_HOST !== host) throw new Error(`REFUSED: set P2B_REPAIR_ALLOWED_HOST to this database's host to name it deliberately.`);
    const file = arg("snapshot");
    if (!file) throw new Error("REFUSED: --apply and --rollback need --snapshot <release.json> from --capture.");
    const capture: ReleaseCapture = JSON.parse(readFileSync(file, "utf8"));
    if (capture.host !== host) throw new Error(`REFUSED: the capture was taken on ${capture.host}, not this database.`);

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        const now = await derive(tx);
        if (!same(Object.keys(now).sort(), Object.keys(capture.services).sort())) throw new Error("REFUSED: the set of tied services has changed since the capture.");
        for (const [label, s] of Object.entries(capture.services)) {
          if (!same(now[label], s)) throw new Error(`REFUSED: ${label} no longer matches the capture — served order, positions or plan changed.`);
        }
        let rows = 0;
        for (const s of Object.values(capture.services)) {
          for (const p of s.plan) { await tx.question.update({ where: { id: p.id }, data: { order: p.to } }); rows++; }
        }
        const after = await tx.question.groupBy({ by: ["serviceId", "order"], _count: { _all: true } });
        if (after.some((g) => g._count._all > 1)) throw new Error("ROLLED BACK: ties remain after the plan was applied.");
        for (const [label, s] of Object.entries(capture.services)) {
          const want = s.served.map((q) => q.id).join();
          const legacy = await tx.question.findMany({ where: { serviceId: s.serviceId }, orderBy: { order: "asc" }, select: { id: true } });
          const shared = await tx.question.findMany({ where: { serviceId: s.serviceId }, orderBy: QUESTION_ORDER, select: { id: true } });
          if (legacy.map((q) => q.id).join() !== want || shared.map((q) => q.id).join() !== want) {
            throw new Error(`ROLLED BACK: ${label} would no longer be served in its captured order.`);
          }
        }
        console.log(`  applied ${rows} change(s) across ${Object.keys(capture.services).length} service(s); no ties remain; every repaired service keeps its served order`);
      }, { timeout: 60_000 });
      return;
    }

    await prisma.$transaction(async (tx) => {
      let rows = 0;
      for (const [label, s] of Object.entries(capture.services)) {
        for (const p of s.plan) {
          const q = await tx.question.findUniqueOrThrow({ where: { id: p.id }, select: { order: true } });
          if (q.order !== p.to) throw new Error(`REFUSED: ${label} ${p.key} is at ${q.order}, not the planned ${p.to} — not rolling back over a change nobody captured.`);
          await tx.question.update({ where: { id: p.id }, data: { order: p.from } });
          rows++;
        }
      }
      console.log(`  restored ${rows} captured position(s)`);
    }, { timeout: 60_000 });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("repair-duplicate-question-order.ts")) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exit(1); });
}
