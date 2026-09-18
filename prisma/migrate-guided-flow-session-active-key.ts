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
 *   (2) abandoning a loser did not clear its `activeSessionKey`. If the row
 *   demoted to loser happened to be the one already holding the correct
 *   key, its key stayed attached to a now-ABANDONED row, and the very next
 *   line — backfilling the winner with that identical key — hit the
 *   `@unique` constraint and crashed with an unhandled `P2002`, ending the
 *   whole run and leaving every group processed before it migrated and
 *   every group after it untouched: a partially completed migration, not a
 *   failed one. Every abandon below explicitly writes `activeSessionKey:
 *   null` in the same statement — matching what `lib/guidedFlowSession.ts`'s
 *   own `abandonSession` always does, though this script writes it directly
 *   rather than calling that function, because the version-conditional
 *   `updateMany` below (see PER-GROUP ATOMICITY below) needs its own
 *   `where` clause that `abandonSession`'s signature does not expose — so no
 *   collision is possible regardless of which row is chosen as the loser.
 *
 * PER-GROUP ATOMICITY AND CONCURRENT-ACTIVITY SAFETY.
 *
 * A group's resolution used to be several separate statements: one
 * `abandonSession` call per loser, then a separate `update` for the
 * winner's key. Two ways that was still unsafe, neither exercised by an
 * earlier rehearsal that only checked the OUTCOME of a clean run:
 *
 *   A MID-RUN ERROR (a dropped connection, the process killed) between two
 *   of those statements left the group HALF migrated — some losers
 *   abandoned, the winner never keyed, or vice versa — a state this script
 *   had not written a group into before and would not necessarily recover
 *   from cleanly on retry.
 *
 *   CONCURRENT ACTIVITY — a customer's own browser is still allowed to
 *   write to any of these rows for the entire time this script is
 *   deciding what to do with them. Every row was read once, at the top of
 *   this run; if a real request updates a loser's answers (or the
 *   winner's) between that read and this script's write, abandoning the
 *   loser or repointing the winner would act on a decision made from data
 *   that is no longer current — discarding a real, later answer nobody
 *   ever saw when this script made its decision.
 *
 * Fixed with the same optimistic-concurrency field
 * `lib/guidedFlowSession.ts`'s own `updateSessionAnswers` already uses:
 * every write in a group's resolution is conditioned on the row's
 * `version` still matching what this script read at the very top of the
 * run, and the whole group's resolution — every loser's abandon and the
 * winner's key backfill together — runs inside ONE `prisma.$transaction`.
 * If any row's version has moved, that write's `updateMany` matches zero
 * rows, the transaction throws and rolls back EVERYTHING for that group —
 * no loser abandoned, no key backfilled, exactly as if the group had never
 * been touched — and the group is reported as skipped for concurrent
 * activity rather than silently resolved from stale data. Other groups in
 * the same run are unaffected; each group's transaction is independent.
 *
 * THE WINNER IS RECHECKED UNCONDITIONALLY, NOT ONLY WHEN ITS KEY CHANGES.
 * The first version of this fix only guarded the winner's version inside
 * `if (winner.activeSessionKey !== key)` — so a winner that already
 * carried the correct key (the common case: a row the real application
 * code already created and keyed properly) was NEVER reverified before
 * this transaction abandoned its losers. Two concurrent changes to that
 * winner would have gone undetected: its `consumedAnswers` moving (a real
 * customer answering another question, making the "all rows agree"
 * decision this group was resolved under stale) and the winner
 * COMPLETING (`completeSession` nulls `activeSessionKey` and sets
 * `status: "COMPLETED"` the instant a real booking lands, so a winner that
 * finished between the read and this transaction is no longer even
 * ACTIVE — abandoning its losers to make room for an already-finished
 * session is backwards). The winner's guard is now unconditional: this
 * transaction always writes `activeSessionKey: key` to it (a no-op value
 * when already correct) gated on `status: "ACTIVE"` and the exact
 * `version` this run read, so either kind of concurrent change moves the
 * version or the status and aborts the whole group before any loser is
 * touched — checked FIRST, before any loser's own guard runs. The WRITE is
 * unconditional; the VERSION INCREMENT it carries is not — see NOT
 * WRITE-FREE, JUST REPEATABLE below.
 *
 * EXIT CODE. Exits 1 — not 0 — whenever any group was left blocked OR
 * skipped for concurrent activity. A migration with outstanding groups is
 * not a completed migration, and a caller checking only the exit code (a
 * script, a CI step, an operator who does not read the log) must be able
 * to tell the difference between "fully resolved" and "resolved everything
 * it safely could, N groups still need you." Zero is reserved for the case
 * where every group was either already fine or safely resolved.
 *
 * NOT WRITE-FREE, JUST REPEATABLE. A second run finds no duplicate groups
 * and every `activeSessionKey` already set, and reports zero changes
 * (`abandonedCount`/`backfilledCount` both stay 0) and exits 0 — except any
 * BLOCKED group, which is reported again, unchanged, and exits 1 again,
 * until a human resolves it. That repetition is intended, not a bug. But
 * "reports zero changes" is not the same claim as "writes nothing": every
 * already-correctly-keyed winner still has its `updateMany` issued on every
 * rerun — that write is what the unconditional recheck above actually is.
 * `version` itself is only incremented when the key needed to move, so a
 * rerun that changes nothing observable also leaves every winner's
 * `version` untouched — an earlier version of this fix incremented it
 * unconditionally too, which would have meant a live customer's own
 * in-flight `updateSessionAnswers`/`completeSession` call could fail with
 * `STALE_VERSION` for no reason connected to their own session, purely
 * because this script happened to run in between. That could never lose
 * data — `updateSessionAnswers`'s own contract already treats
 * `STALE_VERSION` as "reload and reapply," never a silent overwrite — but
 * it was still an avoidable side effect, not a real cost of the guard.
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

/** Thrown inside a group's transaction when a row's version has moved since this run read it — never caught anywhere but the one place that reports it and lets the transaction roll back. */
class ConcurrentActivityError extends Error {
  constructor(public readonly sessionId: string) { super(`row ${sessionId} changed concurrently`); }
}

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
      version: true,
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
  let concurrentActivityCount = 0;

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
        for (const r of rows) console.log(`      ${r.id} (lastActivityAt ${r.lastActivityAt.toISOString()})`);
        continue; // the whole group, not just the row(s) that triggered it
      }
    }

    // Neither blocking condition holds: every row agrees on answers and
    // none has a live dependent. Safe to resolve normally — but every write
    // is conditioned on the version this run read at the top, and the whole
    // group's resolution is one transaction. See PER-GROUP ATOMICITY AND
    // CONCURRENT-ACTIVITY SAFETY above.
    const winner = winnerOf(key, rows);
    const losers = rows.filter((r) => r.id !== winner.id);

    try {
      await prisma.$transaction(async (tx) => {
        // THE WINNER IS RECHECKED FIRST, UNCONDITIONALLY — even when it
        // already carries the correct key and this write changes nothing
        // about it. An earlier version only guarded the winner's version
        // INSIDE the `if (winner.activeSessionKey !== key)` branch — so a
        // winner that already had the right key (the common,
        // already-keyed-by-real-application-code case) was NEVER
        // reverified before this transaction abandoned its losers. Two
        // ways that was wrong, neither hypothetical:
        //
        //   the winner's `consumedAnswers` changed concurrently (a real
        //   customer answering another question) between this run's read
        //   and this transaction — the "all rows agree" decision this
        //   group was resolved under is now stale, and abandoning losers
        //   on the strength of it discards real progress nobody re-checked;
        //
        //   the winner COMPLETED concurrently — `completeSession` sets
        //   `status: "COMPLETED"` and nulls `activeSessionKey` the instant
        //   a real booking lands. A winner that finished between the read
        //   and this transaction is no longer even ACTIVE, and abandoning
        //   its losers to make room for a session that is already over is
        //   exactly backwards.
        //
        // The guard below always issues this `updateMany`, gated on
        // `status: "ACTIVE"` and the exact `version` this run read — an
        // UPDATE statement takes a row lock for the rest of this
        // transaction regardless of whether the values it writes actually
        // differ from what is already there, so this is what makes EITHER
        // concurrent change — an answer update or a completion — move the
        // version or the status and make this updateMany match zero rows,
        // aborting the whole group before any loser is touched.
        //
        // `version` itself is only incremented when the key actually needs
        // to change. An earlier version of this fix always incremented it,
        // even for the common case of a winner that already carried the
        // correct key — meaning every rerun of this script bumped every
        // already-correct winner's version for no reason a caller of
        // `updateSessionAnswers`/`completeSession` could see, purely as a
        // side effect of this script re-verifying it. That is not what
        // "idempotent" should mean: bumping a real optimistic-concurrency
        // counter is a genuine write, and this script's own re-verification
        // is not a reason to make a live customer's next in-flight save use
        // a version they can no longer match. The guard's WHERE clause and
        // its row lock are unconditional either way — only the increment is
        // conditional on the key needing to move.
        const winnerNeedsKey = winner.activeSessionKey !== key;
        const winnerResult = await tx.guidedFlowSession.updateMany({
          where: { id: winner.id, status: "ACTIVE", version: winner.version },
          data: winnerNeedsKey ? { activeSessionKey: key, version: { increment: 1 } } : { activeSessionKey: key },
        });
        if (winnerResult.count !== 1) throw new ConcurrentActivityError(winner.id);

        for (const loser of losers) {
          const result = await tx.guidedFlowSession.updateMany({
            where: { id: loser.id, status: "ACTIVE", version: loser.version },
            data: { status: "ABANDONED", activeSessionKey: null, version: { increment: 1 } },
          });
          if (result.count !== 1) throw new ConcurrentActivityError(loser.id);
        }
      });
    } catch (e) {
      if (e instanceof ConcurrentActivityError) {
        concurrentActivityCount++;
        console.log(`  ⚠ SKIPPED group (${key}) — ${e.sessionId} changed concurrently since this run read it. ` +
          `The whole group's transaction rolled back; nothing in it was touched. Re-run to pick up its current state.`);
        continue;
      }
      throw e;
    }

    for (const loser of losers) {
      abandonedCount++;
      console.log(`  · duplicate ACTIVE session ${loser.id} (${key}) -> ABANDONED, keeping ${winner.id} (identical answers, no live dependents)`);
    }
    if (winner.activeSessionKey !== key) backfilledCount++;
  }

  console.log(
    `\nDone. ${groups.size} distinct contractor+session+service triple(s) checked, ` +
    `${abandonedCount} duplicate ACTIVE session(s) resolved, ` +
    `${blockedGroupCount} group(s) left entirely untouched and BLOCKED (see "⚠" lines above — these need a human decision), ` +
    `${concurrentActivityCount} group(s) skipped for concurrent activity (see "⚠" lines above — re-run to retry), ` +
    `${backfilledCount} activeSessionKey value(s) backfilled.\n`
  );

  if (blockedGroupCount > 0 || concurrentActivityCount > 0) {
    console.log(
      `  INCOMPLETE: ${blockedGroupCount + concurrentActivityCount} group(s) still need attention before this\n` +
      `  migration is done. Re-running this script will retry the concurrent-activity group(s)\n` +
      `  automatically and report the blocked group(s) again, unchanged, until a human resolves\n` +
      `  the handoff, the pending task, or the answer disagreement explicitly. Exiting 1, not 0 —\n` +
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
