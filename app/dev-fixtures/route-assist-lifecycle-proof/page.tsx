import { execFileSync } from "node:child_process";

export const dynamic = "force-static";

export default function RouteAssistLifecycleProofPage() {
  const lifecycle = execFileSync("npx", ["tsx", "scripts/verify-route-assist-correction-lifecycle.ts"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const corrections = execFileSync("npx", ["tsx", "scripts/verify-route-assist-review-corrections.ts"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return <pre>{`${lifecycle}\n${corrections}`}</pre>;
}
