# Electrical Preview database initialization — executable plan

Documentation and rehearsed tooling only. No Neon branch has been created,
no Preview deployment has been triggered, and `vercel.json`'s
`deploymentEnabled: false` for `integration/electrical-v1-v2-reconciliation`
is unchanged. Every claim below was rehearsed against owned, disposable
LOCAL Postgres targets only (see §6) — nothing here has ever run against a
real Neon database.

**Corrected 20 Sep 2026** from code review of the first version: the
designated-target check, the identity-stamp behavior, and the populated-
target rebuild contract were all found unready for a real Preview branch
before anything here was pointed at one. See §1–§4 for what changed and why.

## 1. The executable entry point

`scripts/init-preview-database.ts` — a single, identity-checked orchestrator.

```
npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
  [--expect-endpoint <endpoint>] [--expect-project <neon-project-id>]
```

`--expect-endpoint`/`--expect-project` are **required** once `--target-url`
is not a loopback host.

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
    hardcoded one — see the correction below), stamped `local-*`, and
    dropped again at the end of the run.
  - Any other host is treated as a **remote (Preview branch)** target and is
    refused unless it is the exact, designated target — see the correction
    below.
- **Reuses the accepted catalog construction directly**, not a re-derived
  copy: imports `SEED_STEPS`, `NEEDS_APPLY`, `TOLERATE_NONZERO`,
  `POST_SEED_STEPS`, `run`, `bootstrapContractor`,
  `addMissingCoverRaised4sRole` and `applyBatch2fSurgeFix` from
  `scripts/rehearse-fresh-electrical-launch.ts` — the exact same ordered
  chain that script's own `main()` runs, now exported so a second entry
  point can run it against a different target without retyping it.
- **Proves "normal contractor setup"** the same way
  `scripts/rehearse-fresh-electrical-launch-phase2.ts` already does:
  `templateVersionSource` → `preflight` → `installCatalog`, once, against a
  throwaway `Contractor` row — not a browser signup, not a new proof
  surface, just confirmation that the freshly built catalog installs
  cleanly through the real onboarding path.

### What code review found wrong with the first version, and the fix

1. **"Any production-lineage copy + a generic confirmation flag" is not a
   designated-target binding.** `classifyRehearsalTarget` proves a target is
   *a* genuine branch of production — it says nothing about whether it is
   *the one* the operator meant, so it would equally accept a sibling
   rehearsal branch built for a different PR. Fixed: `--expect-endpoint`/
   `--expect-project` are now required for a remote target, and the run
   refuses unless the endpoint `--target-url` actually resolves to matches
   `--expect-endpoint` exactly, and is explicitly, directly checked as NOT
   equal to production's own endpoint. `classifyRehearsalTarget`'s verdict
   is still required to pass, but only as supporting evidence that the
   designated target is a real branch (not an archive, not foreign) — never
   as proof of which branch it is. The decision is a pure, exported,
   unit-tested function (`decideRemoteTarget` in `init-preview-database.ts`)
   — see §6 for the sibling-branch/production-endpoint/missing-flag
   scenarios it was rehearsed against, with canned lineage verdicts and no
   real database.
2. **The remote path used to restamp the identity marker on every apply,**
   which defeats the very check that made the target safe to use.
   `verify-database-identity.ts --stamp` always writes `neonEndpoint:
   <the endpoint currently connected to>` — but a branch's marker only
   proves it's a branch because that field still names *production's*
   endpoint, not its own (`scripts/_lineage.ts`'s own header comment). The
   first version stamped every remote apply with the connected endpoint,
   which would make `classifyRehearsalTarget` call this same target "the
   original" and refuse it on the very next check, including a retry of
   this same script. Fixed: a remote target's identity marker is never
   written by this script. The verified endpoint/project are logged for the
   human record only.
3. **Every rehearsal so far ran against a brand-new, EMPTY database,** but a
   real Preview branch is a Neon copy-on-write clone of production —
   populated, carrying production's own real `electrical` TemplateVersion
   history (a v1 SNAPSHOT plus v2..v6 DELTAs; see `scripts/rehearse-fresh-
   electrical-launch.ts`'s own per-version provenance notes).
   `extract-template-catalog.ts` upserts strictly on `(trade, version)` and
   never looks for other versions of the trade (confirmed by reading it:
   `const version = Number(arg("version") ?? "1")`, then `upsert({where:
   {trade_version: {trade, version}}, update: {}, ...})` — no query across
   other versions at all). Left alone, a populated clone's real DELTA rows
   would sit untouched alongside a freshly-rebuilt v1, and
   `lib/templateProvisioning.ts`'s `templateVersionSource` — the same
   resolver `preflight`/`installCatalog` use — automatically folds every
   `DELTA` row above the snapshot's version back on top of it. The result
   would silently be a hybrid of "this run's v1" and "whatever real DELTA
   history the clone happened to carry", not the catalog either side
   authored. Fixed with a real, narrow reset — see §2 step 4 and §3.
4. Two claims in the first version are retracted as unsupported once (3)
   above is real: "every write is scoped to one throwaway Contractor row"
   (the reset is a genuine, trade-scoped DELETE, not an insert-only write —
   see §3 for why it's still safe) and "safe concurrently by construction"
   (true only across *different* targets — see §4).

## 2. The exact ordered plan (what `--apply` actually runs)

1. `prisma db push --skip-generate --accept-data-loss` against the target.
2. **Local target only:** `scripts/verify-database-identity.ts --stamp`,
   recording `local-previewinit-<name>` / `local-disposable-not-neon`. A
   remote target's inherited marker is never written — see §1 correction 2.
3. **Local target only:** `assertDisposableLocalDatabase` — the same
   belt-and-braces re-check `rehearse-fresh-electrical-launch.ts`'s own
   `main()` performs before writing, redundant with step 2 by design.
4. **`resetElectricalTemplateTree`**: delete every existing `TemplateVersion`
   row for `trade: "electrical"`, cascading through its whole template tree
   (`TemplateService` → `TemplateQuestion` → `TemplateAnswerOption` → its
   children — all real `onDelete: Cascade` foreign keys,
   `prisma/schema.prisma:4274` onward). On a fresh local database this is a
   no-op (nothing exists yet); on a populated remote clone this is the real,
   destructive step that makes the rebuild in step 6 actually authoritative
   instead of folding onto whatever the clone already had. See §3 for why
   this cannot reach anything already installed.
5. `bootstrapContractor` + `addMissingCoverRaised4sRole` (the one real,
   pre-existing gap this branch's own fresh-launch rehearsal found and
   fixed — see `docs/design/electrical-fresh-launch-reset-manifest.md` §11).
6. The 49 files in `SEED_STEPS`, in the exact order that constant lists,
   each with `--apply` where `NEEDS_APPLY` says so.
7. Post-seed steps, in order: the Batch 2F surge-protection fix, Batch 2E's
   `add-consumables-recipes.ts --apply`, `repair-trees.ts`, full-catalog
   extraction (`extract-template-catalog.ts --from elite-electric --apply`),
   the panel-replacement recipe correction, and the two Routing V2 template
   patches.
8. **`verifyIntendedCatalogIsCurrent`**: assert exactly one `electrical`
   `TemplateVersion` row exists (the reset in step 4 ran, and nothing else
   re-created a second one mid-run — a stray DELTA from a race or a partial
   prior failure is refused here, not silently folded in) and that its own
   `TemplateService` count is the expected 82. This is checked directly
   against the template tables, not inferred from step 9's install count —
   `installCatalog` reads through the same fold that could be silently
   wrong, so its own reported count is not independent evidence.
9. A real `preflight`/`installCatalog` install for one throwaway
   contractor — proof the catalog a real onboarding contractor would see
   actually installs.
10. **Local target only:** drop the scratch database. A real Preview target
    is left in place — this script does not own its lifecycle and never
    drops it.

Every one of these steps already exists and is already proven, individually,
elsewhere in this repository (steps 4 and 8 are new this round, proven in
§6); this script's own contribution is the identity guard, the reset/verify
pair around a populated target, and the single command that runs all of it
in order against a chosen target.

### Retry / partial-failure contract

A failed apply, followed by a retry (same command, same target), is safe
with respect to the `electrical` template tree specifically: step 4 resets
it unconditionally at the start of every apply, so a retry always rebuilds
from a clean slate regardless of how far a prior attempt got. It is **not**
safe with respect to the throwaway proof contractor step 9 creates —
its slug is timestamp-unique and is never deleted by this script, so a
target retried several times accumulates one `preview-init-check-*`
`Contractor` per attempt. This is harmless to the template catalog (that
step only ever reads it) and does not affect any real contractor, but is
left for a human to prune if the accumulation matters — this script does
not own that row's lifecycle beyond proving installation once.

## 3. Preserving owner access and every other trade

The reset in step 4 and every seed/extraction write after it is scoped to
the `"electrical"` trade's own `TemplateVersion` tree, plus one throwaway
`Contractor` row created in step 9. This is not merely a convention — for
the reset specifically, it is structural: `Service.templateVersionId`,
`Question.templateVersionId`, and `AnswerOption.templateVersionId` (and
their `templateKey` siblings) are declared as plain `String?` scalars with
**no `@relation` at all** (`prisma/schema.prisma:2440-2444`'s own comment:
"A RECORD, not a link: nothing reads through it at request time"). Deleting
a `TemplateVersion` row therefore cannot cascade to, restrict, or null out
any already-installed `Service`/`Question`/`AnswerOption` row for ANY
contractor — those rows simply keep a now-stale id as history, exactly as
designed. Nothing in this chain touches `User`, `ContractorMembership`,
platform-owner rows, or any other trade's `TemplateService`/
`TemplateVersion` data either — `resetElectricalTemplateTree`'s query is
`where: { trade: "electrical" }`, which cannot select another trade's rows
at all. §6's local rehearsal proves this empirically (a sentinel owner
User/ContractorMembership, a sentinel other-trade TemplateVersion, and an
already-installed contractor's live Service all survive the reset
untouched), not just by reading the schema.

## 4. Database isolation between concurrent runs

This script never touches `p2b_integration_seeded` or any other shared
rehearsal database — a local run creates and destroys its own uniquely
named scratch database, and a remote run only ever proceeds against the one
designated target `--expect-endpoint`/`--expect-project` name, which a
shared rehearsal cluster could never satisfy. Running this script against a
DIFFERENT target than another session's own DB-driving work is therefore
safe — there is no shared target for the two to collide on, matching the
standing rule (project memory: "never run two DB-driving chains at once"
applies to the shared cluster specifically, not to independently-targeted
owned databases).

**Retracted from the first version:** "safe concurrently by construction"
overstated this. Two runs of THIS script against the SAME remote target at
the same time are NOT safe — the reset (step 4) and the rebuild (steps
5-8) are a sequence of separate subprocess and Prisma calls, not one
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

Two separate local rehearsals, neither touching a real Neon database:

**A. `scripts/init-preview-database.ts` end-to-end**, run against a
brand-new local scratch database this script created and dropped itself
(`127.0.0.1:5544`, name generated at run time, `p2b_previewinit_<run-id>`):

- **Plan mode** (`--target-url postgresql://rehearsal_admin@127.0.0.1:5544/whatever`,
  no `--apply`): printed the identity verdict and the 10-step plan above,
  correctly reporting "a fresh local database has nothing to reset" for
  step 4; confirmed via a direct database listing before and after that no
  database was created.
- **Local apply** (same target-url, `--apply`): real run, real output —
  the reset step correctly reported "nothing existed, nothing reset" (a
  fresh database), **82 of 82 services extracted**, the panel-replacement
  recipe applied, both Routing V2 template patches applied,
  `FOLDED CATALOG VERIFIED: exactly one "electrical" TemplateVersion (v1
  SNAPSHOT, ...) with 82 services — no inherited DELTA or stale version
  present`, and `NORMAL CONTRACTOR SETUP PROVEN: installed 82 services
  through the real preflight/installCatalog path`. The scratch database
  was dropped at the end of the run; confirmed via a direct database
  listing afterward that nothing was left running.
- **Found and fixed along the way, again**: writing this round's new
  `scripts/verify-init-preview-database-contract.ts` to import
  `init-preview-database.ts`'s newly-exported functions triggered the
  identical class of bug corrected last round in
  `rehearse-fresh-electrical-launch.ts` — `init-preview-database.ts` itself
  still had no entrypoint guard, so importing it for its exports ran its
  own `main()` (which calls `process.exit(1)` on missing `--target-url`)
  as a side effect. Fixed with the same
  `import.meta.url === pathToFileURL(process.argv[1]).href` guard used
  everywhere else in this repo for the identical reason; re-verified both
  the standalone script and the new import-based verify script run
  correctly after the fix.

**B. `scripts/verify-init-preview-database-contract.ts`** (new this round)
— rehearses the two things (A) structurally cannot exercise: the exact
designated-target-binding decision, and the populated-target reset/rebuild
contract. 17 checks, 17 passed:

- *Designated-target binding* (`decideRemoteTarget`, pure function, no
  database, canned lineage verdicts): the correctly-declared intended
  endpoint with a passing lineage verdict is accepted; a sibling rehearsal
  branch — a real branch of production, but a DIFFERENT one than declared —
  refuses on the binding mismatch alone, and that refusal never contains a
  raw connection string; the same sibling branch IS accepted once it is the
  one actually declared (the binding names a target, it is not a blocklist);
  production's own endpoint refuses via the explicit inequality check even
  if it were declared as the expectation; a missing `--expect-endpoint`/
  `--expect-project` refuses before lineage is even consulted.
- *Populated-target reset/rebuild* (real local Postgres, simulating a
  Preview-clone's shape): fabricated an "inherited later DELTA" (an old v1
  SNAPSHOT plus a v2 DELTA above it, matching production's real
  SNAPSHOT+DELTA pattern) alongside sentinel rows — an owner `User` +
  `ContractorMembership`, a different trade's own `TemplateVersion`, and an
  already-installed contractor's live `Service` provenance-stamped from the
  old snapshot. `resetElectricalTemplateTree` deleted both fabricated
  electrical versions; the sentinel other-trade version, the sentinel
  owner's membership, and the already-installed live `Service` all survived
  untouched (despite that `Service`'s `templateVersionId` now pointing at a
  deleted row — proving the no-FK claim in §3 empirically, not just by
  reading the schema). A minimal rebuild (2 services) then passed
  `verifyIntendedCatalogIsCurrent`; a fabricated stray second version
  (simulating a race or a partial-failure leftover) correctly made
  `verifyIntendedCatalogIsCurrent` refuse rather than silently accept a
  plausible count.

Deliberately not re-run this round, per the instruction not to reopen the
existing decision-tree/booking proofs: the browser-flow disclaimer-
authoring proof, the template-version-fold scenarios, and the access-
conditional-component proof — all already green from the prior round with
no change to the code they exercise.

## 7. Current `main` reconciliation needed

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

**Conclusion, not a recommendation to act on it now:** a real Preview
deployment that is meant to reflect "the accepted work reviewed in PR #63"
needs this branch reconciled with the 24-commit `main`-only gap first —
either a rebase or a merge, decided by someone who can read both
`schema.prisma` sides together — or the Preview build will be missing
Batches 2E/2F's production publication, the TV-mount reconciliation, the
Materials Catalog admin surface, guided-flow entry-service provenance, and
the dedicated-circuit entry aliases. That reconciliation is a separate,
larger piece of work than this task's own scope, and is not attempted here.

## 8. What is still deferred, deliberately

- Creating an actual Neon Preview branch. No Neon API integration exists
  anywhere in this repository (confirmed by search) — provisioning the
  branch itself stays a manual/external step outside this script.
- Flipping `vercel.json`'s `deploymentEnabled` entry for this branch to
  `true`. Unchanged by this task, per the standing rule.
- Running `scripts/init-preview-database.ts --target-url <a-real-Neon-URL>
  --apply --expect-endpoint <endpoint> --expect-project <project-id>`.
  Everything above proves the script's own logic, including its populated-
  target reset/rebuild contract (§6.B); it has never been pointed at
  anything but a local disposable or locally-fabricated target.
- The `main` reconciliation itself (§7).
- The application integration isolation checklist (§5) — none of those
  configuration decisions have been made or implemented.
- Any production reset. Unrelated to and unblocked by this document.

Each of the above needs its own explicit, in-conversation authorization
before it happens, per this engagement's standing rule.
