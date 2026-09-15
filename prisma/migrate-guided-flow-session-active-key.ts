/**
 * Backfills `GuidedFlowSession.activeSessionKey` after `db push` has added
 * the column (prisma/schema.prisma) — the second half of the fix for the
 * session-creation race documented in `lib/guidedFlowSession.ts`'s
 * `findOrCreateActiveSession`.
 *
 * `db push` alone is safe to run first: a brand-new nullable column starts
 * NULL on every existing row, and Postgres never treats two NULLs as a
 * unique-constraint collision, so the `@unique` on `activeSessionKey` is
 * satisfiable the instant the column exists. What `db push` cannot do is
 * decide what a PRE-EXISTING row's key should be, or resolve the duplicate
 * ACTIVE rows the race this fix closes may have already produced — that is
 * data migration, not schema migration, and belongs in this script.
 *
 *   npx prisma db push
 *   npx tsx prisma/migrate-guided-flow-session-active-key.ts
 *
 * WHAT THIS DOES, IN ORDER
 *
 *   1. Loads every ACTIVE GuidedFlowSession, grouped by the same
 *      (contractorId, sessionId, serviceId) triple `buildActiveSessionKey`
 *      computes from.
 *   2. For any group with more than one ACTIVE row — the duplicate-session
 *      race, caught live in this task's own rehearsal — keeps the most
 *      recently active one and demotes the rest to ABANDONED. This is a
 *      judgment call, not a neutral one: it means an older duplicate's
 *      answers are discarded in favor of the newer duplicate's, which is
 *      the same "most recent wins" rule `findOrCreateActiveSession` and
 *      `updateSessionAnswers` already apply everywhere else in this system.
 *   3. Backfills `activeSessionKey` on the one surviving ACTIVE row per
 *      triple.
 *
 * Idempotent: a second run finds no duplicate groups and every
 * `activeSessionKey` already set, and reports zero changes.
 *
 * NEVER RUN THIS AGAINST A SHARED OR PRODUCTION DATABASE — see
 * prisma/_assertDisposableLocalDatabase.ts, enforced below, not just
 * stated. This task ran it ONLY against the disposable local rehearsal
 * database; applying the schema change and this backfill to Neon is a
 * separate, later, explicitly-authorized step (production-neon-requires-
 * explicit-approval), not something this script or this task performs.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { assertDisposableLocalDatabase } from "./_assertDisposableLocalDatabase";
import { buildActiveSessionKey } from "../lib/guidedFlowSession";

const prisma = new PrismaClient();

async function main() {
  console.log(`\nMIGRATE — GuidedFlowSession.activeSessionKey backfill\n`);
  await assertDisposableLocalDatabase(prisma);

  const activeSessions = await prisma.guidedFlowSession.findMany({
    where: { status: "ACTIVE" },
    orderBy: { lastActivityAt: "desc" },
    select: {
      id: true,
      contractorId: true,
      sessionId: true,
      serviceId: true,
      lastActivityAt: true,
      activeSessionKey: true,
    },
  });

  const groups = new Map<string, typeof activeSessions>();
  for (const session of activeSessions) {
    const key = buildActiveSessionKey(session);
    const list = groups.get(key);
    if (list) list.push(session);
    else groups.set(key, [session]);
  }

  let abandonedCount = 0;
  let backfilledCount = 0;

  for (const [key, rows] of groups) {
    // `orderBy: { lastActivityAt: "desc" }` above means rows[0] is already
    // the most recently active of the group — the one worth keeping ACTIVE.
    const [winner, ...losers] = rows;

    for (const loser of losers) {
      await prisma.guidedFlowSession.update({
        where: { id: loser.id },
        data: { status: "ABANDONED", version: { increment: 1 } },
      });
      abandonedCount++;
      console.log(`  · duplicate ACTIVE session ${loser.id} (${key}) -> ABANDONED, keeping ${winner.id}`);
    }

    if (winner.activeSessionKey !== key) {
      await prisma.guidedFlowSession.update({
        where: { id: winner.id },
        data: { activeSessionKey: key },
      });
      backfilledCount++;
    }
  }

  console.log(
    `\nDone. ${groups.size} distinct contractor+session+service triple(s) checked, ` +
    `${abandonedCount} duplicate ACTIVE session(s) resolved, ` +
    `${backfilledCount} activeSessionKey value(s) backfilled.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
