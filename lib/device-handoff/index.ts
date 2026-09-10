export * from "./types";
export { generateHandoffToken, hashHandoffToken, tokenMatchesHash, handoffUrl, assertNoIdentifiersLeaked } from "./token";
export {
  createHandoff,
  resolveHandoff,
  connectHandoff,
  completeHandoff,
  revokeHandoff,
  isExpired,
  desktopPresentationState,
  DEFAULT_HANDOFF_TTL_MINUTES,
} from "./lifecycle";
export type { CreateHandoffInput, ResolveOutcome, TransitionOutcome, DesktopPresentationState } from "./lifecycle";
export { ttlWithinPolicy, tokenHasSufficientEntropy, urlLeaksNoIdentifiers, handoffFieldViolations } from "./invariants";
