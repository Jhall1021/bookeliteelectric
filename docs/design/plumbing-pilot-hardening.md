# Plumbing V1 pilot-hardening — Track A: configuration friction

*2 September 2026. Audited against the frozen Plumbing baseline on `main`
(`70091d7`), not the in-flight G1 tree.*

**The question:** can a real plumbing contractor configure a useful subset of
Plumbing V1, safely activate it, and give a homeowner a clear pricing and
booking experience, without understanding Price2Book internals?

Architecture stays frozen. Findings are classified, not fixed.

---

## Track B result: the walk

One contractor (`zz-pilot-plumbing`), shipped path only, on the guarded rehearsal
branch. Left in place as evidence.

**Shape 1 passed cleanly and is the story to lead with.** Offer
`water-heater-flush`, meet `PRICE_NOT_APPROVED` with a sentence that explains
itself, approve one price, activate, and a homeowner answering one question is
quoted **$249.00**. The whole chain — enrollment, provisioning, price approval,
activation, homeowner pricing — for one decision.

**Shape 2 did not.** Three of six starter services were permanently unlaunchable
and `DEPENDENCY_UNAVAILABLE` never even surfaced, because a worse blocker masked
it. See B1.

| | offered | live |
| --- | --- | --- |
| after Shape 1 | 1 | 1 |
| after Shape 2 | 6 | **3** |

### B1 — entering a cost does not clear the blocker *(shared platform, pilot-blocking)*

Provisioning skips the `ServiceMaterial` link when the contractor has not yet
costed the role, *and* records the key in `unresolvedMaterialKeys`. With no link,
`requiredRolesFor` sees nothing, `recomputeServiceMaterialCost` returns early,
and the key can never be cleared. Guided Setup goes on saying *"You haven't told
us what supply_line_flex costs you"* after the contractor has. Re-provisioning is
refused, so there is no in-product recovery.

Full mechanism and measurements in
[provisioning-component-resolution-gap.md](provisioning-component-resolution-gap.md).
**This blocks a real pilot** — it is the normal provision-then-configure order.

### B2 — the masking is back *(shared platform)*

`DEPENDENCY_UNAVAILABLE` never appeared in the walk. The three services that
would have hit it failed `MATERIALS_UNRESOLVED` first. Activation reports one
blocker at a time, so a contractor fixes one and discovers another; the same
masking Amendment C removed from the rehearsal exists in the product.

### B3 — labor hours are requested but never prompted for *(setup UX)*

Live services still warn *"actual field labor hours not established"*. The
template ships no `fieldLaborHours` — correctly, it is contractor economics — but
nothing in Guided Setup asks for them, so the warning has no destination.

### B4 — scheduling and payments are never forced *(setup UX)*

Services went live with `SERVICE_AREA_EMPTY` and
`SCHEDULING_AUTHORITY_UNDECLARED` outstanding. `activationRefusal` does not
consider them, so a service can be *live* while no homeowner could book it.
Correct separation, confusing story.

---

## Decision cost of the three onboarding shapes

Measured from the published payload, counting what a contractor must actually
decide. The important result is that **cost scales sub-linearly**: policies,
material roles and components are global and shared, so only price approval is
genuinely per-service.

| | services | policies | material roles | components | price approvals | **total** |
|---|---|---|---|---|---|---|
| **1. one bookable service** | 1 | 0 | 0 | 0 | 1 | **1** |
| **2. starter catalog** | 6 | 2 | 2 | 2 | 6 | **12** |
| **3. full catalog** | 63 | 7 | 18 | 7 | 63 | **95** |

Plus the seven Guided Setup stages, which are one-time and trade-independent:
business, trade, pricing-foundation, services, scheduling, payments, launch —
21 possible findings, 13 of them blockers.

### Shape 1 — the fastest path is genuinely one decision

Five services need **zero** policies, material roles and components. Cheapest is
`water-heater-flush`: INSTANT, primary-eligible, `photoState NONE`, no
`existing_condition` family, so no `PL-SVC-001` dependency. **Approve one price
and it is live.** Others equally cheap: anode rod replacement, sink drain
assembly, sewer camera inspection, gas line pressure test.

That is a good story and it is not obvious from the product. Nothing in Guided
Setup points a new contractor at a cheap first service.

### Shape 3 — 63 services is 95 decisions, not 63×N

The full catalog costs 32 shared decisions plus one approval per service. The
readiness engine reinforces this: material and policy blockers are **grouped by
role**, with an explicit comment that "38 roles across 75 services is 38
decisions, not 75 problems." That design is already right.

---

## Selective adoption works — and is the load-bearing mechanism

`assessOnboarding` scopes to `offeredServices(db, contractorId)`. A contractor
who offers 6 of 63 gets findings for those 6 only; the other 57 raise nothing.
`Service.offered` defaults false, and `TradePanel` says installing a trade
leaves everything "offered and nothing goes live".

**So the platform already supports "launch only what you want".** The gap is
that it is barely explained: `offered` is a database state with no narrative in
Guided Setup telling a contractor that leaving 57 services alone is the expected
posture rather than an unfinished job.

---

## What the product already does well

- **Launch ordering hides the dependency rule.** `page.tsx` topologically sorts
  offered services so prerequisites launch first, with the comment "a contractor
  ticking every box at once should not have to discover that troubleshooting had
  to go first". Ordering only — every service still passes `activationRefusal`.
- **Per-service launch results, not a red banner.** `LaunchPanel` reports each
  service individually: "the list with the reasons is the truth; a single red
  banner is not."
- **Policy blockers ask the contractor's question**, not the key. The finding
  renders the stored `prompt` rather than `fixture_work_height.breakpoints`.
- **Material blockers name a real service** to make the link actionable.

---

## Findings

Classified per the pilot-hardening rules. **None is a frozen-template defect.**

### A1 — `DEPENDENCY_UNAVAILABLE` is never explained *(setup UX)*

`missingPrerequisites` appears in **no** UI file. `LaunchPanel` renders
`data.message`, so the sentence arrives, but nothing links to the prerequisite or
offers to launch it. A contractor launching one service at a time — rather than
all at once, where ordering saves them — meets a refusal naming a service they
must find themselves.

*Impact:* highest on Shape 1 and 2, the paths a cautious pilot contractor takes.

### A2 — nothing tells a contractor a cheap first service exists *(setup UX)*

Guided Setup does not distinguish `water-heater-flush` (one decision) from
`tank-water-heater-replacement-gas` (policies, roles, components, pre-work visit).
A contractor reasonably starts with their most common job and meets the most
expensive configuration path first.

*Impact:* first-run experience. Fixable with ordering or a hint; no model change.

### A3 — "leave most of them inactive" is implied, never said *(setup UX)*

The mechanism works. The narrative is missing. 63 provisioned services with no
statement that offering 6 is a complete, valid setup reads as 57 unfinished
items.

### A4 — no role-level cost surface *(shared platform)*

The readiness engine's own comment: "Material costs are edited on a service's
Materials panel; there is no role-level surface yet." A role shared by 12
services is one decision the contractor must make by navigating to one of the 12.
Pre-existing, affects electrical equally.

### A5 — branch materials have no configuration surface *(shared platform)*

`AnswerOptionMaterial` (added `d7d7573`) is read by activation readiness, but no
admin surface shows which branch consumes which role. A contractor blocked on
`copper_fitting` is not told it is the copper branch of a repair asking.
New primitive, new gap; not urgent for a pilot that starts with Shape 1 or 2.

### A6 — provisioning component ordering *(shared platform, already filed)*

See [provisioning-component-resolution-gap.md](provisioning-component-resolution-gap.md).
Directly relevant here: a pilot contractor provisioned before configuring
components silently gets none.

---

## Recommended pilot shape

**Shape 2, seeded from Shape 1.** Start `water-heater-flush` (one decision) to
prove the whole chain end to end, then add the starter catalog — 12 decisions
total, including `PL-SVC-001`, whose activation is forced by any service
composing `existing_condition`.

Shape 3 is a stress case, not a pilot target. 95 decisions is defensible for a
full catalog but it is not how a first contractor should meet the product.


---

# Track B — the live onboarding simulation

*Run on `ep-delicate-bird-aycd7vp1` from the frozen `main` worktree.
`scripts/pilot-plumbing-onboarding.ts` reproduces it.*

## Shape 1 passed completely

One contractor, one decision, full chain:

```
enrolled -> 63 installed (nothing priced, offered or live)
         -> crew-hour rate + minimum
         -> offered water-heater-flush (62 left alone)
         -> PRICE_NOT_APPROVED -> approved $189.00
         -> LIVE
         -> homeowner answers one question -> PRICED at $189.00
```

**One contractor decision from enrollment to a bookable, priced service.**

## Shape 2 exposed a hard dead end — B1

Three of six starter services could not be launched, and **cannot be recovered
through any shipped path**.

`toilet-replacement`, `toilet-internals-repair` and `kitchen-faucet-replacement`
block on `MATERIALS_UNRESOLVED` for `supply_line_flex`. The message says: *"no
cost has been entered for supply_line_flex. Add those costs and try again."*

The contractor does exactly that. Measured afterwards:

| | |
| --- | --- |
| contractor cost for `supply_line_flex` | **entered, 2500c** |
| `Service.unresolvedMaterialKeys` | still `["supply_line_flex"]` |
| `materialCostResolved` | still `false` |
| `ServiceMaterial` rows | **0** |
| `recomputeServiceMaterialCost` | returns `null` — *"not itemized, nothing to recompute"* |
| activation | still `MATERIALS_UNRESOLVED` |

**The mechanism.** Provisioning creates a `ServiceMaterial` link *only if the
contractor already has the cost*; otherwise it records the key in
`unresolvedMaterialKeys` and creates no link. Recompute reads `ServiceMaterial`
rows — of which there are none — so it exits early and never clears the key.
Entering the cost afterwards changes nothing.

**There is no recovery.** `serviceMaterial.create` appears in exactly one place
in shipped code: inside `installCatalog` itself. Nothing in `lib/` or `app/`
creates it. Re-provisioning is refused (`CATALOG_ALREADY_INSTALLED`). Only a
developer running a one-off script can unblock the contractor.

*Classification:* **shared platform, blocking for pilot.** Not a Plumbing defect
— it affects any trade provisioned before costs are entered. It is the same
ordering trap as
[the component gap](provisioning-component-resolution-gap.md), but worse: the
product prints an instruction that does not work.

## B2 — `LABOR_INPUTS_MISSING` is a blocker that does not block

Guided Setup reports it as a **blocker** for `water-heater-flush` — a service
that was already live and priced a homeowner at $189.00. Activation does not
consult labor inputs; an approved published price is sufficient. A contractor
reading the readiness panel sees a red item on a service that is working.

*Classification:* setup UX.

## B3 — `DEPENDENCY_UNAVAILABLE` did not fire

Deliberately launching in the wrong order did **not** produce it: the starter
catalog's `existing_condition` services blocked earlier, on B1. The A1 concern
stands unproven either way — it needs a contractor whose materials are complete
but whose `PL-SVC-001` is not yet live.

## Track A invariants — all held under live conditions

- unoffered services stayed irrelevant: **57 raised nothing**
- readiness scoped to `offeredServices`: confirmed, 6 of 63
- material and policy blockers stayed **grouped by role**, not per service
- prerequisite launch ordering worked: `plumbing-service-call` first
- launch failures stayed **per-service**, each with its own reason
- policy blockers rendered the contractor's question, not the key:
  *"When clearing a drain, how far down the line do you go…"*

## Recommendation

**B1 must be fixed before a real plumber sees this.** Shape 1 is genuinely
one decision and works end to end; Shape 2 strands half the catalog with an
instruction that cannot succeed.
