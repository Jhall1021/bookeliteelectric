/**
 * Focused proof for Finding 4, tightened per REVIEW OF 5322b70: "missing
 * success log lines are not proof of zero writes, and sanitizing the
 * exception inside the TEST cannot prove the CLI's own catch is safe."
 *
 * Fixed by (1) calling the exact exported `runCli` — the real CLI
 * boundary, not a re-implementation of its sanitization — and (2)
 * counting actual calls to injected write-dependency spies rather than
 * checking for the absence of a success log line.
 *
 *   npx tsx scripts/verify-release-wrapper-safety.ts
 */
import { runCli, defaultDeps, type Deps } from "./release-electrical-catalog-to-production";

const FAKE_SECRET = "sekret_test_credential_9f3a7b21";
const POISONED_URL = `postgresql://ghost_user:${FAKE_SECRET}@nonexistent-host-for-testing.invalid:5432/nonexistent_db`;

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

function spyWriteDeps() {
  const calls = { applySchema: 0, installConstraint: 0, rebuildCatalog: 0 };
  return {
    calls,
    applySchema: () => { calls.applySchema++; },
    installConstraint: () => { calls.installConstraint++; },
    rebuildCatalog: async () => { calls.rebuildCatalog++; },
  };
}

/** Runs `runCli`, capturing console output and the exit code it set, without touching process.exitCode's ambient state. */
async function runCliCaptured(opts: Parameters<typeof runCli>[0], deps: Deps): Promise<{ refused: boolean; output: string }> {
  const captured: string[] = [];
  const origLog = console.log, origError = console.error;
  const exitCodeBefore = process.exitCode;
  console.log = (...a: unknown[]) => { captured.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { captured.push(a.join(" ")); };
  process.exitCode = undefined;
  await runCli(opts, deps);
  const refused = process.exitCode === 1;
  process.exitCode = exitCodeBefore;
  console.log = origLog;
  console.error = origError;
  return { refused, output: captured.join("\n") };
}

async function main() {
  console.log("\n1. Injected identity stub throws — zero writes, in both --apply and report-only mode\n");

  for (const apply of [true, false]) {
    const spies = spyWriteDeps();
    const deps: Deps = {
      checkIdentity: async () => { throw new Error("refusing: simulated identity refusal (no real network/DB touched)"); },
      classifySchema: () => { throw new Error("classifySchema should not be reachable — checkIdentity must refuse first"); },
      ...spies,
    };
    const { refused, output } = await runCliCaptured({ targetUrl: POISONED_URL, apply, confirmProduction: apply, recoveryPointConfirmed: apply ? "test-recovery-point" : undefined }, deps);
    check(`apply=${apply}: runCli sets a nonzero exit code (refused)`, refused);
    check(`apply=${apply}: zero calls to applySchema`, spies.calls.applySchema === 0, `actual: ${spies.calls.applySchema}`);
    check(`apply=${apply}: zero calls to installConstraint`, spies.calls.installConstraint === 0, `actual: ${spies.calls.installConstraint}`);
    check(`apply=${apply}: zero calls to rebuildCatalog`, spies.calls.rebuildCatalog === 0, `actual: ${spies.calls.rebuildCatalog}`);
    check(`apply=${apply}: no credential leak in runCli's own output`, !output.includes(FAKE_SECRET), output.includes(FAKE_SECRET) ? "LEAK FOUND" : undefined);
  }

  console.log("\n2. The REAL default identity check (unstubbed) against the poisoned URL, through runCli's actual catch boundary\n");

  const spies2 = spyWriteDeps();
  const deps2: Deps = { ...defaultDeps, ...spies2 };
  const { refused, output } = await runCliCaptured({ targetUrl: POISONED_URL, apply: true, confirmProduction: true, recoveryPointConfirmed: "x" }, deps2);
  check("real identity check refuses on an unreachable/poisoned target (nonzero exit)", refused);
  check("zero calls to applySchema", spies2.calls.applySchema === 0, `actual: ${spies2.calls.applySchema}`);
  check("zero calls to installConstraint", spies2.calls.installConstraint === 0, `actual: ${spies2.calls.installConstraint}`);
  check("zero calls to rebuildCatalog", spies2.calls.rebuildCatalog === 0, `actual: ${spies2.calls.rebuildCatalog}`);
  check("the injected credential never appears anywhere in runCli's real catch output", !output.includes(FAKE_SECRET), output.includes(FAKE_SECRET) ? `LEAK FOUND: ${output}` : undefined);

  if (failures > 0) {
    console.error(`\n  ${failures} check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log("\n  all wrapper-safety checks passed.\n");
}

main();
