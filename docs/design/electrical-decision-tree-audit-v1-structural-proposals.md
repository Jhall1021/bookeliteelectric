# Electrical Decision Tree Audit V1 — structural proposals (design only)

None of this is implemented. Every item below was explicitly carved out of the
authorized implementation batches, per the follow-through directive: "do not implement
these automatically." This document exists so each can be reviewed and authorized
separately, at whatever pace makes sense.

---

## 1. The canonical-template gap: re-extraction, retired rows, and add-on-only mounts

Three separate findings (B.7, B.13, B.14) share one root cause, so this proposal covers
all three together.

### The mechanism, restated precisely

`prisma/seed-*.ts` files write to **Elite's own** `Service`/`Question`/`AnswerOption`
rows. The canonical **template** (`TemplateVersion → TemplateService → TemplateQuestion
→ TemplateAnswerOption`) — what a *new* contractor is actually provisioned from — is a
separate model, populated only when someone runs
`scripts/extract-template-catalog.ts --from elite-electric --apply`. That script reads
every `Service` row for the named contractor (**no `active` filter** —
`extract-template-catalog.ts:286-289`) and promotes each one that has no "unauthored
refusal" (branded wording, an economic figure, a policy threshold — see
`scripts/_extractCore.ts`) into the template.

Two consequences follow directly from "no `active` filter" plus "`TemplateService` has
no `active` field at all" (`prisma/schema.prisma:3359-3389`):

- **B.13**: `sump-pump-dedicated-circuit`, `freezer-fridge-dedicated-circuit`,
  `electric-fireplace-circuit`, `new-240v-appliance-circuit` are `active: false` on
  Elite (retired by `seed-dedicated-circuit.ts:108-118` as subsumed by the unified
  6-question tree) but extracted into the template exactly like a live service.
- **B.14**: `elite-tilt-mount` / `elite-articulating-mount` are `active: false`
  *deliberately* (add-on-only — they're only ever reached from inside `tv-installation`'s
  own tree) but extraction has no way to express "promote this, but only as a reference
  target, never standalone," so `articulating-tv-mount` / `tilt-tv-mount` land in the
  template as independently bookable, zero-question, instantly-priced services.

And separately, **B.7**: extraction is a *point-in-time* snapshot (last run 31 Aug
2026, per `ad99a23`; the committed marketing snapshot was regenerated 1 Sep). Two fully
built, owner-approved trees (`seed-200a-service-upgrade.ts`, `seed-panel-replacement.ts`,
both finalized 30 Aug per `975292d`) were seemingly never (re-)extracted — the template
still shows both at the pre-rewrite "1 question, always quote" shape. This is a staleness
problem, structurally different from the `active`-field gap above, but the same
underlying question applies to all three: **what is actually supposed to reach a new
contractor, and by what mechanism does it get there reliably?**

### Why this isn't a mechanical fix

- **Deleting the four retired `TemplateService` rows directly** (rather than adding an
  `active` field and re-extracting) is the cheapest fix, but it's a one-time patch that
  drifts again the next time Elite retires a service and someone runs `--apply` without
  remembering to clean up afterward. It also does nothing for B.14 (the mounts aren't
  retired, they're deliberately non-standalone — deleting them from the template removes
  a legitimate add-on capability for every future contractor, not just Elite's).
- **Adding `active` to `TemplateService` and filtering extraction on it** is the more
  durable fix, but it's a schema change (a migration, however small) and it collapses
  two different meanings of "not independently offered" into one flag: B.13's services
  should disappear from the catalog entirely; B.14's mounts should stay reachable *as
  references*, just not as their own bookable entries. One boolean doesn't distinguish
  those — the schema likely needs something closer to `TemplateService.eligibility:
  "STANDALONE" | "ADD_ON_ONLY" | "RETIRED"` (naming aside), which is a bigger design
  decision than this audit should make unilaterally.
- **Re-running `--apply` for B.7** is the least structurally risky of the three (no
  schema change, just executing an already-existing script against the current
  database) — but it needs a decision on whether the newer 200A/panel trees are still
  the intended shape (nearly three weeks have passed; worth a fresh look before
  publishing, not just re-running blind), and it's a database-mutating operation this
  session had no access to perform or verify.

### What this proposal recommends bringing to review, not deciding here

1. Whether `TemplateService` gets an eligibility concept at all, or whether "add-on
   only" should instead be expressed as "this template service has zero
   `isPrimaryEligible`-equivalent and the storefront should refuse to link to it
   directly" — i.e., a *consumption*-side rule rather than a *provisioning*-side flag.
   (`prisma/schema.prisma` already has `Service.isPrimaryEligible` for a related but not
   identical concept — "false for add-on-only items, which never originate a visit"
   per `lib/pricing.ts:47`. Worth checking whether that flag already does most of what
   B.14 needs, extracted onto `TemplateService` instead of invented fresh.)
2. **Impact on already-provisioned contractors** (BrightPath, and any future one): a
   template fix changes what *new* contractors are provisioned with. It does nothing
   for a contractor already provisioned with the four stale stub services or the two
   standalone mounts — those are now that contractor's own `Service` rows, independently
   customized, possibly priced, possibly booked against. A schema/extraction fix needs a
   paired decision about whether (and how) to reach back into already-provisioned
   catalogs, which is a materially bigger, riskier operation than fixing the template
   itself.
3. **Re-running extraction (B.7) is a database write against the canonical template**
   and needs the same authorization any other production-affecting operation does —
   this document is not that authorization, only the case for why it's worth doing.

---

## 2. Consolidating the Garage Door Opener Outlet duplicate (B.12)

`garage-door-opener-outlet` (New Outlets, 0 questions, flat $445) and
`garage-door-opener-outlet-ev` (EV & Garage, 2 questions, `ADJUSTED`) share identical
pricing composition, identical labor-hours comments, identical material rows, and
near-identical description text. The EV copy's own seed comment calls it "identical
logic to the New 120V Outlet service... just listed here too for discoverability."

**What consolidation would actually require, beyond "delete one":**

- **Canonical source of truth.** If one service wins, does the OTHER category (New
  Outlets or EV & Garage) lose the ability to browse to this job at all, or does it need
  a *redirect* / cross-listing? The seed comment's own framing ("listed here too for
  discoverability") suggests the ORIGINAL intent was deliberate dual-category
  visibility, not an accident — consolidating to one service may need a
  category-membership mechanism (a service in two `ContractorCategory` rows, or a
  lightweight redirect page) rather than deleting the "duplicate" outright, or the
  discoverability goal the original design was going for is lost.
- **Search / redirect behavior.** `lib/serviceMatch.ts`'s natural-language matcher reads
  the live catalog by name (`buildPrompt`) — two services with the same real-world
  meaning but different names/slugs is exactly the ambiguity that matcher has to
  disambiguate today, silently. Whatever wins needs a plan for what a customer typing
  "garage door opener outlet" is shown, and what happens to a URL bookmarked against the
  slug that goes away (a redirect, not a 404 — this codebase already has a "legacy
  redirect" convention for exactly this class of problem, per
  `scripts/audit-storefront-navigation.ts`'s own history).
- **Existing contractor customizations and booked history.** Neither service has live
  bookings today as far as this audit found, but the *mechanism* for consolidating two
  services with potentially-diverging contractor customizations (a contractor who
  changed one but not the other) and any already-booked line items referencing either
  slug needs a real migration plan, not an assumption that both are always identical.
- **Owner approval is service-specific.** Elite's pricing for both happens to be
  byte-identical today; that's Elite's own economics, approved for Elite. A
  consolidation decision at the template/canonical level is a product-structure
  decision, separate from — and not implied by — any contractor's specific approved
  numbers matching.

**Recommendation for the review, not a decision:** the EV & Garage copy (2 questions,
current access-tier pricing model) is functionally the better of the two and should
likely be the survivor if consolidation happens — but *whether* to consolidate, alias, or
simply rename to disambiguate is a product call this document doesn't make.

---

## 3. Dedicated-circuit family scope — do not assume `dedicated-120v-circuit-outlet` covers `new-240v-appliance-circuit`

Explicitly checked, per the directive, before writing this: `dedicated-120v-circuit-outlet`'s
`dedicated_amperage` question (`prisma/seed-dedicated-circuit.ts:198-207`) offers three
priceable tiers — 15A/120V, 20A/120V, and 15-or-20A/240V — **and a fourth, "30 amp or
more," which is explicitly NOT priced online** ("Circuits of 30 amps and above are
priced individually," `seed-dedicated-circuit.ts:305-307`).

`new-240v-appliance-circuit` is a generic "a new 240V dedicated circuit for an appliance
not covered elsewhere in our catalog" service with no amperage cap implied by its name or
description. **This means the two are not provably equivalent**: a homeowner needing a
240V circuit above 20A (a dryer at 30A, an electric water heater, some larger AC
compressors) is NOT covered by `dedicated-120v-circuit-outlet`'s priced path — they'd
land on its own "30A or more" review branch, which exists and works, but that's a
different claim than "this service already covers everything `new-240v-appliance-circuit`
would." B.13's original framing ("largely subsumed... though a homeowner searching
specifically... might not find it") undersold this: it isn't just a discoverability
question, there may be a genuine coverage gap at the top end.

**What the review needs, that this audit didn't establish:** whether `new-240v-appliance-circuit`
was ever meant to mean "30A+, unspecified equipment" specifically (in which case it's a
legitimate, narrower catch-all, not a duplicate, and should probably be reworded to say
so explicitly rather than left generic) or whether it predates the unified tree entirely
and its real scope was never decided. `electric-fireplace-circuit`, `freezer-fridge-dedicated-circuit`,
and `sump-pump-dedicated-circuit` don't have this ambiguity — each names specific
equipment `dedicated_equipment`'s own options already cover at the 20A tier, so those
three are on firmer ground for removal than the fourth.

---

## 4. Publishing authored-but-unapplied trees (panel replacement, 200A upgrade, video doorbell, hot tub/spa, under-cabinet lighting)

Five trees exist in the repository, fully authored, that aren't reflected in either
Elite's live catalog or the template: `seed-panel-replacement.ts`,
`seed-200a-service-upgrade.ts` (both blocked on the template-extraction gap in §1, not on
being unwritten), `seed-video-doorbell-wiring.ts`, `seed-hot-tub-spa.ts`, and
`seed-under-cabinet-lighting.ts` (this last one has one loose end noted in the audit — a
"dimmer" answer routes to review instead of resolving, worth fixing before it ships).

**Why this is a proposal, not an implementation item, even though "just run the seed"
sounds mechanical:** every one of these changes a *price* Elite's storefront shows a real
customer — `seed-panel-replacement.ts`/`seed-200a-service-upgrade.ts` are explicitly
marked owner-approved in their own commit history, but `seed-video-doorbell-wiring.ts`,
`seed-hot-tub-spa.ts`, and `seed-under-cabinet-lighting.ts` show no equivalent approval
trail in this audit's research — their prices may be well-reasoned (the audit found them
so) but "well-reasoned" and "owner-approved" are not the same thing, and this session has
no standing to treat a script sitting in the repo as implicit sign-off. **Recommendation:**
before running any of these, confirm each one's pricing has gone through whatever
approval step Elite's other published prices go through (`_priceGuard.ts`,
`reconcile-price-book.ts`-style migrations) — treat "the code exists and looks careful"
as necessary, not sufficient.

---

## 5. Merging ceiling/fixture access with switch-wall access (the module-overlap finding, B.15)

The audit's largest-effort recommendation — merging `attic_access`/`ceiling_access`
(the fixture side) with the Lighting Control module's own `below_above_access` (the
switch-wall side) so a customer isn't asked about the same attic twice — is deliberately
left as a proposal rather than implemented in this batch, for a reason worth stating
plainly: **this is exactly the class of change Electrical Routing V2 is built to replace
wholesale** (per the reconciliation doc, V2 removes the legacy access-class model this
merge would be patching). Spending real engineering effort re-deriving four trees'
question order now, only to have V2 supersede the whole mechanism later, is the kind of
work the follow-through directive's "keep any necessary legacy correction isolated from
Routing V2" was warning against for B.2 — the same caution applies with more force here,
since this change is structural (touching four services' question graphs) rather than a
one-line rewire.

**What the review should decide:** whether it's worth merging these two access
questions in the legacy model now (shortens the four largest trees measurably, per the
original audit's before/after walkthrough) given V2's timeline, or whether the fix
belongs in V2's own access-modeling work instead, where it may already be addressed by
design (V2's `accessSlot`/`accessBySlot` scoped-access system is a materially different,
more general mechanism than the flat `attic_access`/`below_above_access` pair this
finding is about — it's plausible V2 doesn't have this specific duplication at all,
which would make fixing it in the legacy model pure sunk cost).

---

## Cross-cutting note for all five proposals

None of the above should be read as "these are definitely worth doing" or "definitely
not" — each carries a real tradeoff (schema risk, migration risk, scope-ambiguity risk,
or V2-timing risk) that this audit surfaced but isn't positioned to resolve alone. The
common next step for all five is the same: a decision-maker with visibility into
Routing V2's actual timeline and Elite's approval process for the unapplied trees,
looking at each proposal on its own, not a batch approval.
