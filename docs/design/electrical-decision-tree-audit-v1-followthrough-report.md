# Electrical Decision Tree Audit V1 — follow-through report (corrected)

**Status: locally implemented, partially verified.** Nothing in this branch has been
applied to any database, the canonical template, or any contractor's live catalog.
Every claim below is labeled by exactly what kind of evidence supports it —
code-confirmed by reading, DB-free unit-tested, or genuinely unverified — and none of
those labels is a substitute for the others.

Branch `audit/electrical-followthrough-v1`, forked from `origin/main` at `64dcf36`, in
an isolated worktree (`/private/tmp/p2b-audit-followthrough-wt`) with its own `npm ci`
and generated Prisma client. **Not pushed anywhere** — see §8.

This supersedes the earlier five/six-commit version of this same report: this pass
added a correction round (referenced-service pricing hardening, dedicated switch-leg
proof, a pure-function extraction proving B.4, and a real regression found and fixed
in B.16/B.18), bringing the branch to **11 commits**.

## Final commit list (full SHAs)

| # | SHA | Commit |
|---|---|---|
| 1 | `ab1944c5c2db68b519ed1e212ceab68e2afbde0e` | docs: reconcile Electrical Decision Tree Audit V1 against origin/main |
| 2 | `cb8821a85f92c14fe88240db0ab7bde9164cd8fd` | fix: price referenced-service add-ons server-side, stop double-charging switch-leg work |
| 3 | `9ec5e6f17a4d5b9aa203b74d936c81d3f383d3ad` | fix: trade-scope the direct troubleshooting entry, stop discarding reroute context |
| 4 | `d841fdfc0930ff58bc3b63ea9f38fb9a1eb4f78e` | fix: remove four non-consequential mandatory questions, reword one trade-judgment prompt |
| 5 | `2fef53eb97a2252626b3f914a818a2f65752331b` | docs: structural proposals for review — not implemented |
| 6 | `6c0debecec509cb914a940a542bc44012a0a2d04` | docs: follow-through summary report (the version this document replaces) |
| 7 | `81d4ccbc83121a04007a683728c1f46cae59badd` | fix: harden referenced-service pricing against masking, cross-tenant, and display/charge drift |
| 8 | `9a5dfc142f99ecbff1e2ac3b87a30064fb1f08f1` | test: prove the switch-leg fix's composed graph, not just its definition count |
| 9 | `4b6c341b79e221723b8567d7ae5b1428171772dd` | refactor: extract the reroute handoff into pure functions, and prove B.4 without a browser |
| 10 | `79329f7468e90855982fc4af962c9dcb1df1978c` | fix: correct B.16 (drop the mandatory garage_type question) and a real regression it caused |
| 11 | `1e72b529dbb51ef15d19c7a6678e2938329d97db` | docs: catalog rollout plan — not applied |

Full reasoning for every item lives in the commit messages themselves and in the four
companion docs: [reconciliation](electrical-decision-tree-audit-v1-reconciliation.md),
[structural proposals](electrical-decision-tree-audit-v1-structural-proposals.md),
[rollout plan](electrical-decision-tree-audit-v1-rollout-plan.md). This report
synthesizes; it doesn't repeat everything those already say.

---

## 1. What changed, precisely distinguished

Every fix below is a **code and/or seed-definition change on this local branch only**.
None of the four categories below should be conflated with any other:

| | Status |
|---|---|
| **Runtime behavior changed by deployed code** | **None.** Nothing in this branch is deployed anywhere — not to a Preview, not to production. `lib/pricing.ts`, `lib/routeResolver.ts`, `lib/serviceTreeQuery.ts`, `app/api/services/[slug]/route.ts`, `lib/troubleshooting.ts`, `app/api/troubleshooting/route.ts`, `app/[site]/troubleshooting/page.tsx`, `components/guided-flow/*.tsx`, and `lib/rerouteHandoff.ts` are all changed on disk, in commits, on an unpushed branch. No running system's behavior has changed. |
| **Seed definitions changed but not applied** | `prisma/seed-questions.ts` (B.2, B.16), `prisma/seed-device-and-finish-modules.ts` (B.17), `prisma/seed-dedicated-circuit.ts` (B.18), `prisma/seed-appliance-services.ts` (B.18, B.19). Each defines what Elite's catalog *would become* the next time someone with database access runs the specific function — see the rollout plan for exactly which, and why running the whole file isn't recommended for `seed-questions.ts` specifically. |
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
| **B.1** — TV mount add-ons priced at $0 | Refined during correction: the first fix (commit 2) routed the resolved price through `approvedComponentPriceCents`, which had its own masking gap for answers with no components (every mount option today). Commit 7 gives the reference its own `referencedServicePriceCents` field, composing additively with components, checked for same-contractor ownership, and matched to the display DTO so it can no longer show a price the server would refuse. | See §3 — do not read commit 2 in isolation as the fix; commit 7 is. |
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
| Units | `Service.basePrice`/`whileWeThereBasePrice` confirmed cents throughout every consumer read this session (the display formatter, `scripts/republish-legacy-approved-prices.ts`'s own `money()` helper, this fix's own code). **One unresolved concern surfaced, not fixed:** `prisma/seed.ts`'s bootstrap literals for `elite-tilt-mount`/`elite-articulating-mount` (`basePrice: 125`, `basePrice: 200`) read as $1.25/$2.00 if ever interpreted as cents on a fresh database — `scripts/republish-legacy-approved-prices.ts`'s own existence (re-approving, not re-deriving, five legacy prices including these two) suggests the *current* database value is already a real, correct, separately-set figure and the seed literal is a stale bootstrap artifact rather than live truth, but this session had no database access to confirm which is actually true today. **Flagged as a concrete, specific gate for whoever has DB access:** `SELECT "basePrice", "whileWeThereBasePrice" FROM "Service" WHERE slug IN ('elite-tilt-mount','elite-articulating-mount')` before trusting either figure. |

The display DTO's silent fallback (`priceModifierCents: o.referencedService?.basePrice
?? o.priceModifierCents`, which would show a confident price the server was about to
refuse) is corrected: the DTO now returns the same undefined/number/null shape the
resolver does, computed identically, sharing the same `applyBranch`/`answerPriceDelta`
functions client and server both call.

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
- This session's own three new DB-free verifiers — `verify-referenced-service-pricing.ts`
  (16/16), `verify-lighting-control-rewire.ts` (18/18), `verify-reroute-handoff.ts`
  (11/11) — all re-run after every subsequent commit to confirm nothing regressed
  them. 45/45 held throughout.
- All three new verifiers are wired into `package.json`'s `verify:full` chain,
  positioned next to their closest existing thematic sibling (documented in each
  commit message).
- `npx tsc --noEmit`: zero errors, re-run after every single commit in this branch
  (11 runs, 11 clean).
- **`npm run lint` was attempted and found unusable**: this repository has no
  `.eslintrc*` or `eslint.config.*` at all, on this branch or on `origin/main` —
  `next lint` prompts for interactive first-time setup. Not a pre-existing configured
  gate; not force-configured here (that would be an unrequested, unscoped
  infrastructure change).
- **No seed script, `prisma db push`, `capture-*.ts --check`, or any of the ~47
  `PrismaClient`-importing `verify:full` scripts were run** — all genuinely need
  database access this session didn't have.

**What remains blocked, unchanged in substance from the prior version of this report**
(§6 of that version, not repeated verbatim here): every browser-observable claim about
the storefront — TV-mount checkout pricing in a real cart, the switch-leg routes in a
live tree, `/troubleshooting` on a non-default-slugged contractor, the zero-eligible
fallback, real sessionStorage/navigation persistence of the B.4 note, back-navigation,
and the simplification batch's new screens. All of it needs either database access or
a browser session against a running instance of this code, neither available this
pass.

---

## 7. Catalog rollout plan

See the [dedicated rollout-plan document](electrical-decision-tree-audit-v1-rollout-plan.md)
— not summarized further here since it's short and entirely prescriptive (nothing in
it was run).

---

## 8. Deployment-guard state

- Branch `audit/electrical-followthrough-v1` has **not been pushed** to `origin` —
  confirmed after every commit this pass (`git status --short --branch`
  shows local-only, now 11 ahead of `origin/main`, no upstream tracking).
- No PR opened, no CI run, no Vercel build triggered.
- `origin/main` carries no `vercel.json` branch-deployment guard (that mechanism
  exists only on `feat/electrical-routing-v2`) — moot regardless, since nothing was
  pushed.
- **Whether and how to push is addressed as its own decision, separate from this
  report** — see the response accompanying this document for the specific guard
  check performed before any push and its outcome.
