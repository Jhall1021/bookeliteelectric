import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

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
  "verify-route-assist-multi-outlet-plan.ts",
  "verify-route-assist-room-scan-graph.ts",
  "verify-route-assist-accepted-graph-routing-handoff.ts",
  "verify-route-assist-production-boundaries.ts",
  "verify-quantity-binding-transport-source.ts",
] as const;

// This older integration rehearsal intentionally reads a provisioned contractor
// tree through Prisma. Preview builds do not receive DATABASE_URL, so running it
// there would test Vercel secret exposure rather than Route Assist. Its pure
// adapter/transport guarantees are covered above by routing-v2-facts and the
// accepted-graph routing handoff. When a database is explicitly available, we
// still run the DB-backed rehearsal as the final component.
const databaseScripts = process.env.DATABASE_URL
  ? (["verify-route-assist-v2-adapter.ts"] as const)
  : ([] as const);
const selectedScripts = [...scripts, ...databaseScripts];

for (const script of selectedScripts) {
  const sourcePath = join("scripts", script);
  const tempPath = join("scripts", `.route-assist-full-proof-${basename(script, ".ts")}.mts`);
  // The repository is CommonJS-classified, while a few focused verifiers use
  // intentional top-level await. Copying only for execution to .mts gives every
  // verifier consistent ESM semantics without changing its committed source or
  // relative import base. The temporary file is always removed.
  writeFileSync(tempPath, readFileSync(sourcePath, "utf8"), "utf8");
  try {
    const result = spawnSync("npx", ["tsx", tempPath], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(`Route Assist verifier failed: ${script}`);
      process.exit(result.status ?? 1);
    }
  } finally {
    rmSync(tempPath, { force: true });
  }
}

if (!process.env.DATABASE_URL) {
  console.log("Route Assist DB-backed V2 rehearsal: skipped because DATABASE_URL is intentionally unavailable in this environment.");
}
console.log(`Route Assist full-program verification: ${selectedScripts.length} executable verifier components passed.`);
