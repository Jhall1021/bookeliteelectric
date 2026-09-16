# Electrical V1/V2 release manifest — PR #63

Documentation and planning only. No code changes accompany this document,
and no production access was used to produce it. Deployment stays
disabled.

**SUPERSEDED IN PART, 16 Sep 2026 — FRESH-LAUNCH DIRECTION.** Per Joshua's
explicit instruction (PR #63, and `CLAUDE.md`'s own recorded standing rule):
Price2Book has no active contractors, Elite is inactive too, and existing
contractor/test data is not a preservation requirement. The existing-
contractor adoption project this document mostly covers (§1-§8 below) is
**stopped, not expanded further** — its completed work stays completed, and
its own remaining items (Blocker 11 especially) are carried forward as
**deferred**, not as release blockers for a fresh launch. See
`docs/design/electrical-fresh-launch-reset-manifest.md` for the fresh-launch
rehearsal this superseding direction asked for: a real, from-scratch build
of the composed Electrical catalog (including, for the first time, Routing
V2's shared modules actually extracted into the template layer), a real
fresh-contractor provisioning proof, and a precise account of which parts of
"materials → pricing → approval → activation → manual price → native
booking" are proven versus still open. Blocker 11 (materialCostResolved has
no supported path for a policy-quantity-only service) is the SAME gap in
both documents — confirmed again there against a genuinely fresh install,
with a real, named refusal code, not just reasoned about.

**REVISED a third time after review.** The second revision fixed three
mistakes (missing Routing V2 scope; a wrong deletion-capability
conclusion; a wrong `bookingType` claim) but two of its own conclusions
were themselves imprecise, and one framing was wrong. Fixed here:

1. **Ceiling light/fan's "final" route was wrong.** §1 previously said
   `existing_light_source`'s "No" answer resolves to `{routeAction:
   RESOLVE_INSTANT}`. That is only the intermediate state `prisma/seed-
   questions.ts`'s own commit (`cb8821a8`) leaves behind — a LATER seed
   step, `seed-lighting-control.ts`'s shared `rewireTerminalsInto`
   (`prisma/_moduleHelpers.ts:95-135`), runs afterward and converts every
   `RESOLVE_INSTANT`/`RESOLVE_ADJUSTED` terminal answer on this service
   into `{routeAction: CONTINUE, nextQuestionId: <lighting_control's
   question>}`. The real final, fully-composed route CONTINUES into the
   `lighting_control` module — it does not resolve instantly and skip it.
   Documented precisely in §1a below.
2. **Replacement outlet's target was stated too vaguely.** §1 previously
   said the fix "drops the `nextQuestionId` link" — true but incomplete:
   `seedDeviceModule`'s own `proceed` logic (`prisma/seed-device-and-
   finish-modules.ts`) computes an EXPLICIT combined target — either
   `{routeAction: CONTINUE, nextQuestionId: <next surviving question>}`
   if one exists, or `{routeAction: RESOLVE_INSTANT, nextQuestionId:
   null}` if none does — never an ambiguous "field cleared" state. For
   `replace-standard-outlet` specifically, confirmed by reading its own
   question list, `outlet_condition` was its only OTHER question, so the
   explicit target IS `RESOLVE_INSTANT` — the earlier NUMBER was right,
   the description of HOW it's determined was not. Documented precisely
   in §1a below.
3. **Routing V2 is integrated into THIS branch, not already in `main`.**
   §3 previously filed its shared modules as "pre-existing, already-
   merged... in the same category as `v2`/`v3`," separately tracked and
   out of this release's scope. That is wrong: `main` does not have
   Routing V2 at all — this branch is what brings it in for the first
   time. Its shared physical-route modules (reroute-handoff, fractional
   measurement, the uncertainty sentinel) are genuinely part of THIS
   release's scope, not a separately-tracked, already-shipped bucket the
   way `v2`/`v3` correctly are. §3 and the blocker list/first-batch
   sections are corrected accordingly.

The full Electrical catalog inventory (§4) is unchanged and remains
complete, and "no template version exists for these fixes" remains
stated as what THIS BRANCH's own git history shows — never a claim about
current production state, which this document has no way to check.

**Routing-correction discussion closed; one further mapping added
(§3a).** The routing corrections above are accepted. The remaining task
was narrowly scoped: map Routing V2's own required fields to what
`scripts/template-update.ts` actually supports. Confirmed directly in the
tool's own types: a question's numeric settings
(`numberAllowsDecimal`/`numberMin`/`numberMax`) are carried when a
question is added fresh, but `AdoptedQuestionProjection` — the entire
type the tool uses to detect and adopt a change to a question that
already exists — is `{ prompt: string }` alone. Updating an EXISTING
question to accept fractional footage is therefore invisible to
`--status` and has no adoption path today, a real, narrow gap distinct
from both the missing zero-question capability (§1, garage outlet) and
the missing materials/disclaimer/photo/policy support (§6). Routing V2's
own routing fields (routeAction, reroute keys, option numeric bounds,
canonical components) remain fully supported on both add and revise, the
same already-rehearsed path as the six audit fixes.

**Documentation step complete and accepted. The five-service local
adoption rehearsal (§1b) is done, and its evidence gaps have since been
corrected twice (16 Sep 2026, two passes).** All five services in the
batch (ceiling light/fan, replacement outlet, dedicated circuit,
dishwasher — the four audit fixes that reduce to
`option-revised`/`wording-changed`) were rehearsed end-to-end against the
CURRENT, unmodified `scripts/template-update.ts` — real BEFORE/TARGET
`TemplateVersion`s composed by running this repo's own real seed code
inside two uniquely-named, no-pre-drop disposable scratch databases, an
uncustomized throwaway contractor that adopts ALL EIGHT real per-unit
operations and is compared against target completely (not a subset), a
real pricing-resolver proof that the switch-leg work is now charged
exactly once, a genuine structural conflict on a SEPARATE contractor
refusing cleanly while that contractor's own real, never-re-approved
partial progress is confirmed to stay unapproved, a no-op rerun, and an
unrelated tenant snapshotted before any adoption and confirmed unaffected.
602/602 checks passed; `npx tsc --noEmit` clean; the local disposable
databases confirmed back to their exact baseline afterward; a deliberately
injected setup failure confirmed cleanup leaves no owned artifacts behind.
No adoption-tool code was touched. Whether a real contractor has any
supported path to reapprove pricing after adopting is separately tracked
as unproven and blocked (§7 Blocker 11) — not established by this
rehearsal and not silently assumed. See §1b for the full result and its
disclosed, documented simplifications.

## 1. PR #63's own tree/data changes — corrected, with the actual adoption operation each one needs

Found by reading the actual seed-file commits and diffs, and by tracing
what `scripts/template-update.ts`'s `detect()`/`--adopt` would actually
need to do to carry each change onto a DIFFERENT, already-provisioned
contractor's tree — not by inferring from "a question was removed" alone.

**On Elite's own catalog, these fixes are authored directly** by seed
scripts that write straight to Elite's live rows (`prisma/_serviceKey.ts`
resolves `eliteContractorId` explicitly) — a mechanism with nothing to do
with `template-update.ts`. That authoring mechanism either wipes and
rebuilds the whole service tree (`clearServiceTree`/`clearTree`, used by
ceiling light/fan, soundbar, dedicated circuit, and garage outlet) or
targets one legacy question for a real, literal delete
(`SUPERSEDED_KEYS`, used by replacement outlet). **Both are real deletes,
but both are how Elite's OWN catalog gets authored, not a description of
what an adoption action for a different contractor needs to do.**

| Fix | Elite's own seed mechanism | What survives on an ADOPTING contractor's tree | The final, fully-composed adoption operation | Tool support today |
|---|---|---|---|---|
| Ceiling light/fan (`new-ceiling-light`, `new-ceiling-fan`) | `clearServiceTree` wipe; `switched_source` not recreated | The bypassed question's row, if present, is left in place, unreferenced | A single `option-revised` per service: `existing_light_source`'s "No" answer, `{routeAction: CONTINUE, nextQuestionId: switched_source}` → `{routeAction: CONTINUE, nextQuestionId: lighting_control}` — see §1a. NOT a resolve; it continues into the shared control module. | **Already supported** |
| Replacement outlet (`replace-standard-outlet`) | `SUPERSEDED_KEYS` targeted delete of `outlet_condition` | Same — left in place if present | A single `option-revised` on `device_replacement_reason`'s three continuing answers, to the EXPLICIT combined target `{routeAction: RESOLVE_INSTANT, nextQuestionId: null}` — computed by `seedDeviceModule`'s own `proceed` logic, not an ambiguous "cleared" field. See §1a. | **Already supported** |
| Dedicated circuit (`dedicated-120v-circuit-outlet`) | `clearServiceTree` wipe; `dedicated_panel_location` not recreated | Same | A single `option-revised` on `dedicated_distance`'s continuing answers: `{routeAction: CONTINUE, nextQuestionId: dedicated_panel_location}` → `{routeAction: CONTINUE, nextQuestionId: <finish-acknowledgement question>}` | **Already supported** |
| Soundbar (`soundbar-installation`) | `clearTree` wipe; `soundbar_cable`/`soundbar_conceal` not recreated | Same | The routing half is a single `option-revised` on `soundbar_power`'s "Yes" answer: `{routeAction: CONTINUE, nextQuestionId: soundbar_cable}` → `{routeAction: RESOLVE_INSTANT, nextQuestionId: null}` — confirmed no downstream module exists for this service (unlike ceiling light/fan), so RESOLVE_INSTANT genuinely is the real final state, not an intermediate one. It ALSO gains `disclaimer: CUSTOMER_SUPPLIED` on that same option, and `AdoptedOptionProjection` has no disclaimer field at all | **Routing: supported. Disclaimer: not supported — a real, separate gap, unrelated to question deletion.** |
| Dishwasher (`dishwasher-electrical`) | none — wording only | n/a | A `wording-changed` on the question's prompt | **Already supported** |
| Garage outlet (`240v-garage-outlet`) | `clearServiceTree` wipe, TWICE (`d841fdfc` added one question, `79329f74` removed it again); nothing recreated either time | An adopting contractor's own existing question(s) for this service would need to be REMOVED entirely — there is no surviving option to revise, because the whole tree goes to zero | **Not expressible as any existing `Change` kind — and not the same shape as the other four.** This needs a narrow, specific capability ("this service now has zero questions"), not a general destructive-delete kind. |

### 1a. The final, fully-composed routes for the two corrected cases

**Ceiling light/fan.** `existing_light_source`'s BOTH answers are terminal
before this fix: "Yes" was already `RESOLVE_INSTANT`; "No" was `CONTINUE`
→ `switched_source` (its own flat-fee question). `seed-lighting-
control.ts`'s `rewireTerminalsInto` (`prisma/_moduleHelpers.ts:95-135`)
runs LATER in provisioning order and rewrites EVERY
`RESOLVE_INSTANT`/`RESOLVE_ADJUSTED` terminal answer on the service to
`{routeAction: CONTINUE, nextQuestionId: <lighting_control question id>}`
— so BEFORE this fix, "Yes" already continued into `lighting_control`,
while "No" first passed through `switched_source` (charging its own flat
fee) whose OWN answers were then ALSO rewired into `lighting_control`
(charging the identical switch-leg work again through canonical
components — the double-charge this fix closes). AFTER this fix,
`switched_source` no longer exists, so "No" — like "Yes" already did — is
picked up directly by `rewireTerminalsInto` and continues straight into
`lighting_control` (question key `lighting_control`,
`prisma/seed-lighting-control.ts:138`). **The real final route change is
`nextQuestionId` moving from `switched_source` to `lighting_control`,
`routeAction` staying `CONTINUE` throughout — not a resolve.** A single
`option-revised` per service (new-ceiling-light, new-ceiling-fan) carries
this correctly; `RESOLVE_INSTANT` was never the tool-relevant target.

**Replacement outlet.** `seedDeviceModule` (`prisma/seed-device-and-
finish-modules.ts`) computes `survivors` — every question on the service
except the shared `DEVICE_KEY` question and anything in `SUPERSEDED_KEYS`
— and then a `proceed` object applied to `device_replacement_reason`'s
three qualifying answers: `handoff = survivors[0]`; `proceed = handoff ?
{routeAction: CONTINUE, nextQuestionId: handoff.id} : {routeAction:
RESOLVE_INSTANT, nextQuestionId: null}`. `replace-standard-outlet`'s ONLY
other question was `outlet_condition` (confirmed by reading
`seedReplaceStandardOutlet` directly — it creates exactly one question).
Adding `outlet_condition` to `SUPERSEDED_KEYS` empties `survivors` for
this specific service, so `handoff` is `undefined` and `proceed` resolves
to the explicit `{routeAction: RESOLVE_INSTANT, nextQuestionId: null}` —
matching the commit's own description, "now resolves directly, matching
the other 8 structurally identical device-module services." **The
target value is correct; what needed correcting was describing it as an
explicit, deterministic combined-field state the shared module computes
per-service, not as "clearing a link" with an implicit or unstated
resulting `routeAction`.**

**Corrected conclusion, unchanged in substance but now resting on the
right routes: four of these six fixes need NO new capability in
`template-update.ts` at all** — they reduce to `option-revised`/
`wording-changed` writing an explicit, fully-determined target, which the
tool has supported and rehearsed (§0.28–§0.33) since before this manifest
existed. Soundbar needs its disclaimer gap closed specifically, not a
deletion capability. Only garage outlet is genuinely blocked by a missing
capability, and that capability is much narrower than "support removing a
question" — it is specifically "reduce an existing contractor's service
to zero questions while its `bookingType` (already `REMOTE_QUOTE` here)
does the rest," a shape none of the other five fixes share.

### 1b. LOCALLY DEMONSTRATED — five-service rehearsal against the CURRENT tool, no code changes

**Status: locally demonstrated on the disposable rehearsal database. This
proves the tool's SUPPORT for these five services' actual required
revisions; it does not establish live production readiness — no
production access was used, and reaching an actual existing contractor's
real catalog is a separate, later, explicitly-authorized step.**

**Corrected twice — 16 Sep 2026 (two passes, same day).** The first pass
(commit `e63528a`) hand-authored its BEFORE/TARGET fixtures and, on
review, was found to have gotten the real `lighting_control` module, the
real before/after composition of `new-ceiling-light`/`new-ceiling-fan`,
and its own graph/pricing evidence wrong in several independent ways: a
fictional `existing_switched_light` routing, an invented option the real
module does not have, no component bindings or pricing-resolver check at
all, a "field-by-field" comparison that was really a handful of
hand-picked assertions, an `isReachable` check that tested incoming edges
rather than real traversal, and an UNRELATED tenant provisioned AFTER
every adoption instead of before. The second pass (`f0c345a`) fixed all
of that by composing both fixtures from this repo's own real seed code,
but on further review had four remaining gaps: it entangled the
successful-batch proof with the conflict proof on one contractor (so
`dedicated_distance/25_to_50` was never actually adopted, and the full
target comparison silently excluded it); it called `approveService`
directly before testing the conflict refusal, so "partial service states
unapproved" was not actually demonstrated — the state was freshly
re-approved moments before; its scratch-database cleanup dropped FIXED
names with a pre-drop, which could destroy a database this run did not
create; and its comparison covered only routing/component fields, not
labels, photos, disclaimers, material links, or a genuine order check.
This third pass fixes all four; none of the six real audit-fix commits or
`scripts/template-update.ts` changed at any point.

Checked in as `scripts/verify-audit-batch-adoption.ts` (602/602 checks,
`npx tsc --noEmit` clean across the repo). Both `TemplateVersion`s are
built by running this repo's own, real, unmodified seed functions —
`seedNewCeilingLight`/`seedNewCeilingFan`/`seedDeviceModule`/
`seedDedicatedCircuit`/`seedApplianceElectrical`, plus the full
`prisma/seed-lighting-control.ts`, `prisma/seed-access-normalization.ts`
and `prisma/seed-fixture-finish-ack.ts` modules — inside two brand-new,
disposable local Postgres databases, named uniquely per run and created
with no pre-drop, that this run creates and destroys itself, never
against Elite's own rows in the shared rehearsal database. The BEFORE
fixture's four differences from current HEAD are reverted on top of that
real output using field values copied VERBATIM from `cb8821a8` and
`d841fdfc`'s own diff hunks (never reconstructed from memory).
`prisma/seed-conditional-disclaimers.ts` is also attempted, in authoring
order, since its own ATTACHMENTS/EXTERIOR_WALL_SERVICES tables name three
of these five services directly — but its content is confirmed NOT
included in either fixture: the run's own captured output shows it
failing with the same pre-existing `CanonicalDisclaimer` gap already
documented in `docs/design/electrical-decision-tree-audit-v1-rehearsal-
bootstrap.md`'s "Known, expected failure" section (there is no path in
this codebase to create a `CanonicalDisclaimer` row from nothing on a
from-scratch database — `prisma/backfill-disclaimer-split-2026-08-27.ts`'s
own `legacy` query has been hardcoded to `[]` since 28 Aug 2026). None of
the three affected attachments carry routing, pricing, or components, so
this does not affect the resolver, adoption-set, or reachability proofs —
only the disclaimer-key comparison, which correctly shows empty sets on
both sides rather than silently skipping the field. Both fixtures are
extracted per-service with the real `scripts/extract-template-service.ts`
and migrated — by canonical KEY, never by raw id — into one combined
`TemplateVersion` each (v500 BEFORE, v501 TARGET) in the shared rehearsal
database, where **three separate throwaway contractors** are provisioned
and exercised through REAL `--status`/`--adopt` calls. Confirmed for
real, not merely reasoned about:

- The exact, COMPLETE typed `--status` change set (every kind — question-
  added/option-added/baseline-missing included, never filtered out before
  the "exact" assertion) is 8 real per-unit operations on an
  **uncustomized** adopter: `existing_light_source/no` on both ceiling
  services; `device_replacement_reason/{works_upgrading,intermittent,
  damaged}` on replacement outlet; `dedicated_distance/{under_25,
  25_to_50}` on dedicated circuit; the `appliance_power_present` wording
  change on dishwasher. `existing_light_source/yes` is confirmed NOT a
  change on either ceiling service.
- **All eight are adopted on this same uncustomized adopter** — including
  `dedicated_distance/25_to_50`, which the prior pass never actually
  adopted. The full target comparison and the reachability proof below
  both cover every one of the eight with nothing excluded.
- **Real pricing resolver proof, not a structural inference**:
  `lib/routeResolver.ts`'s actual `resolveRoute` — the same function
  `/api/visit` charges from — priced the identical answer path at
  **$920.00 before** adopting `existing_light_source/no` and **$695.00
  after** — a **$225.00** reduction, exactly the flat `switched_source/no`
  fee the fix removes. `SWITCH_POWER_RUN_ACCESSIBLE` ($320) contributes
  identically both times; only the double-counted flat fee drops out.
- **Complete, expanded comparison against TARGET** for all five services:
  every question TARGET declares (prompt, helpText, inputType, numeric-
  route fields, and relative ORDER among target's own questions — compared
  by rank, not raw magnitude, since a retained historical question with no
  target counterpart correctly shifts every later raw order number without
  changing any real question's relative position) and every option under
  it (routing, numeric bounds, capability gate, canonical components,
  label, `labelPattern`, required photos, `photosBlockBooking`,
  illustration URLs, material links, and disclaimer keys, each resolved by
  canonical key and sorted before comparing) — not a curated subset.
- Real graph traversal (this repo's own `findUnreachableQuestions`, reused
  rather than reimplemented) confirms `switched_source` (both ceiling
  services), `outlet_condition` (replacement outlet), AND, now that both
  its real changes are adopted, `dedicated_panel_location` (dedicated
  circuit) are all genuinely UNREACHABLE from the tree's real entry after
  the full batch.
- Every row's own id (every question and option, adopted, untouched, and
  retained/orphaned alike, across all five services) is snapshotted before
  the batch and confirmed IDENTICAL after — proof that adoption updates
  rows in place and never deletes-and-recreates one, order-independent
  (the snapshot comparison sorts object keys before comparing, closing a
  real bug this pass found in its own first attempt at this check).
- Component and price-modifier economics this run entered are re-verified
  unchanged after the full batch — adoption does not collaterally disturb
  pricing data it never touched.
- Pricing invalidation (`materialCostResolved`/`publishedPriceApprovedAt`/
  `basePrice` all reset) is checked after EACH individual `--adopt` call
  in every multi-change service — three checks on replacement outlet,
  two on dedicated circuit — never once after a whole batch.
- Repeating an already-landed adoption (`existing_light_source/no`, a
  second time) is a true no-op: `"no change matched"`, full service
  snapshot byte-identical before and after.
- A second, completely unrelated throwaway tenant is provisioned and its
  full state snapshotted BEFORE any `--adopt` call runs against the first,
  then re-snapshotted at the end and confirmed byte-identical.
- **Conflict protection, on a THIRD, separate, single-purpose throwaway
  contractor never touched by the successful batch above** — proving two
  distinct things honestly, not conflating them: (1) a real structural
  customization (a component attached directly to
  `dedicated_distance/25_to_50`, bypassing the tool, on an option this
  contractor never adopted) is reported as a CONFLICT and an `--adopt`
  attempt against it is SKIPPED, with the full affected service and the
  `TemplateAdoptionReceipt` count confirmed byte-identical before and
  after; and (2) this contractor's one real adopted change
  (`dedicated_distance/under_25`) was approved once, reset to unapproved
  by that adopt, and **never re-approved afterward** — so its unapproved
  state (`materialCostResolved`/`basePrice`/`publishedPriceApprovedAt`)
  is confirmed to survive the skipped conflict adopt untouched, which is
  what "real partial progress stays unapproved" actually means. This
  contractor's own `dedicated_panel_location` is confirmed to REMAIN
  reachable, since only one of its two real changes was ever adopted.
- Cleanup: every scratch database and the temporary seed file are named
  uniquely per run and created with no pre-drop; ownership of each is
  recorded the instant it is created, before anything else happens to it;
  the entire build/migrate/adopt sequence runs inside one try block whose
  cleanup acts only on resources recorded as owned, continuing past any
  individual failure and surfacing every one at the end rather than
  swallowing it. A deliberately injected setup failure was run once during
  this pass's own development to confirm cleanup leaves no owned artifacts
  and touches nothing pre-existing — confirmed directly, not assumed.
  Cleanup also captures the actual pre-run `TemplateVersion`/`Contractor`
  sets and confirms the exact same sets are restored afterward, not a bare
  count.

**Disclosed simplifications** (documented at their own call sites in the
verifier's file, not hidden): `materialCostResolved` is set directly for
every service this rehearsal prices or adopts, rather than walked through
the real material-onboarding flow. **Whether a real contractor has ANY
supported path to reapprove pricing after adopting one of these five
services is UNPROVEN by this run and BLOCKED pending a focused check of
that actual lifecycle** — see Blocker 11 in §7; this is recorded as open,
not silently fixed and not declared irrelevant. What IS established:
`lib/materialCost.ts`'s own `recomputeServiceMaterialCost` provably cannot
flip `materialCostResolved` back to `true` for a service whose only
materials are policy-quantity allowances — `requiredRolesFor()` excludes
them entirely, so a service with zero structural materials is "ready"
with nothing to resolve and the function returns early without writing.
The flat `switched_source` price modifiers and every `ContractorComponent`
economic figure this run enters directly use Elite's own real canonical
figures (the same numbers `prisma/seed-lighting-control.ts`/
`prisma/seed-dedicated-circuit.ts` already define) — templates never carry
economics by design (`extract-template-service.ts` drops
`priceModifierCents` explicitly), so a real contractor would enter these
themselves during onboarding; nothing here is a reimplementation of
pricing — every price reported is computed by the real `resolveRoute`.
**No code, deletion tooling, or production access was used or is required
by this rehearsal — it exercises `scripts/template-update.ts` exactly as
committed.**

## 2. Garage outlet: the `bookingType` correction

`79329f74`'s entire change to this service is:
```ts
const garage240 = await prisma.service.findUniqueOrThrow({ where: await serviceSlugKey(prisma, "240v-garage-outlet") });
await clearServiceTree(garage240.id);
```
No `prisma.service.update(...)` touching `bookingType` appears anywhere in
this commit. `bookingType: "REMOTE_QUOTE"` for this service was already
set in the base catalog seed (`prisma/seed.ts`), unrelated to either
garage commit — the fix relies on that pre-existing value, it does not
set it. "Clears questions" means exactly what it says: the tree goes from
one real question (`d841fdfc`'s `garage_type`) to zero, and
`GuidedFlowEngine`'s own generic zero-question `REMOTE_QUOTE` handling —
not any service-specific code — is what sends the customer straight to
photo review from there.

## 3. Routing V2's own scope — genuinely part of this release, not a separately-tracked bucket

**Correction: `main` does not have Routing V2 at all.** This branch —
via the merged `PR #62` (fractional footage/takeoff) and
`feat/electrical-routing-v2`/`audit/electrical-tree-finalization-v2`
lines — is what brings Routing V2 into existence for the first time.
Unlike `v2`/`v3` (§6, real `TemplateVersion` deltas already published to
production before this branch existed), Routing V2's shared modules have
never shipped anywhere; they exist only in this branch's own code right
now. That makes them part of THIS release's actual scope determination,
not a separate, already-shipped concern to file alongside `v2`/`v3`. Three
components, distinct from the six audit fixes (§1) but real content this
branch's own merge carries:

- **A shared reroute-handoff module** (`lib/rerouteHandoff.ts`, added in
  commit `4b6c341b`) — one serialize/consume shape now used by both
  `RerouteNotice` (`REROUTE_SERVICE`) and `GuidedFlowEngine`'s
  troubleshooting branch (`REROUTE_TROUBLESHOOTING`), replacing what used
  to be separate inline JSON handling in each. Used broadly: every
  service with a `REROUTE_SERVICE`/`REROUTE_TROUBLESHOOTING` answer
  option depends on it, including the ~13 device-module services built by
  `seed-device-and-finish-modules.ts`. `electrical-troubleshooting` itself
  is the direct subject of this fix.
- **Fractional route-footage support** — the derived-pricing takeoff
  adapter now preserves a fractional footage value instead of truncating
  it to zero (`docs/design/routing-v2-manual-tree-finalization.md`).
  Scoped to `new-120v-outlet` and its Routing V2 pilot sibling
  `surface-mounted-outlet` — the only services with Routing V2 numeric
  routing at all.
- **A systematic uncertainty sentinel** (`NUMERIC_UNKNOWN = "__unknown__"`,
  `lib/numericRouteRanges.ts`) — an explicit, unbounded review answer for
  a measured/count question, engine-enforced rather than authored per
  service. Same scope as fractional support: `new-120v-outlet`/
  `surface-mounted-outlet` only, since that's the only tree with Routing
  V2 numeric questions today. (An unrelated, much older, hand-authored
  `"unsure"` → `PHOTO_REVIEW` option exists independently in 23 other
  seed files across this catalog's history — a long-standing house
  convention, not this mechanism, and not new to this branch.)

**`surface-mounted-outlet` and the four `rv2-fixture-*` services are
explicitly inactive, unpriced scaffolding** (per their own seed files'
docstrings — "created inactive and unpriced," "scaffolding for the
verifiers") — not live, bookable services. They exercise Routing V2's
mechanics but are not part of what a real contractor's customers ever
see, and do not belong in the "needs rollout" conversation the same way a
live service does.

This scope is tracked here because it is real, was missing from the
prior draft, and — unlike `v2`/`v3` (§6) — has not already shipped
anywhere: it is part of what THIS release actually delivers. §10.2 in the
main reconciliation report already documents the MECHANISM for rolling
Routing V2 out (the adoption sequence, the rollback plan); it does not
by itself answer which specific services/trees are ready now, which is
this manifest's own job. That determination for Routing V2's shared
modules specifically is carried into the blocker list (§7) rather than
resolved here, since it is a different question from the six audit
fixes' own adoption-operation analysis in §1.

### 3a. Routing V2's required fields, mapped to what adoption actually supports

Confirmed by reading `scripts/template-update.ts`'s own types and write
paths directly (`AdoptedOptionProjection`/`AdoptedQuestionProjection`,
lines 218-227; the `question-added` write, lines 578-597).

| Routing V2 mechanism | Field(s) it needs | Carried when ADDING a new question/option | Carried when REVISING an existing one |
|---|---|---|---|
| Fractional route-footage support | `Question.numberAllowsDecimal`, `numberMin`, `numberMax` | **Yes** — `question-added`'s write explicitly includes all three (`numberAllowsDecimal: tq.numberAllowsDecimal, numberMin: tq.numberMin, numberMax: tq.numberMax`) | **No.** `AdoptedQuestionProjection` — the ENTIRE type `detect()`/`wording-changed` uses for an existing question, for both comparison and the stored receipt — is `{ prompt: string }`. No numeric field is compared, detected, or written for a question that already exists on the contractor's tree. **This is the confirmed distinction**: a template change that turns on `numberAllowsDecimal` for a question a contractor already has (rather than one being added fresh) is completely invisible to `--status` and has no adoption path at all today — a narrower, separate gap from the missing `question-removed`/zero-question capability already named in §1, and specific to Routing V2's own numeric-question needs. |
| Reroute-handoff module | `AnswerOption.routeAction` (`REROUTE_SERVICE`/`REROUTE_TROUBLESHOOTING`), `rerouteServiceKey` | Yes | **Yes** — both are already part of `AdoptedOptionProjection` and have been the tool's most-rehearsed path (§0.28–§0.33). The module itself adds no new schema field; it changes how a REROUTE answer's payload is serialized at REQUEST time, not what `template-update.ts` needs to carry. **No gap.** |
| Uncertainty sentinel (`__unknown__`) | An ordinary `AnswerOption` (`value: "__unknown__"`, `routeAction: "PHOTO_REVIEW"`, `photosBlockBooking: true`, no numeric bounds of its own — `lib/numericRouteRanges.ts:74-75`) | **Yes, if added as a genuinely new option** — `option-added`'s write includes `photosBlockBooking` (`resolveOptionLinks`, line 372) | **Not applicable as a revision** — this is a brand-new answer VALUE on a question, which is always `option-added`, never `option-revised` (there is no "rename this option's value" operation either). One real, narrower note found in the same pass: `photosBlockBooking` itself — needed to keep an existing PHOTO_REVIEW option's booking-gate behavior correct — is present in `TemplateOption` but is NOT part of `AdoptedOptionProjection`, so it is one more field, alongside the question-level numeric settings, that `option-revised` cannot detect or write if it ever needed to change on an option that already exists. |

**Net finding for Routing V2 specifically: its ROUTING fields (routeAction,
reroute keys, numeric option bounds, canonical components) are fully
carried on both add and revise, the same well-rehearsed path as the six
audit fixes (§1). Its QUESTION-LEVEL numeric settings
(`numberAllowsDecimal`/`numberMin`/`numberMax`) are carried only when a
question is newly added, never when an existing one is revised — a real,
narrow, separate capability gap, distinct from both the missing
`question-removed`/zero-question kind (§1, garage outlet) and the
missing materials/disclaimer/photo-group/policy support (§6, the
pre-existing `v2`/`v3` content).** Whether this gap actually blocks
anything in THIS release depends on whether Routing V2's fractional
support needs to reach an already-adopted contractor's EXISTING numeric
question, versus only ever applying to numeric questions added fresh —
this manifest has not traced that specific case and does not assert
either way.

## 4. Full Electrical catalog inventory

75 confirmed real services (66 from `prisma/seed.ts`'s `CATALOG` array,
plus real services added by `prisma/seed-240v-garage-outlet.ts`,
`prisma/seed-appliance-services.ts`, and `prisma/seed-low-voltage-and-
sconces.ts`, plus one from a dated one-off migration predating this
branch), plus 7 explicitly inactive/scaffolding rows not part of the live
public catalog. Tag: **(a)** one of the six audit fixes (§1) · **(b)**
Routing V2 / shared-module / fractional / uncertainty scope (§3) · **(c)**
untouched by this branch's own scoped work.

| Category | Services |
|---|---|
| Outlets & Switches | replace-standard-outlet **(a)** · replace-gfci-outlet, replace-standard-switch, replace-3-way-switch, replace-led-dimmer, customer-supplied-smart-switch, usb-outlet-upgrade, smart-outlet-upgrade, occupancy-motion-switch, timer-switch-install (c) |
| New Outlets | new-120v-outlet **(b)** · dedicated-120v-circuit-outlet **(a)** · exterior-gfci-standard, exterior-gfci-other-routing, garage-door-opener-outlet, bidet-smart-toilet-outlet (c) |
| Lighting | new-ceiling-light **(a)** · replace-interior-light-fixture, replace-exterior-light-fixture, replace-motion-flood-light, recessed-lighting (its own, earlier, unrelated fix — not one of the six), under-cabinet-led-lighting, outdoor-landscape-lighting, new-exterior-lighting-locations (c) |
| Fans | new-ceiling-fan **(a)** · replace-ceiling-fan, fan-replacing-light, replace-bathroom-exhaust-fan, bathroom-fan-light-combo (c) |
| TV & Media | soundbar-installation **(a)** · tv-installation, tv-install-existing-location, elite-tilt-mount, elite-articulating-mount (c) |
| Appliance Installation | dishwasher-electrical **(a)** · otr-microwave-install, install-new-microwave, garbage-disposal-install, range-receptacle-replacement, dryer-receptacle-replacement, replace-range-hood (c) |
| Safety & Protection | hardwired-smoke-detector, smoke-co-detector, whole-house-surge-protection, home-electrical-safety-inspection (c) |
| Smart Home & Security | video-doorbell-existing-wiring, new-video-doorbell-wiring, floodlight-camera-existing, new-exterior-flood-camera, smart-thermostat-install, doorbell-transformer-replacement (c) |
| Panels & Troubleshooting | electrical-troubleshooting **(b)** · single-pole-breaker-replacement, double-pole-breaker-replacement, electrical-panel-replacement, 200a-service-upgrade (c) |
| EV & Garage | 240v-garage-outlet **(a)** · level-2-ev-charger, garage-door-opener-outlet-ev (c) |
| Dedicated Circuits | sump-pump-dedicated-circuit, freezer-fridge-dedicated-circuit, electric-fireplace-circuit, new-240v-appliance-circuit (c) |
| Generator/Backup Power | generator-inlet-interlock, transfer-switch (c) |
| Pool/Spa | hot-tub-spa-electrical, pool-equipment-electrical (c) |
| Additional real services | 240v-garage-outlet-14-30/-14-50/-6-50 (c — pre-existing `v3` material-catalog content, §6), new-coax-line, new-ethernet-line, new-wall-sconce, replace-wall-sconce (c), remove-and-replace-existing-chandelier (c — pre-existing, predates this branch) |
| Inactive scaffolding, not live | surface-mounted-outlet, surface-mounted-switch, surface-mounted-fixture-box, rv2-fixture-accessible-outlet, rv2-fixture-accessible-switch, rv2-fixture-back-to-back-outlet, rv2-fixture-finished-wall-outlet **(b, but never live/bookable)** |

Caveat carried over honestly: this count is confirmed complete against
the seed files that build the catalog; a number of other dated one-off
`backfill-*`/`migrate-*`/`cleanup-*`/`reconcile-*` scripts exist in
`prisma/` that were not individually audited for whether any also created
a catalog row — this table should be read as complete against the known
catalog-building seed files, not as an absolute guarantee against every
historical one-off script in the repo's history.

Every service with a `device_replacement_reason` question, or any
`REROUTE_SERVICE`/`REROUTE_TROUBLESHOOTING` answer, depends on the shared
reroute-handoff module (§3) at runtime — but is tagged **(c)** here, not
**(b)**, because its own tree was not itself edited by this branch.
"Depends on" and "touched by" are different claims; conflating them was
part of the first correction round's error and is avoided here.

## 5. Whether any of this reaches Elite's real, current catalog: still unverified

Same finding as the prior revision, restated precisely: `prisma/seed-
all.ts`'s orchestrated `STEPS` include the seed files for ceiling light/
fan, replacement outlet, garage outlet, and dedicated circuit — a fresh
`npm run db:seed:all` includes those four. `prisma/seed-appliance-
services.ts` (soundbar, dishwasher) is not wired into `seed-all.ts` at
all. **None of this describes Elite's actual current production state.**
Elite is a real, live contractor; re-running a seed script against a live
tenant is not how this codebase reconciles an existing contractor's data,
and this document has no production access to check what Elite's catalog
currently contains.

Separately: this branch's OWN git history shows no evidence — no
`prisma/template/*.json` provenance record, no commit, no script run
referencing any of the six fixes' service/question keys — of any of them
ever being extracted into a real `TemplateVersion` via `extract-template-
service.ts`. This is a statement about what this branch's history shows,
**not** a claim about current production state, which could have changed
by a means invisible to this repository.

## 6. Pre-existing material-catalog content — still not this release's task

Unchanged from the prior revision: `v2` (`new-120v-outlet`, a Routing V2
revision) and `v3` (six Material Catalog Phase 1C services) are real
`TemplateVersion` deltas, published before this branch existed in git,
unrelated to its own commits. `template-update.ts` cannot detect or write
materials, disclaimers, photo groups, or policy-banded label patterns,
and `v3`'s entire content is exactly that kind of change. Confirmed
overlap: `240v-garage-outlet` carries both this branch's own zero-
question fix (§1) AND `v3`'s materials/policy content — two independent
edits from two different sources needing a sequencing decision neither
this document nor the adoption tool makes automatically. This remains
real and worth recording, and remains historical content this branch did
not create and is not responsible for shipping.

## 7. Ordered blocker list

1. **None of the six audit fixes (§1) have a real `TemplateVersion` delta
   to adopt from yet**, per this branch's own history (§5). This blocks
   all six regardless of tool capability. **Narrowed by §1b for four of
   the six** (ceiling light/fan, replacement outlet, dedicated circuit,
   dishwasher): the ADOPTION OPERATION ITSELF is now locally demonstrated
   against the current, unmodified tool, including a real pricing-resolver
   proof of the switch-leg fix specifically (602/602 checks, all eight real
   per-unit operations adopted and fully compared against target,
   `scripts/verify-audit-batch-adoption.ts`) — what remains is purely
   getting a real delta extracted, not any further tool-support question.
   Soundbar (its disclaimer field) and garage outlet (Blocker 2) are
   unaffected by this narrowing.
2. **Garage outlet needs a narrow, specific "reduce to zero questions"
   adoption capability that does not exist today** — genuinely distinct
   from the other five fixes, which need no new capability at all (§1).
3. **Soundbar's new disclaimer field is untracked** by
   `AdoptedOptionProjection` — a real, separate, already-correctly-scoped
   gap, unrelated to question deletion.
4. **Whether Elite's real catalog already reflects any of these six
   fixes is unverified** (§5) — this determines whether "adopt" even
   means anything for a given service versus it already having happened
   by some other means.
5. **`240v-garage-outlet` carries two independent pending changes** from
   two different sources (§6) needing an explicit sequencing decision.
6. **`extract-template-service.ts` still has no production-write guard**
   (§10.2 item 3 of the reconciliation report, unchanged) — blocks safely
   creating the `TemplateVersion` deltas Blocker 1 says don't exist yet.
7. **Routing V2's shared modules (§3) are part of this release but their
   own rollout readiness has not been separately assessed here** — §10.2
   gives the adoption MECHANISM; whether the reroute-handoff module,
   fractional measurement support, and the uncertainty sentinel are
   themselves ready to ship (versus needing their own review) is a real,
   open question this manifest names but does not resolve, and should not
   be assumed answered by the six audit fixes' own analysis in §1.
8. **A question's numeric settings (`numberAllowsDecimal`/`numberMin`/
   `numberMax`) are carried when the question is added fresh, but cannot
   be detected or written for a question that already exists** (§3a) —
   confirmed directly in `AdoptedQuestionProjection`'s own type (`{
   prompt: string }`, nothing else). Distinct from Blocker 2 (garage
   outlet's whole-tree removal) and from §6's materials/disclaimer/photo/
   policy gap — this one is specific to Routing V2's own fractional-
   measurement work reaching a question a contractor already has, rather
   than one added new. A related, smaller note found in the same pass:
   `photosBlockBooking` is tracked on add but not on revise either.
9. **BrightPath's own state relative to any of this is unconfirmed.**
10. **Standing items carried forward, not closed here:** session-migration
    note/dependent/new-group-member safety and the legacy-writer cutover;
    full storefront/browser rehearsal beyond `new-120v-outlet`'s surface-
    mounted path (§7 item 3 of the reconciliation report).
11. **Whether a real contractor has any supported path to reapprove
    pricing after adopting one of these five services is UNPROVEN and
    BLOCKED.** §1b's rehearsal forces `materialCostResolved` directly
    because the real gate — `lib/materialCost.ts`'s
    `recomputeServiceMaterialCost` — provably cannot flip it back to
    `true` for a service whose only materials are policy-quantity
    allowances (`requiredRolesFor()` excludes them entirely, so a service
    with zero structural materials is "ready" with nothing to resolve and
    the function returns early without writing). This is a real,
    separate gap in the material-onboarding lifecycle, not part of any of
    the six audit-fix commits and not fixed or worked around here — a
    focused check of the actual supported reapproval lifecycle is needed
    before claiming a real contractor can adopt one of these five changes
    and get back to a bookable price through any supported path.

## 8. Recommended first rollout batch

**Four of the six audit fixes need no new tool capability at all** —
ceiling light/fan, replacement outlet, dedicated circuit, and dishwasher
all reduce to `option-revised`/`wording-changed`, already supported and
already the most heavily-rehearsed path in this whole reconciliation
(§0.28–§0.33) — **and, per §1b, now locally demonstrated end-to-end
against the real, unmodified tool: a real BEFORE/TARGET pair composed
from this repo's own real seed code, a real throwaway contractor that
adopts ALL EIGHT real per-unit operations and is compared against target
completely, a real pricing-resolver proof that the switch-leg work is now
charged exactly once ($920.00 -> $695.00, a real $225.00 reduction), a
genuine structural conflict on a separate contractor refusing cleanly
while that contractor's own real partial (never re-approved) progress is
confirmed to stay unapproved, a no-op rerun, and a completely unaffected
unrelated tenant snapshotted before any adoption (602/602 checks). This is
proof the OPERATION works, not proof it has reached any real contractor —
that gap is entirely about extraction, not tool support. It is also NOT
proof a real contractor has a supported path to reapprove pricing after
adopting — Blocker 11 keeps that open.** The concrete next steps, in
order:

1. **Confirm, with production access, whether Elite's live catalog
   already reflects any of these six fixes** — this document cannot do
   this step, and it determines whether the rest of this list means
   anything yet.
2. **Extract a real `TemplateVersion` delta for the four
   already-supported, now locally-demonstrated fixes** (ceiling light/fan
   — two services — replacement outlet, dedicated circuit, dishwasher)
   via `extract-template-service.ts`, once its missing production-write
   guard (Blocker 6) is addressed or an operator accepts that risk
   deliberately. This is the recommended first real batch, and — per §1b
   — it needs no new engineering in `template-update.ts` at all.
3. **Soundbar** can follow once its disclaimer field is either added to
   `AdoptedOptionProjection` or handled by a one-off reviewed script for
   that one field — its routing half is already batch-1-ready.
4. **Garage outlet** needs the narrow zero-question adoption capability
   (Blocker 2) built and rehearsed before it can be any batch at all —
   real, separate, follow-up engineering work, correctly scoped smaller
   than "support deleting questions" in general.
5. **The pre-existing `v2`/`v3` content (§6) is not part of this
   recommendation** — it is separate, already-shipped, and not this
   release's task. **Routing V2's own shared-module scope (§3) IS part of
   this release, but this manifest does not recommend a batch for it** —
   its own readiness (beyond the mechanism §10.2 already documents) needs
   its own assessment, not an assumption borrowed from the six audit
   fixes' unrelated analysis. Its own routing fields (routeAction, reroute
   keys, option numeric bounds) are fully supported on both add and
   revise (§3a); its question-level numeric settings are only supported
   on add, a real, narrow gap (§3a, Blocker 8) that needs its own decision
   before any existing-question fractional-measurement update could be
   adopted through this tool.

---

*Produced from this branch's own commits, diffs, and file contents. No
production database was queried or written to in producing this
document; every claim about current production state is explicitly
marked UNVERIFIED above.*
