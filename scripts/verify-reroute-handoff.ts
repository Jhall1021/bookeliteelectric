/**
 * Regression for the reroute-handoff mechanism (Decision Tree Audit V1,
 * finding B.4 — a rerouted customer's stated symptom used to reach the
 * technician nowhere) and its extraction into lib/rerouteHandoff.ts.
 *
 *   npx tsx scripts/verify-reroute-handoff.ts
 *
 * WHAT THIS IS, PRECISELY
 *
 * A pure-function unit test, not a browser or component test. GuidedFlowEngine
 * and RerouteNotice are React components coupled to next/navigation, a real
 * DOM (sessionStorage), and — for the troubleshooting page specifically — a
 * Server Component that queries the database directly (no fetch to mock).
 * This repo has no component-test framework (no jsdom, no React Testing
 * Library — only `playwright`, this project's convention for actual browser
 * tests, which needs a real running server; the troubleshooting page can't
 * render without a database this session doesn't have — see the
 * reconciliation doc). So the handoff's PARSING and CONSTRUCTION logic was
 * extracted into pure functions specifically so it CAN be tested without any
 * of that, and this is that test.
 *
 * What it proves: given a raw string (what sessionStorage would have held)
 * and a target identity, `consumeHandoffForTarget` decides correctly what to
 * apply. What it does NOT prove: that GuidedFlowEngine actually calls
 * sessionStorage.getItem/removeItem/setItem at the right moments, that a real
 * browser navigation preserves the value, or that a real diagnostic booking
 * persists the resulting note to a database — those need the browser and
 * database access this session doesn't have, and are listed as open gates in
 * the follow-through report rather than claimed here.
 */

import {
  serializeHandoff,
  consumeHandoffForTarget,
  buildTroubleshootingNote,
} from "../lib/rerouteHandoff";

let pass = 0;
let fail = 0;
function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

// ---- Direct entry: no handoff at all -------------------------------------
{
  const consumed = consumeHandoffForTarget(null, "svc-troubleshooting", ["some_key"]);
  ok("direct entry (no handoff in storage) applies nothing",
    Object.keys(consumed.answers).length === 0 && consumed.customerNote === "");
}
{
  // sessionStorage.getItem returns null for a missing key, but a caller
  // might also pass undefined (e.g. an SSR-safe wrapper) — both mean "no
  // handoff," not "malformed handoff."
  const consumed = consumeHandoffForTarget(undefined, "svc-troubleshooting", []);
  ok("undefined (as well as null) is treated as no handoff", Object.keys(consumed.answers).length === 0);
}

// ---- REROUTE_SERVICE shape: answers, filtered to the target's own keys --
{
  const raw = serializeHandoff({
    targetServiceId: "svc-new-outlet",
    answers: { below_above_access: "has_access", unrelated_key: "some_value" },
  });
  const consumed = consumeHandoffForTarget(raw, "svc-new-outlet", ["below_above_access", "outlet_run_distance"]);
  ok("a matching-service handoff applies only answers the target actually asks about",
    consumed.answers.below_above_access === "has_access" && !("unrelated_key" in consumed.answers),
    JSON.stringify(consumed));
}

// ---- Anti-leak: wrong target service ------------------------------------
{
  const raw = serializeHandoff({
    targetServiceId: "svc-new-outlet",
    answers: { below_above_access: "has_access" },
    customerNote: "should never surface elsewhere",
  });
  const consumed = consumeHandoffForTarget(raw, "svc-a-totally-different-service", ["below_above_access"]);
  ok("a handoff addressed to a different service leaks nothing — no answers, no note",
    Object.keys(consumed.answers).length === 0 && consumed.customerNote === "",
    JSON.stringify(consumed));
}

// ---- B.4: troubleshooting note, always available, decoupled from disclaimer ----
{
  const withDisclaimer = buildTroubleshootingNote(
    "Single-Pole Breaker Replacement",
    "It keeps tripping",
    "When a breaker trips repeatedly, we'd rather find out why before replacing it."
  );
  ok("the note includes both the answer's own label and its disclaimer, when present",
    withDisclaimer.includes('"It keeps tripping."') && withDisclaimer.includes("find out why"),
    withDisclaimer);

  // B.5's other half: two of three breaker-reroute answers have no authored
  // disclaimer. The note must still be meaningful — built from the label
  // alone — not blank or "undefined".
  const withoutDisclaimer = buildTroubleshootingNote("Single-Pole Breaker Replacement", "I'm not sure", null);
  ok("the note is still meaningful with no disclaimer at all — never blank, never the literal string 'null'",
    withoutDisclaimer.includes('"I\'m not sure."') && !withoutDisclaimer.includes("null") && !withoutDisclaimer.includes("undefined"),
    withoutDisclaimer);
}

// ---- The note reaches consumeHandoffForTarget UNFILTERED against question keys ----
{
  const note = buildTroubleshootingNote("Replace Standard Outlet", "It stopped working", null);
  const raw = serializeHandoff({ targetServiceId: "svc-troubleshooting", customerNote: note });
  // electrical-troubleshooting has ZERO questions — an empty key list is the
  // real shape this hits in production, and is exactly the case the
  // original bug fell into (nothing to filter against, so the note was
  // dropped entirely before this fix existed).
  const consumed = consumeHandoffForTarget(raw, "svc-troubleshooting", []);
  ok("a customer note reaches a ZERO-question destination intact — the actual B.4 defect",
    consumed.customerNote === note, JSON.stringify(consumed));
}

// ---- Malformed payloads fail closed, never throw -------------------------
{
  const consumed = consumeHandoffForTarget("not json at all {{{", "svc-x", []);
  ok("invalid JSON fails closed to empty rather than throwing", Object.keys(consumed.answers).length === 0);
}
{
  const consumed = consumeHandoffForTarget(JSON.stringify(["not", "an", "object"]), "svc-x", []);
  ok("valid JSON that isn't an object fails closed", Object.keys(consumed.answers).length === 0);
}
{
  const consumed = consumeHandoffForTarget(
    JSON.stringify({ targetServiceId: "svc-x", answers: { a: 42, b: "kept" } }),
    "svc-x",
    ["a", "b"]
  );
  ok("a non-string answer value is dropped rather than coerced or crashing",
    !("a" in consumed.answers) && consumed.answers.b === "kept", JSON.stringify(consumed));
}
{
  const consumed = consumeHandoffForTarget(
    JSON.stringify({ targetServiceId: "svc-x", customerNote: 12345 }),
    "svc-x",
    []
  );
  ok("a non-string customerNote is dropped rather than coerced", consumed.customerNote === "");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
