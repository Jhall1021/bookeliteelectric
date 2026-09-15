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
 *   2. A group whose rows carry genuinely DIFFERENT `consumedAnswers` is
 *      AMBIGUOUS and is left completely untouched — no row abandoned, no
 *      key backfilled for anyone in it — reported by name for a human to
 *      resolve. This script has no product answer for which of two
 *      divergent customer answer sets is correct, and picking "most
 *      recent" and calling that a resolution would be discarding real
 *      customer progress under the appearance of a repair.
 *   3. For a group whose rows all carry IDENTICAL answers — a true
 *      duplicate, not a disagreement — the row already carrying the
 *      correct `activeSessionKey`, if one exists (see EXISTING-KEY
 *      SAFETY below), or otherwise the most recently active row, is kept;
 *      every other row is demoted to ABANDONED, UNLESS a given loser is
 *      unsafe to touch automatically (see below), in which case that one
 *      loser is left exactly as it is and reported by name.
 *   4. Backfills `activeSessionKey` on the one surviving ACTIVE row per
 *      resolved triple.
 *
 * A LOSER IS UNSAFE TO ABANDON AUTOMATICALLY WHEN IT IS NOT MERELY STALE.
 *
 * "Keep one, discard the rest" is correct for a loser that is genuinely
 * dead — nobody is still looking at it. Two things say a loser is NOT dead,
 * and neither is checked by simply comparing `lastActivityAt`:
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
 * EXISTING-KEY SAFETY — the crash this script could previously cause.
 *
 * A row created by the REAL application code (`findOrCreateActiveSession`,
 * post-fix) already carries the correct `activeSessionKey`. If such a row
 * ends up grouped with an older, still-unmigrated legacy duplicate (its key
 * still `null` — entirely possible if the schema change and app deploy land
 * before this backfill runs), two things went wrong in the version of this
 * script written for §0.22's rehearsal, which only ever tested an empty
 * table and never surfaced either:
 *
 *   (1) the winner was chosen by `lastActivityAt` alone, which could pick
 *   the legacy null-keyed row over the one the real application code
 *   already correctly identified as active — so this script now prefers a
 *   row that ALREADY carries the correct key, falling back to recency only
 *   when no row in the group has one yet;
 *
 *   (2) abandoning a loser did not clear its `activeSessionKey` — but
 *   `lib/guidedFlowSession.ts`'s own `abandonSession` always does exactly
 *   that, and this script did not reuse it. If the row demoted to loser
 *   happened to be the one already holding the correct key, its key stayed
 *   attached to a now-ABANDONED row, and the very next line — backfilling
 *   the winner with that identical key — hit the `@unique` constraint and
 *   crashed with an unhandled `P2002`, ending the whole run and leaving
 *   every group processed before it migrated and every group after it
 *   untouched: a partially completed migration, not a failed one. This
 *   script now calls the real `abandonSession` for every loser it
 *   abandons, which always nulls the key first, so no collision is
 *   possible regardless of which row is chosen as the loser.
 *
 * ANSWER DIVERGENCE, WHEN A GROUP IS OTHERWISE RESOLVED. Even within a
 * group whose rows all match, there is no merge semantics anywhere in this
 * codebase for two independently-progressed `consumedAnswers` payloads —
 * moot for a truly identical group, but recorded here because the
 * divergent case is handled entirely by step 2 above, never by resolving
 * and merely logging the difference.
 *
 * Idempotent: a second run finds no duplicate groups and every
 * `activeSessionKey` already set, and reports zero changes — except any
 * AMBIGUOUS or UNSAFE group, which is reported again, unchanged, until a
 * human resolves it. That repetition is intended, not a bug.
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
import { buildActiveSessionKey, abandonSession } from "../lib/guidedFlowSession";

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

  /**
   * The winner for a group whose rows all agree on answers: a row that
   * ALREADY carries the correct key (a real application-created row) if one
   * exists, otherwise the most recently active row (`rows[0]`, per the
   * query's own `orderBy`). Computed once and reused by both the loser
   * precomputation below and the resolution loop, so the two can never
   * disagree about who the winner is — that disagreement is exactly how the
   * existing-key crash happened before.
   */
  const winnerOf = (key: string, rows: typeof activeSessions) =>
    rows.find((r) => r.activeSessionKey === key) ?? rows[0];

  // Every loser across every non-ambiguous group, checked for live
  // dependents in ONE pass rather than one query per row — this table can
  // carry thousands of sessions in a real production backfill. An AMBIGUOUS
  // group (rows disagree on answers) contributes no losers at all: every row
  // in it stays exactly as found.
  const allLoserIds = [...groups.entries()].flatMap(([key, rows]) => {
    if (rows.length > 1 && new Set(rows.map((r) => JSON.stringify(r.consumedAnswers))).size > 1) return [];
    const winner = winnerOf(key, rows);
    return rows.filter((r) => r.id !== winner.id).map((r) => r.id);
  });

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
  let ambiguousGroupCount = 0;

  for (const [key, rows] of groups) {
    if (rows.length > 1) {
      // A group is AMBIGUOUS the moment any two rows disagree on answers —
      // checked across every pair, not just loser-vs-recency-winner, because
      // recency says nothing about which answers are correct.
      const distinctAnswers = new Set(rows.map((r) => JSON.stringify(r.consumedAnswers)));
      if (distinctAnswers.size > 1) {
        ambiguousGroupCount++;
        console.log(`  ⚠ AMBIGUOUS group (${key}) — ${rows.length} ACTIVE rows carry DIFFERENT answers. ` +
          `Left completely untouched; no row abandoned, no key backfilled, for anyone in this group:`);
        for (const r of rows) console.log(`      ${r.id} (lastActivityAt ${r.lastActivityAt.toISOString()}): ${JSON.stringify(r.consumedAnswers)}`);
        continue; // the whole group, not just one row
      }
    }

    // All rows in this group carry identical answers (or there is only
    // one row). Same winner rule the precomputation above already used —
    // see EXISTING-KEY SAFETY for why recency alone is not enough.
    const winner = winnerOf(key, rows);
    const losers = rows.filter((r) => r.id !== winner.id);

    for (const loser of losers) {
      const unsafe = unsafeReason.get(loser.id);
      if (unsafe) {
        skippedUnsafeCount++;
        console.log(`  ! duplicate ACTIVE session ${loser.id} (${key}) LEFT AS ACTIVE — unsafe to abandon automatically: ${unsafe}`);
        continue;
      }

      // The real application function, not a hand-rolled update — it always
      // nulls activeSessionKey, which is what makes the backfill below safe
      // regardless of which row this loser turns out to be.
      await abandonSession(prisma, loser.id);
      abandonedCount++;
      console.log(`  · duplicate ACTIVE session ${loser.id} (${key}) -> ABANDONED, keeping ${winner.id} (identical answers)`);
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
    `${ambiguousGroupCount} group(s) left entirely untouched as ambiguous (see "⚠" lines above — these need a human decision), ` +
    `${backfilledCount} activeSessionKey value(s) backfilled.\n`
  );

  if (skippedUnsafeCount > 0 || ambiguousGroupCount > 0) {
    console.log(
      `  NOT idempotent-clean: ${skippedUnsafeCount + ambiguousGroupCount} group(s)/session(s) remain ACTIVE duplicates on purpose.\n` +
      `  Re-running this script will report them again until a human resolves the handoff, the\n` +
      `  pending task, or the answer disagreement explicitly. This is the intended behavior, not a bug.\n`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
