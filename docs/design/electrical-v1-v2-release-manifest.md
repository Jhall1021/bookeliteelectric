# Electrical V1/V2 release manifest — PR #63

Documentation and planning only. No production access was used to produce
this manifest; every claim about the real database is either a direct
quote from `prisma/template/electrical-v3-provenance.json` (the checked-in
record of a real production write) or is explicitly labeled UNVERIFIED
below. No code changes accompany this document. Deployment stays disabled.

## 1. What "this PR's intended changes" actually are

This branch does not itself carry new template *content* in git — Elite's
real catalog was extracted from Elite's own live database, outside
version control, and the two real template deltas that exist today were
each published directly to production by a separate `--apply` run (per
their own provenance record, `v3`'s run predates this branch's existence
in git — see Blocker 6). What this branch DOES carry is the *tooling* the
rollout depends on: Routing V2's schema and pricing support, and — the
subject of §0.28-§0.33 of the reconciliation report — a
`scripts/template-update.ts` that can now detect and adopt a routing/
numeric/component change without corrupting a contractor's own
customization, race a concurrent edit safely, or lose an already-adopted
contractor's ability to receive a later correction.

The catalog-side "intended change" this rollout exists to apply is
therefore exactly the two real, already-published, **still fully
unadopted-by-any-contractor** deltas confirmed in
`electrical-v3-provenance.json` and the codebase:

- **`TemplateVersion` v2 (DELTA)** — `new-120v-outlet`, a Routing V2
  revision of Elite's own source service.
- **`TemplateVersion` v3 (DELTA)** — six Material Catalog Phase 1C
  services: `new-video-doorbell-wiring`, `generator-inlet-interlock`,
  `240v-garage-outlet`, `240v-garage-outlet-14-30`,
  `240v-garage-outlet-6-50`, `240v-garage-outlet-14-50`.

`electrical-v3-provenance.json`'s own `adoptionStatus.asOfCloseout` states
this plainly: **"Zero contractor Service rows carry v3 provenance... An
existing contractor (Elite included) requires an explicit, separate
adoption action to receive v3 — none has been taken."** The identical
statement holds for v2: Elite's live `new-120v-outlet` still carries
`templateKey`/`templateVersionId`: `null` (§0.23, reconfirmed §0.32) —
Elite has not adopted its own template's v2 either.

Everything else in Elite's real catalog (69 services directly confirmed
across `prisma/seed.ts` and `prisma/seed-240v-garage-outlet.ts`; this
report's own earlier extraction pass counted 75 — the discrepancy is
UNRECONCILED here and does not change which services are changed for THIS
release, only the exact size of the unchanged remainder) is untouched by
any published delta and needs no action for this rollout.

**Explicitly NOT part of this release**, confirmed already-deferred by the
existing reconciliation report and unchanged by this manifest:

- Routing V2's finished-wall and concealed-route modules — designed in
  this branch's code, never extracted to a real production
  `TemplateVersion` (§7 item 3).
- Rolling Routing V2 out to any NEW contractor — Stage 1B, requiring its
  own separate authorization (§7, §10.2 item 7).

## 2. Release table

| Service | Real change | Status | What the adoption tool carries | What it does not |
|---|---|---|---|---|
| `new-120v-outlet` | v2 DELTA — Routing V2 revision of Elite's own source | **CHANGED** | Routing links, numeric bounds, `routeAction`, canonical components — detected, receipt-tracked, race-safe (§0.28–§0.33) | Its existing disclaimer (`EXTERIOR_WALL_CONTINGENCY_OUTLET`), materials (`prisma/seed-materials.ts`), and policy binding (`prisma/seed-routing-v2-policies.ts`) — not compared, not written. Whether v2 actually changed any of these three relative to v1 is **UNVERIFIED** by this manifest — see Blocker 2. |
| `new-video-doorbell-wiring` | v3 DELTA — Material Catalog Phase 1C | **CHANGED, BLOCKED** | Nothing — this service's real content change IS a materials/policy-role assignment, per the provenance record's own `structuralMaterials`/`policyMaterialRoles` fields | The entire delta. `--status` against this service is expected to report nothing to adopt even though v3 changed it — see Blocker 1. |
| `generator-inlet-interlock` | v3 DELTA (same batch) | **CHANGED, BLOCKED** | (same) | (same) |
| `240v-garage-outlet` | v3 DELTA + a 12-edge reroute mesh across its 4 prong-count siblings | **CHANGED, BLOCKED** | Routing edges MAY be partially visible if the reroute mesh is expressed as `nextQuestionKey`/`rerouteServiceKey` rather than a policy/material construct — **UNVERIFIED**, needs a direct read of this service's v1→v3 diff before assuming either way | Its materials/policy-role content, same as above |
| `240v-garage-outlet-14-30` | v3 DELTA (sibling) | **CHANGED, BLOCKED** | (same as `240v-garage-outlet`) | (same) |
| `240v-garage-outlet-6-50` | v3 DELTA (sibling) | **CHANGED, BLOCKED** | (same) | (same) |
| `240v-garage-outlet-14-50` | v3 DELTA (sibling) | **CHANGED, BLOCKED** | (same) | (same) |
| Remaining ~62–68 of Elite's real catalog | none published | **UNCHANGED** | n/a | n/a |
| Routing V2 finished-wall / concealed-route modules | designed, not yet extracted to any real `TemplateVersion` | **DEFERRED** | n/a until a real extraction exists | `extract-template-service.ts` still has no production-write guard (§10.2 item 3, unchanged) |
| Rollout to new contractors (Stage 1B) | — | **DEFERRED** | — | requires separate explicit authorization (`electrical-routing-v2-workstream`) |

## 3. Ordered blocker list

1. **Materials and policy-banded content are completely invisible to
   `scripts/template-update.ts` — and v3's entire six-service delta IS
   materials/policy content.** Confirmed directly in the tool's own
   docstring (`scripts/template-update.ts:177–181`: "STILL NOT CARRIED,
   NAMED RATHER THAN SILENTLY DROPPED: materials (`AnswerOptionMaterial`),
   disclaimers, photo groups, and policy-banded label patterns") and by
   grep — zero references to any of those four constructs anywhere in the
   file. `detect()`'s comparison only ever inspects a question's wording
   and an option's routing/numeric/component shape; a delta whose entire
   content is a `structuralMaterials`/`policyMaterialRoles` assignment,
   which is exactly what the provenance record says v3 is, produces no
   detectable difference at all. Running `--status` against any of the six
   v3 services is expected to report "nothing to adopt" — not because
   nothing changed, but because the tool cannot see the kind of change
   that did. **This is the single blocker that determines the first
   rollout batch below**: none of the six v3 services can go through
   `--status`/`--adopt` as-is. Either materials/policy support is built
   into the tool and rehearsed with the same rigor the routing/numeric/
   component path already has, or each of these six services needs its
   own deliberate, reviewed, one-off adoption script — never a silent
   `--status` pass read as "confirmed nothing to do."

2. **Whether v2 changed `new-120v-outlet`'s existing disclaimer,
   materials, or policy binding relative to v1 is unverified.** All three
   constructs demonstrably exist on the template/live tree today
   (`prisma/seed-conditional-disclaimers.ts:122`, `prisma/seed-
   materials.ts:238`, `prisma/seed-routing-v2-policies.ts:24`). What is
   NOT confirmed is whether v2's own revision touched any of them — and
   because the adoption tool cannot compare these fields either way, a
   real change there would be exactly as invisible to `--status` as v3's
   is. Needs a direct read of `TemplateAnswerOptionDisclaimer`/
   `TemplateServiceMaterial`/`templatePolicyDefinitionId` on v1's and v2's
   own `TemplateService` rows for `new-120v-outlet` before adopting v2 —
   not inferred from `--status`'s silence.

3. **`extract-template-service.ts` still has no database-identity or
   production-write guard.** Named in §0.23/§10.2 and unchanged by this
   manifest. Not a blocker for adopting the two ALREADY-extracted deltas
   (v2, v3), but blocks doing the deferred finished-wall/concealed-route
   extraction safely later.

4. **BrightPath's own v2/v3 adoption state is unconfirmed.** BrightPath
   Electric LLC is a second real contractor (`scripts/onboard-contractor-
   two.ts`), provisioned through the normal `installCatalog` path — unlike
   Elite, its rows are expected to carry real `templateKey`/
   `templateVersionId` provenance. This manifest did not check BrightPath's
   own provenance against v2/v3 the way Elite's was checked in §0.23/§0.32.
   The existence of `scripts/restore-brightpath-outlet.ts`/`scripts/verify-
   brightpath-restored.ts` in the repo also indicates a PRIOR incident
   involving BrightPath's outlet tree — UNVERIFIED here whether that
   incident has any bearing on its current provenance state. Needs the
   same explicit check Elite already received before either contractor is
   included in an actual rollout.

5. **`new-120v-outlet`'s `pricingMethod: DERIVED_RESOLVED_SCOPE` flip is
   scripted, not confirmed applied.** `prisma/seed-routing-v2-pricing-
   method.ts` exists and names `new-120v-outlet` as its one
   `DERIVED_TEMPLATE_SERVICE_KEYS` entry — it is the ONLY service in the
   entire repository ever set to `DERIVED_RESOLVED_SCOPE` anywhere
   (`LEGACY_PUBLISHED` is the schema default and covers every other real
   service). Whether this script has actually been run against production
   is UNVERIFIED — no production access was used to check.

6. **`v3`'s own governance note records a real process violation, not
   fixed by this manifest.** Its provenance record states verbatim that
   v3's real `--apply` "ran against production before the branch existed
   in git at all, let alone before review" — already named in §10.2 item
   3, restated here because it directly bears on how much trust to place
   in v3's content matching what this branch's design actually intended:
   it was not reviewed as part of this integration before it went live.

7. **Session-migration safety items from the last review round remain
   open — not closed by anything in this manifest.** Broader note/
   dependent/new-group-member safety and the planned legacy-writer cutover
   for `prisma/migrate-guided-flow-session-active-key.ts` still need a
   demonstrated shared boundary or a verified writer-quiescent cutover.
   Unrelated to catalog adoption specifically, but a standing blocker for
   this branch's rollout as a whole, and explicitly not to be called
   closed by this document.

8. **Full storefront/browser rehearsal beyond `new-120v-outlet`'s
   surface-mounted path remains real and open (§7 item 3).** The finished-
   wall and concealed-route modules, and the rest of Elite's real catalog,
   are proven at the function level, not walked through the browser.

## 4. Recommended first rollout batch

**No service is fully rollout-ready today without further work.** Given
Blocker 1, the six v3 services cannot go through the existing tool at all
yet. Given Blocker 2, even the one Routing-V2-tooling-ready service
(`new-120v-outlet`) has an unverified gap between what changed and what
the tool can see.

The narrowest, most defensible first batch:

**`new-120v-outlet` onto Elite alone**, via `scripts/template-update.ts
--status` / `--adopt`, gated on one explicit prerequisite: a direct,
human-reviewed diff of `new-120v-outlet`'s `TemplateAnswerOptionDisclaimer`,
`TemplateServiceMaterial`, and policy-binding rows between v1 and v2. If
that diff shows no change in any of the three, the existing routing/
numeric/component adoption path — the one this whole reconciliation has
rehearsed most heavily, including the exact bad-value/restoration failure
mode and its fix (§0.29–§0.33) — is sufficient on its own and this service
can proceed. If it shows a real change in any of the three, adopting
through `--status`/`--adopt` alone would silently under-deliver v2, and
that gap needs to be closed (materials/policy support in the tool, or a
one-off reviewed script) before this service is included.

The six v3 services should NOT be part of any batch until Blocker 1 is
resolved one way or the other — attempting them through the current tool
risks a rollout that reports success while carrying none of v3's actual
content.

BrightPath (Blocker 4) should be checked and, if it needs the same
adoption Elite does, included as its own explicit, separately-verified
step — never assumed to be in the same state as Elite because both are
"real contractors."

---

*Produced entirely from repository definitions and this branch's own
local, disposable-database evidence, per this manifest's own scope. No
production database was queried or written to in producing this
document.*
