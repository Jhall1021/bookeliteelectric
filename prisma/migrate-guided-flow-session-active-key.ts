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
 *      recently active one and demotes the rest to ABANDONED, UNLESS a
 *      loser is unsafe to touch automatically (see below), in which case
 *      that one loser is left exactly as it is and reported by name. This
 *      is a judgment call, not a neutral one, on every loser it DOES
 *      abandon: it means an older duplicate's answers are discarded in
 *      favor of the newer duplicate's, which is the same "most recent
 *      wins" rule `findOrCreateActiveSession` and `updateSessionAnswers`
 *      already apply everywhere else in this system.
 *   3. Backfills `activeSessionKey` on the one surviving ACTIVE row per
 *      triple.
 *
 * A LOSER IS UNSAFE TO ABANDON AUTOMATICALLY WHEN IT IS NOT MERELY STALE.
 *
 * "Keep the most recent, discard the rest" is correct for a loser that is
 * genuinely dead — nobody is still looking at it. Two things say a loser is
 * NOT dead, and neither is checked by simply comparing `lastActivityAt`:
 *
 *   a LIVE DeviceHandoff (status AVAILABLE and not yet past its own
 *   `expiresAt`, or CONNECTED) pointing at the loser — a second device may
 *   be mid-handoff onto this exact session right now, and abandoning it out
 *   from under that handoff breaks the join for whoever is holding the
 *   token, silently;
 *
 *   a PENDING GuidedFlowVisualAssistTask on the loser — a photo/scan task
 *   this session is still waiting on; abandoning the session does not
 *   cancel the task, so a result that lands after the abandonment would
 *   write into a session nobody is reading from any more.
 *
 * Neither condition is decided by this script — it has no product answer
 * for "which of two genuinely concurrent, still-live sessions should win",
 * and inventing one here would be exactly the silent product decision this
 * codebase's own conventions (see e.g. `lib/electrical/materialTakeoff.ts`'s
 * refusal-over-guessing idiom) exist to prevent. A loser meeting either
 * condition is left untouched and reported by id and reason, for a human to
 * resolve; every other loser in the same group is still processed normally.
 *
 * ANSWER DIVERGENCE IS ALWAYS REPORTED, NEVER MERGED. There is no merge
 * semantics anywhere in this codebase for two independently-progressed
 * `consumedAnswers` payloads — "most recent wins" replaces, it does not
 * combine. So every abandoned loser whose `consumedAnswers` differs from
 * the winner's is named explicitly, with both payloads printed, rather than
 * silently discarded — visible to whoever reviews this migration's output,
 * even though nothing here decides what to do about it.
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
      consumedAnswers: true,
    },
  });

  const groups = new Map<string, typeof activeSessions>();
  for (const session of activeSessions) {
    const key = buildActiveSessionKey(session);
    const list = groups.get(key);
    if (list) list.push(session);
    else groups.set(key, [session]);
  }

  // Every loser across every group, checked for live dependents in ONE pass
  // rather than one query per row — this table can carry thousands of
  // sessions in a real production backfill.
  const allLoserIds = [...groups.values()].flatMap(([, ...losers]) => losers.map((l) => l.id));

  const now = new Date();
  const liveHandoffs = allLoserIds.length === 0 ? [] : await prisma.deviceHandoff.findMany({
    where: {
      guidedFlowSessionId: { in: allLoserIds },
      OR: [
        { status: "CONNECTED" },
        { status: "AVAILABLE", expiresAt: { gt: now } },
      ],
    },
    select: { guidedFlowSessionId: true, id: true, status: true },
  });
  const pendingTasks = allLoserIds.length === 0 ? [] : await prisma.guidedFlowVisualAssistTask.findMany({
    where: { guidedFlowSessionId: { in: allLoserIds }, status: "PENDING" },
    select: { guidedFlowSessionId: true, id: true, taskType: true },
  });
  const unsafeReason = new Map<string, string>();
  for (const h of liveHandoffs) {
    unsafeReason.set(h.guidedFlowSessionId,
      `a ${h.status} DeviceHandoff (${h.id}) still points at it — a second device may be mid-handoff onto this exact session right now`);
  }
  for (const t of pendingTasks) {
    if (unsafeReason.has(t.guidedFlowSessionId)) continue; // one reason is enough to report
    unsafeReason.set(t.guidedFlowSessionId,
      `a PENDING GuidedFlowVisualAssistTask (${t.id}, ${t.taskType}) is still waiting on it`);
  }

  let abandonedCount = 0;
  let backfilledCount = 0;
  let skippedUnsafeCount = 0;
  let divergentAnswersCount = 0;

  for (const [key, rows] of groups) {
    // `orderBy: { lastActivityAt: "desc" }` above means rows[0] is already
    // the most recently active of the group — the one worth keeping ACTIVE.
    const [winner, ...losers] = rows;

    for (const loser of losers) {
      const unsafe = unsafeReason.get(loser.id);
      if (unsafe) {
        skippedUnsafeCount++;
        console.log(`  ! duplicate ACTIVE session ${loser.id} (${key}) LEFT AS ACTIVE — unsafe to abandon automatically: ${unsafe}`);
        continue;
      }

      const answersDiffer = JSON.stringify(loser.consumedAnswers) !== JSON.stringify(winner.consumedAnswers);
      if (answersDiffer) {
        divergentAnswersCount++;
        console.log(`  ⚠ duplicate ACTIVE session ${loser.id} (${key}) carries DIFFERENT answers than the surviving ${winner.id} — discarded, not merged (no merge semantics exist for this):`);
        console.log(`      kept    (${winner.id}): ${JSON.stringify(winner.consumedAnswers)}`);
        console.log(`      discarded (${loser.id}): ${JSON.stringify(loser.consumedAnswers)}`);
      }

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
    `${skippedUnsafeCount} left ACTIVE as unsafe to touch automatically (see "!" lines above — these need a human decision), ` +
    `${divergentAnswersCount} of the resolved ones discarded genuinely different answers (see "⚠" lines above), ` +
    `${backfilledCount} activeSessionKey value(s) backfilled.\n`
  );

  if (skippedUnsafeCount > 0) {
    console.log(
      `  NOT idempotent-clean: ${skippedUnsafeCount} session(s) remain ACTIVE duplicates on purpose.\n` +
      `  Re-running this script will report them again until a human resolves the handoff/task\n` +
      `  and abandons or replaces the loser explicitly. This is the intended behavior, not a bug.\n`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
