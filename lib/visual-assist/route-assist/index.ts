export * from "./taxonomy";
export * from "./types";
export { buildRouteAssistResult } from "./result";
export { applyConfirmation, decisionRecord } from "./confirmation";
export { homeownerSummaryLines, contractorSummary } from "./summary";
export {
  registryViolations,
  summaryLanguageViolations,
  accessOpeningRangeIsValid,
  confirmationInvariantHolds,
} from "./invariants";
export {
  orderRoute,
  corners,
  surfaceTransitions,
  wallTransitions,
  obstacleBypasses,
  verticalWallSegments,
  totalEstimatedLengthFt,
  sameWallHeuristic,
} from "./geometry";
export { classifyConcealedComplexity, suggestedAccessOpeningRange } from "./complexity";
export { incompleteResult } from "./uncertainty";

// Room-scan / ordered-geometry surfaces. These remain upstream of canonical
// Routing V2 binding: provider -> evidence -> reviewable candidates -> explicit
// acceptance, never provider/evidence -> price.
export {
  buildOrderedRouteGeometryV1,
  orderedGeometryFromResult,
  exactPhysicalTurnCountsFromResult,
  type RouteAssistOrderedGeometryV1,
  type OrderedRouteSegmentV1,
  type OrderedRouteTransitionV1,
  type ExactPhysicalTurnCountsV1,
} from "./orderedGeometry";
export {
  validateRouteAssistScanEvidenceV1,
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
  type RouteAssistScanEvidenceV1,
  type RouteScanObservation,
  type RouteScanSegmentEvidenceV1,
  type RouteScanTransitionEvidenceV1,
  type RouteScanEvidenceValidation,
} from "./scanEvidence";
export {
  runRouteAssistScanProviderV1,
  type RouteAssistScanCaptureKindV1,
  type RouteAssistScanProviderInputV1,
  type RouteAssistScanProviderV1,
  type RouteAssistScanProviderRunV1,
} from "./scanProvider";
export {
  collectRouteAssistScanCandidatesV1,
  prepareRouteAssistScanReviewV1,
  type RouteAssistScanCandidatePipelineV1,
  type RouteAssistScanReviewPipelineV1,
} from "./scanPipeline";
export {
  extractRouteAssistScanCandidatesV1,
  type RouteAssistScanCandidateExtraction,
  type RouteAssistScanCandidatesV1,
  type RouteScanCandidate,
  type RouteScanSegmentCandidatesV1,
  type RouteScanTransitionCandidatesV1,
  type CompleteMeasuredRouteLengthCandidateV1,
} from "./scanCandidates";
export {
  buildRouteAssistScanReviewV1,
  buildRouteAssistScanAcceptanceFromReviewV1,
  type RouteAssistScanReviewItemKindV1,
  type RouteAssistScanReviewItemV1,
  type RouteAssistScanReviewV1,
  type RouteAssistScanReviewAcceptanceBuild,
} from "./scanReview";
export { applyRouteAssistScanReviewSelectionV1 } from "./scanReviewAcceptance";
export {
  applyAcceptedRouteAssistScanCandidatesV1,
  type RouteAssistScanCandidateAcceptanceV1,
  type RouteAssistScanCandidateAcceptanceResult,
  type AcceptedRouteAssistScanGraphV1,
} from "./scanCandidateAcceptance";
