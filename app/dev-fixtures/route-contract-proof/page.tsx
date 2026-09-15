import { execFileSync } from "node:child_process";

export const dynamic = "force-static";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export default function RouteContractProofPage() {
  const focused = run("npx", ["tsx", "scripts/verify-route-fact-conductor-contract.ts"]);
  const routeAssist = run("npm", ["run", "verify:route-assist"]);
  return (
    <main>
      <h1>Route contract proof</h1>
      <pre>{focused}</pre>
      <pre>{routeAssist}</pre>
    </main>
  );
}
