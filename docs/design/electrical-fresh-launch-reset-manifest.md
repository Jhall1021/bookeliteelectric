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

12. `scripts/finalize-panel-replacement-recipe.ts --apply` — the intended
    `electrical-panel-replacement` recipe correction (§3 below), run
    immediately after extraction, against whatever `TemplateVersion` the
    extraction just created.

**Catalog completion, same day.** §3 and §4 below described real gaps as of
the prior run (77/82 services, 0 disclaimer concepts). Both are now closed;
this section's numbers are the corrected, current ones.

Result, run for real this session: **82 of 82 Elite services extracted**
into a fresh electrical v1 SNAPSHOT — 229 questions, 792 answer options, 10
policy definitions the contractor must answer, 8 disclaimer concepts. 0
services refused; 0 unresolved wording classifications remain.

## 3. The five previously-omitted services — restored

`scripts/extract-template-catalog.ts`'s two refusal categories, both closed
by authoring real `prisma/template/electrical.wording.json` and
`electrical.policies.json` entries — never by erasing the underlying scope
decision:

- **POLICY THRESHOLD OR ALLOWANCE (6 findings, 3 services).**
  `generator-inlet-interlock`'s `inlet_location` help text and `hot-tub-
  spa-electrical`'s `spa_distance` help text each named Elite's own
  included-wire-footage figure ("about 10 feet" / "about 25 feet") in plain
  prose — rewritten to a neutral sentence that states the same real fact
  (a standard length is included, set during setup) without hardcoding
  Elite's number. `hot-tub-spa-electrical`'s `spa_distance` near/far
  answer options and `under-cabinet-led-lighting`'s `uc_length`
  standard/long options named the same figures in their LABELS — these
  became real band policies (`spa_circuit_run.breakpoints`,
  `under_cabinet_run.breakpoints` in `electrical.policies.json`, boundary
  count 1 each), the same mechanism `switch_leg_run.breakpoints` etc.
  already used, so a fresh contractor answers with their OWN distance, not
  Elite's. `generator-inlet-interlock`'s `inlet_location` options
  ("On the same wall..." / "Somewhere further...") were already neutral and
  needed no policy — only its help text did.
- **AMBIGUOUS SCOPE WORDING (2 findings, 2 services).**
  `replace-bathroom-exhaust-fan`'s `fan_package` help text ("We supply the
  fan. A light version costs a little more...") restated the same
  supply-arrangement policy `bathroom_fan.supply_arrangement` already
  tracks by name — rewritten to keep only the real, universal cost fact (a
  light costs more to buy AND to fit) and drop the "we supply" assertion.
  `replace-bathroom-exhaust-fan-with-light`'s own service name ("...with
  Light — We Supply the Fan") got the identical rename its sibling service
  already had, for the identical reason.

All five now install with their real routing, material roles and policy
flags intact — proven directly, not inferred, in `scripts/verify-catalog-
completion.ts` (§11).

## 4. Disclaimers — bootstrapped, and now genuinely attached

`prisma/seed-conditional-disclaimers.ts` used to fail on every from-scratch
database: no code path created the `CanonicalDisclaimer` row its own
`attach()` requires (`prisma/backfill-disclaimer-split-2026-08-27.ts`'s
`legacy` query has been hardcoded to `[]` since 28 Aug 2026). That file now
bootstraps its own `CanonicalDisclaimer` + Elite `ContractorDisclaimer` rows
from its own already-reviewed, checked-in `DISCLAIMERS` text before
attaching them — never an invented placeholder, never a blanket substitute.
Six canonical disclaimers, all from real, existing content:

- The four exterior-wall-contingency / tap-existing-fixture / distance-help
  disclaimers this file already defined and tried to attach.
- **`CUSTOMER_SUPPLIED_EQUIPMENT`** — the "customer-supplied audit"
  disclaimer, added this pass: was an inline `AnswerOption.disclaimer`
  string, verbatim, on both `replace-range-hood`'s
  `hood_backsplash/same_mounting` and **`soundbar-installation`'s
  `soundbar_power/yes`** — moved to a canonical disclaimer for the same
  reason `TAP_EXISTING_FIXTURE_FINISHED` replaced its own per-answer
  copies: one source for one sentence, per ADR-009. `prisma/seed-appliance-
  services.ts` no longer carries the inline text; the attachment now runs
  from `seed-conditional-disclaimers.ts`, which has to run AFTER
  `seed-appliance-services.ts` in the real chain (that file's own
  `clearTree()` would otherwise discard the attachment) — SEED_STEPS was
  reordered accordingly.

**A real, useful side effect, not part of this task's original ask:**
bootstrapping let `seed-conditional-disclaimers.ts` run to completion for
the first time on any from-scratch database, which means the
`device_on_exterior_wall` question it creates on `new-120v-outlet` and
`dedicated-120v-circuit-outlet` now exists in the fresh template too — never
before this round. On `new-120v-outlet` specifically this question is
immediately superseded: `prisma/seed-new-outlet-v2.ts`'s own
`RETIRED_OUTLET_QUESTIONS` list names `device_on_exterior_wall` explicitly
(alongside `outlet_run_distance` and `finished_space_both_sides`) and runs
afterward, rewiring the `below_above_access/has_access` branch into
Routing V2's own module instead — "rewired out, not deleted," that file's
own stated policy, confirmed directly: the row exists, its answer options
are empty, nothing routes to it. The branch that matters for the proven
booking route, `below_above_access/no_access`, is untouched by any of this
— confirmed directly, not assumed (§11).

On a fresh contractor install, none of these six disclaimers attach yet —
`installCatalog` correctly leaves `AnswerOptionDisclaimer` unlinked until
the contractor authors their OWN `ContractorDisclaimer` text (ADR-009: "the
contractor authors their own wording, not ours"), and reports the gap
honestly via `InstallResult.disclaimersToAuthor` (8, this run) rather than
silently attaching Elite's wording for them.

**Closed in the following round.** Nothing in the app could actually create
that `ContractorDisclaimer` row — the only writes to that model anywhere in
the codebase were one-time seed scripts, never app code, so the gap above
was permanent for any real contractor, not just a fresh-install artifact.
`lib/disclaimerAuthoring.ts` (`pendingContractorDisclaimers` /
`authorContractorDisclaimer`), `app/api/admin/disclaimers/route.ts`, and
`components/admin/DisclaimerList.tsx` (wired into the existing
`/dashboard/policies` page, mirroring `PolicyList`'s own shape) now close
it: a contractor sees the neutral `CanonicalDisclaimer.description` guidance
for each unresolved concept — never another contractor's dollar amounts or
promises — writes their own wording, and saving it atomically attaches that
wording to every one of their own installed `AnswerOption` rows the
template says needs it, without reinstalling anything. Proven end-to-end,
real browser, real session, real save, real homeowner render, by
`scripts/verify-disclaimer-authoring-browser-flow.ts` (8/8 checks — see
§11).

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
  SNAPSHOT installs 82 services (not the stale 77 — see §3/§4), ALL `active: false`, ALL
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
all six real audit fixes plus the real material-catalog batches (yes — now
**all 82 of 82 services**, not 77; see §3/§4). Whether the LEGACY_PUBLISHED
launch-critical route (materials → pricing → approval → activation →
manual price) has ANY supported path for a service with real structural
materials (yes, proven end to end, and correctly totaled — see below).
Whether `materialCostResolved` has a supported resolution path for a
policy-quantity-only recipe (yes — fixed, at the lifecycle level, in
`installCatalog`/`assessMaterialReadiness`, not worked around). Whether a
mixed structural/policy recipe can silently under-price by dropping the
policy role's cost while still reporting readiness (this was happening; now
fixed, and demonstrated blocked-then-resolved-then-recomputed-correctly for
both a policy-only and a mixed recipe, on two contractors, to confirm
neither's declaration moves the other's total). Whether the
DERIVED_RESOLVED_SCOPE path can reach real approval and activation on a
fresh catalog (yes — root-caused to a stale qualification answer above the
materials layer entirely, fixed, and now approved at $760.00). Whether the
full "materials → pricing → approval → activation → manual price → native
no-deposit booking" chain is proven end to end, through a real browser, on
this fresh catalog (yes — 35/35 checks, reusing the existing production-
build harness; unaffected by this round's catalog-completion changes,
confirmed directly rather than assumed — §3/§4/§11). Whether the five
previously-omitted services can be restored without erasing the real scope
decisions behind them (yes — §3). Whether canonical disclaimers can be
bootstrapped from real, reviewed, checked-in content and carried through
extraction and fresh installation (yes — §4). Whether the intended
`electrical-panel-replacement` recipe can be built from PR #67's narrow
source evidence without merging its stale branch or running its historical
mutator (yes — §3/§11, `scripts/finalize-panel-replacement-recipe.ts`).
Whether a fresh contractor can actually author their own disclaimer wording
and have it reach a real homeowner — not just show up as a counted, unmet
requirement — (yes, closed in the following round: `lib/disclaimerAuthoring.ts`
+ the `/dashboard/policies` Disclaimers section + `PATCH
/api/admin/disclaimers`, proven 8/8 — §4/§11).

**Superseded by this round, removed from "stays open":** the prior list's
items 1–3 (panel-recipe provenance/not-yet-built, the 5 omitted services,
and the disclaimer gap) are closed, per §3/§4 above and the direct proof in
§11. Panel-history discrepancy itself (project memory said PR #67
"merged"; git history says it never was, and its source branch is 439
files stale against `main`) is not something this task resolves — Joshua's
own clarification settled the SCOPE question (use the branch's two added
files as narrow evidence, never the branch itself), which is what got
built; the merge-history discrepancy is a separate, standing fact about
project memory's accuracy, not a blocker to anything in this manifest.

**Stays open, precisely bounded:**
1. `scripts/onboard-contractor-two.ts` (BrightPath's real second-contractor
   onboarding) still carries its raw-SQL `materialCostResolved`/
   `unresolvedMaterialKeys` override — it proved the engine gap this task
   fixed, but the override itself was never removed, since BrightPath is a
   real, separate, already-onboarded tenant outside this task's fresh-
   launch scope. Its manual recompute loop was made null-quantity-safe
   (skips an undeclared role rather than throwing) so it keeps compiling
   against the new schema, but the override remains the antipattern, not a
   second real resolution path.
2. The schema change this task required (`ServiceMaterial.quantityIsPolicy`,
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
3. `EXTERIOR_WALL_CONTINGENCY_SWITCHLEG` is defined in
   `prisma/seed-conditional-disclaimers.ts`'s own `DISCLAIMERS` array (and
   now bootstrapped as a real canonical disclaimer, like its siblings) but
   is not referenced by any `ATTACHMENTS`/`EXTERIOR_WALL_SERVICES` entry —
   a pre-existing, orphaned definition this task found but did not create
   and was not asked to wire up. Noted, not touched.
4. On `new-120v-outlet` specifically, `device_on_exterior_wall` (created by
   the now-working disclaimer bootstrap) is immediately superseded by
   `seed-new-outlet-v2.ts`'s own retirement of it — confirmed by design,
   not a defect (§4) — so the exterior-wall contingency disclosure is live
   only on `dedicated-120v-circuit-outlet` in this fresh catalog, not on the
   outlet service itself. Whether that one-sided coverage is intended or
   its own separate gap is a Routing V2 product question, outside this
   task's scope to decide.
5. **CORRECTED, 18 Sep 2026 — the original "four gaps" here overstated two
   of them and has since closed a third.** Reviewed and precisely restated:
   - **`Service.basePrice`/`whileWeThereBasePrice` unpublished** — NOT a
     gap. A contractor who has not published a price for a service SHOULD
     see `PUBLISHED_REVIEW` (photo-review) rather than a price nobody
     approved — that is `lib/pricePublication.ts` and `lib/serviceActivation.ts`
     working exactly as designed. `scripts/verify-disclaimer-authoring-
     browser-flow.ts`'s own fixture now publishes real prices for its two
     priced dependents through the actual supported path
     (`saveServicePricingInputs` then `publishSuggestedPrice` — never a
     direct `basePrice` write), the same two calls the real admin panel
     makes.
   - **Band-policy labels** (`AnswerOption.labelPattern`, e.g. `"{b1} feet
     or less"`) — NOT a gap either, for the same reason: `lib/policyResolution.ts`'s
     `resolvePolicy` is a real, working, already-supported mechanism, and an
     unresolved policy correctly refuses both price publication and
     activation until the contractor answers it. Resolving it DID surface a
     real, separate bug this round: `resolvePolicy` matched every
     label-pattern option on a service still owing SOME policy an answer,
     not only the options belonging to the SPECIFIC policy being resolved —
     so a service needing two different band policies
     (`fan-replacing-light` needs both `fixture_work_height.breakpoints`
     and `switch_leg_run.breakpoints`) could have the first policy's
     already-correct labels silently overwritten with the second policy's
     boundaries. Fixed by scoping the query on `AnswerOption.policyKey`,
     the stored link `installCatalog` already writes.
   - **`AnswerOption.accessClassification` — CLOSED this round.** Added to
     `TemplateAnswerOption` (previously absent entirely), wired through
     extraction and `installCatalog`. A parallel gap on the COMPONENT side
     — `TemplateAnswerOptionComponent` lacked `conditionAccessClass`/
     `conditionAccessSlot` too, so `switched_outlet`'s two mutually
     exclusive lighting-conversion components (one ACCESSIBLE, one
     FINISHED — `prisma/seed-lighting-control.ts`) installed unconditioned,
     both applying on every answer regardless of actual access — is ALSO
     closed. Both proven: `scripts/verify-access-conditional-components.ts`
     (pure resolver logic — only the matching variant selects, UNKNOWN
     fails closed, a non-PRIMARY slot stays scoped) and a direct install
     check confirming the live `AnswerOptionComponent` rows carry the
     condition.
   - **`AnswerOptionComponent` price approval — STILL open, not touched.**
     Some branches (e.g. `new-ceiling-light`'s `attic_access/no_access`,
     its own FINISHED-access path) reference a `CanonicalComponent` with no
     way, anywhere in the app, for a contractor to approve a customer price
     for it — `approvedComponentPriceCents` is null on Elite's OWN live row
     too, so this branch forces photo-review for every contractor today,
     not just a fresh install. Same class of gap the disclaimer-authoring
     work closed, but for components — a missing authoring surface, not a
     working mechanism nobody has used yet. Needs a concrete authority
     trace (who sets it, what model, what UI) before it becomes its own
     implementation task; not attempted here.
   - **`lib/disclaimerAuthoring.ts`'s own requirement derivation — CORRECTED
     twice this round.** First (76cae3a) from "any `TemplateService` with a
     matching key, any version, ever" (leaked a retired attachment) to "the
     current snapshot+delta fold" — itself then found wrong in the OTHER
     direction: publishing a later template change with no adoption run
     could hide a requirement a contractor's own installed rows still carry,
     or introduce one they never installed. Now bound to each service's own
     recorded `templateVersionId` — the exact originating definition, never
     "whatever is current" — intersected with real graph reachability (a
     question nothing points to, per the tree's own "rewired out, not
     deleted" policy, blocks nothing and shows nowhere) and the surviving
     live `AnswerOption` graph. Proven by
     `scripts/verify-disclaimer-template-version-fold.ts`'s three scenarios:
     a superseded version's requirement doesn't leak, an unreachable
     requirement doesn't block while a reachable one does (and every
     reachable target attaches before the blocker clears), and a version
     published AFTER install doesn't change what an already-installed
     contractor is shown.

**Next concrete Preview/release steps, in order:**

Every script this manifest cites (`rehearse-fresh-electrical-launch*.ts`,
`verify-catalog-completion.ts`, `verify-disclaimer-authoring-browser-flow.ts`,
etc.) opens with `assertDisposableLocalDatabase` — a loopback-host,
`local-`-prefixed identity check — and refuses to run at all against
anything else. They cannot simply be pointed at Neon by changing
`DATABASE_URL`; a real Preview run needs an environment-compatible
initialization plan that swaps that guard for a Neon-branch-scoped
equivalent (the same production-identity re-verification pattern §6 already
cites for `scripts/extract-template-catalog.ts` and `scripts/_lineage.ts`),
without weakening what either guard actually checks.

1. Preview verification (step 3 below) does not wait on step 1a. Coordinating
   the `ServiceMaterial`/`TemplateServiceMaterial` schema migration onto the
   SHARED `p2b_integration_seeded` cluster is real work, owed to whoever else
   reads and writes that cluster — but it is not a prerequisite for THIS
   task's own Preview branch, which is owned, disposable, and can carry the
   same migration independently. Shared local-cluster synchronization is a
   parallel obligation, not a mandatory gate, whenever a session's own owned
   resources (its own Neon branch, its own scratch database) already suffice
   for what it's verifying.
   1a. Separately, still coordinate that same migration onto
       `p2b_integration_seeded` with whoever else is using it, on its own
       timeline — real shared-state work, just not one this task's Preview
       step is blocked behind.
2. Decide `electrical-panel-replacement`'s launch status explicitly: it now
   installs with its intended, honest recipe — `PANEL_MAIN_BREAKER` at a
   STRUCTURAL quantity fixed at 1 by the template (a known count, not a
   resolved contractor COST — no line here has an approved price), plus 3
   unresolved policy quantities, and no assumed grounding work — so the
   whole service is NOT priced or activatable until a real contractor
   declares those 3 allowances and costs, and separately approves
   `PANEL_MAIN_BREAKER`'s own cost, through the supported lifecycle this
   task already proved works (§5's policy-material demonstration covers the
   mechanism; nobody has walked this SPECIFIC service through it yet). No
   new fixed pricing for the panel has been authorized or published by this
   task or any prior round — the recipe is structural only.
3. A real, credentialed operator runs Phase 1 + Phase 2 +
   `scripts/verify-catalog-completion.ts` + the disclaimer-authoring proof
   against a fresh, OWNED Neon branch (never production directly), each
   script adapted per the environment-compatible initialization plan above —
   to confirm this local proof holds off this machine's disposable Postgres.
4. Review this manifest's §6–§9 (target identity, tenant-record clearing
   order, schema prerequisites, recovery snapshot) against that Neon
   branch's actual state before any live reset is authorized.
5. Only after 1–4: the actual production reset and Preview deployment,
   each requiring its own explicit, in-conversation authorization, per this
   task's standing rule — nothing in this manifest authorizes either.

**Deferred cleanup, not active-customer blockers:** items 1 and 3 in "stays
open" above (BrightPath's `onboard-contractor-two.ts` raw-SQL override, and
the orphaned `EXTERIOR_WALL_CONTINGENCY_SWITCHLEG` disclaimer definition) are
both pre-existing, both noted, and neither blocks a real contractor's launch
today — they're work to schedule, not conditions to clear first.

## 11. Local evidence trail

- `scripts/rehearse-fresh-electrical-launch.ts` — Phase 1, builds and
  extracts the fresh catalog. A prior run this same day (against
  `p2b_freshlaunch_1789577038606_34745`, dropped via this script's own
  `--teardown` — the run that proved ownership/teardown are executable, not
  just described) extracted 77 of 82 services, before this round's catalog-
  completion work. **Superseded by the 82/82 run recorded under "Catalog
  completion" below**, the current, accurate count.
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
- **Catalog completion, run for real this session, against a fresh scratch
  database (`p2b_freshlaunch_1789581848644_43235`, dropped at the end of
  the run):**
  - Phase 1 (`scripts/rehearse-fresh-electrical-launch.ts`): **82 of 82
    services extracted**, 0 refused, 229 questions, 792 answer options, 10
    policy definitions, 8 disclaimer concepts. Exit 0.
  - Phase 2 (`scripts/rehearse-fresh-electrical-launch-phase2.ts`), re-run
    against this same catalog to confirm no regression: exit 0, all checks
    passed, including the DERIVED path approved at $760.00 — unchanged.
  - `scripts/verify-catalog-completion.ts` (new) — the affected-paths proof
    for this round specifically: all 5 restored services install with the
    intended neutral wording and live policy definitions (not Elite's
    hardcoded figures); `electrical-panel-replacement` installs with
    exactly the intended 4-line recipe (`PANEL_MAIN_BREAKER` at its
    structural quantity of 1 — a known count, not a resolved contractor
    cost; `BREAKER_SINGLE_POLE`/`BREAKER_DOUBLE_POLE`/`CONSUMABLES_MEDIUM`
    unresolved policy; `GROUND_ROD`/`GROUND_CLAMP`/`WIRE_GROUND_6` genuinely
    absent); `CUSTOMER_SUPPLIED_EQUIPMENT` carries through extraction onto
    `soundbar-installation`; `device_on_exterior_wall` exists on a fresh
    install for the first time and is confirmed retired-by-design on
    `new-120v-outlet`, while `below_above_access/no_access` — the proven
    booking route's own branch — is confirmed byte-for-byte unchanged.
    **28/28 checks passed.** Not a repeat of the full booking suite, per
    this round's own instruction to reuse existing evidence.
- `scripts/verify-disclaimer-authoring-browser-flow.ts` (new) — the
  disclaimer-authoring lifecycle proof (§4): two real, verified, signed-up
  contractor accounts, one fully installed (82 services) and one bare; a
  real save through `/dashboard/policies`'s new Disclaimers section; the
  real `PATCH /api/admin/disclaimers` route; a real homeowner browser
  reading the real storefront. Covers CUSTOMER_SUPPLIED_EQUIPMENT
  (accessClass null, proven on `replace-range-hood`) and
  TAP_EXISTING_FIXTURE_FINISHED (accessClass FINISHED, proven on
  `fan-replacing-light`, since its first-listed dependent —
  `new-ceiling-light` — hits the pre-existing component-price-approval gap
  in item 5 above even on Elite's own live data): unresolved -> neutral
  guidance shown, never Elite's wording or dollar amounts -> contractor
  saves their own text -> atomic attachment to every one of their own
  installed answer options -> homeowner sees it on the applicable branch,
  not the inapplicable one -> a second, separate contractor's own write
  never reaches the first contractor's storefront or rows. **8/8 checks
  passed**, on its own scratch database
  (`p2b_freshlaunch_1789583817643_51447`, reused from this round's Phase 1
  rebuild above, dropped at the end of the run) — required three targeted,
  documented fixture completions (§10 item 5) to reach services whose
  guided flow a fresh install cannot otherwise complete, and one real fix:
  `lib/disclaimerAuthoring.ts`'s actual attachment write was refused outright
  by `lib/tenantGuard.ts`'s `DerivedCreateError` on first run
  (`AnswerOptionDisclaimer` has no `contractorId` to stamp) — resolved by
  proving ownership through the guarded client, then writing through the
  unguarded one inside its own transaction, exactly the pattern
  `lib/tenantWrites.ts` (ADR-010) already documents for this class of model.
- `scripts/verify-access-conditional-components.ts` (new) — pure resolver
  logic, no database at all: `applyBranch` (lib/pricing.ts) selects only the
  ACCESSIBLE-conditioned or only the FINISHED-conditioned variant of a
  mutually-exclusive component pair, never both; an UNKNOWN classification
  selects neither (fails closed); a component conditioned on a non-PRIMARY
  slot (`INDOOR_EQUIPMENT`) is not selected merely because PRIMARY happens
  to match, and IS selected once that same slot is the one actually
  established. **5/5 checks passed.** Confirmed separately, against a real
  fresh install: `TemplateAnswerOptionComponent.conditionAccessClass`/
  `conditionAccessSlot` (new fields) carry `switched_outlet`'s two real
  conditioned components (`prisma/seed-lighting-control.ts`) through
  extraction and installation unchanged.
- `scripts/verify-disclaimer-template-version-fold.ts` (rewritten, three
  scenarios, against a fresh scratch database
  `p2b_freshlaunch_1789596377920_75885`, dropped at the end of the run):
  a superseded template version's requirement does not leak into a
  contractor's pending list; an unreachable retained question's disclosure
  neither blocks activation nor appears as pending while a reachable one
  does both, and a save attaches every reachable target (not just one)
  before the blocker clears; a TemplateVersion published AFTER a contractor
  already installed neither hides what they actually have nor introduces a
  requirement they never installed. **9/9 checks passed.**
- `scripts/verify-disclaimer-authoring-browser-flow.ts` re-run against the
  same fresh scratch database, unchanged in intent, to confirm the
  provenance/reachability rewrite of `lib/disclaimerAuthoring.ts` breaks
  nothing it already proved: **14/14 checks passed** (the multi-tenant
  browser context's own guided-flow session legitimately resumes mid-tree
  on a repeat visit rather than restarting — the helper that walks the
  range-hood question tree was made tolerant of that instead of assuming a
  fresh start every call, a test-only fix, not an app behavior change).
- `scripts/verify-catalog-completion.ts` re-run against the same database:
  **28/28 checks passed**, no regression from this round's schema or
  `installCatalog` changes.
- All nine scratch-database-driving scripts across this whole engagement
  (Phase 1, Phase 2, the native-booking browser flow, the quantity-input
  browser flow, the catalog-completion rebuild + focused proof, the
  disclaimer-authoring lifecycle proof, and this round's version-fold +
  access-conditional-component proofs) create and destroy only their own
  uniquely-named, no-pre-drop scratch databases or reuse one already
  stamped `local-*`; none touches `p2b_integration_seeded` or any other
  shared or production database. Every scratch database this round created
  was dropped at the end of its own run; nothing was left running.
