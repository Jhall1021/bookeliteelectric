# Electrical V1/V2 integration — reconciling PR #56, PR #62, and Routing V2

**Status: pushed, deployment disabled, not merged into `main`. Nothing applied to
any real database, the canonical template, or any existing contractor's catalog.**
Branch `integration/electrical-v1-v2-reconciliation`, built in an isolated
worktree with its own `npm ci`, on top of PR #56's tip and merged with PR #62's
tip (which itself carries all of `feat/electrical-routing-v2`). PR #56, PR #62,
and `feat/electrical-routing-v2` are all untouched — this branch only reads them.
Reviewed as [draft PR #63](https://github.com/Jhall1021/bookeliteelectric/pull/63);
§0 records the specific findings from that review and how each was closed.

## 0. PR #63 review — findings closed

A bounded release-readiness pass, not a new audit: five specific findings
against the evidence in §§1-8 below, closed one at a time.

### 0.1 The cross-device conflict was still open

The delayed-network regression (§4) proved `persistAnswers`' save queue can no
longer race ITSELF — every writer in that test was the same tab. It never
proved anything about a genuinely independent second writer. Traced and
fixed: on a 409, the in-flight request's own stale payload was correctly
dropped, but the queue's `finally` block still auto-sent whatever was NEXT in
line — including a payload built from this tab's own local state, in total
ignorance of what the other writer had just written. Sending it, now that the
version was resynced, would succeed and silently overwrite the other
writer's newer answers. Fixed by dropping the pending queue on a genuine 409
too, not just the failed request's own payload — a same-tab 409 can no
longer happen at all (the ordering fix already guarantees that), so any 409
reaching this branch is guaranteed to be a different writer.

Proven with a genuinely independent second writer, not a second call from
one page: `scripts/verify-cross-device-stale-queue-browser-flow.ts` — browser
tab A (real `GuidedFlowEngine` code, an artificially delayed PATCH, a second
answer queued behind it) against device B (an unthrottled raw `fetch` sharing
tab A's session identity via the same cookie value the embed header
`lib/session.ts`'s `tokenFromRequest` already treats as equivalent — no
mocked network, no shared browser context). Confirmed the test actually
catches the bug: reverted the fix, re-ran, watched device B's write get
overwritten by tab A's stale queue exactly as predicted, restored the fix,
confirmed it passes.

### 0.2 Browser assertions were not reliable proof

- **REVIEW detection** matched generic `/photo/i` text, which also appears in
  ordinary help copy on the same screen family and would have passed even on
  a route that priced normally. Now waits for `PhotoReviewNotice`'s own
  specific, stable heading ("We can price this remotely.") racing against
  the priced heading — proof of WHICH terminal state was reached.
- **The Back test's promised same-input comparison never actually ran.** It
  asserted the re-answered price differed from the abandoned figure's price
  — true, but insufficient: that alone would not rule out a constant, wrong
  number. Now captures a REFERENCE price for the same footage (20.5 ft) from
  a wholly separate context that never touched Back, and asserts the
  Back-and-re-answer price matches it exactly.

### 0.3 Browser-level stale-price and booking proof

New coverage in `scripts/verify-integration-manual-routing-storefront-
browser-flow.ts` (block F): a price is displayed, a material cost changes
server-side with no reload — exactly like a customer taking a minute to
decide — and "Add to My Visit" is clicked against the now-stale number.
Confirmed via the actual `/api/visit` network response that this is refused
with 409 `REVIEW_REQUIRED` and creates no `LineItem`. Then the office
reapproves the new economics, a reload shows the corrected (different)
price, and THAT booking succeeds with the new price stored — both halves:
the flow cannot book at a stale price, and it still reaches a genuine
booking once the staleness is resolved.

This investigation genuinely suspected a real pricing-safety defect at one
point — the first version of this check assumed the LineItem table started
empty and failed when it found one row after the "refused" attempt.
Diagnosed by capturing the raw `/api/visit` network response directly rather
than guessing from navigation timing: the server had correctly returned 409
the whole time, and the one row was from this SAME service's earlier,
legitimate booking in block A/B/C above (a separate context, a separate
visit). The assertion was wrong, not the product; fixed to compare
before/after counts instead of against zero.

### 0.4 The full gates needed a properly seeded disposable database

§6 previously ran `verify:full` against an empty database and reported the
first missing-fixture wall it hit. Per the clarified scope — local fixture
setup was always allowed; the restriction is on real catalogs and
production — a THIRD disposable database was built with the full catalog
seed chain (`npm run db:seed:all` plus Routing V2's own seed scripts) and one
genuine Elite booking completed through the browser. `verify:full` went from
failing on its first required step to clearing roughly 900 lines of
assertions before its next genuine wall. §6 below is rewritten with the full
result, not just the first failure.

### 0.5 Wording correction

"No segment geometry exists without a Route Assist scan to supply it" and "no
Route Assist segment geometry" both overstated the actual requirement.
Corrected throughout (`scripts/verify-integration-manual-routing-storefront-
browser-flow.ts`, this report): pricing a turn requires the CANONICAL
PHYSICAL FACT of ordered segment geometry, regardless of how that fact is
ever supplied — a Route Assist scan is one way to supply it, not the only
one the system requires. A manual answer of a plain corner COUNT simply
does not carry that fact, which is what the test actually proves.

### 0.6 (second pass) The cross-device fix only dropped the queue — the screen was still stale

A second review of §0.1's fix found it incomplete: dropping the queued
payload stops THIS tab from auto-sending a stale write, but the customer's
own screen — `answers`, the question or price in `state`, the Back stack in
`history` — was still built from the branch this tab was on before the 409.
The very next click (answer a question, hit Back, add to visit) would merge
that stale `answers` with one new field and persist the result: for every
key the OTHER writer had just changed, this tab still held its own old
value, so that merge would send it right back to the server and quietly
overwrite a change that had already applied cleanly. Exactly the failure
"drop the queue" was meant to prevent, one step later than the first fix
was looking.

Fixed in `components/guided-flow/GuidedFlowEngine.tsx`: a genuine 409 now
fully resyncs `answers`, `history` (reset — every entry on it was pushed
while looking at the abandoned branch) and `config`/`state` (recomputed via
the same tree replay `startQuestions` already uses, fed the 409 body's own
`current.consumedAnswers`), and gates the customer behind an explicit
conflict notice ("We picked up an update to this visit from another
device.") that must be dismissed before any further click reaches
`handleAnswer`, `goBack`, or `addToVisit`.

`scripts/verify-cross-device-stale-queue-browser-flow.ts` now proves both
halves: the server's `consumedAnswers` are device B's, AND tab A's own next
action — answering the question the RESYNCED tree actually asks — persists
onto the resynced state (preserving device B's answer) rather than
resubmitting anything stale. Confirmed the test catches a regression here
too: reverted the fix, re-ran, watched the conflict notice never appear
(tab A stayed on its stale screen indefinitely), restored the fix, confirmed
it passes again.

### 0.7 (second pass) The booking proof stopped at the cart, never reached a Booking

§0.3's block F stopped at "Add to My Visit" and checked a `LineItem` — never
completed checkout, never inspected a `Booking`. Extended
`scripts/verify-integration-manual-routing-storefront-browser-flow.ts` to
continue the SAME reapproved, correctly-priced attempt through real NATIVE
scheduling and a no-deposit checkout (the same lifecycle
`scripts/verify-derived-scheduling-browser.ts` already proves in isolation,
driven here so this script can inspect the actual `Booking` row) — a genuine
`bookingId`, a real `Booking.totalCents` checked directly against the
reapproved price.

Then, because the job is now booked, the economics are changed ONE MORE
TIME and both the `Booking` and the `LineItem` it was built from are
re-read: neither moved. `totalCents` on checkout is a sum taken once, at
booking time, from each line's already-fixed `computedPriceCents`
(`app/api/checkout/route.ts` — "Neither can move `totalCents`, which stays
the... homeowner is agreeing to") — this is the browser-level proof that a
homeowner who already booked and confirmed a price never sees it move under
them because of a later cost change, matching what block F's first half
already proved about a price that hadn't been booked yet.

`resetPilotContractor` (which fixture teardown calls) refuses a contractor
with any real `Booking` — deleting one is deliberately not something a
reset ever decides on its own. The script now tears its own booking down
first (`removeBooked`, the same shape
`verify-derived-scheduling-browser.ts` already uses), before the normal
fixture reset runs.

### 0.8 (second pass) The second tenant is now real, and what extracting a local template actually required

§0.4 left `verify:full` stopped on `verify-platform-read-model.ts`'s
2-contractor concurrency check, traced to `onboard-contractor-two.ts
--commit` failing with `NO_PUBLISHED_TEMPLATE` — no published `TemplateVersion`
existed on the properly-seeded database (`p2b_integration_seeded`) for
`installCatalog` to install from. The restriction named in this review round
is on real catalogs and production, not on extracting and provisioning a
template inside a disposable local database — so one was built there, from
that same database's own `elite-electric` fixture (a local, rehearsal-seeded
contractor, not the real one), entirely locally:

1. `npx tsx scripts/extract-template-catalog.ts --from elite-electric`
   (report only) — 74 of 74 services extract cleanly, zero blocking
   refusals (only informational "not template content" categories:
   contractor-owned material quantities and disclaimer text).
2. `npx tsx scripts/extract-template-catalog.ts --from elite-electric --apply`
   — writes a local `electrical v1 SNAPSHOT` `TemplateVersion` to
   `p2b_integration_seeded` only.
3. `prisma/seed-routing-v2-policies.ts` and `prisma/seed-routing-v2-pricing-
   method.ts` — both previously blocked on the missing `TemplateVersion` —
   now run clean against it.
4. `npx tsx scripts/onboard-contractor-two.ts --commit` — **BrightPath
   Electric onboarded successfully**: 4 live, approved services
   (`electrical-troubleshooting`, `replace-interior-light-fixture`,
   `replace-led-dimmer`, `replace-standard-outlet`), `canLaunch=true`,
   `blockers=0`. BrightPath is the standing second tenant this whole
   engagement has treated as permanent, not a pilot — it now exists on
   `p2b_integration_seeded` the same way.
5. `npx tsx scripts/verify-platform-read-model.ts` re-run alone: the
   2-contractor concurrency check now passes — "entries are bounded: 3
   contractors, at most 2 in flight when asked for 2" (the third is the
   check's own throwaway fixture).

**A diagnosis in this subsection was WRONG, and §0.9 below corrects it.**
The paragraph as first written here concluded that `extract-template-
catalog.ts` drops Routing V2's component/quantity-binding wiring —
disproven by review: the extraction source used for that test
(`elite-electric` on `p2b_integration_seeded`) still carried the plain
LEGACY `new-120v-outlet` tree at the time, because it had never been
migrated onto the surface-raceway module on THAT database. Extracting a
legacy tree and installing a legacy tree is extraction working correctly,
not a defect in it — a fresh install failing `NO_CONTRACTOR_PRODUCT
(SURFACE_RACEWAY_JOINT)` from a legacy source proves nothing was lost,
because nothing Routing-V2-shaped was ever there to lose. The ACTUAL,
confirmed omission — `extract-template-catalog.ts` silently writing the
schema default `pricingMethod` regardless of what the source service
actually has — is a real, narrow, and different bug, closed in §0.9.

### 0.9 (third pass) The real extraction omission — `pricingMethod` — fixed and proven end to end

Confirmed by direct code reading: `extract-template-catalog.ts`'s `buildOne`/
`write` never read or wrote `pricingMethod` at all, so every extracted
`TemplateService` silently got the schema default (`LEGACY_PUBLISHED`)
regardless of what the source service actually had. This was invisible in
every extraction run before this pass only because the default and the
source's true value happened to coincide (nothing had ever extracted a
service whose source pricingMethod differed from the default).

Fixed in `scripts/extract-template-catalog.ts`: the source service's
`pricingMethod` is now read (`svc.pricingMethod`) and carried through to the
written `TemplateService`, the same way `bookingType`/`photoState`/every
other structural field already was.

**Proven live, not just by code reading** — a real before/after run: Elite's
`new-120v-outlet` was temporarily flipped to `pricingMethod:
DERIVED_RESOLVED_SCOPE` on the source, re-extracted, and the template's own
copy was confirmed to now read `DERIVED_RESOLVED_SCOPE` too (previously it
would have stayed `LEGACY_PUBLISHED` regardless). Elite's source was then
reverted to its real value (`LEGACY_PUBLISHED` — no supported action ever
promotes an EXISTING contractor's own service to `DERIVED_RESOLVED_SCOPE`;
`prisma/seed-routing-v2-pricing-method.ts`'s own docstring is explicit that
this is a template-level decision about what a contractor provisioned "from
here on" receives, deliberately not retroactive) and the template
re-extracted a final time to restore the correct, faithful end state.

**`--apply` now also refuses production, by identity and not by name** — the
same check `scripts/publish-plumbing-template.ts` already uses for the
identical class of decision (a batch write that replaces what every future
install of a trade receives). Nothing had ever protected this script against
being pointed at Neon by accident; `--i-know-this-writes-to-production` is
now the only way past the refusal.

### 0.10 (third pass) Completing the source catalog: Elite's own tree, migrated, and a real bug found in doing it

For extraction to produce anything Routing-V2-shaped, the SOURCE has to
actually carry the surface-raceway tree — `p2b_integration_seeded`'s own
`elite-electric` never had it; `db:seed:all`'s `seed-questions.ts` leaves
`new-120v-outlet` on the plain legacy distance-band structure. Migrated with
the existing, already-shipped tool built for exactly this:
`npx tsx prisma/seed-new-outlet-v2.ts` (`migrateEliteOutletToV2`) — the
surface-mounted, accessible-concealed and finished-wall modules are now
genuinely wired above the qualification gate (`purpose` ->
`below_above_access` -> `outlet_install_method`), on Elite's real service,
not a fixture's.

**A real, previously-undetected bug surfaced immediately**:
`scripts/verify-question-order.ts` — never previously run against a database
where this migration had executed — failed on `elite-electric/new-120v-
outlet`: the migration's own retirement step
(`RETIRED_OUTLET_QUESTIONS`) set every retired question to the SAME sentinel
`order: 900`, violating the "no two of a service's questions share a
position" invariant the moment more than one question retires at once (four
always do). Fixed in `prisma/seed-new-outlet-v2.ts`: each retired question
now gets its own sentinel (`900 + i`) — nothing reads a retired question's
order for meaning, so uniqueness is all that was ever required. Re-ran the
migration and `verify-question-order.ts` individually to confirm
`new-120v-outlet` no longer appears in its failures (a second, unrelated,
pre-existing duplicate on `elite-electric/fan-replacing-light` remains — see
§6).

Re-extracted with both fixes in place; `prisma/seed-routing-v2-policies.ts`
and `prisma/seed-routing-v2-pricing-method.ts` re-run to restore the
template's deliberate `new-120v-outlet` -> `DERIVED_RESOLVED_SCOPE` override
on top of the now-faithful extraction.

### 0.11 (third pass) Two fresh contractors, through supported installation, never repaired

`scripts/verify-two-fresh-contractors-routing-v2-browser-flow.ts` (new):
builds TWO independent contractors via the same supported
`preflight`/`installCatalog` + wizard-action lifecycle
`_derivedStorefrontFixture.ts` already uses (nothing hand-patched onto
either's tree), each given its OWN, genuinely different material costs (a
changed channel cost, the same `writeMaterialCost` action any contractor's
admin would use) before either is driven through the browser. For EACH:

- manual completion, zero Route Assist interaction, resolves to a real price
- fractional footage (20.5 ft and 33.25 ft) prices correctly
- a turned route (one flat corner) lands on REVIEW, not a guessed price
- the displayed price matches the stored `LineItem.computedPriceCents`,
  under THAT contractor's id and no other

And tenant isolation specifically: A and B were approved at genuinely
different totals; their straight-route prices differ; a cost change to A
made AFTER B's price was already fetched leaves B's price unchanged on a
fresh evaluation (no shared derived-pricing basis or approval across
tenants); B's rows are never reachable under A's `contractorId`; each has
its own `new-120v-outlet` Service row, not a shared one. 3 consecutive clean
runs (16/16 checks each).

**One real, unrelated gap this surfaced, fixed in the fixture builder, not
in Routing V2's own tree**: `activateService` correctly refused
`DEPENDENCY_UNAVAILABLE` — the qualification gate's "a specific large
appliance" answer hands off to "Dedicated Circuit & Outlet"
(`seed-questions.ts`'s own design), and that service was never live for a
freshly installed contractor. Unrelated to Routing V2 and disproportionate
to set up fully (its own economics, a legacy `ADJUSTED` service), so
`_derivedStorefrontFixture.ts` now marks it `active: true` directly for the
fixture contractor — the one fact the dependency check actually reads —
with the reasoning recorded in the code rather than worked around silently.

### 0.12 (third pass) Booked economic provenance: the ANSWERS survive too, not just the price

§0.7 proved a booked price is a snapshot — unmoved by a later cost change.
The other half: a price with no record of what it was priced FROM is
unaccountable to an auditor or a homeowner disputing a charge. Block F now
also captures the booked `LineItem.answersSnapshot` at booking time (the
real `SURFACE_KEYS.feet: "20.5"` the customer actually answered), and
re-reads it after the same later cost change §0.7 used — confirming it is
BYTE-FOR-BYTE unchanged alongside the already-proven unchanged price. Both
halves of what makes a booking accountable are frozen together, not just
the number.

## 1. What was actually being combined

Three branches, forked from **three different points of `main`**, not a simple
two-way merge:

| Branch | Head (short) | Forked from main at | Own unique commits (vs. main) |
|---|---|---|---|
| `audit/electrical-followthrough-v1` (PR #56) | `3a9549c` | `64dcf36` (main's current tip) | 22 |
| `feat/electrical-routing-v2` | `b56d52b` | `737a742` (an older point) | 60 |
| `audit/electrical-tree-finalization-v2` (PR #62) | `ea9edac` | `feat/electrical-routing-v2` @ `b56d52b`, +1 commit | 61 total vs. main |

PR #62 **is** Routing V2 plus one finalization commit — reconciling PR #62
automatically reconciles Routing V2; there was never a separate three-way
question, just PR #56 vs. PR #62. Their common ancestor is `737a742`, an older
point of `main` than PR #56's own fork point — meaning Routing V2 is a long-lived
branch that never rebased onto several weeks of intervening `main` history, and
a large share of the real conflicts below are Routing V2 catching up to that
history, not PR #56 and PR #62 fighting over the same feature.

## 2. The merge and its 12 real conflicts

`git merge origin/audit/electrical-tree-finalization-v2` onto a branch based on
PR #56's tip. 173 files touched in the merge commit; **12 files had genuine
content conflicts**, each resolved by reading both sides' complete, un-conflicted
versions of the surrounding code — never by mechanically picking one side or
taking the union of both blindly.

### Where "the latest implementation" meant Routing V2 was stale, not wrong

Routing V2 forked before several `main`-line changes existed and simply never
picked them up:

- **`app/api/admin/materials/route.ts`, `.../policies/route.ts`,
  `.../services/[serviceId]/route.ts`** — all three used `isAdminAuthenticated()`
  + `withAdminContractor` (manual 401 check, then a context call that throws on
  failure). `main` replaced this with `withAdminRoute`, which translates
  identity/membership failures to proper 401/403/409 responses instead of a
  500 — a real, documented bug fix (`lib/adminContext.ts`'s own comment: "four
  routes returned 500 to a signed-out request"). Kept `withAdminRoute`
  throughout; layered Routing V2's genuine additions on top — `set-cost-by-role`
  guided-onboarding material costs, `DERIVED_RESOLVED_SCOPE` activation
  telemetry (`pilotLog`), the `measurement` policy field.
- **`app/dashboard/services/[serviceId]/page.tsx`** — Routing V2's version
  still built the OLD flat layout (`TreeEditor`, raw `<PricingPanel>`/
  `<PreWorkDepositPanel>` props). `TreeEditor.tsx` no longer exists on this
  branch at all — replaced by the `ServiceWorkspace`/`GuidedPricingWorkspace`
  redesign — and `PreWorkDepositPanel`'s own props changed from
  `depositCents`/`depositCreditsToJob` to `depositRule`/
  `companyDepositAmountCents`. Routing V2's version would not even compile
  against the current component tree. Kept the current layout wholesale.
- **`app/dashboard/bookings/page.tsx`** — kept the newer responsive layout,
  but adopted Routing V2's `formatServiceDate(serviceDateFromStored(...))` in
  place of a raw `new Date(...).toLocaleDateString()`, which can shift a
  calendar-day ArrivalWindow date by one depending on timezone.
- **`components/admin/PricingSettingsForm.tsx`** — combined cleanly: Routing
  V2 made `Settings`'s four fields properly nullable (an undecided rate must
  show empty, not a confident `$0.00`) and updated `toDollars` to match; kept
  that, and kept the newer `SettingsImpact`/`CompareResult` types (the
  "preview the impact of a rate change before committing" feature) Routing V2
  didn't have.

### Where both sides had independently written the same fix

- **`goBack()`'s config restoration** (`components/guided-flow/
  GuidedFlowEngine.tsx`) — Routing V2's own rehearsal hit the identical
  stale-config-on-Back bug PR #56's fourth pass found and fixed, and wrote the
  same `setConfig(previous.config)` / `persistAnswers(previous.answers)` fix
  independently. Collapsed to one copy, keeping PR #56's more complete
  explanatory comment.
- **Referenced-service pricing vs. bound-quantity resolution**
  (`lib/routeResolver.ts`) — these looked like a conflict but are genuinely
  independent precomputations (`resolveReferencedServicePriceCents` for a
  referenced-catalog-item answer; `boundQuantities` for a homeowner-typed
  number driving a component's quantity) that both feed the same `applyBranch`
  call. Kept both.

### Where the conflict was a pure, non-overlapping addition

- **`app/platform/onboarding/[contractorId]/page.tsx`** — PR #56's line added
  a `canRetire`-gated "Retire this business" section; Routing V2's line added
  the "First-service pilot" read-only diagnostic dashboard AND its own,
  un-gated retire section. Kept the pilot dashboard (genuinely new), kept
  PR #56's `canRetire`-gated retire form (Routing V2's version was missing that
  permission check entirely — a real gap, not a stylistic difference).
- **`vercel.json`** — union of every branch's deployment-guard entry, plus
  this branch's own.
- **`package.json`'s `verify:full`/`verify:fast`** — each was one
  un-splittable line both sides had edited differently, so git flagged the
  whole line as conflicting even though the edits didn't overlap.
  Reconstructed programmatically (script kept in the branch's own history):
  union of every script either side added — five from PR #56
  (`verify-reroute-handoff`, `verify-lighting-control-rewire`,
  `verify-referenced-service-pricing`, `verify-mount-price-unit-contract`) plus
  `verify-deployment-identity-auth-host` from PR #62 — with nothing dropped.
  PR #62's own version appeared to *remove* five scripts
  (`verify-platform-capabilities`, `verify-question-order`,
  `verify-catalog-resolution-equivalence`, `verify-jobber-user-pagination`,
  `verify-jobber-account-switch`) — checked and confirmed this was the same
  staleness, not a deliberate retirement: none of those files were ever
  touched by Routing V2's own commit history, they simply postdate its last
  merge from `main`. All five kept.

Full rationale for each file is in this branch's own commit
`f7aace7` (merge commit message) — not repeated here.

## 3. Two real, pre-existing defects the merge's own typecheck caught

Not conflicts — bugs that existed on one side alone and were silent until the
merge's stricter combined types surfaced them.

1. **`lib/catalogResolution.ts`'s bulk `loadCatalogForResolution`** assembled
   each service tree "exactly as `loadServiceForResolution` returns it" (its
   own comment) but never actually added `capabilities` — the contractor
   capability facts `loadServiceForResolution` has carried since Routing V2
   added capability-gated routing questions. Any code reading a
   capability-gated question through the **bulk/catalog** path (the readiness
   engine, catalog promises) instead of the single-service path saw
   `capabilities` as `undefined` rather than the contractor's real facts —
   exactly the class of defect `scripts/verify-catalog-resolution-
   equivalence.ts` exists to catch, caught here only because giving
   `ResolvedServiceTree` an explicit `capabilities` field turned a silent
   structural gap into a type error. Fixed by loading capability facts once
   per contractor (they're contractor-scoped, not per-service) and attaching
   them to every tree the bulk loader assembles.
2. **`app/dashboard/services/[serviceId]/page.tsx`** passed `settings` to
   `PricingPanel` guarded only by "the row exists," not "every rate was
   decided" — `PricingSettings`'s four columns are individually nullable, so
   a contractor mid-setup could pass a partial object where `PricingPanel`'s
   stricter internal type requires concrete numbers. Guarded the same way
   `app/dashboard/setup/page.tsx`'s own `rateSettings` already does.

Commit `e34955f`.

One test fixture also needed updating, not fixing: `scripts/verify-
referenced-service-pricing.ts`'s test 8 started failing on Routing V2's new
"a component's own labor time must be established, same as its price" gate,
because its fixture never set one. Every test in that file already assumed
the test component added no extra labor; now stated explicitly. Commit
`5e0cc33`.

## 4. Rehearsal — disposable local databases only, catalog identities preserved

Two disposable Postgres databases in the same task-owned cluster
(`127.0.0.1:5544`), both stamped (`scripts/verify-database-identity.ts
--stamp`, `local-*` keys only) before any write, per this task's own guard
(`prisma/_assertDisposableLocalDatabase.ts`, from PR #56):

- **`p2b_integration`** — `prisma db push` from this branch's own
  `schema.prisma`, then every script below. Nothing here ran a broad seed
  against an existing contractor; every fixture is its own throwaway
  contractor (`rv2-pilot-rehearsal-*` slugs, PR #62's own naming convention)
  built only through supported lifecycle functions (`installCatalog`,
  `writeMaterialCost`, `activateService`, …) and torn down through the
  matching bounded reset, never a raw delete. `prisma/_moduleHelpers.ts`'s
  `upsertQuestion` — used throughout Routing V2's module authoring — updates
  a question **in place**; nothing in this rehearsal ran an extraction or
  re-provisioning step that could have handed out new ids to already-attached
  modules.
- **`p2b_integration_seeded`** — a THIRD disposable database, added in the
  PR #63 review pass (§0.4): the full catalog seed chain plus Routing V2's
  own seed scripts plus one genuine Elite booking, used for the properly
  seeded `npm run verify:full` run in §6.

### Results

| Suite | Result | Source |
|---|---|---|
| `npx tsc --noEmit` | clean | — |
| PR #56's DB-free suite (referenced-service pricing, lighting-control rewire, reroute handoff, mount price-unit contract, visit-primary) | 26+18+11+14+3 passing, 0 failed | re-run on this branch |
| `scripts/verify-routing-tree-contract.ts` | **410/410** canonical routing contract assertions | PR #62, re-run unchanged |
| `scripts/verify-routing-numeric-browser.ts` | **30/30** manual numeric browser assertions | PR #62, re-run unchanged |
| `scripts/verify-routing-precision-provisioning.ts` | **25/25** database provisioning and pricing assertions | PR #62, re-run unchanged — includes stale-approval→REVIEW and reapproval→PRICED restoration |
| `scripts/verify-back-navigation-config-browser-flow.ts` | 17/17, 1 run | PR #56, re-run on the merged branch |
| `scripts/verify-concurrent-session-creation-browser-flow.ts` | 8/8, 1 run | PR #56, re-run on the merged branch |
| `scripts/verify-delayed-network-answer-save-browser-flow.ts` | 5/5, 1 run — same-tab overlapping saves | PR #56, re-run on the merged branch |
| `scripts/verify-troubleshooting-note-directbook-browser-flow.ts` | 12/12, 1 run | PR #56, re-run on the merged branch |
| `scripts/verify-cross-device-stale-queue-browser-flow.ts` (**extended §0.6**) | 5/5, **3 consecutive runs** — 2 checks now prove the conflict-notice gate and the next action | this branch |
| `scripts/verify-integration-manual-routing-storefront-browser-flow.ts` (**extended §0.7/§0.9-§0.10/§0.12**) | **18/18, 3 consecutive runs**, against the real Elite-derived Routing V2 tree | this branch — see §5 |
| `scripts/verify-two-fresh-contractors-routing-v2-browser-flow.ts` (**new, §0.11**) | 16/16, **3 consecutive runs** — two contractors, tenant isolation | this branch |

### 5. What the integration scripts prove that nothing else did

Every PR #62 suite above proves Routing V2's own logic is intact; every PR #56
suite proves the session/note/Back fixes are intact. None of them drive the
**real storefront** (`GuidedFlowEngine.tsx` + `QuestionStep.tsx`) against a
**real Routing V2 service**, and none of PR #56's own regressions ever
exercised a genuinely independent second writer — which are exactly the two
gaps this branch's own integration scripts close.
`scripts/verify-integration-manual-routing-storefront-browser-flow.ts`
builds one real, approved, active `DERIVED_RESOLVED_SCOPE` outlet service
(via PR #62's own `buildPricedDerivedContractor` — the same helper
`verify-routing-precision-provisioning.ts` uses) and drives it through a
real browser:

- **Manual completion, no Route Assist** — every answer typed into a plain
  textarea or clicked as a plain button; zero interaction with Route Assist's
  scan/photo capture anywhere in the script.
- **Straight-route pricing** — 20.5 ft (the exact figure named in the
  integration instruction), every corner count 0, drywall, clear obstacle →
  a real price, not review.
- **Displayed vs. stored price** — the number shown before "Add to My Visit"
  is read back from the real `LineItem.computedPriceCents` afterward and
  matches exactly.
- **Back / re-answer on a NUMBER question, with the promised same-input
  comparison (§0.2)** — clicked Back from the price screen until the feet
  question itself reappears (not a fixed count — §0.10 put a real
  qualification gate above the route module, which a hardcoded click count
  tied to one tree shape would have silently thrown off), re-typed with a
  different footage (14.625 → 20.5), walked forward again: the price both
  differs from the abandoned figure's, AND
  matches — exactly — a reference price for that same 20.5 ft captured in a
  wholly separate context that never touched Back at all. The server's own
  persisted `consumedAnswers` hold only the final 20.5, not the abandoned
  14.625. `goBack()`'s fix had only ever been proven against multi-choice
  questions before this.
- **Turned-route review, asserted by heading not by generic text (§0.2)** —
  one flat corner instead of zero, otherwise identical: lands on
  `PHOTO_REVIEW`, not a guessed price. Pricing a turn requires the canonical
  physical fact of ordered segment geometry, regardless of how that fact is
  ever supplied — a Route Assist scan is one way to supply it, not the only
  one — and a manual corner COUNT does not carry it. Asserted against
  `PhotoReviewNotice`'s own specific heading, not a generic `/photo/i` match.
- **A cost change between displaying a price and adding it to the visit,
  carried all the way to a real Booking, and a snapshot proof after that
  (§0.3, extended §0.7)** — a price is shown, a material cost changes
  server-side with no reload, and clicking "Add to My Visit" against the
  now-stale number is confirmed (via the real network response) refused
  with 409 `REVIEW_REQUIRED` and creates no `LineItem`. The office
  reapproves the new economics, a reload shows the corrected price, and
  this run continues — through real NATIVE scheduling and a no-deposit
  checkout, not just Add to My Visit — to a genuine `Booking` row, whose
  `totalCents` is checked directly against the reapproved price. The
  economics then change ONE MORE TIME, now that the job is booked, and both
  the `Booking` and the `LineItem` it was built from are re-read to confirm
  neither moved: the stored price is a snapshot taken at booking time, never
  re-derived on a later read. The booked `LineItem.answersSnapshot` (§0.12)
  is captured and re-checked the same way — the customer's actual answers,
  not just the price they produced, survive that same later change
  untouched.

Stale-approval → REVIEW and reapproval → PRICED restoration are proven at
BOTH levels now: `verify-routing-precision-provisioning.ts`'s own "changed
economics invalidate prior approval" / "reapproval restores fixed pricing"
at the function level, and block F above through the actual storefront UI
and the real `/api/visit` network response — the gap named in the PR #63
review.

## 6. `npm run verify:full` — properly seeded, and precisely where it still stops

**Revised in the PR #63 review pass (§0.4).** The first version of this
section ran against a genuinely empty database and reported the very first
missing-fixture wall — `verify-material-cost-atomicity.ts`, `No
CanonicalMaterial found` — without seeding anything, on the assumption that
seeding was out of scope. That assumption was corrected: local fixture
setup was always allowed, and only real catalogs and production are
restricted. This section is the result of actually doing that.

**A third disposable database (`p2b_integration_seeded`)** was built with:

1. The Elite contractor row bootstrapped directly (the historical
   `migrate-material-split` step refuses on an empty database — this is the
   same one-line `contractor.upsert` this repo's own rehearsal-bootstrap doc
   already documents).
2. `npm run db:seed:all` (22 steps; fails at `seed-conditional-disclaimers.ts`
   with `No CanonicalDisclaimer found` — the same pre-existing, documented
   gap: `backfill-disclaimer-split-2026-08-27.ts` has been neutralized since
   28 Aug 2026 and there is no other path to create one from nothing).
3. The remaining seed-all steps run directly: `seed-content-fixes.ts`,
   `seed-labor-hours.ts`, `seed-dedicated-circuit-labor.ts`,
   `repair-trees.ts` (0 dangling, 0 unreachable), `seed-appliance-services.ts`.
4. Routing V2's own seed scripts, in dependency order (components before
   component-materials — the first attempt ran them in the wrong order and
   surfaced exactly that): `seed-routing-v2-material-roles.ts`,
   `seed-routing-v2-components.ts`, `seed-routing-v2-component-materials.ts`,
   `seed-surface-mounted-services.ts`, `seed-routing-v2-fixtures.ts`.
   `seed-routing-v2-policies.ts` and `seed-routing-v2-pricing-method.ts`
   both require a published `TemplateVersion` and were NOT run — see below.
5. `prisma/bootstrap-rehearsal-contractor.ts` (scheduling, business hours,
   service area zip) — the same script §7's own guard covers.
6. **One genuine Elite booking**, completed through an actual browser
   session (`replace-standard-outlet`, one question answered, a real
   scheduled arrival window, real checkout details) — needed because
   `verify-platform-authority.ts`'s "Elite's real booking id is invisible"
   check has nothing to probe on a database with zero bookings, exactly as
   the fourth-pass followthrough report already documented for this same
   check.

**Result, first pass: `npm run verify:full` cleared roughly 900 lines of
assertions before its next wall**, up from failing on the very first
required step. That wall —
`verify-platform-read-model.ts`'s 2-contractor concurrency check — is now
**CLOSED** (§0.8/§0.10): BrightPath is a real, persisted second tenant on
this database, onboarded once a local `TemplateVersion` existed to install
from, and the check passes alone re-run against it.

**Result, second pass (this review round, §0.9-§0.12 in place): re-run in
full, past that point, for the first time.** `npm run verify:full` was run
to completion rather than piecemeal past the OLD wall; the individual
scripts below were then continued past each NEW wall one at a time (the
gate's own `&&` chain stops at the first failure) to map the rest. Every
finding past this point is being reached for the FIRST TIME in this whole
engagement — none of it was previously known to pass or fail.

**Two findings are directly caused by this pass's own work, and are fixed:**

- `verify-question-order.ts`: `elite-electric/new-120v-outlet` had two
  questions at the same order — `migrateEliteOutletToV2`'s own retirement
  step set every retired question to the same sentinel (§0.10). Fixed;
  re-confirmed absent from this check's failures.
- The wording/diagnosis correction in §0.9 (extraction preserves component
  wiring; the real gap was `pricingMethod`) — not a `verify:full` finding,
  but surfaced by the same investigation.

**One finding is a direct, expected, honestly-reported CONSEQUENCE of
migrating Elite's tree, not a defect**: `capture-hero-flow.ts --check`
(marketing) now reports `new-120v-outlet has no path that reaches a price`.
Elite's own copy of the service carries the real surface-raceway tree now,
but — correctly, per §0.9's own finding that no supported action promotes
an EXISTING contractor's service to `DERIVED_RESOLVED_SCOPE` — Elite was
never given the contractor-specific material costs and approval that
pricing depends on; only test fixtures built through
`buildPricedDerivedContractor` receive that. The marketing hero capture
correctly detects that its underlying real service can no longer produce a
price on THIS database, and says so, exactly as designed. Re-capturing it
against a real, priced Elite (or against Elite once it has real economics)
is separate work, not something this pass's own scope reaches.

**Everything past that is a newly-discovered, PRE-EXISTING gap in this
database's `db:seed:all`-based bootstrap — none of it caused by Routing V2
or this pass, all of it out of this bounded pass's scope, and all traced to
one of two root causes:**

- **Elite's and BrightPath's seed-written prices never went through the
  real publish/approval action** (`verify-public-pricing.ts`: 103
  service(s) across both contractors carry a price nobody approved;
  cascades into `verify-pricing-boundary.ts`, `verify-referenced-service-
  pricing.ts`, and `verify-material-baseline-pricing.ts` failing for the
  identical reason, and into `verify-onboarding-readiness.ts`'s "a fully
  configured contractor can launch" check failing because Elite itself
  is `NOTHING_ACTIVATABLE` — nothing on it was ever activated through the
  real lifecycle either. `verify-troubleshooting-route.ts`'s "Elite has no
  resolvable diagnostic service" is the same root cause once more: the
  diagnostic service was seeded, never activated.
- **Elite's bootstrap row itself is incomplete**: `verify-onboarding-
  readiness.ts` also names `COUNTRY_MISSING` — the one-line
  `contractor.upsert` this whole database was bootstrapped from (§6, step
  1) never set `countryCode`.

**Confirmed UNCHANGED from the first pass** (re-run individually, same
result as before any of this round's work): `verify-scheduling-
availability.ts` (no eligible crew), `verify-stripe-connect.ts` (1
failure — no real Stripe connection on the rehearsal row), `verify-payment-
ledger.ts` and `verify-deposit-flow.ts` (missing DB trigger
`payment_events_append_only`, not installed by `prisma db push`).

**Confirmed passing, newly reached, otherwise unremarkable**:
`verify-catalog-resolution-equivalence.ts` (21/21 — Elite's migrated tree
and BrightPath's template-installed one resolve identically), `verify-
mount-price-unit-contract.ts`, `verify-material-cost-holds.ts`, `verify-
permit-policy.ts`, `verify-recompute-by-role.ts`, `verify-pre-work-
visit.ts`, `verify-appointment-kinds.ts`, `verify-contractor-credentials.ts`,
`verify-hvac-template.ts` (1395/1395), `verify-jobber-user-pagination.ts`,
`verify-jobber-account-switch.ts`, `verify-storefront-price-promise.ts`,
`verify-same-visit-promise.ts`, `verify-labor-wizard.ts`, `verify-trade-
enrolment.ts`, `verify-template-installation.ts`, `verify-launch-
behavior.ts`, `verify-activation-dependencies.ts`, and `verify-tax-and-
deposit.ts`.

**One PRE-EXISTING, unrelated defect, confirmed but not fixed (out of
scope)**: `verify-question-order.ts` also names
`elite-electric/fan-replacing-light` — two ACTIVE questions sharing one
order, nothing to do with Routing V2 or this pass's own changes.

**One newly-reached, unrelated static-content finding, confirmed but not
fixed (out of scope, a repo-wide content lint)**: `verify-us-spelling.ts`
fails on 9 British spellings across existing files
("labour", "colour", "behaviour", "grey", "cancelled", and others).

Also individually re-confirmed clean on this seeded database:
`verify-tenant-indexes.ts`, `verify-checkout-atomicity.ts` (14/14),
`verify-category-integrity.ts`, `verify-disclaimer-integrity.ts`, and
`verify-booking-tenancy.ts` (17/17).

## 7. Remaining release blockers

1. **Branch integration itself is done here, not yet reviewed.** This branch
   is the candidate; it has not been reviewed or merged.
2. **Schema adoption.** This branch's `schema.prisma` carries PR #56's
   `GuidedFlowSession.activeSessionKey` (its own migration script,
   `prisma/migrate-guided-flow-session-active-key.ts`, applied so far only to
   disposable local databases) plus Routing V2's ~530-line schema addition.
   Applying either to Neon is a separate, later, explicitly-authorized step —
   not performed here, per `production-neon-requires-explicit-approval`.
3. **Full storefront/booking rehearsal beyond what's proven here.** This
   pass's own new coverage is scoped to one Routing V2 service
   (`new-120v-outlet`, surface-mounted); the finished-wall and concealed-route
   modules, and the rest of Elite's real catalog, are proven at the function
   level (§4) but not yet walked through the browser the way this pass did
   for the surface-mounted path.
4. **`verify:full`'s 2-contractor concurrency wall is closed** (§0.8, §6).
   BrightPath is a real, persisted second tenant on `p2b_integration_seeded`,
   and `verify-platform-read-model.ts`'s concurrency check passes alone.
5. **Routing-V2-capable second-tenant provisioning is also closed** — the
   gap this item previously named. §0.9 corrected the diagnosis (extraction
   already carries component/quantity-binding wiring faithfully; the
   template it was tested against still held a legacy source tree, on this
   database, at the time) and §0.10-§0.11 completed it for real: Elite's own
   source was migrated onto the surface-raceway tree, extraction re-run
   against it, and TWO independent fresh contractors were proven to receive
   a fully working Routing V2 tree through ordinary `installCatalog`,
   including tenant isolation between them (§0.11).
6. **`verify:full`, run to completion for the first time, surfaced a
   materially different, PRE-EXISTING wall — not a Routing V2 or this pass's
   own defect.** §6 has the full breakdown; in short, roughly 100 services
   across Elite and BrightPath carry prices that were seed-written rather
   than published through the real approval action, which cascades into
   several pricing-consistency gates and into Elite's own
   `verify-onboarding-readiness.ts` launchability. This is a `db:seed:all`
   bootstrap-wide gap, orthogonal to Routing V2 specifically, and a
   materially larger undertaking than this bounded pass (re-approving on
   the order of 100 services across two tenants) — not attempted here.

**Not gated on Route Assist finishing** — per the integration instruction,
Route Assist's own implementation state was not a blocker for any of the work
above, and nothing in this reconciliation required changing Route Assist's
scan behavior, any canonical fact it produces, or the ownership boundary
between Route Assist and Routing V2's own physical-fact projection.

## 8. What this pass did not do

No deployment. No production migration. No LIVE template extraction — every
`extract-template-catalog.ts` run in this pass (§0.8) targeted a disposable
local database, reading only that database's own rehearsal-seeded
`elite-electric` fixture, never a real catalog or Neon. No change to any
EXISTING contractor's catalog — Elite's own `Service` rows were only ever
read from, never written to, by extraction; BrightPath is a new install, not
a change to a prior one. `main` was never touched; PR #56, PR #62, and
`feat/electrical-routing-v2` all remain exactly as they were. Deployment
stays disabled for every branch named in `vercel.json`, this one included.
