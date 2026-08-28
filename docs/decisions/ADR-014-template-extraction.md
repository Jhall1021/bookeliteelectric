# ADR-014 — The electrical template

**Status:** PROPOSED, 28 August 2026. Decision requested before implementation.
**Depends on:** per-contractor service slugs (shipped), ADR-006 canonical/contractor split,
ADR-010 derived ownership.

---

## The problem, stated precisely

Price2Book's differentiator is that a contractor starts from **real trade knowledge**, not
an empty booking form. That knowledge exists today — 75 services, 150 questions, 539 answer
options, 123 material links — but it exists **only as Elite Electric's rows**.

There is no template. There is a catalogue belonging to Contractor #1, and 36 places in the
codebase where we have already marked a decision as Elite's rather than the trade's:

```
POLICY[low_voltage.accessible_labor_hours]   POLICY[fixture_supply]
POLICY[flood_camera.max_height_ft]           POLICY[new_outlet.standard_run_ft]
POLICY[panel_upgrade.booking]                POLICY[sconce.priced_by]        … 36 total
```

Those markers are the head start. They are places where someone already noticed *this is a
business decision, not electrical fact.*

## The line the whole design rests on

Every row in the tree mixes two things. The clearest single example:

> **A ceiling over 12 ft changes the price.** — electrical fact, true for every contractor.
>
> **It adds $85.** — Elite's decision, true for Elite.

Applied to the schema:

| | Trade knowledge (template) | Business decision (contractor's) |
|---|---|---|
| **Service** | slug, name, bookingType, shortDescription, photoState, isPrimaryEligible, requiresTechCount | basePrice, whileWeThereBasePrice, fieldLaborHours, wwtLaborHours, primary/addOnLaborUnits, materialCostCents, materialMultiplier, permitAdminCents, otherDirectCostCents, estimatedMinutes, startingPriceLabel, sortOrder, active, heroImage |
| **Question** | key, prompt, helpText, order | — |
| **AnswerOption** | label, value, order, nextQuestionId, rerouteServiceId, referencedServiceId, requiredPhotoLabels, photosBlockBooking | **priceModifierCents**, overrideEstimatedMinutes |
| **ServiceMaterial** | which canonical material ROLE a service consumes, and quantity | unit cost (already on ContractorMaterial) |

`requiresTechCount` is deliberately on the left: a panel swap needs two people because of the
work, not because of the contractor. `photoState` is on the left for the same reason —
whether a job *can* be judged from photos is a property of the job.

---

## Options

### Option 1 — live canonical references

Contractor services point at canonical template rows. Trade knowledge is fixed once and
every contractor sees it.

**Rejected**, and not on balance — it is disqualified by a standing constraint:

> A platform template update must never silently alter a contractor's published customer
> experience or price.

Under live references, correcting a question's wording changes what every contractor's
customers are asked, immediately, with no adoption event. Adding an answer option changes a
priced decision tree that a contractor has reviewed and approved. ADR-003 already forbids
publishing a price nobody approved; this would publish an *experience* nobody approved,
which is the same failure wearing different clothes.

It is also the option that makes divergence hardest: a contractor who wants a different
question is immediately a special case in shared data.

### Option 2 — versioned provisioning, copy on instantiation

A canonical, versioned template. Provisioning **copies** structure into rows the contractor
owns. After that the contractor's tree is theirs; the template can change without touching
them.

**Strong on every constraint.** Nothing changes under a contractor without an explicit act.
Divergence is free — the contractor's rows are simply their rows.

The cost is real and should be named: **drift**. Ten contractors provisioned from v1 and
never updated are ten catalogues nobody can improve centrally. That cost is acceptable
because the alternative is silent change, and it is mitigated — not solved — by §"Template
updates" below.

### Option 3 — hybrid: canonical identity, copied structure  ✅ RECOMMENDED

Option 2, plus an explicit statement of what legitimately stays shared.

Some things are **stable trade identity**, not mutable structure, and referencing them is
correct: a 15A GFCI receptacle is the same part in every contractor's van. Those already
exist as canonical rows and already work this way (ADR-006):

```
CanonicalCategory   13     CanonicalMaterial   39
CanonicalComponent  31     CanonicalDisclaimer  5     PhotoGroup 6
```

They are referenced, not copied, because their identity is shared while their **economics
are already contractor-owned** — `ContractorMaterial` carries the price, `ContractorCategory`
carries the presentation. That split is proven in production.

The **live service/question/routing tree is copied** and must not depend on mutable template
rows.

---

## The decisions

### What constitutes a template

A **`TemplateVersion`** — an immutable, published snapshot of trade structure for a trade
(`electrical`, `v1`). It contains template services, their questions, answer options,
routing, photo requirements, and material *roles*. It contains **no prices, no labour hours,
no material costs, no policy values.**

A template is not a contractor. It has no `contractorId`, no pricing settings, no schedule,
and cannot serve a storefront.

### What stays canonical and shared

`CanonicalCategory`, `CanonicalMaterial`, `CanonicalComponent`, `CanonicalDisclaimer`,
`PhotoGroup` — referenced by template and contractor rows alike. These are trade identity.

### What gets copied into contractor ownership

`Service`, `Question`, `AnswerOption` and their joins — the whole live tree. After
provisioning these are ordinary contractor-owned rows, indistinguishable at runtime from
ones the contractor wrote themselves, and governed by the same tenant guard.

### How versions work

`TemplateVersion` is immutable once published. Corrections produce v2; v1 is never edited.
Contractors record which version they provisioned from and which they have adopted since.

### How provenance is retained

Each provisioned row keeps `templateVersionId` and `templateKey` — where it came from, and
which template concept it corresponds to. Provenance is a **record, not a link**: nothing
reads through it at request time. It exists so a future update can ask *"has this contractor
changed the thing I am about to offer to change?"*

A contractor-authored service has both fields null, and that is the whole difference between
the two — no behavioural distinction, no restriction, no second class.

### How customisation works, and whether divergence is total

**Yes, completely.** A contractor may rewrite prompts, delete questions, add answer options,
re-route, or delete a provisioned service entirely. Nothing is locked. A tree that cannot be
changed is not the contractor's, and "you control what customers are asked" is the product
claim.

### How a future template update is detected

By comparing the contractor's provenance against published versions: *provisioned from v1,
v2 is published, here are the template concepts that changed.* Detection is a **read**. It
never writes.

### Automatic, suggested, or manually adopted

**Manually adopted, per change, always.** Never automatic, and never bulk.

A contractor sees: *"The electrical template added a question to Recessed Lighting: 'Is
there insulation contact above?' — review."* They accept or decline. Declining is
permanent-until-they-change-their-mind and is not nagged.

Where the contractor has already modified the same concept, the update is shown as a
conflict and **defaults to keeping theirs**.

### How an adopted update preserves pricing and policy

An adoption event may only write **structure**. It may add a question, add an answer option,
change wording, add a photo requirement, change routing.

It may **never** write `priceModifierCents`, labour hours, material costs, or any published
price. A newly adopted answer option arrives with a **null** price modifier and the service
is marked as needing review — it cannot publish a price nobody set, which is ADR-003 applied
to template updates.

> The template can tell a contractor *what to ask*. It can never tell them *what to charge*.

---

## How Elite becomes Template v1

**Not by declaring Elite's rows canonical.** They contain both electrical knowledge and
Elite's business decisions, and a template built by relabelling them would carry Elite's
economics into every future contractor while looking like trade knowledge.

Extraction is a real process, per service:

1. **Read the Elite service and its tree.**
2. **Classify every field** against the table above — structure or economics.
3. **Resolve the POLICY markers.** Each of the 36 is a decision already flagged as Elite's.
   For each: does the template keep the *question* and drop the *value*? A
   `standard_run_ft` of 25 is Elite's; *that run length changes the price* is the trade's.
4. **Emit a template definition** carrying only structure, with every economic field absent
   rather than zeroed — absent means "the contractor must decide"; zero is a decision.
5. **Leave Elite's Service untouched.** Elite keeps operating on its own rows. Extraction
   produces a template; it does not migrate anyone.
6. **Diff back.** For each Elite service, provision a scratch contractor from the template
   and compare structure. Any structural difference is either a bug in extraction or a piece
   of Elite-specific structure that should not have been generalised — and it must be
   explained, not smoothed over.

### The acceptance test

> Can Price2Book take Electrical Template v1 and create a brand-new electrical contractor
> whose initial catalogue is structurally correct, with **no** Elite prices, labour hours,
> material costs or policy values anywhere in it?

Mechanised as a verifier: provision a throwaway contractor from v1, then assert that every
economic field is null or contractor-supplied, that no value equals Elite's corresponding
value by coincidence of copying, and that the structure matches the template. It joins the
gate.

A second, sharper check: **provision from v1 and diff against Elite's live tree.** Structure
should match. Economics should differ in every populated field. If any price matches Elite's
exactly, extraction leaked.

---

## What this does not decide

- The template **authoring** surface. v1 is extracted programmatically; who edits v2 later,
  and through what UI, is a separate decision.
- Trades beyond electrical. The model is trade-agnostic; only electrical gets extracted now.
- Whether template updates are ever offered across trades.

## Standing constraint restated

> **A platform template update must never silently alter a contractor's published customer
> experience or price. Template updates are explicit adoption events.**

This is what disqualifies Option 1 outright, and what the null-price rule for adopted answer
options exists to protect.
