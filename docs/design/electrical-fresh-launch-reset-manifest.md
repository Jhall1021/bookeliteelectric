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

Run for real this session via `scripts/rehearse-fresh-electrical-launch-
phase2.ts`, against the v1 SNAPSHOT from §1-2, on three separate fresh
contractors — never a raw `materialCostResolved`/`basePrice` write:

**LEGACY_PUBLISHED, zero structural materials** (`dishwasher-electrical`) —
**BLOCKED, confirmed precisely.** `writeMaterialCost` (the real, supported
onboarding function — it internally triggers
`lib/materialCost.ts`'s `recomputeServiceMaterialCost`) cannot resolve
`materialCostResolved` here: `requiredRolesFor()` reads only `ServiceMaterial`
rows, and `installCatalog` never links a policy-quantity-only material at
all (§1's own comment: "a policy-quantity material gets NO link at all").
`activateService` refuses with a real, named code:
`MATERIALS_UNRESOLVED` — "no cost has been entered for CONSUMABLES_SMALL."
This is the SAME gap `scripts/onboard-contractor-two.ts` (BrightPath's own,
real onboarding script) hits and works around with a raw SQL
`UPDATE services SET "materialCostResolved" = true, "unresolvedMaterialKeys"
= '{}'` — confirming this is a genuine product gap, not a rehearsal
artifact. **This almost certainly affects every one of Batch 2E's 13
services** (the ones whose entire recipe is exactly one policy-quantity
line) and any other service shaped the same way — not verified exhaustively
for all 13, but the mechanism is identical for each.

**LEGACY_PUBLISHED, has structural materials** (`replace-standard-outlet`)
— **PROVEN end-to-end, real functions only.** `writeMaterialCost` for its 2
structural roles (`RECEPTACLE_STANDARD`, `WALL_PLATE`) plus its 1 policy
role (`CONSUMABLES_SMALL`) correctly resolves `materialCostResolved: true`.
`saveServicePricingInputs` → `publishSuggestedPrice` → `activateService` all
succeed (once `electrical-troubleshooting`, its real
`REROUTE_TROUBLESHOOTING` dependency, is activated first — itself needing
`fieldLaborHours` set, since `prisma/seed-content-fixes.ts` deliberately
leaves that service's pricing for a human to approve, by its own comment).
`lib/routeResolver.ts`'s real `resolveRoute` then prices a real customer
answer path (`device_replacement_reason: "works_upgrading"`) to
`PRICED, $255.00`.

**DERIVED_RESOLVED_SCOPE (Routing V2)** (`new-120v-outlet`) —
**UNRESOLVED, precisely diagnosed, not routed around.** Reusing
`scripts/_derivedStorefrontFixture.ts`'s own `buildPricedDerivedContractor`
— an existing, otherwise-proven function other suites already rely on —
against this rehearsal's freshly-extracted catalog refuses at the approval
step: `NOT_READY_TO_APPROVE` / `NO_CONTRACTOR_PRODUCT (SURFACE_RACEWAY_
JOINT)`. Diagnosed as far as this session went: the `ContractorMaterial`
row for that role IS created correctly (real `packageQuantity`/
`packagePriceCents`, confirmed by direct query), and zero
`CanonicalComponentMaterial` rows reference the role at all — so the
requirement is not an ordinary component-recipe line but something in
`lib/electrical/materialTakeoff.ts`'s own segmentation-based joint
calculation. Resolving all three of `new-120v-outlet`'s policies —
including `surface_raceway.offcut_reuse`, which the shared fixture itself
never resolves (a second, separate real gap this session's fresh extraction
surfaced, independent of the joint issue) — does not clear it. Root cause
not found in the time available; reported as unproven rather than forced.

**Manual homeowner price** — proven for the LEGACY path above via the real
`resolveRoute`. Not reached for the DERIVED path, since activation itself
did not complete.

**Native no-deposit booking** — **NOT ATTEMPTED this session.** The real
booking path (`app/api/checkout/route.ts`) is a 679-line HTTP route
handler coupled to cookie sessions, site routing, and the deposit/Stripe
flow — not a plain function callable without a running server. Proving it
for real means the same dev-server-plus-Playwright pattern this branch's
own `scripts/verify-integration-manual-routing-storefront-browser-flow.ts`
already uses, which this session did not have time to also stand up
against the fresh catalog. This is the one piece of "materials -> ... ->
native no-deposit booking" this manifest does NOT claim to have proven.

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
for a service with real structural materials (yes, proven end to end).

**Stays open, precisely bounded:**
1. `materialCostResolved` has no supported resolution path for a service
   whose entire recipe is policy-quantity-only — confirmed via a real,
   named refusal code (`MATERIALS_UNRESOLVED`), and via `scripts/onboard-
   contractor-two.ts`'s own raw-SQL workaround for the identical gap on a
   real contractor. See `docs/design/electrical-v1-v2-release-manifest.md`
   §7 Blocker 11 (same underlying gap, now confirmed against a genuinely
   fresh install rather than only reasoned about).
2. The DERIVED_RESOLVED_SCOPE path's `NO_CONTRACTOR_PRODUCT
   (SURFACE_RACEWAY_JOINT)` refusal against a freshly-extracted catalog —
   root cause not found; needs a focused look at `lib/electrical/
   materialTakeoff.ts`'s segmentation-based joint calculation specifically.
3. v4's (`electrical-panel-replacement`) provenance discrepancy between
   project memory ("merged") and git history (never merged, source branch
   439 files stale) — needs Joshua's clarification, not resolved either way
   here.
4. 5 services need authored wording-manifest entries before they can enter
   any template version at all (§3) — a content decision, not a technical
   one.
5. Disclaimers cannot be seeded on any from-scratch database (§4) — a
   pre-existing, already-documented gap, unrelated to this task.
6. Native no-deposit booking — not attempted this session (§5); needs a
   dev-server-plus-browser pass against a fresh catalog, following the
   existing pattern in `scripts/verify-integration-manual-routing-
   storefront-browser-flow.ts`.

## 11. Local evidence trail

- `scripts/rehearse-fresh-electrical-launch.ts` — Phase 1, builds and
  extracts the fresh catalog. Run this session: 77/82 services extracted,
  exit 0.
- `scripts/rehearse-fresh-electrical-launch-phase2.ts` — Phase 2, the
  launch-critical-route proof. Run this session: exit 1 (3 genuine,
  precisely-diagnosed findings — §5 — not script defects; `npx tsc --noEmit`
  clean for both files).
- Both scripts create and destroy their own uniquely-named, no-pre-drop
  scratch databases; neither touches `p2b_integration_seeded` or any other
  shared or production database.
