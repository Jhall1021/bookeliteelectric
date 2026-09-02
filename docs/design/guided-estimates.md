# Guided Estimates

**Status:** proposed, and deliberately not scheduled. Nothing here is built in
this pass. The purpose of writing it now is that **HVAC V1 is modeling its
catalog around this outcome right now**, and one decision below (§4) is
destructive to defer.

---

## 0. The finding that reframes this

The feature was proposed as new. Most of it shipped some time ago.

| Piece | State |
| --- | --- |
| A service that is never priced online | `BookingType.REMOTE_QUOTE`, `RouteAction.REMOTE_QUOTE` |
| Guided questions collecting scope | `Question` / `AnswerOption`, snapshotted to `Quote.answersSnapshot` |
| Per-answer required photos | `AnswerOption.requiredPhotoLabels`, `photosBlockBooking` |
| The estimate record | `Quote`, `QuoteStatus` SUBMITTED → IN_REVIEW → PRICED → APPROVED → EXPIRED |
| Contractor review queue | `/dashboard/quotes`, tenant-guarded, photos rooted at `Photo` |
| Contractor sets a number | `QuotePricingForm` → `PATCH /api/admin/quotes/[quoteId]` |
| Homeowner is told | Resend email, contractor-branded, links to their storefront |
| Homeowner accepts | `app/[site]/quote/[quoteId]` → `POST /api/quotes/[quoteId]/approve` |
| Accepting books it | Fills the **existing** line item's `computedPriceCents`; the visit leaves `awaitingQuote` and scheduling unlocks |

The round trip is complete and it is correctly guarded. An approved estimate
does not bypass tax or deposits, because it does not build its own checkout —
it prices a line item and the normal checkout runs `applySalesTax` and
`decideDeposit` over the visit like any other booking. **That is the property
to protect.** An estimate is a path *into* the booking engine, never a second
one beside it.

So Guided Estimates is not an architecture project. It is a **product model,
a name, a contractor-facing control, and one honest gap** (§5).

---

## 1. The three-way model — adopted

Every service has a **customer pricing path**, chosen by the contractor:

| Path | Meaning |
| --- | --- |
| **Price online** | Price2Book knows enough to produce the contractor-approved price. |
| **Guided Estimate** | Price2Book collects everything the contractor needs to price the work remotely. A human sets the number. |
| **Book a visit** | The scope genuinely requires someone onsite. |

This replaces the implicit binary — "online price, or not online" — and it is a
better description of contracting than the binary was.

**The rule that keeps it honest:** the path is chosen by contractor
configuration and canonical service capability. **It is never chosen by what
maximizes conversion**, and no runtime signal — traffic, cart value, time of
day — may move a service from one path to another. A service that is priced
online is priced online for everyone.

### Why this does not dilute the core promise

The concern was that adding an estimate path undercuts *"Skip the Estimate.
Know Your Price."* It does not, for one structural reason: **a Guided Estimate
is never displayed as a price.** The price-promise linter and the §1.4
activation guard exist to stop a homeowner seeing a number that is not a real
price, and they continue to apply unchanged to everything on the *price online*
path. The estimate path shows no number at all until a human has set one.

What the promise means, stated precisely: *where Price2Book shows a price, that
price is real.* It never meant every job has one.

---

## 2. Naming — and a collision to hold deliberately

**Customer-facing: "estimate."** It carries the right expectation, and in most
jurisdictions it is also the safer word — "quote" reads as a guaranteed final
number, and this often will not be one.

**Internal: `Quote` stays `Quote`.** The model, `QuoteStatus`, `/api/quotes`,
`/dashboard/quotes`, `app/[site]/quote/[quoteId]` and `BookingType.REMOTE_QUOTE`
all ship today, and HVAC and Plumbing both reference `REMOTE_QUOTE` throughout
their canonical models. Renaming mid-pilot buys nothing and costs a migration
plus route churn across two trade workstreams.

**This divergence is intentional and must be written where someone will find it
before they "fix" it.** The contractor-facing UI and every homeowner-facing
string say *estimate*; the schema says `Quote`. Anyone reconciling the two
should reconcile the copy, never the schema.

Feature name: **Guided Estimates**, beside Guided Pricing and Guided Setup.
"Remote estimate" is descriptive, not a product noun.

---

## 3. Contractor control

Per service, a `customerPricingPath` with four values:

```
PRICE_ONLINE | GUIDED_ESTIMATE | ONSITE_VISIT | USE_COMPANY_DEFAULT
```

…and a company-level default, so the "turn it on for my whole catalog" ask is
one control rather than a hundred.

**One guard the default needs.** A company default of `GUIDED_ESTIMATE` applied
blindly would hide prices the contractor has already reviewed and approved —
throwing away the most valuable thing they did in setup, silently. So:

- The default applies to services with **no published approved price**.
- Overriding a service that *has* one is a per-service action with the price
  shown, never a side effect of a company setting.

A service whose canonical model cannot support online pricing at all (HVAC
equipment replacement, `locationScope: "BOTH"`) may not be set to
`PRICE_ONLINE` regardless of either control. Capability bounds configuration.

---

## 4. Decision facts vs estimate-intake facts — **decide this now**

This is the one item that cannot wait, because HVAC is modeling its catalog
this week and Plumbing has already shipped its model.

Two kinds of canonical fact:

- **Decision facts** — Price2Book uses them deterministically to choose scope,
  price, routing or refusal. `venting_class`, `conductor_count`, `system_type`.
- **Estimate-intake facts** — collected because a human contractor needs them
  to price remotely. Wall construction, approximate line-set distance, proposed
  outdoor-unit location, a photo of the panel, access notes.

Some facts are both. The point of the distinction is the failure it prevents:
**without it, every fact a contractor wants ends up in the deterministic
pricing tree as a routing-neutral `CONTINUE`, because that is the only place a
question can live.** That is a pricing engine carrying questions that do not
price anything, and it degrades the thing the engine is for.

HVAC has, correctly, already separated *canonical fidelity* from *commercial
outcome* — equipment replacement is modeled in full and ships `REMOTE_QUOTE`
anyway. This is the same separation one level down, at the fact.

**The ask of the trade workstreams is small and it is not implementation:** when
a fact is added, record which kind it is. Nothing else changes, no milestone
moves, and no Guided Estimates code is written. The cost of deferring is that
the classification has to be reconstructed later from questions that no longer
remember why they were asked.

---

## 5. The gap that is actually missing

Everything else in §0 exists. This does not:

**The contractor has no way to say "I cannot price this remotely."**

`QuotePricingForm` accepts a price and nothing else. There is no outcome that
routes the job to an onsite visit, and `EXPIRED` exists in the enum but nothing
ever sets it.

This is not a nice-to-have, and it is the failure mode that decides whether the
feature is trustworthy. Given only a number field and a queue, a contractor
facing a job they genuinely cannot see will **send a number anyway**. A remote
estimate that moves on arrival is worse than no estimate, because it burns the
homeowner in precisely the way this product exists to prevent.

So the estimate path needs a first-class second outcome — *this needs a look* —
ideally routing to a priced pre-work visit, which already exists
(`requiresPreWorkVisit`). The honest framing is: **eliminate the visit where the
photos suffice, and where they do not, sell the visit.**

Estimates must also expire. `EXPIRED` is in the enum and unimplemented; a
three-week-old number on a contractor-branded page is a commitment nobody made.

---

## 6. The scope summary — where the diagnosis boundary can leak

The obvious next step is to hand the contractor a summary rather than raw
answers, including *"items requiring contractor review — fan-support condition
could not be confirmed."*

That line is inference, and it sits one step from diagnosis, which Plumbing and
HVAC have both been deliberately conservative about.

**The rule:** the summary is **derived deterministically** from the canonical
model — answered facts, unanswered required facts, and facts the model marks as
not confirmable from customer responses. It is a rendering of structured state.
**It is not model-written prose about the job.** A generated paragraph
describing what is probably wrong at a house is the thing both trade
workstreams declined to build, and it would arrive here wearing a different
name.

Stated positively: Price2Book's advantage is that it *knows which facts matter
for this specific service*. A generic contact form throws that away. The
summary should read as a completed checklist, not as an opinion.

---

## 7. Visual Assist is the mechanism, not a competing feature

Photo capture must not be built a third time.

Visual Assist's stated remit — observable **identity and configuration** from
photos, explicitly not diagnosis — is exactly what makes an estimate packet
reliable rather than hopeful: *"this appears to be a 200A panel, confirm?"*,
*"I can read the model number as XYZ, confirm?"* with the homeowner confirming.

That is a good fit and it preserves the boundary. It also means the two
workstreams need one shared answer on where a captured, confirmed observation
is stored before either builds capture logic for this. **Guided Estimates is
plausibly the product that Visual Assist is the mechanism for**, and it should
not be designed as though it were not.

---

## 8. The contractor who publishes no prices at all

The strongest commercial argument here is the contractor who says *"there's no
chance I'm putting my prices online"* — today a lost sale, and under this model
a Guided Estimate customer.

Worth taking seriously, and worth being clear-eyed about: if a contractor
publishes zero prices, most of what makes Price2Book verifiable stops applying
to them. No price promise to enforce, no activation dependency to refuse, no
same-visit logic, no readiness in the current sense. Their storefront is a very
good structured intake form attached to a scheduler.

That is a real product and it may be a large market. It is **not the same
product**, and it should not be reached by accident through a default setting.
If it ships, it ships as a named configuration with its own acceptance criteria
and its own answer to *"why not a contact form?"* — which is: because
Price2Book knows which questions this specific job needs, and a contact form
does not.

Explicitly a commercial question, not a technical one: whether that tier is
priced the same is not settled here.

---

## 9. Out of scope, permanently

Not to be built under this name:

proposal builders · line-item estimating software · PDF proposal designers ·
electronic contracts · change orders · invoicing · CRM pipelines · lead
management

The contractor needs exactly one action: *here is the amount I estimate for
this work* — or, per §5, *I need to see it.* Everything past that hands the
homeowner back to the booking path that already exists.

---

## 10. Sequencing

1. **Now, and only this:** the fact classification in §4, recorded as HVAC and
   Plumbing model their trades. No implementation, no milestone change.
2. **Now, separately:** the deposit defect in §11 — a live pilot bug, unrelated
   to whether this feature is ever built.
3. **After the pilot:** everything else. The pilot answers the question that
   determines the design — *which services do real contractors refuse to price
   online, and why?* If the answer is "I need to see the panel," this is
   photo-driven estimating. If it is "I don't trust fixed prices," it is §8, and
   that is worth knowing before writing code.

---

## 11. Live defect found while surveying this

**Not part of the feature. Present in the shipped product today, and every
HVAC `REMOTE_QUOTE` booking will pass through it.**

`Quote.depositRequired` is set by the contractor in `QuotePricingForm`, stored,
and rendered to the homeowner at `app/[site]/quote/[quoteId]` as *"A deposit is
required for this job."* — with no amount.

**Nothing reads it at checkout.** `decideDeposit` in `lib/depositPolicy.ts`
decides independently from company rules and `Service.depositRule`. The two
never meet. `Quote.depositCents` is never written at all.

Both directions are wrong, and the second is worse:

- Contractor ticks the box, no company rule matches → the homeowner is told a
  deposit is required and is then charged none. The page lied.
- Contractor leaves it unticked, a company rule matches → the homeowner is told
  nothing and meets a deposit at checkout. A surprise charge on a quoted job,
  which is the exact outcome the deposit copy decision was made to prevent.

Quoted jobs are large by nature, so a subtotal threshold rule makes the second
case the *likely* one, not the edge.

**Fix direction:** `decideDeposit` is the single authority and must stay so. The
quote page should show what that authority actually decides for this amount —
not a contractor-typed boolean — and the copy should carry the agreed wording:
*"Your deposit will be applied to the total. The remaining balance will be due
when the work is complete."* The checkbox and `Quote.depositRequired` should
then be removed rather than reconciled; a second place to decide a deposit is
the defect, not the missing wiring.
