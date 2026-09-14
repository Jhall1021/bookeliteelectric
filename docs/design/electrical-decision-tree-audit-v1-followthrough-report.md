# Electrical Decision Tree Audit V1 — follow-through report

Branch `audit/electrical-followthrough-v1`, forked from `origin/main` at `64dcf36`, in
an isolated worktree (`/private/tmp/p2b-audit-followthrough-wt`) with its own `npm ci`
and generated Prisma client. **Not pushed anywhere.** No deployment was triggered — see
"Deployment-guard state" at the end.

Five commits, in order:

| SHA | Commit |
|---|---|
| `ab1944c` | `docs: reconcile Electrical Decision Tree Audit V1 against origin/main` |
| `cb8821a` | `fix: price referenced-service add-ons server-side, stop double-charging switch-leg work` |
| `9ec5e6f` | `fix: trade-scope the direct troubleshooting entry, stop discarding reroute context` |
| `d841fdf` | `fix: remove four non-consequential mandatory questions, reword one trade-judgment prompt` |
| `2fef53e` | `docs: structural proposals for review — not implemented` |

Full detail in each commit message and in
[the reconciliation doc](electrical-decision-tree-audit-v1-reconciliation.md) and
[the structural proposals doc](electrical-decision-tree-audit-v1-structural-proposals.md).
This report is the summary the directive asked for; it doesn't repeat everything those
two documents already say in full.

---

## 1. Findings: confirmed, superseded, or still uncertain

### Confirmed against current `origin/main` and fixed (this branch)

| Finding | What changed |
|---|---|
| **B.1** — TV mount add-ons priced at $0 | Sharper than originally reported: the storefront DTO already priced these correctly for *display*; only the authoritative resolver was missing it — a display/charge mismatch, not a uniform $0. Fixed in `lib/serviceTreeQuery.ts` + `lib/routeResolver.ts`. |
| **B.2** — switch-leg double-charge on `new-ceiling-light`/`new-ceiling-fan` | Confirmed unchanged from the audited branch (byte-identical seed file). Fixed by removing `switched_source`, mirroring the shipped `recessed-lighting` fix without importing its unrelated per-light-quantity rebuild. |
| **B.3** — hardcoded diagnostic slug on direct-entry `/troubleshooting` | Confirmed unchanged (`app/[site]/troubleshooting/page.tsx` byte-identical to the audited branch). Fixed: resolves every enrolled trade via a new `findTroubleshootingDestinations()`, branching on 0/1/N eligible destinations. |
| **B.4** — rerouted symptom reached the technician nowhere | Confirmed unchanged. Fixed by reusing the existing `REROUTE_HANDOFF_KEY` sessionStorage mechanism with a `customerNote` field, surfaced as an editable field on `PriceConfirmationCard`. |
| **B.5** — inconsistent explanation between the two troubleshooting landing paths | Confirmed unchanged. Fixed: the mid-flow reroute screen now shows the destination's real `Service.disclaimer` (not a hardcoded "60 minutes") and always shows the answer's own label, not just its optional disclaimer. |
| **B.16** — `240v-garage-outlet`'s single-button pseudo-question | Confirmed unchanged. Fixed: replaced with a real `garage_type` question (shared key with `level-2-ev-charger`), preserving structured intake rather than deleting it. |
| **B.17** — `replace-standard-outlet` asked its safety question twice | Confirmed unchanged. Fixed via the existing `SUPERSEDED_KEYS` mechanism in `seed-device-and-finish-modules.ts`. |
| **B.18** — non-consequential mandatory questions (`dedicated_panel_location`, `soundbar_cable`/`soundbar_conceal`) | Confirmed unchanged. Fixed: removed from the mandatory chain; facts preserved via an existing note field (dedicated-circuit, no new UI needed) or a newly-generalized one (soundbar, reusing B.4's mechanism). |
| **B.19** — `dishwasher-electrical`'s "suitable power" wording | Confirmed unchanged. Reworded to match `garbage-disposal-install`'s already-correct observable-fact phrasing; routing untouched. |

### Confirmed, proposal only (not implemented — see the structural-proposals doc)

B.7 (200A/panel template drift), B.12 (Garage Door Opener Outlet duplicate), B.13 (four
retired dedicated-circuit stubs live in the template), B.14 (inactive mounts standalone),
B.15 (ceiling/switch-wall access merge), and the "publish five unapplied trees" item
(covers B.11 plus the generator-inlet/hot-tub findings). Each has a specific reason it
isn't a mechanical fix — schema gaps, approval-trail gaps, or direct overlap with Routing
V2's own planned rework. Full reasoning in the proposals doc, including one correction
to the original audit: **`dedicated-120v-circuit-outlet` does NOT provably cover
`new-240v-appliance-circuit`'s full scope** — its own tree caps priced-online amperage at
20A/240V and routes "30A or more" to review, so the "generic 240V" service may be a
legitimate narrower catch-all rather than a pure duplicate. This was checked explicitly
per the directive rather than assumed.

### Still uncertain (need a database, not a code read)

- **B.6, B.8, B.9, B.10, B.20, B.21, B.22, B.23** — every finding whose confidence in the
  original audit was already qualified as "high-confidence inference, not database-confirmed"
  (mostly seed-orchestration drift claims about what Elite's *live* database actually
  contains vs. what a fresh seed run would produce). None of these were re-verified this
  session — doing so needs a real database query, which this session didn't have access
  to. They are not superseded; they're exactly where the original audit left them.
- **The "4 unsure-answers-continue" claim** (original audit's routing-totals table) —
  per the evidence-label correction in the reconciliation doc, this was checked for one
  specific answer (`outlet_load_type`'s "unsure," confirmed to terminate in
  `PHOTO_REVIEW`, not `CONTINUE`) but the other three were not traced. Flagged, not
  resolved.
- **$249 vs. $250 (B.22)** and the **56-vs-47 REROUTE_TROUBLESHOOTING discrepancy
  (B.23)** — both explicitly need one database query each; neither was run.

---

## 2. Changes and their resulting behavior

Per fix, what a homeowner (or the technician's job sheet) actually experiences
differently. All **code-confirmed by reading the changed logic and the DB-free
regression** (§5) — **not** browser-observed (§6 explains why, and exactly what's
blocked).

- **TV mount add-ons (B.1):** choosing "add Elite Tilt Mount" or either mount option in
  `tv-installation`/`tv-install-existing-location` now adds that mount's live
  `basePrice` to the stored visit price, matching what the customer is shown. If the
  referenced service is ever missing or unpriced, the route now goes to `REVIEW`
  (`"'<label>' sells another service with no usable price"`) instead of silently
  charging $0.
- **Switch-leg pricing (B.2):** a customer choosing "no existing fixture to tap" on
  `new-ceiling-light`/`new-ceiling-fan` is now priced once, by the Lighting Control
  module's own components, instead of once by a flat legacy modifier and again by the
  module.
- **Direct troubleshooting entry (B.3):** `/troubleshooting` resolves the site's actual
  enrolled trade(s) instead of assuming Elite's own slug. For every contractor today (V1
  allows one trade at a time) this is behaviorally identical to before *when* the
  contractor's diagnostic slug happens to be `electrical-troubleshooting` — the
  difference is it no longer *depends* on that coincidence, and a differently-slugged or
  non-Electrical contractor now gets their own real diagnostic instead of a broken page.
- **Symptom context (B.4):** a customer rerouted from, say, "my breaker keeps tripping"
  now arrives at the diagnostic booking screen with that fact already filled into an
  editable "what should we tell the technician?" field, and it reaches the booked visit's
  `answersSnapshot.customer_note` — where before it reached nowhere.
- **Consistent explanation (B.5):** every troubleshooting reroute, not just the ones
  whose specific answer had an authored disclaimer, now shows what the customer said and
  the destination's real configured terms.
- **240V Garage Outlet (B.16):** now asks one real, useful question (attached / detached
  / outdoor) instead of a "Continue" button that collected nothing.
- **Replace Standard Outlet (B.17):** resolves after one question instead of two, like
  its eight structurally identical siblings.
- **Dedicated circuit / soundbar (B.18):** both drop one and two mandatory-but-inert
  screens respectively; both still let the customer tell the technician the same facts,
  optionally, at the screen they already end on.
- **Dishwasher wording (B.19):** the prompt now asks what's observable ("is one there
  now, plugged in or wired in") instead of a suitability judgment; routing is unchanged.

---

## 3. Before/after walkthroughs and measured question counts

**Measured, not estimated**, per the evidence-label correction — these are the actual
question counts the changed seed files now define, confirmed by reading the code (not a
live database walk, which needs credentials this session didn't have):

| Service | Before | After | Note |
|---|---|---|---|
| `replace-standard-outlet` | 2 | 1 | matches its 8 siblings exactly |
| `new-ceiling-light` (worst case, all questions reached) | 13 | 12 | `switched_source` removed; no other question touched |
| `new-ceiling-fan` (worst case) | 13 | 12 | same |
| `dedicated-120v-circuit-outlet` | 6 | 5 | `dedicated_panel_location` removed |
| `soundbar-installation` | 6 | 4 | `soundbar_cable` + `soundbar_conceal` removed |
| `240v-garage-outlet` | 1 (non-consequential) | 1 (real) | same count, now a genuine question |
| `dishwasher-electrical` | 1 | 1 | wording only, no count change |

**A walk-through, stated precisely (best case, existing switch): before** — attic access
→ existing fixture → existing switch (*priced here, twice*) → lighting control (asks the
same fact again) → dimmer. **After** — attic access → existing fixture → lighting
control (prices it once) → dimmer. The original audit's "5-6 questions" estimate for
this family was for a *further* rebuild merging the height/access module overlap (§B.15
of the audit) — that part is proposed, not implemented (see the structural-proposals
doc); this batch only removed the one duplicated, double-priced question.

---

## 4. Pricing and context-persistence evidence

`scripts/verify-referenced-service-pricing.ts` (new, committed in the pricing-fix
commit), run twice — once immediately after the B.1 fix and again after every
subsequent commit, to confirm nothing later disturbed it:

```
  ok   referenced price resolves and prices the mount once
  ok   unresolved reference goes to REVIEW, not a $0 price
  ok   REVIEW never reports a status of PRICED for the same input
  ok   an ordinary (non-referencing) answer is unaffected by this fix

4 passed, 0 failed
```

This is a **DB-free unit test**, not an end-to-end proof: `resolveRoute` is a pure
function given an already-loaded service tree, and the script constructs that tree
synthetically rather than querying a real database. It proves the *logic* is correct; it
does not prove the live database round-trips the same way, which needs the browser
coverage in §6.

**Context-persistence (B.4)** has no equivalent automated proof — it depends on
`sessionStorage`, `useEffect` mount timing, and a real navigation between two pages,
none of which are exercisable outside a browser. This is stated as an explicit gap, not
implied to be covered by the pricing script above.

---

## 5. Gate results

- **`npx tsc --noEmit`** (full repository): **zero errors**, re-run after every commit in
  this branch. This is the only repository-wide gate this session could run — see §6 for
  why the rest of `npm run verify` (seed-execution assertions, `capture-trade-electrical.ts
  --check`, every `PrismaClient`-backed `verify-*.ts` script) needs a database this
  session never had.
- **`scripts/verify-referenced-service-pricing.ts`**: 4/4, DB-free, described above. Not
  yet added to `npm run verify`'s chain — that's a `package.json` edit, left as a
  deliberate, separate decision per this repo's own parallel-session convention (append
  new verifiers in one pass, not scattered across unrelated commits).
- **No seed script was executed against any database.** Every seed-file change in this
  branch is a corrected *definition* — what Elite's catalog would become the next time
  someone with database access runs `prisma/seed-questions.ts`,
  `prisma/seed-dedicated-circuit.ts`, `prisma/seed-appliance-services.ts`, or
  `prisma/seed-device-and-finish-modules.ts` — not a change already reflected in any
  live catalog.

---

## 6. Browser coverage and explicit gaps

**No browser session ran this pass.** Per the directive's constraint: the rejected
action from the audit phase (copying `REHEARSAL_DATABASE_URL` out of the shared `.env`
into an isolated environment) was **not retried in any form**. This branch's worktree
has no `.env`/`.env.local` at all — a fresh `git worktree add` doesn't copy gitignored
files, so any database-backed script fails immediately and loudly rather than silently
reaching a real database. That's the correct, safe state to leave it in, not a
workaround.

No other already-authorized, credential-free environment was available either: this
session did not check whether an existing Vercel Preview deployment for `origin/main`
is reachable, because even a reachable one would show the **pre-fix** behavior (none of
this branch's commits are pushed or deployed anywhere) — hitting it could only reproduce
the *original* bugs, not verify the fixes, and the directive's own instruction ("match
each browser claim to the code actually running," "the Routing V2 Preview cannot, by
itself, reproduce defects confined to the older audited branch") argues against treating
any deployed environment as a stand-in for code that only exists in this local branch.
Production was not browsed, read-only or otherwise, per "do not... use Production as a
substitute."

**Exact action that remains blocked:** reading the shared `.env`'s
`REHEARSAL_DATABASE_URL` value to configure an isolated dev server. **Stated reason it
was rejected:** the session's auto-mode safety classifier flags `.env` as a shared
resource. **Missing dependency:** either (a) someone with direct access supplies a
rehearsal `DATABASE_URL` through a channel that isn't reading the shared credentials
file (a fresh disposable Neon branch created and handed over by a human, for instance),
or (b) the permission boundary is explicitly adjusted for this specific, narrow
operation.

**What's left unverified, concretely, once access exists** (the original list from the
authorization, unchanged because none of it could run):

1. TV-mount options and the stored visit price actually matching in a real cart.
2. The two affected switch-leg routes on `new-ceiling-light`/`new-ceiling-fan`.
3. `/troubleshooting` on a contractor whose diagnostic slug isn't
   `electrical-troubleshooting` (or a renamed one), and on a hypothetical multi-trade
   contractor for the N>1 branch (no real contractor can exercise this today — V1 allows
   one trade enrollment at a time, noted in the reconciliation doc).
4. The zero-eligible-trade fallback screen.
5. The reroute context actually surviving a real page navigation and reaching a booked
   visit's `answersSnapshot`.
6. Back navigation and changed answers (the audit's own code-trace concluded this
   already works correctly by design — `GuidedFlowEngine`'s history snapshots predate
   any downstream answer — but this was never browser-confirmed, before or after this
   session).
7. Representative fixed-price / review / reroute paths generally.
8. The four simplification-batch questions' new shape (`garage_type` on
   `240v-garage-outlet`, the shortened dishwasher/outlet/dedicated-circuit/soundbar
   flows).

None of this was claimed as verified. Every claim in this report is labeled
code-confirmed or DB-free-unit-tested, matching the directive's instruction not to
"substitute direct API tests and call the UI verified."

---

## 7. Deployment-guard state

- This branch (`audit/electrical-followthrough-v1`) has **not been pushed** to `origin`
  — confirmed (`git status --short --branch` shows local-only, 5 ahead of `origin/main`,
  no upstream tracking beyond the fetch reference used to fork it).
- No PR was opened, no CI ran, no Vercel build was triggered by this session.
- `origin/main` carries no `vercel.json` deploy-guard entry (that mechanism exists only
  on `feat/electrical-routing-v2`, per the reconciliation doc) — irrelevant here since
  nothing was pushed regardless.
- **Recommendation for next step, not a decision:** these five commits are ready for
  review as-is (each is independently reviewable, in the order committed). Pushing and
  opening a PR is a separate, explicit action this report is not taking on its own.
