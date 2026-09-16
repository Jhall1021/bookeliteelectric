# Electrical V1/V2 release manifest — PR #63

Documentation and planning only. No code changes accompany this document,
and no production access was used to produce it. Deployment stays
disabled.

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
   all six regardless of tool capability.
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
8. **BrightPath's own state relative to any of this is unconfirmed.**
9. **Standing items carried forward, not closed here:** session-migration
   note/dependent/new-group-member safety and the legacy-writer cutover;
   full storefront/browser rehearsal beyond `new-120v-outlet`'s surface-
   mounted path (§7 item 3 of the reconciliation report).

## 8. Recommended first rollout batch

**Four of the six audit fixes need no new tool capability at all** —
ceiling light/fan, replacement outlet, dedicated circuit, and dishwasher
all reduce to `option-revised`/`wording-changed`, already supported and
already the most heavily-rehearsed path in this whole reconciliation
(§0.28–§0.33). The concrete next steps, in order:

1. **Confirm, with production access, whether Elite's live catalog
   already reflects any of these six fixes** — this document cannot do
   this step, and it determines whether the rest of this list means
   anything yet.
2. **Extract a real `TemplateVersion` delta for the four
   already-supported fixes** (ceiling light/fan — two services —
   replacement outlet, dedicated circuit, dishwasher) via `extract-
   template-service.ts`, once its missing production-write guard (Blocker
   6) is addressed or an operator accepts that risk deliberately. This is
   the recommended first real batch, and it needs no new engineering in
   `template-update.ts` at all.
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
   fixes' unrelated analysis.

---

*Produced from this branch's own commits, diffs, and file contents. No
production database was queried or written to in producing this
document; every claim about current production state is explicitly
marked UNVERIFIED above.*
