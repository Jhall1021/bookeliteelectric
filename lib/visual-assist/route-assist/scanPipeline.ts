import {
  runRouteAssistScanProviderV1,
  type RouteAssistScanProviderInputV1,
  type RouteAssistScanProviderV1,
} from "./scanProvider";
import {
  extractRouteAssistScanCandidatesV1,
  type RouteAssistScanCandidatesV1,
} from "./scanCandidates";
import { buildRouteAssistScanReviewV1, type RouteAssistScanReviewV1 } from "./scanReview";
import type { RouteAssistScanEvidenceV1 } from "./scanEvidence";

/**
 * The complete automatic portion of Room Scan V1.
 *
 * It intentionally stops at reviewable candidates:
 *
 * provider -> validated evidence -> candidates -> STOP
 *
 * Explicit acceptance remains a separate action in scanCandidateAcceptance.ts.
 * This function cannot mutate the Route Assist graph, bind Routing V2 facts,
 * compute MaterialTakeoff, or affect pricing.
 */
export type RouteAssistScanCandidatePipelineV1 = {
  providerKey: string;
  evidence: RouteAssistScanEvidenceV1 | null;
  candidates: RouteAssistScanCandidatesV1 | null;
  problems: string[];
};

export type RouteAssistScanReviewPipelineV1 = RouteAssistScanCandidatePipelineV1 & {
  review: RouteAssistScanReviewV1 | null;
};

export async function collectRouteAssistScanCandidatesV1(
  provider: RouteAssistScanProviderV1,
  input: RouteAssistScanProviderInputV1,
): Promise<RouteAssistScanCandidatePipelineV1> {
  const providerRun = await runRouteAssistScanProviderV1(provider, input);
  if (!providerRun.evidence) {
    return {
      providerKey: providerRun.providerKey,
      evidence: null,
      candidates: null,
      problems: providerRun.problems,
    };
  }

  const extraction = extractRouteAssistScanCandidatesV1(
    [...input.points],
    [...input.segments],
    providerRun.evidence,
  );

  return {
    providerKey: providerRun.providerKey,
    evidence: providerRun.evidence,
    candidates: extraction.candidates,
    problems: extraction.problems,
  };
}

/**
 * Preview/UI entry point: run the entire automatic scan path and produce the
 * review model a human can inspect. No review item is accepted here.
 */
export async function prepareRouteAssistScanReviewV1(
  provider: RouteAssistScanProviderV1,
  input: RouteAssistScanProviderInputV1,
): Promise<RouteAssistScanReviewPipelineV1> {
  const collected = await collectRouteAssistScanCandidatesV1(provider, input);
  return {
    ...collected,
    review: collected.candidates ? buildRouteAssistScanReviewV1(collected.candidates) : null,
  };
}
