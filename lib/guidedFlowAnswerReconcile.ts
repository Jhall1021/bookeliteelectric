/**
 * Three-way reconciliation for optimistic GuidedFlowSession answer writes.
 *
 * BASE   = the answer snapshot the local edit was made against.
 * LOCAL  = BASE plus this device's proposed edit(s).
 * REMOTE = the canonical snapshot returned by the server after rejecting the
 *          stale expectedVersion.
 *
 * Disjoint edits are safe to merge: if LOCAL changed key A while REMOTE changed
 * key B, neither side is overwriting the other's intent. The same edit on both
 * sides is also safe. If both sides changed the SAME key away from BASE to
 * different values, there is no truthful automatic winner at this layer. The
 * server's persisted value remains canonical and the caller must re-align its
 * flow rather than retrying a payload that would overwrite it.
 */

export type GuidedFlowAnswerMap = Record<string, string>;

export type GuidedFlowAnswerReconcileResult =
  | { kind: "MERGED"; answers: GuidedFlowAnswerMap }
  | { kind: "CONFLICT"; answers: GuidedFlowAnswerMap; conflictKeys: string[] };

function same(a: string | undefined, b: string | undefined): boolean {
  return a === b;
}

export function reconcileGuidedFlowAnswers(
  base: GuidedFlowAnswerMap,
  local: GuidedFlowAnswerMap,
  remote: GuidedFlowAnswerMap
): GuidedFlowAnswerReconcileResult {
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const merged: GuidedFlowAnswerMap = {};
  const conflictKeys: string[] = [];

  for (const key of keys) {
    const before = base[key];
    const ours = local[key];
    const theirs = remote[key];

    let chosen: string | undefined;
    if (same(ours, theirs)) {
      // Both devices independently reached the same answer (including both
      // removing/omitting it). No conflict.
      chosen = ours;
    } else if (same(ours, before)) {
      // We did not change this key; preserve the remote device's change.
      chosen = theirs;
    } else if (same(theirs, before)) {
      // Remote did not change this key; our edit is safe to carry forward.
      chosen = ours;
    } else {
      // Both changed the same key differently. Remote is already persisted, so
      // retain it in the returned canonical snapshot but mark the conflict so
      // callers MUST NOT auto-retry the merged object.
      chosen = theirs;
      conflictKeys.push(key);
    }

    if (chosen !== undefined) merged[key] = chosen;
  }

  return conflictKeys.length > 0
    ? { kind: "CONFLICT", answers: merged, conflictKeys }
    : { kind: "MERGED", answers: merged };
}
