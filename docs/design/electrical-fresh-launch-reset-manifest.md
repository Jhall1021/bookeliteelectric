# Electrical fresh-launch rehearsal and reset/rebuild manifest

Written 16 Sep 2026 in response to PR #63's FRESH-LAUNCH DIRECTION. Local-only:
every claim below is either (a) checked into this repo and cited by path/SHA,
or (b) produced by actually running `scripts/rehearse-fresh-electrical-launch.ts`
+ `scripts/rehearse-fresh-electrical-launch-phase2.ts` against a disposable
local Postgres database this session created and destroyed itself — never
production/Neon. Section 5 marks what remains genuinely unverified.

## 0. Standing rule this manifest operates under

Per `CLAUDE.md` (added this session): Price2Book has no active contractors;
Elite is inactive too. Existing contractor/test data may be discarded and
rebuilt for a fresh launch. This manifest is written on that basis — it does
not treat preserving Elite's or BrightPath's current rows as a constraint.

## 1. What "the intended fully composed Electrical source" actually is

Production's real Electrical template is one SNAPSHOT (v1) plus a chain of
DELTAs (v2 through v6), published incrementally across several weeks and PRs.
Replaying that incremental history has no purpose for a fresh launch —
`lib/templateProvisioning.ts`'s `templateVersionSource(db, "electrical")`
(no `atVersion`) only ever folds the SNAPSHOT plus every DELTA newer than it
into one final state, and that final state is all `installCatalog` ever
installs. This rehearsal instead builds Elite's live catalog fresh, with
every real, checked-in improvement applied in one pass, and extracts ONE
consolidated v1 SNAPSHOT from it.

**Per-version provenance, and what this rehearsal did about each:**

| Version | Scope | Reconstructed how |
|---|---|---|
| v1 | 75-service base SNAPSHOT | Full seed chain (§2) + `scripts/extract-template-catalog.ts` |
| v2 | `new-120v-outlet` only | No dedicated writer script exists anywhere in git history (predates the Material Catalog workstream). Not reconstructed as a separate delta — its content is presumed already folded into `new-120v-outlet`'s own current, actively-maintained seed content, captured incidentally by this run's own extraction. **No claim of byte-identity with the real v2.** |
| v3 | 6 services (Batch 1: `new-video-doorbell-wiring`, `generator-inlet-interlock`, `240v-garage-outlet` + 3 NEMA siblings) | Verified against `prisma/template/electrical-v3-provenance.json`'s own structured record — `prisma/seed-generator-inlet.ts`/`prisma/seed-240v-garage-outlet.ts` already write the exact structural materials it lists. Ordinary seed chain, no extra step. |
| v4 | `electrical-panel-replacement` (Batch 2A) | **EXCLUDED.** Source branch `feat/material-batch-2a-panel-service-upgrade` (commit `a31d7dc2`) was never merged into `main` or this integration branch — no merge commit exists anywhere in `git log --all` for either. It is now 439 files / ~66k lines behind `main`. Project memory records this as "PR #67, merged"; git history does not support that claim. **This discrepancy is reported, not resolved.** `electrical-panel-replacement`'s recipe in this rehearsal's output is whatever the ordinary seed chain gives it, which may be less complete than production's real v4. |
| v5 | 13 services (Batch 2E) | `scripts/add-consumables-recipes.ts --apply` — real, idempotent, its own `SERVICES` list matches Batch 2E's real service list exactly. |
| v6 | 2 services (Batch 2F) | Surge: one small, explicit, documented fix (verbatim from commit `7cad9f4`'s own production-publication message — `prisma/seed-materials.ts` on this branch is stale, still naming the generic `BREAKER_DOUBLE_POLE`). Fan: the real mechanism — `scripts/add-equipment-roles.ts` (creates `BATH_FAN_STANDARD`, undefined anywhere in `prisma/seed-*.ts`) then `scripts/build-fan-packages.ts` (builds `replace-bathroom-exhaust-fan`'s real priced tree with it wired in). |

**Routing V2** (this branch's own feature, separate from the frozen
`feat/electrical-routing-v2` Stage 1A pilot on its own Neon rehearsal branch —
see `[[electrical-routing-v2-workstream]]` in project memory; nothing in this
rehearsal touches that pilot's infrastructure) had **never been extracted
into the template layer at all**, on any branch, before this session. Its
shared modules (`lib/rerouteHandoff.ts`, the six `prisma/seed-routing-v2-
*.ts` files) wrote only to Elite's live rows. This rehearsal seeds them into
Elite's live catalog before extraction, then — since `prisma/seed-routing-
v2-policies.ts` and `prisma/seed-routing-v2-pricing-method.ts` mutate an
EXISTING TemplateVersion's rows in place rather than writing live rows —
runs those two immediately after, against the freshly-created v1 SNAPSHOT.
Verified directly: `new-120v-outlet`'s `pricingMethod` is
`DERIVED_RESOLVED_SCOPE` with all 3 Routing V2 policies attached, and
`surface-mounted-outlet` exists with the same 3 policies, in the extracted
template.

**Real, pre-existing gaps this rehearsal discovered and fixed narrowly**
(none invented, all documented at their own site in
`scripts/rehearse-fresh-electrical-launch.ts`):
- `prisma/seed-240v-garage-outlet.ts` references canonical role
  `COVER_RAISED_4S`, which no seed file anywhere defines. Added directly
  (identity + an ASSUMED $3.50 cost, the same provenance category
  `prisma/seed-phase-f-material-costs.ts` already uses for
  `INTERLOCK_KIT`/`PANEL_MAIN_BREAKER` — not a new pattern).
- `prisma/seed-chandelier.ts` targets
  `remove-and-replace-existing-chandelier`, a slug `prisma/seed.ts` does not
  create at all — confirmed stale (several other seed files already handle
  the same missing slug gracefully); omitted from this run's seed chain.
- The whole "Phase F" material-role/cost effort
  (`prisma/seed-phase-f-*.ts`, `prisma/seed-video-doorbell-wiring.ts`,
  `prisma/seed-generator-inlet.ts`, `prisma/seed-hot-tub-spa.ts`,
  `prisma/seed-panel-replacement.ts`, `prisma/seed-200a-service-upgrade.ts`,
  `prisma/seed-240v-garage-outlet.ts`, `prisma/seed-under-cabinet-
  lighting.ts`) defaults to report-only and needs an explicit `--apply` —
  easy to miss; confirmed by grepping every file's own `argv.includes(
  "--apply")` check.
- `prisma/seed-photo-groups.ts` is silently relied on by
  `prisma/seed-breakers.ts` and several other seed files (they look up
  `PANEL_PHOTOS`/`WORK_AREA_PHOTOS`/`EQUIPMENT_PHOTOS` by key and no-op if
  missing, with no warning) but is not in `prisma/seed-all.ts`'s own
  `STEPS` array — a gap in `seed-all.ts` itself, not just in this rehearsal.

## 2. The real seed order used (28 files beyond `seed-all.ts`'s own 22)

Full, exact, dependency-ordered list is `scripts/rehearse-fresh-electrical-
launch.ts`'s own `SEED_STEPS` constant — reproduced in summary:

1. `seed-all.ts`'s own 22 steps, with `prisma/seed-photo-groups.ts` inserted
   right after `prisma/seed-materials.ts` (see gap above).
2. `prisma/seed-appliance-services.ts` (dishwasher/disposal/soundbar/range
   hood — never in `seed-all.ts`).
3. Phase F, strict sub-order: `seed-phase-f-material-roles.ts` →
   `seed-phase-f-role-redesign.ts` → `seed-phase-f-material-costs.ts` →
   `seed-phase-f-costs-round2.ts` → the 7 Phase F "rescue" service files
   (order-flexible among themselves) → `seed-under-cabinet-lighting.ts`.
4. `scripts/add-equipment-roles.ts` → `scripts/build-fan-packages.ts`
   (Batch 2F's fan half).
5. `seed-flood-camera.ts`, `seed-low-voltage-and-sconces.ts`,
   `seed-outlet-power-source.ts` (needs `seed-dedicated-circuit.ts` done),
   `seed-material-categories.ts`, `seed-zip-codes-nj.ts`.
6. Routing V2 live-layer seeds, in their own strict order: `seed-routing-v2-
   material-roles.ts` → `seed-routing-v2-components.ts` → `seed-routing-v2-
   component-materials.ts` → `seed-component-labor-evidence.ts` →
   `seed-routing-v2-fixtures.ts` → `seed-surface-mounted-services.ts` →
   `seed-new-outlet-v2.ts`.
7. This run's own v6/COVER_RAISED_4S fixes (§1 above).
8. `scripts/add-consumables-recipes.ts --apply` (v5, Batch 2E).
9. `prisma/repair-trees.ts` (sanity check — 0 dangling; 3 UNREACHABLE on
   `new-120v-outlet`, expected: `seed-new-outlet-v2.ts` rewires it and
   retires 3 legacy distance-band questions in place, the same "preserve,
   reroute around" pattern the rest of this branch's Routing V2 work uses).
10. `scripts/extract-template-catalog.ts --from elite-electric --apply`
    (produces v1 SNAPSHOT).
11. `prisma/seed-routing-v2-policies.ts` → `prisma/seed-routing-v2-pricing-
    method.ts` (mutate that v1 SNAPSHOT in place — must run AFTER
    extraction, since both read the latest `TemplateVersion` and would
    throw `findFirstOrThrow` on an empty database).

**Never run:** `prisma/seed-pricing-inputs.ts` (own header: "RETIRED — DO NOT
RUN," would reverse the Aug 2026 pricing reconciliation).

Result, run for real this session: **77 of 82 Elite services extracted**
into a fresh electrical v1 SNAPSHOT — 227 questions, 789 answer options, 7
policy definitions the contractor must answer, 0 disclaimer concepts (see
§4). 5 services refused for genuine, named wording/policy decisions (§3).

## 3. Services NOT written into the fresh template, and why

`scripts/extract-template-catalog.ts`'s own refusal categories — none
invented, none silently worked around:

- **POLICY THRESHOLD OR ALLOWANCE (6 items)** — `generator-inlet-interlock`,
  `hot-tub-spa-electrical` (x3), `under-cabinet-led-lighting` (x2) name a
  specific number in customer-facing copy (e.g. "about 10 feet") that needs
  an authored, generic wording-manifest entry
  (`prisma/template/electrical.wording.json`) before it can become template
  content. Writing that wording is a genuine content-authorship decision,
  not a mechanical one — deliberately not made in this rehearsal.
- **AMBIGUOUS SCOPE WORDING (2 items)** — `replace-bathroom-exhaust-fan`'s
  `fan_package` help text and `replace-bathroom-exhaust-fan-with-light`'s
  own service label both state contractor policy ("we supply the fan") in a
  way the extractor requires an authored, contractor-neutral rewrite for.
  Same reasoning as above.

These 5 refusals block exactly `generator-inlet-interlock`,
`hot-tub-spa-electrical`, `under-cabinet-led-lighting`,
`replace-bathroom-exhaust-fan`, and `replace-bathroom-exhaust-fan-with-light`
from the extracted template — 77 of 82 services, not fewer, and not more.

## 4. Disclaimers: a confirmed, pre-existing, out-of-scope gap

`prisma/seed-conditional-disclaimers.ts` is attempted in this rehearsal's own
seed order (its own `ATTACHMENTS`/`EXTERIOR_WALL_SERVICES` tables name
`new-ceiling-light`, `new-ceiling-fan`, and `dedicated-120v-circuit-outlet`
directly) but fails with the same `CanonicalDisclaimer` gap already
documented in `docs/design/electrical-decision-tree-audit-v1-rehearsal-
bootstrap.md`'s "Known, expected failure" section: no code path in this
repo creates a `CanonicalDisclaimer` row from nothing on a from-scratch
database (`prisma/backfill-disclaimer-split-2026-08-27.ts`'s own `legacy`
query has been hardcoded to `[]` since 28 Aug 2026). Confirmed again by this
session's own run, not assumed. The extracted template therefore carries
**0 disclaimer concepts** — a real, reportable gap in the fresh-launch
catalog, not something this task fixes.

## 5. The launch-critical route: what is proven, and what is not

**REVISED — a prior pass of this section was wrong about two things: it
called `replace-standard-outlet` "PROVEN end-to-end" when its own
`materialCostResolved: true` was silently excluding a policy material's
cost from the total, and it reported the DERIVED path as an unresolved
materials-catalog gap when the real cause was a stale qualification answer
one layer above any material at all. Both are now fixed, at the root, and
re-proven. See `CHANGELOG` note in each subsection for exactly what moved.**

Run for real via `scripts/rehearse-fresh-electrical-launch-phase2.ts`,
against a v1 SNAPSHOT built by `scripts/rehearse-fresh-electrical-launch.ts`,
on real fresh contractors — never a raw `materialCostResolved`/`basePrice`
write:

**THE LIFECYCLE FIX, underneath every result below.**
`installCatalog` (`lib/templateProvisioning.ts`) used to link a
policy-quantity role's `ServiceMaterial` row ONLY once a cost existed for
it — for a wholly policy-quantity service like `dishwasher-electrical`,
that meant no link ever, so `requiredRolesFor()` saw nothing and
`recomputeServiceMaterialCost` reported "not itemized" forever. For a MIXED
recipe like `replace-standard-outlet`, it was worse and quieter: the
STRUCTURAL roles resolved, `materialCostResolved` flipped to `true`, and
the POLICY role's cost — entered, real, ignored — never reached the total.
`ServiceMaterial` now gets a `quantityIsPolicy` column mirroring
`TemplateServiceMaterial`'s, `installCatalog` links every role unconditionally
(quantity `null` for an undeclared policy allowance), and
`lib/materialResolution.ts`'s `assessMaterialReadiness` treats a null
quantity as unresolved — with its own reason (`NO_QUANTITY`, distinct from
`NO_COST`) — before it ever looks up a cost. Demonstrated for both shapes in
Phase 2: undeclared-but-costed correctly blocks, declaring resolves the
total exactly once (no silent omission), a later cost edit recomputes
correctly, and one tenant's declaration never moves another's total.

**CORRECTION, same day: the contractor-facing input seam was not actually
closed.** This section originally claimed declaring the allowance "goes
through the SAME action that already existed for this... now backed by"
`lib/materialCost.ts`'s new `declarePolicyMaterialQuantity`. That claim was
false — checked, not just asserted, and found wrong. Two real gaps
remained in this exact head:

- `components/admin/MaterialsPanel.tsx` typed a `ServiceMaterial`'s quantity
  as `number` and converted it on blur with `Number(e.target.value)`. An
  untouched, blank policy-quantity field is `Number("")`, which is `0` —
  finite and non-negative, so nothing caught it — and that invented zero was
  POSTed as a real declaration the moment a contractor's cursor left the
  field. Its incomplete-state copy also always named a missing COST, even
  when the only real gap was an undeclared allowance.
- `app/api/admin/materials/route.ts`'s "quantity" action never called
  `declarePolicyMaterialQuantity` at all — it still updated the row and
  recomputed in two separate statements, the exact pre-fix shape. The
  helper's own doc comment asserted it backed this endpoint; it did not, and
  the comment was corrected alongside the code.

Fixed for real this time: the UI now treats blank as "leave unanswered" (no
request sent) and an explicit `"0"` as a genuine, distinguishable
declaration; the incomplete banner separately names roles missing a cost
and roles missing an allowance; the route's "quantity" action routes a
policy role through `declarePolicyMaterialQuantity` (a structural role's
edit is unchanged); and that function is now atomic — the quantity write
and the readiness/total recompute are one `$transaction`, proven with an
injected fault that leaves both the quantity and the cached total rolled
back together. All proven live, through a real signed-up admin account, a
real browser, and the real API route — including a real, authenticated
cross-tenant request refused with no state change — in
`scripts/verify-materials-panel-quantity-browser-flow.ts` (20/20 checks).

**LEGACY_PUBLISHED, zero structural materials** (`dishwasher-electrical`)
— **NOW PROVEN, through the fixed lifecycle.** `writeMaterialCost` entering
the cost, then declaring the quantity, resolves `materialCostResolved:
true` with the correct $3.00 total. `activateService` additionally needed
`dedicated-120v-circuit-outlet` launched first — a real
`REROUTE_SERVICE` dependency (a fixed-appliance load always reroutes there)
invisible until this run's own dependency ordering was worked out; launched
through the same real materials → labor → price → activation lifecycle,
at real figures (`WIRE_14_2` 50 ft matches this service's own documented
`POLICY[dedicated_circuit.standard_run_ft]: 50`; `CONSUMABLES_MEDIUM` 1 job
matches its own package unit). **This almost certainly affects every one of
Batch 2E's 13 services** (the ones whose entire recipe is exactly one
policy-quantity line) and any other service shaped the same way — not
re-verified exhaustively for all 13, but the mechanism, and the fix, is
identical for each.

**LEGACY_PUBLISHED, has structural materials** (`replace-standard-outlet`)
— **PROVEN end-to-end, correctly this time.** A prior pass called this
proven while its `materialCostCents` ($3.00) silently excluded
`CONSUMABLES_SMALL`'s cost — the mixed-recipe defect above, on this exact
service. Now: `writeMaterialCost` for its 2 structural roles
(`RECEPTACLE_STANDARD`, `WALL_PLATE`) plus its 1 policy role
(`CONSUMABLES_SMALL`) leaves readiness correctly BLOCKED until the policy
quantity is declared; declaring it resolves to the correct $6.00 total, not
$3.00. `saveServicePricingInputs` → `publishSuggestedPrice` →
`activateService` all succeed (once `electrical-troubleshooting`, its real
`REROUTE_TROUBLESHOOTING` dependency, is activated first — itself needing
`fieldLaborHours` set, since `prisma/seed-content-fixes.ts` deliberately
leaves that service's pricing for a human to approve, by its own comment).
A subsequent cost edit (`CONSUMABLES_SMALL` $3.00 → $5.00) moves the total
by exactly the $2.00 delta, once. `lib/routeResolver.ts`'s real
`resolveRoute` then prices a real customer answer path
(`device_replacement_reason: "works_upgrading"`) to `PRICED, $255.00`.

**DERIVED_RESOLVED_SCOPE (Routing V2)** (`new-120v-outlet`) —
**NOW PROVEN — the "raceway-joint" refusal was never a materials-catalog
gap.** A prior pass reported `NOT_READY_TO_APPROVE` /
`NO_CONTRACTOR_PRODUCT (SURFACE_RACEWAY_JOINT)` and could not find why the
correctly-formed `ContractorMaterial` row for that role wasn't reaching the
takeoff. Traced this session from contractor product entry through the
actual loaded takeoff input, per the bounded task's own instruction: the
root cause was one layer upstream of any material at all.
`lib/electrical/onboardingPilotReadiness.ts`'s `PILOT_ANSWERS` answered a
RETIRED question (`purpose: "general_use"`) instead of the two real,
current ones — a PRIOR correction to this same constant had the rename
backwards. `prisma/seed-questions.ts` creates `purpose` first, but
`prisma/seed-outlet-power-source.ts` runs after it in every seed chain that
includes it (this run's own SEED_STEPS included) and explicitly DELETES
`purpose`, replacing it with `outlet_load_type` ("What will you be plugging
in?", `everyday` continues) then `outlet_power_source` ("How would you
like it powered?", `tap_existing` continues). Answering a question that no
longer exists made `resolveRoute` return `INVALID` before it ever reached
the surface-raceway module — `config.components` came back empty,
`loadSurfaceTakeoff` never saw a channel purchase, and the joint's "not
established" reason was reporting a route that was never walked. Fixed by
correcting `PILOT_ANSWERS` itself (full citation trail in its own doc
comment). That fix surfaced two further, narrow, now-fixed gaps once the
route was actually walked: `scripts/_derivedStorefrontFixture.ts`'s
dependency service (`dedicated-120v-circuit-outlet`) has the same two
policy-quantity roles as above, now declared at the same real figures; and
`new-120v-outlet`'s own `outlet_load_type` "ev" answer reroutes to Level 2
EV Charger Installation, a second real prerequisite, now activated first
(trivially — a `REMOTE_QUOTE` service with no materials and no fixed price
ever promised, per `prisma/seed-labor-hours.ts`'s own comment). Approved at
**$760.00** and activated through the real `decideDerivedPricingApproval` →
`activateService` path, on a genuinely fresh contractor built from this
run's own extracted catalog.

**Manual homeowner price** — proven for the LEGACY path via the real
`resolveRoute`, and for the DERIVED path via the real approved economics
above ($760.00).

**Native no-deposit booking** — **NOW PROVEN**, reusing this branch's own
production-build browser harness,
`scripts/verify-integration-manual-routing-storefront-browser-flow.ts`
(35/35 checks), against a `next build && next start` server pointed at
this same freshly-extracted catalog — not `next dev`, whose slower
hydration/HMR-related re-renders produced a real click-timing flake against
the two-question qualification gate that a production build does not have.
That harness needed one fix of its own: it hardcoded the same retired
`purpose` question `PILOT_ANSWERS` did (`qualifyForSurfaceRoute`'s "What
will this outlet power?" / "General use"), now answering the real two
questions instead. Proven, on this fresh catalog: the manual fractional
footage route (14.625 ft, then 20.5 ft via Back-and-re-answer, byte-for-byte
matching a direct answer); the displayed price equalling the stored
`LineItem.computedPriceCents`; a turned route (one flat corner) correctly
landing on review rather than a guessed price; a stale-priced "Add to My
Visit" refused with `409 REVIEW_REQUIRED` and no `LineItem` created; office
reapproval producing a genuinely different price; NATIVE scheduling and a
no-deposit checkout to a real `Booking` row, with `totalCents` matching the
reapproved price; and — after the economics change again post-booking —
the booked `Booking.totalCents`, `LineItem.computedPriceCents`,
`answersSnapshot`, `resolvedEconomicBasis`, `resolvedComponentKeys` and
`resolvedMaterialCostCents` all staying pinned to the ORIGINAL basis,
untouched by the later change. This is the "materials -> ... -> native
no-deposit booking" chain this manifest can now claim, in full, for the
DERIVED path.

## 6. Target identity checks (before ANY reset — local or, later, real)

- **Local rehearsal** (what this session did, and what any repeat of it
  must do): `prisma/_assertDisposableLocalDatabase.ts` — loopback host AND
  a `local-`-prefixed `DatabaseIdentity` stamp, both required. This
  session's own scratch databases (`p2b_freshlaunch_<run-id>`) were created
  with no pre-drop, under a name unique per run, and destroyed
  unconditionally at the end of each script.
- **Any future REAL reset** (explicitly NOT authorized by this task or this
  manifest — see §8): would need the SAME production-identity guard pattern
  `scripts/extract-template-catalog.ts`'s own `--i-know-this-writes-to-
  production` flag and `scripts/_lineage.ts`'s `probe()` already use
  elsewhere in this codebase, re-confirmed immediately before the write per
  `prisma/template/electrical-v3-provenance.json`'s own stated rule
  ("re-verified fresh immediately before the write").

## 7. Tenant-owned record families a real reset would clear, in dependency order

For reference only — this rehearsal never executes this against anything
but its own disposable scratch databases, and no real reset is authorized
by this task. FK-safe delete order, contractor-scoped:

```
Visit / LineItem / Booking (and any deposit/payment rows referencing them)
GuidedFlowSession
AnswerOption -> Question (per Service)
ServiceMaterial, AnswerOptionComponent, AnswerOptionMaterial (per Service/AnswerOption)
Service
ContractorMaterial, ContractorComponent
ContractorPolicyValue
ContractorDisclaimer (before CanonicalDisclaimer, never after)
ContractorCategory
ContractorSite, ContractorTrade
PricingSettings
Contractor
```

**Never cleared, platform-owned, canonical:** `CanonicalCategory`,
`CanonicalMaterial`, `CanonicalComponent`, `CanonicalDisclaimer`,
`PhotoGroup`, every `TemplateVersion`/`TemplateService`/`TemplateQuestion`/
`TemplateAnswerOption`/`TemplatePolicyDefinition` row, `ZipCode`. A reset
touches one contractor's own rows; it never touches the template or
canonical layer that a fresh `installCatalog` reads from.

## 8. Schema prerequisites and expected post-install state

- Prisma schema must already be pushed/migrated (this rehearsal used
  `prisma db push`, matching every other disposable-database rehearsal in
  this engagement).
- Exactly one `TemplateVersion{trade:"electrical", kind:SNAPSHOT}` must
  exist before `installCatalog` runs — `templateVersionSource` throws
  `findFirstOrThrow` otherwise.
- A fresh `installCatalog()` for a new contractor from this rehearsal's v1
  SNAPSHOT installs 77 services, ALL `active: false`, ALL
  `materialCostResolved` reflecting whether every one of that service's
  STRUCTURAL materials already has a cost (none will, for a genuinely new
  contractor) — §5's findings apply per-service, individually, not as a
  single yes/no for the whole catalog.
- `unresolvedMaterialKeys`/`unresolvedPolicyKeys` on each `Service` name
  exactly what a real Guided Setup wizard still needs from that contractor
  — confirmed directly, not assumed, via `bootstrapPlainContractor`'s own
  `installCatalog` result in this session's Phase 2 run.

## 9. Recovery / baseline snapshot pattern

Matching `scripts/verify-audit-batch-adoption.ts`'s own established
pattern (capture the exact pre-run `TemplateVersion`/`Contractor` sets,
not a bare count, and assert the identical sets are restored after
cleanup) — any future rehearsal of this kind should capture, before
touching anything:

```ts
const preVersions = await prisma.templateVersion.findMany({ where: { trade: "electrical" }, select: { version: true } });
const preContractors = (await prisma.contractor.findMany({ select: { slug: true } })).map(c => c.slug).sort();
```

and assert the identical sets afterward — this session's own two scripts do
exactly this pattern for their own scratch databases (which are dropped
outright at the end, so there is nothing left to compare inside them; the
comparison matters for a run against a SHARED database, which this session
deliberately never used).

## 10. Blockers this fresh-launch rehearsal closes, and what remains open

**Closes:** whether Routing V2's shared modules can be extracted into the
template layer at all (yes — done, verified). Whether a fresh, uncustomized
contractor can be installed from a genuinely composed catalog reflecting
all six real audit fixes plus the real material-catalog batches (yes, 77 of
82 services). Whether the LEGACY_PUBLISHED launch-critical route (materials
→ pricing → approval → activation → manual price) has ANY supported path
for a service with real structural materials (yes, proven end to end, and
correctly totaled — see below). Whether `materialCostResolved` has a
supported resolution path for a policy-quantity-only recipe (yes — fixed,
at the lifecycle level, in `installCatalog`/`assessMaterialReadiness`, not
worked around). Whether a mixed structural/policy recipe can silently
under-price by dropping the policy role's cost while still reporting
readiness (this was happening; now fixed, and demonstrated blocked-then-
resolved-then-recomputed-correctly for both a policy-only and a mixed
recipe, on two contractors, to confirm neither's declaration moves the
other's total). Whether the DERIVED_RESOLVED_SCOPE path can reach real
approval and activation on a fresh catalog (yes — root-caused to a stale
qualification answer above the materials layer entirely, fixed, and now
approved at $760.00). Whether the full "materials → pricing → approval →
activation → manual price → native no-deposit booking" chain is proven
end to end, through a real browser, on this fresh catalog (yes — 35/35
checks, reusing the existing production-build harness).

**Stays open, precisely bounded:**
1. v4's (`electrical-panel-replacement`) provenance discrepancy between
   project memory ("merged") and git history (never merged, source branch
   439 files stale) — Joshua has since clarified the intended definition
   from the source branch's own two added scripts (PANEL_MAIN_BREAKER ×1;
   BREAKER_SINGLE_POLE, BREAKER_DOUBLE_POLE, CONSUMABLES_MEDIUM as
   unresolved policy quantities; no assumed grounding-electrode/service-
   entrance work; 200A upgrade stays deferred) — carried into this manifest
   as the intended recipe, not yet built into the extracted template itself.
2. 5 services need authored wording-manifest entries before they can enter
   any template version at all (§3) — a content decision, explicitly
   deferred to a later catalog-completion slice, not this task's.
3. Disclaimers cannot be seeded on any from-scratch database (§4) — a
   pre-existing, already-documented gap, also deferred to that slice.
4. `scripts/onboard-contractor-two.ts` (BrightPath's real second-contractor
   onboarding) still carries its raw-SQL `materialCostResolved`/
   `unresolvedMaterialKeys` override — it proved the engine gap this task
   fixed, but the override itself was never removed, since BrightPath is a
   real, separate, already-onboarded tenant outside this task's fresh-
   launch scope. Its manual recompute loop was made null-quantity-safe
   (skips an undeclared role rather than throwing) so it keeps compiling
   against the new schema, but the override remains the antipattern, not a
   second real resolution path.
5. The schema change this task required (`ServiceMaterial.quantityIsPolicy`,
   `ServiceMaterial.quantity` now nullable) has been applied only to this
   run's own disposable scratch databases, per this task's standing rule.
   It has NOT been applied to the shared `p2b_integration_seeded` rehearsal
   cluster other sessions on this branch use — `npx prisma db push` against
   a database other sessions actively read and write is a coordinated,
   shared-state change outside this bounded task's authority. Two existing
   verify scripts this session updated for the new behavior
   (`scripts/verify-material-recipe-promotion-batch-1.ts`,
   `scripts/verify-template-catalog.ts`) will fail against that database
   with `P2022: column "quantityIsPolicy" does not exist` until that
   migration is applied there — a real, expected consequence of a real
   schema change, not a defect in either script.

## 11. Local evidence trail

- `scripts/rehearse-fresh-electrical-launch.ts` — Phase 1, builds and
  extracts the fresh catalog. Latest run: 77/82 services extracted, exit 0,
  against `p2b_freshlaunch_1789577038606_34745` (dropped via this script's
  own `--teardown` at the end of this session — ownership and teardown are
  now both executable, not just described).
- `scripts/rehearse-fresh-electrical-launch-phase2.ts` — Phase 2, the
  launch-critical-route proof, including the policy-quantity lifecycle
  demonstrations (policy-only, mixed, subsequent edit, cross-tenant
  isolation) and the DERIVED path. Latest run: **exit 0, 15/15 checks
  passed** (a prior run this session, before the fixes below, was exit 1 —
  1 of 15 checks failing on a real, since-fixed dependency-ordering gap for
  `dishwasher-electrical`).
- `scripts/verify-integration-manual-routing-storefront-browser-flow.ts` —
  the native no-deposit booking proof, run against a REAL `next build &&
  next start` server (not `next dev` — see §5) pointed at this same fresh
  catalog. Latest run: **exit 0, 35/35 checks passed** (an initial dev-mode
  run hit a click-timing flake unrelated to this task's fixes; the
  production build did not reproduce it).
- `scripts/verify-material-readiness.ts` — the pure-logic suite for
  `lib/materialResolution.ts`, no database. Extended this session with a
  dedicated "POLICY-QUANTITY ROLES" section proving the NO_QUANTITY/NO_COST
  distinction, the silent-omission regression, and resolution-once-declared,
  independent of any live database. All checks pass, including the
  pre-existing ones.
- `npx tsc --noEmit` clean across the whole repository after every change in
  this round, not just the files touched.
- `scripts/verify-materials-panel-quantity-browser-flow.ts` — the
  contractor-facing quantity-input correction (see the CORRECTION note in
  §5): a real signed-up admin account, a real browser driving
  `components/admin/MaterialsPanel.tsx` itself, and the real
  `/api/admin/materials` route. **20/20 checks passed**, on its own
  disposable scratch database (`p2b_materialsui_<run-id>`, uniquely
  fixture-scoped canonical roles prefixed `TEST_QTY_<run>_`, dropped at the
  end of the run) — covering the blank-blur guard, the explicit-zero
  distinction, the corrected incomplete-state messaging, policy-only and
  mixed-recipe block-then-resolve-then-recompute, a later edit's recompute,
  an injected-fault atomicity proof (quantity and cache roll back together,
  then a clean retry succeeds), and a real authenticated cross-tenant
  request refused with zero state change.
- All four scratch-database-driving scripts (Phase 1, Phase 2, the native-
  booking browser flow, and this quantity-input browser flow) create and
  destroy only their own uniquely-named, no-pre-drop scratch databases or
  reuse one already stamped `local-*`; none touches `p2b_integration_seeded`
  or any other shared or production database. Every scratch database this
  round created was dropped at the end of its own run; nothing was left
  running.
