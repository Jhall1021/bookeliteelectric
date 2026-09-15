import type { RouteAssistConcealedAccessEvidence } from "./types";

/**
 * Physical access opportunities Route Assist may preserve for a concealed
 * finished-wall route. This module deliberately does NOT select the method.
 */
export type ConcealedAccessCandidateMethod =
  | "DISCRETE_OPENINGS"
  | "BASEBOARD_ACCESS"
  | "TRIM_ASSISTED_BYPASS"
  | "DRYWALL_ACCESS_STRIP";

export type ConcealedAccessEvidenceInputV1 = {
  /** Strategic openings supported by the observed geometry; never holes/ft. */
  discreteOpenings?: { min: number; max: number } | null;
  /** Continuous removable-baseboard runs that could conceal access. */
  baseboardRuns?: Array<{ lengthFt: number; confirmedRemovable: boolean }>;
  /** Door/window/opening trim that could support an obstacle bypass. */
  trimBypasses?: Array<{
    obstacle: "DOORWAY" | "WINDOW" | "LARGE_OPENING";
    accessLengthFt?: number | null;
    confirmedRemovable: boolean;
  }>;
  /** Visible drywall-strip paths whose length is actually established. */
  drywallStripRuns?: Array<{ lengthFt: number }>;
};

export type ConcealedAccessSummaryV1 = {
  valid: boolean;
  problems: string[];
  evidence: RouteAssistConcealedAccessEvidence | null;
  candidateMethods: ConcealedAccessCandidateMethod[];
  /** Hard boundary: contractor policy/economics chooses among candidates. */
  methodSelectionAuthorized: false;
};

function nonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Summarize observed access opportunities without inventing a construction
 * method, a crossover distance, a fixed hole cadence, labor or price.
 */
export function summarizeConcealedAccessEvidenceV1(
  input: ConcealedAccessEvidenceInputV1
): ConcealedAccessSummaryV1 {
  const problems: string[] = [];
  const candidateMethods: ConcealedAccessCandidateMethod[] = [];

  let discreteMin: number | null = null;
  let discreteMax: number | null = null;
  if (input.discreteOpenings) {
    const { min, max } = input.discreteOpenings;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      problems.push("discrete opening range must be non-negative whole numbers with max >= min");
    } else {
      discreteMin = min;
      discreteMax = max;
      if (max > 0) candidateMethods.push("DISCRETE_OPENINGS");
    }
  }

  let baseboardAccessLengthFt = 0;
  for (const [index, run] of (input.baseboardRuns ?? []).entries()) {
    if (!Number.isFinite(run.lengthFt) || run.lengthFt <= 0) {
      problems.push(`baseboard run ${index + 1} must have a finite length greater than zero`);
      continue;
    }
    if (run.confirmedRemovable) baseboardAccessLengthFt += run.lengthFt;
  }
  if (baseboardAccessLengthFt > 0) candidateMethods.push("BASEBOARD_ACCESS");

  let trimAssistedBypassesCount = 0;
  for (const [index, bypass] of (input.trimBypasses ?? []).entries()) {
    if (bypass.accessLengthFt !== null && bypass.accessLengthFt !== undefined && !nonNegativeFinite(bypass.accessLengthFt)) {
      problems.push(`trim bypass ${index + 1} has an invalid access length`);
    }
    if (bypass.confirmedRemovable) trimAssistedBypassesCount += 1;
  }
  if (trimAssistedBypassesCount > 0) candidateMethods.push("TRIM_ASSISTED_BYPASS");

  let drywallAccessStripLengthFt = 0;
  for (const [index, run] of (input.drywallStripRuns ?? []).entries()) {
    if (!Number.isFinite(run.lengthFt) || run.lengthFt <= 0) {
      problems.push(`drywall access run ${index + 1} must have a finite length greater than zero`);
      continue;
    }
    drywallAccessStripLengthFt += run.lengthFt;
  }
  if (drywallAccessStripLengthFt > 0) candidateMethods.push("DRYWALL_ACCESS_STRIP");

  if (problems.length > 0) {
    return {
      valid: false,
      problems,
      evidence: null,
      candidateMethods: [],
      methodSelectionAuthorized: false,
    };
  }

  return {
    valid: true,
    problems: [],
    evidence: {
      discreteOpeningsMin: discreteMin,
      discreteOpeningsMax: discreteMax,
      baseboardAccessLengthFt: baseboardAccessLengthFt > 0 ? Math.round(baseboardAccessLengthFt * 1000) / 1000 : null,
      drywallAccessStripLengthFt:
        drywallAccessStripLengthFt > 0 ? Math.round(drywallAccessStripLengthFt * 1000) / 1000 : null,
      trimAssistedBypassesCount,
      methodSelectionAuthorized: false,
    },
    candidateMethods: [...new Set(candidateMethods)],
    methodSelectionAuthorized: false,
  };
}
