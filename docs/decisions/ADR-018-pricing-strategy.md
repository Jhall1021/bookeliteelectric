# ADR-018 — two customer promises, one scope engine

**Status:** ACCEPTED, 28 August 2026.
**Relates to:** ADR-001 (canonical role vs contractor economics), ADR-002 (fail closed),
ADR-003 (nothing publishes a price silently), ADR-014, ADR-016.

---

## The decision

A contractor makes one of two fundamentally different promises to a homeowner:

    FLAT_RATE           scope + economics                              -> one approved fixed price
    TIME_AND_MATERIALS  scope + approved bounds + crew-hour rate + materials -> an estimated range

Contractor-level in V1. **No per-service overrides** — a catalogue where some services quote
fixed and others estimate is a support problem before it is a feature.

Pricing strategy is an **interpretation and publishing mode over contractor-owned inputs**. It
never rewrites the service tree, durations, materials or previously configured economics.

## One scope engine, not two catalogues

    service -> questions -> answers -> scope -> labour and material requirements

feeds both. There is no separate T&M catalogue and no T&M variant of a service. Only the final
step differs. That is the payoff from separating canonical trade knowledge from contractor policy
and economics in ADR-001 and ADR-014: **the trade knowledge did not have to change at all.**

## The rate is per CREW-HOUR, and now says so

`PricingSettings.targetRateCents` was documented as *"revenue per productive tech-hour"*. The
engine has always charged **crew-hours** — `POLICY[crew.composition]: ONE_VAN_LEAD_PLUS_HELPER`,
*"Crew-hours, not person-hours"* — and `requiresTechCount` counts **vans, not people**. The
comment and the code said opposite things, and the code was right.

That ambiguity had already produced one real defect: labour was once computed as
`hours * techCount`, charging again for the helper who rides in every van as standard.

It stops being internal under T&M, where the number is shown to the homeowner. One contractor
billing "$149/hour" for a single technician and another billing "$225/hour" for a two-man crew
must mean different things by the same field. Renamed to **`crewHourRateCents`** by
expand–contract; the **value is unchanged**, because the behaviour was never wrong.
`db:reconcile` after the rename: **0 differing.**

## Estimate bounds are contractor calibration

`Service.estimateLowCrewHours` / `estimateHighCrewHours` / `estimateApprovedAt`.

**Contractor calibration, not canonical trade knowledge.** The template knows a job has a duration
and which answers add to it; how many hours *this* contractor needs, and how uncertain that is,
belongs to the crew doing the work.

**Unresolved by default, and unresolved is `null` — never `0`.** Zero crew-hours is a real number
and must never stand in for "not told yet". `validateEstimateBounds` refuses a zero or negative
low outright.

**No midpoint rule.** A contractor saying 2–9 against a 3-hour baseline is describing real
asymmetric risk, not making an arithmetic error.

**Suggested is not approved.** `suggestBounds()` offers a starting point from `fieldLaborHours` —
asymmetric, because jobs overrun far more often than they finish early, and a symmetric band would
quietly teach contractors that the midpoint is the answer. Nothing stores it. Bounds present with
`estimateApprovedAt` null are **not publishable**, exactly as a calculated price without
`publishedPriceApprovedAt` is not. *Price2Book can suggest. You approve.*

### Why not a contractor-level ±%

Rejected by the owner. One percentage applied to every service manufactures every range from a
single number — which is the thing this ADR exists to prevent, differing only in who chose the
percentage. The data model stays truthful; **Guided Setup is where truthful configuration is made
to feel easy**, by presenting suggestions and allowing bulk approval of genuinely similar services.

### What the audit found first

All **56** active, non-quote-only services already carry `fieldLaborHours`. Zero missing. So the
contractor is not asked to start from nothing — they are shown a baseline and asked the one thing
Price2Book cannot know: *how uncertain is this particular job?*

Also found: the answer-level duration fields (`overrideEstimatedMinutes`,
`overrideFieldLaborHours`, `addFieldLaborHours`, `addScheduleMinutes`, `overrideTechCount`) are
**unused across all 539 answer options**. Answer-driven duration flows through
`ContractorComponent.addFieldLaborHours` instead. Those five columns are a dead second path and a
candidate for a later contraction.

## Readiness is strategy-specific

A service can be fully configured for FLAT_RATE and still need T&M calibration, and the reverse.
Collapsing them into one flag would mean switching strategy silently changed which services a
homeowner could book.

The corollary: switching strategy **reads** a different set of fields. It never writes, clears or
rewrites the other strategy's configuration, so switching back finds everything as it was. Proven
against a throwaway contractor by round-tripping and comparing the row.

Shared gates — unresolved materials, unresolved policy — block **both**. Quote-only services are
ready under both, because a human prices them by design.

## Materials stay one figure in V1

Shown as an estimate under T&M. No material low/high without evidence anyone needs it: two more
numbers per service, when the labour band is where the variance actually lives.

## The flat-rate minimum is not applied to an estimate

`primaryMinimumCents` is a floor on a **fixed price** — a promise about the smallest job worth
quoting. Under T&M the homeowner is told the rate and billed for the hours, so flooring the
estimate would advertise a charge the final invoice may not contain.

**This is not a claim that T&M has no minimum.** Many T&M contractors do have one. When that is
needed it gets its own explicit optional concept — *minimum billable crew-hours* or *minimum
service charge* — and **the customer-facing estimate must disclose it**, because an undisclosed
floor turns a range into a misleading one.

What it must never be is `primaryMinimumCents` reused. That field means "the smallest fixed price
we will quote", and borrowing it would make one number carry two different promises.

Not added in V1: no current T&M surface needs it, and a setting nobody uses is a setting nobody
maintains.

## Price2Book's boundary, restated

**May:** estimate scope, estimate duration, estimate materials, calculate a range, capture the
homeowner's authorisation.

**Does not:** clock technician time, record final T&M labour, create an invoice, do job costing.
That is the FSM's, under either strategy.

## Contractual wording lives in the copy layer

`EstimateRangeCard` renders `copy.estimateNotice` and authors none of its own — asserted by the
verifier. Legal and customer wording must not sit inside calculation or presentation code, where
changing it means a deploy and nobody can find it.

Strategy-aware nouns throughout: *Price / Book at this price* against *Estimate / Estimated total /
Authorize service*.

## Proof

`verify-pricing-strategy` — **41 checks**: structural validation of bounds, suggestion-is-not-
approval, strategy-specific readiness, fail-closed estimating, neither promise leaking into the
other, and a full switch round-trip against a throwaway contractor. In `verify:template`.

`scripts/verify-pricing-strategy.ts` is on the `audit-price-writers` allow-list with its reason:
proving that switching preserves both configurations requires both to exist.

Gate 256, `verify:template` 143, tenancy 174, **reconcile 0 differing**, Elite's storefront
fingerprint unchanged.


---

## Surfaces — 28 August 2026

### Readiness, six states not one

`/dashboard/estimates` distinguishes **Ready**, **Entered, not approved**, **Needs estimate
range**, **Invalid**, **Other unresolved requirement** and **Quote only**. Collapsing them into a
single "Needs Pricing" count would tell a contractor there is work without telling them what it
is — the same failure the Overview's `52 of 69` made, where thirteen of the seventeen
"outstanding" services were correctly configured quote-only.

A FLAT_RATE contractor sees none of it: the screen says their services do not need hour ranges,
and that anything entered will be waiting if they ever switch.

### Entered is not approved

Two buttons, two verbs. **Save** records the numbers. **Approve for customer estimates** releases
them. Saving also **clears any previous approval** — numbers a human has not seen since they
changed are not numbers a human has approved.

Bulk save and bulk approve both exist, because setting fifty-six services one at a time is how
onboarding dies. Bulk approval is still an explicit act, never a side effect of saving, of filling
in suggestions, or of switching strategy.

The suggested band renders as a **button next to an empty field**. It becomes a value only when
the contractor takes it. Nothing writes on load.

### The real guided flow

`EstimateRangeCard` is reached from the same `resolved` state as `PriceConfirmationCard`, off the
same `applyBranch` configuration. There is no preview data on this path.

**The payload carries only what the homeowner is shown.** A T&M storefront receives the crew-hour
rate, the approved band and each component's added hours — all of which appear on the page anyway.
A FLAT_RATE storefront receives none of it, so the earlier decision to strip cost inputs from
`ServiceFlowDTO` is untouched. Verified against Elite on a service with four real components: the
component payload carries exactly `key`, `customerFacingLabel` and `approvedPriceCents`.

Reading the rate needed splitting one query into two — `PricingSettings` is tenant-owned, and
reading it as a relation beneath `Contractor` is the platform-parent-to-tenant-child shape ADR-007
forbids. The audit refused the build until it was rooted at its own model.

### Scope decisions move the range

The rule: **the contractor's approved band describes the base service's uncertainty; a component
adds a known, already-decided quantity of work.** Both bounds move by the same amount.

    2–3 hours + a 1-hour component  ->  3–4 hours

The band's WIDTH is unchanged, because the component is known work rather than new uncertainty.

`JobConfiguration.addedCrewHours` tracks the increment as its own accumulator rather than
subtracting the baseline — `overrideFieldLaborHours` REPLACES rather than adds, and a subtraction
would silently report an override as an increment. Proven through the real engine: quantity
multiplies, increments accumulate across successive answers, and a component whose condition does
not match adds nothing.

### Materials are disclosed, not approximated

The material markup is applied **once to the assembled package, never per part**. Summing a
marked-up figure per selected component would overstate it; shipping raw component costs would
reverse the cost-input decision. So V1 quotes the **labour** range and discloses that materials
are additional, at cost plus markup.

This is a deliberate departure from the worked example in the brief. An understated total in a
customer-facing estimate is a promise problem, not a rounding one, and the alternative was a
materials figure that is wrong precisely when the route selects components.

### Flat rate is unchanged

`verify-flat-rate-unchanged` replays every active service's tree through the real engine —
`startConfiguration`, `applyBranch`, `customerPrice` — taking the first answer at each question,
and compares total, component set and review state against a recorded baseline.

**The baseline was recorded from the tree BEFORE this work**, using `git stash`, and the tree
after it reproduces all **69** services exactly. The comparison deliberately excludes
`addedCrewHours`: it does not exist on the older engine, and the claim is that the flat-rate total
does not depend on it.

`db:reconcile` after the whole phase: **0 differing.**

### Still deferred

A T&M minimum (see above), material ranges, per-service strategy overrides, and Guided Setup's
bulk-calibration flow.
