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

**CORRECTED — the first revision of this section (against `6be2f92`) had two
concrete defects, both fixed below:** it substituted a zero-question
diagnostic fixture with raw price/setup writes for the actual fresh-catalog
launch proof, and it instructed an early identity restamp that would make
`init-preview-database.ts`'s own guard refuse. It also stated several
historical project records as settled current fact and understated what a
"zero-config" claim about origins and booking side effects actually
guarantees. All of that is corrected here.

Prepared against the accepted `63b6a0c`/`6be2f92`. Nothing in this section
has been executed — no Vercel setting changed, no Neon branch created, no
push made, no secret printed.

### 9.1 Vercel target — live inspection, 17 September 2026

The connected Vercel API confirms project `price2book`
(`prj_zB0QVq80340s2dVt7X3c1ewKgHtT`) under team `price2-book`
(`team_dAw8VA0u1R3VuwiPMP97otvK`). Deployment
`dpl_99Qt3nHvTwwEn7aVNkSSej2wECoX` is READY, source `git`, target
Preview, from this repository's `feat/material-cost-authority-unify`
branch at `f0da3ed1c5014d188639561ff24ef09d96800a76`. This directly
establishes Git-triggered Preview operation on the canonical project.
It is another workstream's deployment, not this PR's candidate.

The live project's Environment Variables page was inspected with values
masked. Searching DATABASE_URL returned a Production entry and a Preview
override scoped ONLY to `feat/electrical-routing-v2`. No database entry
for `integration/electrical-v1-v2-reconciliation` was shown. Do not
reuse or alter the Routing V2 override. This is evidence that the required
PR-specific binding is missing, not proof that Preview currently shares
the Production password/URL.

The page also shows Production-and-Preview entries for APP_ORIGIN,
BETTER_AUTH_URL, STOREFRONT_ORIGIN, PLATFORM_WEB_ORIGIN, RESEND_API_KEY,
EXPECTED_DATABASE_IDENTITY and R2_BUCKET_NAME. Values were not revealed.
The separate Routing V2 branch has its own overrides; those do not cover
this PR. Set explicit PR-scoped values/off settings after target creation.

Keep deployment disabled until database initialization and configuration
are complete. Record the actual candidate commit AFTER all preparation
changes; do not describe it as an old SHA plus only a flag flip. Inspect
the effective build command, branch environment, and runtime identity;
do not assume these agree simply because the project name agrees.

### 9.2 Neon target — parent checkpoint, and the two unresolved safety questions

**Neon inventory verified live, 17 September 2026:** project
`bitter-bird-20565072` contains branch `br-quiet-salad-ay74c7cx`,
named `import-2026-08-28T12:58:02.408Z`, with endpoint
`ep-shy-butterfly-ay5t03di.c-5.us-east-2.aws.neon.tech` (and its
`-pooler` hostname). This confirms the historical parent exists.
The branch named `production` is a DIFFERENT branch
(`br-weathered-heart-ayps5p7g`); never choose a parent by name/default
alone. Reconfirm the served Production binding before creating a new
dedicated PR #63 branch. Existing Plumbing, Routing V2 and guided-flow
rehearsal branches belong to parallel work and were not modified.

No branch dedicated to this PR was found in the returned inventory.
No new branch or database write was made during this inspection.

**Question A — is Preview's `DATABASE_URL` (build AND runtime) already
isolated from Production's?** Project memory recorded them sharing one as of
3 Sep, before the canonical project was git-connected. If still true,
enabling Preview here would run `npm run build`'s `verify` step — a known,
unfixed fixture-collision hazard (#14/#15, FIXED identifiers, teardown
immediately before create) — directly against production. **Do not check
this by comparing connection-string text.** A pooled (`-pooler`) and a direct
connection string can name the SAME Neon branch; unequal strings prove
nothing about isolation by themselves. The only check that actually proves
isolation is the endpoint-lineage one `scripts/_lineage.ts` and
`lib/electrical/pilotScope.ts`'s `resetRefusal` already implement and this
repo already trusts elsewhere: compare the CONNECTED endpoint (from the URL
actually in use) against the endpoint the target's own `DatabaseIdentity`
marker names — see 9.4, which uses exactly this mechanism through the
already-deployed `/api/deployment-identity` route. A live Preview build must
be inspected this way; a static comparison of two configured strings is not
sufficient evidence either way.

**Question B — how to bring a Preview target's identity up without breaking
`init-preview-database.ts`'s own guard.** The prior revision of this section
instructed stamping the new branch's identity (`--stamp --expect
price2book-preview-...`) BEFORE running the initializer. **This is wrong and
would make the initializer refuse.** Read precisely:

- `scripts/_lineage.ts`'s `classifyRehearsalTarget` (used by
  `init-preview-database.ts`'s own `resolveTarget()`) and
  `lib/electrical/pilotScope.ts`'s `resetRefusal` (used by the browser
  harnesses in 9.6) both accept a target as "a legitimate branch of
  production" by the SAME test: the target's `DatabaseIdentity` marker still
  names `price2book-production` — INHERITED, UNCHANGED, copied verbatim by
  Neon when the branch was created — while the marker's OWN recorded
  `neonEndpoint` (`ep-shy-butterfly-ay5t03di`) DIFFERS from the endpoint
  actually connected. That mismatch — same key, different endpoint — IS the
  proof it's a branch, not the original.
- Restamping the branch (as the prior revision instructed) OVERWRITES
  `neonEndpoint` to the CURRENTLY connected endpoint — which is the branch's
  OWN endpoint. That makes `markerEndpoint === endpoint` TRUE, which is
  EXACTLY `classifyRehearsalTarget`'s `IS_THE_ORIGINAL` refusal condition
  (`_lineage.ts`) and `resetRefusal`'s `PRODUCTION_DATABASE` refusal
  condition (`pilotScope.ts`) — the restamp makes both guards conclude "this
  IS production" and refuse. `init-preview-database.ts`'s own code says so
  directly (`initializeCatalog()`'s `else` branch, remote case): "REMOTE:
  never restamp... Record the verified identity for the human log instead of
  writing it into shared state" — and this document's own §2 step 2 already
  states the same rule; the prior §9 revision simply contradicted both.
- **Correct sequence:** create the Neon branch off production; do
  **NOTHING** to its `DatabaseIdentity` row — leave the inherited marker
  exactly as Neon copied it, permanently, for the whole lifetime of this
  target (a later retry of `init-preview-database.ts` depends on the SAME
  untouched marker to be accepted again). Then run:

  ```
  npx tsx scripts/init-preview-database.ts \
    --target-url "<the new branch's OWN connection string>" \
    --expect-endpoint "<the new branch's OWN full endpoint, from ITS connection string>" \
    --expect-project bitter-bird-20565072 \
    --expect-database "<the new branch's database name>" \
    --apply
  ```

  `--expect-project` is checked against the INHERITED `neonProject` column
  (unchanged — still `bitter-bird-20565072`), which is exactly why it
  matches with no restamp needed. `--expect-endpoint`/`--expect-database`
  are checked against the CONNECTION itself (`readTargetIdentity()`), not
  the marker — they must be the branch's own real values, obtained when the
  branch is created, never guessed.
- **What the Vercel project's `EXPECTED_DATABASE_IDENTITY` should be set to
  for Preview, given the marker is never changed:** `price2book-production`
  — the same value Production uses, because that is genuinely, correctly,
  still what is stamped on this branch. A KEY-only match can never
  distinguish "a legitimate branch" from "actual production" (both carry the
  identical key) — that distinction is ENDPOINT-based, which is why 9.4's
  check is the one that actually proves isolation, not the key match alone.
  Do not invent a distinct Preview-specific key name; it does not match what
  `init-preview-database.ts` or `resetRefusal` will ever see on this target,
  and nothing in this repo's existing identity contract expects one.

Neither question is resolved by this task. Both need Vercel/Neon access this
session does not have (9.7).

### 9.3 Restore the actual launch proof — full catalog, supported functions, accepted harnesses

The prior revision of this section proposed reusing
`verify-troubleshooting-note-directbook-browser-flow.ts`'s own
`buildFixture()` — a THROWAWAY contractor with a hand-set `basePrice` and
`materialCostResolved: true` written directly via Prisma — as "supported
contractor configuration." **It is not.** Those are raw price/setup writes
bypassing the real approval/activation pipeline entirely; that harness is a
good OPTIONAL smoke check for the diagnostic-note UI specifically, but it is
not the fresh-catalog launch proof this task actually needs, and does not
belong to the "supported functions" the review asks for.

**The actual accepted scope, using harnesses that already exist and already
go through supported functions:**

1. **Full 82-service Electrical catalog.** `scripts/init-preview-database.ts`
   (9.2) — the real `rehearse-fresh-electrical-launch.ts` chain, not a
   hand-built subset.
2. **One fresh contractor, configured through supported functions —** the
   same pattern `scripts/_derivedStorefrontFixture.ts` already uses and
   `scripts/verify-integration-manual-routing-storefront-browser-flow.ts`/
   `scripts/verify-derived-scheduling-browser.ts` already exercise: catalog
   install via `templateVersionSource`/`preflight`/`installCatalog`, material
   costs via `writeMaterialCost`/`writeComponentLabor`/
   `writeMaterialSystem`, policy quantities via
   `declarePolicyMaterialQuantity`/`resolvePolicy`, pricing via
   `decideDerivedPricingApproval`/`publishSuggestedPrice`, and activation via
   the real `activateService` authority (which REFUSES until all of the
   above actually resolve — the point of using it instead of a raw write).
   No new admin sign-up/sign-in flow is needed merely to call these
   functions; they take a `contractorId`, not a session.
3. **The accepted manual new-outlet route:**
   `scripts/verify-integration-manual-routing-storefront-browser-flow.ts` —
   drives the REAL storefront/browser against the real `new-120v-outlet`
   Routing V2 service, manual completion (no Route Assist), straight-route
   pricing, displayed-vs-stored price, back/re-answer, turned-route review,
   and a mid-flow cost change carried to a real booking. Already proven,
   already reuses the supported fixture helper above.
4. **Native no-deposit booking:** `scripts/verify-derived-scheduling-browser.ts`
   — real availability/capacity (native scheduling withholds a window that
   doesn't fit, a real booking consumes capacity, a second homeowner is
   refused the same window), a real no-deposit checkout proven to contact no
   Stripe host at all, against a production build. This is the accepted
   "native no-deposit booking" proof named in review.
5. **Remote harness compatibility is not yet complete.**
   `verify-integration-manual-routing-storefront-browser-flow.ts` calls
   `assertDisposableLocalDatabase` before `resetRefusal`; changing its
   environment variables alone cannot make it run against Neon.
   Preserve that local default. A remote entry point must explicitly bind
   endpoint/project/database and validate the deployed candidate BEFORE
   reusing its fixture/flow on the dedicated branch. Deployment protection
   must also be handled by that browser context without leaking a bypass
   header to third-party hosts.
   `verify-derived-scheduling-browser.ts` uses `BASE_URL` for an external
   server and its lineage/tenant guard; verify its complete remote setup
   and teardown before using it. Do not claim either remote run was executed.

6. `verify-troubleshooting-note-directbook-browser-flow.ts` (entry
   provenance, diagnostic note) may still run as an OPTIONAL smoke check
   afterward — it is not the launch acceptance proof, and does not replace
   1–4.

### 9.4 Confirming the deployed candidate before trusting it — the actual isolation check

`app/api/deployment-identity/route.ts` already exists for this, protected by
`VERCEL_AUTOMATION_BYPASS_SECRET` (404s without it), returning the
deployment's `VERCEL_ENV`/branch/host, the `DATABASE_URL`'s HOST only (never
the credential), the stamped `DatabaseIdentity` row, and presence-only
booleans — no secret value ever appears in the response:

```
curl -s -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
  "https://<this-branch's-preview-alias>/api/deployment-identity"
```

**Check exact identity, not a loose inequality.** Compare the returned
full database hostname, normalized for Neon's pooled/direct equivalent,
to the exact designated endpoint recorded from the Neon API. Confirm
project, database name and branch identity through the corresponding
target/API checks, and exclude the normalized actual Production endpoint.
A full hostname is always unequal to a bare endpoint id; the previous
`database.host !== "ep-shy-butterfly-ay5t03di"` example was not a valid
isolation assertion. An inherited production key plus “some different
host” is not enough to identify THIS rehearsal branch.

Before deployment, inspect the configured binding and validate the target
directly. After deployment, verify its effective identity again. Do not
launch a potentially misbound build in order to discover its database.

### 9.5 Auth, origin, and storage requirements — verify, do not assume

- **Origins can OVERRIDE the safe fallback, not just miss it.**
  `lib/origins.ts`'s `appOrigin()`/`storefrontOrigin()` and
  `lib/authBaseUrl.ts`'s `resolveBaseUrl()` fall back to Vercel's own
  `VERCEL_BRANCH_URL`/`VERCEL_URL` only when `APP_ORIGIN`/`BETTER_AUTH_URL`/
  `STOREFRONT_ORIGIN` are UNSET. `scripts/migrate-vercel-env.ts`'s own
  `REPLACE` map sets these to `app.price2book.com`/`price2book.com` — if
  those are configured for ALL environments rather than scoped to
  Production only, a Preview deployment would resolve its OWN absolute
  storefront/app URLs to the LIVE production hostnames, not its own alias.
  This must be checked live (env var scoping per environment, 9.7) before
  trusting that any link, redirect, or absolute URL the deployed app
  generates during the browser proof stays on the Preview alias. Navigate
  every step of 9.3's flows via the Preview alias directly; do not trust a
  self-generated absolute URL without checking where it actually points.
- **Deployment protection may also apply to the browser proof's own
  requests**, not just to 9.4's diagnostic route — if Vercel's Deployment
  Protection is on for Preview, ordinary browser navigation may need the
  same bypass (a cookie or header) or the proof's requests will be blocked
  before they reach the app at all. Confirm this live; it is a real
  precondition for 9.3's flows to run against a Preview alias at all.
- **Authentication of the test account:** none is needed for 9.3's flows —
  all four are anonymous, homeowner-facing storefront/browser flows with no
  sign-in. Contractor setup goes through the supported functions in 9.3 item
  2, not the admin sign-up UI — deliberately, since sign-up requires email
  verification and the dev mail sink refuses under `NODE_ENV=production`
  (true for every Vercel build).
- **Booking side effects are not "none" merely because there is no
  deposit.** `app/api/checkout/route.ts` calls `sendBookingConfirmationEmail`
  (`lib/email.ts`, keyed by `RESEND_API_KEY`) on EVERY completed booking,
  deposit or not — traced directly in the checkout route, not assumed. It is
  non-blocking (`.catch()`, `Promise.allSettled`) so a missing or failing key
  never fails the booking itself, but if `RESEND_API_KEY` for Preview is set
  (inherited from a shared/production value) this proof's test booking would
  trigger a REAL Resend API call under whatever account that key belongs to.
  **Configure `RESEND_API_KEY` unset (or a known-inert value) for the
  Preview environment specifically** — an explicit off, not an assumption
  that no-deposit implies no send. No SMS provider exists in this codebase
  at all (`.env.example`'s Twilio lines are commented out, unimplemented).
  Jobber push in the same route is also non-blocking and gated to
  `schedulingAuthority: "JOBBER"` contractors; 9.3's contractor is NATIVE, so
  it is not exercised regardless.

### 9.6 Correct execution order

1. Keep this branch's deployment flag false. Record the final preparation
   SHA, Vercel project/team, production endpoint and dedicated Preview
   branch/endpoint/project/database. Use branch-specific configuration.
2. Create the dedicated database branch only after those identities are
   bound. Leave its inherited identity marker untouched for initialization
   and retry, as the existing initializer requires.
3. Run `init-preview-database.ts --apply` with all three exact expected
   target arguments against that branch BEFORE enabling any Git build.
   The initializer performs the schema/catalog construction. Confirm the
   real folded 82-service catalog and its supported setup result.
4. Complete the remote harness boundary described in §9.3. Do not remove
   the local disposable-database guard merely to make Neon pass.
5. Configure this PR's database and effective origins; explicitly disable
   booking email and unused external integrations for this branch.
   `EXPECTED_DATABASE_IDENTITY` alone is never an isolation check.
   The current normal `build` runs `verify:fast`, which does NOT include
   `verify-database-identity.ts`; `verify:full` does. Confirm the actual
   Vercel build command, rather than inventing a need to restamp to satisfy
   a gate the normal build does not invoke.
6. Only then enable this branch's Preview deployment and push the final
   candidate. Wait for the actual build completion. Verify deployed SHA,
   Vercel environment, exact target and effective origins.
7. Run the supported fresh-contractor manual new-outlet/native-booking
   acceptance flow. Read the booking-linked persisted price, answers and
   economic snapshots from that same target. The diagnostic-note fixture
   is optional and cannot replace this acceptance.
8. Record pass/fail, exact candidate and owned fixture cleanup. Preserve
   other branches and owner access. Production promotion remains separate.

### 9.7 Missing access, credential exposure, and the single next operational action

**Missing access, unchanged from the prior revision:** this session has no
Vercel Management API token (`.env.local`'s only Vercel-related values are
`VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_OIDC_TOKEN` — neither is a
project/env-management credential) and no Neon API/CLI access. It cannot
itself resolve 9.1, 9.2, or 9.5's live checks.

**Credential exposure — recorded precisely, not minimized.** Checking for a
Neon token during the prior round's investigation, an overly broad `grep`
against this machine's `.env.local` printed real secret VALUES into this
session's own tool-call output: a Resend API key (the same value held by
both `PLATFORM_RESEND_API_KEY` and `RESEND_API_KEY` in that local file) and
a Vercel OIDC token (a JWT). **Neither was committed, pushed, or written to
any file this session controls — that is not the same claim as "not
exposed."** They are present in this session's own transcript/tool logs,
which is a real exposure surface independent of git. This document does not
print either value again, and neither will be decoded or reprinted going
forward.

- **The Resend key's consumer configuration:** in this LOCAL `.env.local`,
  `PLATFORM_RESEND_API_KEY` (platform mail — `lib/auth.ts`) and
  `RESEND_API_KEY` (contractor transactional mail — `lib/email.ts`) hold the
  IDENTICAL value, even though the code's own design intent is two SEPARATE
  Resend accounts (`lib/auth.ts`'s own comment: "two senders, two
  reputations, two Resend accounts"). This session cannot confirm from here
  whether the LIVE Vercel project's env vars share that same shortcut or
  keep the two genuinely separate — that must be checked in Resend's own
  dashboard by whoever owns that account. **Prepared, not executed:**
  generate a new key for whichever account this exposed value belongs to,
  update `.env.local` and the corresponding Vercel environment variable(s)
  with the new value, confirm nothing else still depends on the old value,
  THEN revoke the old key in Resend's dashboard — in that order, so nothing
  currently sending mail breaks mid-rotation.
- **The OIDC token's expiry:** Vercel OIDC tokens are short-lived and
  auto-rotated by Vercel's own tooling (`vercel env pull`/`vercel dev`) on a
  roughly half-day cycle by design — not a long-lived secret meant for
  manual rotation. Whoever manages this environment should confirm via
  Vercel's own tooling whether it has already expired (likely, given the
  file's age) rather than this session decoding it again to check.

**The single next operational action:** someone with Vercel dashboard or
Management API access to team `price2-book` (project `price2book`,
`prj_zB0QVq80340s2dVt7X3c1ewKgHtT`) confirms live: (a) which project's Git
integration actually serves this repo's Preview branches, (b) whether that
project's Preview `DATABASE_URL` (build and runtime) is isolated from
Production's, by endpoint, not by string comparison, and (c) whether
`APP_ORIGIN`/`BETTER_AUTH_URL`/`STOREFRONT_ORIGIN` are Production-scoped.
Separately, and not blocking any of the above, the exposed Resend key should
be rotated per the sequence above.


### 9.8 Direct follow-through and credential status

Joshua asked ChatGPT to handle the corrections directly. This update
incorporates Claude's intervening `ecf37e7` documentation change rather
than overwriting it. Vercel project/deployment metadata, the live variable
scope list, and Neon branch/compute inventory were checked directly.
No secret values were printed, no environment variables changed, no
branch created, and no deployment enabled.

The exposed Resend key is in Claude's local environment/transcript, not
available in this session. The Resend account dashboard requires sign-in
here. Rotation has NOT been performed. Once the account is accessible,
identify the affected key by non-secret metadata, prepare an equivalent
replacement, update all confirmed consumers (both local variable names
if they reference this same key), then revoke the old key. Do not revoke
an unrelated key or assume a local alias identifies every deployed
consumer. No test email is authorized by this preparation.

The exact exposed OIDC token is likewise unavailable here. Its expiry is
UNVERIFIED; do not substitute a generic lifetime estimate. In the owning
environment, inspect only the expiry timestamp locally and output only
expiry/expired status, never the JWT or its other claims.


## 10. Follow-through checkpoint — 17 September 2026

Credential rotation is complete as reported by Joshua: the old local/platform
Resend key was revoked after both local variables and the two Routing V2
Preview overrides were replaced. The existing Routing V2 redeployment
`dpl_Hpxphh1ED9of19UrFd7pwKdTXDEh` was independently observed READY.
This is not PR #63's deployment.

Current main advanced to `5bbcfe1bafb88e871192f864b9364bbdbcf39a0d`
(Materials PR #76). This integration brings those ten intervening commits
into PR #63. Resolved the two conflicting files by retaining the new
Materials drawer/recipe interface and categories, the setup API action,
nullable policy quantities, atomic policy declarations, and truthful
missing-cost versus missing-allowance messaging. Desktop and mobile blank
quantity inputs preserve unanswered state; explicit zero remains a declaration.
The existing quantity browser verifier now selects the visible responsive
input and checks the new banner wording.

Verification performed in the ChatGPT workspace: Prisma generation and
TypeScript typecheck passed; all 21 verify:fast scripts passed using
`node --import tsx` instead of the tsx CLI, whose IPC listener is refused
by this workspace. Pure material-readiness verification passed. This is
not a normal npm build or browser pass. Local PostgreSQL is unavailable,
and package installation failed on workspace process/user restrictions.
No database-backed browser test was run here.

Next: on Claude's existing local environment, verify this combined branch
with the normal build and the focused materials quantity and recipe browser
flows on an owned disposable database. Preserve both sides' behavior; do
not redo the decision-tree/catalog audit. Then complete the still-required
exact-target remote harness before initializing and deploying PR #63's own
Preview. The existing loopback guard must remain intact. No PR #63 Neon
branch or deployment was created during this checkpoint.

## 11. Claude's local verification and a launch-readiness verifier — 17 September 2026

**Local verification of the combined checkpoint (`f41838c`), against the
owned disposable loopback database.** `npx tsc --noEmit` clean. The full
`npm run build` (`prisma generate && verify:fast && next build`) passed
end-to-end, all 21 `verify:fast` scripts included.

`scripts/verify-materials-panel-quantity-browser-flow.ts` initially failed:
`ServiceWorkspace.tsx`'s service-editor tabs now declare `role="tab"`
explicitly (part of this merge's redesign), but the script's own tab-click
selector still targeted `role="button"` — a stale selector, not a UI defect
(the NEW `verify-materials-panel-recipe-browser-flow.ts` already used the
correct `getByRole("tab", ...)` form). Fixed all three occurrences to match.
Re-run: all 20 checks passed, including the two properties named in
review — blank policy quantities stay null on blur, and an explicit "0" is
sent and declared.

`scripts/verify-materials-panel-recipe-browser-flow.ts` then failed on
`CanonicalMaterial` "CABLE_CAT6" not existing — this specific long-lived
local cluster had simply never run `prisma/seed-low-voltage-and-sconces.ts`
(idempotent; backfilled it, 4 services added). After that, 3 assertions
failed: they checked for the literal string `"1 material needs a cost
before this service is ready."`, which does not exist in
`MaterialsPanel.tsx` at all — the actual, correct copy is `"Missing cost:
<name>. Complete these materials before this service is ready."` (matching
the SAME pattern the quantity script's own already-passing "banner names
the ALLOWANCE" check uses). Fixed the assertions to match the real copy —
two check the Single-pole breaker gap, one (mobile, check 14) checks a
LATER, deliberately-added Interior GFCI receptacle gap; a blanket
find-and-replace initially got that third one wrong (it isn't the same
material as the first two), caught by re-running and corrected. Re-run: all
18 checks passed, including every mobile/responsive assertion and all six
screenshots.

## 12. Two corrections to the prior round's claims, and a fully proven fixture/verifier — 17 September 2026

**Both prior claims about the `SURFACE_RACEWAY_JOINT` refusal and the two
harnesses' guards were wrong.** Corrected precisely, per review:

- **`scripts/_derivedStorefrontFixture.ts`'s `FIXTURE_COSTS` already priced
  `joint`** (and `supportClip`/`transition`/both elbows/`deviceBox`/
  `channel`/three conductor roles) onto the fixture's OWN new contractor —
  confirmed by direct query at the moment of refusal: the `ContractorMaterial`
  row for `SURFACE_RACEWAY_JOINT` existed, `active: true`,
  `packagePriceCents: 187`. The prior round checked `elite-electric`'s own
  rows (irrelevant — the fixture never reads from Elite) and mistook
  `changeChannelCost` (a one-line helper for a later cost-CHANGE test) for
  the actual setup loop. **The real cause**, traced through
  `lib/electrical/derivedPricingApproval.ts` -> `resolveRoute(loaded,
  PILOT_ANSWERS, ...)` -> `resolved.status === "INVALID"`, `reason: "No
  answer for \"purpose\""`: this long-lived local cluster's `new-120v-outlet`
  TEMPLATE (not just Elite's per-contractor copy) still asks the RETIRED
  `purpose` question instead of `outlet_load_type`/`outlet_power_source` —
  `prisma/seed-outlet-power-source.ts` (which retires `purpose`) had never
  run against this cluster's template. An empty qualified-component list
  from that upstream gap surfaces downstream as exactly this
  `SURFACE_RACEWAY_JOINT`-shaped `NO_CONTRACTOR_PRODUCT` refusal — the SAME
  failure mode `lib/electrical/onboardingPilotReadiness.ts`'s own doc
  comment already warns about for the inverse historical bug. Confirmed by
  building a genuinely fresh catalog via the accepted chain
  (`rebuildElectricalCatalog`, exported from `init-preview-database.ts`) on
  a new, uniquely-named, owned scratch database: the fresh template
  correctly asks `outlet_load_type`/`outlet_power_source`, and the
  `SURFACE_RACEWAY_JOINT` refusal is completely gone. Not the long-lived
  cluster patched, not Elite priced — a disposable database built once for
  this diagnosis, then dropped.
- **Only `verify-integration-manual-routing-storefront-browser-flow.ts`
  calls `assertDisposableLocalDatabase` unconditionally.**
  `verify-derived-scheduling-browser.ts` uses only `resetRefusal` (already
  endpoint-vs-marker based, already remote-safe) — confirmed by reading
  both files directly. The remote-compatibility gap was real for exactly
  one of the two harnesses, not both.

**One genuine, narrow fixture gap, fixed with a supported function.** Past
the corrected `purpose` red herring, the fresh catalog surfaced a real gap:
`dedicated-120v-circuit-outlet`'s activation now refuses
`DISCLAIMER_UNRESOLVED` for `EXTERIOR_WALL_CONTINGENCY_DEDICATED` (a newer
disclaimer requirement, tied to a newer `device_on_exterior_wall`
question, that predates this fixture helper). Fixed by calling
`lib/disclaimerAuthoring.ts`'s `authorContractorDisclaimer` — the same
supported function a real contractor's Setup screen uses — with Elite's own
verbatim wording, before the dependency's activation call. Two further
stale-selector gaps surfaced and were fixed the same way check 1's earlier
fixes were: `verify-integration-manual-routing-storefront-browser-flow.ts`
never answered a newer `device_on_exterior_wall` question in its dependency
walk (added); `verify-derived-scheduling-browser.ts` had three regexes
matching QUESTION WORDING RETIRED since the script was written (`how many
feet is that route` -> `How long is the route, in feet`; `What is that wall
surface` -> `What is the wall made of`; `Does anything sit in the way along
that route` -> `Is anything in the way`; `turn a corner while staying on the
same` -> `How many turns stay flat on the wall`) — none of these are UI
regressions; every current prompt was confirmed live against the fresh
catalog before changing the matching regex.

**Both accepted harnesses now pass in full, end to end, against a
genuinely fresh catalog** — proven twice, on two separately built,
uniquely-named, owned scratch databases, each dropped afterward:
`verify-integration-manual-routing-storefront-browser-flow.ts` (all
scenarios A-G, including a real booking and its provenance-freezing checks)
and `verify-derived-scheduling-browser.ts` (49/49, including the
no-Stripe-contact proof and the deposit-still-loads-Stripe.js boundary
proof). This is the actual "run the accepted manual fresh-contractor
pricing + native no-deposit booking locally to completion" the review
asked for — done, not merely attempted.

**A remote-compatible entry point, implemented and locally proven with
injected identities.** `scripts/_remoteCompatibleGuard.ts`'s
`assertLoopbackOrDesignatedRemoteTarget` replaces
`verify-integration-manual-routing-storefront-browser-flow.ts`'s
unconditional `assertDisposableLocalDatabase` call: a loopback target still
goes through that SAME function unchanged (default behavior preserved
exactly); a remote target is verified through
`init-preview-database.ts`'s own exported `decideRemoteTarget` — the exact
endpoint/project/database plus inherited-lineage check, reused, never
reimplemented. `scripts/verify-remote-compatible-guard-contract.ts` proves
this with INJECTED `readIdentity`/`classify` (no real Neon connection
needed, matching `decideRemoteTarget`'s own established testability):
refuses an undeclared target, refuses a target naming production's own
endpoint, refuses a genuine sibling branch whose declared endpoint doesn't
match what's actually connected, refuses a declared-project mismatch,
accepts a genuinely designated branch, and confirms the loopback path
still dispatches to the real local guard — 6/6 checks pass.
`verify-derived-scheduling-browser.ts` needed no equivalent change; its
existing `resetRefusal` guard was already remote-safe, per the correction
above.

**`scripts/verify-remote-launch-readiness.ts` rewritten with two separate
modes, per review**, since a single `--apply` flag conflated
initialization with verification and — worse — returned exit 0 after
silently skipping both browser proofs for a remote target:

```
npx tsx scripts/verify-remote-launch-readiness.ts --mode init \
  --target-url <url> [--expect-endpoint <e> --expect-project <p> --expect-database <d>] \
  [--production-url <production-connection-string>] --apply

npx tsx scripts/verify-remote-launch-readiness.ts --mode verify \
  --target-url <url> --base-url <deployed-app-origin> \
  [--expect-endpoint <e> --expect-project <p> --expect-database <d>] \
  [--production-url <production-connection-string>]
```

`--mode init` runs ONLY `init-preview-database.ts` — for BEFORE deployment,
never touching the browser harnesses. `--mode verify` (default) runs ONLY
the two harnesses against an ALREADY-DEPLOYED candidate — it NEVER calls
`init-preview-database.ts`, so a verification run can never reset the
catalog it's about to check. The target is verified exactly once, up
front, via the same `assertLoopbackOrDesignatedRemoteTarget` the harness
now also calls on its own (defense in depth for a direct, non-orchestrated
run). For a remote target, `app/api/deployment-identity` is checked BEFORE
either harness writes anything: the deployed app's reported database host
must match the verified target, and neither `transactionalResend` nor
`platformResend` may be configured server-side — a local environment
notice alone was never evidence about the deployed server, and this is now
checked against the actual deployment, not assumed. If verification cannot
run — a refused target, a missing bypass secret, a failed identity check,
either harness's own refusal — this now exits NONZERO. It never again
reports success after skipping the thing it was asked to prove.

**Smoke-tested locally, both paths, both outcomes proven:** `--mode init`
(dry-run and `--apply` against a loopback target, correctly building then
dropping its own scratch database — the local path was never meant to
persist anything, which is exactly why `--mode verify` treats a loopback
`--target-url` as already-installed rather than re-initializing it);
`--mode verify` against the KNOWN-STALE long-lived cluster, confirming it
now exits 1 (not 0) when a harness fails; `--mode verify` against a
genuinely fresh, disposable database, confirming exit 0 with both
harnesses passing in full. Remote execution itself is still NOT RUN — no
actual Preview target exists yet — only implemented and proven locally
with injected identities, exactly as asked.

## 13. Three remote-wiring defects, fixed and each proven with a focused
contract test — 17 September 2026

Review of the prior round (`4815a0f`) accepted the fresh-catalog and
booking proofs as LOCAL evidence and identified three remaining defects in
the remote test harness itself, none in the decision trees. Per that
review's own instruction, no browser harness or catalog rebuild was
repeated for this correction — verification here is `npx tsc --noEmit`
(clean) plus three new, narrowly-scoped contract tests, none of which
touch a real database or a real deployment.

**Defect 1 — the orchestrator's first guard call ignored its own CLI
flags.** `scripts/verify-remote-launch-readiness.ts` parses
`--expect-endpoint`/`--expect-project`/`--expect-database`/
`--production-url`, but its FIRST call to `assertLoopbackOrDesignatedRemoteTarget`
passed plain `process.env` — those flags were only ever copied into a
LATER object built for the child harnesses. The documented flags-only
invocation therefore refused before reaching either harness whenever the
calling shell's own `EXPECT_*` vars were unset or different. Its identity-
check `PrismaClient` also read the ambient `DATABASE_URL` rather than
`--target-url`, so it could silently check the wrong database. Fixed by
extracting the flags-into-env construction into
`scripts/_effectiveGuardEnv.ts`'s `buildEffectiveGuardEnv(base, flags)` —
called ONCE, before the first guard, with both `init` and `verify` envs
now derived from that SAME object rather than rebuilt separately — and by
binding the Prisma client explicitly: `new PrismaClient({ datasources: {
db: { url: TARGET_URL } } })`, disconnected in a `finally`.
`scripts/verify-effective-guard-env-contract.ts` proves the actual
regression: flags override a conflicting ambient value, flags populate the
guard env when ambient carries none of the relevant vars at all, a
flags-only effective env validates the declared target through the real
`assertLoopbackOrDesignatedRemoteTarget` (injected identity, no real
connection) even with an empty ambient environment, the SAME call with raw
ambient env passed directly (the OLD behavior) refuses — reproducing the
bug this fixes — and a genuinely wrong `--expect-endpoint` still refuses
(not a rubber stamp). 8/8 checks pass.

**Defect 2 — inconsistent host normalization, and a missing-field-tolerant
Resend check.** `app/api/deployment-identity/route.ts` reports the raw
`URL.host` (port and any `-pooler` suffix intact); the orchestrator and the
manual-routing harness each compared it against `fullEndpoint(targetUrl)`
(which strips both) — an inconsistent comparison that could reject a
correctly configured pooled deployment. Separately, `if (configured
?.transactionalResend || configured?.platformResend)` treated a missing
field (`undefined`) as falsy, i.e. as "no sends" — backwards for a
malformed or incomplete response. Neither check verified the deployed
DATABASE NAME, so a host serving several databases couldn't be
disambiguated. Fixed with one shared module, `scripts/_deployedIdentityCheck.ts`'s
`checkDeploymentIdentityResponse(body, targetUrl)`, used identically by
both the orchestrator's `checkDeployedIdentityAndNoSend` and the
manual-routing harness's `checkDeployedIdentityMatches` — eliminating the
two separately-diverging copies. It normalizes the reported host the same
way (`normalizeReportedHost`: strip port, strip `-pooler`) before
comparing against `fullEndpoint(targetUrl)`; requires `database.name` to
match the target URL's own path segment; and requires
`configured.transactionalResend`/`configured.platformResend` to be
present, explicit booleans before proceeding to the truthiness check — any
missing or non-boolean field refuses. The route grew a `dbName` field,
computed independently of the existing (byte-identical, unchanged)
`dbHost` computation to avoid disturbing `scripts/verify-release-provenance.ts`'s
strict AST-based pinning of `dbHost`'s own source text.
`verify-release-provenance.ts` was extended (its `VALUES`/`ALLOWED`/
`PINNED` whitelists all updated) and re-run: 118/118 still pass, with the
leaf/key counts correctly incremented for the new field.
`scripts/verify-deployed-identity-check-contract.ts` proves the shared
check directly: pooled/direct host equivalence in both directions, a
genuinely different host refuses, a matching host with a different
database name refuses, a null/empty/malformed payload refuses, a missing
`configured` object or a missing/non-boolean sending flag refuses, an
explicitly-enabled sending flag refuses, and the genuinely correct,
fully-populated response is accepted. 17/17 checks pass.

**Defect 3 — the browser itself had no Preview-protection access.** Both
harnesses' Node-side preflight `fetch()` to `/api/deployment-identity`
carried the Vercel bypass header and would succeed, but the actual
Playwright `BrowserContext`s (8 call sites total across both harnesses)
were plain `browser.newContext()` — against a real Vercel-protected
Preview deployment, the browser's own navigation would be blocked
regardless of the preflight passing. Fixed with
`scripts/_previewProtectionAccess.ts`'s `newProtectedContext(browser,
targetOrigin, bypassSecret)`: every request the context makes to the
DESIGNATED origin gets the bypass header via per-request `context.route()`
interception (never a context-wide default header); every other origin
passes through untouched, so a third-party request (Stripe.js, analytics)
never receives the secret. A no-op — plain `browser.newContext()` — when
no bypass secret is configured, preserving default local behavior exactly.
Wired into all 8 call sites in
`verify-integration-manual-routing-storefront-browser-flow.ts` and
`verify-derived-scheduling-browser.ts`.
`scripts/verify-preview-protection-access-contract.ts` proves this against
a LOCAL MOCK protected origin (no live Vercel credentials needed): a
real `chromium.launch()` browser drives a plain context against the mock
(refused, 401) and a `newProtectedContext`-wrapped context against the
same mock (accepted, 200); the SAME protected context navigated to a
second mock "third-party" origin still succeeds, and that origin's own
recorded requests never carried the bypass header; and with no secret
configured, `newProtectedContext` behaves exactly like a plain context
(still refused by the mock) — unchanged local behavior. 5/5 checks pass.

**Explicitly not repeated this round, per review:** no catalog rebuild, no
re-run of either browser harness's full scenario walk. The fresh-catalog
manual A–G and 49/49 scheduling results from `4815a0f` stand as the LOCAL
evidence they already were. Remote execution against a real Preview
deployment is still NOT RUN — no actual target exists yet.

## 14. Two credential-handling defects, found before any real Preview
credentials were used, fixed and proven with mock tests only — 17
September 2026

Review of `c687467` accepted the three functional wiring fixes and found
two concrete credential-handling defects in the NEW code, caught before any
real remote run — explicitly not requiring key rotation, since the
affected path had never executed against a real deployment.

**Defect 1 — the success log printed the complete connection string,
including its password.** Both `checkDeployedIdentityAndNoSend`
(orchestrator) and `checkDeployedIdentityMatches` (manual harness) logged
`` `deployed app identity confirmed against ${targetUrl}` `` — `targetUrl`
is the full `--target-url`/`DATABASE_URL` connection string. Fixed by
adding `scripts/_deployedIdentityCheck.ts`'s `describeTargetForLog()`,
which prints only the nonsecret host/database pair (the exact fields the
comparison itself already computes) — the raw connection string is never
formatted into a log line at all, anywhere in either script. Separately,
neither script's top-level `main().catch()` sanitized its output, and a
thrown Prisma or fetch error can legitimately embed a raw connection
string. Fixed with `scripts/_sanitizeOutput.ts`'s `sanitizeForLog()`,
applied to both scripts' top-level catch and to the orchestrator's
`REFUSED:` refusal line — it runs `init-preview-database.ts`'s own
`sanitizeSecrets()` (the `//user:pass@` redaction already used for child
process output) and additionally strips any literal occurrence of the
Vercel bypass token, the one secret shape that redaction pattern cannot
catch since it never appears inside a `//user:pass@` URL segment.
`scripts/verify-credential-logging-contract.ts` proves: the exact success-
log text used by both callers never contains the password or the full
connection string (while still naming the nonsecret host/database so a
caller can tell which target passed); `sanitizeForLog` strips a password
embedded in an arbitrary thrown-error message while leaving the rest of
the text intact; it strips a literal bypass-token value passed as an extra
secret; it is a no-op (never throws) when an extra secret is undefined;
and it redacts both a connection-string password and a bypass token
together in the same text. 9/9 checks pass.

**Defect 2 — the browser's bypass header could follow a redirect to
another origin, and the Node-side identity fetch could too.** Two related
gaps, both confirmed empirically against a real Chromium instance and a
real Node `fetch()`, not just reasoned about:

- `scripts/_previewProtectionAccess.ts`'s `newProtectedContext` used
  `route.continue({ headers })` to attach the header only when the
  ORIGINAL request's origin matched the designated one. Per Playwright's
  own documentation
  (playwright.dev/docs/api/class-route#route-continue), a header override
  passed to `continue()` "applies to both the routed request and any
  redirects it initiates" — confirmed directly: a designated origin
  redirecting to a THIRD-PARTY origin carried the SAME bypass header along
  automatically, regardless of the original per-request origin check. A
  first attempt at fixing this by handing a raw 3xx back to the browser via
  `route.fulfill()` (relying on the browser's OWN redirect-following to
  re-enter the route handler for the new origin) was tested directly and
  found unreliable for a `fetch()`-initiated request once any `route()` is
  registered on the context — it failed with "Failed to fetch" for a
  cross-origin destination even though the exact same redirect succeeds
  with no interception at all. Fixed instead by walking the ENTIRE redirect
  chain inside ONE route callback, using `route.fetch({ url, method,
  headers, postData, maxRedirects: 0 })` per hop — `maxRedirects: 0` means
  a 3xx comes back as plain data, never auto-followed — deciding fresh, for
  EVERY hop's own URL, whether it is the designated origin before attaching
  the header; HTTP's own redirect-method rules are replicated exactly (303,
  and 301/302 for a non-GET/HEAD method, downgrade to GET with no body;
  307/308 preserve method and body). Only the terminal, non-redirect
  response is ever handed back to the browser, via
  `route.fulfill({ response })`.
- Both scripts' Node-side `fetch()` calls to `/api/deployment-identity`
  used the default `redirect: "follow"`, which per the Fetch spec does not
  strip an arbitrary custom header (only `Authorization`/`Cookie`/
  `Proxy-Authorization` in some cases) on a cross-origin redirect — the
  bypass header could have been forwarded to an unverified destination.
  Fixed by passing `redirect: "error"` — refusing outright is sufficient,
  per review — with a clear refusal message on either script's existing
  STOP/throw path.

`scripts/verify-preview-protection-access-contract.ts` (the existing
mock-origin proof) was extended, using a real `chromium.launch()` against
two local mock HTTP servers, with: a designated-origin-to-cross-origin 302
redirect (completes, and the cross-origin target never receives the
header); a method-preserving cross-origin 307 redirect driven by an actual
POST (completes, the destination receives it as a POST, and never receives
the header); a same-origin redirect (still succeeds end to end, both hops
authorized — proving the fix does not break a legitimate multi-hop flow);
and a direct check that a plain Node `fetch()` with `redirect: "error"`
throws on a 3xx rather than following it. Combined with the four scenarios
already accepted from the prior round, 12/12 checks pass. Fake credentials
only throughout; no assertion prints a secret's value.

**Explicitly not repeated this round, per review:** no catalog rebuild, no
browser-harness scenario re-run, no key rotation (the affected remote path
had never executed against a real deployment). `npx tsc --noEmit` is clean
across the whole project.

## 15. The redirect fix itself still leaked non-Vercel credentials —
narrowed to refuse cross-origin redirects outright — 17 September 2026

Review of `29c1303` accepted the nonsecret success logs, the sanitized
top-level output, and `redirect: "error"` on the identity fetches, and
found one concrete defect in the REPLACEMENT redirect walker itself:
`fetchFollowingRedirects` copied `req.headers()` into `baseHeaders`,
removed only `x-vercel-protection-bypass`, and passed that SAME
`baseHeaders` to every hop — including a cross-origin one. Any `Cookie` or
`Authorization` header the designated request legitimately carried would
have gone to the cross-origin destination too. Proving the Vercel header's
absence there was never proof of THOSE credentials' absence.

**Narrowed rather than generalized, per review's own instruction** ("Do
not build a general-purpose browser redirect implementation" — cross-
origin redirected navigation is not an acceptance requirement for either
accepted proof): `scripts/_previewProtectionAccess.ts`'s
`fetchWithinDesignatedOrigin` (renamed from `fetchFollowingRedirects`) now
checks, at the TOP of each loop iteration, whether the hop's URL is
actually the designated origin — the moment it is not, this throws
BEFORE ever calling `route.fetch()` for that hop, so the second origin
receives ZERO requests, not one with credentials stripped. A same-origin
redirect chain is unaffected — every hop is still that same origin, so the
check never trips and the header keeps being attached exactly as before.

Confirmed empirically before relying on it: a real `chromium.launch()`
context with a dummy cookie set on the designated origin and a dummy
`Authorization` header on the request itself, redirected cross-origin,
now fails at the browser's own `fetch()` with `TypeError: Failed to
fetch`, and the cross-origin mock server's request count stays at `0` —
neither the bypass token, the cookie, nor the Authorization header ever
left the wire toward it.

`scripts/verify-preview-protection-access-contract.ts`'s two cross-origin
scenarios (plain redirect and the method-preserving 307) were updated
from "completes, header absent" to "refused, zero requests reach the
second origin," each now setting a dummy `Cookie` via `context.addCookies()`
and passing a dummy `Authorization` header on the fetch call itself. The
same-origin redirect, the ordinary third-party-without-bypass case, the
no-secret no-op case, and the Node-`fetch()`-redirect-refusal check are
unchanged and still pass. 11/11 checks pass. `npx tsc --noEmit` is clean.

**Explicitly not repeated this round, per review:** no catalog rebuild, no
browser-harness scenario re-run, no real credentials or infrastructure
action — only the focused protection-access test and typecheck, as asked.
The decision-tree work and all prior catalog/booking evidence remain
accepted and untouched.

## 16. PREVIEW INITIALIZATION FAILURE — an inherited price-approval
constraint the construction chain never honored — 18 September 2026

Running the accepted initializer's `--mode init --apply` against the
correctly-verified designated Preview database (§13's Defect 1 fix, and the
corrected `production.txt` reference from the wrong-production-reference
correction) got further than any prior local rehearsal — schema sync and
both resets completed — then failed inside `prisma/seed.ts`'s
`service.upsert` for `replace-standard-outlet`: Postgres error 23514,
`services_price_requires_approval`. This is a real, previously-undetected
seed/schema compatibility gap, not an operator or lineage error: every prior
local rehearsal in this engagement ran against a disposable database that
never had `scripts/install-price-approval-constraint.ts`'s CHECK constraint
installed, so the gap could not have surfaced until a database that actually
carries it was built for the first time.

**The constraint** (`services_price_requires_approval`, on `services`):
`("basePrice" IS NULL) = ("publishedPriceApprovedAt" IS NULL)` — a service
may never carry a price with no recorded approval, or an approval with no
price, not even transiently within one transaction.

**The conflict.** Three separate, deliberate comments already in this
codebase — in `prisma/seed-appliance-services.ts` ("No self-approval...
recording that someone approved it is a script vouching for its own
number"), and twice in `prisma/seed-exterior-gfci-routing.ts` ("Approval
happens in the admin, or in one explicit reconciliation migration. Not
here") — establish that a construction-time seed may ESTABLISH a price it
found, but must never itself STAMP the approval on its own output.
`prisma/_priceGuard.ts`'s `publishIfUnset` exists specifically to let a seed
do the former without the latter. That rule predates the CHECK constraint,
and the constraint makes it impossible to honor literally: a row cannot
exist, even for one statement, in the "priced, not yet approved" state the
rule assumed was safe.

**The fix keeps the rule's INTENT (a raw construction seed never self-
approves) and satisfies the constraint by moving WHERE approval happens,**
not by weakening either side:

- `prisma/seed.ts`'s CATALOG create block, `prisma/seed-appliance-
  services.ts`'s Replace Existing Range Hood, and `prisma/seed-exterior-
  gfci-routing.ts`'s `publishIfUnset` call no longer write `basePrice`/
  `whileWeThereBasePrice` at all — every service that used to get a first
  price from one of these three files is now created quote-only
  (`basePrice: null`), satisfying the constraint trivially and leaving each
  file's own "no self-approval" comment finally consistent with what it
  actually does.
- A new file, `prisma/seed-master-price-book-approval.ts`, is the one
  explicit reconciliation migration those three files' own comments already
  pointed to as the sanctioned mechanism. It sources every figure it writes
  from `CATALOG` (`prisma/seed.ts`, exported already) plus the two other
  files' literals (copied verbatim, never re-derived), and for each service
  whose `publishedPriceApprovedAt` is currently null, writes `basePrice`,
  `whileWeThereBasePrice`, and `publishedPriceApprovedAt: new Date()`
  together in one atomic update — never overwriting an existing decision
  (production, or a Preview re-initialized without a full reset, is
  unaffected). Nothing is computed or invented: every figure is a literal
  already committed to source, exactly the "owner already decided this
  number" category this codebase's OWN "Named owner-approved migration"
  scripts already establish as legitimate — the only change is doing it
  once, explicitly, in the one place authorized to, instead of scattered
  across three creation files that had each correctly refused to.
- Inserted into `SEED_STEPS` (`scripts/rehearse-fresh-electrical-launch.ts`,
  reused by `init-preview-database.ts`) immediately after
  `prisma/seed-appliance-services.ts` — the earliest point every service it
  approves is guaranteed to already exist, and before `prisma/seed-outlet-
  power-source.ts`, the one later seed confirmed (by direct inspection of
  every price-field reference in the construction chain, not just the
  file named in review) to read an approved `basePrice` for its own
  customer-facing answer-option labels.
- `scripts/audit-price-writers.ts` — the codebase's own static audit of
  every price/approval writer — updated to list the new file under
  `APPROVED_PUBLISHERS`, with its authority stated in the same terms as
  every other entry. Re-run after the fix: back to "0 file(s) can move a
  customer's price outside the admin," same as before this defect was
  found.

**Reproduced and proven on an owned, disposable local database, with the
REAL SQL constraint installed BEFORE construction** — `p2b_priceapproval_*`
on the local disposable cluster (127.0.0.1:5544), uniquely named, no
pre-drop, dropped at the end of this round:
- `prisma db push`, `scripts/install-price-approval-constraint.ts` (installs
  clean against an empty database), `verify-database-identity.ts --stamp`.
- `init-preview-database.ts`'s own exported `rebuildElectricalCatalog` — the
  SAME function the real Preview initializer calls, not a re-derived copy —
  run to completion: 82/82 canonical services extracted, `REBUILD COMPLETE`,
  exactly one folded `electrical` TemplateVersion. The new approval step
  reported `53 approved, 0 already approved, 0 not in the catalog`.
- Run a SECOND time against the same already-built database (this chain
  always resets Elite's source data and the template tree at the start,
  regardless of whether the prior run completed or was interrupted, so a
  second full run is the faithful proof of "retry from partial construction
  succeeds"): identical clean completion, identical `53 approved, 0
  already approved, 0 not in the catalog`, guard still enforced throughout.
- The ordinary proof-contractor setup, through the real, unmodified
  `preflight`/`installCatalog` path (`lib/templateProvisioning.ts`) used by
  actual contractor onboarding: **82 of 82 services installed**, and a
  direct check confirmed **0 of the 82 newly-installed services carry a
  price or approval** — the template stays contractor-neutral, exactly as
  it did before this fix; nothing about approving Elite's own copy changed
  what a new contractor inherits. The throwaway proof contractor was
  cleaned up.
- `scripts/verify-pricing-boundary.ts` (the constraint's own dedicated
  regression proof) — 18/18 checks pass, including "no price anywhere is
  waiting on an approval, and no exception remains." Its informational
  drift report (Elite's legacy hand-set figures vs. what the newer derived-
  pricing engine would compute today) is pre-existing and expected — "The
  contractor decides. Nothing here changes a published price" — not a
  regression from this fix.
- `scripts/report-unapproved-prices.ts` — 0 services.
- `npx tsc --noEmit` — clean.

**Explicitly not touched:** production (read-only lineage reference only,
per the standing rule); the checked-in `PRODUCTION_LINEAGE`/production
reference correction from the prior round; the accepted decision-tree work;
`vercel.json`'s `deploymentEnabled` (still `false` for this branch). No
browser harness or catalog-acceptance suite was re-run solely for this
fix — this is a targeted initializer proof, per review, replacing that
broader audit for this specific defect.

## 17. REVIEW OF b1c905f — the price-approval fix itself reintroduced
self-approval, one file over — 18 September 2026

Review of `b1c905f` accepted the direction (removing unapproved `basePrice`
writes from the three creating seeds) but rejected the mechanism:
`prisma/seed-master-price-book-approval.ts` took every historical `CATALOG`
literal and stamped `publishedPriceApprovedAt: new Date()` on it. Copying an
old number into a new file and calling it a reconciliation migration does
not manufacture the owner authorization every OTHER legitimate entry on
`scripts/audit-price-writers.ts`'s `APPROVED_PUBLISHERS` list actually has
(a named date, an explicit instruction, a derivable/verifiable figure) —
this task never carried that authorization for the old price book. The
review also named the file's real technical flaw: a separate read-then-
write is not an atomic no-overwrite predicate, and building out that
hardening for a publisher that shouldn't exist would have been scope creep
on top of the mistake.

**The claimed necessity was independently verifiable, and wrong.** The
prior round justified the new file partly on `prisma/seed-outlet-power-
source.ts` needing an approved `basePrice` for its own customer-facing
answer-option labels. Direct re-inspection of that file (lines 247–248, 254,
266) shows both `tapPrice`/`dedPrice` are built as `service.basePrice ? ... :
""` and spliced into each label as `${tapPrice ? \` — from ${tapPrice}\` :
""}` — a null `basePrice` produces a shorter label with the price clause
simply omitted, never a broken or blank one. The file needs the SERVICE and
its routing target, not an approved price.

**Correction:** `prisma/seed-master-price-book-approval.ts` deleted outright
— not weakened, not moved, removed. Its `SEED_STEPS` entry
(`scripts/rehearse-fresh-electrical-launch.ts`) and its
`APPROVED_PUBLISHERS` entry (`scripts/audit-price-writers.ts`) removed with
it. The three creating seeds' unpriced/null-price behavior from `b1c905f`
stands unchanged — that part was already correct and stays.

**Traced every remaining `basePrice`/`whileWeThereBasePrice` reference in
the full construction chain** (`SEED_STEPS` + `POST_SEED_STEPS`, not just
the one file review named), beyond what the prior round checked. Every
site is one of: an explicit ternary/`??` fallback in a console.log or
comparison report (`seed-labor-hours.ts`, `seed-video-doorbell-wiring.ts`,
`add-consumables-recipes.ts`'s own `d()` helper), a presence-only counter
that treats null and non-null identically either way
(`extract-template-catalog.ts`'s economics-exclusion loop — economics are
dropped from the template regardless of whether they're set), or selected
and never actually read at all (`seed-generator-inlet.ts`). None assume a
non-null value for anything functional. No construction dependency needed
correcting.

**Re-reproduced from scratch** on a NEW, uniquely-named local disposable
database (`p2b_priceapproval2_*`, no pre-drop, dropped at the end of this
round), with the real SQL constraint installed before construction, exactly
as before:
- `rebuildElectricalCatalog` run to completion — 82/82 services, `REBUILD
  COMPLETE`, exit 0 (captured immediately, before any other command).
- Run a SECOND time against the same database — identical clean completion,
  82/82, exit 0.
- Direct query against Elite's own source services: of 82, exactly **2**
  carry a price and an approval — `replace-bathroom-exhaust-fan` and
  `replace-bathroom-exhaust-fan-with-light`, both published by
  `scripts/build-fan-packages.ts`, the SAME pre-existing, already-ALLOWED,
  derived-pricing publisher this whole engagement round never touched.
  Construction itself stamps zero approvals on source services — the
  property this correction exists to prove.
- The ordinary proof-contractor setup, through the real, unmodified
  `preflight`/`installCatalog` path: 82 of 82 services installed, and a
  direct check confirmed 0 of the 82 newly-installed services carry a price
  or approval — contractor-neutral, exactly as required, with no invented
  publication step added for the proof contractor (there was nothing that
  needed one).
- `scripts/audit-price-writers.ts` — back to "0 file(s) can move a
  customer's price outside the admin."
- `scripts/verify-pricing-boundary.ts` — 18/18 checks pass, including "no
  price anywhere is waiting on an approval, and no exception remains."
- `scripts/report-unapproved-prices.ts` — 0 services.
- `npx tsc --noEmit` — clean.

**Explicitly not touched:** production; the corrected `production.txt`
reference; the accepted decision-tree work; `vercel.json`'s
`deploymentEnabled` (still `false`). No browser harness or catalog-
acceptance suite re-run.

## 18. HOSTED VERIFICATION FOLLOW-UP — direct HTTP requests never carried
Preview protection, closing the gap; native booking proven end to end on
the real deployment — 18 September 2026

The previous hosted run's manual-routing harness passed in full (A–G,
accepted as evidence). The native scheduling harness got through scenarios
D and W, then crashed parsing an HTML page as JSON. Root cause, confirmed
by direct inspection: `scripts/verify-derived-scheduling-browser.ts`'s "W"
control check made a bare Node `fetch()` to `/api/availability/...`
carrying no Vercel bypass header at all — `newProtectedContext`'s
`context.route()` interception only ever sees requests the BROWSER's own
network stack makes; a Node-side `fetch()` bypasses it entirely. Against
the real Vercel-protected deployment, that unauthenticated request got
Vercel's own HTML challenge page back instead of JSON. Review also
identified three later calls with the SAME gap for a different reason:
`page.request.post`/`cpage.request.post` (Playwright's `APIRequestContext`)
is a separate HTTP client that shares its owning context's cookie jar but,
like a bare `fetch()`, is never touched by `context.route()` either.

**Fixed with two new exported helpers in `scripts/_previewProtectionAccess.ts`**
(kept alongside `newProtectedContext`, the module already responsible for
this exact problem domain — not a new file, not a general HTTP-client
redesign):
- `protectedFetchJson(url, targetOrigin, bypassSecret, init)` — for a
  request that is deliberately session-less (the "W" no-visit control
  itself IS the control — it must never carry a cookie, only ever the
  bypass header). Attaches the header only when `url`'s origin matches
  `targetOrigin`; refuses any redirect outright (`redirect: "error"`,
  never followed); parses the response as JSON only after confirming its
  `content-type` actually says so, throwing a message that names the
  status/content-type — never the response body, so an HTML challenge
  page is never echoed into a log or a stack trace.
- `protectedApiPost(requestContext, url, targetOrigin, bypassSecret, options)`
  — for the three `page.request`/`cpage.request.post` calls, which need
  their OWNING CONTEXT's session cookies preserved (Playwright's own
  documented behavior: "populate request cookies from the context") —
  this helper only ADDS the bypass header on top, never replacing or
  dropping what the context already carries. `maxRedirects: 0` so a 3xx
  comes back as data rather than being auto-followed (and its header
  auto-forwarded with it, the same defect class as the browser-context
  fix); a redirect status is then refused outright.

Wired into all four call sites in `verify-derived-scheduling-browser.ts`:
the "W" control (`protectedFetchJson`), `direct` and `stamp` (both
`page.request`, via `protectedApiPost`), and `takenDirect` (`cpage.request`,
via `protectedApiPost`). The one local-server-readiness `fetch()` (used
only when `EXTERNAL`/`BASE_URL` is unset, i.e. never against a real
deployment) is untouched — "keep default localhost behavior."

**Mock coverage added to `scripts/verify-preview-protection-access-contract.ts`**
(the established home for this exact proof), extending its mock protected
origin with a `/api-json` endpoint that reports whether it saw a `Cookie`
header: `protectedFetchJson` reaches it carrying the bypass header and
genuinely no cookie (the property the "W" control depends on);
`protectedApiPost` via a real `context.request` (with a cookie set through
`context.addCookies()`) reaches it carrying BOTH the bypass header and that
context's session cookie (the property `direct`/`stamp`/`takenDirect`
depend on); and both helpers refuse a redirect outright, with the
cross-origin mock (reusing the existing `/redirect-cross-origin` endpoint)
receiving zero requests. 19/19 checks pass (11 prior + 8 new).
`npx tsc --noEmit` clean.

**Run to completion against the SAME deployed candidate**
(`https://price2book-izo80jih8-price2-book.vercel.app`) and the SAME
designated Preview database, using the accepted deployed-identity/no-send
check (confirmed again, standalone) and the privately-supplied bypass
secret — manual-routing was NOT rerun, per review, only the native
scheduling harness:

- **49 passed, 0 failed. Exit code 0.** Every scenario reached: D (derived
  duration: `resolvedCrewHours=4.8`, `estimatedMinutes=288`); W (native
  scheduling window-withholding on every day, INCLUDING the now-fixed
  no-visit control — "control: Tue, Sep 22 asked with no visit offers
  2:00 PM"); L (checkout refuses the late window through the browser AND
  both direct POSTs — `direct`/`stamp`, the exact call sites just fixed);
  B (a real booking lands on the confirmation page, `estimatedDurationMinutes
  = 288`, at the priced total); N (zero requests to `js.stripe.com`/
  `m.stripe.com`/`m.stripe.network` across the entire no-deposit flow); C
  (real native-capacity behavior: a second homeowner's booking attempt for
  the same taken window refuses with 409 through the browser AND
  `takenDirect`'s direct POST — the last of the three now-fixed call sites
  — then genuinely books once capacity allows, both real bookings sharing
  the one `ArrivalWindow` row); P (a required deposit mounts the card step
  and requests Stripe.js from `js.stripe.com` exactly once, aborted, no
  credential used — the one place Stripe.js legitimately loads).
- Fixture cleanup confirmed: the contractor, its booking, and its customer
  are gone at the end.

**Explicitly not repeated, per review:** manual-routing A–G (already
accepted evidence from the prior hosted run); catalog initialization/reset;
no app-runtime code changed, so no redeployment was needed — the SAME
immutable candidate (`dpl_3A1M7gAQ2DUzbbYDFTmP7VJTTY4m`) was verified.
No key rotation attempted (a separate, already-flagged coordinated
follow-up). PR stays draft; no main merge or Production action.

## 19. Release preparation after accepted hosted verification — 18
September 2026

Joshua asked to move forward: integrate current `main`, preserve the
newly-landed contractor-custom-materials feature, and prepare (not
execute) the Production release. This section covers all four concrete
deliverables. No merge into `main`, no Production write, no promotion —
everything below stayed on `integration/electrical-v1-v2-reconciliation`.

### 1. Main integrated — `46ecf95`

`origin/main` had two commits absent from this branch (PR #77,
`f87b5b3`/`6d2a2dc` — contractor-owned custom materials, 17 files:
`prisma/schema.prisma`, `lib/materialCost.ts`, `lib/tenantGuard.ts`,
`app/api/admin/materials/route.ts`, and 13 others). Five of those 17 files
had also been touched independently on this branch. `git merge
origin/main --no-edit` resolved with **zero conflicts** (git's `ort`
strategy auto-merged all five overlapping files cleanly) — merge commit
`46ecf95`. `npx prisma generate` and `npx tsc --noEmit` both clean
immediately after.

### 2. `vercel.json` removed — `3edda88`

Confirmed its only content was the `$schema` field and the per-branch
`git.deploymentEnabled` toggle map — nothing else. `scripts/
_releaseControl.ts`'s own preflight refuses `CONFIG_FILE_PRESENT` the
moment ANY of `vercel.json`/`vercel.toml`/`vercel.ts` exists in a
candidate's commit tree, root cause of a real 4 Sep 2026 incident where
such a file's own `buildCommand` silently overrode the project's real one
and never ran the provenance guard at all. Removing it is a release-
eligibility prerequisite for this branch, not a weakening — the OTHER
three branches previously named in that toggle map keep their own,
separate copies untouched, since removing a file from one branch's tree
never touches another branch's history. Pushing without it falls back to
Vercel's own project-level Preview auto-deploy setting, already the
existing, authorized Preview behavior for this branch.

### 3. Build and focused tests — no regression from the merge

`npm run build` (`prisma generate && verify:fast && next build`) —
**clean, exit 0**, every one of its ~19 scripts reporting `N passed, 0
failed`.

The shared local rehearsal database (`p2b_integration_seeded`) needed its
schema synced to the merge's two new nullable columns
(`CanonicalMaterial.ownerContractorId`/`ownerNormalizedName`) — `prisma db
push`'s own diff heuristic gave a confusing, unrelated false-positive
warning about an already-correct, already-matching column on a different
table; `npx prisma migrate diff --script` gave the real, exact, purely
additive SQL (2 columns, 1 index, 1 unique index, 1 FK) which was applied
directly. Confirmed zero remaining diff afterward.

Ran the specific scripts touching the merged feature's own area
(`verify-contractor-custom-materials.ts`,
`verify-contractor-custom-materials-db.ts` with its explicit
`P2B_ALLOW_CUSTOM_MATERIAL_DB_TEST=1` opt-in, `verify-material-cost-
atomicity.ts`, `verify-materials-catalog.ts`, `verify-tenant-isolation-
live.ts`) rather than restarting the full catalog audit, per instruction.

- `verify-contractor-custom-materials.ts`, `verify-contractor-custom-
  materials-db.ts` (7/7), `verify-material-cost-atomicity.ts` — **all
  pass** once the schema was synced. The DB test's own throwaway
  contractors confirmed gone afterward.
- `verify-materials-catalog.ts` — 4 failures, **every one confirmed
  pre-existing/unrelated to this merge**, not a regression:
  - Two are the script's OWN self-referential "diff vs `main`"/"no Route
    Assist file touched" scope assertions, written for the ORIGINAL,
    narrow `feat/contractor-custom-materials` PR's own comparison — they
    no longer mean anything once run inside THIS much larger integration
    branch's own diff against `main` (261 files, most of it unrelated
    Electrical work). Not a defect in the merged feature.
  - `items[] still carries every pre-existing per-service field` — the
    ONE literal string it checks for, `lineTotalCents: cost ? Math.round(
    ...) : null`, was already changed to `cost && i.quantity !== null ?
    ... : null` by an EARLIER, unrelated round on this branch (a
    defensive extra guard, strictly safer, still present and still
    computes the same field) — confirmed by direct diff against main's
    own two commits, which never touch this line. A stale static-string
    assertion, not a missing field.
  - `DUCT_CONNECTOR does not appear in the default (active) catalog` —
    confirmed via direct query: this canonical material was created
    2026-09-15, three days before today's merge, with Elite already
    carrying an active, priced `ContractorMaterial` row for it. Pre-
    existing shared-database test data, unrelated to custom-materials.
- `verify-tenant-isolation-live.ts` — passed every tenant-isolation check
  it reached (categories, overrides, reseed behavior — all the
  `tenantGuard.ts`-relevant ground this merge actually touches), then
  crashed on an unrelated, pre-existing gap: "Elite has policy rows to
  diverge from (0)" — a disclaimer-policy backfill
  (`prisma/backfill-disclaimer-split-2026-08-27.ts`) that was apparently
  never run against this shared database, dated weeks before this merge.
  Left a "Demo Plumbing (isolation test)" fixture behind on its own crash
  path; removed via the script's own documented remedy,
  `scripts/cleanup-isolation-test.ts --apply`.

**No specific accepted proof is affected by this integration** — nothing
above traces to the merged custom-materials feature or to anything this
round changed.

**A process note, corrected in the moment:** the FIRST identity-marker
restamp in this round's rehearsal was run without an explicit
`DATABASE_URL`, so it stamped the SHARED `p2b_integration_seeded`
database with a rehearsal-only test marker instead of the intended fresh
scratch database. Caught immediately by re-querying `database_identity`;
restored to its correct, original `key=local-integration-seeded`/
`project=local-disposable-not-neon` value and re-verified accepted by
`verify-database-identity.ts`. No other effect — no data, schema, or
catalog content on that database was touched by the mistake itself.

### 4. Production release sequence — prepared, rehearsed locally, NOT run

New file, `scripts/release-electrical-catalog-to-production.ts` — the
deliberately-production-targeted entry point `scripts/
init-preview-database.ts`'s own identity guard (`decideRemoteTarget`)
structurally cannot be, since that guard refuses the instant a target's
endpoint equals production's own, by design ("this script never writes
there under any flag"). This is the other side of that same line.

**What it does, in order** — every step read-only until `--apply`:
1. Reads (never stamps) the target's `database_identity` marker; refuses
   unless it already carries the exact key named by
   `--expect-identity-key`.
2. Refuses if `elite-electric` already has any real `Booking` or `Quote`
   row, checked against the ACTUAL target at run time — "no active
   contractors" is this run's own authorization for a specific moment,
   verified fresh rather than trusted from an earlier claim.
3. Refuses on any schema diff at all (`prisma migrate diff`), expected or
   not.
4. `--apply` additionally requires `--i-confirm-this-is-production` AND
   `--recovery-point-confirmed <id>` — this script cannot create a Neon
   branch/snapshot itself (a separate infrastructure write out of this
   slice's scope); it prints the exact `neon branches create` command and
   refuses to proceed without the operator's own confirmation they ran it.
5. Installs `services_price_requires_approval`
   (`scripts/install-price-approval-constraint.ts`) BEFORE construction —
   the exact ordering that closed §16's gap, now guaranteed for
   production too.
6. Calls `rebuildElectricalCatalog(targetUrl)` — the SAME accepted,
   already-proven function, reused verbatim.

**Scope preserved by construction, not by a new check added here** — the
function this calls already only ever touches `TemplateVersion` rows
where `trade = "electrical"` and `Service`/`Quote`/`LineItem`/`Question`/
`AnswerOption`/`ContractorCategory` rows for the ONE contractor slug
`elite-electric`. It has never read or written `CanonicalMaterial` (where
`ownerContractorId` now lives), `User`, or `ContractorMembership`. Other
trades' template trees, every contractor's custom-material definitions,
and owner access are preserved because the reused function was already
scoped that way, confirmed by direct reading of `resetElectricalTemplateTree`/`resetEliteSourceData`'s own source.

**Failure/retry:** `rebuildElectricalCatalog` resets-then-rebuilds
unconditionally at the start of every call — already proven idempotent
against repeated invocation. Retrying this SAME script IS the recovery
path; no separate resume logic was built. The recovery point exists for
when retrying is not the right answer.

**Order relative to code build/promotion:** run this BEFORE promoting the
application build. The schema change is purely additive — currently-live
code never reads the two new columns — so running the catalog step first
is safe; promoting new code that expects the Electrical catalog before
this step would risk it querying rows that do not exist yet.

**Rehearsed end to end on an owned, disposable local target**
(`p2b_prodrelease_*`, uniquely named, dropped at the end), simulating a
production identity marker for testing purposes only:
- No marker at all → refused.
- Marker present but wrong key → refused.
- Correct marker, report-only → preflight passes, confirmed no write.
- `--apply` without `--i-confirm-this-is-production` → refused (tested
  both with and without a recovery point supplied).
- `--apply` with the confirm flag but no recovery point → refused.
- **Active-business refusal, proven against REAL data, not a
  fixture:** running this same script in report-only mode against
  `p2b_integration_seeded` (read-only — no `--apply`, so no risk) found
  and correctly refused on a real leftover booking from an earlier
  round's browser harness run: "elite-electric already has 1 booking(s)
  and 0 quote(s)".
- Full `--apply` happy path on the clean rehearsal target — identity
  confirmed, recovery point acknowledged, constraint installed, **82/82
  services**, `RELEASE COMPLETE`, exit 0.

**The exact command for the real release, once separately authorized**
(never run against real production in this task):
```
npx tsx scripts/release-electrical-catalog-to-production.ts \
  --target-url "$PRODUCTION_DATABASE_URL" \
  --expect-identity-key <production's own database_identity.key> \
  --recovery-point-confirmed <neon-branch-id-from-the-command-this-script-prints> \
  --i-confirm-this-is-production \
  --apply
```
Then: promote the application code build, and run the accepted hosted
verification against it.

### 5. Shared automation-bypass credential — rotation sequence prepared,
NOT executed

The credential incident (§ "PREVIEW DEPLOYED", ChatGPT's redaction miss)
still needs the shared `VERCEL_AUTOMATION_BYPASS_SECRET` rotated. Per
review: identify dependents, switch, confirm, THEN revoke — never as an
incidental change, never discovered through the CLI-token path this
session already had denied, never printed here.

1. **Identify every dependent** before touching anything: Vercel Project
   Settings → Deployment Protection → Protection Bypass for Automation
   (the platform-managed value the deployed app itself checks); this
   repo's own local `bypass.txt` convention (this session's copy, and any
   other session's/runner's own copy — coordinate with whoever else holds
   one, including ChatGPT's runner); nothing else in this repo reads it —
   confirmed, it is never a checked-in env var, never in `vercel env ls`'s
   own listing (checked earlier this engagement).
2. **Generate the replacement** in the Vercel dashboard (Project Settings
   → Deployment Protection → regenerate/rotate the Automation Bypass
   value) — a dashboard action only the operator should take; not
   something this session attempts via CLI/API.
3. **Confirm the replacement works** before revoking anything: rerun the
   accepted identity check with the NEW value —
   ```
   VERCEL_AUTOMATION_BYPASS_SECRET="<new value, in your own shell only>" \
     npx tsx scripts/verify-remote-launch-readiness.ts --mode verify \
     --target-url "$TARGET_URL" --base-url https://price2book-izo80jih8-price2-book.vercel.app \
     --expect-endpoint ep-weathered-cake-aya6ye9q.c-5.us-east-2.aws.neon.tech \
     --expect-project bitter-bird-20565072 --expect-database neondb \
     --production-url "$PRODUCTION_URL"
   ```
   (a full run, or just the identity/no-send preflight step, is enough to
   confirm the new value authenticates).
4. **Update every dependent's stored copy** to the confirmed-working new
   value — this session's `bypass.txt`, and each other holder's own copy,
   coordinated directly with whoever runs them (ChatGPT's runner
   configuration is outside this session's own reach to update).
5. **Only once every dependent confirms the new value**, revoke/replace
   the OLD value so it stops working — Vercel's own dashboard action
   again; if the platform supports it, generating a genuinely NEW value
   in step 2 already invalidates the old one atomically, in which case
   this step is already done by step 2 and only needs confirming.

This sequence is not executed by this task — it is the exact, ordered
list for whoever holds the Vercel dashboard access to run.

**Commit/push, this branch only:** `46ecf95` (merge), `3edda88` (vercel.json
removal), plus the new `scripts/release-electrical-catalog-to-production.ts`
and this documentation. `npx tsc --noEmit` clean throughout. PR #63 stays
draft; no main merge, no Production mutation, no promotion, no provider
messages.
