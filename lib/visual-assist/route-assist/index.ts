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
export {
  buildOrderedRouteGeometryV1,
  orderedGeometryFromResult,
} from "./orderedGeometry";
export {
  validateRouteAssistScanEvidenceV1,
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
} from "./scanEvidence";
export { summarizeConcealedAccessEvidenceV1 } from "./concealedAccess";
