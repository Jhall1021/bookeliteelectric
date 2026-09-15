/**
 * Decide whether an already-completed Route Assist capture may populate one
 * canonical Guided Flow question.
 *
 * This is intentionally tiny and UI-free because the precedence rule matters:
 * an older capture is useful evidence, but a newer persisted customer answer is
 * authoritative for the quote. Route Assist may replay the same value to bridge
 * resume/reload mechanics; it may never replace a different persisted answer.
 */

export type RouteAssistGroupedReuseDecision =
  | { kind: "USE_SCAN"; value: string }
  | { kind: "PRESERVE_PERSISTED"; persistedValue: string; scanValue: string }
  | { kind: "SCAN_UNAVAILABLE" };

export function decideRouteAssistGroupedReuse(
  persistedValue: string | undefined,
  scanValue: string | null
): RouteAssistGroupedReuseDecision {
  if (scanValue === null) return { kind: "SCAN_UNAVAILABLE" };
  if (persistedValue === undefined || persistedValue === scanValue) {
    return { kind: "USE_SCAN", value: scanValue };
  }
  return {
    kind: "PRESERVE_PERSISTED",
    persistedValue,
    scanValue,
  };
}
