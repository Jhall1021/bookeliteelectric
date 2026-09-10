/**
 * Proves lib/device-handoff/* — no database, no network. See
 * docs/design/device-handoff-v1.md for what this does and does not prove:
 * it proves the token/lifecycle domain is sound. It does NOT prove
 * end-to-end resume, because there is no persisted mid-flow session for a
 * handoff to resume yet — see that doc's "genuine blocker" section.
 *
 * Run: npx tsx scripts/verify-device-handoff-domain.ts
 */

import {
  completeHandoff,
  connectHandoff,
  createHandoff,
  desktopPresentationState,
  generateHandoffToken,
  handoffFieldViolations,
  handoffUrl,
  isExpired,
  resolveHandoff,
  revokeHandoff,
  tokenHasSufficientEntropy,
  tokenMatchesHash,
  ttlWithinPolicy,
  urlLeaksNoIdentifiers,
} from "../lib/device-handoff";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok — ${name}`);
  } else {
    failures++;
    console.error(`  FAIL — ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
section("Field registry — no PII/payload fields");
// ---------------------------------------------------------------------------
check("zero forbidden-field violations", handoffFieldViolations().length === 0, handoffFieldViolations().join("; "));

// ---------------------------------------------------------------------------
section("Token — entropy and URL hygiene");
// ---------------------------------------------------------------------------
{
  const raw = generateHandoffToken();
  check("token has sufficient entropy (32 random bytes)", tokenHasSufficientEntropy(raw));
  check("two generated tokens differ", generateHandoffToken() !== generateHandoffToken());
  check("QR URL leaks no session/task identifiers", urlLeaksNoIdentifiers("https://elite.example.com", raw));
  const url = handoffUrl("https://elite.example.com/", raw);
  check("URL is well-formed (no double slash from trailing base slash)", !url.includes("//handoff"));
  check("URL contains the opaque token", url.includes(encodeURIComponent(raw)));
}

// ---------------------------------------------------------------------------
section("Create + resolve — the happy path");
// ---------------------------------------------------------------------------
{
  const now = new Date("2026-09-10T12:00:00Z");
  const { handoff, rawToken } = createHandoff({
    id: "h1",
    guidedFlowSessionId: "qs_1",
    taskType: "ROUTE_ASSIST",
    taskId: "route_task_1",
    now,
  });
  check("TTL is within the 15-30 minute policy", ttlWithinPolicy(handoff, now));
  check("status starts AVAILABLE", handoff.status === "AVAILABLE");
  check("stores only a hash, never the raw token", !("token" in handoff) && typeof handoff.tokenHash === "string" && handoff.tokenHash !== rawToken);
  check("the raw token verifies against the stored hash", tokenMatchesHash(rawToken, handoff.tokenHash));
  check("a wrong token does not verify", !tokenMatchesHash("not-the-token", handoff.tokenHash));

  const resolved = resolveHandoff(handoff, rawToken, now);
  check("resolves ok with the correct token", resolved.ok === true);

  const wrongToken = resolveHandoff(handoff, "wrong", now);
  check("wrong token fails safely with TOKEN_MISMATCH, exposing nothing else", !wrongToken.ok && wrongToken.reason === "TOKEN_MISMATCH");
}

// ---------------------------------------------------------------------------
section("Connect / complete lifecycle");
// ---------------------------------------------------------------------------
{
  const now = new Date("2026-09-10T12:00:00Z");
  const { handoff, rawToken } = createHandoff({ id: "h2", guidedFlowSessionId: "qs_2", taskType: "ROUTE_ASSIST", now });
  check("desktop starts WAITING_FOR_PHONE", desktopPresentationState(handoff, now) === "WAITING_FOR_PHONE");

  const connected = connectHandoff(handoff, now);
  check("connect succeeds", connected.ok === true);
  if (connected.ok) {
    check("desktop reflects PHONE_CONNECTED", desktopPresentationState(connected.handoff, now) === "PHONE_CONNECTED");
    const reconnected = connectHandoff(connected.handoff, now);
    check("reconnecting is idempotent, not an error", reconnected.ok === true);

    const completed = completeHandoff(connected.handoff, now);
    check("complete succeeds", completed.ok === true);
    if (completed.ok) {
      check("desktop reflects TASK_COMPLETED", desktopPresentationState(completed.handoff, now) === "TASK_COMPLETED");

      // §"customer scans an already-completed handoff" — resolves safely,
      // does not error and does not recreate the task.
      const rescanned = resolveHandoff(completed.handoff, rawToken, now);
      check("re-scanning a completed handoff resolves safely (not an error)", rescanned.ok === true);

      const revokeAfterComplete = revokeHandoff(completed.handoff);
      check("a completed handoff cannot be revoked", !revokeAfterComplete.ok && revokeAfterComplete.reason === "ALREADY_COMPLETED");
    }
  }
}

// ---------------------------------------------------------------------------
section("Expiry and revocation fail safely");
// ---------------------------------------------------------------------------
{
  const createdAt = new Date("2026-09-10T12:00:00Z");
  const { handoff, rawToken } = createHandoff({ id: "h3", guidedFlowSessionId: "qs_3", taskType: "PHOTO_CAPTURE", now: createdAt, ttlMinutes: 20 });
  const wayLater = new Date(createdAt.getTime() + 25 * 60_000);

  check("handoff reads as expired after its TTL", isExpired(handoff, wayLater));
  const expiredResolve = resolveHandoff(handoff, rawToken, wayLater);
  check("resolving an expired handoff fails with EXPIRED, not a crash", !expiredResolve.ok && expiredResolve.reason === "EXPIRED");
  check("desktop reflects HANDOFF_EXPIRED", desktopPresentationState(handoff, wayLater) === "HANDOFF_EXPIRED");

  const revoked = revokeHandoff(handoff);
  check("revoke succeeds on a non-completed handoff", revoked.ok === true);
  if (revoked.ok) {
    const revokedResolve = resolveHandoff(revoked.handoff, rawToken, createdAt);
    check(
      "a revoked handoff fails safely even with a valid, unexpired token — exposes nothing",
      !revokedResolve.ok && revokedResolve.reason === "REVOKED"
    );
  }
}

// ---------------------------------------------------------------------------
section("Invalid token exposes no information");
// ---------------------------------------------------------------------------
{
  // A caller resolving with a token that doesn't match any stored hash gets
  // the same generic TOKEN_MISMATCH regardless of whether a handoff for
  // this id exists — the type signature already forces this: resolveHandoff
  // only ever returns {reason} on failure, never a handoff.
  const { handoff } = createHandoff({ id: "h4", guidedFlowSessionId: "qs_4", taskType: "VISUAL_ASSIST" });
  const outcome = resolveHandoff(handoff, "totally-invalid-guess", new Date());
  check("failure result carries no guidedFlowSessionId/taskId", !outcome.ok && !("guidedFlowSessionId" in outcome) && !("taskId" in outcome));
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
