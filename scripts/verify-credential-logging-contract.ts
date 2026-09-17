/**
 * Proves the REVIEW OF c687467 credential-logging fix: neither the success
 * log both `checkDeployedIdentityAndNoSend` (orchestrator) and
 * `checkDeployedIdentityMatches` (manual harness) print, nor the shared
 * top-level error sanitizer, ever leak a full connection string's password
 * or a bypass-secret-shaped value. Pure source; no network call.
 *
 *   npx tsx scripts/verify-credential-logging-contract.ts
 */
import { describeTargetForLog } from "./_deployedIdentityCheck";
import { sanitizeForLog } from "./_sanitizeOutput";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const FAKE_PASSWORD = "s3cr3t-fake-password-9f3a";
const FAKE_BYPASS_TOKEN = "fake-bypass-token-4b21";
const TARGET_URL = `postgresql://rehearsal_admin:${FAKE_PASSWORD}@ep-designated-branch-pooler.c-5.us-east-2.aws.neon.tech:5432/rehearsal`;

console.log("\nCREDENTIAL LOGGING — connection-string/bypass-token redaction contract\n");

// ── 1. the exact success-log line format both callers now use never embeds the raw connection string ──
{
  const line = `  deployed app identity confirmed for ${describeTargetForLog(TARGET_URL)}, and no transactional/platform Resend key is configured server-side`;
  ok("the success log's own text never contains the password", !line.includes(FAKE_PASSWORD), line);
  ok("the success log's own text never contains the full connection string", !line.includes(TARGET_URL), line);
  ok("the success log still names the nonsecret host and database, so a caller can recognize which target passed", line.includes("ep-designated-branch") && line.includes("rehearsal"), line);
}

// ── 2. sanitizeForLog redacts a //user:pass@ connection string embedded in an arbitrary error message ──
{
  const raw = `Can't reach database server at \`${TARGET_URL}\` — connection refused`;
  const sanitized = sanitizeForLog(raw);
  ok("sanitizeForLog strips the password out of a connection string embedded in a thrown error's own message", !sanitized.includes(FAKE_PASSWORD), sanitized);
  ok("sanitizeForLog leaves the surrounding error text intact", sanitized.includes("connection refused"));
}

// ── 3. sanitizeForLog also strips a literal bypass-secret value passed as an extra secret ──
{
  const raw = `deployment-identity request failed; header was x-vercel-protection-bypass: ${FAKE_BYPASS_TOKEN}`;
  const sanitized = sanitizeForLog(raw, [FAKE_BYPASS_TOKEN]);
  ok("sanitizeForLog strips a literal bypass-token value when passed as an extra secret", !sanitized.includes(FAKE_BYPASS_TOKEN), sanitized);
}

// ── 4. an undefined/absent extra secret is a harmless no-op, not a crash ──
{
  const raw = "some ordinary error with no secrets in it";
  let threw = false;
  let sanitized = "";
  try {
    sanitized = sanitizeForLog(raw, [undefined, process.env.SOME_VAR_THAT_IS_DEFINITELY_NOT_SET]);
  } catch {
    threw = true;
  }
  ok("sanitizeForLog does not throw when an extra secret is undefined", !threw);
  ok("sanitizeForLog leaves ordinary text untouched when there is nothing to redact", sanitized === raw, sanitized);
}

// ── 5. sanitizeForLog redacts BOTH a connection-string password AND a separately-supplied bypass token in the same text ──
{
  const raw = `refused: ${TARGET_URL} ; header x-vercel-protection-bypass: ${FAKE_BYPASS_TOKEN}`;
  const sanitized = sanitizeForLog(raw, [FAKE_BYPASS_TOKEN]);
  ok("both the connection-string password and the bypass token are redacted together", !sanitized.includes(FAKE_PASSWORD) && !sanitized.includes(FAKE_BYPASS_TOKEN), sanitized);
}

console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
if (fail > 0) process.exitCode = 1;
