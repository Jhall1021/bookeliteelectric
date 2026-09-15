import { execFileSync } from "node:child_process";

export const dynamic = "force-static";

function runFullProgramVerification(): string {
  return execFileSync(
    "npx",
    ["tsx", "scripts/verify-route-assist-full-program.ts"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

export default function RouteAssistFullProgramProofPage() {
  const output = runFullProgramVerification();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Route Assist full-program verification</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
    </main>
  );
}
