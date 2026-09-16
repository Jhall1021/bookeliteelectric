# Electrical V1/V2 release manifest — PR #63

Documentation and planning only. No code changes accompany this document,
and no production access was used to produce it. Deployment stays
disabled.

**REVISED.** An earlier version of this document made two real mistakes,
corrected here: it treated the OLD `v2`/`v3` template-layer deltas —
published before this branch existed in git, unrelated to this branch's
own work — as if they were "this PR's intended changes," while omitting
the actual tree/data fixes this branch's own commits make; and it stated
conclusions about CURRENT production adoption state that this document
has no way to verify, drawn from a disposable-database rehearsal and an
already-dated provenance record. Both are fixed below: §1 now enumerates
this branch's OWN tree changes, separately from the pre-existing
material-catalog content in §5; every claim about production state is
either a direct quote from a checked-in, timestamped record or is
explicitly marked UNVERIFIED.

## 1. PR #63's own tree/data changes — the actual rollout content

Found by diffing this branch against `main` (merge-base
`3fbd2d5a74808fe11e0ca34f9567f8abb75b58a5`) and reading the actual seed-
file commits, not by re-deriving from either the OLD template deltas or
this branch's own tooling work. Six real service-tree fixes, all from the
audit-followthrough work (commit prefixes below are the actual commits
that made each change):

| Service | Key | Change (commit) | Kind |
|---|---|---|---|
| Ceiling light/fan | `new-ceiling-light`, `new-ceiling-fan` | Deleted the `switched_source` question (was a flat +$150/+$225 `RESOLVE_ADJUSTED`); `existing_light_source`'s "No" answer now routes `RESOLVE_INSTANT` directly instead of into that deleted question, so `seed-lighting-control.ts` no longer double-charges switch-leg work (`cb8821a8`) | Question deletion + routing change |
| Replacement outlet | `replace-standard-outlet` | Retired `outlet_condition`, a duplicate safety-triage question already covered by `device_replacement_reason` (`d841fdfc`) | Question deletion |
| Soundbar | `soundbar-installation` | Deleted `soundbar_cable` and `soundbar_conceal`; `soundbar_power`'s "Yes" answer changed from `CONTINUE` to `RESOLVE_INSTANT` and gained a `disclaimer: CUSTOMER_SUPPLIED` (`d841fdfc`) | Question deletion + routing change + a disclaimer addition |
| Dishwasher | `dishwasher-electrical` | Question reworded, from "Is there already suitable power at the dishwasher?" to "Is there a dishwasher there now that's plugged in or wired in?" — routing unchanged (`d841fdfc`) | Wording only |
| Dedicated circuit | `dedicated-120v-circuit-outlet` | Deleted `dedicated_panel_location` (six no-op options); `dedicated_distance`'s continuing answers now point directly at the finish-acknowledgement question (`d841fdfc`) | Question deletion + routing change |
| Garage outlet | `240v-garage-outlet` | First pass added a mandatory `garage_type` question (`d841fdfc`); corrected to delete the ENTIRE question tree, converting the service to a genuine zero-question `REMOTE_QUOTE` (`79329f74`) | Whole-tree deletion / booking-type shape change |

Two adjacent app/lib fixes touch troubleshooting routing and reroute-
handoff context (`9ec5e6f1`, `4b6c341b`) — no `Question`/`AnswerOption`
rows involved, not part of this table.

**These six are what "this PR's intended Electrical changes" actually
means.** Nothing else in this document should be read as part of that
scope.

## 2. Whether each fix already reaches a fresh install

`prisma/seed-all.ts`'s ordered `STEPS` list is what actually builds
Elite's live question/option trees (`prisma/seed.ts` itself only creates
Service/Category rows — its own comment says tree content is "entered
per-service as Phase 2/4 work").

- `prisma/seed-questions.ts` (ceiling light/fan, garage outlet),
  `prisma/seed-device-and-finish-modules.ts` (replacement outlet), and
  `prisma/seed-dedicated-circuit.ts` (dedicated circuit) **are all wired
  into `seed-all.ts`'s `STEPS`.** A fresh `npm run db:seed:all` already
  includes these four fixes.
- `prisma/seed-appliance-services.ts` (soundbar, dishwasher) **is not
  referenced anywhere in `seed-all.ts`** — its only other reference in the
  repo is `scripts/audit-price-writers.ts`. It is only run by invoking it
  directly. A fresh orchestrated seed does NOT include the soundbar/
  dishwasher fixes today.

**This tells us nothing about Elite's actual current production data.**
Elite is a real, live contractor — a seed script is not something you
re-run against a live tenant's database to apply a fix the way you would
for a fresh install. Whether ANY of these six fixes have reached Elite's
real, current catalog — by a seed re-run, a template-adoption action, a
direct data patch, or not at all — is **UNVERIFIED**. This document does
not know, and does not have production access to find out.

## 3. What `scripts/template-update.ts` can carry for each fix

This is the concrete, code-level answer to "what the adoption tooling
supports" — independent of whether these fixes have reached Elite yet.

`template-update.ts`'s `Change` union supports exactly four kinds:
`question-added`, `option-added`, `option-revised` (an option's routing/
numeric/component shape), and `wording-changed`. **There is no
`question-removed` kind at all** — a gap distinct from, and more
fundamental than, the previously-documented materials/disclaimer/photo-
group/policy gap (`scripts/template-update.ts:177-180`).

| Fix | Involves a question deletion? | Involves an untracked field (disclaimer/material/photo/policy)? | Carried by the tool today? |
|---|---|---|---|
| Ceiling light/fan | Yes | No | **No** — no way to express the deletion |
| Replacement outlet | Yes | No | **No** |
| Soundbar | Yes (two questions) | Yes — the new `disclaimer` on `soundbar_power`'s option | **No**, for both reasons independently |
| Dishwasher | No | No | **Yes, in principle** — a pure wording change is exactly what `wording-changed` supports |
| Dedicated circuit | Yes | No | **No** |
| Garage outlet | Yes (the whole tree) | No, but the change reshapes `bookingType`, not just a question | **No** — not expressible as any tracked `Change` kind |

Dishwasher is the only one of the six whose real content the adoption
tool can already carry. The other five are blocked by the missing
`question-removed` kind (and, for soundbar, the missing disclaimer field
too) — this is true regardless of whether the fix has already reached
Elite by some other means, because it describes what `--status`/`--adopt`
can detect and write, not what state any particular contractor is in.

Note also: even for dishwasher, going through `template-update.ts` at all
requires the wording fix to exist as a real `TemplateVersion` a
contractor can be diffed against — and no such version exists yet (see
§5). A wording change baked into a seed script is not the same thing as
a template delta an already-provisioned contractor can `--adopt`.

## 4. `240v-garage-outlet` carries two independent, unrelated pending changes

Confirmed overlap: `240v-garage-outlet` is touched both by this branch's
own garage-outlet fix (§1 — deletes its entire question tree, converts it
to `REMOTE_QUOTE`) AND by the older `v3` template delta (§5 — a
materials/policy-role assignment, unrelated to this branch's own work and
predating it). These are two different edits from two different sources
to the same live service. Sequencing which applies first, and whether the
second still makes sense once the first has landed, is a real decision
this document does not make — flagged here so it is not missed.

## 5. Existing material-catalog content — NOT new work, kept separate on purpose

The `v2`/`v3` `TemplateVersion` deltas documented in the previous
version of this manifest are real, but they are **pre-existing production
content, unrelated to this branch's own commits**, and do not belong in
§1's "intended changes" list. Restated here only so the missing-materials-
support finding stays recorded without implying it is this release's
engineering project:

- `v2` (DELTA) — `new-120v-outlet`, a Routing V2 revision.
- `v3` (DELTA) — six Material Catalog Phase 1C services
  (`new-video-doorbell-wiring`, `generator-inlet-interlock`,
  `240v-garage-outlet` and its three prong-count siblings).

`v3`'s own provenance record (`prisma/template/electrical-v3-
provenance.json`) states its `--apply` "ran against production before the
branch existed in git at all, let alone before review," and that, **as of
that record's own timestamp**, "zero contractor Service rows carry v3
provenance." Both of those are quotes from a dated, checked-in document —
**not a claim this manifest makes about current production state.**
Whether that remains true today is UNVERIFIED.

The tooling finding this content originally surfaced still stands and is
worth keeping on record: `template-update.ts` cannot detect or write
materials, disclaimers, photo groups, or policy-banded label patterns at
all, and `v3`'s entire six-service content is exactly that kind of
change. **This does not mean those six services are this release's next
engineering task** — they are historical content this branch did not
create and is not responsible for shipping. It means: if and when someone
decides to adopt `v3` onto an existing contractor, the same missing-
capability finding applies, and `--status` reporting nothing to adopt
would not mean nothing changed.

## 6. Ordered blocker list

1. **`template-update.ts` has no way to express a question deletion.**
   Blocks ceiling light/fan, replacement outlet, soundbar, dedicated
   circuit, and garage outlet — five of this release's six actual fixes —
   from moving through the adoption tool at all, independent of any other
   gap. This is new engineering work, not something this manifest
   resolves.
2. **Soundbar's new disclaimer field is separately untracked** by
   `AdoptedOptionProjection`, on top of its question-deletion problem.
3. **Garage outlet carries two independent pending changes** (§4) needing
   a sequencing decision neither this manifest nor the adoption tool makes
   for you.
4. **None of these six fixes exist as a real `TemplateVersion` yet.**
   Even dishwasher — the one fix the tool could carry in principle — has
   no template delta to diff a contractor against. `extract-template-
   service.ts` would need to run to create one, and it still has no
   production-write guard (§10.2 item 3 of the reconciliation report,
   unchanged).
5. **Whether any of these six fixes have reached Elite's real production
   catalog is unverified**, and a seed script being wired into
   `seed-all.ts` is evidence about a FRESH install, not about Elite's
   existing one. No production read was performed for this document.
6. **The pre-existing `v2`/`v3` adoption gap (§5) is real but is not this
   release's engineering task** — recorded so it isn't lost, not so it
   gets bundled into this rollout's scope by default.
7. **BrightPath's own state relative to any of this — the six new fixes
   or the older `v2`/`v3` content — is unconfirmed.** Needs its own
   explicit check before being assumed to match Elite's state, in either
   direction.
8. **Standing items carried forward, not closed by this document:**
   session-migration note/dependent/new-group-member safety and the
   legacy-writer cutover for `prisma/migrate-guided-flow-session-active-
   key.ts`; full storefront/browser rehearsal beyond `new-120v-outlet`'s
   surface-mounted path (§7 item 3 of the reconciliation report).

## 7. Recommended first rollout batch

**No service among this release's actual six fixes is adoption-tool-ready
today.** Five need a `question-removed` capability that does not exist;
the sixth (dishwasher) needs a real template delta to diff against, which
also does not exist yet.

The narrowest concrete next step, in order:

1. **Confirm, with production access, whether Elite's live catalog
   already reflects any of the six fixes** — this determines whether
   "rollout" even means anything for a given service, or whether it
   already happened by some other mechanism. This document cannot do
   this step.
2. **Dishwasher** is the one fix positioned to go through the normal
   template-adoption path once a delta exists for it — a `wording-
   changed` extraction and adopt, using exactly the mechanism this branch
   already rehearsed most heavily (§0.29-§0.33). Recommended as the
   actual first batch candidate, gated on step 1 confirming it hasn't
   already landed for Elite some other way.
3. **The other five fixes need `template-update.ts`'s `Change` union
   extended with a `question-removed` kind — and for soundbar, disclaimer
   support too — before any of them can be a rollout batch at all.** This
   is real, separate engineering work this manifest recommends but does
   not perform.
4. **The pre-existing `v2`/`v3` material-catalog content (§5) is not
   part of this recommendation** — whether and when to address its
   adoption is a separate decision from this release's own six fixes.

---

*Produced from this branch's own commits, diffs, and file contents. No
production database was queried or written to in producing this
document; every claim about current production state is explicitly
marked UNVERIFIED above.*
