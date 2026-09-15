import { spawnSync } from "node:child_process";

const scripts = [
  "verify-guided-flow-answer-reconcile.ts",
  "verify-guided-flow-session-client.ts",
  "verify-guided-flow-answer-writer.ts",
  "verify-guided-flow-stored-answer.ts",
  "verify-route-assist-guided-flow-source.ts",
  "verify-route-assist-phone-continuation-source.ts",
  "verify-route-assist-grouped-reuse.ts",
  "verify-route-assist-graph-identity.ts",
  "verify-route-assist-fractional-footage.ts",
  "verify-route-assist-exact-measurement-pipeline.ts",
  "verify-route-assist-task-contract.ts",
  "verify-route-assist-scan-provider.ts",
  "verify-route-assist-scan-evidence.ts",
  "verify-route-assist-scan-candidates.ts",
  "verify-route-assist-scan-review.ts",
  "verify-route-assist-scan-acceptance.ts",
  "verify-route-assist-scan-preview-source.ts",
  "verify-route-assist-capture-readiness.ts",
  "verify-route-assist-sweep-handoff.ts",
  "verify-route-assist-visible-scene-provider.ts",
  "verify-route-assist-visible-scene-quality.ts",
  "verify-route-assist-visible-scene-review.ts",
  "verify-route-assist-supplemental-semantic-evidence.ts",
  "verify-route-assist-review-corrections.ts",
  "verify-route-assist-correction-lifecycle.ts",
  "verify-route-assist-targeted-recapture.ts",
  "verify-route-assist-metric-review.ts",
  "verify-route-assist-reviewed-acceptance.ts",
  "verify-route-assist-physical-fact-acceptance.ts",
  "verify-route-assist-obstacle-acceptance.ts",
  "verify-route-assist-ordered-geometry.ts",
  "verify-route-assist-routing-v2-facts.ts",
  "verify-route-assist-v2-adapter.ts",
  "verify-route-assist-multi-outlet-plan.ts",
  "verify-route-assist-room-scan-graph.ts",
  "verify-route-assist-accepted-graph-routing-handoff.ts",
  "verify-route-assist-production-boundaries.ts",
  "verify-quantity-binding-transport-source.ts",
] as const;

for (const script of scripts) {
  // Use the tsx CLI rather than `node --import tsx`: several focused proof
  // scripts intentionally use top-level await, which the CLI runs as ESM but
  // Node's loader path may transform as CJS in some build environments.
  const result = spawnSync("npx", ["tsx", `scripts/${script}`], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Route Assist verifier failed: ${script}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Route Assist full-program verification: ${scripts.length} verifier components passed.`);
