// The application build. Deliberately trivial: what matters is that it prints a
// marker no other step prints, and writes an output directory.
//
// Proof 4's NEGATIVE case is established by this marker's ABSENCE. The guard
// runs before `npm run build` in the chain, so a refusal must stop the build
// here — and "stopped before the application build" is only observable if the
// application build says something unmistakable when it runs.
import { mkdirSync, writeFileSync } from "node:fs";

const MARKER = "P2B-APP-BUILD-RAN";
const env = (n) => process.env[n] ?? "";

console.log(`${MARKER} at ${new Date().toISOString()}`);
console.log(`  VERCEL_ENV=${env("VERCEL_ENV")}`);
console.log(`  VERCEL_GIT_PROVIDER=${env("VERCEL_GIT_PROVIDER")}`);
console.log(`  VERCEL_GIT_REPO_OWNER=${env("VERCEL_GIT_REPO_OWNER")}`);
console.log(`  VERCEL_GIT_REPO_SLUG=${env("VERCEL_GIT_REPO_SLUG")}`);
console.log(`  VERCEL_GIT_COMMIT_REF=${env("VERCEL_GIT_COMMIT_REF")}`);
console.log(`  VERCEL_GIT_COMMIT_SHA=${env("VERCEL_GIT_COMMIT_SHA")}`);

mkdirSync("public", { recursive: true });

// The served page carries the commit it was built from, so proof 6 can read the
// deployment a host is actually serving instead of inferring it.
writeFileSync("public/index.html", `<!doctype html>
<meta charset="utf-8">
<title>p2b-release-proofs</title>
<h1>p2b-release-proofs</h1>
<p>Disposable fixture for the release proofs. Nothing here is production.</p>
<p id="sha">commit: ${env("VERCEL_GIT_COMMIT_SHA") || "unknown"}</p>
<p id="built">built: ${new Date().toISOString()}</p>
`);
writeFileSync("public/build-info.json", JSON.stringify({
  marker: MARKER,
  commitSha: env("VERCEL_GIT_COMMIT_SHA") || null,
  deploymentId: env("VERCEL_DEPLOYMENT_ID") || null,
  builtAt: new Date().toISOString(),
}, null, 2) + "\n");

console.log(`${MARKER} wrote public/index.html and public/build-info.json`);
