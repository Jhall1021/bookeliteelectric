import {
  reconcileGuidedFlowAnswerConflict,
  type GuidedFlowAnswerConflict,
  type GuidedFlowAnswerMap,
} from "./guidedFlowAnswerConflict";

export type GuidedFlowSessionRef = {
  id: string;
  version: number;
};

export type GuidedFlowPersistResult = {
  session: GuidedFlowSessionRef;
  /** Canonical server answers, plus any still-safe local edits not yet persisted. */
  answers: GuidedFlowAnswerMap;
  conflicts: GuidedFlowAnswerConflict[];
  /** True only when `answers` still contains a safe local edit the server has not accepted yet. */
  pendingLocalChanges: boolean;
  persisted: boolean;
};

export type GuidedFlowFetch = (input: string, init?: RequestInit) => Promise<Response>;

type SessionBody = {
  id?: string;
  version?: number;
  consumedAnswers?: GuidedFlowAnswerMap | null;
};

type ConflictBody = {
  error?: string;
  current?: {
    version?: number;
    consumedAnswers?: GuidedFlowAnswerMap | null;
  } | null;
};

async function json(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

async function patch(
  fetchFn: GuidedFlowFetch,
  sessionId: string,
  version: number,
  answers: GuidedFlowAnswerMap
): Promise<Response> {
  return fetchFn(`/api/guided-flow-sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: version, consumedAnswers: answers }),
  });
}

/**
 * Persist one Guided Flow answer snapshot with a bounded conflict-safe retry.
 *
 * The caller supplies `baseAnswers`: the canonical snapshot corresponding to
 * `session.version`, not merely whatever happens to be rendered now. If the
 * first write is stale, the server's current snapshot is three-way reconciled
 * against base + attempted. Only non-conflicting local edits are applied to
 * current, and THAT merged payload may be retried once at the new version.
 * The original stale full snapshot is never blindly replayed.
 */
export async function persistGuidedFlowAnswers(
  fetchFn: GuidedFlowFetch,
  session: GuidedFlowSessionRef,
  baseAnswers: GuidedFlowAnswerMap,
  attemptedAnswers: GuidedFlowAnswerMap
): Promise<GuidedFlowPersistResult> {
  const first = await patch(fetchFn, session.id, session.version, attemptedAnswers);
  const firstBody = await json(first) as SessionBody & ConflictBody | null;

  if (first.ok) {
    const version = firstBody?.version;
    if (typeof version !== "number") throw new Error("Guided Flow answer write returned no version");
    return {
      session: { id: session.id, version },
      answers: firstBody?.consumedAnswers ?? attemptedAnswers,
      conflicts: [],
      pendingLocalChanges: false,
      persisted: true,
    };
  }

  if (first.status !== 409) {
    throw new Error(`Guided Flow answer write failed: ${first.status}`);
  }

  const current = firstBody?.current;
  if (!current || typeof current.version !== "number") {
    throw new Error("Guided Flow stale write returned no current session");
  }
  const currentAnswers = current.consumedAnswers ?? {};
  const reconciliation = reconcileGuidedFlowAnswerConflict(baseAnswers, attemptedAnswers, currentAnswers);

  if (!reconciliation.hasLocalChangesToPersist) {
    return {
      session: { id: session.id, version: current.version },
      answers: reconciliation.merged,
      conflicts: reconciliation.conflicts,
      pendingLocalChanges: false,
      persisted: false,
    };
  }

  // One bounded retry of the RECONCILED payload, never the stale original.
  const second = await patch(fetchFn, session.id, current.version, reconciliation.merged);
  const secondBody = await json(second) as SessionBody & ConflictBody | null;
  if (second.ok) {
    const version = secondBody?.version;
    if (typeof version !== "number") throw new Error("Guided Flow reconciled write returned no version");
    return {
      session: { id: session.id, version },
      answers: secondBody?.consumedAnswers ?? reconciliation.merged,
      conflicts: reconciliation.conflicts,
      pendingLocalChanges: false,
      persisted: true,
    };
  }

  if (second.status !== 409) {
    throw new Error(`Guided Flow reconciled write failed: ${second.status}`);
  }

  // Another device moved again during our one retry. Reconcile once more for
  // the caller's LOCAL state but stop here—no retry loop. A later user action
  // may persist any still-safe edit against this newest version.
  const latest = secondBody?.current;
  if (!latest || typeof latest.version !== "number") {
    throw new Error("Guided Flow second stale write returned no current session");
  }
  const latestAnswers = latest.consumedAnswers ?? {};
  const secondReconciliation = reconcileGuidedFlowAnswerConflict(
    currentAnswers,
    reconciliation.merged,
    latestAnswers
  );

  return {
    session: { id: session.id, version: latest.version },
    answers: secondReconciliation.merged,
    conflicts: [...reconciliation.conflicts, ...secondReconciliation.conflicts],
    pendingLocalChanges: secondReconciliation.hasLocalChangesToPersist,
    persisted: false,
  };
}
