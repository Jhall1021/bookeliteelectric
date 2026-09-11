/**
 * Route Assist's own safety net — same technique as ../invariants.ts
 * (walk a registry, refuse forbidden tokens as a build/test-time check, not
 * a runtime guess), but a different, stricter list, because §3 of the brief
 * is entirely a list of things this feature must never claim.
 *
 * `registryViolations()` walks the actual taxonomy and result field names —
 * not sample output — the same proof style `../invariants.ts` uses: it says
 * something about every reply this system can ever produce, not about one
 * example.
 */

import {
  ROUTE_ASSIST_CONFIRMATION_DECISIONS,
  ROUTE_ASSIST_DESTINATION_TYPES,
  ROUTE_ASSIST_INCOMPLETE_REASONS,
  ROUTE_ASSIST_MODES,
  ROUTE_COMPLEXITIES,
  ROUTE_OBSTACLES,
  ROUTE_POINT_KINDS,
  ROUTE_SURFACES,
  ROUTE_TURN_DIRECTIONS,
} from "./taxonomy";
import type { RouteAssistResult } from "./types";

/**
 * Broader than ../invariants.ts's list where they overlap, plus Route
 * Assist–specific additions (`feasib`, `capacity`, `breaker`, `conductor`,
 * `ampacity`, `boxfill`/`box_fill`, `stud`, `joist`, `header`, `blocking`,
 * `insulation`) drawn directly from §3's "may not" list — the equipment-ID
 * domain never needed these because it never claimed to know what's behind
 * a wall.
 */
export const FORBIDDEN_FIELD_TOKENS = [
  "price",
  "cost",
  "surcharge",
  "tier",
  "hour",
  "minute",
  "crew",
  "labor",
  "material",
  "answer",
  "safe",
  "unsafe",
  "hazard",
  "complian",
  "code",
  "nec",
  "repair",
  "diagnos",
  "fault",
  "defect",
  "recommend",
  "feasib",
  "capacity",
  "breaker",
  "conductor",
  "ampacity",
  "boxfill",
  "box_fill",
  "stud",
  "joist",
  "header",
  "blocking",
  "insulation",
] as const;

export const FORBIDDEN_TAXONOMY_TOKENS = [
  "unsafe",
  "hazard",
  "violation",
  "noncompliant",
  "non_compliant",
  "improper",
  "damaged",
  "defective",
  "needs_",
  "requires_",
  "upgrade",
  "repair",
  "recommend",
  "approved",
  "tap",
  "feasib",
] as const;

/** §21's "Bad" list, plus the two worked examples from §13/§21. Matched case-insensitively. */
export const FORBIDDEN_SUMMARY_PHRASES = [
  "we determined the wire path",
  "you need",
  "holes",
  "the wire can go over",
  "this outlet can be tapped",
  "can be tapped",
  "code compliant",
  "no obstacles are inside",
  "we know what's inside",
  "guaranteed",
] as const;

/** Every field on `RouteAssistResult`, kept as a runtime list because the type erases at compile time. */
const RESULT_FIELD_NAMES: (keyof RouteAssistResult)[] = [
  "mode",
  "destinationType",
  "points",
  "segments",
  "customerConfirmedRoute",
  "estimatedTotalRouteLengthFt",
  "sameWall",
  "wallTransitionsCount",
  "insideCornersCount",
  "outsideCornersCount",
  "doorwayBypassesCount",
  "windowBypassesCount",
  "verticalTransitionsCount",
  "wallToCeilingTransitionsCount",
  "wallToFloorTransitionsCount",
  "visibleObstacleDetoursCount",
  "concealedRouteComplexity",
  "suggestedAccessOpeningsMin",
  "suggestedAccessOpeningsMax",
  "needsContractorReview",
  "captureArtifacts",
  "customerNotes",
  "drywallAccessAllowed",
];

const ALL_TAXONOMIES: readonly (readonly string[])[] = [
  ROUTE_ASSIST_MODES,
  ROUTE_ASSIST_DESTINATION_TYPES,
  ROUTE_SURFACES,
  ROUTE_POINT_KINDS,
  ROUTE_OBSTACLES,
  ROUTE_TURN_DIRECTIONS,
  ROUTE_COMPLEXITIES,
  ROUTE_ASSIST_INCOMPLETE_REASONS,
  ROUTE_ASSIST_CONFIRMATION_DECISIONS,
];

/** Walks the real taxonomy and field-name registry. Returns every violation found, empty when clean. */
export function registryViolations(): string[] {
  const violations: string[] = [];

  for (const name of RESULT_FIELD_NAMES) {
    for (const token of FORBIDDEN_FIELD_TOKENS) {
      if (String(name).toLowerCase().includes(token)) {
        violations.push(`field "${name}" contains forbidden token "${token}"`);
      }
    }
  }

  for (const taxonomy of ALL_TAXONOMIES) {
    for (const value of taxonomy) {
      for (const token of FORBIDDEN_TAXONOMY_TOKENS) {
        if (value.toLowerCase().includes(token)) {
          violations.push(`taxonomy value "${value}" contains forbidden token "${token}"`);
        }
      }
    }
  }

  return violations;
}

/** Scans one piece of rendered summary text. Used against every proof-scenario fixture, not just one. */
export function summaryLanguageViolations(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_SUMMARY_PHRASES.filter((phrase) => lower.includes(phrase));
}

/** §2.B: a range, never a number that reads as an exact count. */
export function accessOpeningRangeIsValid(result: RouteAssistResult): boolean {
  const { suggestedAccessOpeningsMin: min, suggestedAccessOpeningsMax: max, mode } = result;
  if (min == null && max == null) return true;
  if (min == null || max == null) return false; // must be present together, never just one
  if (mode !== "CONCEALED") return false; // §2.B is concealed-only
  return max > min; // a min === max range would read as an exact count
}

/** An unconfirmed route can never look already-cleared to whatever reads `needsContractorReview` next. */
export function confirmationInvariantHolds(result: RouteAssistResult): boolean {
  if (result.customerConfirmedRoute === false) return result.needsContractorReview === true;
  return true;
}
