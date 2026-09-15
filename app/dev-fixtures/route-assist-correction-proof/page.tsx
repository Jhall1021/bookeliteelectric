import { execFileSync } from "node:child_process";

export const dynamic = "force-static";

export default function RouteAssistCorrectionProofPage() {
  const output = execFileSync("npx", ["tsx", "scripts/verify-route-assist-review-corrections.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return <pre>{output}</pre>;
}
