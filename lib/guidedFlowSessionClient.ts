import {
  reconcileGuidedFlowAnswers,
  type GuidedFlowAnswerMap,
} from "./guidedFlowAnswerReconcile";

export type GuidedFlowSessionRef = {
  id: string;
  version: number;
};

export type GuidedFlowPersistResult = {
  session: GuidedFlowSessionRef;
  /** Answers the caller should use locally after this persistence attempt. */
  answers: GuidedFlowAnswerMap;
  /** Exact answer snapshot known to be canonical on the server at `session.version`. */
  canonicalAnswers: GuidedFlowAnswerMap;
  /** Same-key conflicts where server/current remains canonical. */
  conflictKeys: string[];
  /** True only when `answers` still contains safe local edits not yet accepted by the server. */
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

function sameAnswers(a: GuidedFlowAnswerMap, b: GuidedFlowAnswerMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/**
 * Persist one Guided Flow answer snapshot with a bounded conflict-safe retry.
 *
 * The caller supplies `baseAnswers`: the canonical snapshot corresponding to
 * `session.version`, not merely whatever happens to be rendered now. If the
 * first write is stale, the server's current snapshot is reconciled through the
 * canonical three-way helper. Only a clean MERGED result may be retried, and
 * then only when it actually contains a safe local edit absent from the server.
 * A same-key CONFLICT immediately re-aligns to the server's canonical state.
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
    const canonicalAnswers = firstBody?.consumedAnswers ?? attemptedAnswers;
    return {
      session: { id: session.id, version },
      answers: canonicalAnswers,
      canonicalAnswers,
      conflictKeys: [],
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
  const reconciliation = reconcileGuidedFlowAnswers(baseAnswers, attemptedAnswers, currentAnswers);

  if (reconciliation.kind === "CONFLICT") {
    return {
      session: { id: session.id, version: current.version },
      answers: currentAnswers,
      canonicalAnswers: currentAnswers,
      conflictKeys: reconciliation.conflictKeys,
      pendingLocalChanges: false,
      persisted: false,
    };
  }

  if (sameAnswers(reconciliation.answers, currentAnswers)) {
    return {
      session: { id: session.id, version: current.version },
      answers: currentAnswers,
      canonicalAnswers: currentAnswers,
      conflictKeys: [],
      pendingLocalChanges: false,
      persisted: false,
    };
  }

  // One bounded retry of the reconciled payload, never the stale original.
  const second = await patch(fetchFn, session.id, current.version, reconciliation.answers);
  const secondBody = await json(second) as SessionBody & ConflictBody | null;
  if (second.ok) {
    const version = secondBody?.version;
    if (typeof version !== "number") throw new Error("Guided Flow reconciled write returned no version");
    const canonicalAnswers = secondBody?.consumedAnswers ?? reconciliation.answers;
    return {
      session: { id: session.id, version },
      answers: canonicalAnswers,
      canonicalAnswers,
      conflictKeys: [],
      pendingLocalChanges: false,
      persisted: true,
    };
  }

  if (second.status !== 409) {
    throw new Error(`Guided Flow reconciled write failed: ${second.status}`);
  }

  // Another device moved again during our one retry. Reconcile once more for
  // local display state but stop here—no retry loop.
  const latest = secondBody?.current;
  if (!latest || typeof latest.version !== "number") {
    throw new Error("Guided Flow second stale write returned no current session");
  }
  const latestAnswers = latest.consumedAnswers ?? {};
  const secondReconciliation = reconcileGuidedFlowAnswers(
    currentAnswers,
    reconciliation.answers,
    latestAnswers
  );

  if (secondReconciliation.kind === "CONFLICT") {
    return {
      session: { id: session.id, version: latest.version },
      answers: latestAnswers,
      canonicalAnswers: latestAnswers,
      conflictKeys: secondReconciliation.conflictKeys,
      pendingLocalChanges: false,
      persisted: false,
    };
  }

  return {
    session: { id: session.id, version: latest.version },
    answers: secondReconciliation.answers,
    canonicalAnswers: latestAnswers,
    conflictKeys: [],
    pendingLocalChanges: !sameAnswers(secondReconciliation.answers, latestAnswers),
    persisted: false,
  };
}
