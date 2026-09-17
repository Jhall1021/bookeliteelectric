# Electrical Preview database initialization — executable plan

Documentation and rehearsed tooling only. No Neon branch has been created,
no Preview deployment has been triggered, and `vercel.json`'s
`deploymentEnabled: false` for `integration/electrical-v1-v2-reconciliation`
is unchanged. Every claim below was rehearsed against owned, disposable
LOCAL Postgres targets only (see §6) — nothing here has ever run against a
real Neon database.

**Corrected three times** from code review, all 20 Sep 2026: first, the
designated-target check, the identity-stamp behavior, and the
populated-target rebuild contract were found unready for a real Preview
branch; second, that fix was itself found incomplete in three places; third,
the CONTENT COMPARISON that fix introduced was found to weaken exactly the
verification it was meant to strengthen — stripping every `*Id` field
generically erased real semantic differences (a swapped canonical
component/material/disclaimer/photo-group/category), and sorting the
`questions` array away hid a changed guided-flow sequence. See §1–§4 for
what changed and why, across all three rounds.

## 1. The executable entry point

`scripts/init-preview-database.ts` — a single, identity-checked orchestrator.

```
npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
  [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]
  [--expect-database <database-name>]
```

`--expect-endpoint`/`--expect-project`/`--expect-database` are **required**
once `--target-url` is not a loopback host, and each is checked against
something actually OBSERVED on the target — never accepted merely because
it was supplied (see correction 5 below).

- **No flag writes anything.** Plan mode (no `--apply`) resolves and prints
  the real identity verdict for `--target-url` — including, for a remote
  target, a live read of whether "electrical" already has TemplateVersion
  rows that would need resetting — then prints the exact ordered plan below.
  It does not create a database, push schema, reset anything, or run any
  seed step.
- **Identity is verified before any write, in both modes:**
  - `--target-url` resolving to a loopback host is treated as a **local
    rehearsal** target. A brand-new, uniquely-named scratch database is
    created at the HOST/PORT/USER the URL actually names (never a
    hardcoded one), stamped `local-*`, and dropped again at the end of
    the run.
  - Any other host is treated as a **remote (Preview branch)** target and is
    refused unless it is the exact, designated target — see correction 5.
- **Reuses the accepted catalog construction directly**, not a re-derived
  copy: imports `SEED_STEPS`, `NEEDS_APPLY`, `TOLERATE_NONZERO`,
  `POST_SEED_STEPS`, `bootstrapContractor`, `addMissingCoverRaised4sRole`
  and `applyBatch2fSurgeFix` from `scripts/rehearse-fresh-electrical-
  launch.ts` — the exact same ordered chain that script's own `main()` runs,
  exported so a second entry point can run it against a different target
  without retyping it.
- **Proves "normal contractor setup"** the same way
  `scripts/rehearse-fresh-electrical-launch-phase2.ts` already does:
  `templateVersionSource` → `preflight` → `installCatalog`, once, against a
  throwaway `Contractor` row, deleted again once the proof completes — not a
  browser signup, not a new proof surface, just confirmation that the
  freshly built catalog installs cleanly through the real onboarding path.

### What code review found wrong, and the fix — round 1 (20 Sep 2026, morning)

1. **"Any production-lineage copy + a generic confirmation flag" is not a
   designated-target binding.** `classifyRehearsalTarget` proves a target is
   *a* genuine branch of production — it says nothing about whether it is
   *the one* the operator meant, so it would equally accept a sibling
   rehearsal branch built for a different PR. First fix: required
   `--expect-endpoint`/`--expect-project` flags, checked against the target.
   (Round 2 found this check itself incomplete — see correction 5.)
2. **The remote path used to restamp the identity marker on every apply,**
   which defeats the very check that made the target safe to use.
   `verify-database-identity.ts --stamp` always writes `neonEndpoint:
   <the endpoint currently connected to>` — but a branch's marker only
   proves it's a branch because that field still names *production's*
   endpoint, not its own (`scripts/_lineage.ts`'s own header comment).
   Restamping every remote apply would make `classifyRehearsalTarget` call
   this same target "the original" and refuse it on the very next check,
   including a retry of this same script. Fixed, and still true: a remote
   target's identity marker is never written by this script.
3. **Every rehearsal so far ran against a brand-new, EMPTY database,** but a
   real Preview branch is a Neon copy-on-write clone of production —
   populated, carrying production's own real `electrical` TemplateVersion
   history (a v1 SNAPSHOT plus v2..v6 DELTAs). Left alone, a populated
   clone's real DELTA rows would sit untouched alongside a freshly-rebuilt
   v1, and `templateVersionSource`'s own fold would silently combine them.
   First fix: `resetElectricalTemplateTree`, deleting the TEMPLATE tree.
   (Round 2 found this alone was not enough — see correction 6.)
4. Two claims retracted as unsupported: "every write is scoped to one
   throwaway Contractor row" and "safe concurrently by construction" (true
   only across *different* targets — see §4).

### What code review found STILL wrong, and the fix — round 2 (20 Sep 2026, same day)

5. **`--expect-project` was checked only for presence, then printed as
   "verified"** — no comparison against anything actually observed on the
   target ever occurred, and `--expect-endpoint`'s own comparison used
   `_lineage.ts`'s `endpointOf()`, which discards everything after the
   first hostname segment (so two different endpoints sharing a leading
   segment could compare equal). There was also no database-name check at
   all. Fixed: `readTargetIdentity()` — injectable, unit-tested with
   canned identities, no real Neon connection required — actually queries
   the target's own inherited `database_identity.neonProject` column and
   compares it byte-for-byte against `--expect-project`; the endpoint
   comparison now uses the FULL hostname (`fullEndpoint()`, only the
   `-pooler` suffix stripped); a new `--expect-database` is compared
   against the connection string's own database name. Neon exposes no
   branch identifier over a plain Postgres connection and this repo has no
   Neon API integration — the endpoint, unique per branch's compute, is
   this script's sole VERIFIED proxy for "which branch"; there is
   deliberately no separate `--expect-branch` flag, because an unchecked
   flag that merely echoes an operator's claim back at them is worse than
   no flag at all.
6. **`resetElectricalTemplateTree` deletes the TEMPLATE tree, but
   `extract-template-catalog.ts --from elite-electric` reads its input from
   Elite's own LIVE `Service`/`Question`/`AnswerOption` rows**, and several
   seed files (`bootstrapContractor`, `prisma/seed.ts`'s own
   `service.upsert({..., update: {}})`) leave an already-existing row's
   fields untouched on a re-run — so a populated target's stale Elite
   source data could survive into a "freshly built" catalog even though the
   TEMPLATE side was genuinely reset. Fixed: `resetEliteSourceData()`
   deletes Elite's own `AnswerOption`/`Question`/`Service` rows (bottom-up
   and explicit — rehearsal found `Question.serviceId`/
   `AnswerOption.questionId` carry NO cascade at all, so a direct `Service`
   delete throws a real foreign-key violation), `ContractorCategory`, and
   `ContractorDisclaimer` before the seed chain runs, every time. Also
   fixed: `verifyIntendedCatalogIsCurrent` now calls the REAL fold
   (`templateVersionSource(...).load()`) instead of a raw
   `TemplateService.count()`, and accepts an optional normalized-content
   fingerprint to compare against a known-clean control build — a matching
   service count was never proof the CONTENT was the intended one. See §6.C
   for the rehearsal that runs the REAL construction chain (not synthetic
   inserts) against a deliberately dirtied, already-populated target.
7. **Every subprocess used `stdio: "inherit"`**, so a child's own error
   output (Prisma's and psql's connection-failure messages both embed the
   literal connection string) would stream straight to the terminal/log
   before this script ever got a chance to look at it; `main().catch
   (console.error)` and `printPlan`'s own catch block printed raw
   `Error.message`/stack text for the same reason. Fixed: every subprocess
   now runs through `runCaptured()` (piped, never inherited, stdio) and
   every place that logs an error or subprocess output passes through
   `sanitizeSecrets()` first — proven against a real injected secret in
   §6.D, not just read for absence of an obvious leak. The throwaway proof
   contractor `proveNormalContractorSetup` creates is now actually deleted
   when it's done (previously left to accumulate, one per retry); a cleanup
   failure is reported, never swallowed.

One honesty correction alongside the above, not a code change: an
already-installed contractor's `Service` row surviving
`resetElectricalTemplateTree` at the DATABASE level (still true, proven in
§6.B) does NOT mean that installation stays FUNCTIONAL.
`lib/disclaimerAuthoring.ts`'s `installedDisclaimerRequirements` looks up
that service's originating `TemplateService` by `(templateKey,
templateVersionId)` — a `TemplateVersion` this reset just deleted — so
disclaimer resolution silently finds nothing for it afterward. This is
expected and accepted for a disposable Preview/rehearsal database, not a
defect requiring a migration path.

### What code review found STILL wrong, and the fix — round 3 (20 Sep 2026, later the same day)

8. **The normalized-content comparison introduced in round 2 was not
   trustworthy.** It stripped every key ending in `Id` and sorted every
   array. Two real consequences: (a) `templateVersionSource`'s own query
   leaves FOUR foreign keys on option-level rows unresolved —
   `canonicalComponentId`/`canonicalMaterialId`/`canonicalDisclaimerId`/
   `photoGroupId` (`prisma/schema.prisma:4442-4583`), plus service-level
   `canonicalCategoryId` — and those are the SEMANTIC identity of the row,
   not row churn, so stripping them meant swapping WHICH canonical
   component/material/disclaimer/photo-group/category an option or service
   references could disappear from the fingerprint entirely; (b) sorting
   the `questions` array alphabetically discarded the one thing that array's
   order actually encodes — the real guided-flow entry/sequence
   (`QUESTION_ORDER`) — so a changed sequence was invisible, not just a
   changed `order` NUMBER. Fixed: `buildSemanticKeyMaps`/`resolveSemanticIds`
   resolve each of the five ids to its stable `key`/`slug` via one batched
   lookup per kind BEFORE normalization runs, so the raw id can then be
   safely stripped as pure churn; `normalizeForComparison` compares
   `questions` and `options` BY POSITION (never re-sorted) and rewrites
   their `order` to the array's own rank, tolerating non-deterministic
   numeric SPACING without tolerating an actual sequence change. See §6.E
   for the fast, no-database negative controls proving this: a swapped
   component/disclaimer key, a swapped question sequence, a routing change,
   and an access-condition change each now correctly FAIL equivalence;
   regenerated opaque ids and a harmless reorder of an unordered set still
   correctly PASS.
9. **Tracing WHY `order` was non-deterministic on materials and questions
   found two real, narrow bugs, not just an artifact to work around.**
   `prisma/seed-conditional-disclaimers.ts`'s exterior-wall attachment and
   `prisma/seed-content-fixes.ts`'s fan-replacing-light access-question
   attachment each insert a new question mid-tree at `after.order + 1`
   without shifting whatever already occupied that slot — so on
   `dedicated-120v-circuit-outlet`, the newly-inserted `device_on_
   exterior_wall` question landed on the SAME `order` as the pre-existing
   `dedicated_distance`, and on `fan-replacing-light`, the newly-inserted
   `ceiling_access` question tied with the pre-existing `lighting_control`.
   Both are FIXED at the source (each now shifts every question at or after
   the insertion point by one, only on first creation — a re-run of either
   file stays idempotent). Confirmed by rebuilding twice and diffing the raw
   fold output before the fix (a real, reproducible mismatch) and after (a
   clean match, `docs/design/electrical-preview-initialization.md` §6.C).
   Neither tie was at a service's ENTRY question, so this was never a live
   guided-flow defect for a homeowner — but it was real non-determinism in
   stored `order` values, exactly the kind `normalizeForComparison`'s
   rank-by-position rule is designed to tolerate for HARMLESS cases while
   still catching a genuine sequence change; fixing the source removes the
   only two cases that were ever hitting that tolerance in practice.
10. **`resetEliteSourceData` invented an authorization boundary that wasn't
    real.** It left `Quote`/`LineItem`/`PricingRule` alone on the theory
    that they might be active-customer transaction history — Joshua's
    authorization is not scoped that way: disposable bookings, quotes, and
    sessions on a rehearsal/Preview target are explicitly included, the
    same as the catalog itself. Fixed: all three are now deleted, scoped to
    Elite's own services, in dependency-safe order (`Quote` before
    `LineItem`, since `Quote.lineItemId` is a non-cascading unique FK).
    `GuidedFlowSession` needed no new step — it already cascades from
    `Service`. Alongside this, `assertNoUnsupportedServiceDependency` now
    runs FIRST, before any delete: it reads `pg_constraint` for every
    foreign key into `services` and refuses UP FRONT if one exists that
    isn't already on the known, handled list — which caught a real,
    previously-unlisted one while this was being rehearsed:
    `AnswerOption.referencedServiceId` (a genuine, separate FK from
    `AnswerOption.questionId`, e.g. a TV-installation answer option
    pricing itself off Elite Tilt Mount's own live price) needed adding to
    that list; `AnswerOption.rerouteServiceId`, by contrast, turned out to
    be a bare `String?` with no real `@relation` at all, the same
    provenance-only pattern as `templateKey`. See §6.B for the fabricated-
    dependency rehearsal proving the refusal fires before any delete, not
    partway through one.
11. Two hygiene fixes while in these files: a local `--target-url`'s
    password was silently dropped when reconstructing the scratch
    connection string (now preserved, and passed to `psql` only via
    `PGPASSWORD` — never a CLI argument, which would sit in `ps` output and
    shell history); the populated-target rehearsal's own `PrismaClient`
    disconnected only at the end of its function body, so a failed
    assertion anywhere above that point left the connection open — which is
    what made this same database's own `DROP DATABASE` fail with "being
    accessed by other users" the first several times this was rehearsed
    (§6.C). Fixed with `try`/`finally`.

### What code review found STILL wrong, and the fix — round 4 (small, targeted)

12. **`rebuildElectricalCatalog` called `resetElectricalTemplateTree`
    BEFORE `resetEliteSourceData`'s own `assertNoUnsupportedServiceDependency`
    preflight ever ran** — so an unsupported dependency, refused inside
    `resetEliteSourceData`, still left the TEMPLATE tree already deleted by
    the prior call. The helper-level proof in §6.B (round 3) showed
    `resetEliteSourceData` alone leaves Elite's source untouched on
    refusal; it did not prove the ORCHESTRATOR leaves BOTH trees untouched,
    since the template delete had already happened by the time the check
    ran. Fixed: the preflight now runs once, via
    `assertNoUnsupportedServiceDependencyStandalone`, before EITHER reset.
    A new orchestrator-level test (§6.B, check 9b) proves this with a
    minimal existing Elite Service and the same fabricated dependency table
    used in check 9 — no full 82-service rebuild needed to prove an
    ordering fix.

## 2. The exact ordered plan (what `--apply` actually runs)

1. `prisma db push --skip-generate --accept-data-loss` against the target.
2. **Local target only:** `scripts/verify-database-identity.ts --stamp`,
   recording `local-previewinit-<name>` / `local-disposable-not-neon`. A
   remote target's inherited marker is never written — see correction 2.
3. **Local target only:** `assertDisposableLocalDatabase` — the same
   belt-and-braces re-check `rehearse-fresh-electrical-launch.ts`'s own
   `main()` performs before writing, redundant with step 2 by design.
4. **`assertNoUnsupportedServiceDependencyStandalone`**: refuses up front,
   before EITHER of steps 5/6, if `services` carries a non-cascading
   foreign key this chain doesn't already know how to clear (correction
   10; moved to run before both resets in correction 12 — it used to run
   only inside step 6, by which point step 5 had already deleted the
   template tree).
5. **`resetElectricalTemplateTree`**: delete every existing `TemplateVersion`
   row for `trade: "electrical"`. Rehearsal found this needs an explicit,
   ordered first step of its own: `TemplateAnswerOption.
   templatePolicyDefinitionId` is the one deliberate `onDelete: Restrict` in
   the template tree, and Postgres does not reliably resolve that within a
   single cascading delete of `TemplateVersion` — deleting `TemplateAnswerOption`
   rows explicitly first (before deleting `TemplateVersion` itself) is what
   makes the rest of the tree cascade cleanly. On a fresh local database
   this whole step is a no-op; on a populated remote clone it is the real,
   destructive step that makes the rebuild in steps 7-8 authoritative
   instead of folding onto whatever the clone already had. See §3 for why
   this cannot reach anything already installed.
6. **`resetEliteSourceData`**: `Quote`/`LineItem`/`PricingRule` scoped to
   Elite's own services (in dependency-safe order), then Elite's own live
   `AnswerOption`/`Question`/`Service` rows (bottom-up, explicit — see
   correction 6), then `ContractorCategory` and `ContractorDisclaimer`.
   Distinct from step 5: this is the SOURCE `extract-template-catalog.ts`
   reads FROM, not the template it writes TO. `Quote`/`LineItem`/
   `PricingRule` are included deliberately, not skipped — see correction 10
   for why an earlier version
   invented a boundary here that Joshua's authorization doesn't draw.
7. `bootstrapContractor` + `addMissingCoverRaised4sRole` (the one real,
   pre-existing gap this branch's own fresh-launch rehearsal found and
   fixed — see `docs/design/electrical-fresh-launch-reset-manifest.md` §11).
8. The 49 files in `SEED_STEPS`, in the exact order that constant lists,
   each with `--apply` where `NEEDS_APPLY` says so — run through
   `runSanitized`, never inherited stdio (correction 7).
9. Post-seed steps, in order: the Batch 2F surge-protection fix, Batch 2E's
   `add-consumables-recipes.ts --apply`, `repair-trees.ts`, full-catalog
   extraction (`extract-template-catalog.ts --from elite-electric --apply`),
   the panel-replacement recipe correction, and the two Routing V2 template
   patches.
10. **`verifyIntendedCatalogIsCurrent`**: call the REAL fold via
    `buildCatalogFingerprint` (`templateVersionSource(...).load()`, then
    `resolveSemanticIds`/`normalizeForComparison` — correction 8) and assert
    exactly one `electrical` `TemplateVersion` row exists with the expected
    82 services — not inferred from step 11's install count, which reads
    through the same fold that could be silently wrong. When called with a
    known-clean control's fingerprint (§6.C only — not part of a normal
    `--apply` run, which has no second build to compare against), also
    asserts the normalized CONTENT matches — semantic keys resolved,
    question/option sequence preserved by position — not just the count.
11. A real `preflight`/`installCatalog` install for one throwaway
    contractor — proof the catalog a real onboarding contractor would see
    actually installs — then that contractor is deleted (correction 7).
12. **Local target only:** drop the scratch database. A real Preview target
    is left in place — this script does not own its lifecycle and never
    drops it.

Every one of these steps already exists and is already proven, individually,
elsewhere in this repository, or is new this round and proven in §6; this
script's own contribution is the identity guard, the two-part reset/verify
pair around a populated target, and the single command that runs all of it
in order against a chosen target.

### Retry / partial-failure contract

A failed apply, followed by a retry (same command, same target), is safe
with respect to BOTH the `electrical` template tree AND Elite's own live
source: steps 5 and 6 reset both unconditionally at the start of every
apply (behind the one dependency preflight in step 4 — correction 12), so a
retry always rebuilds from a clean slate regardless of how far a prior
attempt got. Rehearsed for real in §6.C: a target left in a genuinely
half-seeded state (only the first half of `SEED_STEPS` ran, no extraction,
no `electrical` TemplateVersion at all yet) converges to the same
normalized fold content as a clean control on retry. The throwaway proof
contractor step 11 creates no longer accumulates across retries either —
corrected this round (was previously left to accumulate; see correction 7).

## 3. Preserving owner access and every other trade

Every reset above is scoped narrowly, and it is not merely a convention:

- **`resetElectricalTemplateTree`** queries `where: { trade: "electrical" }`
  only — it cannot select another trade's `TemplateVersion` rows at all.
  It is also structurally incapable of reaching anything already
  installed: `Service.templateVersionId`, `Question.templateVersionId`, and
  `AnswerOption.templateVersionId` (and their `templateKey` siblings) are
  plain `String?` scalars with **no `@relation` at all**
  (`prisma/schema.prisma:2440-2444`'s own comment: "A RECORD, not a link:
  nothing reads through it at request time"). Deleting a `TemplateVersion`
  row therefore cannot cascade to, restrict, or null out any
  already-installed `Service`/`Question`/`AnswerOption` row for ANY
  contractor.
- **`resetEliteSourceData`** queries `where: { contractorId: elite.id }`
  only, for ONE named contractor (`elite-electric`) — never a broader
  "all contractors" delete. No `User`/`ContractorMembership` row is queried
  at all.

§6.B and §6.C's local rehearsals prove both of these empirically, not just
by reading the schema: a sentinel owner User/ContractorMembership, a
sentinel other-trade TemplateVersion, and an already-installed contractor's
live Service all survive every reset and every real rebuild tried,
including the dirtied-and-rebuilt and partial-failure-and-retried cases.

**Corrected this round:** the previous claim that "every write is scoped to
[templates] and one throwaway Contractor row" was incomplete. The chain
ALSO writes Elite's own live source data (step 6, now a real, scoped
DELETE, not merely an insert-only write) and global canonical reference
rows shared across trades (`CanonicalMaterial`/`CanonicalComponent`/etc.,
written by several `SEED_STEPS` files) — those are additive upserts keyed
by electrical-specific keys, never a delete, so they cannot remove or alter
any other trade's own distinct keys in the same shared tables, but they are
real writes to shared tables and the earlier claim should not have implied
otherwise.

## 4. Database isolation between concurrent runs

This script never touches `p2b_integration_seeded` or any other shared
rehearsal database — a local run creates and destroys its own uniquely
named scratch database, and a remote run only ever proceeds against the one
designated target `--expect-endpoint`/`--expect-project`/`--expect-database`
name, which a shared rehearsal cluster could never satisfy. Running this
script against a DIFFERENT target than another session's own DB-driving
work is therefore safe — there is no shared target for the two to collide
on, matching the standing rule (project memory: "never run two DB-driving
chains at once" applies to the shared cluster specifically, not to
independently-targeted owned databases).

**Retracted from the first version:** "safe concurrently by construction"
overstated this. Two runs of THIS script against the SAME remote target at
the same time are NOT safe — the preflight+resets (steps 4-6) and the
rebuild (steps 7-10) are a sequence of separate subprocess and Prisma calls, not one
transaction, so a second run's reset could fire in the middle of the
first's rebuild. Nothing currently prevents that; it is avoided by
operational discipline (one apply against a given designated target at a
time), the same discipline every other DB-driving chain in this repo
already requires, not by anything this script enforces itself.

## 5. Application integration isolation — separate from database ownership

Everything above is about which DATABASE this script writes to. A real
Preview deployment also needs its own configuration for every external
integration the app talks to, independent of database ownership, and
NONE of it is implemented or provisioned by this script or this task:

- **Auth (Better Auth)** — base URL and trusted origins must name the
  Preview deployment's own URL, not production's; a Preview branch sharing
  production's auth configuration would issue or accept cookies/sessions
  scoped to the wrong origin.
- **Email** — `PLATFORM_MAIL_SINK` (dev-mode file sink) throws in production
  mode; a Preview deployment needs its own explicit choice (a sink, or a
  real provider pointed at a Preview-only sending identity) rather than
  inheriting production's real email provider and accidentally sending
  Preview-generated mail to real homeowners/contractors.
- **Payments** — must use test-mode keys scoped to Preview, never
  production's live payment credentials.
- **Jobber** — needs its own OAuth app/redirect URI registered for the
  Preview deployment's own URL; production's Jobber OAuth app's redirect
  URI will not match a Preview origin and must not be reused.
- **SMS** — needs Preview-scoped (test) credentials, not production's.
- **File storage** — needs a Preview-scoped bucket/prefix, not production's,
  so anything a Preview deployment writes (photos, generated documents)
  does not land in production's real storage.
- **Webhook callback URLs** — anything registered with an external
  provider that calls back into the app (payments, Jobber, SMS delivery
  status) must point at the Preview deployment's own URL.

Each of these is a separate, explicit configuration decision for whoever
provisions the actual Preview deployment — this document flags them so
they are not silently forgotten once the database side is ready; none of
them is attempted here.

## 6. Rehearsal evidence (local targets only)

Two separate scripts, neither touching a real Neon database. All scratch
databases were confirmed dropped after every run (direct `pg_database`
listing before/after); every failure encountered while building this
evidence — six real ones across all three rounds, listed below — was fixed
and re-verified before being called done, not worked around.

**A. `scripts/init-preview-database.ts` end-to-end**, run against a
brand-new local scratch database it created and dropped itself
(`127.0.0.1:5544`, name generated at run time, `p2b_previewinit_<run-id>`):

- **Plan mode**: printed the identity verdict and the 11-step plan above,
  correctly reporting "nothing to reset" for both reset steps on a fresh
  database. Confirmed zero writes via a direct database listing.
- **Local apply**: real run, real output — both reset steps correctly
  reported nothing to reset, **82 of 82 services extracted**, `FOLDED
  CATALOG VERIFIED: exactly one "electrical" TemplateVersion (v1 SNAPSHOT,
  ...) with 82 services`, `NORMAL CONTRACTOR SETUP PROVEN`, and
  `Cleaned up proof contractor <id>` confirming the throwaway contractor no
  longer accumulates.

**B. `scripts/verify-init-preview-database-contract.ts`** (extended this
round with section E) — rehearses what (A) structurally cannot exercise.
**40 checks, 40 passed** (including new check 9b, the orchestrator-level
ordering proof from correction 12), in five parts:

- **A. Designated-target binding** (`decideRemoteTarget`, pure function, no
  database, injectable `readIdentity`/`classify`): the correctly-declared
  endpoint/project/database with a passing lineage verdict is accepted; a
  sibling rehearsal branch (different OBSERVED endpoint) refuses on the
  binding mismatch alone, and the refusal never contains a raw connection
  string; the SAME sibling branch is accepted once it is the one actually
  declared; production's own endpoint refuses via the explicit inequality
  check BEFORE any identity read or lineage call is even made (proven by
  making both throw if invoked); missing declarations refuse before
  identity is read, for the same reason; an OBSERVED project that differs
  from `--expect-project` refuses even with a matching endpoint; an
  OBSERVED database name mismatch refuses; an unreadable/unmarked project
  refuses rather than passing.
- **B. Reset mechanics** (`resetElectricalTemplateTree`,
  `resetEliteSourceData`, `verifyIntendedCatalogIsCurrent`, real local
  Postgres): a fabricated inherited SNAPSHOT+DELTA, a sentinel other-trade
  TemplateVersion, a sentinel owner User/ContractorMembership, and an
  already-installed contractor's live Service are all set up before the
  reset; a fabricated non-cascading foreign key into `services`
  (`create table ... references services(id)`) proves
  `assertNoUnsupportedServiceDependency` refuses BEFORE deleting anything,
  with the already-installed Service still present immediately after the
  refusal — not partway through a half-finished delete; the SAME fabricated
  dependency, exercised against `rebuildElectricalCatalog` directly with a
  minimal existing Elite Service also present, proves the ORCHESTRATOR's
  refusal leaves BOTH the template tree and Elite's source untouched
  (correction 12 — the preflight used to run only inside step 6, after
  step 5 had already deleted the template tree); with the dependency
  removed, the template reset deletes exactly the fabricated
  electrical versions and nothing else; a clean 2-service rebuild passes
  verification via the real fold; a fabricated stray second version
  correctly makes verification refuse rather than trust a plausible count.
- **C. Populated-target rebuild and retry** (`rebuildElectricalCatalog`,
  the REAL 82-service construction chain — not synthetic inserts): a clean
  control build, sentinel rows confirmed to survive it; the SAME database
  then dirtied (an altered Elite `AnswerOption` label, a stale extra Elite
  `Service`, a later fabricated `electrical` DELTA at version 99, AND a
  real disposable `Visit`/`Customer`/`LineItem`/`Quote`/`PricingRule`
  fixture against one of Elite's own live services — the explicitly
  authorized test-booking dependency `resetEliteSourceData` now clears,
  correction 10) and rebuilt again — the rebuild converges on the SAME
  normalized fold content as the control, all four dirty/disposable
  fixtures are confirmed gone, and sentinels still survive; the database
  then driven into a genuine partial-failure state (reset, then only the
  first HALF of `SEED_STEPS` run — no extraction reached, zero `electrical`
  TemplateVersion rows exist at that point) and rebuilt a third time as
  "the retry" — again converges on the control's content, sentinels still
  intact.
- **D. Credential-safe error output**: a real child process (not a mock)
  that fails with a fabricated credential embedded in both its stdout and
  stderr, proving `runCaptured`/`sanitizeSecrets` strip it before anything
  is logged and leave a `[redacted]` marker in its place.
- **E. Comparison semantics** (new this round, fast, no database —
  `normalizeForComparison`/`resolveSemanticIds` exercised directly against
  hand-built fold-shaped fixtures matching `templateVersionSource`'s own
  raw output shape): swapping a referenced component's, a disclaimer's, or
  a service's canonical key each changes the fingerprint; reversing which
  question comes first changes it (questions compared BY POSITION, never
  re-sorted); a routing change and an access-condition change each change
  it. Regenerated opaque row ids (identical semantic content) leave it
  unchanged; a harmless order-VALUE difference on an unordered material
  line leaves it unchanged; a question order-VALUE tie broken differently
  with the SAME actual sequence leaves it unchanged (rank, not the raw
  number, is what's compared) — the exact shape of the two real seed bugs
  found and fixed below.

**Six real bugs found and fixed while building this evidence, across all
three rounds** (not worked around):

1. `resetElectricalTemplateTree`'s cascading delete threw `Foreign key
   constraint violated: template_answer_options_templatePolicyDefinitionId_
   fkey` the first time it ran against a genuine, policy-carrying v1
   SNAPSHOT (a toy fixture with no policies attached had never exercised
   this) — `TemplateAnswerOption.templatePolicyDefinitionId`'s deliberate
   `onDelete: Restrict` is not reliably resolved within one cascading
   `TemplateVersion` delete. Fixed by deleting `TemplateAnswerOption` rows
   explicitly first.
2. `resetEliteSourceData`'s (and separately, `proveNormalContractorSetup`'s
   own cleanup's) direct `service.deleteMany` threw `Foreign key constraint
   violated: questions_serviceId_fkey` — `Question.serviceId` and
   `AnswerOption.questionId` carry NO cascade at all. Fixed by deleting
   `AnswerOption` then `Question` explicitly before `Service`, the same
   order `scripts/verify-disclaimer-template-version-fold.ts`'s own
   `teardownTrade` already used for its own synthetic contractor.
3. A SECOND, previously-unlisted non-cascading FK into `services` surfaced
   once `assertNoUnsupportedServiceDependency` (correction 10) started
   checking `pg_constraint` directly: `AnswerOption.referencedServiceId` —
   genuinely separate from `AnswerOption.questionId`, and already deleted
   in the right order by (2) above, just missing from the known-safe list.
   `AnswerOption.rerouteServiceId`, checked at the same time, turned out to
   be a bare `String?` with no real `@relation` at all — confirmed by its
   absence from the schema, not assumed.
4. The FIRST version of the normalized-content comparison (round 2) failed
   on the first real populated-rebuild attempt even though the rebuild was
   correct — diffing two independent clean builds' raw fold output found
   `extract-template-catalog.ts` assigns `TemplateServiceMaterial.order`
   and `TemplateQuestion.order` non-deterministically. That version's fix
   (excluding `order` outright) was itself found incomplete in round 3 —
   see correction 8 — and replaced with semantic-key resolution plus
   positional/rank comparison.
5. Tracing WHY `order` was non-deterministic (round 3, correction 9) found
   the two real seed-file bugs described there —
   `prisma/seed-conditional-disclaimers.ts` and `prisma/seed-content-
   fixes.ts` each inserting a question mid-tree without shifting whatever
   already held that slot — confirmed by direct SQL against a real build
   (`dedicated-120v-circuit-outlet`'s `dedicated_distance` tied with the
   newly-inserted `device_on_exterior_wall` at `order=4`;
   `fan-replacing-light`'s `lighting_control` tied with the newly-inserted
   `ceiling_access` at `order=2`), fixed at the source, and re-verified by
   rebuilding twice more and confirming zero order ties remain anywhere in
   the 82-service catalog.
6. The populated-target rehearsal's own scratch database repeatedly failed
   to drop with "being accessed by other users" — traced to
   `populatedRebuildAndRetryScenario`'s `PrismaClient` disconnecting only
   at the very end of its function body (correction 11); fixed with
   `try`/`finally`.

Deliberately not re-run this round, per the instruction not to reopen the
existing decision-tree/booking proofs: the browser-flow disclaimer-
authoring proof, the template-version-fold scenarios, and the
access-conditional-component proof — all already green from a prior round,
exercising `lib/disclaimerAuthoring.ts`/`lib/templateProvisioning.ts`
reachability and `lib/pricing.ts`'s component selection, none of which this
round's fixes touched. No repeat of the full homeowner/adoption browser
suites, and only one meaningful end-to-end clean/dirty/retry construction
proof (§6.B/C above), not several, per the same instruction.

## 7. Current `main` reconciliation needed

**RESOLVED — `main` merged at `34ecced6f206dcca758c5bfe170aee498ae1275a`.**
The reconciliation this section describes is done, not still needed: the
merge landed on this branch with `origin/main`'s
`1a704254128e60974226e96175c8739877e48057` checkpoint confirmed an ancestor
of it, PR #63 stayed draft and mergeable throughout, and the normal `npm
run build` (`prisma generate && verify:fast && next build`) is now reported
green end-to-end, not just `next build` alone. The analysis below is kept
as the record of what that reconciliation actually involved and how the
conflicts were read; treat it as history, not an open task. The
`main`-reconciliation line under §8's deferred list is resolved for the
same reason.

**Corrected 20 Sep 2026** — the previous revision of this section had the
comparison backwards. Measured directly
(`git rev-list --left-right --count origin/main...HEAD` from this branch,
re-verified against GitHub's own compare view for `main...d7e5713` with
`main` at `1a70425`): this branch is **148 commits AHEAD of `main` and 24
commits BEHIND it**, with 243 files differing (~50,000 lines). The earlier
"24 ahead, 147 behind" reversed which side led; it also invited reading the
`lib/electrical/*` surface below as "missing from main" when in fact most
of that diff volume — the large run of new `scripts/verify-*.ts`/
`scripts/audit-*.ts` files and the Routing V2/derived-pricing work — is
this PR's own ahead-of-main work, not a gap this branch needs to absorb.
The real gap this branch is missing is the 24-commit behind side, not the
total size of the diff in either direction; do not infer conflict scope
from total PR diff size.

The 24-commit gap is small and concrete — five merged PRs (`git log
HEAD..origin/main`): #70 (Batch 2E consumables-only services), #71 (Batch
2F surge/bathroom-fan cleanup), #72 (Elite TV-mount reconciliation), #73
(Materials Catalog V1 admin surface), #74 (guided-flow entry-service
provenance), #75 (dedicated-circuit entry aliases) — 33 files, 4045
insertions / 87 deletions total (`git diff --shortstat HEAD...origin/main`).
That is the actual reconciliation surface, not the 245-file / ~50,700-line
total the ahead-side diff produces:

- The correction this section previously got backwards: **`lib/electrical/*`
  belongs to THIS branch, not to `main`.** `git diff --stat HEAD origin/main
  -- lib/electrical/` shows those 20 files as pure deletions when comparing
  toward `origin/main` — i.e. `main` has none of them. The derived-pricing,
  pilot, Route Assist adapter, and surface-takeoff surface is this PR's own
  ahead-of-main work (matching project memory's note that Route Assist and
  the pilot program are a separate, parallel workstream that has been
  landing here, not on `main`). Nothing about `main`'s Electrical experience
  is ahead of this branch's own catalog/disclaimer work in that respect.
- Most of the 33 changed files are the Materials Catalog admin UI/lib
  (`components/admin/materials/*`, `lib/materialCatalog.ts`,
  `lib/materialCategory.ts`, `app/dashboard/materials/page.tsx`) and new
  `scripts/verify-*.ts`/`scripts/audit-*.ts` read-only tooling — additive,
  low merge-conflict-risk surface once schema.prisma itself reconciles.
- **`prisma/schema.prisma` diverges on both sides**, and by different
  amounts in each direction: `git diff --stat HEAD...origin/main --
  prisma/schema.prisma` (main-only, the behind side) is 58 insertions / 8
  deletions; `git diff --stat origin/main...HEAD -- prisma/schema.prisma`
  (this-branch-only, the ahead side) is 698 insertions / 30 deletions. Both
  sides have added real, independent model/field changes (this branch's own
  three rounds of disclaimer/access-classification/component-condition
  schema work included) — the highest-risk reconciliation surface, needing
  a person or a dedicated session to read both sides together, not a
  mechanical rebase.
- The actual file-level overlap — files BOTH sides changed independently,
  computed directly (`comm -12` between `git diff --name-only
  origin/main...HEAD` and `git diff --name-only HEAD...origin/main`), not
  estimated: `app/api/admin/materials/route.ts`, `app/api/quotes/route.ts`,
  `app/api/visit/route.ts`, `components/guided-flow/GuidedFlowEngine.tsx`,
  `components/guided-flow/RerouteNotice.tsx`, `lib/guidedFlowSession.ts`,
  `package.json`, `prisma/schema.prisma`, `scripts/audit-price-writers.ts`.
  This replaces the previous revision's overlap list (`app/dashboard/
  policies/page.tsx`, `app/api/services/[slug]/route.ts`, `app/dashboard/
  setup/page.tsx`, `lib/auth.ts`), which does not actually appear in this
  direct computation and should not be relied on.
- `vercel.json` does not exist on `main` at all — it is a file unique to
  this branch and its sibling audit/feature branches, created specifically
  to hold the `deploymentEnabled: false` map. Reconciling onto `main` means
  deciding whether that map (or an equivalent) needs to exist on `main`
  too, not assuming it carries over automatically.

**Conclusion — now resolved.** A real Preview deployment meant to reflect
"the accepted work reviewed in PR #63" needed this branch reconciled with
the 24-commit `main`-only gap first, or the Preview build would have been
missing Batches 2E/2F's production publication, the TV-mount
reconciliation, the Materials Catalog admin surface, guided-flow
entry-service provenance, and the dedicated-circuit entry aliases. That
reconciliation happened (see the RESOLVED note at the top of this
section) — the gap this paragraph describes is closed, and nothing about
Preview readiness is blocked on it anymore.

## 8. What is still deferred, deliberately

- Creating an actual Neon Preview branch. No Neon API integration exists
  anywhere in this repository (confirmed by search) — provisioning the
  branch itself stays a manual/external step outside this script.
- Flipping `vercel.json`'s `deploymentEnabled` entry for this branch to
  `true`. Unchanged by this task, per the standing rule.
- Running `scripts/init-preview-database.ts --target-url <a-real-Neon-URL>
  --apply --expect-endpoint <endpoint> --expect-project <project-id>
  --expect-database <name>`. Everything above proves the script's own
  logic, including its populated-target reset/rebuild contract (§6.C); it
  has never been pointed at anything but a local disposable or
  locally-fabricated target.
- ~~The `main` reconciliation itself (§7).~~ RESOLVED — merged at
  `34ecced6f206dcca758c5bfe170aee498ae1275a`; see §7's own note.
- The application integration isolation checklist (§5) — none of those
  configuration decisions have been made or implemented.
- Any production reset. Unrelated to and unblocked by this document.

Each of the above needs its own explicit, in-conversation authorization
before it happens, per this engagement's standing rule.

## 9. The concrete Preview run — target, configuration, verification flow

Prepared against the accepted `63b6a0c`. Nothing in this section has been
executed — no Vercel setting changed, no Neon branch created, no push made.
It identifies the exact target and commands so the one open safety question
(9.2) can be resolved before anything here runs.

### 9.1 Vercel target — reuse the canonical project, do not create one

**Do not trust this worktree's own `.vercel/repo.json`.** It resolves to
`prj_1It8oJtHqAf2RsFSqvfKjq48xJEw` / team `team_HKmHTQvv3B0oDD0DeYdxkh0x` —
the **legacy** `elite-9658`/`bookeliteelectric` project. That project's Git
integration to this exact GitHub repo was **disconnected 6 Sep 2026**
(project, deployments, domains and aliases left intact, but it no longer
builds from pushes at all) once it and the canonical project were both
building `main` and racing each other's fixtures into the production
database. That local link file is a stale artifact of whenever this
worktree/checkout was last `vercel link`-ed; it predates the disconnection
and must not be read as "the project this repo deploys to" for anything
written after 6 Sep.

**The actual git-connected project, since 6 Sep 2026, is the canonical
`price2book` project** — `prj_zB0QVq80340s2dVt7X3c1ewKgHtT`, team
`price2-book`, connected to this SAME repo (`Jhall1021/bookeliteelectric`),
production branch `main`. This is confirmed by `scripts/migrate-vercel-env.ts`'s
own `TARGET` constant (same project/team ids) and by session project memory
(`controlled-release-is-live`, `deploy-gate-and-legacy-vercel`). **Reuse this
project — do not create a new one.** A Preview deployment of a non-`main`
branch on a git-connected project is Vercel's own standard behavior; nothing
about it needs `scripts/release-production.ts` (that script is the
promote-only PRODUCTION release path — phase B/C explicitly never apply to a
Preview build, and it is not part of this flow at all).

**The exact configuration change**, once 9.2 is resolved: `vercel.json`'s
`git.deploymentEnabled` map already carries this branch's own key, set
`false`:

```json
"integration/electrical-v1-v2-reconciliation": false
```

Flip that ONE entry to `true` — no other entry in the map, no other file —
as its own isolated commit. Vercel evaluates `git.deploymentEnabled` from the
commit actually being pushed, so this flip commit is itself the first build
Vercel will attempt for this branch; the application code it builds is
`63b6a0c` plus this one-line config change, nothing else. `main`'s own entry
is intentionally absent from the map (production deploys are never gated by
it), and no other branch's `false` is touched.

### 9.2 Neon target — parent checkpoint, and the one unresolved safety question

**Parent checkpoint** (`docs/migration/adr-013-neon-migration-plan.md`):
Neon project `bitter-bird-20565072`, production branch
`import-2026-08-28T12:58:02.408Z`, endpoint `ep-shy-butterfly-ay5t03di`,
stamped `price2book-production`. A Preview database for this run should be a
**new Neon branch created off that production branch** — a real schema/data
lineage, not a from-scratch empty database — stamped with its own identity
before anything runs against it, exactly as every local rehearsal in this
document already does for its own disposable cluster.

**Open, safety-relevant, NOT resolved by this task:** does the canonical
`price2book` project's Vercel **Preview** environment already have its own
`DATABASE_URL`, distinct from Production's? As of 3 Sep 2026 (before the
canonical project became git-connected on 6 Sep), project memory recorded
Preview and Production sharing the SAME `DATABASE_URL` — production itself —
with only `EXPECTED_DATABASE_IDENTITY=price2book-production` set. If that is
still true today, enabling a Preview build for this branch would run `npm run
build`'s `verify` step — which project memory tracks as a **known, unfixed
hazard (issues #14/#15): it writes fixtures with FIXED identifiers, with
teardown immediately before create** — directly against the real production
Neon database. This is exactly the class of accident the disconnection on 6
Sep was already responding to (two projects racing fixtures into production),
and it is not something this task is authorized to risk or to resolve by
trying it.

**This must be confirmed, read-only, before 9.1's flip, by whoever has
Vercel dashboard or Management API access to the `price2-book` team** (this
session has neither — see 9.7):
- `vercel env ls preview --scope price2-book` (or the dashboard's
  Environment Variables page, Preview column) for the `price2book` project —
  does `DATABASE_URL` under Preview differ from the one under Production?
- If they are the same, or Preview has none: create a dedicated Neon branch
  off `import-2026-08-28T12:58:02.408Z` (a NEW branch, uniquely named for
  this task, never the production branch itself), stamp it —

  ```
  DATABASE_URL="<the new branch's connection string>" \
    npx tsx scripts/verify-database-identity.ts --stamp \
    --expect price2book-preview-electrical-v1-v2 \
    --project bitter-bird-20565072 \
    --note "Preview target for PR #63, integration/electrical-v1-v2-reconciliation"
  ```

  — then set that connection string as the `price2book` project's
  **Preview-environment** `DATABASE_URL` (Vercel supports scoping an
  environment variable to specific branches; scope it to
  `integration/electrical-v1-v2-reconciliation` alone if the project's plan
  allows, so no OTHER branch's Preview inherits it), and set that
  environment's `EXPECTED_DATABASE_IDENTITY` to
  `price2book-preview-electrical-v1-v2` to match.

Nothing in 9.1's flip should happen before this is answered.

### 9.3 Auth, origin, and storage requirements for this one proof

The accepted proof (`scripts/verify-troubleshooting-note-directbook-browser-flow.ts`)
needs less environment configuration than it might look like, because of what
it deliberately does NOT exercise:

- **Auth URL / trusted origins:** `lib/authBaseUrl.ts`'s `resolveBaseUrl()`
  and `lib/auth.ts`'s `trustedOrigins()` both already fall back to Vercel's
  own `VERCEL_BRANCH_URL`/`VERCEL_URL`, which Vercel populates automatically
  on every deployment. **No explicit `BETTER_AUTH_URL`/`APP_ORIGIN` needs to
  be set for this proof** — a Preview branch alias resolves correctly with
  zero configuration, by design (`lib/origins.ts`'s own header comment).
  `BETTER_AUTH_SECRET` should already be a real, non-default value at the
  project level (inherited by every environment including Preview) — this
  session cannot confirm that from here (see 9.7), but it is a project-level
  setting, not something this branch or this proof needs to add.
- **Authentication of the test account:** none is needed. The proof is a
  purely anonymous, homeowner-facing storefront flow — direct entry, a
  reroute handoff, and a real no-deposit NATIVE checkout — with no sign-in
  anywhere. The "supported contractor configuration" step (a fresh, minimal
  catalog and one `schedulingAuthority: "NATIVE"` contractor) is established
  the SAME way the accepted harness already does it: direct Prisma writes
  against the target database, never the admin sign-up/sign-in UI. This is
  deliberate, not just convenient: `lib/auth.ts`'s sign-up path requires
  email verification, and its dev mail sink (`PLATFORM_MAIL_SINK`) explicitly
  **refuses to run when `NODE_ENV === "production"`** — which every Vercel
  build, Preview included, always is. An admin-authenticated step in this
  proof would need a REAL `PLATFORM_RESEND_API_KEY`/`PLATFORM_FROM_EMAIL`
  send, a dependency this proof has no reason to take on.
- **Storage:** none exercised. No R2 (no photo upload in this flow), no
  Stripe (native NO-DEPOSIT booking), no Jobber (schedulingAuthority is
  NATIVE, not JOBBER), no SMS/email send (the diagnostic note and booking
  confirmation are stored rows and a rendered page, not a sent message).
  These should stay unconfigured or disabled for this run rather than
  provisioned — nothing here requires them, and standing up an integration
  the proof never touches is scope this task does not need.

### 9.4 Confirming the deployed candidate before trusting it

`app/api/deployment-identity/route.ts` already exists for exactly this:
protected by `VERCEL_AUTOMATION_BYPASS_SECRET` (404s without it, so it never
reveals that it exists to an unauthenticated request), it returns the
deployment's `VERCEL_ENV`/branch/deployment host, the DATABASE_URL's HOST
only (never the credential), the stamped `DatabaseIdentity` row, and
presence-only booleans for `BETTER_AUTH_SECRET`/Resend/Jobber/R2/legacy
Stripe — no secret value ever appears in the response. Once the Preview
deployment referenced in 9.1 is READY, call it with the bypass secret as a
**header**, not a query parameter:

```
curl -s -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
  "https://<this-branch's-preview-alias>/api/deployment-identity"
```

and confirm `database.identity.key` reads `price2book-preview-electrical-v1-v2`
(9.2) — never `price2book-production` — before running anything against it.

### 9.5 Exact ordered commands

1. Resolve 9.2 (Preview `DATABASE_URL` isolation) — read-only check, then, if
   needed, a NEW Neon branch + stamp, as written above. Requires Neon/Vercel
   access this session does not have.
2. Flip `vercel.json`'s one entry (9.1) as an isolated commit; push.
3. Watch the resulting Vercel build (dashboard, or the GitHub commit status +
   `vercel inspect <deployment-id> --logs --scope price2-book`, the same
   log-reading technique already proven for the legacy project) until READY.
4. Run 9.4's `curl` against the deployment's Preview alias; confirm the
   identity before proceeding.
5. Run a fresh-catalog/contractor setup script against that SAME
   `DATABASE_URL` — reuse `buildFixture()`'s own pattern (one throwaway,
   `active: true`, `schedulingAuthority: "NATIVE"` contractor, one
   `TROUBLESHOOT_ONLY` diagnostic service, one source service) rather than
   the full 82-service `rebuildElectricalCatalog` chain, since this proof
   does not need the whole Electrical catalog to exercise guided pricing and
   native booking.
6. Run 9.6's browser flow against the deployed candidate.
7. Read persisted results back with a script against the SAME `DATABASE_URL`
   (`GuidedFlowSession`, `LineItem`, `Booking` — the same tables the local
   harness already asserts against).
8. Decide, explicitly, whether to leave `deploymentEnabled` on for this
   branch afterward or flip it back to `false`.

### 9.6 The one focused browser acceptance flow

Reuse `scripts/verify-troubleshooting-note-directbook-browser-flow.ts`'s own
structure — it already proves manual guided pricing, entry provenance
through the real API, and a real no-deposit NATIVE booking, with identity
and persisted-result checks, against a production build. Pointed at the
Preview alias instead of `localhost:3610` via its existing
`BROWSER_FLOW_BASE_URL` environment variable, and against the Preview
`DATABASE_URL` from 9.2, it needs NO code change to serve as this task's
required flow — do not weaken its target guards (it already refuses to
assume a specific host and reads everything from environment).

### 9.7 Missing access, and the single next operational action

This session has no Vercel Management API token (`.env.local`'s only
Vercel-related values are `VERCEL_AUTOMATION_BYPASS_SECRET` and
`VERCEL_OIDC_TOKEN` — neither is a project/env-management credential) and no
Neon API/CLI access. It cannot itself answer 9.2, list the canonical
project's Preview environment variables, or create a Neon branch.

**The single next operational action:** someone with Vercel dashboard or
Management API access to team `price2-book` (project `price2book`,
`prj_zB0QVq80340s2dVt7X3c1ewKgHtT`) checks whether that project's Preview
environment's `DATABASE_URL` already differs from Production's. That answer
determines whether 9.1's flip is safe to do next, or whether a dedicated
Neon branch (9.2) must be created and wired in first.
