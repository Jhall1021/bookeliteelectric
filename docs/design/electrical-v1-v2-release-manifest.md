# Electrical V1/V2 release manifest — PR #63

Documentation and planning only. No code changes accompany this document,
and no production access was used to produce it. Deployment stays
disabled.

**REVISED again after a second review round.** The prior version fixed
the first two mistakes (conflating pre-existing `v2`/`v3` template
content with this branch's own work; asserting unverifiable production
state) but introduced three more, corrected here:

1. It was missing Routing V2's own scope — the shared reroute-handoff
   module, fractional measurement support, and the systematic uncertainty
   sentinel — treating the six audit-fix families as the whole release.
2. It concluded "the adoption tool needs a destructive `question-removed`
   capability" from "the tool cannot express a question deletion" without
   checking what the ACTUAL required adoption operation is. Routing V2's
   real pattern is to preserve the bypassed question's row and reroute
   the surviving option around it — which turns out to already be
   `option-revised`, a kind the tool already supports, for four of the
   five deletion-shaped fixes. Only one (garage outlet) is genuinely
   different in shape.
3. It claimed the garage-outlet fix "changes `bookingType`." It does not
   — `bookingType: REMOTE_QUOTE` was already set in the base catalog seed,
   unrelated to either garage commit. The fix only clears the service's
   question tree to zero.

The full Electrical catalog inventory (§4) is now complete rather than
scoped only to the six audit fixes, and "no template version exists for
these fixes" is stated as what THIS BRANCH's own git history shows —
never as a claim about current production state, which this document has
no way to check.

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

| Fix | Elite's own seed mechanism | What survives on an ADOPTING contractor's tree | The adoption operation this actually is | Tool support today |
|---|---|---|---|---|
| Ceiling light/fan (`new-ceiling-light`, `new-ceiling-fan`) | `clearServiceTree` wipe; `switched_source` not recreated | The bypassed question's row, if it exists on that contractor's tree already, is simply left in place, unreferenced | A single `option-revised`: `existing_light_source`'s "No" answer, `{routeAction: CONTINUE, nextQuestionId: switched_source}` → `{routeAction: RESOLVE_INSTANT}` — one per service | **Already supported** |
| Replacement outlet (`replace-standard-outlet`) | `SUPERSEDED_KEYS` targeted delete of `outlet_condition` | Same — left in place if present | A single `option-revised` on `device_replacement_reason`'s three continuing answers, dropping the `nextQuestionId` link to the now-superseded question | **Already supported** |
| Dedicated circuit (`dedicated-120v-circuit-outlet`) | `clearServiceTree` wipe; `dedicated_panel_location` not recreated | Same | A single `option-revised` on `dedicated_distance`'s continuing answers: `nextQuestionId` changes to the finish-acknowledgement question directly; `routeAction` unchanged | **Already supported** |
| Soundbar (`soundbar-installation`) | `clearTree` wipe; `soundbar_cable`/`soundbar_conceal` not recreated | Same | The routing half is an `option-revised` on `soundbar_power`'s "Yes" answer (`CONTINUE`→`RESOLVE_INSTANT`) — supported. It ALSO gains a `disclaimer: CUSTOMER_SUPPLIED` on that same option, and `AdoptedOptionProjection` has no disclaimer field at all | **Routing: supported. Disclaimer: not supported — a real, separate gap, unrelated to question deletion.** |
| Dishwasher (`dishwasher-electrical`) | none — wording only | n/a | A `wording-changed` on the question's prompt | **Already supported** |
| Garage outlet (`240v-garage-outlet`) | `clearServiceTree` wipe, TWICE (`d841fdfc` added one question, `79329f74` removed it again); nothing recreated either time | An adopting contractor's own existing question(s) for this service would need to be REMOVED entirely — there is no surviving option to revise, because the whole tree goes to zero | **Not expressible as any existing `Change` kind — and not the same shape as the other four.** This needs a narrow, specific capability ("this service now has zero questions"), not a general destructive-delete kind. |

**Corrected conclusion: four of these six fixes need NO new capability in
`template-update.ts` at all** — they already reduce to `option-revised`/
`wording-changed`, which the tool has supported and rehearsed (§0.28–
§0.33) since before this manifest existed. Soundbar needs its disclaimer
gap closed specifically, not a deletion capability. Only garage outlet is
genuinely blocked by a missing capability, and that capability is much
narrower than "support removing a question" — it is specifically "reduce
an existing contractor's service to zero questions while its
`bookingType` (already `REMOTE_QUOTE` here) does the rest," a shape none
of the other five fixes share.

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

## 3. Routing V2's own scope — separate from the six audit fixes, but real, and part of what this branch ships

Three components, all already present in this branch's git history, all
coming from the separately-merged `PR #62` (fractional footage/takeoff)
and `feat/electrical-routing-v2`/`audit/electrical-tree-finalization-v2`
lines — not authored as part of the six audit fixes, but real content
this integration branch carries:

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

This scope is tracked here because it is real and was missing from the
prior draft, but it is **pre-existing, already-merged Routing V2 work**,
in the same category as the `v2`/`v3` material-catalog content in §6 —
not new audit-fix work this release introduces, and its own rollout
status is already covered by §10.2's adoption sequence in the main
reconciliation report.

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
7. **Routing V2's own scope (§3) rollout status is a separate, already-
   tracked question** — §10.2's adoption sequence in the main report,
   not newly introduced here, and not conflated with the six audit fixes.
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
5. **Routing V2's own scope (§3) and the pre-existing `v2`/`v3` content
   (§6) are not part of this recommendation** — both are separate,
   already-tracked decisions.

---

*Produced from this branch's own commits, diffs, and file contents. No
production database was queried or written to in producing this
document; every claim about current production state is explicitly
marked UNVERIFIED above.*
