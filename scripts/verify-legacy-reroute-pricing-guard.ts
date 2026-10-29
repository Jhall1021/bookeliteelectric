import assert from "node:assert/strict";
import { canCollectScopeBeforePublishedReview } from "../lib/guidedFlowPricing";
import { startDisplayConfiguration, type JobConfiguration } from "../lib/pricing";

const cfg = (awaitingComponentApproval = false) => ({
  ...startDisplayConfiguration({ questions: [] } as never),
  awaitingComponentApproval,
}) as JobConfiguration;

assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", "CONTINUE", cfg(), null), true);
assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", "CONTINUE", cfg(true), null), false);

// Rerouting sells none of the origin service's work. The destination service
// owns its own pricing, so a missing origin anchor must never swallow either
// reroute into generic photo review.
assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", "REROUTE_SERVICE", cfg(), null), true);
assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", "REROUTE_TROUBLESHOOTING", cfg(true), null), true);

// The exception is deliberately narrow. It never permits an unpriced legacy
// service to resolve a customer price and does not alter published or derived
// flows.
for (const action of ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED", "PHOTO_REVIEW", "REMOTE_QUOTE"]) {
  assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", action, cfg(), null), false);
}
assert.equal(canCollectScopeBeforePublishedReview("LEGACY_PUBLISHED", "REROUTE_SERVICE", cfg(), 21_500), false);
assert.equal(canCollectScopeBeforePublishedReview("DERIVED_RESOLVED_SCOPE", "REROUTE_SERVICE", cfg(), null), false);

console.log("PASS: unpriced legacy services may reroute, but may not invent or resolve a price");
