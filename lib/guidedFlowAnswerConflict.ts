/**
 * Three-way reconciliation for optimistic GuidedFlowSession answer writes.
 *
 * base     = the canonical answer snapshot this client last read at version N
 * attempted= the full local snapshot this client tried to write from that base
 * current  = the canonical server snapshot returned with STALE_VERSION
 *
 * A stale full snapshot must never simply be re-sent at N+1: doing that would
 * overwrite answers another device added after N. Instead, derive ONLY this
 * client's edits relative to `base` and reapply an edit when the server still
 * carries the base value for that same key. If both devices changed the same
 * key differently, the server/current value wins and the conflict is surfaced.
 *
 * Pure. No React, fetch, Prisma, Route Assist, routing, or pricing semantics.
 */

export type GuidedFlowAnswerMap = Record<string, string>;

export type GuidedFlowAnswerConflict = {
  key: string;
  baseValue: string | undefined;
  attemptedValue: string | undefined;
  currentValue: string | undefined;
};

export type GuidedFlowAnswerReconciliation = {
  merged: GuidedFlowAnswerMap;
  conflicts: GuidedFlowAnswerConflict[];
  /** True when this client still has at least one safe local edit to persist. */
  hasLocalChangesToPersist: boolean;
};

const valueAt = (answers: GuidedFlowAnswerMap, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined;

const setOrDelete = (answers: GuidedFlowAnswerMap, key: string, value: string | undefined): void => {
  if (value === undefined) delete answers[key];
  else answers[key] = value;
};

export function reconcileGuidedFlowAnswerConflict(
  base: GuidedFlowAnswerMap,
  attempted: GuidedFlowAnswerMap,
  current: GuidedFlowAnswerMap
): GuidedFlowAnswerReconciliation {
  const merged: GuidedFlowAnswerMap = { ...current };
  const conflicts: GuidedFlowAnswerConflict[] = [];
  let hasLocalChangesToPersist = false;

  const locallyTouched = new Set([...Object.keys(base), ...Object.keys(attempted)]);
  for (const key of locallyTouched) {
    const baseValue = valueAt(base, key);
    const attemptedValue = valueAt(attempted, key);
    if (baseValue === attemptedValue) continue; // not this client's edit

    const currentValue = valueAt(current, key);

    // The server still has exactly what this client originally read for this
    // key. No other device touched it, so this client's edit is safe to reapply.
    if (currentValue === baseValue) {
      setOrDelete(merged, key, attemptedValue);
      if (attemptedValue !== currentValue) hasLocalChangesToPersist = true;
      continue;
    }

    // Another writer independently landed the same value this client wanted.
    // Nothing remains to write for this key.
    if (currentValue === attemptedValue) continue;

    // Both sides changed the same key differently. Current/server wins. This is
    // intentional conflict preservation, not last-writer-wins by retry timing.
    conflicts.push({ key, baseValue, attemptedValue, currentValue });
  }

  return { merged, conflicts, hasLocalChangesToPersist };
}
