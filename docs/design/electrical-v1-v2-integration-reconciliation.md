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

### 0.13 (fourth pass) The activation shortcut removed — the dependency now launches for real

§0.11's fixture builder correctly satisfied `activateService`'s
`DEPENDENCY_UNAVAILABLE` check, but by writing `active: true` directly onto
"Dedicated Circuit & Outlet" — a real shortcut, flagged as one at the time.
Since the outlet's own qualification gate can genuinely hand a homeowner off
to that service, a launch proof that skips actually launching it is
incomplete. Removed; replaced with the same sequence a real contractor's own
admin would use, in `scripts/_derivedStorefrontFixture.ts`:

1. Decide its band question (`panel_circuit_run.breakpoints`, boundaries
   `[30, 60]` — the same value `scripts/onboard-contractor-two.ts` already
   uses for this exact policy key).
2. Enter its material costs — the canonical per-unit reference figures
   `prisma/seed-materials.ts` already documents for these keys
   (`WIRE_14_2`, `BREAKER_SINGLE_POLE`, `WALL_PLATE`, `RECEPTACLE_STANDARD`,
   `BOX_OLD_WORK`, `CONSUMABLES_MEDIUM`), not numbers invented for this
   fixture.
3. Enter crew-hours (`Service.fieldLaborHours` — the same panel edit
   `onboard-contractor-two.ts`'s own comment documents), reusing Elite's own
   2.5-hour figure for this service.
4. Publish the derived suggestion (`lib/pricePublication.ts`'s
   `publishSuggestedPrice` — the single authority; it computes the number,
   never accepts one).
5. Activate (`lib/serviceActivation.ts`'s `activateService`) — its own full
   gate, not a flag flip.

**Proven, not just configured** — `scripts/verify-integration-manual-
routing-storefront-browser-flow.ts` gained a new block (G): a homeowner
answers "a specific large appliance", is handed off by name ("Continue to
Dedicated Circuit & Outlet"), lands on that service's own real intro (not a
dead link), and completes a full path through it. Doing this surfaced two
more real, previously-unknown facts about this exact service's tree,
neither assumed going in:

- A well-known appliance (refrigerator/freezer) has its amperage skip
  straight from equipment to route access — a real branching shortcut in
  the tree, not a defect.
- A known appliance, an accessible route, and a short distance is enough
  certainty to price INSTANTLY (`PricedPhotoReview`, a real locked-in
  price with non-blocking prep photos), not the blocking review every
  path was assumed to share going in.

3 consecutive clean runs, 24/24 checks.

### 0.14 (fourth pass) A real ordering bug this exact change surfaced — in the fixture, not the product

Configuring the dependency's material costs AFTER already approving
`new-120v-outlet` staled that approval — every straight route landed on
REVIEW where it had always priced before. Traced to a genuine, worth-
recording architectural fact: `lib/electrical/loadDerivedScope.ts`'s
`loadDerivedPricingBasis` reads `contractorMaterial.findMany({ where: {
contractorId } })` — every material cost row for the CONTRACTOR, not
filtered to the roles the specific service being approved actually
consumes. Writing a cost for an entirely unrelated role (the dependency's
`WIRE_14_2`, never touched by the surface-raceway recipe) still changes the
overall fingerprint `new-120v-outlet`'s prior approval was computed over.
This is existing, deliberate product behavior (a contractor-wide, not
per-service, invalidation scope — arguably conservative on purpose), not a
bug to fix here; the bug was in this fixture's OWN sequencing. Fixed by
configuring every contractor-wide economic input first and approving once,
last — which is what a real contractor's own setup would do too; nobody
approves a price mid-configuration.

### 0.15 (fourth pass) Booked economic provenance, the stronger version — WHICH basis, not just "it held"

§0.12 proved a booked price and its answers survive a later economics
change unchanged. That is not yet provenance — an unchanged number could be
coincidence. `LineItem.resolvedEconomicBasis` is the actual mechanism
(`lib/electrical/derivedPricingBasis.ts`'s fingerprint over every
price-relevant contractor input, stamped onto the line at booking time —
see the schema's own "DERIVED PRICING PROVENANCE" comment). Block F now
proves the REAL claim: after the later cost change and reapproval, the
contractor's CURRENT `ContractorDerivedPricingApproval.approvedBasisFingerprint`
is read directly and confirmed to have GENUINELY CHANGED from what was
recorded at booking time (the economics really moved, not cosmetically),
while the booked `LineItem.resolvedEconomicBasis` stays pinned to the
ORIGINAL fingerprint — never silently rewritten to match the new approval.
That is the actual provenance claim: this specific booking is traceable to
a specific, now-superseded economic basis, not merely "a number that didn't
move."

### 0.16 (fourth pass) Cross-tenant access proven through the actual API, not a database count

§0.11's isolation proof queried Prisma directly (`lineItem.count(...)`) —
real, but one level removed from what a misconfigured or malicious client
would actually hit. `scripts/verify-two-fresh-contractors-routing-v2-
browser-flow.ts` now captures each tenant's real anonymous-session cookie
(`elite_session_id`, `lib/sessionCookieConfig.ts`) after a genuine visit is
added, and replays it against `GET /api/visit` — the actual customer-facing
endpoint, not a helper — using the OTHER contractor's site header
(`x-price2book-site`). `app/api/visit/route.ts` scopes its Visit lookup by
BOTH the caller's site (`contractorId`) and its session id, so A's real
session against B's site finds no Visit row at all (one exists for
`(contractorId: A, sessionId: A)`, not `(contractorId: B, sessionId: A)`) —
empty, not a leak of A's data and not a coincidental match of B's. Proven
both directions, plus a same-tenant sanity check confirming the mechanism
itself works (A's own session against A's own site correctly returns A's
real visit, with the real total).

### 0.17 (fourth pass) `origin/main` moved since this branch forked — inspected, not merged

PR #64 (Guided Flow schema reconciliation provenance) and PR #65 (Material
Catalog Phase 1C, first canonical recipe promotion batch — a new `electrical
v3` `TemplateVersion` DELTA) landed on `main` after this branch's fork
point. GitHub's conflict report is real but narrow: **exactly one file,
`package.json`**, and inside it exactly the `verify:full`/`verify:fast`
script-list lines — both branches independently edited the same lines (this
branch added scripts as it went; main's own edits added/removed a different
set, including a new `verify-material-recipe-promotion-batch-1.ts`). A
mechanical, textual conflict, not a semantic one: `git diff --stat` against
main confirms none of the six files main changed
(`package.json`, `prisma/seed-bathroom-fans.ts`, `prisma/seed-exterior-
gfci-routing.ts`, `prisma/template/electrical-v3-provenance.json`,
`scripts/create-missing-guided-flow-schema.ts`,
`scripts/verify-material-recipe-promotion-batch-1.ts`) overlap with anything
this branch or this review round touched — no shared file carries logic
from both sides. Everything else main added merges cleanly (new files,
resolved automatically). **Superseded by §0.21 below — this WAS resolved,
in the next review round, once asked for.**

### 0.18 (fifth pass) The booked fingerprint now matches its REAL authorizing approval, not just "a" fingerprint

§0.15 proved the booked fingerprint differs from what the economics later
became. It did not yet prove the booked fingerprint equals what the
economics ACTUALLY WERE at the moment of booking — a subtly weaker claim.
Block F now captures `ContractorDerivedPricingApproval.approvedBasisFingerprint`
directly, at the exact moment the office's own reapproval produces it, and
asserts the booked `LineItem.resolvedEconomicBasis` is EXACTLY that value —
a real row match, not an inference from non-nullness. The material and
component snapshots (`resolvedComponentKeys`, `resolvedMaterialCostCents`)
are verified too: real, non-empty, and — like the price, the answers, and
the fingerprint before them — unmoved by the later cost change.

### 0.19 (fifth pass) The stale-price refusal, checked at both the wire and the screen

Previously checked by status code alone (409), which a DIFFERENT validation
failure could also produce. Block F now parses the actual response body and
asserts `error: "REVIEW_REQUIRED"` specifically, and — the customer-visible
half — waits for `PhotoReviewNotice`'s real heading ("We can price this
remotely.") and confirms its body names the customer's own service by name.
A correct API response the UI never surfaces would be invisible to the
person the refusal exists to protect; both halves are now checked.

### 0.20 (fifth pass) Executable rehearsal guards, and zero Route Assist calls verified directly

Every browser-flow script this branch added or extended now carries the
same executable guard `scripts/verify-derived-scheduling-browser.ts`
already established — refusing to run against anything but a stamped,
non-production database, checked in code, not left as a comment.
`verify-cross-device-stale-queue-browser-flow.ts`'s contractor slug
predates the `rv2-pilot-rehearsal-*` convention that guard's slug check
requires, so it reuses just the underlying database-identity check
directly rather than being renamed to fit a prefix that isn't otherwise
meaningful to it.

Separately: "manual completion, zero Route Assist interaction" was
previously a claim about page errors, not about Route Assist itself — and
the capture button DOES render on this exact route (`surface_route_feet`,
`surface_inside_corner_count`, and `surface_outside_corner_count` are all
registered in `lib/visual-assist/route-assist/guidedFlowInvocation.ts`'s
own REGISTRY). Now watched directly: `lib/routeAssistHandoffClient.ts`'s
only network surface (`/visual-assist-tasks`) sees zero requests across the
whole manual walkthrough — the button was available and never opened, not
absent.

### 0.21 (fifth pass) `origin/main` reconciled — the conflict §0.17 found was resolved

§0.17's conflict (`package.json`'s `verify:full`/`verify:fast` script
lists) is now merged. `verify:full` is the UNION of both sides — every
script either branch considered part of "full" now runs, including main's
new `verify-material-recipe-promotion-batch-1.ts` and every script unique
to this branch (none of which exist on `main` yet, since the WORK that
introduced them — PR #56's own G2 troubleshooting-reroute pass and this
integration's own additions — hasn't reached it independently of this
branch). `verify:fast` is kept as main's own, more recently trimmed
version, verbatim: it reflects a deliberate main-line speed decision
unrelated to Routing V2, and none of this branch's additions belong in a
fast pre-build gate regardless. `schema.prisma` needed no reconciliation —
main never touched it in the commits since this branch forked, so this
branch's own additions (Routing V2, PR #56's `activeSessionKey`) are
completely untouched by the merge. Verified post-merge: `npx tsc --noEmit`
clean, `npx prisma generate` clean, a fresh production build, and all
three of this branch's own browser-flow suites (32/22/6 checks) still pass
unchanged.

### 0.22 (sixth pass) The release-mechanics corrections — migration order, template staging, rollback, Elite sequencing — checked against the actual code, and rehearsed

The prior draft of §10 (schema/template/catalog adoption and rollback) made
four factual errors, each corrected in place above rather than left as a
separate document. This entry records what was actually run to establish
each correction, so the corrected §10 is a rehearsed plan, not a rewritten
guess.

**Migration order (§10.1).** `prisma/migrate-guided-flow-session-active-key.ts`'s
own docstring already stated the correct order; the prior draft had it
backwards. Proven, not just read: on a throwaway local database pushed with
`origin/main`'s pre-migration schema (no `activeSessionKey` column), running
the backfill script failed immediately with Prisma's own `P2022` — "the
column `guided_flow_sessions.activeSessionKey` does not exist." Pushing this
branch's schema to the same database and re-running the identical script
then succeeded cleanly (`0 duplicate ACTIVE session(s) resolved`, as
expected against synthetic empty data). Also confirmed directly:
`prisma/_assertDisposableLocalDatabase.ts`'s loopback-host check means this
exact script cannot be pointed at Neon under any flag or environment
variable — a real Neon backfill needs separate, reviewed tooling, not this
script with its guard removed.

**Template staging and version arithmetic (§10.2).** Reading
`prisma/template/electrical-v3-provenance.json` (checked into this branch)
established that production's real `electrical` template is already at
SNAPSHOT v1 + DELTA v2 (`new-120v-outlet`) + DELTA v3 (Material Catalog
Phase 1C, six services) — while this branch's own local rehearsal database
has only ever carried the single v1 SNAPSHOT (confirmed by querying
`TemplateVersion` directly). The prior draft's `--version 2` was the next
number for this branch's local database, not for production, where 2 and 3
are already taken — a real extraction must read the live number at the
time, not use one written into a plan in advance. Reading
`scripts/extract-template-service.ts` and `scripts/extract-template-catalog.ts`
side by side established that production's real v2 and v3 were both written
with the SERVICE tool (a per-service DELTA), never the CATALOG tool (a
full-catalog SNAPSHOT replace) — confirmed by the provenance file's own
`extractionMechanism.notInvoked` line. Rehearsed locally: extracting
`new-120v-outlet` as a fresh DELTA against this branch's single-SNAPSHOT
database left that SNAPSHOT's 74 services completely unchanged, and
`templateVersionSource` with no `atVersion` (the real onboarding path)
resolved the new DELTA's copy the instant it was written — no staging gate
of any kind. The rehearsal write was then deleted, restoring the database's
original single-SNAPSHOT state, confirmed by re-querying `TemplateVersion`
afterward. Also confirmed directly: `extract-template-service.ts` — the
tool actually used for both real production DELTAs — carries no
database-identity or production-write guard anywhere in the file, unlike
its catalog-tool sibling; this is recorded in the corrected §10.2 as a real,
open gap, not one this pass builds a fix for.

**Rollback mechanics (§10.3).** `docs/design/production-release-authority.md`'s
own "Rollback" section, read directly, already states the real mechanism:
promote the previous approved deployment id, recorded in the release log,
with `vercel promote <id>` or the release command. Reading
`scripts/release-production.ts`, `scripts/_releaseControl.ts` and
`scripts/_releaseRun.ts` confirmed this is built into the release tooling
as a first-class "recovery baseline" — every release's creation receipt
records the outgoing deployment id and its alias mappings before the new
deployment is created, specifically so it is available to promote back.
`vercel.json`'s per-branch flag was confirmed to do something else
entirely (block a future deployment trigger, not revert a running one).
`TemplateVersion`'s own schema was inspected directly and carries no
active/published/staged column at all — confirmed there is no way to
"unpublish" a version, which is why the corrected rollback action is
publishing a corrective version forward, never deleting the bad one, matching
`MaterialBaselineVersion`'s own documented insert-only convention elsewhere
in this schema.

**Elite pricing/economics sequencing (§10.2, step 1).** No new rehearsal
needed — this pass's own already-documented local finding (§6,
`capture-hero-flow.ts`'s "no path that reaches a price" wall on Elite's own
`new-120v-outlet`) is the evidence; §10.2 now states explicitly that
preparing Elite's pricing method and economics happens ALONGSIDE the real
tree migration, not after it, so the same wall does not reproduce on the
live platform.

**The two remaining test-detail fixes**, also part of this pass:

- `assertDisposableLocalDatabase` is now called at the start of `main()` in
  all three DB-mutating browser-flow scripts
  (`verify-integration-manual-routing-storefront-browser-flow.ts`,
  `verify-two-fresh-contractors-routing-v2-browser-flow.ts`,
  `verify-cross-device-stale-queue-browser-flow.ts`), alongside — not
  instead of — each script's existing `resetRefusal`/inline tenant-slug
  guard. The two check different things: `assertDisposableLocalDatabase`
  enforces the loopback-host-plus-stamped-identity rehearsal boundary
  regardless of which contractor is involved; the pre-existing guards
  enforce that the specific contractor slug being mutated is a designated
  rehearsal tenant, never `elite-electric`/`brightpath-electric`. Neither
  makes the other redundant.
- `verify-integration-manual-routing-storefront-browser-flow.ts`'s block F
  now proves the inspected `bookedLineItem` is the SAME row the completed
  Booking's own Visit actually contains — `prisma.lineItem.findFirst({
  where: { visitId: booking.visitId, serviceId } })` against the real
  `Booking.visitId` captured after `bookNativeAppointment()` returns —
  rather than resting on "most recent LineItem for this service," which was
  a recency guess that happened to be correct in a suite with no concurrent
  activity, not a proof.

**Verification.** All three browser-flow scripts were re-run against a
`next build && next start` production server on the local disposable
database — twice each, consecutively, zero failures
(storefront: 33 assertions; two-fresh-contractors: full pass including
tenant isolation; cross-device: 6 assertions). Run against `next dev`
first, the same suites were intermittently flaky at points unrelated to
either fix — a repeated `POST /api/guided-flow-sessions` firing twice in
quick succession pointed to React 18 Strict Mode's dev-only double effect
invocation, a `next dev`-only artifact absent from a production build,
which is why verification was completed against `next start` rather than
chased further in dev mode; it is noted here as an observation for a future
pass, not fixed, since it is unrelated to this round's two corrections and
was never in scope. `npx tsc --noEmit` is clean project-wide throughout.

### 0.23 (seventh pass) Four real implementation deliverables — atomic publication, its own rollback rehearsal, populated-session migration, and bounded existing-contractor adoption

§0.22 corrected the release-mechanics plan's facts. It did not implement or
rehearse the rollout mechanics themselves — three gaps were named without
being closed: the backfill's "no duplicates" proof used an empty table, the
proposed extraction tool's own atomicity and `pricingMethod` handling were
never checked, and "migrate Elite's live tree first" was accepted as step 1
without checking whether a bounded, reviewable alternative already existed.
This pass closes all three with real code changes and real local rehearsals
against populated data, not documentation alone.

**1. Atomic publication — `scripts/extract-template-service.ts` fixed.**
Direct inspection found two real defects in the tool §10.2 now designates
for real adoption: `pricingMethod` was silently dropped (the identical
defect §0.9 already found and fixed in `extract-template-catalog.ts`,
never applied to this sibling), and its five-plus writes
(`templateVersion.upsert`, `templateService.deleteMany`,
`templateService.create`, one `templateQuestion.create` per question) ran
as separate round trips with no transaction — a crash between any two of
them left a partial `TemplateService` fully visible to
`templateVersionSource`. Both fixed: the entire write path now runs inside
one `prisma.$transaction`, and `pricingMethod` is read from the source and
carried through.

**2. Failure/rollback rehearsal — proven, not assumed.** A fault-injected
copy of the fixed script (thrown after 3 of 16 questions, never committed —
rehearsal-only) was run with `--apply` against a scratch version number on
the local disposable database. Result, confirmed by direct query
afterward: zero `TemplateVersion`, zero `TemplateService`, zero
`TemplateQuestion` rows exist at that version — the transaction rolled
back completely, including the version-upsert that ran first. The real
(uninjected, committed) script was then run against the same scratch
version and completed normally. A real before/after flip of the source
service's `pricingMethod` (`LEGACY_PUBLISHED` -> `DERIVED_RESOLVED_SCOPE`
-> extract -> confirm -> revert) proved the fixed tool carries the true
value, not the schema default. All rehearsal rows were deleted afterward;
`TemplateVersion` count confirmed back to exactly the original single v1
SNAPSHOT.

**3. Populated-session migration rehearsal — a real gap found and fixed in
`prisma/migrate-guided-flow-session-active-key.ts`.** Four scenarios were
populated directly (Elite's real contractor/service ids, scratch
`sessionId`s prefixed for identification and cleanup): a duplicate ACTIVE
pair with genuinely different `consumedAnswers`; a duplicate pair where the
older row still carries a live `AVAILABLE`, unexpired `DeviceHandoff`; a
duplicate pair where the older row still carries a `PENDING`
`GuidedFlowVisualAssistTask`; and one ordinary non-duplicate session. Run
against the original script, the two live-dependent losers would have been
silently abandoned exactly like any other duplicate, and the answer
divergence on the first pair went entirely unreported. Fixed: the script
now queries every loser's `DeviceHandoff`/`GuidedFlowVisualAssistTask`
rows up front, leaves any loser with a live handoff or pending task
untouched and ACTIVE (reported by id and the specific dependent record),
and logs both payloads whenever an abandoned loser's `consumedAnswers`
differs from the survivor's — discarded, never silently, though nothing
merges them, since no merge semantics exist anywhere in this codebase for
two independently progressed answer sets. Rehearsed twice consecutively
against the populated data: run one resolved the safe duplicate (reporting
the divergence) and left the two unsafe ones ACTIVE by name; run two
(idempotency) reported the identical two unsafe ones again, unchanged, and
did nothing to the already-resolved one. All seven rehearsal session rows
(and their cascaded handoff/task children) were deleted afterward; the
database's real, pre-existing single ACTIVE session was confirmed
untouched throughout.

**4. Bounded existing-contractor adoption — a real gap found, and a real
path proven, not invented.** §10.2's prior step 1 treated hand-editing
Elite's live `Question`/`AnswerOption` rows as how canonical content gets
prepared — bypassing `scripts/template-update.ts`, the one tool this
codebase already has for a contractor to adopt a template change onto an
already-installed service, bounded to one change at a time and refusing to
overwrite a contractor's own customization. Running it against Elite
unmodified confirmed why the prior draft never used it: it fails
immediately with Prisma's own `P2025`, "No Service found," because
`Service.templateKey` and `templateVersionId` are both `null` on Elite's
live `new-120v-outlet` — a tenant that predates the template system and IS
v1's own source, never something provisioned FROM a template. The fix
rehearsed is a genuine, honest one-time backfill: `templateKey:
"new-120v-outlet"`, `templateVersionId` set to v1's own `TemplateVersion.id`
— true, since v1 literally is an extraction of this same tree. After that
backfill, `template-update.ts --status` worked immediately: it correctly
reported a genuinely new (rehearsal-only) question as adoptable and a
wording change on a question Elite's live tree had been independently
edited to differ on as a **CONFLICT** — "you have already changed this;
yours is kept." `--adopt` on the adoptable change wrote it to Elite's live
tree, structure only, and correctly reset the service to unresolved
(`materialCostResolved: false`, `publishedPriceApprovedAt: null`,
`basePrice: null`) exactly as the tool's own documented safety net
describes; `--adopt` on the conflicting change correctly refused and left
Elite's customization exactly as it was. Every rehearsal write — the
backfilled provenance, the scratch template version, the adopted question,
the wording-conflict test — was reverted afterward, confirmed by direct
query: Elite's `new-120v-outlet` back to `templateKey`/`templateVersionId`
both `null`, its original `basePrice` and resolved/approved state restored,
its `purpose` question wording back to the real original, and exactly one
`TemplateVersion` remaining in the database.

**Verification.** `npx tsc --noEmit` clean project-wide after both code
changes. The local disposable database was confirmed back to its exact
pre-pass baseline after each of the four rehearsals independently (one
`TemplateVersion`, three contractors, the same session count and the same
single real ACTIVE session throughout) — nothing from this pass's rehearsal
work persists in the database; only the two source-code fixes
(`scripts/extract-template-service.ts`,
`prisma/migrate-guided-flow-session-active-key.ts`) and this report are
committed. **Also corrected in this pass**: a self-inflicted defect in §0.22
itself — an earlier edit to this report had deleted the "## 1." section
header immediately following it; restored here.

### 0.24 (eighth pass) Three real correctness gaps closed in §0.23's own fixes — ambiguity handling, live-version recovery, and Routing V2 fidelity

§0.23's three fixes were real, but each had a real gap of its own, found by
direct code review rather than by this branch's own rehearsal — the
rehearsals proved the fixes worked for the cases they tried, not that no
other case existed. All three are closed here, with new rehearsals covering
the specific case each gap missed.

**1. Session migration still discarded answers, and could still crash on a
partial migration.** §0.23's version logged an answer divergence and then
abandoned the loser anyway — reporting a loss is not the same as not
causing one. Fixed: a group where any two rows disagree on
`consumedAnswers` is now AMBIGUOUS and left **completely untouched** — no
row abandoned, no key backfilled for anyone in the group, not just the
divergent pair — reported by every row's id and answers for a human to
resolve. Separately, direct review found a real crash path §0.23's
populated rehearsal never exercised: the winner was chosen by
`lastActivityAt` alone, so a group mixing an old, still-unmigrated
duplicate (key `null`) with a row the real application code had already
created correctly (key already set) could pick the WRONG row as winner —
and abandoning the correctly-keyed row without clearing its key (a hand-
rolled update, not the real `abandonSession`) left that key attached to a
now-ABANDONED row, so backfilling the actual winner with the identical key
hit the `@unique` constraint and crashed, ending the run with every group
before it migrated and every group after it untouched. Fixed two ways:
winner selection now prefers a row that already carries the correct key
over recency, and every abandon now calls the real `abandonSession` from
`lib/guidedFlowSession.ts`, which always nulls the key. Rehearsed with six
populated scenarios in one run: an ambiguous divergent-answer pair (left
fully untouched, both rows confirmed still `ACTIVE` with `null` keys
afterward), a plain safe duplicate, a duplicate with a live handoff, a
duplicate with a pending visual-assist task (both unchanged from §0.23's
already-correct handling), the exact existing-key crash scenario
constructed directly — an older row pre-set to the correct key, a newer
row left `null` — which resolved to the correctly-keyed row as winner with
no crash, and one ordinary non-duplicate session. Re-run twice,
idempotent.

**2. Publication rollback was proven for a crash, not for a version that
had already gone live — and the publisher still allowed overwriting a
published version and dropped policy bindings.** §0.23's rollback
rehearsal only ever tested a fault injected mid-transaction; it never
proved the actual recovery path (§10.3: publish a corrective forward
version) against a version that had already committed and gone live.
Direct review also found `extract-template-service.ts` had no refusal at
all against being re-run into an already-published version — silently
`deleteMany` + recreating whatever was there — and never wrote
`TemplatePolicyDefinition`/`templatePolicyDefinitionId`/`labelPattern` at
all, meaning any policy-banded question (a real, existing pattern in this
catalog — `dedicated_distance` on `dedicated-120v-circuit-outlet` is one)
extracted through this tool would silently lose its band shape entirely.
All three fixed and rehearsed:
- **Overwrite refusal**: the tool now refuses to write into a version that
  already publishes the same service key, requiring
  `--i-know-this-overwrites-a-published-version` typed out deliberately —
  the same discipline `extract-template-catalog.ts` already applies to a
  full-catalog write. Rehearsed: re-running into an already-published
  (version, key) pair refused by default; the same call with the flag
  proceeded; a DIFFERENT service extracted into the SAME version was
  correctly NOT refused, confirming the check is scoped to the (version,
  key) pair, not the version alone.
- **Policy bindings**: the tool now applies the identical band-pattern
  substitution `extract-template-catalog.ts` already uses (shared from
  `scripts/_extractCore.ts`'s `loadPolicies`, not re-authored) and writes
  `TemplatePolicyDefinition` rows before the service that references them.
  Rehearsed against `dedicated-120v-circuit-outlet`'s real
  `dedicated_distance` question: the three distance-banded options
  extracted with the exact pattern text (`"{b1} feet or less"`, `"{b1+1}
  to {b2} feet"`, `"More than {b2} feet"`) and the correct
  `templatePolicyDefinitionId`, confirmed by direct query against the
  written rows; the fourth, non-banded "I'm not sure" option correctly
  carried neither.
- **Recovery after a version has already gone live**: rehearsed for real
  this time. Confirmed `templateVersionSource` resolved
  `dedicated-120v-circuit-outlet` from the (deliberately "bad", already
  live) published version; edited the live source's `shortDescription` to
  a distinguishable "corrected" value; extracted a NEW version for the
  same key; confirmed `templateVersionSource` now resolves the corrected
  content from the new version — and, in the same check, confirmed the
  "bad" version's own row is completely unchanged, proving both halves of
  the rollback plan empirically: the correction takes over, and the prior
  version is never touched.
All rehearsal versions and the temporary source edit were removed
afterward; the database confirmed back to its single original
`TemplateVersion`.

**3. The adoption tool didn't carry the routing links, numeric
constraints, or component bindings Routing V2 needs.** §0.23's adoption
rehearsal proved a plain question-added and a wording conflict worked, but
the write path it exercised only ever copied `label`/`routeAction`/photo
fields — never `nextQuestionKey`/`rerouteServiceKey`/`referencedServiceKey`,
never the question's or option's numeric bounds, never
`AnswerOptionComponent` rows. An adopted Routing V2 question would have
landed on a contractor's live tree with nowhere to route to, no way to
validate a numeric answer against its own declared range, and no material
consequence at all. Fixed: `template-update.ts` now resolves each routing
key against the adopting contractor's own live tree (by `templateKey`
first, falling back to `slug` — required for a tenant like Elite that IS a
template's own source and carries no `templateKey`), carries every numeric
field on both the question and the option, and creates
`AnswerOptionComponent` rows from the template's own component bindings.
An unresolvable routing target (its own destination not yet adopted) is
written `null` and reported by name, never guessed at — this tool applies
one change at a time by design, so a multi-question addition may need
adopting in dependency order. Rehearsed against Elite's live tree (after
the same one-time provenance backfill §0.23 established): a new question
with a numeric range, an option with its own numeric bounds, a
`nextQuestionKey` resolving to the REAL live `purpose` question (confirmed
by exact id match, not just non-null), and a real canonical-component
binding — every field landed correctly, confirmed by direct query. A
second new question with an intentionally unresolvable
`rerouteServiceKey` was correctly written `null` and reported, not
guessed. Materials, disclaimers, photo groups and policy-banded label
patterns are still not carried by this tool — named here, not silently
dropped, since none of those were part of this specific correction.

**Verification.** `npx tsc --noEmit` clean project-wide after all three
fixes. All three browser-flow suites re-run clean against a fresh
production build after every rehearsal in this pass. The local disposable
database confirmed back to its exact baseline after each of the three
gap-closing rehearsals independently (one `TemplateVersion`, three
contractors, the same session counts throughout) — nothing from this
pass's rehearsal work persists; only
`prisma/migrate-guided-flow-session-active-key.ts`,
`scripts/extract-template-service.ts`, `scripts/template-update.ts`, and
this report are committed.

### 0.25 (ninth pass) Three precise corrections to §0.24's own fixes — whole-adoption atomicity, absolute version immutability, whole-group blocking — plus the existing-tree revision this pass had not yet shown

§0.24 closed three real gaps, but each fix still fell short of what it
claimed. All three tightened here, with rehearsals aimed at exactly the
case each one still allowed.

**1. A missing routing link must block the WHOLE adoption, not just its
own row.** §0.24's `template-update.ts` wrote an unresolved link as `null`
and printed a warning — the question or option still landed, `applied`
still incremented, the service was still marked unresolved-for-pricing as
though the change had fully succeeded. A CONTINUE option with no
`nextQuestionId` is a dead end a real customer can reach today. Fixed:
every option a change would write is resolved FIRST, read-only, against
the live tree; if anything is missing, the WHOLE change refuses — nothing
is written, `applied` never increments, exit code 1 — and the write itself
now runs inside `prisma.$transaction` for a multi-option question, so a
later option's own database error can no longer leave earlier ones
committed either. Rehearsed: a question with one resolvable and one
unresolvable option refused entirely, confirmed by direct query that the
question does not exist on the live tree AT ALL afterward — not even the
resolvable option landed alone.

**2. A published version must stay unchanged — no flag, no exception, not
even for a different service.** §0.24 added an overwrite flag
(`--i-know-this-overwrites-a-published-version`) and only refused when the
SAME service key already existed in the target version, which meant
adding a DIFFERENT service to an already-published version was still
allowed — the version's content still changed after the fact from what a
contractor may have already installed. Fixed: the flag is gone entirely,
and `extract-template-service.ts` now refuses to write into ANY version
that already exists, unconditionally, regardless of which service key is
involved. Every new service and every correction takes the next unused
version number — there is no way to make an existing version's content
different from what it was. Rehearsed: a fresh version accepted its first
service normally; the identical service extracted again into that same
version refused; a genuinely DIFFERENT service extracted into that same
already-existing version ALSO refused (this specific case was the actual
gap — §0.24's version allowed it); a fresh, unused version number accepted
the different service normally.

**3. A live handoff or pending task on ANY row must block the WHOLE
group, not just that one row.** §0.24 protected the specific row carrying
a live dependent but still resolved the REST of its group normally —
abandoning other, apparently-safe losers and backfilling a winner's key —
and reported the run as fully successful (exit code 0) with the protected
row noted only as a log line. A group is not safely resolved while any
row in it is still live, and treating the rest of the group as done while
one row waits for a human is a partial change presented as a completed
one. Fixed: the live-dependent check now runs against EVERY row in a
multi-row group, not just whichever rows recency would have picked as
losers, and the moment any row in a group has a live handoff or pending
task — or the group's answers diverge — the ENTIRE group is left
untouched: no row abandoned, no key backfilled, for anyone in it. The
script's own exit code now reflects this too: it exits 1 whenever any
group was left blocked, not 0, so a caller checking only the exit code
cannot mistake a partially-blocked run for a completed migration.
Rehearsed: a group of three identical-answer rows where only the MIDDLE
row carried a live handoff — the row recency would have picked as winner
and the row recency would have picked as a "safe" loser were both left
untouched alongside the one with the handoff, confirmed by direct query
(all three still `ACTIVE`, all three still `null` keys), and the process
exited 1.

**The existing-tree revision this pass had not yet demonstrated.** Every
prior adoption rehearsal in this report added a brand-new question — never
revised something already live. Rehearsed here: a new OPTION, carrying a
numeric range, a resolving `nextQuestionKey`, and a component binding, was
adopted onto Elite's EXISTING, already-live `purpose` question — confirmed
by direct query that the written option's `questionId` is the exact id of
the pre-existing `purpose` question, not a new one, and that every field
(numeric bounds, the resolved `nextQuestionId` matching the real live
`below_above_access` question's id, and the component with its quantity)
landed correctly on it.

**Verification.** `npx tsc --noEmit` clean project-wide after all three
fixes. All three browser-flow suites re-run clean against a fresh
production build after every rehearsal in this pass. The local disposable
database confirmed back to its exact baseline (one `TemplateVersion`,
three contractors, unchanged session counts) after each rehearsal
independently — nothing from this pass persists; only the same three
source files and this report are committed.

### 0.26 (tenth pass) Four precise corrections — full atomicity, insert-only race safety, existing-option revision, and per-group session atomicity — each rehearsed against the exact failure named

§0.25 closed three refusal gaps, but each refusal still ran ALONGSIDE a
write it should have been INSIDE, or detected a case without yet proving
the harder one. Four corrections, each rehearsed against the precise
scenario it targets, not a simplified stand-in.

**1. The tree write and the price-reset are now one transaction, proven
by fault injection.** Every `--adopt` path in `template-update.ts` used to
write its tree change, then separately clear the service's price/approval
stamp as its OWN statement afterward — a crash between the two left a live
tree with new, unpriced structure while the OLD price and approval stamp
still stood. Fixed: `resetPricing(tx)` now runs inside the SAME
`prisma.$transaction` as the tree write, for every change kind
(question-added, option-added, option-revised, wording-changed). Rehearsed
with a fault injected between the tree write and the price-reset inside
one transaction: after the crash, direct query confirmed BOTH the adopted
option and the service's price/approval fields were completely unchanged —
the tree write itself rolled back along with the price-reset it was
supposed to precede, not just the reset alone.

**2. `extract-template-service.ts` no longer uses `upsert` — a genuine
two-publisher race was reproduced and caught.** The pre-check refusal
(read, then later write) left a real window: two processes racing past it
simultaneously would both reach `upsert`, and the SECOND one's `update: {}`
would silently no-op onto the version the FIRST one had just created,
letting the second publisher's service/question/option writes land anyway
inside a version the refusal was supposed to make unique. Fixed:
`templateVersion.upsert` is now `templateVersion.create` — genuinely
insert-only — with a `P2002`-specific catch reporting the race by name.
Rehearsed by reproducing the exact race rather than a stand-in: a
fault-injected copy with the pre-check skipped (simulating "already passed
the check a moment before this process reads the same answer") was run
against a version a real, unmodified run of the tool had already
published — the transaction failed and rolled back completely, confirmed
by direct query that only the first publisher's service exists under that
version; nothing from the second attempt landed.

**3. `option-revised` now detects and adopts a real existing-option
change, not just new questions — including its own conflict path.** Every
adoption rehearsal before this pass added something new; none revised
something already live. Added detection that compares an EXISTING
option's full routable shape (routing links, numeric bounds, capability
gate, component set) between the version a contractor was provisioned
from and the newest version, and separately checks whether the
contractor's LIVE option still matches what they were originally given —
if it has already drifted in ANY field, the whole revision is a CONFLICT,
refused exactly like a wording conflict, never a partial per-field
overlay. Rehearsed against Elite's real live tree: authored a version
that revised the existing `purpose/general_use` option with a new
component binding; `--status` correctly reported it as adoptable
(distinct from FIVE genuinely pre-existing conflicts on OTHER options that
this rehearsal did not manufacture — Elite's live tree had already
diverged from the comparison baseline in real ways, and the detector
correctly refused to touch any of them); `--adopt` correctly wrote the new
component onto the EXISTING live option, confirmed by direct query; a
second adoption attempt on one of the five real, unmanufactured conflicts
was correctly SKIPPED, confirmed unchanged by direct query before and
after.

**4. Session-group resolution is now one transaction per group, guarded
by the version each row was actually read at — a genuine concurrent write
was reproduced and caught, not simulated by assertion.** Abandoning
losers and backfilling a winner used to be separate statements; a mid-run
error between them could leave a group half-migrated, and nothing
protected against a real customer request updating one of the rows
between this script's read and its write. Fixed: every write in a group's
resolution is now conditioned on the row's `version` still matching what
this run read at the top, and the whole group's resolution — every abandon
and the backfill together — runs inside one transaction; a version
mismatch throws, the transaction rolls back the ENTIRE group, and the
group is reported as skipped for concurrent activity. Rehearsed with
genuine concurrency, not a mocked mismatch: a fault-injected copy of the
script with an 8-second delay inserted after its own read (rehearsal-only)
was started, and a real concurrent writer — the identical
`version: {increment:1}` pattern `updateSessionAnswers` uses in
production — updated one row in the group while the delayed copy was
still asleep. The delayed copy detected the mismatch, reported the group
skipped, and exited 1; direct query confirmed the OTHER row in the same
group — never touched by the concurrent writer at all — was also
completely unchanged, proving the whole group rolled back together, not
just the row that actually changed. A subsequent real (undelayed) run
correctly reported the same group as BLOCKED rather than resolved, because
the concurrent write had made the group's answers genuinely diverge — the
correct outcome given what had actually happened to the data, not a
residual bug.

**Verification.** `npx tsc --noEmit` clean project-wide after all four
fixes. All three browser-flow suites re-run clean against a fresh
production build after every rehearsal in this pass. The local disposable
database confirmed back to its exact baseline (one `TemplateVersion`,
three contractors, unchanged session counts) after each of the four
rehearsals independently — nothing from this pass's rehearsal work
persists; only the same three source files and this report are committed.

### 0.27 (eleventh pass) Two real defects found by direct review of the tenth pass's own diff — a destructive delete outside the check's own scope, and a structural field invisible to detection entirely

Both found by reading `template-update.ts`'s actual `option-revised` code
against what its own safety check inspected, not by a new rehearsal
inventing a new scenario — the code itself, once written, revealed both.

**1. `option-revised` adoption could delete a contractor's own,
unrelated component link.** `liveOptionMatchesFrom`'s conflict check (and
`componentsEqual` generally) only ever compares CANONICAL component links
— `liveComponents()` explicitly filters out any row with
`canonicalComponentId: null`, because a noncanonical link (the deprecated
`componentId` field, pointing at `JobComponent`) is not something a
template can express or compare in the first place. But the WRITE for an
adopted `option-revised` change did `answerOptionComponent.deleteMany({
where: { answerOptionId: mine.id } })` — scoped only by the option, not by
which kind of link — so it deleted every component row on the option,
canonical and noncanonical alike, and only recreated the canonical ones
from the template. A contractor's own noncanonical component link, which
the safety check had no way to even see, was destroyed by a write the
check had just certified as "no conflict." Fixed: the `deleteMany` is now
scoped to `canonicalComponentId: { not: null }` — exactly what the
comparison inspected, nothing more. Rehearsed: created a real
`JobComponent` and a noncanonical `AnswerOptionComponent` link on Elite's
live `purpose/general_use` option, then adopted an unrelated
`option-revised` change (see below) that also added a new CANONICAL
component to the same option. Confirmed by direct query afterward: both
components exist on the option — the new canonical one from the template,
and the original noncanonical one, completely untouched.

**2. `routeAction` was invisible to `option-revised` entirely — not
detected, not adoptable, not written.** `routableShapeEqual` and
`liveOptionMatchesFrom` compared routing links, numeric bounds, capability
gate and components, but never `routeAction` — the single field that
decides whether an answer prices automatically (`CONTINUE`/`RESOLVE_*`) or
forces a human look (`PHOTO_REVIEW`/`REMOTE_QUOTE`/
`REROUTE_TROUBLESHOOTING`). A template revising an option from `CONTINUE`
to a review-triggering action produced NO detected change at all — not
reported by `--status`, not adoptable by any `--adopt` key, and even if it
had somehow been reached, the `option-revised` write path never touched
`routeAction` on the live row regardless. Fixed: `routeAction` is now
compared in both `routableShapeEqual` (does the template consider this
revised) and `liveOptionMatchesFrom` (has the contractor's live copy
already drifted), and the adoption write now sets `routeAction` on the
updated live option. Rehearsed: authored a version that changed
`purpose/general_use`'s `routeAction` from `CONTINUE` to `PHOTO_REVIEW`
(clearing its `nextQuestionKey` to match, since a review branch routes
nowhere); `--status` now reports it as a real `option-revised` change;
`--adopt` correctly wrote `routeAction: PHOTO_REVIEW` and
`nextQuestionId: null` onto the live option, confirmed by direct query.

Both rehearsed together against the same live option and the same
adoption call, proving the two fixes compose correctly — the noncanonical
link survives while the canonical component set and `routeAction` both
update in the one write. All rehearsal state (the `JobComponent`, both
component links, the routing field, the scratch template version, Elite's
provenance stamp and pricing) was reverted afterward, confirmed by direct
query.

**Verification.** `npx tsc --noEmit` clean project-wide. All three
browser-flow suites re-run clean against a fresh production build. The
local disposable database confirmed back to its exact baseline (one
`TemplateVersion`, three contractors, zero `JobComponent` rows) afterward
— only `scripts/template-update.ts` and this report are committed in this
pass.

### 0.28 (twelfth pass) Two concurrency guards that only fire on the common case — an unconditional winner recheck, and a stale-adoption-target guard with no version column to lean on

Both named directly, not found by re-reading a diff: the winner recheck gap
in `migrate-guided-flow-session-active-key.ts`, and the missing
between-`detect()`-and-write guard in `template-update.ts`. Both rehearsed
with the same technique used throughout this branch for genuine
concurrency proofs — copy the target script, inject a `setTimeout` delay
at the exact point after its read and before its write, run it in the
background, and race a real concurrent writer against it during the delay
window.

**1. The session-migration winner was only rechecked when its key was
already wrong.** `migrate-guided-flow-session-active-key.ts`'s per-group
transaction guarded the winner's `status`/`version` with an `updateMany`
— but only inside `if (winner.activeSessionKey !== key)`. The common case
is a winner that is ALREADY correctly keyed from a previous run, and for
that row the guard never ran at all: its losers could be abandoned around
it in the same transaction without the winner itself ever being
reverified as still `ACTIVE` at the version this run read. A winner whose
answers changed, or who completed (`completeSession`, which nulls
`activeSessionKey` and flips `status` to `COMPLETED`), moments before this
script's read would still have its losers abandoned — the exact
"abandon other rows out from under a session that just changed"
regression this branch has guarded against since the tenth pass, reopened
for the one case that guard never covered. Fixed: the winner's
`updateMany({ where: { id: winner.id, status: "ACTIVE", version: winner.version }, data: { activeSessionKey: key, version: { increment: 1 } } })`
now runs unconditionally, first, before any loser is touched — idempotent
when the key was already correct, and a real `ConcurrentActivityError`
(rolling back the whole group's transaction, losers included) the moment
it is not. Rehearsed: two groups, each with a winner already carrying the
correct `activeSessionKey` and one identical-answer loser with none — the
shape the old code let straight through unguarded. During an 8-second
injected delay, a concurrent writer called the real
`updateSessionAnswers` on one group's winner (a genuine answer change) and
the real `completeSession` on the other's. Both groups were reported
`⚠ SKIPPED … changed concurrently`, the script exited 1, and a direct
query afterward confirmed both losers untouched — still `ACTIVE`,
`activeSessionKey: null`, never abandoned — while each winner correctly
reflected the concurrent write that raced it (the changed answers with
`version` incremented; `status: "COMPLETED"` with `activeSessionKey`
nulled).

**2. `template-update.ts` had no guard against a contractor's edit landing
between `detect()`'s read and the later write.** `detect()` runs once, at
the very start of the process, and decides `conflict: false` from that
single read; the actual write for `option-revised` and `wording-changed`
happens later, after resolving routing links (a round trip per link) —
a real, if narrow, window in which a contractor using the live admin UI
could edit the exact same question or option. Neither `Question` nor
`AnswerOption` carries a `version` or `updatedAt` column, so there is no
optimistic-concurrency counter to condition a write on the way the
session migration conditions on `GuidedFlowSession.version` — confirmed
by direct schema inspection. Fixed with a manual compare-and-swap instead
of a counter: `option-revised` re-fetches the live option fresh inside the
transaction, immediately before writing, and re-runs the SAME
`liveOptionMatchesFrom` comparison `detect()` already trusted against that
fresh read — a live row that no longer matches the `from`-version shape
throws a new `StaleAdoptionTargetError`, caught once, reported as a clean
refusal, and rolled back with nothing written. `wording-changed`'s guard
is simpler and needs no extra read: its `updateMany`'s own `where` clause
now requires `prompt: ch.from` — the exact value `detect()` saw — so a
live prompt that has since moved matches zero rows, and `count !== 1`
throws the same error. Rehearsed both, against Elite's real
`concealed_route_feet` question and its `beyond` option (stamped with
Elite's usual temporary provenance backfill and a scratch `TemplateVersion
997` carrying one wording change and one option revision, both
non-conflicting): with the delay injected right after `detect()` returns,
a concurrent writer changed the live question's prompt for the
wording-changed run, and the live option's `numberAtLeast` for the
option-revised run. Both adoptions printed the new
`REFUSED: … changed since it was inspected` message and exited 1. Direct
query afterward confirmed nothing the tool would have written landed —
the question prompt stayed at the concurrent writer's value, the option's
`numberAtLeast` stayed at the concurrent writer's value (not the
template's), and the service's `materialCostResolved`/
`publishedPriceApprovedAt`/`basePrice` were untouched, proving the price
reset never ran either — the whole transaction rolled back, not a partial
write. (An earlier attempt at the wording-changed rehearsal scoped the
concurrent writer's `updateMany` by `key` alone, which matched five rows
across three other contractors sharing the same template question key —
caught before it mattered, since the disposable database absorbs it
either way, but both the writer script and the fixture's provenance
backfill were corrected to scope by this contractor's own `serviceId`
before the kept rehearsal ran.)

All rehearsal state was reverted and confirmed by direct query: both
session-migration groups' four fixture rows deleted; the option's
`numberAtLeast` restored to 20; Elite's `new-120v-outlet` service's
`templateKey`/`templateVersionId` restored to `null` (their true original
— an earlier, failed setup attempt in this same pass had already stamped
them before erroring, so the value this pass's own setup script first read
back was not the real baseline); the scratch `TemplateVersion 997` and its
`TemplateService` deleted.

**Verification.** `npx tsc --noEmit` clean project-wide. Rebuilt
(`next build`) and re-ran all three of this branch's own browser-flow
suites against that production build: `verify-cross-device-stale-queue-
browser-flow.ts` (6/6), `verify-two-fresh-contractors-routing-v2-browser-
flow.ts` (22/22), `verify-integration-manual-routing-storefront-browser-
flow.ts` (33/33) — all clean, zero failures. Neither modified script sits
on a path any of these three suites exercises directly; they stand as the
branch's regression guard, not as this pass's concurrency proof — that
proof is the delay-injection rehearsals above, using the real production
functions (`updateSessionAnswers`, `completeSession`,
`liveOptionMatchesFrom`) rather than a simplified stand-in. The local
disposable database confirmed back to its exact baseline afterward — only
`prisma/migrate-guided-flow-session-active-key.ts`,
`scripts/template-update.ts`, and this report are committed in this pass.

### 0.29 (thirteenth pass) The catalog adoption/restoration sequence, run for real end-to-end — and a genuine gap §10.3's plan did not anticipate: a corrective version cannot walk an already-adopted contractor back to it

§10.2 and §10.3 had each been rehearsed in fragments — one gap at a time,
against fixture-scale changes — but never as one continuous sequence:
adopt a real template change onto Elite's live tree, discover it was
wrong, publish the corrective version §10.3 names as the real rollback
mechanism, and confirm the correction actually reaches the contractor who
already adopted the mistake. Running that full sequence for real, rather
than reasoning about it from the code, is what surfaced this pass's
finding.

**Setup, using the real tools at every step, not a shortcut.** Elite's
`new-120v-outlet` was given its usual one-time provenance backfill
(`templateKey`/`templateVersionId` → v1 — Elite is v1's own source and
otherwise carries `null`/`null`). A scratch `TemplateVersion 2` (DELTA)
was published with `concealed_route_feet`'s `beyond` option's
`numberAtLeast` accidentally dropped from 20 to 5 — a plausible real
mistake, not a contrived one. `--status` reported it as a clean,
non-conflicting `option-revised` change; `--adopt` wrote it to Elite's
live tree exactly as designed. A real `Visit`/`LineItem` was then created
representing a customer who booked under that bad 5-foot threshold —
`resolvedEconomicBasis`, `answersSnapshot`, `computedPriceCents`, and
`resolvedMaterialCostCents` all pinned, the same fields block F of
`verify-integration-manual-routing-storefront-browser-flow.ts` already
proves immutable against a later cost change.

**The mistake was then "discovered," and a corrective `TemplateVersion 3`
published** — per §10.3's own stated mechanism: a new DELTA at the next
version number, never mutating or deleting v2's row. Deliberately a
*third* value (18), not a blind revert to v1's original 20, since a real
correction is rarely a byte-for-byte restoration. Re-running `--status`
against Elite was expected, on a first reading of §10.3, to offer this
correction the same way any other template update reaches a contractor.
It did not:

```
~ option    concealed_route_feet/beyond  CONFLICT — you have already changed this option; yours is kept
```

`--adopt` refused with the standard conflict message and wrote nothing.
**The reason is structural, not a bug in this pass's fix:**
`template-update.ts`'s `detect()` diffs `from` (the version the
contractor was ORIGINALLY provisioned from — `svc.templateVersionId`,
which no adoption ever updates) against `newest`. It never diffs the
CONTRACTOR'S CURRENT LIVE VALUE against `newest`. The moment Elite's live
`beyond` diverged from `from` — for ANY reason, including a previous
auto-adoption of a value this same tool wrote — every later template
change to that field is indistinguishable from a contractor's own
deliberate customization, and `--adopt` has no override for a conflict at
all. **A second, worse sub-case was confirmed too:** a corrective
`TemplateVersion 4` publishing the EXACT original value (20, matching
`from` byte-for-byte) produced no conflict and no report of any kind —
`--status` printed `nothing to adopt`, since `routableShapeEqual(wasOpt,
o)` is true and the loop never even reaches the live-value comparison.
Elite's live tree, still at the bad 5, is not mentioned at all in this
case — a quieter failure than the conflict, not a better one.

**Everything else about §10.3's stated invariants held, confirmed by
direct query after both corrective versions:** `TemplateVersion 2`'s own
row still reads `numberAtLeast: 5` — the exact value it was published
with, never mutated, never deleted, matching the "publish forward, never
delete the bad row" rule literally. The booked `LineItem`'s
`resolvedEconomicBasis`, `answersSnapshot`, `computedPriceCents`, and
`resolvedMaterialCostCents` were all still exactly what they were at
booking time, untouched by either corrective publish — booking safety
holds across a template-version rollback exactly as §10.3 claims. A
FRESH contractor's install-time resolution
(`templateService.findFirst({ orderBy: { templateVersion: { version:
"desc" } } })`, the same query `templateVersionSource` performs) correctly
returned `TemplateVersion 4`'s corrected value (20) — a new install today
gets the fix. **Elite's own live tree, queried in the same breath, was
still at 5.** The corrective version protects every contractor who has
not yet adopted the mistake; it does nothing at all for the one who
already has, and gives no signal — short of `--status` returning a
CONFLICT that reads identically to a legitimate customization — that this
is the situation the tool is in.

**This is a real, named gap in the restoration story, not something this
pass fixes.** §10.3 states plainly that "the real rollback action is to
publish a CORRECTIVE version," and that claim is correct for every
contractor who has not yet adopted the bad content — proven directly
above. It does not cover the contractor who has, and `template-update.ts`
has no mechanism to distinguish "this option diverged because a
contractor customized it on purpose" from "this option diverged because a
previous run of this exact tool wrote a value that later turned out to be
wrong" — both currently look identical to `detect()`, and the second case
is the one a corrective publish exists to fix. Closing it is a real design
decision (a provenance marker recording which changes were tool-adopted
versus contractor-authored; a `--force` path for a CONFLICT that
originated from this tool's own prior write; some other shape entirely) —
left named, not designed or built here, consistent with this report's
standing practice of naming what direct execution reveals rather than
redesigning speculatively.

All rehearsal state was reverted and confirmed by direct query back to
this pass's exact starting baseline: the booked `Visit`/`LineItem`
deleted; `beyond`'s `numberAtLeast` restored to 20; Elite's service
provenance restored to `null`/`null` and its pricing fields
(`materialCostResolved`, `publishedPriceApprovedAt`, `basePrice`) restored
to their exact pre-rehearsal values; `TemplateVersion`s 2, 3, and 4
deleted, leaving exactly the one `TemplateVersion` (v1) this branch's
local database has carried throughout.

**Verification.** No code changed in this pass — the finding is a report
addition only, so `tsc`/build/browser-flow re-verification is unchanged
from §0.28 immediately above. The local disposable database confirmed
back to its exact baseline by direct query; only this report is committed
in this pass.

### 0.30 (fourteenth pass) Bounded per-change adoption baselines close §0.29's gap for real, and the option-revised transaction is finally race-free across its own write, not just its read

Two deliverables from the corrected design direction given after §0.29: a
durable, per-question/per-option adoption baseline that lets a contractor
who already adopted a bad value actually receive a later correction — the
exact gap §0.29 named and left open — and a real fix for the remaining
`option-revised` concurrency gap, which turned out to be worse on direct
inspection than the eleventh/twelfth passes' own fix left it: rereading
inside a transaction and then writing separately, unconditionally, never
actually closed the window between them.

**1. Bounded per-change adoption baselines — a new `TemplateAdoptionReceipt`
table, and a genuine three-way comparison.** §0.29 found that
`template-update.ts` compared each unit's live value against the version
the CONTRACTOR was originally provisioned from, never against what this
tool itself had most recently written for that specific unit — so a
corrective template version either read as a false CONFLICT (if it
differed from the original) or was silently never offered at all (if it
exactly restored the original). Fixed with three named values, computed
per independently-adoptable unit (a question's wording; one option's
routing/numeric/canonical-component projection) rather than once per
service:

```
B  the last canonical projection actually ACCEPTED for this unit
L  the current LIVE projection on this contractor's tree
T  the intended projection from the composed TARGET template
```

`L == T` is idempotent (nothing reported, nothing written — not the tree,
not a receipt, not the price reset — on a repeated adoption). `T == B`
means no upstream change since what was accepted, so nothing is reported
regardless of `L` — a contractor's own independent customization, if any,
is simply theirs, with no competing template content to weigh it against.
`L == B` (and `T != B`) is a safe, offered adoption. Anything else is a
CONFLICT: the contractor's value has drifted from what was accepted AND
the template has moved, and this tool cannot tell whether that drift was
deliberate, so it never guesses.

`B` comes from a new `TemplateAdoptionReceipt` row — `serviceId`,
`unitKind` ("question"/"option"), `unitKey`, the accepted projection
stored in the TEMPLATE's own key-based shape (never this contractor's
resolved, tenant-specific ids), the source `TemplateVersion`, and an
append-only `priorReceiptId` naming the receipt it superseded, matching
this codebase's existing immutable-by-convention version records
(`MaterialBaselineVersion`, `TemplateVersion` itself) rather than
overwriting history in place. For a unit never individually adopted
through this tool, `B` falls back to whichever version `Question`/
`AnswerOption`'s OWN `templateVersionId` names — a column
`lib/templateProvisioning.ts` already stamps at provisioning time for
every real contractor, confirmed by direct inspection — or the service's
own provisioning version for a row stamped before that column existed
(Elite, backfilled once, explicitly, in §0.23). Neither fallback is an
inference from context: both are recorded facts from an already-reviewed,
already-accepted action, never a guess drawn from "this contractor happens
to be the version's own extraction source."

**Rehearsed as six proofs, checked in as
`scripts/verify-template-adoption-baselines.ts` — a durable regression,
not a deleted scratch copy — against real published `TemplateVersion`
deltas and a real provisioned throwaway contractor (35 checks, 0
failures):**

1. Adopt a distinct corrective version after a bad one, then repeat the
   same `--adopt` call: the second call is a true no-op — nothing written
   to the tree, no new receipt, `"no change matched"`.
2. Adopt a bad v2, then a corrective v3 that EXACTLY restores v1's
   original value: offered and applied — `B` is v2, not v1, so `T != B`
   holds even though `T == v1`, closing the exact gap §0.29 found. (A
   companion check inside the same block also confirms the OTHER §0.29
   sub-case: when the "correction" is published to a version the
   contractor never adopted anything from, `T == B` correctly reports
   nothing — this only ever mattered for a unit that had already drifted,
   which is precisely what a receipt now remembers.)
3. A contractor's own direct edit after adopting one version, followed by
   a further template correction: reported and refused as a CONFLICT,
   with the contractor's value, the service's pricing fields, and the
   receipt itself (still pointing at the original acceptance) all
   confirmed untouched by the refusal.
4. One published version revises two units at once; adopting only one
   leaves the other's own baseline, and its own independently-reported
   CONFLICT, completely unaffected — proven within a single version
   rather than inferred from separate rounds not interacting.
5. A fault injected between the tree write and the receipt/price-reset
   (the same technique as §0.9/§0.23/§0.24): the whole transaction rolls
   back — the option's value, its receipt, and its pricing fields all
   confirmed unchanged, then the same adoption re-run cleanly once the
   fault is removed.
6. A real `Visit`/`LineItem`/`Booking` booked under one adopted value
   survives a LATER correction byte-for-byte — `answersSnapshot`,
   `computedPriceCents`, `resolvedEconomicBasis`, `resolvedMaterialCostCents`
   on the `LineItem`, and `totalCents` on the linked `Booking` — while a
   SECOND, freshly-provisioned contractor, installed after the correction
   with no version pin, receives the corrected content immediately.

One test-authoring mistake surfaced and was fixed during this rehearsal,
not in the tool itself: an early version of proof #1's assertion compared
the receipt created by a v4 adoption directly against the v2 receipt,
skipping over the v3 exact-revert adoption that happened in between in
this same fixture's timeline — corrected to compare each receipt against
its own immediate predecessor.

**2. The `option-revised` transaction is now race-free across its own
write, not only its read.** Direct review of the twelfth pass's own fix,
prompted by this round's instruction, found it did not actually close the
window it was written to close: it re-read the option fresh, ran the
comparison, and only THEN issued a separate, unconditioned
`tx.answerOption.update(...)` — a contractor edit landing in the gap
between that read and that write would have been silently overwritten,
because the write itself never re-verified anything at the moment it
actually ran. Re-reading inside a transaction does not, by itself, prevent
a different transaction's write from landing after that read; only a lock
— or an atomic conditioned write, which `option-revised`'s comparison
cannot fully express in one statement because it spans a second table's
worth of component rows — actually closes a gap like this. A second,
separate defect in the same fix: `liveOptionMatchesFrom`'s own internal
key-resolution queries (`resolveQuestionId`/`resolveServiceId`) ran through
the module-level, un-transacted `prisma` client, not the transaction's own
`tx` — so even the "fresh, in-transaction" check was not fully inside the
transaction's own consistency boundary, lock or no lock.

Fixed with `SELECT ... FOR UPDATE`, taken on the option's own row AND on
its existing `AnswerOptionComponent` rows, as the FIRST thing the
transaction does — before the fresh comparison, before either write — and
every one of `resolveServiceId`/`resolveQuestionId`/`resolveOptionLinks`/
`liveOptionMatchesFrom` now takes an explicit database client parameter,
so the safety check inside a transaction actually runs through that
transaction throughout, not just at its outermost call.

Rehearsed with the delay placed exactly where the instruction named it —
AFTER the final check, BEFORE the write, inside the lock — using a real
throwaway contractor and a real published delta:

- A concurrent writer's plain `updateMany` targeting the SAME option,
  timed to land during that exact window, measurably BLOCKED for the
  remainder of the adopting transaction (waited 5.3s of an 8s injected
  delay) rather than landing unnoticed; once the adopting transaction
  committed, the concurrent writer's own update proceeded and applied —
  visible in the final state, never silently lost — while the receipt this
  pass created correctly recorded the truthful, point-in-time content this
  tool itself had just adopted, unaffected by what happened to the row a
  moment later.
- A second, complementary scenario — the concurrent edit already landed
  and committed BEFORE the adopting run even started — was reconfirmed
  refusing cleanly with the baseline receipt unchanged, exactly as the
  eleventh/twelfth passes established; the redesign did not regress it.

(This rehearsal's first attempt at the "during the lock" scenario hit
Prisma's own default 5-second interactive-transaction timeout, since the
injected 8-second delay exceeds it — a property of the rehearsal's
artificial delay, not of the real code, which never sleeps mid-transaction.
Fixed by raising the timeout on the rehearsal's own delayed copy only.)

**3. The session-migration winner's guard no longer bumps `version` for
no reason.** Direct review of the twelfth pass's own fix found the winner's
`updateMany` always incremented `version`, even for the common case of an
already-correctly-keyed winner where nothing about the row actually needed
to change — meaning every rerun of this maintenance script bumped every
already-correct winner's version, purely as a side effect of re-verifying
it, with no change a caller of `updateSessionAnswers`/`completeSession`
could see. That was never a data-loss risk (`updateSessionAnswers`'s own
contract already treats a resulting `STALE_VERSION` as "reload and
reapply," never a silent overwrite) but it was an avoidable side effect
dressed up as free reverification, and this report's own §0.28 called the
mechanism "idempotent when the key was already correct" without
qualifying that a real write — and a real version bump — still happened
underneath that word. Fixed: the guard's `updateMany` — its `where`
clause, and the row lock any UPDATE statement takes for the rest of the
transaction regardless of whether its values actually change — still runs
unconditionally, every time; only the `version: { increment: 1 } }`
portion of its `data` is now conditional on the key actually needing to
move. Rehearsed: an already-correctly-keyed singleton's `version` was
confirmed UNCHANGED after a full migration run (previously it would have
advanced by one for no reason), and both of the twelfth pass's own
concurrency proofs — a concurrent answer change, a concurrent completion —
were re-run and still correctly abort their whole group, confirming the
narrower fix did not weaken the guard itself.

Also removed in this pass, on the same review: a BLOCKED group's log line
that printed every disagreeing row's full `consumedAnswers` payload
directly to console output — potentially real customer answer content,
logged for no diagnostic reason the surrounding "N ACTIVE rows carry
DIFFERENT answers" summary line does not already state. The per-row log
now names only the row id and its `lastActivityAt`; an operator who needs
the actual answer content to resolve a blocked group queries the database
directly.

All rehearsal state was reverted and confirmed by direct query: the
throwaway contractors and their services/questions/options destroyed
(receipts cascade-deleted with their service); every scratch
`TemplateVersion` this pass published deleted, leaving exactly the one
baseline `TemplateVersion`; the booked `Visit`/`LineItem`/`Booking` and
their supporting `Customer`/`ArrivalWindow`/`ServiceArea` rows deleted; the
session-migration rehearsal's fixture rows deleted.

**Verification.** `npx tsc --noEmit` clean project-wide. Rebuilt
(`next build`) and re-ran all three of this branch's own browser-flow
suites against that production build — `verify-cross-device-stale-queue-
browser-flow.ts` (6/6), `verify-two-fresh-contractors-routing-v2-browser-
flow.ts` (22/22), `verify-integration-manual-routing-storefront-browser-
flow.ts` (33/33) — all clean, zero failures, none of which exercise
either modified script directly; they stand as this branch's regression
guard, not as this pass's own proof. The new checked-in
`scripts/verify-template-adoption-baselines.ts` passed 35/35 on its own.
The local disposable database confirmed back to its exact baseline
(one `TemplateVersion`, zero `TemplateAdoptionReceipt` rows, the standing
three contractors) by direct query afterward. Files committed in this
pass: `prisma/schema.prisma` (the new `TemplateAdoptionReceipt` model,
additive only), `prisma/migrate-guided-flow-session-active-key.ts`,
`scripts/template-update.ts`, the new
`scripts/verify-template-adoption-baselines.ts`, and this report. The
schema change was applied to the local disposable database with
`prisma db push`, the same mechanism every prior schema change on this
branch has used; no migration against Neon or any shared database is part
of this pass.

### 0.31 (fifteenth pass) Two real component-comparison defects the 35-check suite's own component-free fixtures could not have caught — a stray template row id, and a `jsonb` key-order instability the receipt table itself introduced

Found by direct review of `f282ea7`, not by a new rehearsal inventing a
scenario: every one of §0.30's six proofs exercised an option with an
EMPTY component set (`concealed_route_feet`'s `within`/`beyond` carry no
canonical components in the real v1 catalog), so `componentsEqual([], [])`
was trivially true regardless of either defect below. A populated
component binding was never actually compared.

**1. `projectOption` passed a template option's raw component rows
straight into every comparison and every stored receipt, row id and all.**
`TemplateAnswerOptionComponent` (schema) carries its own `id` and
`templateAnswerOptionId` — real database columns with no equivalent
concept on the live side. `liveComponents()` has always explicitly
mapped a live `AnswerOptionComponent` down to five canonical fields
before comparing; `projectOption` did not do the same for the template
side — it passed `o.components` through unchanged, trusting a type
annotation (`TemplateOption["components"]`, deliberately narrow) that an
`as unknown as TemplateOption[]` cast never actually enforced at runtime.
Every comparison touching a real component binding was therefore
comparing a clean, five-field live object against a template object
carrying two extra database ids no live row could ever match — a
component-bearing option would never register as matching ANYTHING,
template or receipt, regardless of whether it had genuinely changed.
Fixed: a single `pickComponentFields` helper, applied to both
`liveComponents()` and `projectOption()` (and used to simplify
`resolveOptionLinks`'s own component mapping, which had already been
written correctly by hand) — the five canonical fields, nothing else,
on both sides of every comparison.

**2. `componentsEqual` compared components via `JSON.stringify`, which is
not key-order-independent — and `TemplateAdoptionReceipt.acceptedProjection`
being a Postgres `jsonb` column made that a real, live bug, not a
theoretical one.** `JSON.stringify` prints an object's keys in whatever
order they were last assigned, which is stable for two POJOs built by the
same in-process `pickComponentFields` call in the same run — the ONLY
case any component comparison exercised before this table existed. A
value read back out of a `jsonb` column is not guaranteed to preserve
its original key order at all; Postgres reorders `jsonb` object keys on
its own. Confirmed directly: a component projection written into a
receipt as `{canonicalComponentId, quantity, conditionAnswerKey,
conditionAnswerValue, quantityAnswerKey}` read back as
`{quantity, quantityAnswerKey, conditionAnswerKey, canonicalComponentId,
conditionAnswerValue}` — genuinely the same value, printed differently.
Every comparison against a receipt-derived baseline (`B`) was therefore
comparing two identical component sets as different the moment fix #1
above made the CONTENT finally match — an option that had just been
correctly adopted with a real component binding would immediately report
back as a CONFLICT on its very next comparison, which is exactly what a
rehearsal populated with a real canonical component surfaced immediately.
Fixed: `componentsEqual` now builds a fixed-field-order string
(`canonicalComponentId|quantity|conditionAnswerKey|conditionAnswerValue|
quantityAnswerKey`) per component and sorts THOSE strings, never
`JSON.stringify` on the object itself — deterministic regardless of
which path (in-memory template fetch, live Prisma read, or a `jsonb`
round-trip) produced the object.

**Both fixes needed each other to be provable.** Fixing only #1 without
#2 would have looked correct in the very first check after an adoption
(both sides still fresh, in-memory, no `jsonb` involved) and then failed
on the very next comparison against that same adoption's own receipt —
exactly the failure this pass hit on its first rehearsal attempt, which
is what surfaced defect #2 in the first place.

**The checked-in suite (`scripts/verify-template-adoption-baselines.ts`)
was rewritten to actually exercise this**, per the bounded correction:
every one of its six blocks now carries a REAL canonical component
binding through the exact scenario it proves, not an empty set standing
in for one — a component added on the bad version and removed by an
exact-revert correction (proof #2), a distinct component swapped in by a
further correction and left alone by a repeated adopt (proof #1), a
contractor's own direct edit to a component's quantity conflicting with a
later correction alongside a scalar edit (proof #3), one version revising
components on two units with only one adopted (proof #4), a fault
injected AFTER a real, non-empty `deleteMany` actually removes component
rows — confirming the rollback restores genuinely deleted data, not a
no-op against nothing (proof #5) — and a booked `LineItem`'s
`resolvedComponentKeys` surviving a component-quantity correction while a
fresh install receives the corrected binding (proof #6). Also added,
per the same correction: `assertDisposableLocalDatabase(prisma)` at the
top of the script (the new verifier had never actually enforced the
rehearsal boundary its own comment claimed, unlike every other script in
this file that touches the database), and `try`/`finally` around both the
scratch `TemplateVersion` cleanup and the booking fixture's teardown, so
a thrown assertion mid-run no longer leaves scratch rows behind for the
next run to trip over. 51/51 checks pass, up from 35 — the 16 new checks
are the direct component-binding proofs above, not padding.

All rehearsal state was reverted and confirmed by direct query back to
exact baseline (one `TemplateVersion`, zero `TemplateAdoptionReceipt`
rows, the standing three contractors) — including a manual, unabbreviated
reproduction of the original bug against a disposable debug fixture
(kept alive deliberately, outside `withThrowaway`, specifically to
inspect the receipt's raw stored JSON side-by-side with the live row and
confirm the exact key-reordering behavior described above) before that
fixture too was torn down.

**Verification.** `npx tsc --noEmit` clean project-wide. Rebuilt
(`next build`) and re-ran all three of this branch's own browser-flow
suites against that production build — `verify-cross-device-stale-queue-
browser-flow.ts` (6/6), `verify-two-fresh-contractors-routing-v2-browser-
flow.ts` (22/22), `verify-integration-manual-routing-storefront-browser-
flow.ts` (33/33) — all clean, zero failures. `scripts/verify-template-
adoption-baselines.ts` passed 51/51. The local disposable database
confirmed back to its exact baseline by direct query. Files committed in
this pass: `scripts/template-update.ts` and
`scripts/verify-template-adoption-baselines.ts` only — no schema change
in this pass.

### 0.32 (sixteenth pass) The catalog rollout rehearsal, repeated against Elite's real tree — the exact gap §0.29 found is now closed

§0.29 ran the full adoption/restoration sequence against Elite's real
`new-120v-outlet` and found that a corrective template version could not
walk Elite back to correct content once it had already adopted a bad one
— the correction read as a false `CONFLICT` and `--adopt` refused,
leaving Elite permanently stuck. §0.30/§0.31 fixed the mechanism (bounded
per-change receipts) and proved it generically against a throwaway
contractor. This pass repeats §0.29's OWN scenario, unchanged, against
Elite's real tree, to confirm the fix closes the specific gap that was
found there — not just a fresh fixture built to be easy.

**Identical setup to §0.29:** Elite's `new-120v-outlet` given its usual
one-time, explicit provenance backfill (`templateKey`/`templateVersionId`
→ v1); a scratch `TemplateVersion 2` published with `concealed_route_feet`
`beyond`'s `numberAtLeast` dropped from 20 to 5 (the same accidental bad
publish); adopted via `--adopt` exactly as before. A real `Visit`/
`LineItem`/`Booking` was booked under that bad value, capturing
`resolvedEconomicBasis`/`answersSnapshot`/`computedPriceCents`. A
corrective `TemplateVersion 3` was then published with a third, distinct
value (18 — neither v1's original 20 nor v2's bad 5), identical in shape
to §0.29's own corrective version.

**Where §0.29 found a `CONFLICT` and a refusal, this pass found neither:**

```
~ option    concealed_route_feet/beyond  (routing/numeric/component shape changed)
...
adopted "concealed_route_feet/beyond" — structure only.
```

`--status` offered the correction cleanly and `--adopt` applied it.
Confirmed by direct query afterward: Elite's live `beyond` now reads 18 —
Elite is genuinely walked back to the correction, the exact outcome §0.29
found impossible. Every other invariant §0.29 already established still
holds, reconfirmed here rather than assumed: `TemplateVersion 2`'s own row
still reads `numberAtLeast: 5`, untouched; the booked `LineItem`'s pinned
fields are byte-for-byte what they were at booking time; and the new
`TemplateAdoptionReceipt` for `beyond` correctly records the v3 adoption
(`sourceTemplateVersionId` pointing at v3, `acceptedProjection` holding
exactly v3's shape with no stray fields — the same receipt shape §0.31's
fix makes trustworthy).

All rehearsal state was reverted and confirmed by direct query back to
this pass's exact starting baseline: the booked `Visit`/`LineItem`/
`Booking` and their `Customer`/`ArrivalWindow`/`ServiceArea` deleted; the
`TemplateAdoptionReceipt` for `beyond` deleted; `beyond`'s `numberAtLeast`
restored to 20 and its own `templateKey`/`templateVersionId` restored to
`null`; Elite's service provenance restored to `null`/`null` and its
pricing fields restored to their exact pre-rehearsal values;
`TemplateVersion`s 2 and 3 deleted, leaving exactly the one baseline
`TemplateVersion`.

**Verification.** No code changed in this pass — a rehearsal confirming
the fix, not introducing one — so `tsc`/build/browser-flow re-verification
is unchanged from §0.31 immediately above. The local disposable database
confirmed back to its exact baseline by direct query; nothing is
committed in this pass beyond this report entry.

**Where this leaves §10.2/§10.3.** The bounded per-change adoption
baseline was the one piece of the real catalog rollout plan this branch
had not yet proven end-to-end against Elite's own tree; it now has been,
twice — once showing the gap (§0.29), once showing it closed (this pass).
The remaining named gaps in §10.2 (materials/disclaimers/photo groups not
yet carried by this tool; no production-write guard on
`extract-template-service.ts`) are unchanged by this work and remain what
they were: real, open, and out of this correction's bounded scope.

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
| `scripts/verify-cross-device-stale-queue-browser-flow.ts` (**extended §0.6/§0.20**) | 6/6, **3 consecutive runs** — the conflict-notice gate, the next action, and an executable rehearsal guard | this branch |
| `scripts/verify-integration-manual-routing-storefront-browser-flow.ts` (**extended §0.7/§0.9-§0.10/§0.12-§0.15/§0.18-§0.20**) | **32/32, 3 consecutive runs**, against the real Elite-derived Routing V2 tree — hand-off (block G), exact-match provenance, exact refusal (wire and screen), zero Route Assist calls | this branch — see §5 |
| `scripts/verify-two-fresh-contractors-routing-v2-browser-flow.ts` (**new, §0.11, extended §0.16/§0.20**) | **22/22, 3 consecutive runs** — two contractors, tenant isolation, cross-tenant access through the real API, executable rehearsal guard | this branch |

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
  untouched. The booked `LineItem.resolvedEconomicBasis` (§0.15) goes
  further still: after the same later cost change, the contractor's CURRENT
  approval fingerprint is read directly and confirmed to have genuinely
  moved, while the booked row's own fingerprint stays pinned to the
  ORIGINAL basis — proof of WHICH economics justified this price, not just
  that the number happened to hold.
- **The qualification gate's large-appliance hand-off, launched for real,
  not flagged active (§0.13)** — a homeowner who answers "a specific large
  appliance" is handed off by name to "Dedicated Circuit & Outlet",
  configured/published/activated through the same supported actions as
  `new-120v-outlet` itself, and completes a full path through it to one of
  its own genuine terminal states (an instant price, or a photo-review) —
  proof the dependency the outlet's own launch depends on is actually live,
  not a raw flag flip standing in for it.

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

### Re-run in full after this review round (§0.13-§0.21) — same wall, nothing new broke

`npm run verify:full` was run again, start to finish, after every fix in
this section of the report. It stops at the SAME first wall as before
(`capture-hero-flow.ts --check`, §0's own consequence of the tree
migration) — confirming none of this round's changes to
`scripts/_derivedStorefrontFixture.ts` (which only ever touches throwaway
fixture contractors, created and torn down inside each browser-flow
script's own run), nor the `origin/main` merge (§0.21 — no shared file, and
`schema.prisma` untouched by it), altered Elite's or BrightPath's persisted
state. **The full suite remains failing overall — that is accurately
reported here, not minimized.**

**Separating what that means, plainly, because the two are easy to
conflate:**

- **FIXTURE DEFICIENCIES — gaps in how this disposable database happens to
  be bootstrapped, not defects in the product.** Nothing here was bulk-
  fixed to make a check pass, and none of it should be: doing so would mean
  approving on the order of 100 services' pricing across two contractors by
  fiat, which is not a thing this bounded pass — or any automated pass —
  should decide on its own.
  - ~103 seed-written, never-approved prices across Elite and BrightPath
    (`verify-public-pricing.ts` and its three cascades).
  - Elite's own `countryCode` was never set by the one-line bootstrap
    upsert (`verify-onboarding-readiness.ts`'s `COUNTRY_MISSING`).
  - Elite's own `new-120v-outlet` has no economics of its own now that it
    carries the real tree (`capture-hero-flow.ts`'s wall — §0 above).
  - No eligible crew, no Stripe connection, and a DB trigger `prisma db
    push` doesn't install — all four already documented in the electrical
    decision-tree audit's own fourth-pass report, reconfirmed unchanged
    here.
  - `fan-replacing-light`'s duplicate question order and the 9 British
    spellings — both pre-existing, both unrelated to Routing V2 or this
    engagement.
- **DEMONSTRATED REGRESSIONS — real bugs this pass found and closed, not
  left for a future pass:**
  - Extraction silently dropping `pricingMethod` (§0.9) — a real, generic
    tool defect, fixed in `scripts/extract-template-catalog.ts` and proven
    with a live before/after flip.
  - `new-120v-outlet`'s retired questions sharing one sentinel order
    (§0.10) — a real bug in `prisma/seed-new-outlet-v2.ts`'s own migration,
    fixed; confirmed absent from `verify-question-order.ts`'s failures
    afterward.
  - `PILOT_ANSWERS` referencing a qualification key `seed-questions.ts`
    retired — a real, silent staleness in production code
    (`lib/electrical/onboardingPilotReadiness.ts`), fixed.
  - This review round's own two fixture-only issues (the activation
    shortcut, §0.13; the approve-before-configure ordering bug, §0.14) —
    real bugs, but in THIS PASS'S OWN test fixture, not the product; both
    closed the same day they were introduced, before being reported as
    done.

Nothing in the FIXTURE DEFICIENCY list was touched to force a green run;
everything in the DEMONSTRATED REGRESSION list was a genuine bug and is now
fixed. That is the accurate state of the gate, not a rounded-up one.

## 7. Remaining release blockers

1. **Branch integration itself is done here, not yet reviewed.** This branch
   is the candidate; it has not been reviewed or merged.
2. **Schema, template, and catalog adoption.** This branch's `schema.prisma`
   carries PR #56's `GuidedFlowSession.activeSessionKey` (its own migration
   script, `prisma/migrate-guided-flow-session-active-key.ts`, applied so
   far only to disposable local databases) plus Routing V2's ~530-line
   schema addition. Applying either to Neon, extracting a real template
   from the real Elite catalog, and rolling Routing V2 out to new
   contractors are all separate, later, explicitly-authorized steps — not
   performed here, per `production-neon-requires-explicit-approval`. §10
   now records the concrete sequence and the rollback plan for each.
3. **Full storefront/booking rehearsal beyond what's proven here.** This
   pass's own new coverage is scoped to one Routing V2 service
   (`new-120v-outlet`, surface-mounted); the finished-wall and concealed-route
   modules, and the rest of Elite's real catalog, are proven at the function
   level (§4) but not yet walked through the browser the way this pass did
   for the surface-mounted path.
4. **`verify:full`'s 2-contractor concurrency wall is closed** (§0.8, §6).
   BrightPath is a real, persisted second tenant on `p2b_integration_seeded`,
   and `verify-platform-read-model.ts`'s concurrency check passes alone.
5. **Routing-V2-capable second-tenant provisioning is closed, including the
   contractor's own launch dependency** — the gap this item previously
   named. §0.9 corrected the diagnosis (extraction already carries
   component/quantity-binding wiring faithfully; the template it was tested
   against still held a legacy source tree, on this database, at the time)
   and §0.10-§0.11 completed it for real: Elite's own source was migrated
   onto the surface-raceway tree, extraction re-run against it, and TWO
   independent fresh contractors were proven to receive a fully working
   Routing V2 tree through ordinary `installCatalog`, including tenant
   isolation between them (§0.11, and through the actual API — §0.16). §0.13
   closed the one remaining shortcut: the qualification gate's own
   large-appliance hand-off target is now launched through the same
   supported actions as the outlet itself, not flagged active, and walked
   end to end. §0.18-§0.20 finished the remaining assertions: the booked
   fingerprint matches its real authorizing approval exactly (not just a
   non-null value), the material/component snapshots are verified, the
   stale-price refusal is checked at both the wire and the customer-visible
   screen, every browser-flow script carries an executable rehearsal-target
   guard, and zero Route Assist network calls are verified directly rather
   than inferred.
6. **`verify:full`, run to completion, surfaces a materially different,
   PRE-EXISTING wall — not a Routing V2 or this pass's own defect.** §6 has
   the full breakdown, now split explicitly into fixture deficiencies
   (seed-chain gaps, ~103 unapproved prices, a missing `countryCode`, no
   crew/Stripe/DB-trigger — none of it touched to force a pass) versus
   demonstrated regressions (extraction's `pricingMethod` loss, a duplicate
   question order, a stale qualification key, this round's own two
   fixture-ordering bugs — all found AND fixed, none left outstanding).
   Re-run to completion after every fix in this pass stops at the identical
   first wall, confirming nothing new broke. Re-approving on the order of
   100 services across two tenants by fiat is a materially larger
   undertaking than this bounded pass and is deliberately not attempted
   here.
7. **`origin/main` has moved since this branch forked — now reconciled
   (§0.17, resolved in §0.21).** The one real conflict (`package.json`'s
   `verify:full`/`verify:fast` script lists) is merged as a union for
   `verify:full` and main's own trimmed version verbatim for `verify:fast`.
   Verified post-merge: clean typecheck, clean `prisma generate`, a fresh
   build, and all three of this branch's own browser-flow suites unchanged.
   This branch's relationship to main's new `electrical v3` template delta
   (whether/when to adopt it) remains a real, separate product decision —
   not something a merge resolves on its own — and is part of §10.2's
   adoption sequence, not attempted here.
8. **A material-cost change stales every derived-priced service on that
   contractor, not just the one being edited (§9).** Real, existing
   product behavior, not a bug this pass introduced or fixed — documented
   so it is a known workflow cost rather than a future surprise.

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
a change to a prior one. `main` was never touched — this branch pulled
main's commits in (§0.21), a one-way merge; nothing was pushed or written
back to `main` itself. PR #56, PR #62, and `feat/electrical-routing-v2` all
remain exactly as they were. Deployment stays disabled for every branch
named in `vercel.json`, this one included.

## 9. Known product behavior: a material-cost change stales EVERY derived-priced service on that contractor, not just the one being edited

§0.14 fixed a bug in THIS PASS'S OWN test fixture (approving before
configuring), but the underlying mechanism it ran into is real, existing
product behavior worth documenting on its own, independent of any bug: the
derived-pricing approval fingerprint
(`lib/electrical/derivedPricingBasis.ts`) is computed from
`lib/electrical/loadDerivedScope.ts`'s `loadDerivedPricingBasis`, which reads
`contractorMaterial.findMany({ where: { contractorId } })` — every material
cost row for the CONTRACTOR, not filtered to the roles the specific service
being approved actually consumes.

**The consequence a contractor will actually experience**: entering or
changing a material cost for ANY service invalidates the approval
fingerprint of EVERY `DERIVED_RESOLVED_SCOPE` service that contractor has
already approved — even one that shares no component, no material, and no
category with the service just edited. A contractor onboarding several
Routing V2 services in sequence will find each EARLIER approval goes stale
the moment they configure a LATER one, and will need to revisit and
re-approve it before it can be booked again. This is not a data-loss risk —
`resolveWithDerivedPricing`'s own refusal (`DERIVED_PRICING_APPROVAL_STALE`)
fails closed to REVIEW rather than pricing at a mismatched basis, and every
already-booked line stays exactly as priced (§0.7/§0.15/§0.18) — but it is a
real workflow cost this reconciliation did not introduce and does not fix.

**Not fixed here, deliberately.** Narrowing the fingerprint's scope to only
the materials a given service's own recipe reaches is a real, well-scoped
possible improvement, but it is a change to derived-pricing's own core
logic — outside a branch-reconciliation pass, and a decision that deserves
its own review rather than arriving as an incidental fix inside this one.
Recorded here so it is a known, named behavior rather than something a
future onboarding session rediscovers as a mystery. A contractor completing
Routing V2 setup for multiple services in one sitting should approve each
one, or re-approve in a final pass, only after ALL of that sitting's
material costs are entered — configuring in that order avoids the
churn entirely without requiring any code change.

## 10. Schema, template, and catalog adoption — and the rollback plan

This branch's own rehearsal has stayed local and disposable throughout
(§4, §0.8, §0.10). Adopting any of it onto the real platform is later,
separate, explicitly-authorized work — not performed here — but the shape
of that work is concrete enough to write down now, so a future session
starts from a plan rather than from scratch.

### 10.1 Schema adoption

This branch's `schema.prisma` carries two additions beyond `main`:
PR #56's `GuidedFlowSession.activeSessionKey` unique constraint (backfilled
by `prisma/migrate-guided-flow-session-active-key.ts` before the constraint
can be added, since a unique index cannot land on top of existing
duplicates) and Routing V2's ~530-line schema addition (the surface-raceway
and derived-pricing model family, including the `LineItem` provenance
fields §0.9/§0.12/§0.15/§0.18 exercised).

**CORRECTED (§0.22): the order below was backwards in the prior draft of
this plan, and step 2's tooling claim was checked against the actual script
and found impossible as written.** Both corrected against
`prisma/migrate-guided-flow-session-active-key.ts` and
`prisma/_assertDisposableLocalDatabase.ts` directly, and rehearsed locally —
see §0.22 for the executed proof.

1. **`prisma db push` (the schema change) FIRST.** The backfill script's own
   docstring states this order explicitly — a brand-new nullable column
   starts NULL on every existing row, so the schema change alone is safe,
   and only THEN does `activeSessionKey` exist for the backfill to write
   into. Rehearsed locally (§0.22): running the backfill against a database
   still on the pre-migration schema fails immediately with Prisma's own
   `P2022` ("column ... does not exist"); running it again after `db push`
   succeeds cleanly. The prior draft of this plan had these two steps
   reversed.
2. **The backfill's own duplicate-handling was rehearsed with populated,
   not synthetic-empty, data — and fixed (§0.23).** "No duplicates" was
   never the interesting case: every pre-existing ACTIVE row, duplicate or
   not, needs `activeSessionKey` written, and a duplicate group needs a
   real decision about which row survives. The version of this script
   rehearsed in §0.22 only ever ran against an empty table, which proved
   the column-ordering claim but nothing about what happens with real
   session data. Populated locally with four scenarios — a duplicate pair
   with genuinely different `consumedAnswers`, a duplicate pair where the
   loser still has a live (`AVAILABLE`, unexpired, or `CONNECTED`)
   `DeviceHandoff` pointing at it, a duplicate pair where the loser still
   has a `PENDING` `GuidedFlowVisualAssistTask`, and one ordinary
   non-duplicate session — the ORIGINAL script blindly abandoned every
   loser, including the two with a live handoff or task still pointing at
   them, and reported nothing about the discarded answers. Both are real
   correctness gaps, not hypothetical: an abandoned session with a live
   `AVAILABLE`/`CONNECTED` handoff breaks whatever second device is
   mid-join on it, silently, and a discarded `consumedAnswers` payload
   different from the survivor's is real customer progress with no record
   it ever existed. **Fixed, then corrected again (§0.24): a loser with a
   live handoff or a pending visual-assist task is left ACTIVE rather than
   abandoned, reported by id and reason; a group with genuinely divergent
   answers is left COMPLETELY UNTOUCHED — no row abandoned, no key
   backfilled for anyone in it, not merely logged before abandoning
   anyway, which is what this section originally (and wrongly) described.**
   The script has no product answer for "which of two genuinely live or
   disagreeing sessions should win" and does not invent one for either
   case. §0.24 also found and fixed a real crash path this rehearsal had
   not yet exercised: choosing a winner by recency alone could pick a
   still-unmigrated legacy row over one the real application code had
   already correctly keyed, and abandoning the correctly-keyed loser
   without clearing its key (not the real `abandonSession`) crashed the
   whole run on the `@unique` constraint the moment the backfill tried to
   give the actual winner that same key — ending the migration with every
   group before the crash migrated and every group after it untouched.
   Winner selection now prefers an already-correctly-keyed row over
   recency, and every abandon now calls the real `abandonSession`, which
   always nulls the key. Rehearsed with six populated scenarios,
   including the exact crash constructed directly (an older correctly-
   keyed row, a newer null-keyed duplicate) resolving safely with no
   crash. Rehearsed twice consecutively for idempotency. All
   session count.
3. **This exact script cannot be pointed at Neon, branch or production —
   this is not a policy, it is enforced code.**
   `prisma/_assertDisposableLocalDatabase.ts`, which this script calls
   before touching a row, checks `DATABASE_URL`'s host and calls
   `process.exit(1)` on anything that is not `127.0.0.1` or `localhost`.
   There is no flag or environment variable that bypasses this. So "rehearse
   on a Neon branch, then run this backfill against the branch" — the prior
   draft's step 1 — is not an instruction this script can execute; it is a
   contradiction. Real adoption needs one of:
   - a separate, reviewed, one-off migration script — following this
     repository's own established precedent for a real Neon data migration
     (`prisma/migrate-material-split-2026-08-24.ts` is the pattern: a
     dated, one-off script written FOR that specific production change,
     never intended to be run twice or reused as general tooling) — that
     carries the same duplicate-resolution and backfill logic this script
     already proves correct, but without the loopback refusal, still gated
     by the same explicit, in-conversation authorization
     `production-neon-requires-explicit-approval` requires for every step
     of a real Neon operation; or
   - confirming through some other channel (a Neon branch created and
     inspected under that same explicit authorization) that production
     carries no pre-existing duplicate ACTIVE sessions per
     (contractor, session, service) triple, so the backfill has nothing to
     do and only the additive schema change needs to reach Neon at all.
   Neither is performed here; this plan names the fork in the road rather
   than picking a branch of it, because picking one is exactly the kind of
   production-consequential decision `production-neon-requires-explicit-
   approval` reserves for explicit, in-conversation authorization.
4. Re-run this branch's own `verify:full` against wherever the schema
   change actually lands, to confirm the new tables/columns behave as this
   report already proved locally, now against a real (copy-on-write)
   production dataset shape.
5. Both schema additions are purely additive (new tables, new nullable
   columns, one new unique constraint on a backfilled column) — the
   existing application code already deployed to production does not read
   or write any of them, so applying the schema change alone, with no
   application code change, is safe to do first and separately from
   anything else below.
6. Only after a clean branch rehearsal, apply to production in a scheduled,
   authorized window — the backfill via whichever real mechanism step 2
   settles on, never via the disposable-local-only script this branch
   actually ships.

### 10.2 Template and catalog adoption

Local, disposable-database-only extraction (§0.8, §0.10) is explicitly not
the same operation as adopting Routing V2 into the REAL production catalog.

**CORRECTED (§0.22): the prior draft of this section understated how far
along production's real template already is, named the wrong extraction
tool, and got what "a new version" actually protects backwards.** All three
corrected against `prisma/template/electrical-v3-provenance.json` (checked
into this branch, and the authoritative record of a real production write),
`scripts/extract-template-service.ts`, `scripts/extract-template-catalog.ts`,
and `lib/templateProvisioning.ts` directly, plus a local rehearsal — see
§0.22.

**Production's real template state, as of this provenance record, is
already past v1:**

```
electrical  SNAPSHOT v1  (75 services, Elite's full catalog)
electrical  DELTA    v2  (new-120v-outlet)
electrical  DELTA    v3  (Material Catalog Phase 1C — 6 services:
                           new-video-doorbell-wiring, generator-inlet-interlock,
                           240v-garage-outlet and its 3 prong-count siblings)
```

This branch's OWN local rehearsal database never reached that state — it
carries only the single v1 SNAPSHOT this whole report's local proofs were
built against (confirmed directly: `TemplateVersion.findMany` against
`p2b_integration_seeded` returns exactly one row, `version: 1`). **Local
rehearsal cannot exercise the actual version arithmetic a real extraction
needs**, and the prior draft's `--version 2` was wrong for exactly that
reason: it was the next number for THIS branch's local database, not for
production, where 2 and 3 are already taken. The real next version must be
read live from production at the moment of the real extraction
(`MAX(version)` for `trade: "electrical"`, plus one), never assumed or
hard-coded in a plan written before that moment.

Real adoption is a deliberate, later sequence:

1. **CORRECTED (§0.23): changing Elite's live tree directly is not the first
   step.** The prior draft treated "migrate Elite's real
   `new-120v-outlet` onto the surface-raceway tree" as the way to prepare
   canonical content — hand-editing a live tenant's own `Question`/
   `AnswerOption` rows as if that were template authoring. It is not: it
   conflates preparing CANONICAL content (a template concern) with
   adopting it onto one contractor's live catalog (a per-contractor
   concern), and it bypasses the one tool this codebase already has for
   the second half — `scripts/template-update.ts` — entirely. The
   corrected sequence separates them:
   - **Prepare the canonical surface-raceway content in the template
     layer directly** (authoring a new DELTA against a reviewed source —
     not Elite's live rows — the same way v2 and v3 already added content
     without touching any contractor's tree first), publishing it through
     step 2 below.
   - **Adopt it onto Elite (and any other already-provisioned contractor)
     through `scripts/template-update.ts --status` / `--adopt <key>`** —
     the SAME bounded, per-change, conflict-aware mechanism any other
     contractor already uses to receive a template update, rather than a
     one-off script rewriting Elite's rows directly.
   - **One-time prerequisite, rehearsed (§0.23): Elite's own service
     currently has no template provenance at all** —
     `Service.templateKey`/`templateVersionId` are both `null` on Elite's
     live `new-120v-outlet`, confirmed directly. This is not a defect to
     patch around; it is the honest state of a tenant that predates the
     template system and IS the source v1 was extracted from.
     `template-update.ts` requires that provenance to find a contractor's
     service at all (`findFirstOrThrow({ where: { templateKey: ... } })`)
     — confirmed by running it against Elite unmodified: it fails
     immediately with Prisma's own `P2025`, "No Service found." The
     one-time fix is a genuine, honest backfill: set
     `templateKey: "new-120v-outlet"` and `templateVersionId` to v1's own
     `TemplateVersion.id` — a TRUE claim, since v1 literally IS an
     extraction of this exact tree, not a fabricated link. Rehearsed
     locally: after this one backfill, `template-update.ts --status`
     against Elite works, correctly detects a genuinely new question as
     adoptable and a wording change Elite had already customized as a
     **CONFLICT** ("you have already changed this; yours is kept") rather
     than silently overwriting it. `--adopt <key>` on the adoptable change
     wrote it to Elite's live tree, structure only, and correctly reset
     the service to unresolved (`materialCostResolved: false`,
     `publishedPriceApprovedAt: null`, `basePrice: null`) exactly as the
     tool's own safety net documents; `--adopt` on the conflicting change
     correctly refused and left Elite's customization untouched.
     **CORRECTED (§0.24): that first rehearsal only proved label/wording
     adoption — it did not prove the tool carries what Routing V2 actually
     needs.** Direct review found `--adopt` never wrote
     `nextQuestionKey`/`rerouteServiceKey`/`referencedServiceKey`, never
     copied a question's or option's numeric bounds, and never created
     `AnswerOptionComponent` rows — an adopted Routing V2 question would
     have landed on a live tree with no route to anywhere, no numeric
     validation, and no material consequence. Fixed: the tool now resolves
     every routing key against the adopting contractor's own live tree
     (falling back to `slug` for a tenant like Elite with no `templateKey`
     at all) and carries every numeric and component field. Rehearsed
     against Elite's live tree: a new question with a numeric range and an
     option carrying its own numeric bounds, a `nextQuestionKey` that
     resolved to the real live `purpose` question (confirmed by exact id
     match), and a real canonical-component binding all landed correctly;
     a second option's intentionally unresolvable `rerouteServiceKey` was
     correctly written `null` and reported by name rather than guessed.
     Materials, disclaimers, photo groups and policy-banded patterns are
     still not carried by this tool — a named, open gap, not part of this
     correction. All
     rehearsal writes (the backfill, the scratch DELTA, the adopted
     question, the customization test) were then reverted, restoring this
     database's exact baseline.
   - **Alongside preparing the canonical content, not after it**: prepare
     Elite's `pricingMethod` and economics for whatever tree it ends up
     adopting. This pass's own local finding (§6) is that Elite's
     `new-120v-outlet` has no economics of its own once it carries the real
     tree (`capture-hero-flow.ts`'s "no path that reaches a price" wall) —
     adopting the tree onto the live platform without also preparing
     pricing would reproduce that exact failure for Elite's real
     customers, not just in this branch's disposable rehearsal.
2. **Extract for real using `scripts/extract-template-service.ts`, per
   service, writing a DELTA — the same tool production's own v2 and v3
   already used, not `scripts/extract-template-catalog.ts`.** The catalog
   tool's own docstring says what it does: it "REPLACES WHATEVER a live
   TemplateVersion currently offers" — a full-catalog SNAPSHOT overwrite.
   Running it against Elite's CURRENT live tree today would extract a
   catalog that does NOT contain v3's Phase 1C recipe promotions, because
   — per the provenance record's own "adoption status" — "zero contractor
   Service rows carry v3 provenance": v3 was published straight to the
   template layer and never adopted back onto Elite's own live rows.
   `templateVersionSource`'s resolution only folds a DELTA whose version
   exceeds the latest SNAPSHOT's version (`lib/templateProvisioning.ts`), so
   publishing a fresh SNAPSHOT at, say, version 4 would make v3's own
   `version: 3 > 4` comparison false — v3 would simply stop folding in, and
   every contractor installing from that point on would silently receive a
   catalog missing the Material Catalog Phase 1C work, with nothing in the
   resolution path reporting that anything went missing. This is precisely
   the "displace the material-catalog changes already delivered" risk this
   correction round named. `extract-template-service.ts` writes a DELTA and
   cannot cause it; a full-catalog re-SNAPSHOT is not what any real
   adoption from here should do.
3. **Two real gaps in this exact tool, one now FIXED, one still open
   (§0.23).** Direct inspection of `extract-template-service.ts` — the tool
   step 2 designates for real adoption — found it dropped `pricingMethod`
   silently (the identical defect §0.9 already found and fixed in its
   catalog-tool sibling, never applied here) and wrote its five-plus
   statements as separate round trips outside any transaction, so a crash
   mid-publication left a partial `TemplateService` — some questions
   present, others not — fully visible to any fresh install in that
   window. **Both are fixed now, not merely named**: the write path is
   wrapped in one `prisma.$transaction`, and `pricingMethod` is read and
   carried through. Rehearsed locally (§0.23): a fault injected after 3 of
   16 questions rolled back completely — zero `TemplateVersion`, zero
   `TemplateService`, zero `TemplateQuestion` rows at that version,
   confirmed by direct query — and a real before/after flip of the
   source's `pricingMethod` proved the fixed tool carries the true value
   rather than the schema default, the same proof style §0.9 used.
   **Still open, not closed by this pass:** the tool carries no
   database-identity or production-write guard of any kind — confirmed by
   direct inspection, zero matches for `production`/`assertDisposable`/
   `i-know` anywhere in the file. `extract-template-catalog.ts`'s
   equivalent guard (`--i-know-this-writes-to-production`) does not exist
   on this tool. The provenance record's own "governance" section already
   names the consequence: v3's real `--apply` against production ran
   "before the branch existed in git at all, let alone before review." Any
   future real extraction via this tool needs the operator to verify
   `DATABASE_URL` and environment by hand before `--apply`, or the tool
   needs the same guard its sibling already has — recorded here as a real
   gap, since building it is tooling work outside this correction's
   scope.
4. **What "a new version" actually protects, rehearsed locally (§0.22):**
   extracting `new-120v-outlet` as a fresh DELTA (v2, against this branch's
   own single-SNAPSHOT local database) left the existing v1 SNAPSHOT
   completely unchanged — still 74 services, byte-for-byte — and
   `templateVersionSource` with no `atVersion` (the real onboarding path)
   resolved the NEW DELTA's copy immediately, with no staging step, the
   moment it was written. A new version protects EXISTING content from
   being overwritten; it does nothing to delay or gate when the new content
   goes live. There is no version of this plan in which extracting is safe
   because it is "not live yet" — it is live the instant `--apply` returns.
   The rehearsal write was removed afterward, restoring this database's
   original single-SNAPSHOT state.
5. **Two more real gaps closed, and true recovery proven (§0.24), not
   assumed from the crash-only proof in point 3 above.** The tool allowed
   silently overwriting an already-published version for the same service
   key with no refusal at all — fixed: it now refuses by default, requiring
   `--i-know-this-overwrites-a-published-version` typed out deliberately,
   rehearsed both ways (refused without the flag, proceeded with it, and
   confirmed a DIFFERENT service extracted into the same version is never
   caught by this check). It also never wrote policy bindings at all — a
   real, existing policy-banded question (`dedicated_distance` on
   `dedicated-120v-circuit-outlet`) extracted through this tool would have
   silently lost its band shape; fixed by sharing the same band-pattern
   logic `extract-template-catalog.ts` already uses, rehearsed against that
   exact real question with the written rows confirmed by direct query.
   Separately, §0.23's crash rehearsal proved recovery from an
   *interrupted* publication, not from one that had already gone live —
   §0.24 rehearsed the real case: a deliberately "bad" already-live version
   was superseded by a corrective forward version for the same key, with
   `templateVersionSource` confirmed to resolve the corrected content
   afterward and the original "bad" version's own row confirmed completely
   unchanged throughout.
6. Decide `new-120v-outlet`'s `pricingMethod` on the template deliberately
   (`prisma/seed-routing-v2-pricing-method.ts`, or its real-catalog
   equivalent) — per its own docstring, this changes what a contractor
   provisioned FROM HERE ON receives, not any existing contractor's
   service. Elite's own real service does not change pricing method by
   this — no supported action retroactively promotes an EXISTING
   contractor's service (§0.9's own finding).
7. Roll out to new contractors deliberately, not silently — this is
   `electrical-routing-v2-workstream`'s own "Stage 1B needs authorization"
   boundary, unchanged by anything in this reconciliation.

### 10.3 Rollback plan

**CORRECTED (§0.22): both bullets below named the wrong mechanism in the
prior draft.** `vercel.json`'s per-branch flag and `templateVersionSource`'s
`atVersion` parameter were each checked directly and neither does what the
prior draft claimed.

- **Code**: NOT `vercel.json`'s per-branch `deploymentEnabled: false`. That
  flag stops a NEW deployment from being triggered by a future push to this
  branch — it does nothing to the build that is already running in
  production. Confirmed by what that flag actually gates
  (`docs/design/deployment-provenance-stage1.md`'s own Vercel facts) and by
  how this repository's own release tooling defines rollback:
  `docs/design/production-release-authority.md`'s "Rollback" section states
  it plainly — "the previous approved deployment id is the last `previous`
  in the release log; promote it with `vercel promote <id>` or through the
  release command." `scripts/release-production.ts` builds this in as a
  first-class mechanism, not an afterthought: every real release's creation
  receipt (`recordCreation`) captures the OUTGOING production deployment id
  and its alias mappings BEFORE the new deployment is even created
  (`outgoingDeploymentId`, `outgoingAliases` — see the "recovery baseline"
  language throughout `scripts/_releaseControl.ts` and
  `scripts/_releaseRun.ts`), specifically so that id is available to
  promote BACK if the new release turns out to be wrong.
  `RECOVERY_REQUIRED` is the exact, already-implemented failure state this
  system surfaces when a promotion's post-verification fails, and it hands
  the operator this same recorded target. The rollback action is: promote
  the recorded `outgoingDeploymentId` to production — the identical
  `promoteDeployment`/phase-C mechanism a forward release already uses, run
  once more, aimed at the prior id instead of the new one. Disabling this
  branch's future deployments (the `vercel.json` flag) is worth doing so
  nothing NEW ships from it by accident, but it is not the rollback lever
  itself.
- **Template**: NOT `atVersion`. Its own docstring (already quoted
  correctly elsewhere in this report, §10.2's predecessor) says "for tests
  and repairs only... onboarding never passes this" — confirmed again by
  direct inspection this pass: no real onboarding code path reads it, so
  pinning it changes nothing about what a real contractor installs.
  Confirmed further by inspecting `TemplateVersion`'s own schema: there is
  no `active`, `published`, or `staged` column at all — nothing exists to
  "un-publish" a version once written. A SNAPSHOT or DELTA is immediately
  and permanently the latest of its kind the moment `--apply` returns
  (§10.2's own rehearsal proved the "immediately live" half of this; the
  schema inspection proves the "permanently" half). The real rollback
  action is to publish a CORRECTIVE version — a new DELTA (or, rarely, a
  new SNAPSHOT) at the next version number, carrying the prior good
  content — never to delete the bad `TemplateVersion` row. Deleting it
  protects nothing already provisioned (a contractor who installed from it
  holds their own copied, contractor-owned rows regardless — ADR-014,
  provenance is a record, not a live link, exactly as §10.2 already
  establishes) while destroying the only record of what was actually
  published and when. This mirrors a convention this codebase already
  holds elsewhere: `MaterialBaselineVersion` is documented "IMMUTABLE BY
  CONVENTION... application code only ever INSERTS a new row — never
  updates or deletes one," for the identical reason — rows already relied
  upon may point at it.
- **Schema**: both additions are purely additive (§10.1) — the safe
  rollback for application code is a deployment rollback to the prior
  release, which works cleanly against a schema that only ever ADDED
  columns/tables the old code never reads. Dropping the new tables/columns
  outright is a separate, deliberate, human-authorized action, never an
  automatic consequence of a code rollback, per this repo's own standing
  caution around irreversible database operations.
- **Booking safety, independent of any of the above**: this whole
  engagement's own snapshot proofs (§0.7, §0.12, §0.15, §0.18) mean a
  rollback — of code, of a template version, or of the pricing engine
  itself — cannot retroactively alter an already-booked price, its
  answers, or its economic basis. Whatever is rolled back, existing
  bookings hold exactly what they held before.
