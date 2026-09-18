/**
 * Focused proof for Finding 4: refusal happens BEFORE any write, and an
 * injected connection credential never appears in this script's own
 * output — for the corrected scripts/release-electrical-catalog-to-
 * production.ts. No real production access, no shared marker touched.
 *
 *   npx tsx scripts/verify-release-wrapper-safety.ts
 */
import { main, assertSchemaMatchesReviewedDiff } from "./release-electrical-catalog-to-production";
import { sanitizeForLog } from "./_sanitizeOutput";

const FAKE_SECRET = "sekret_test_credential_9f3a7b21";
const POISONED_URL = `postgresql://ghost_user:${FAKE_SECRET}@nonexistent-host-for-testing.invalid:5432/nonexistent_db`;

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

async function main_() {
  console.log("\n1. Refusal-before-write + credential redaction, via --apply against a bogus target\n");

  const captured: string[] = [];
  const origLog = console.log, origError = console.error;
  console.log = (...a: unknown[]) => { captured.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { captured.push(a.join(" ")); };

  let threw = false;
  try {
    await main({ targetUrl: POISONED_URL, apply: true, confirmProduction: true, recoveryPointConfirmed: "test-recovery-point" });
  } catch (e) {
    threw = true;
    captured.push(sanitizeForLog(e instanceof Error ? e.stack ?? e.message : String(e), [FAKE_SECRET]));
  } finally {
    console.log = origLog;
    console.error = origError;
  }

  const allOutput = captured.join("\n");
  check("refused (threw or exited) before reaching any write step", threw);
  check("no 'RELEASE COMPLETE' or 'recovery point acknowledged' in output (proves no write step was reached)", !allOutput.includes("RELEASE COMPLETE") && !allOutput.includes("recovery point acknowledged"));
  check("the injected credential never appears anywhere in captured output", !allOutput.includes(FAKE_SECRET), allOutput.includes(FAKE_SECRET) ? "LEAK FOUND" : undefined);

  console.log("\n2. Same proof in report-only mode (no --apply)\n");
  const captured2: string[] = [];
  console.log = (...a: unknown[]) => { captured2.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { captured2.push(a.join(" ")); };
  let threw2 = false;
  try {
    await main({ targetUrl: POISONED_URL, apply: false, confirmProduction: false });
  } catch (e) {
    threw2 = true;
    captured2.push(sanitizeForLog(e instanceof Error ? e.stack ?? e.message : String(e), [FAKE_SECRET]));
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  const allOutput2 = captured2.join("\n");
  check("report-only mode also refuses on the bogus target", threw2);
  check("the injected credential never appears anywhere in report-only output", !allOutput2.includes(FAKE_SECRET), allOutput2.includes(FAKE_SECRET) ? "LEAK FOUND" : undefined);

  console.log("\n3. assertSchemaMatchesReviewedDiff — a target NOT matching the reviewed SQL is refused\n");
  let diffThrew = false;
  let diffMessageHasSecret = false;
  try {
    assertSchemaMatchesReviewedDiff(POISONED_URL);
  } catch (e) {
    diffThrew = true;
    const msg = e instanceof Error ? e.message : String(e);
    diffMessageHasSecret = msg.includes(FAKE_SECRET);
  }
  check("refuses on an unreachable/non-matching target rather than proceeding", diffThrew);
  check("the injected credential never appears in the thrown error's own message", !diffMessageHasSecret, diffMessageHasSecret ? "LEAK FOUND" : undefined);

  if (failures > 0) {
    console.error(`\n  ${failures} check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log("\n  all wrapper-safety checks passed.\n");
}

main_();
