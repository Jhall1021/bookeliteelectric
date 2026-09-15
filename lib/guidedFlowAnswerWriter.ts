import {
  reconcileGuidedFlowAnswers,
  type GuidedFlowAnswerMap,
} from "./guidedFlowAnswerReconcile";
import {
  persistGuidedFlowAnswers,
  type GuidedFlowFetch,
  type GuidedFlowPersistResult,
  type GuidedFlowSessionRef,
} from "./guidedFlowSessionClient";

export type GuidedFlowQueuedWrite = {
  /** Local answer snapshot BEFORE the homeowner made this edit. */
  localBaseAnswers: GuidedFlowAnswerMap;
  /** Local answer snapshot AFTER the homeowner made this edit. */
  attemptedAnswers: GuidedFlowAnswerMap;
};

/**
 * Serializes Guided Flow answer persistence without letting queued full
 * snapshots erase newer canonical answers.
 *
 * Every enqueue names the local before/after snapshots. When that write reaches
 * the front of the queue, those local edits are first three-way reconciled
 * against whatever canonical server state the PREVIOUS queued write actually
 * established. This matters when the homeowner answers two questions quickly:
 * the second attempted snapshot was created before the first network request
 * necessarily finished, so sending it verbatim would reintroduce stale-state
 * overwrite risk even though the HTTP calls themselves were serialized.
 *
 * Same-key conflicts stop and return the canonical server snapshot. Disjoint
 * edits are carried forward. The lower-level client remains responsible for a
 * real server 409 race that happens after this preflight reconciliation.
 */
export class GuidedFlowAnswerWriter {
  private session: GuidedFlowSessionRef;
  private canonicalAnswers: GuidedFlowAnswerMap;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly fetchFn: GuidedFlowFetch,
    session: GuidedFlowSessionRef,
    canonicalAnswers: GuidedFlowAnswerMap
  ) {
    this.session = { ...session };
    this.canonicalAnswers = { ...canonicalAnswers };
  }

  snapshot(): { session: GuidedFlowSessionRef; canonicalAnswers: GuidedFlowAnswerMap } {
    return {
      session: { ...this.session },
      canonicalAnswers: { ...this.canonicalAnswers },
    };
  }

  /**
   * Queue one explicit homeowner answer against the canonical snapshot known at
   * the moment of the click.
   *
   * Callers intentionally do NOT pass their full rendered answer map here.
   * That map may contain history snapshots, unpersisted reroute carry-over, or
   * another local answer whose request is still ahead of this one in the queue.
   * Capturing only this explicit key/value edit lets enqueue() reconcile it
   * against the canonical state established by earlier queued writes.
   */
  enqueueAnswerEdit(questionKey: string, value: string): Promise<GuidedFlowPersistResult> {
    const base = this.snapshot().canonicalAnswers;
    return this.enqueue({
      localBaseAnswers: base,
      attemptedAnswers: { ...base, [questionKey]: value },
    });
  }

  /**
   * Queue a whole local snapshot as intentional input relative to the current
   * canonical server snapshot.
   *
   * This is for bounded bootstrap cases such as reroute carry-over, where a
   * target service begins with answers the customer already supplied to the
   * immediately preceding service. Ordinary question clicks should use
   * enqueueAnswerEdit() so they never resend incidental UI history.
   */
  enqueueSnapshotIntent(answers: GuidedFlowAnswerMap): Promise<GuidedFlowPersistResult> {
    const base = this.snapshot().canonicalAnswers;
    return this.enqueue({
      localBaseAnswers: base,
      attemptedAnswers: { ...base, ...answers },
    });
  }

  enqueue(write: GuidedFlowQueuedWrite): Promise<GuidedFlowPersistResult> {
    const run = this.tail.then(async () => {
      const preflight = reconcileGuidedFlowAnswers(
        write.localBaseAnswers,
        write.attemptedAnswers,
        this.canonicalAnswers
      );

      if (preflight.kind === "CONFLICT") {
        return {
          session: { ...this.session },
          answers: { ...this.canonicalAnswers },
          canonicalAnswers: { ...this.canonicalAnswers },
          conflictKeys: preflight.conflictKeys,
          pendingLocalChanges: false,
          persisted: false,
        } satisfies GuidedFlowPersistResult;
      }

      const result = await persistGuidedFlowAnswers(
        this.fetchFn,
        this.session,
        this.canonicalAnswers,
        preflight.answers
      );

      this.session = { ...result.session };
      this.canonicalAnswers = { ...result.canonicalAnswers };
      return result;
    });

    // Keep the internal queue alive even if this caller sees a network error.
    this.tail = run.catch(() => undefined);
    return run;
  }
}
