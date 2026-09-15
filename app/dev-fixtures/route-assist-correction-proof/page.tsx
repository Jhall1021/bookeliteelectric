import { execFileSync } from "node:child_process";

export const dynamic = "force-static";

function run(script: string): string {
  return execFileSync("npx", ["tsx", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export default function RouteAssistCorrectionProofPage() {
  const correction = run("scripts/verify-route-assist-review-corrections.ts");
  const semantic = run("scripts/verify-route-assist-visible-scene-provider.ts");
  return <pre>{`${correction}\n${semantic}`}</pre>;
}
