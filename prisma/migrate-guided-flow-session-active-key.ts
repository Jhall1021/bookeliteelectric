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
 *   2. A group is BLOCKED — left completely untouched, no row abandoned,
 *      no key backfilled for ANYONE in the group, reported by name for a
 *      human to resolve — the moment either of two things is true of it:
 *      its rows carry genuinely DIFFERENT `consumedAnswers`, or ANY row in
 *      it (not just whichever one recency would pick as the loser) still
 *      has a live `DeviceHandoff` or a `PENDING` `GuidedFlowVisualAssistTask`
 *      pointing at it. See WHY A GROUP IS BLOCKED, WHOLE, below for both.
 *   3. For a group with NEITHER condition — every row agrees on answers
 *      and none has a live dependent — the row already carrying the
 *      correct `activeSessionKey`, if one exists (see EXISTING-KEY
 *      SAFETY below), or otherwise the most recently active row, is kept;
 *      every other row is demoted to ABANDONED.
 *   4. Backfills `activeSessionKey` on the one surviving ACTIVE row per
 *      resolved triple.
 *
 * WHY A GROUP IS BLOCKED, WHOLE — not just the one row that looks unsafe.
 *
 * "Keep one, discard the rest" is correct only when EVERY row being
 * discarded is genuinely dead — nobody is still looking at any of them.
 * Two things say that is not true of the group, and neither is checked by
 * comparing `lastActivityAt`:
 *
 *   DIFFERENT `consumedAnswers` across the group's rows — this script has
 *   no product answer for which one is correct, and choosing "most
 *   recent" and calling that a resolution discards real customer progress
 *   under the appearance of a repair;
 *
 *   a LIVE DeviceHandoff (status AVAILABLE and not yet past its own
 *   `expiresAt`, or CONNECTED) or a PENDING GuidedFlowVisualAssistTask on
 *   ANY row in the group — a second device may be mid-handoff onto
 *   whichever row carries it right now, or a photo/scan result may still
 *   be inbound for it, regardless of whether that row would have been the
 *   "winner" or a "loser" under the recency rule.
 *
 * AN EARLIER VERSION OF THIS SCRIPT ONLY PROTECTED THE ONE ROW, NOT THE
 * GROUP. It resolved the rest of a group normally — abandoning other,
 * genuinely safe-looking losers and backfilling the winner's key — even
 * though one row in that same group still had a live handoff or task,
 * and it reported the run as having succeeded (exit code 0) with the one
 * row merely "left ACTIVE" as a footnote. A migration is not done while
 * any row in a group is still live; resolving the rest of the group around
 * it is a partial change to a group this script cannot fully account for,
 * dressed up as progress. Neither condition is decided by this script — it
 * has no product answer for "which of several genuinely live or
 * disagreeing sessions should win", and inventing one here would be
 * exactly the silent product decision this codebase's own conventions
 * (see e.g. `lib/electrical/materialTakeoff.ts`'s refusal-over-guessing
 * idiom) exist to prevent. The whole group is left exactly as found, and
 * the script's own exit code says so — see EXIT CODE below.
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
 * EXIT CODE. Exits 1 — not 0 — whenever any group was left blocked. A
 * migration with human-review groups outstanding is not a completed
 * migration, and a caller checking only the exit code (a script, a CI
 * step, an operator who does not read the log) must be able to tell the
 * difference between "fully resolved" and "resolved everything it safely
 * could, N groups still need you." Zero is reserved for the case where
 * every group was either already fine or safely resolved.
 *
 * Idempotent: a second run finds no duplicate groups and every
 * `activeSessionKey` already set, and reports zero changes and exits 0 —
 * except any BLOCKED group, which is reported again, unchanged, and exits
 * 1 again, until a human resolves it. That repetition is intended, not a
 * bug.
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
   * The winner for a group with neither blocking condition: a row that
   * ALREADY carries the correct key (a real application-created row) if one
   * exists, otherwise the most recently active row (`rows[0]`, per the
   * query's own `orderBy`). See EXISTING-KEY SAFETY for why recency alone
   * is not enough.
   */
  const winnerOf = (key: string, rows: typeof activeSessions) =>
    rows.find((r) => r.activeSessionKey === key) ?? rows[0];

  // Every row in every multi-row group, checked for live dependents in ONE
  // pass rather than one query per row — this table can carry thousands of
  // sessions in a real production backfill. EVERY row, not just whichever
  // one recency would pick as a loser: a live dependent on the row recency
  // would have picked as WINNER blocks the group exactly as much as one on
  // a loser, and only checking losers is how the earlier version of this
  // script missed that case entirely.
  const allGroupRowIds = [...groups.values()].filter((rows) => rows.length > 1).flatMap((rows) => rows.map((r) => r.id));

  const now = new Date();
  const liveHandoffs = allGroupRowIds.length === 0 ? [] : await prisma.deviceHandoff.findMany({
    where: {
      guidedFlowSessionId: { in: allGroupRowIds },
      OR: [
        { status: "CONNECTED" },
        { status: "AVAILABLE", expiresAt: { gt: now } },
      ],
    },
    select: { guidedFlowSessionId: true, id: true, status: true },
  });
  const pendingTasks = allGroupRowIds.length === 0 ? [] : await prisma.guidedFlowVisualAssistTask.findMany({
    where: { guidedFlowSessionId: { in: allGroupRowIds }, status: "PENDING" },
    select: { guidedFlowSessionId: true, id: true, taskType: true },
  });
  const liveDependentReason = new Map<string, string>();
  for (const h of liveHandoffs) {
    liveDependentReason.set(h.guidedFlowSessionId,
      `a ${h.status} DeviceHandoff (${h.id}) still points at it — a second device may be mid-handoff onto this exact session right now`);
  }
  for (const t of pendingTasks) {
    if (liveDependentReason.has(t.guidedFlowSessionId)) continue; // one reason is enough to report
    liveDependentReason.set(t.guidedFlowSessionId,
      `a PENDING GuidedFlowVisualAssistTask (${t.id}, ${t.taskType}) is still waiting on it`);
  }

  let abandonedCount = 0;
  let backfilledCount = 0;
  let blockedGroupCount = 0;

  for (const [key, rows] of groups) {
    if (rows.length > 1) {
      // A group is BLOCKED — as a whole, not row by row — the moment either
      // condition is true of ANY row in it. Checked across every row, not
      // just loser-vs-recency-winner: recency says nothing about which
      // answers are correct, and a live dependent on the row recency would
      // have picked as winner is just as blocking as one on a loser.
      const distinctAnswers = new Set(rows.map((r) => JSON.stringify(r.consumedAnswers)));
      const liveRows = rows.filter((r) => liveDependentReason.has(r.id));
      if (distinctAnswers.size > 1 || liveRows.length > 0) {
        blockedGroupCount++;
        const reasons = [
          ...(distinctAnswers.size > 1 ? [`${rows.length} ACTIVE rows carry DIFFERENT answers`] : []),
          ...liveRows.map((r) => `${r.id} still has ${liveDependentReason.get(r.id)}`),
        ];
        console.log(`  ⚠ BLOCKED group (${key}) — left completely untouched; no row abandoned, no key backfilled, for anyone in this group:`);
        for (const reason of reasons) console.log(`      - ${reason}`);
        for (const r of rows) console.log(`      ${r.id} (lastActivityAt ${r.lastActivityAt.toISOString()}): ${JSON.stringify(r.consumedAnswers)}`);
        continue; // the whole group, not just the row(s) that triggered it
      }
    }

    // Neither blocking condition holds: every row agrees on answers and
    // none has a live dependent. Safe to resolve normally.
    const winner = winnerOf(key, rows);
    const losers = rows.filter((r) => r.id !== winner.id);

    for (const loser of losers) {
      // The real application function, not a hand-rolled update — it always
      // nulls activeSessionKey, which is what makes the backfill below safe
      // regardless of which row this loser turns out to be.
      await abandonSession(prisma, loser.id);
      abandonedCount++;
      console.log(`  · duplicate ACTIVE session ${loser.id} (${key}) -> ABANDONED, keeping ${winner.id} (identical answers, no live dependents)`);
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
    `${blockedGroupCount} group(s) left entirely untouched and BLOCKED (see "⚠" lines above — these need a human decision), ` +
    `${backfilledCount} activeSessionKey value(s) backfilled.\n`
  );

  if (blockedGroupCount > 0) {
    console.log(
      `  INCOMPLETE: ${blockedGroupCount} group(s) still need a human decision before this migration is done.\n` +
      `  Re-running this script will report them again, unchanged, until a human resolves the\n` +
      `  handoff, the pending task, or the answer disagreement explicitly. Exiting 1, not 0 —\n` +
      `  this run did everything it safely could, but it is not a completed migration.\n`
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
