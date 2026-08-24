/**
 * Service matcher — verification.
 *
 *   npx tsx scripts/verify-service-match.ts
 *
 * No database, no network, no model call. Feeds parseResponse the replies a
 * model actually produces and checks what comes out.
 *
 * The cases that matter are the lossy ones. A parser bug here doesn't throw —
 * it drops half of what the customer asked for and returns something that
 * looks like a confident answer.
 */

import { parseResponse, screenForEmergency, MAX_INTENTS, type MatchResult } from "../lib/serviceMatch";

const CATALOG = [
  { slug: "standard-outlet", name: "Install a Standard Outlet", categorySlug: "outlets-switches" },
  { slug: "dedicated-circuit", name: "Dedicated Circuit", categorySlug: "outlets-switches" },
  { slug: "replace-interior-light-fixture", name: "Replace Interior Light Fixture", categorySlug: "lighting" },
  { slug: "new-ceiling-light", name: "Install New Ceiling Light", categorySlug: "lighting" },
  { slug: "new-ethernet-line", name: "Install New Ethernet / Network Line", categorySlug: "tv-data" },
];

let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n      ${detail}`}`);
}
const j = (o: unknown) => JSON.stringify(o);

// ---------------------------------------------------------------------------
console.log("\nSINGLE JOB — must behave exactly as before\n");

{
  const r = parseResponse(
    j({ items: [{ label: "bedroom outlet", slug: "standard-outlet", confidence: 0.9, reason: "A standard outlet." }] }),
    CATALOG
  );
  ok(r.kind === "suggestion", "one item collapses to a plain suggestion", `got ${r.kind}`);
  ok(r.kind === "suggestion" && r.serviceSlug === "standard-outlet", "with the right slug");
  ok(!("label" in r), "and no per-item label leaks into the single shape");
}
{
  // The old single-object shape, which a cached or stubborn reply may use.
  const r = parseResponse(j({ slug: "standard-outlet", confidence: 0.8, reason: "x" }), CATALOG);
  ok(r.kind === "suggestion", "the older single-object reply still parses", `got ${r.kind}`);
}
{
  const r = parseResponse(
    j({ items: [{ label: "dining light", slug: null, candidates: ["replace-interior-light-fixture", "new-ceiling-light"], clarify: "Is there a light there now?" }] }),
    CATALOG
  );
  ok(r.kind === "clarify", "a single ambiguous job is still a clarify", `got ${r.kind}`);
  ok(r.kind === "clarify" && r.candidates.length === 2, "with both candidates");
}
{
  const r = parseResponse(j({ items: [{ label: "generator", outOfScope: true }] }), CATALOG);
  ok(r.kind === "out_of_scope", "a single out-of-scope job is unchanged");
}
{
  ok(parseResponse("not json at all", CATALOG).kind === "unsure", "unparseable json is unsure");
  ok(parseResponse(j({ items: [] }), CATALOG).kind === "unsure", "no items is unsure");
}

// ---------------------------------------------------------------------------
console.log("\nTWO JOBS — nothing may be dropped\n");

const twoJobs = j({
  distinctJobs: 2,
  items: [
    { label: "outlet for a phone charger", slug: "standard-outlet", confidence: 0.9, reason: "A standard outlet." },
    { label: "dining room table light", slug: null, candidates: ["replace-interior-light-fixture", "new-ceiling-light"], clarify: "Is there a light there now?" },
  ],
});
{
  const r = parseResponse(twoJobs, CATALOG);
  ok(r.kind === "multi", "two jobs produce a multi", `got ${r.kind}`);
  if (r.kind === "multi") {
    ok(r.items.length === 2, "both jobs survive");
    ok(r.items[0].kind === "suggestion" && r.items[1].kind === "clarify",
       "each keeps its own outcome — one resolved, one still a question");
    ok(r.items[0].label === "outlet for a phone charger", "the customer's own words are preserved");
  }
}
{
  // The mixed case that used to be impossible to express.
  const r = parseResponse(
    j({ distinctJobs: 2, items: [
      { label: "bedroom outlet", slug: "standard-outlet", confidence: 0.9 },
      { label: "service my generator", outOfScope: true },
    ]}),
    CATALOG
  );
  ok(r.kind === "multi", "one real service plus one out-of-scope stays a multi");
  if (r.kind === "multi") {
    ok(r.items.some((i) => i.kind === "suggestion"), "the real service is kept");
    ok(r.items.some((i) => i.kind === "out_of_scope"), "the out-of-scope job is NOT silently dropped");
  }
}
{
  // A bad slug in one item must not poison the other.
  const r = parseResponse(
    j({ distinctJobs: 2, items: [
      { label: "outlet", slug: "standard-outlet", confidence: 0.9 },
      { label: "something", slug: "a-service-that-does-not-exist", confidence: 0.9 },
    ]}),
    CATALOG
  );
  ok(r.kind === "multi", "an invented slug doesn't collapse the whole answer");
  if (r.kind === "multi") {
    ok(r.items[0].kind === "suggestion" && r.items[1].kind === "unsure",
       "the invented one becomes unsure, the real one survives");
  }
}
{
  // The model splitting one job in two.
  const r = parseResponse(
    j({ distinctJobs: 2, items: [
      { label: "outlet in bedroom", slug: "standard-outlet", confidence: 0.9 },
      { label: "outlet in hallway", slug: "standard-outlet", confidence: 0.9 },
    ]}),
    CATALOG
  );
  ok(r.kind === "suggestion", "the same service twice collapses to one — quantity is chosen in the flow",
     `got ${r.kind}`);
}

// ---------------------------------------------------------------------------
console.log("\nCAPS\n");

{
  const r = parseResponse(j({ distinctJobs: 9, items: [] }), CATALOG);
  ok(r.kind === "too_many", "nine jobs routes to the service list", `got ${r.kind}`);
  ok(r.kind === "too_many" && r.count === 9, "and says how many it found");
}
{
  // More items than the cap, even without distinctJobs set.
  const r = parseResponse(
    j({ items: [
      { label: "a", slug: "standard-outlet" },
      { label: "b", slug: "new-ceiling-light" },
      { label: "c", slug: "new-ethernet-line" },
      { label: "d", slug: "dedicated-circuit" },
    ]}),
    CATALOG
  );
  ok(r.kind === "multi" && r.items.length === MAX_INTENTS,
     `more items than the cap are trimmed to ${MAX_INTENTS}`);
}

// ---------------------------------------------------------------------------
console.log("\nSAFETY — the screen runs on the whole raw string, before any of this\n");

{
  const mixed = "my panel is buzzing and sparking and I also want a new outlet in the bedroom";
  const screen = screenForEmergency(mixed);
  ok(screen.isEmergency, "an emergency buried in a two-job request still fires",
     `matched: ${screen.matched.join(", ") || "nothing"}`);
}
{
  const benign = "add an outlet for a phone charger and install a dining room light";
  ok(!screenForEmergency(benign).isEmergency, "an ordinary two-job request is not an emergency");
}
{
  // The property that matters: the screen never sees a fragment, so it can't
  // be defeated by splitting. Any substring that fires must fire on the whole.
  const parts = ["I want a new outlet", "the panel is sparking"];
  const whole = parts.join(" and ");
  const anyPart = parts.some((p) => screenForEmergency(p).isEmergency);
  ok(!anyPart || screenForEmergency(whole).isEmergency,
     "anything that would fire on a fragment also fires on the whole string");
}

console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
