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
