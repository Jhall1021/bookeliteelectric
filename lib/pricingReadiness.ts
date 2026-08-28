/**
 * Is this service ready to sell, under THIS pricing strategy? — ADR-018.
 *
 * Readiness is strategy-specific, and deliberately so. A service can be fully
 * configured for FLAT_RATE — priced, approved, materials costed — and still be
 * missing the estimate bounds TIME_AND_MATERIALS needs, and the reverse is
 * equally possible. Collapsing the two into one "is it ready" flag would mean
 * switching strategy silently changed which services a homeowner could book.
 *
 * The corollary matters as much: switching strategy READS a different set of
 * fields. It never writes, clears or rewrites the other strategy's
 * configuration, so switching back finds everything as it was.
 *
 * Fail closed throughout. A missing bound is unresolved, never zero — zero
 * crew-hours is a real number and must never stand in for "not told yet".
 */
import type { PricingStrategy } from "@prisma/client";

/** Only the fields readiness depends on. Kept narrow so callers select honestly. */
export type ReadinessInput = {
  bookingType: string;
  active: boolean;
  /** FLAT_RATE: the approved customer price. */
  publishedPriceApprovedAt: Date | null;
  basePrice: number | null;
  /** Shared: material costs must resolve under either strategy. */
  materialCostResolved: boolean;
  unresolvedMaterialKeys: string[];
  /** Shared: wording that depends on an unanswered policy cannot ship. */
  unresolvedPolicyKeys: string[];
  /** TIME_AND_MATERIALS: the estimate bounds, in crew-hours. */
  estimateLowCrewHours: number | null;
  estimateHighCrewHours: number | null;
  estimateApprovedAt: Date | null;
};

export type Blocker = { code: string; message: string };

export type Readiness = {
  strategy: PricingStrategy;
  /** Quote-only services are never "unready" — a human prices them by design. */
  quoteOnly: boolean;
  ready: boolean;
  blockers: Blocker[];
};

/**
 * Structural validation of the bounds, separate from readiness so a form can
 * reject bad input before anything is stored.
 *
 * Zero is REFUSED as a low bound rather than treated as unknown: a service
 * that genuinely takes no crew time is not a service, and accepting 0 would
 * make "unset" and "instant" indistinguishable — which is the exact confusion
 * this codebase fails closed against everywhere else.
 */
export function validateEstimateBounds(
  low: number | null | undefined, high: number | null | undefined,
): Blocker[] {
  const out: Blocker[] = [];
  if (low === null || low === undefined || high === null || high === undefined) {
    out.push({ code: "unset", message: "Both the low and high estimate are required." });
    return out;
  }
  if (!Number.isFinite(low) || !Number.isFinite(high))
    out.push({ code: "not-a-number", message: "Estimates must be numbers." });
  if (low <= 0)
    out.push({ code: "low-not-positive", message: "The low estimate must be more than zero crew-hours." });
  if (high < low)
    out.push({ code: "high-below-low", message: "The high estimate cannot be below the low estimate." });
  return out;
}

export function readiness(s: ReadinessInput, strategy: PricingStrategy): Readiness {
  const quoteOnly = s.bookingType === "REMOTE_QUOTE";
  const blockers: Blocker[] = [];

  // Shared, because they gate what the storefront may SAY regardless of how
  // the number is produced.
  if (!s.materialCostResolved || s.unresolvedMaterialKeys.length)
    blockers.push({ code: "materials",
      message: `Needs a cost for ${s.unresolvedMaterialKeys.join(", ") || "some materials"}.` });
  if (s.unresolvedPolicyKeys.length)
    blockers.push({ code: "policy",
      message: `Needs a decision on ${s.unresolvedPolicyKeys.join(", ")}.` });

  if (!quoteOnly) {
    if (strategy === "FLAT_RATE") {
      if (s.publishedPriceApprovedAt === null || s.basePrice === null)
        blockers.push({ code: "no-approved-price", message: "Needs a price you have approved." });
    } else {
      const bad = validateEstimateBounds(s.estimateLowCrewHours, s.estimateHighCrewHours);
      if (bad.length) blockers.push(...bad);
      else if (s.estimateApprovedAt === null)
        blockers.push({ code: "estimate-not-approved",
          // Suggested is not approved. The distinction is the whole point of
          // "Price2Book can suggest. You approve."
          message: "Estimated hours are suggested but not yet approved." });
    }
  }

  return { strategy, quoteOnly, ready: blockers.length === 0, blockers };
}

/** What Price2Book would suggest, and would never store on its own. */
export function suggestBounds(fieldLaborHours: number | null): { low: number; high: number } | null {
  if (fieldLaborHours === null || !Number.isFinite(fieldLaborHours) || fieldLaborHours <= 0) return null;
  // A starting point for a conversation, not a calculation anyone may publish.
  // Asymmetric on purpose: jobs overrun far more often than they come in
  // early, and a symmetric band would quietly teach contractors that the
  // midpoint is the answer. The contractor is expected to move both numbers.
  return {
    low: Math.round(fieldLaborHours * 0.75 * 4) / 4,
    high: Math.round(fieldLaborHours * 1.5 * 4) / 4,
  };
}
