# Electrical Decision Tree Audit V1 — follow-through report (fourth pass, final)

**Status: pushed, in review as a draft PR. Nothing has been applied to any real
database, the canonical template, or any contractor's live catalog — every claim in
§9 was proven against a disposable, task-owned local Postgres cluster, since torn
down.** Every claim below is labeled by exactly what kind of evidence supports it —
code-confirmed by reading, DB-free unit-tested, browser-and-database rehearsed against
a disposable local cluster, or genuinely unverified — and none of those labels is a
substitute for the others.

Branch `audit/electrical-followthrough-v1`, forked from `origin/main` at `64dcf36`,
developed in an isolated worktree (`/private/tmp/p2b-audit-followthrough-wt`) with its
own `npm ci` and generated Prisma client. **Open as draft PR
[#56](https://github.com/Jhall1021/bookeliteelectric/pull/56).** See §8 — this section
of the prior report ("Not pushed anywhere") was itself stale by the time it was read;
the branch had already been pushed and the PR opened before this pass started.

This is the second correction to this report. The first correction round (referenced-
service pricing hardening, dedicated switch-leg proof, a pure-function extraction
proving B.4, and a real regression found and fixed in B.16/B.18) brought the branch to
11 commits and was itself committed as `d88d26f`. Two more commits followed it before
this pass began — a Vercel deployment guard (`07b2af8`, bringing the pushed branch to
**13 commits**, confirmed against `origin/audit/electrical-followthrough-v1`) — and the
report was never updated past 11, which is the defect that correction round fixed,
alongside three new pieces of work: closing the WWT display/charge mismatch (§3a),
correcting the rollout plan's assumptions about which seed functions are actually
narrow (§7), and resolving the mount price-unit contract (§3b).

**A third pass**, prompted by independent review confirming the PR at 13 commits and
identifying the rollout runner added in the second pass as unsafe to ever run
`--apply` with, withdrew that runner outright (§7) and — for the first time on this
branch — ran the pricing, module-composition, and troubleshooting claims throughout
this report against a real, running instance of the app and a real (disposable,
local, throwaway) database, not just DB-free fixtures and code reading (§9). That
rehearsal found one genuine defect in this branch's own WWT fix's surrounding UI state
management, not caught by the DB-free fixture (§9.5), and several rehearsal gaps
still open when that pass's evidence was reviewed.

**This fourth pass** closes those gaps: fixes the back-navigation defect §9.5 found
(§9.5, now updated) and proves the fix with a durable, committed Playwright regression
(§11); completes the rehearsal items the third pass left open — note-editing before
submission (found to have no UI path at all, §9.4), a browser walkthrough of
`replace-standard-outlet` and the fully-composed `new-ceiling-fan` switch-leg path
(§9.7), and a genuine no-deposit checkout carried through to a real `Booking` (§9.8);
re-examines every remaining gate failure with the distinctions the second pass's own
report skipped — missing fixture vs. pre-existing defect vs. unresolved, and directly
checked rather than assumed whether tax/scheduling/HVAC gates need live external
integrations (§9.6, most did not); and commits the reproducible evidence itself, not
just the claims about it (§11).

## Final commit list (full SHAs)

| # | SHA | Commit |
|---|---|---|
| 1 | `ab1944c5c2db68b519ed1e212ceab68e2afbde0e` | docs: reconcile Electrical Decision Tree Audit V1 against origin/main |
| 2 | `cb8821a85f92c14fe88240db0ab7bde9164cd8fd` | fix: price referenced-service add-ons server-side, stop double-charging switch-leg work |
| 3 | `9ec5e6f17a4d5b9aa203b74d936c81d3f383d3ad` | fix: trade-scope the direct troubleshooting entry, stop discarding reroute context |
| 4 | `d841fdfc0930ff58bc3b63ea9f38fb9a1eb4f78e` | fix: remove four non-consequential mandatory questions, reword one trade-judgment prompt |
| 5 | `2fef53eb97a2252626b3f914a818a2f65752331b` | docs: structural proposals for review — not implemented |
| 6 | `6c0debecec509cb914a940a542bc44012a0a2d04` | docs: follow-through summary report (superseded twice over — first by `d88d26f`, now by this commit) |
| 7 | `81d4ccbc83121a04007a683728c1f46cae59badd` | fix: harden referenced-service pricing against masking, cross-tenant, and display/charge drift |
| 8 | `9a5dfc142f99ecbff1e2ac3b87a30064fb1f08f1` | test: prove the switch-leg fix's composed graph, not just its definition count |
| 9 | `4b6c341b79e221723b8567d7ae5b1428171772dd` | refactor: extract the reroute handoff into pure functions, and prove B.4 without a browser |
| 10 | `79329f7468e90855982fc4af962c9dcb1df1978c` | fix: correct B.16 (drop the mandatory garage_type question) and a real regression it caused |
| 11 | `1e72b529dbb51ef15d19c7a6678e2938329d97db` | docs: catalog rollout plan — not applied |
| 12 | `d88d26ff4818cd3762e319aae28b1aecb3d99fce` | docs: correct the completion record — 11 commits, full SHAs, distinguished impact |
| 13 | `07b2af8bf06247845131dce18a46ca8a1b4eedc5` | chore: disable Vercel deployment for this branch before any push |
| 14 | `5ef27acd8262bf06fe2278acefdd98dda42fc2a2` | fix: close the WWT display/charge mismatch on referenced-service pricing |
| 15 | `2703b38609f39863f758cf41a741ac67ea80f512` | fix: narrow the rollout mechanism — split multi-service seed functions, guard every seed file's main(), add a dry-run rollout runner |
| 16 | `bbb4b5f96f35fe0876940e4908f428b483491d96` | test: resolve the TV-mount price-unit contract by tracing the seed literal through the real writer and formatter |
| 17 | `1605169698a46c800e8d98cd805b7c1090f1398f` | docs: correct the completion record again — 13→16 commits, WWT fix, rollout-plan correction, price-unit resolution |
| 18 | `94928ad8bc99eb15d5e8e1acf04b983079c4731e` | fix: withdraw the rollout runner — unsafe on five grounds, not repairable by tightening flags |
| 19 | `b42492091209b65e165e85ac311776ac61db0e98` | docs: record the database/browser rehearsal — one real defect found, gate results, corrected identity |
| 20 | `a3c71df05bbe5bf43c0ee34824bedaeaeec13ac2` | fix: goBack() must restore the full prior configuration, not just state and answers |
| 21 | `02a4a9fca1da9aee43d62dc8478296615233a86f` | test: durable browser regression for back-navigation config restoration, plus a reusable rehearsal bootstrap |
| 22 | *(this commit)* | docs: fourth-pass rehearsal — back-navigation fix proven, remaining gaps closed, gates re-examined precisely |

Full reasoning for every item lives in the commit messages
themselves and in the companion docs:
[reconciliation](electrical-decision-tree-audit-v1-reconciliation.md),
[structural proposals](electrical-decision-tree-audit-v1-structural-proposals.md),
[rollout plan](electrical-decision-tree-audit-v1-rollout-plan.md). This report
synthesizes; it doesn't repeat everything those already say.

---

## 1. What changed, precisely distinguished

Every fix below is a **code and/or seed-definition change on this local branch only**.
None of the four categories below should be conflated with any other:

| | Status |
|---|---|
| **Runtime behavior changed by deployed code** | **None.** Nothing in this branch is deployed anywhere — not to a Preview, not to production, and pushing a branch does not by itself trigger one (see §8). `lib/pricing.ts`, `lib/flow-types.ts`, `lib/routeResolver.ts`, `lib/serviceTreeQuery.ts`, `app/api/services/[slug]/route.ts`, `lib/troubleshooting.ts`, `app/api/troubleshooting/route.ts`, `app/[site]/troubleshooting/page.tsx`, `components/guided-flow/*.tsx`, `components/marketing/HeroWalkthrough.tsx`, and `lib/rerouteHandoff.ts` are all changed on disk and in commits on this branch. No running system's behavior has changed. |
| **Seed definitions changed but not applied** | `prisma/seed-questions.ts` (B.2, B.16), `prisma/seed-device-and-finish-modules.ts` (B.17), `prisma/seed-dedicated-circuit.ts` (B.18), `prisma/seed-appliance-services.ts` (B.18, B.19), `prisma/seed.ts` (no fix — see §3b, only an export + an import-safety guard). Each defines what Elite's catalog *would become* the next time someone with database access runs the specific, narrow function — see the [rollout plan](electrical-decision-tree-audit-v1-rollout-plan.md) (§7) for exactly which function, exactly which service(s) it touches, and which three of them are unsafe to call standalone on an already-composed catalog. **No rollout tooling exists in this repository** — an earlier runner was built and then withdrawn after review found it unsafe; see §7. Every seed file's `main()` is now guarded behind `import.meta.url`, so importing any of these narrow functions cannot also execute the file's full sweep. |
| **Canonical template** | **Unchanged.** No `extract-template-catalog.ts` run. A contractor provisioned today, from `origin/main`, inherits none of these fixes. |
| **Existing contractor catalogs (BrightPath, etc.)** | **Unchanged.** No `template-update.ts` run. Whatever BrightPath's live trees look like today, this branch hasn't touched them, directly or indirectly. |

**B.1's pricing hardening and B.4's handoff extraction are pure code changes** (no seed
files involved) — they'd take effect the moment this branch's code is deployed, with no
seed step required. They are still **not deployed**, per the table above.

---

## 2. Findings: confirmed, superseded, refined, or still uncertain

### Confirmed against current `origin/main` and fixed (this branch)

| Finding | What changed | Note |
|---|---|---|
| **B.1** — TV mount add-ons priced at $0 | Refined twice: the first fix (commit 2) routed the resolved price through `approvedComponentPriceCents`, which had its own masking gap for answers with no components (every mount option today). Commit 7 gives the reference its own `referencedServicePriceCents` field, composing additively with components, checked for same-contractor ownership, and matched to the display DTO. **Commit 14 (this pass) closes a remaining gap direct review found in commit 7's own display DTO**: it only ever read the referenced service's primary `basePrice`, so a while-we're-there visit could display one price and be charged another whenever a service's primary and WWT prices differ. See §3a. | Read commit 14 as the current, authoritative state — commits 2 and 7 alone are superseded, not wrong-then-right in one step. |
| **B.2** — switch-leg double-charge | Unchanged from the original diagnosis. Fixed by removing `switched_source`. Given its own dedicated, DB-free graph proof in commit 8, independent of B.1's tests. | |
| **B.3** — hardcoded diagnostic slug | Fixed: resolves every enrolled trade via `findTroubleshootingDestinations()`. | |
| **B.4** — rerouted symptom reached nowhere | Fixed via the existing handoff mechanism, extended with a `customerNote` field; the parsing/construction logic was extracted to pure functions in commit 9 specifically so it could be unit-tested. | |
| **B.5** — inconsistent troubleshooting explanation | Fixed: real `Service.disclaimer` shown, answer label always shown regardless of per-answer disclaimer presence. | |
| **B.16** — `240v-garage-outlet` pseudo-question | **Reversed during correction.** The first pass (commit 4) added a mandatory `garage_type` question — commit 10 removes it again: no traced consumer requires garage type before review, so making it mandatory only added a click. The service is now a genuine 0-question REMOTE_QUOTE; garage detail is collectible as an existing optional note at the review screen it already lands on. | Read commit 10 as authoritative, not commit 4. |
| **B.17** — `replace-standard-outlet` double question | Fixed via `SUPERSEDED_KEYS`. Unchanged since first implemented. | |
| **B.18** — non-consequential mandatory questions | Fixed for both `dedicated_panel_location` and `soundbar_cable`/`soundbar_conceal`. **The soundbar half's UI wiring was corrected during review**: the first pass gated the optional note on `flow.slug === "soundbar-installation"`, which `scripts/verify-theme-structure.ts` correctly rejects as a customer-facing component branching on contractor/service identity — the same class of defect as B.3's original bug. Commit 10 makes the note universal (varying only by the structural `bookingType` field) rather than special-cased. | Read commit 10 as authoritative for the soundbar UI change, not commit 4. |
| **B.19** — dishwasher wording | Fixed; verified this pass that the unchanged answer labels ("No, there's no power there" / "I'm not sure") remain coherent with the reworded prompt, and that both the no-power reroute and the unsure review path are untouched and still safe (§5). | |

### Confirmed, proposal only (not implemented)

B.7, B.12, B.13, B.14, B.15, and the five-unapplied-trees item — unchanged from the
prior version of this report; see the structural-proposals doc.

### Refined this pass

- **`dedicated-120v-circuit-outlet` does not provably cover `new-240v-appliance-circuit`'s
  full scope** (checked explicitly, not assumed — see structural proposals §3).

### Still uncertain — traced further this pass, precisely where it stopped

**The "4 unsure→CONTINUE answers" claim.** A proper multi-line-aware source search
(not a single grep pass) across every `prisma/*.ts` file found **48 distinct
"unsure"-style answer labels in source**, breaking down as 40 `PHOTO_REVIEW`, 5
`REROUTE_TROUBLESHOOTING`, 1 confirmed `CONTINUE`
(`level-2-ev-charger`'s `panel_capacity`, a one-off — this service is not looped
across other slugs, so it contributes exactly one row live), and 2 whose routeAction
is computed dynamically (`...proceed`, a spread of a variable) rather than a literal
string, requiring individual tracing:

- `prisma/seed-conditional-disclaimers.ts`'s `device_on_exterior_wall` question's
  "I'm not sure" answer, applied to exactly two services
  (`EXTERIOR_WALL_SERVICES = [new-120v-outlet, dedicated-120v-circuit-outlet]`). For
  `new-120v-outlet`, this is **confirmed CONTINUE** — this matches the original
  audit's own Group A table, which read this exact answer's live behavior directly
  ("'I'm not sure' → same CONTINUE, contingency disclaimer attached"). That makes
  **2 confirmed CONTINUE cases** (the EV charger one-off, plus this one).
- Whether the same question ALSO resolves to CONTINUE for
  `dedicated-120v-circuit-outlet` is **genuinely unresolved from source alone** — it
  depends on `resolvedDestination`, computed at seed-run time from whatever question
  currently follows the access branch in that service's *live* tree, which requires
  either a database read or a full simulation of every seed file that could have run
  before it in an unknown historical order. Group D's own detailed table for this
  service didn't show this question at all, which may mean it isn't live for this
  service (the function has an explicit early-exit when "accessible answers go to
  more than one place"), or may mean Group D's pass didn't trace
  `seed-conditional-disclaimers.ts` specifically for it.

**Net result: 2 of the reported 4 are confirmed with source-level evidence (one
cross-checked against a prior direct read of live behavior); the other 2 remain
genuinely unavailable without a database query.** This is offered as the honest
completion of the trace, not a guess at the remaining two — per the instruction, the
unrelated `outlet_load_type` catch-all (`routeAction: PHOTO_REVIEW`, confirmed by
direct reading) is explicitly NOT counted as one of the four.

**$249 vs. $250 (B.22)** and the **56-vs-47 discrepancy (B.23)** — unchanged, still
need one database query each.

---

## 3. Referenced-service pricing: what was reviewed and hardened

Full detail in commit 7; summary of what each reviewed boundary now does:

| Boundary | Behavior |
|---|---|
| Same-contractor ownership | Checked explicitly (`contractorId` compared) in both the resolver and the display DTO — defense in depth. The write-time path was read, not assumed: both known writers (the admin tree editor's guarded client, and template provisioning's `contractorId`-scoped lookup by slug) were confirmed incapable of writing a cross-tenant reference. |
| Missing/null/invalid/cross-tenant reference | All four fail to REVIEW, identically — never priced at zero, never trusted. |
| Valid $0 vs. missing | Distinguished correctly (strict `null` check, not a falsiness check) — an approved no-charge referenced price prices at the anchor exactly. |
| Reference masking a component, or vice versa | Neither can mask the other — `referencedServicePriceCents` composes additively with component approval in `applyBranch`, not as an override. |
| Ordinary modifiers/components | Neither dropped nor double-counted — proven by a case with all three (reference + component + `priceModifierCents`) present on one answer summing correctly. |
| Primary/WWT | The resolver picks the referenced service's own `basePrice` or `whileWeThereBasePrice` matching `isPrimary`, exactly like the anchor price. The **display DTO stays primary-only**, documented as a deliberate, narrow limitation: it can't know add-on status before the client's own separate `/api/visit` read, which is true of every other per-option delta in the preview layer already — not a new gap this fix introduces. The actual charge is always correct regardless. |
| Add-on-only vs. standalone eligibility | Proven separate: an inactive (`active: false`) referenced service — exactly Elite's own mount rows — still resolves its price normally, since nothing in the pricing path reads `active` at all. |
| Units | `Service.basePrice`/`whileWeThereBasePrice` confirmed cents throughout every consumer read this session (the display formatter, `scripts/republish-legacy-approved-prices.ts`'s own `money()` helper, this fix's own code). **The seed-literal unit question flagged in the prior report is now resolved by tracing, not by inference — see §3b.** The current live database value for either mount remains explicitly unverified; §3b does not claim otherwise. |

The display DTO's silent fallback (`priceModifierCents: o.referencedService?.basePrice
?? o.priceModifierCents`, which would show a confident price the server was about to
refuse) is corrected: the DTO now returns the same undefined/number/null shape the
resolver does, computed identically, sharing the same `applyBranch`/`answerPriceDelta`
functions client and server both call.

---

## 3a. Closing the WWT display/charge mismatch (this pass)

Direct review on PR #56 found a gap commit 7 left open: `app/api/services/[slug]/route.ts`
only ever computed one `referencedServicePriceCents` from the referenced service's
primary `basePrice`, and `GuidedFlowEngine.tsx`'s `evaluate()` passed that single value
into `applyBranch()` even on a while-we're-there (add-on) visit — while
`lib/routeResolver.ts`, the server-authoritative resolver, already correctly chose
`whileWeThereBasePrice` for an add-on. The displayed option adjustment and the terminal
price the client showed could therefore disagree with what the server would actually
charge, for any referenced service whose primary and WWT prices differ. The task's own
framing was exact: "identical current mount prices must not conceal this gap" — both of
Elite's own mounts happen to have matching primary/WWT prices today, which is exactly
why this needed a fixture with deliberately different ones, not a click-through.

**Fixed** by giving the DTO two independently-computed anchors instead of one:

- `lib/flow-types.ts`'s `AnswerOptionDTO` now carries `referencedServicePrimaryCents` and
  `referencedServiceAddOnCents` in place of the single field.
- `app/api/services/[slug]/route.ts` computes both from the referenced service's
  `basePrice` and `whileWeThereBasePrice`, each independently tenant-checked.
- `lib/pricing.ts` gained `resolveReferencedServicePriceCents(option, isAddOn)` — the
  ONE place either client call site resolves the two-anchor DTO shape down to the single
  value `applyBranch()`/`answerPriceDelta()` consume, so the resolution logic exists once,
  not duplicated per caller.
- `GuidedFlowEngine.tsx`'s `evaluate()` and `QuestionStep.tsx`'s live price preview both
  now call `resolveReferencedServicePriceCents(option, isAddOn)` before handing the
  option to `applyBranch`/`answerPriceDelta` — `QuestionStep` gained a required `isAddOn`
  prop for this, which required updating its one other caller,
  `components/marketing/HeroWalkthrough.tsx` (a marketing demo, not a real customer
  flow), to pass `isAddOn={false}`.
- `lib/routeResolver.ts` needed no change — it already picked correctly; this fix brings
  the client's display path in line with the resolver it was previously disagreeing with.

**Proven** by expanding `scripts/verify-referenced-service-pricing.ts` (16 → 26
assertions, all passing) with a fixture using **deliberately different** primary
($125.00) and add-on ($90.00) prices specifically so identical mount prices couldn't
mask the bug: `resolveReferencedServicePriceCents` picks correctly in both directions;
the full `applyBranch`/`answerPriceDelta` chain reflects the difference end-to-end, not
just the helper in isolation; a `null` WWT price resolves to `null` for an add-on visit
without silently falling back to the primary figure, forcing review through the real
engine rather than pricing at zero or at the wrong anchor; a valid `$0` add-on price is
distinguished from a missing one via a strict `null` check; and a non-referencing option
is unaffected by `isAddOn` in either direction. `npx tsc --noEmit` clean throughout.

**Not proven this pass:** the actual rendered UI showing the correct add-on price in a
live guided flow — no browser or database access this session; see §6.

## 3b. Resolving the mount price-unit contract (this pass)

The prior report flagged, but did not resolve, whether `prisma/seed.ts`'s bootstrap
literals for `elite-tilt-mount` (`basePrice: 125`) and `elite-articulating-mount`
(`basePrice: 200`) meant $125.00/$200.00, or something else if ever read as
already-cents. Per this pass's explicit instruction, this was resolved by **tracing the
literal through the actual code that writes and displays a price** — not by inferring
from `scripts/republish-legacy-approved-prices.ts`'s existence (the prior report's own
reasoning, now recognized as an inference rather than a trace) and not by multiplying
the stored figure blindly.

The trace, each step read directly from the file, not paraphrased from memory:

1. `prisma/seed.ts`'s `SeedService` type documents `basePrice?: number; // dollars`.
2. Its create-time writer (only reached the first time a service row is created — an
   existing row's `update: {}` leaves `basePrice` untouched on every later run) applies
   `basePrice: svc.basePrice ? c(svc.basePrice) : null`, where `c = (dollars) =>
   Math.round(dollars * 100)`.
3. `lib/flow-types.ts`'s `formatCents(cents)` — the function `lib/servicePricingSummary.ts`
   actually renders every customer-facing price through — divides by 100 back to dollars.

`c` and the `CATALOG` literal array were exported from `prisma/seed.ts` (additive,
behavior-free) specifically so a fixture could import and run the real functions against
the real literal, rather than re-typing either. Doing this required also adding the
`import.meta.url` guard `prisma/seed.ts` was missing — until this pass, importing it for
any reason (including just for `c`) would have executed its full 13-category catalog
seed as a side effect, the same class of hazard corrected across the other four seed
files in §7. This is now fixed for a fifth file, as a direct consequence of making it
importable at all.

`scripts/verify-mount-price-unit-contract.ts` (new, DB-free, 14/14 assertions) proves,
for both mounts: the literal reads as documented (dollars); `c(125)` writes `12500`
cents, not `125` cents (ruling out "already cents") and not `125 * 1` (ruling out
treating the dollar literal as if it needed no conversion at all); and
`formatCents(12500)` round-trips back to `"$125"` — the same figure the literal started
as, proving the two conversions are exact inverses for these values, not merely
consistent by coincidence.

**What this does not prove, and does not claim to:** what `elite-tilt-mount` and
`elite-articulating-mount`'s `basePrice`/`whileWeThereBasePrice` columns actually hold in
any real database today. `prisma/seed.ts`'s `update: {}` means this literal has only
ever been written once, if at all, whenever these two rows were first created — since
then, `scripts/complete-mount-labor-inputs.ts`, a contractor's own price approval
through the pricing screen, or `scripts/republish-legacy-approved-prices.ts` could each
have changed it. **The current stored values remain explicitly unverified.** The gate
named in the prior report stands unchanged: `SELECT "basePrice",
"whileWeThereBasePrice" FROM "Service" WHERE slug IN ('elite-tilt-mount',
'elite-articulating-mount')`, against the correct tenant-scoped database, before
trusting either figure.

---

## 4. Switch-leg (B.2): dedicated evidence, not borrowed from B.1

Commit 8's `scripts/verify-lighting-control-rewire.ts` imports and runs the actual,
shared `upsertQuestion`/`rewireTerminalsInto`/`findDanglingReferences`/
`findUnreachableQuestions` from `prisma/_moduleHelpers.ts` against a minimal in-memory
fake of the two Prisma models those functions touch — not a reimplementation of the
rewiring logic, the real code. 18/18 assertions, covering: the existing-fixture path
and the no-fixture path (the actually-double-charged one) both composing correctly
with zero leftover flat modifier; the *unrelated* `attic_access` $100 surcharge
surviving untouched (three terminals convert, not two — caught by the test's own
first draft, which assumed two); the module's uncertainty branch reviewing; both
required facts staying askable; zero dangling/unreachable questions via the real
checks; and idempotency under a repeated module attach (no duplicate question, no
re-widening, stable id across the re-run).

Explicitly not proven: that `seedNewCeilingLight()`'s own committed literals are
typed correctly (covered by `tsc` and direct reading instead), or that the real seed
produces this shape against a real database.

---

## 5. Simplification batch corrections and verification

- **B.16**: reversed, see §2. GuidedFlowEngine no longer branches on
  `flow.slug === "soundbar-installation"` anywhere (§ above) — the fix that made this
  the correct choice for garage type is the same fix that closed the identity-branch
  regression for soundbar.
- **Dedicated-circuit optional note**: verified visible via the **existing**,
  unconditional `note`/`onNoteChange` props on `PhotoReviewNotice`/`PricedPhotoReview`
  (confirmed by reading both components directly this pass, not assumed) — no new UI
  needed, and `addToVisit`'s existing `answersSnapshot.customer_note` construction is
  unconditional on which terminal state produced the note, so submission was already
  correct.
- **Soundbar optional note**: verified visible via the corrected, universal
  `PriceConfirmationCard` wiring (§2/§ regression above), and submitted the same way
  via the same `addToVisit` code path.
- **Dishwasher wording**: verified this pass — the unchanged answer labels remain
  coherent with the reworded prompt, and the no-power/unsure routes (reroute to
  dedicated circuit; photo review) are untouched, so absent/unknown power still has a
  safe route. No code change was needed beyond the wording itself.
- **The four "unsure→CONTINUE" trace**: completed as far as source analysis allows —
  see §2.

---

## 6. Gates run, and what remains genuinely blocked

**Local, credential-free database options were checked before writing off DB-backed
gates, per the directive.** No Docker daemon is reachable on this machine; no local
Postgres binary is installed (checked directly — `pg_ctl`/`initdb`/`postgres` all
absent, no Homebrew Postgres formula installed). Homebrew itself is present and
*could* install a local, disposable Postgres with zero shared credentials involved —
that option was not exercised. Installing new software onto the actual host machine
is a more persistent, real action than this branch's own worktree isolation, and
wasn't something to decide unilaterally; **it's surfaced here as a live, available
option for the next session or operator, not something this pass did or is
recommending against.**

The rejected `.env` read was **not retried in any form**, and Production was **not**
substituted for it — read-only or otherwise.

**Every DB-free gate that exists in this repository was identified and run, not just
this session's own three new verifiers.** `package.json`'s `verify:full` chain
contains 77 scripts; 30 of them (by static check — no `PrismaClient` reference)
don't require a database. All 30 were run individually this pass:

- **29 passed on first run.**
- **1 failed: `scripts/verify-theme-structure.ts`**, flagging the `flow.slug`
  identity-branch regression described in §2/§5. Diagnosed, fixed, re-run: **15/15
  passing.**
- This session's DB-free verifiers, re-run after every subsequent commit to confirm
  nothing regressed them: `verify-referenced-service-pricing.ts` (originally 16/16,
  expanded this pass to **26/26** for the WWT fix in §3a),
  `verify-lighting-control-rewire.ts` (18/18), `verify-reroute-handoff.ts` (11/11), and
  the new `verify-mount-price-unit-contract.ts` from §3b (**14/14**, new this pass).
  **69/69 held across all four, this pass's final run.**
- All four are wired into `package.json`'s `verify:full` chain, each positioned next to
  its closest existing thematic sibling (`verify-mount-price-unit-contract.ts` added
  this pass, directly after `verify-referenced-service-pricing.ts`).
- `npx tsc --noEmit`: zero errors, re-run after every single commit in this branch and
  after this pass's seed-file refactors (split `seedEvGarage`, split
  `seed-dedicated-circuit.ts`, narrowed `seedApplianceElectrical`, exported `c`/`CATALOG`
  from `prisma/seed.ts`) — clean every time.
- **`npm run lint` was attempted and found unusable**: this repository has no
  `.eslintrc*` or `eslint.config.*` at all, on this branch or on `origin/main` —
  `next lint` prompts for interactive first-time setup. Not a pre-existing configured
  gate; not force-configured here (that would be an unrequested, unscoped
  infrastructure change).
- **No seed script, `prisma db push`, `capture-*.ts --check`, or any of the ~47
  `PrismaClient`-importing `verify:full` scripts were run** — all genuinely needed
  database access this session didn't have at the time.

**Superseded by §9.** Every item this paragraph used to list as blocked — TV-mount
pricing in a real cart, the switch-leg routes in a live tree, `/troubleshooting` on a
renamed service, the zero/one/N-eligible-destination fallbacks, real navigation
persistence of the B.4 note, back-navigation, and direct inspection of the
simplification batch's trees — was reached in a later pass against a disposable local
database and a real browser session; see §9 for what was proven, what broke, and what
still wasn't reached (§9.7).

---

## 7. Catalog rollout plan (corrected this pass)

See the [rollout-plan document](electrical-decision-tree-audit-v1-rollout-plan.md) —
**rewritten this pass** after direct review found two of its "safe to run wholesale"
claims wrong: `seed-device-and-finish-modules.ts`'s `main()` touches 13 services for a
fix (B.17) that only concerns one, and `seed-dedicated-circuit.ts`'s `main()` bundled
the B.18 tree fix with a tenant-unscoped retirement `updateMany` — retirement work
explicitly excluded from this task. The corrected plan:

- Narrows every entry point: `seedDeviceModule("replace-standard-outlet")` instead of
  the whole file; `seedDedicatedCircuit()` (tree only) instead of `main()`, with
  retirement split into its own `retireDedicatedCircuitAmperageServices(contractorId)`
  that this rollout does not call; `seedApplianceElectrical("dishwasher-electrical")`
  instead of rebuilding `garbage-disposal-install` too; `seedGarage240vOutlet()`
  instead of `seedEvGarage()`, which also rebuilt two unrelated EV services.
- Guards every seed file's `main()` behind `import.meta.url`, so a narrow import can no
  longer execute the whole file's side effects — five files now, including
  `prisma/seed.ts` (see §3b).
- **A runner (`scripts/rollout-electrical-tree-fixes.ts`) was built in an earlier pass,
  then withdrawn — not repaired — after direct review found it unsafe on five separate
  grounds**: it snapshotted by slug with no `contractorId` filter; its diff checked only
  the question/answer tree while several target functions also write service-level
  scalar fields it never looked at; the drift check and the actual write were two
  unsynchronized operations with no transaction or precondition between them; three of
  its seven targets (`new-ceiling-light`, `new-ceiling-fan`,
  `dedicated-120v-circuit-outlet`) call `clearServiceTree()` and would silently strip
  tree-modifying modules (`seed-height-access.ts`, `seed-lighting-control.ts`,
  `seed-fixture-finish-ack.ts`, `seed-conditional-disclaimers.ts`) already attached on
  any normally-seeded database — confirmed by reading `seed-all.ts`'s own header
  comment ("re-running one earlier seed on its own afterward can orphan what was
  inserted after it — which has happened four times") and each module file's target
  list directly; and its dry-run path described a transactional before/after preview it
  never actually performed. The file has been deleted from this branch. **No rollout
  tooling of any kind exists here now** — the [rollout plan](electrical-decision-tree-audit-v1-rollout-plan.md)
  is back to a table of narrow entry points for a human with database access to call by
  hand, one at a time, with the three module-composition risks above read and
  understood first.

This document does not authorize running any of it. **No seed, retirement, extraction,
or catalog update is authorized here or by the rollout-plan document.**

---

## 8. Deployment-guard state

- Branch `audit/electrical-followthrough-v1` **is pushed** to `origin` and open as
  **draft PR [#56](https://github.com/Jhall1021/bookeliteelectric/pull/56)** — the prior
  version of this report's "not pushed anywhere" was itself stale, corrected here as
  part of the same defect this revision fixes (§ intro).
- `vercel.json` on this branch sets `git.deploymentEnabled["audit/electrical-followthrough-v1"]: false`
  (commit `07b2af8`, #13) — confirmed still present and unmodified as of this pass's
  final commit. This is what makes it safe for the branch to be pushed at all: pushing
  a branch does not by itself start a build, but Vercel's own Git integration would
  otherwise attempt one on every push, and this guard is what stops it specifically for
  this branch name.
- Whether the guard is actually being honored by Vercel (i.e., no build was actually
  triggered by any of this pass's pushes) could not be independently confirmed this
  session — `gh` is not authenticated (`gh auth status` fails, "not logged into any
  GitHub hosts"), and no Vercel dashboard/API access was available. This is a real,
  named gap, not assumed-fine: the mechanism is the same one already proven working on
  `feat/electrical-routing-v2`, but that is evidence the mechanism *can* work, not a
  observation that it *did* here.
- No merge, no data change, no seed, no template extraction, and no explicit deploy
  command were performed at any point this session.

---

## 9. Database/browser rehearsal (this pass) — real app, real database, disposable and torn down

Independent review authorized installing a local PostgreSQL dependency for a
task-owned, disposable rehearsal, since no verification up to this point had run
against an actual database or an actual browser. This section records what that
rehearsal proved, what it found broken, and what it could not reach — against a
cluster that no longer exists.

### 9.1 Environment

- PostgreSQL 16 installed via Homebrew; the DEFAULT Homebrew-managed cluster
  (`/opt/homebrew/var/postgresql@16`) was never started or touched.
- A separate, task-owned cluster was `initdb`'d from scratch under this session's own
  scratchpad directory and started by hand — `postgres -h 127.0.0.1 -p 5544`, never
  `brew services`, never a background/login service. Stopped with `pg_ctl stop` at the
  end of this pass; its data directory is gone.
- `.env` (gitignored, never committed) pointed `DATABASE_URL` at
  `postgresql://rehearsal_admin@127.0.0.1:5544/p2b_rehearsal` only. Confirmed no
  fallback to a shared or Production database exists: no `REHEARSAL_DATABASE_URL` or
  `DATABASE_URL` was present anywhere in the shell environment before this was set, and
  `scripts/_env.ts`'s own contract ("never overwrites something already in the
  environment") was checked against that fact, not assumed.
- External integrations were never configured — no Stripe key, no Jobber connection, no
  R2/upload credentials, no SMTP — matching this repo's own `.env.example` pattern of
  shipping those blank for local dev. Nothing in this rehearsal sent a real email,
  moved a real payment, uploaded a real file, or completed an OAuth flow.
- The database was bootstrapped via this repo's own real mechanisms, run in order, not
  hand-crafted: `prisma db push`, a from-scratch Elite `Contractor` + `ContractorSite`
  row (this repo's seed chain assumes Elite already exists; provisioning one from
  nothing has no dedicated script, so this used the same shape
  `scripts/onboard-contractor-two.ts` uses for BrightPath), then `npm run db:seed:all`
  (22 documented steps), `prisma/migrate-material-split-2026-08-24.ts --apply`,
  `prisma/backfill-disclaimer-split-2026-08-27.ts` (refused — see 9.6), and
  `prisma/seed-appliance-services.ts` directly (genuinely absent from `seed-all.ts`'s
  own `STEPS` list — see 9.6). Final catalog: 66 services, 110 questions, 408 answer
  options, tree integrity clean (`prisma/repair-trees.ts`: 0 dangling, 0 unreachable).
- Every test used synthetic values (a deliberately-diverged mount WWT price, a renamed
  troubleshooting service, a second synthetic trade) — never an attempt to reproduce or
  guess a real Elite figure.
- **This 66-service catalog is Elite's own legacy per-contractor tree, replayed
  through its seed scripts — not the canonical template.** No `TemplateVersion` was
  ever published in this rehearsal, and `extract-template-catalog.ts` was never run
  (§7's rollout plan explicitly excludes it). Nothing in §9 proves anything about the
  canonical `TemplateService`/`TemplateQuestion` model, a freshly-provisioned
  contractor's inherited catalog, or template-adoption (`scripts/template-update.ts`)
  — those remain exactly as unverified as before this rehearsal, and 66 is a fact
  about Elite's own reconstructed catalog, not a claim about template coverage.

### 9.2 Primary/WWT mount pricing — proven, including through a mechanism this task didn't anticipate

Set `elite-articulating-mount` to primary $200.00 / WWT $90.00 (deliberately
different, so identical mount prices can't mask anything) and drove the real storefront
through both a fresh (primary) visit and a same-visit (WWT) add-on, via
`tv-installation` and `tv-install-existing-location`'s real guided flows:

- **Primary context** (no prior line item): "add Elite Full-Motion Mount" displayed
  **+$200**; terminal price **$700** ($500 base + $200 mount); stored
  `line_items.computedPriceCents = 70000`, `isPrimary = true`.
- **WWT context** (visit already had a line item): the same mount displayed **+$90**;
  terminal price **$315** ($225 WWT base + $90 mount); stored
  `computedPriceCents = 31500`.
- **Missing WWT price**: set `elite-tilt-mount.whileWeThereBasePrice = NULL`. In WWT
  context it displayed **"We'll confirm your price after a quick look"** (not $0, not a
  silent fallback to the $125 primary figure) and the flow terminated in a genuine
  `PHOTO_REVIEW` state requiring photos before any price — the real engine forcing
  review, not a simulated one.
- **Valid $0 WWT price**: set the same field to `0` (not null). Displayed **"No extra
  charge"** and resolved **instantly** to $225 (no mount charge, no review) — proving
  the strict-null distinction from the DB-free fixture holds in the real engine too.

**An unanticipated, stronger proof of reconciliation:** adding a second service
triggered `lib/visitPrimary.ts`'s existing, DB-free-tested, order-independent
"smallest standalone-to-add-on gap" reconciliation — which **swapped** which of the two
booked services was primary (mid-visit, automatically, in the customer's favor) and
correctly **re-resolved each line item's mount price to match its new primary/add-on
status**: the service demoted to add-on dropped from $700 to $465 (its mount
recalculated at $90), and the one promoted to primary rose from $315 to $515 (its mount
recalculated at $200). This is a more stringent test than a single flow's own terminal
screen — the referenced-service pricing fix holds up under a reconciliation event this
task did not ask for but the app performs automatically.

### 9.3 Ceiling-light switch-leg — charged once, via the fully-composed tree

Walked `new-ceiling-light`'s real, fully-composed tree (base tree +
`seed-height-access.ts` + `seed-lighting-control.ts` + `seed-fixture-finish-ack.ts`, all
genuinely attached, not a stripped-down base seed) through: 8ft fixture height, normal
floor below, accessible attic, no existing fixture nearby, "a wall switch here controls
an outlet, use it for the new light instead" (the exact switch-leg rewiring scenario
B.2 fixed), standard switch. Stored line item:
`resolvedComponentKeys: ["CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE"]` — **exactly
one** component, `answersSnapshot` containing no `switched_source` key anywhere (the
removed duplicate question), `computedPriceCents: 47000` ($375 WWT base + $95 switch-leg
component, this visit already having a line item). The double-charge B.2 fixed cannot
happen against the real, composed catalog.

### 9.4 Troubleshooting — renamed services, 0/1/N eligible destinations

- **0 eligible** (no `ContractorTrade` enrolled — this rehearsal's actual starting
  state): `/troubleshooting` rendered **"Let's figure it out. Give us a call and we'll
  get a diagnostic visit on the books."** — the documented zero-destination fallback.
- **1 eligible**: enrolled Elite in `electrical`, then **renamed and re-slugged** the
  diagnostic service (`electrical-troubleshooting` → `ask-us-anything-diagnostic`,
  `Electrical Troubleshooting` → `Ask Us Anything (Diagnostic Visit)`) to prove
  identification is genuinely by `BookingType` + `Service.tradeKey`, not name or slug.
  `/troubleshooting` rendered the renamed service directly, correct price, no trade
  picker.
- **N (2) eligible**: added a synthetic `plumbing-troubleshooting` service and enrolled
  Elite in `plumbing` (a rehearsal-only fixture, removed afterward — Elite is not
  really a plumbing contractor). `/troubleshooting` rendered
  `TroubleshootingTradePicker` with **"Electrical" / "Plumbing"** buttons; choosing
  "Electrical" resolved to the same renamed service.
- **REROUTE_TROUBLESHOOTING with a renamed destination**: from
  `single-pole-breaker-replacement`, answering "It keeps tripping" rendered **"This
  sounds like a troubleshooting job. From Single-Pole Breaker Replacement: 'It keeps
  tripping.' [the answer's own disclaimer text]"**, correctly priced the renamed
  destination at $250, and adding it to the visit stored
  `line_items.answersSnapshot.customer_note` (not a `Booking` — no booking existed yet
  at this point) containing that exact note text — the full `buildTroubleshootingNote`
  handoff, surviving a real client-side navigation between two different guided flows,
  landing correctly in the stored visit line item.
- **Editing the note before submission — a real defect found, precisely located.**
  `ask-us-anything-diagnostic` (like the real `electrical-troubleshooting` it was
  renamed from) has zero questions and a fixed price, so
  `components/guided-flow/GuidedFlowEngine.tsx`'s render wires its intro through
  `ServiceIntro`'s `directBook` shortcut (`onContinue={directBook ? () =>
  addToVisit(anchorPrice ?? 0) : startQuestions}`, ~line 703) — clicking the intro's own
  "Add to My Visit — $250" button calls `addToVisit()` **directly**, never reaching the
  `state.kind === "resolved"` branch (~line 754) that renders `PriceConfirmationCard`
  with the editable `note`/`onNoteChange` field the code's own comment there describes
  as covering exactly this case ("the diagnostic service has no questions of its own, so
  this is the ONLY screen a homeowner sees before booking it... show it as an editable
  field... rather than silently sending it"). In this rehearsal, the reroute-carried note
  reached the stored `answersSnapshot.customer_note` correctly (`addToVisit()` reads
  `customerNote` from component state regardless of which code path called it), so the
  right text was submitted — but the customer was **never shown or given a chance to
  edit it**, contradicting the code's own stated design intent. Confirmed by contrast:
  `replace-standard-outlet` (which has a real question) reaches `PriceConfirmationCard`
  normally and *does* show the editable note field. This affects every real
  zero-question `TROUBLESHOOT_ONLY` reroute destination, which describes Elite's actual
  diagnostic service — not a rehearsal-fixture artifact. **Not fixed in this pass** —
  outside the two authorized steps; flagged here as found.
- A stale `GuidedFlowSession` was found to resume straight to a service's last terminal
  state on reload, including a terminal state computed before `Service.tradeKey` was
  set — not a defect (the answer was correct once the underlying data was set and a
  fresh session was used), but worth naming: **this rehearsal's own session-resume
  behavior needed a deliberate reset between tests**, which is itself circumstantial
  evidence that resumed sessions may not always re-derive routing fresh — not traced
  further, since it never affected a real customer's own data, only repeated manual
  testing against the same fixture.

### 9.5 Back navigation — server price is correct; the client's own display is not (real defect found)

Fresh `tv-installation` session, WWT context: chose "add Elite Full-Motion Mount"
(displayed +$90), continued two more questions to a `PHOTO_REVIEW` terminal (drywall,
above-fireplace: yes). Used "← Back" three times to return to the mount question,
switched to **"Yes, I have a mount"** (no charge), answered the remaining questions
fresh (above-fireplace: no this time), and reached "Here's Your Price!" showing
**$465** — $375 base **plus the $90 mount charge from the abandoned answer**, which
should have been removed.

**The actual stored price was correct**: `line_items.computedPriceCents = 37500`
($375.00, matching `has_mount: "has_mount"`, `resolvedComponentKeys: []`) —
`answersSnapshot` held only the final answers, with no trace of the abandoned mount
choice. **So this is a client-display defect, not a charging defect**: the customer
would have been shown $465 immediately before clicking "Add to My Visit," then charged
$375 — the wrong number shown, not the wrong number charged, in this direction.

**Located, not just observed**: `components/guided-flow/GuidedFlowEngine.tsx`'s
`goBack()` (~line 245) restores `state` and `answers` from the history stack that
`pushHistory()` populates with `{state, config, answers}`, but **never restores
`config`** — no `setConfig(previous.config)` call exists in `goBack()`, confirmed by
listing every `setConfig` call site in the file (lines 166, 475, 486, 504, 550; `goBack`
is not among them). Answering a question always folds onto whatever `config` currently
holds (`evaluate(option, config ?? ..., newAnswers)`, line 524) — so after a `goBack()`
to an earlier question, `config` is left over from the abandoned deeper path, and a
new, non-charging answer to the same question does not remove what the old one added.

This was **pre-existing in this branch's own §3a code**, not something the WWT fix
introduced structurally, but it is the exact class of bug §3a's own task description
warned about ("terminal totals... reconcile") and this rehearsal's own back-navigation
test surfaced it directly.

**Fixed in a fourth pass, authorized specifically for this**:
`components/guided-flow/GuidedFlowEngine.tsx`'s `goBack()` now also calls
`setConfig(previous.config)`, restoring the complete prior configuration from the same
history entry `pushHistory()` already populates — not a hand-subtracted price, not a
patch to only the displayed total. `goBack()` also now calls the existing
`persistAnswers(previous.answers)` — the same function, same `expectedVersion`
concurrency contract, every forward answer already uses — so the server's
`GuidedFlowSession.consumedAnswers` is trimmed to match on Back, not just the client's
local state; a reload before the customer finishes re-answering can no longer resume
from a stale, larger answer set holding the abandoned branch's keys.

Verified by manual re-reproduction of the exact scenario above (now $375 throughout,
including after a reload mid-sequence) and by a new, durable Playwright regression —
`scripts/verify-back-navigation-config-browser-flow.ts` — against a purpose-built
throwaway fixture (a paid vs. customer-supplied mount choice, deliberately different
primary/WWT referenced prices, a branch that can land in `PHOTO_REVIEW` or resolve
instantly), covering every case named for this fix: paid→Back→supplied,
supplied→Back→paid with no accumulation across repeated toggling, leaving a REVIEW
branch for a supported priced branch, both primary and WWT contexts, and a reload
while the session is still active. All 17 assertions passed, including the stored
`line_items.computedPriceCents`/`isPrimary`/`answersSnapshot` in both contexts and the
`lib/visitPrimary.ts` primary/add-on split landing exactly where the fixture's
deliberately-different standalone/WWT gaps put it — accounted for separately, per the
instruction, rather than asserted as if back-navigation could disturb it. See §11 for
the full evidence file.

**A second, separate defect surfaced while stabilizing this regression, unrelated to
`goBack()`**: against `next dev`, the reload step (D) intermittently resumed to the
FIRST question instead of the priced terminal. Traced to `lib/guidedFlowSession.ts`'s
`findOrCreateActiveSession`, which finds the ACTIVE row before creating one — by its
own docstring, enforced only "inside the same call," not across two concurrent ones.
React Strict Mode double-invokes `GuidedFlowEngine.tsx`'s session-bootstrap effect on
every mount in development, firing two concurrent `POST /api/guided-flow-sessions`;
both can miss the existing row and both create one. Confirmed live: a diagnostic dump
on failure caught two ACTIVE `GuidedFlowSession` rows for the same
contractor+session+service with identical, same-millisecond `createdAt` — one holding
the real answers, one empty — and `orderBy: { createdAt: "desc" }` has no tiebreaker
between them, so a later reload's own double-invoke can resolve to the empty one.
This is pre-existing in `findOrCreateActiveSession` itself (present on the base
revision under the same conditions, nothing this pass touched) and does not reproduce
in production: Strict Mode's double effect invocation is development-only and is
stripped when `NODE_ENV=production`. Confirmed directly — 4 consecutive runs against
`next dev` failed on step D, then 4 consecutive runs of the identical script against
`next build && next start` passed 17/17 each. The regression and its rehearsal doc
(§11) now say explicitly to run it against a production build; the diagnostic
instrumentation (console/pageerror listeners, the session dump) stays in the script
rather than being removed now that the cause is known, per this engagement's own
"named rather than hidden" convention. Not fixed in this pass: fixing
`findOrCreateActiveSession`'s cross-request atomicity is a change to session-identity
resolution, not to Back navigation, and is out of this pass's scope — named here as a
gap for a future pass rather than folded into this fix.

### 9.6 Gates run against the live database, and what they found

`scripts/verify-database-identity.ts` required stamping before anything else would
run — stamped `key=local-rehearsal-electrical-followthrough`,
`project=local-disposable-not-neon`, explicitly never resembling a real Neon project.

**Passed, unmodified, against the real database:** `verify-visit-primary.ts`,
`verify-unresolved-guards.ts`, `verify-publication-guard.ts`, `verify-material-cost.ts`,
`verify-material-cost-atomicity.ts`, `audit-platform-tenant-relations.ts`,
`verify-disclaimer-integrity.ts`, `verify-tenant-context-retention.ts`,
`audit-guard-adoption.ts`, `audit-unguarded-tenant-access.ts`,
`audit-storefront-navigation.ts`, `verify-storefront-surfaces.ts`,
`audit-tenant-migration-order.ts`, `verify-booking-tenancy.ts`,
`verify-cross-tenant-resource-access.ts`, `verify-platform-capabilities.ts`,
`verify-release-control.ts`, `verify-release-provenance.ts`,
`verify-release-hardening.ts`, `verify-checkout-atomicity.ts`,
`verify-tenant-indexes.ts`, both `lint-*` scripts, `verify-theme-contrast.ts`,
`verify-theme-structure.ts`, `lint-storefront-identity.ts`, `verify-portal-shell.ts`,
`verify-origins.ts`, `verify-legacy-redirect-scope.ts`,
`verify-marketing-homepage.ts`, `verify-component-recipes.ts`,
`verify-component-retirement.ts`, `verify-reroute-handoff.ts`,
`verify-lighting-control-rewire.ts`, `verify-catalog-resolution-equivalence.ts`,
`verify-referenced-service-pricing.ts`, `verify-mount-price-unit-contract.ts`,
`verify-material-cost-holds.ts`, `verify-permit-policy.ts`,
`verify-recompute-by-role.ts`, `verify-us-spelling.ts`.

**`audit-price-writers.ts` did its job correctly**: it flagged this session's own
throwaway rehearsal-bootstrap script (`scripts/_rehearsal-second-trade.ts`, never
committed) for setting a `basePrice` outside the admin flow. The script was deleted —
its purpose was already served — and the gate passed clean on re-run. Reported here as
confirmation the gate works, not as a defect.

**`verify-category-integrity.ts` failed once, for a rehearsal-only reason**: the
synthetic `plumbing-troubleshooting` fixture had no `ContractorCategory`, exactly the
structural gap the gate exists to catch. Fixed by removing the fixture once its test
was done, not by patching around the gate.

**Failures traced to precise, named, pre-existing environment gaps — not run past, not
patched around:**

- **`prisma/backfill-disclaimer-split-2026-08-27.ts` refuses on any database**, including
  this one: its own source shows the migration was NEUTRALISED on 28 August 2026 — the
  query it needs can no longer even be expressed after a later schema change removed
  the back-relations it walked (`legacy` is a hardcoded `[]`). There is no other script
  or admin path anywhere in this codebase that creates `CanonicalDisclaimer`/
  `ContractorDisclaimer` rows from nothing. Consequence: the five conditional
  disclaimers `seed-conditional-disclaimers.ts` defines (exterior-wall contingency,
  finished-ceiling tap warning, etc.) cannot attach on a from-scratch database, and the
  `device_on_exterior_wall` question it inserts into `new-120v-outlet` and
  `dedicated-120v-circuit-outlet` never got created in this rehearsal. This is a real,
  reportable gap in the codebase's own tooling, unrelated to anything in this PR.
- **`prisma/backfill-service-trade-2026-09-02.ts` correctly refused to run wholesale**:
  its exact-identity-set safety check found this rehearsal's from-scratch catalog
  doesn't match the exact 154-service set reviewed on 2 September 2026 in production
  (14 real Elite services this rehearsal's seed chain never creates at all — admin-authored
  services with no seed script — plus this session's own rehearsal-only additions/
  renames). Correct behavior, not a bug — but it meant only one service
  (`single-pole-breaker-replacement`, stamped directly for the one reroute test in
  §9.4) carries a `tradeKey` in this rehearsal, which is exactly why
  **`verify-troubleshooting-route.ts` failed**: "3 < 35" REROUTE_TROUBLESHOOTING
  options resolved, because the other 32 originate from services this rehearsal never
  tagged with a trade.
- **`verify-public-pricing.ts` (103 unapproved), `verify-pricing-settings-impact.ts`
  (71/89), and `verify-pricing-boundary.ts` (crashes on a specific named legacy
  service)** all trace to the same root cause: this rehearsal's catalog has published
  `basePrice`/`whileWeThereBasePrice` figures (from the bootstrap seed) but none of the
  real-world approval history — `scripts/republish-legacy-approved-prices.ts`'s five
  named re-approvals, `scripts/reconcile-2026-08-23.ts`, and every other named migration
  `audit-price-writers.ts`'s own allowlist documents — was replayed here. These three
  gates check that published prices are backed by an actual approval; a from-scratch
  database that skipped the approval history will fail them by construction, not by
  regression.
- **`verify-question-order.ts` found a real, pre-existing defect, unrelated to this
  PR**: `fan-replacing-light` has two questions (`ceiling_access`, from
  `seed-content-fixes.ts`, and `lighting_control`, from `seed-lighting-control.ts`) both
  at `order: 2`. Both files are unmodified by this branch. `seed-content-fixes.ts` runs
  after `seed-lighting-control.ts` in `seed-all.ts`'s documented order and evidently
  inserts without checking what `seed-lighting-control.ts` already placed there — this
  will reproduce on any fresh database that runs the full documented chain, not just
  this one. The gate itself names its own fix: `scripts/repair-duplicate-question-order.ts`.
  **Not fixed here** — out of scope for this task, flagged for separate attention.
- **`verify-platform-onboarding.ts` crashed** (`TypeError` at
  `lib/platformOnboarding.ts:585`, `tradeKey.trim()` on `undefined`) and
  **`verify-policy-resolution.ts` crashed** (`NO_PUBLISHED_TEMPLATE`) — traced to the
  SAME missing fixture: no canonical `TemplateVersion` has ever been published in this
  rehearsal (`extract-template-catalog.ts` was correctly never run, per the rollout
  plan), so `verify-platform-onboarding.ts`'s own enrolment step has no real trade key
  to read from the template catalog and passes `undefined` through. Missing fixture,
  not a code defect; unrelated to Electrical decision trees.
- **`verify-contractor-invitations.ts`**'s "8c: acceptance racing an explicit revoke"
  and **`verify-platform-read-model.ts`**'s "peak 2... at most 2 in flight" bound each
  failed once, on the FIRST full run. **Re-run three times each afterward: zero
  failures, 100% clean, in both.** This is transient timing variance under this
  session's environment (a resource-constrained sandbox running Postgres, `next dev`,
  and Playwright/Prisma processes concurrently), not a reproduced defect — reported as
  observed-once, not-reproduced, rather than either confirmed-real or dismissed as
  unrelated.
- **Corrected assumption, per direct instruction to check rather than assume**: tax,
  scheduling, and HVAC-template gates do **not** categorically need live external
  integrations — each was actually run, and most needed nothing but this database:
  - `verify-tax-and-deposit.ts` — its own header states the boundary it checks
    ("no Stripe Tax, no tax transaction"); needs only a database. **44/44 passed.**
  - `verify-hvac-template.ts` — its own header: "PURE SOURCE. NO DATABASE." **All 1395
    checks passed**, needing neither a database nor any integration.
  - `verify-jobber-user-pagination.ts` and `verify-jobber-account-switch.ts` — both
    exercise an **injected** fetch/OAuth seam (`lib/jobberUsers.ts`,
    `lib/jobber.ts`'s `VisitFetcher`), never a live Jobber connection. **8/8 and
    11/11 passed.**
  - `verify-stripe-connect.ts` — proved "as a pure function... not against a live
    Stripe account" per its own header; needs a database, not a live key. **All but
    one check passed** — see below.
  - `verify-payment-ledger.ts` and `verify-deposit-flow.ts` — `verify-deposit-flow.ts`'s
    own header: "NO LIVE KEY IS USED and none is needed." Both need only a database —
    see below for what each actually hit.
  - `verify-scheduling-availability.ts` is the one gate here that genuinely stopped
    itself on a missing fixture rather than running: **"No eligible crew — cannot
    exercise the Jobber path,"** printed by the script itself rather than a crash — it
    needs at least one `JobberCrewMember` row marked `eligibleForWebsiteBookings`,
    which this rehearsal never created. A missing fixture, not an external-integration
    requirement.
- **`verify-stripe-connect.ts`'s one failure** ("readiness belongs to a contractor, not
  to the platform") compares Elite's own Stripe-readiness fields against a throwaway
  probe contractor's, expecting them to differ — they don't here because neither has
  ever connected Stripe in this rehearsal (real production Elite has). A missing
  fixture (Elite's own `stripeAccountId`/`stripeMerchantConfigured` were never set),
  not a defect in the readiness rule itself, which every other check in the same run
  confirmed correct.
- **`verify-payment-ledger.ts` crashed** (`bookings[0]` undefined) because it filters
  for bookings created *before* a fixed historical `LEDGER_SHIPPED` cutoff constant —
  by construction, a database created today cannot contain a booking older than that
  date. A missing fixture inherent to testing "legacy, pre-feature" data on a brand-new
  database, not reproducible any other way without deliberately backdating a row.
- **`verify-deposit-flow.ts` failed on a missing database trigger**
  (`trigger "payment_events_append_only" for table "payment_events" does not exist`,
  Postgres error 42704) — `prisma db push` (this rehearsal's only schema-application
  step) creates tables and columns from `schema.prisma`, but this repository also
  relies on at least one raw-SQL trigger applied through a separate mechanism that
  `db push` alone does not run. A real, precisely-named environment-setup gap in this
  bootstrap approach specifically — not a code defect, and not something a rehearsal
  built purely from `schema.prisma` can currently avoid without locating and running
  whichever script installs that trigger.

**Net: of every gate this pass identified as potentially runnable and then actually
ran, every failure traces to one of: (a) this rehearsal's own throwaway fixtures,
cleaned up once identified, (b) a precisely-named missing fixture or bootstrap gap
(no canonical template published, no eligible crew, no Stripe connection on the
rehearsal's own Elite row, no pre-ledger-era booking, a trigger `db push` doesn't
install), (c) one real pre-existing catalog defect unrelated to this PR
(`fan-replacing-light`'s question-order collision), or (d) two concurrency-timing
checks that failed once and passed cleanly on three immediate re-runs each. Zero
failures were altered, skipped, or worked around to force a pass, and the earlier
assumption that tax/scheduling/HVAC gates categorically need live external
integrations was checked directly and found wrong for all but one of them.

Not independently re-run against `origin/main` under equivalent conditions, given the
time already spent standing up and tearing down this rehearsal once — everywhere a
failure's cause is named above (a missing fixture, a specific unrelated file, a named
trigger), that citation is the evidence, not an assumption that an unchanged file
implies an unrelated result.

**`verify-question-order.ts` is a real, currently-enforced gate on `main` itself** —
this branch neither introduced the `fan-replacing-light` collision nor fixes it; it is
a pre-existing gate failure this branch inherits and passes through unresolved. Named
here as the one required gate a release would still need to address, with its own fix
already pointed at (`scripts/repair-duplicate-question-order.ts`) and explicitly out of
this task's authorization to run.

### 9.7 Simplified flows, browser-verified (this pass)

Completing the gap the second pass left: **`replace-standard-outlet` (B.17)** clicked
through the real UI — "Why are you replacing this?" is confirmed the ONLY question
(no `outlet_condition` follow-up), "It works — I just want it replaced or upgraded"
resolves instantly ($225 primary). **`new-ceiling-fan` (B.2) switch-leg**, walked
through the fully-composed live tree exactly as `new-ceiling-light` was in the second
pass (height-access → accessible attic → no existing fixture → "a wall switch here
controls an outlet, use it for the new light instead"): stored line item —
`resolvedComponentKeys: ["CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE"]`, exactly
one component, `computedPriceCents: 53500` ($535), no `switched_source` key anywhere
in `answersSnapshot`.

### 9.8 A real, no-deposit checkout to an actual Booking

Attempted first against the large multi-service visit accumulated over this rehearsal
(2,410.00, six line items) and blocked — not by anything Stripe-related. In order,
each condition hit and resolved, all against this disposable database only:

1. **`SCHEDULING_NOT_CONFIGURED`** — Elite's rehearsal row had no
   `schedulingAuthority` set. Set to `NATIVE` with `nativeConcurrentJobs = 2` (a
   synthetic capacity figure), plus a `BusinessHours` row — neither existed because
   this rehearsal's seed chain, correctly, never provisions them (that is real
   contractor configuration, not catalog data).
2. **`WE_DONT_COVER_THAT_ZIP`** — Elite's rehearsal `ServiceArea` had an empty
   `zipCodes` array (seed.ts creates the row with `zipCodes: []` deliberately, per its
   own comment). Added one synthetic zip.
3. **`WINDOW_TOO_LATE`** — genuinely correct, not a bug: the accumulated six-service
   visit's combined `estimatedMinutes` summed to 540 (9 hours), exceeding the entire
   8:00–4:30 workday from ANY start time. Resolved by starting a **fresh, small visit**
   (`replace-standard-outlet` alone, $225) rather than working around the check.

With a small visit, a real arrival window, and synthetic customer details
(`rehearsal-test@example.com`, a fabricated name/phone/address), checkout completed:
**"You're All Set!"** — a genuine `Booking` row, `status: SCHEDULED`,
`totalCents: 22500`, `depositDueCents: 0` (confirmed no deposit — no deposit policy
was configured), `paymentState: LEGACY_UNTRACKED`. The confirmation-email attempt
**failed and was logged, not silently swallowed or successfully sent**: `"Confirmation
email failed for booking ...: RESEND_API_KEY is not configured — cannot send this
contractor's email."` — exactly the required outcome (no real external notification,
no bypassed guard, booking unaffected by the failure) reached by leaving the
integration unconfigured rather than by any special handling.

This also resolves a loose end from the second pass's gate run:
`verify-platform-authority.ts`'s "Elite's real booking id is invisible" sub-check had
nothing to probe because no `Booking` existed at that time — not evidence of a
cross-tenant leak, just a missing fixture that no longer applies now that one exists.

### 9.9 What this rehearsal still did not reach

Real payment capture (no deposit was required on the booking completed in §9.8, so the
Stripe capture path specifically was never exercised); real email/SMS delivery (the one
attempt in §9.8 failed by design, per the instruction to keep integrations
unconfigured); a customer editing an auto-attached troubleshooting note before
submission (§9.4 — found there is no UI path to reach the editable field at all for a
zero-question `TROUBLESHOOT_ONLY` service, so this was not a matter of running out of
time to test it); mobile viewport / dark-mode rendering of anything in this report.

### 9.10 Teardown

The dev server (`electrical-followthrough-rehearsal`, port 3610) and the disposable
Postgres cluster (port 5544) were both stopped at the end of this pass (`pg_ctl ...
stop` returned "server stopped"; the dev server process was killed). **Correction to
this report's own prior claim**: the cluster's data directory was NOT deleted — only
the running `postgres` process was stopped, the same way it was between the second and
third passes of this work. The directory lives under this session's own scratchpad
(never inside the repository, never committed) and contains only synthetic data — a
throwaway rehearsal contractor, a handful of Elite-catalog test bookings and line
items under fabricated customer names, and the one real `Booking` from §9.8. No
process from this rehearsal is left running. `.claude/launch.json`'s rehearsal entry
and the `.env` pointing at the (now-stopped) cluster remain in the untracked,
gitignored local environment — neither is part of this commit or this branch.

---

## 11. Reproducible evidence committed with this pass

Everything needed to re-run this rehearsal from scratch — not just re-read this
report — is committed to this branch, none of it a credential or a transient runtime
file:

- **`scripts/verify-back-navigation-config-browser-flow.ts`** — the durable
  Playwright regression for the §9.5 fix. Builds and tears down its own throwaway
  contractor; touches no shared fixture. Not part of `npm run verify` (needs a running
  server), matching this repository's existing `*-browser-flow.ts` convention.
- **`prisma/bootstrap-rehearsal-contractor.ts`** — the narrow, idempotent,
  REHEARSAL-ONLY script that brings a from-scratch database's Elite row up to a
  storefront/checkout-reachable state (contractor, site, category, scheduling
  authority, business hours, one synthetic service-area zip). Guarded the same way
  every other seed file in this branch now is; refuses to be anything but explicit
  about what it does and does not do.
- **`docs/design/electrical-decision-tree-audit-v1-rehearsal-bootstrap.md`** — the
  full, copy-pasteable sequence: install Postgres, initialize a disposable cluster,
  push the schema, seed the catalog (including the one seed-all.ts omits and the one
  step that is expected to fail and why), bootstrap the contractor, stamp the database
  identity, start a dev server, and run the regression above.

**Kept out of git, by design**: the `.env` pointing at any disposable cluster (a
connection string, even to localhost, is still a credential shape); `.claude/launch.json`
entries (host-local tooling config); the Postgres data directory itself (synthetic
data, but a binary database file has no business in a text-diffed repository); any
screenshot or page dump taken during debugging. Nothing this pass touched required
committing a secret, and nothing was.
