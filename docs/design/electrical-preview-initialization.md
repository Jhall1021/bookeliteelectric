# Electrical Preview database initialization — executable plan

Documentation and rehearsed tooling only. No Neon branch has been created,
no Preview deployment has been triggered, and `vercel.json`'s
`deploymentEnabled: false` for `integration/electrical-v1-v2-reconciliation`
is unchanged. Every claim below was rehearsed against an owned, disposable
LOCAL Postgres target only (see §5) — nothing here has ever run against a
real Neon database.

## 1. The executable entry point

`scripts/init-preview-database.ts` — a single, identity-checked orchestrator.

```
npx tsx scripts/init-preview-database.ts --target-url <url> [--apply]
  [--i-am-targeting-a-real-preview-branch] [--label <short-name>]
```

- **No flag writes anything.** Plan mode (no `--apply`) resolves and prints
  the real identity verdict for `--target-url`, then prints the exact
  ordered plan below — it does not create a database, push schema, or run
  any seed step.
- **Identity is verified before any write, in both modes:**
  - `--target-url` resolving to a loopback host is treated as a **local
    rehearsal** target. A brand-new, uniquely-named scratch database is
    created (never a pre-existing one, no pre-drop), stamped `local-*`, and
    dropped again at the end of the run.
  - Any other host is treated as a **remote (Preview branch)** target and is
    refused unless `scripts/_lineage.ts`'s own `classifyRehearsalTarget`
    returns `ok: true` — the same "is this a genuine branch of production,
    never production itself, never an archive, never a foreign lineage"
    check five other rehearsal scripts in this repo already rely on — AND
    the operator passes `--i-am-targeting-a-real-preview-branch` (the same
    "yes, deliberately" idiom `scripts/extract-template-catalog.ts`'s own
    `--i-know-this-writes-to-production` flag already uses, for the
    opposite case). Missing either refuses with a clear reason and exits
    non-zero.
- **Reuses the accepted catalog construction directly**, not a re-derived
  copy: imports `SEED_STEPS`, `NEEDS_APPLY`, `TOLERATE_NONZERO`,
  `POST_SEED_STEPS`, `run`, `bootstrapContractor`,
  `addMissingCoverRaised4sRole` and `applyBatch2fSurgeFix` from
  `scripts/rehearse-fresh-electrical-launch.ts` — the exact same ordered
  chain that script's own `main()` runs, now exported so a second entry
  point can run it against a different target without retyping it. Fixed
  along the way: that file's `main()` executed unconditionally on import
  (no entrypoint guard), so importing it for its exports also silently
  created and half-seeded an unwanted scratch database the first time this
  was rehearsed — see §5. Guarded now, the same
  `import.meta.url === pathToFileURL(process.argv[1]).href` pattern
  `scripts/add-equipment-roles.ts`/`add-consumables-recipes.ts`/
  `build-fan-packages.ts` already use for the identical reason (they are
  themselves run as sub-steps of that file's own chain).
- **Proves "normal contractor setup"** the same way
  `scripts/rehearse-fresh-electrical-launch-phase2.ts` already does:
  `templateVersionSource` → `preflight` → `installCatalog`, once, against a
  throwaway `Contractor` row — not a browser signup, not a new proof
  surface, just confirmation that the freshly built catalog installs
  cleanly through the real onboarding path.

## 2. The exact ordered plan (what `--apply` actually runs)

1. `prisma db push --skip-generate --accept-data-loss` against the target.
2. `scripts/verify-database-identity.ts --stamp` — records which database
   this is (`local-previewinit-<name>` / `local-disposable-not-neon` for a
   local rehearsal; `--label`'s value / `preview-branch` for a remote one).
3. **Local target only:** `assertDisposableLocalDatabase` — the same
   belt-and-braces re-check `rehearse-fresh-electrical-launch.ts`'s own
   `main()` performs before writing, redundant with step 2 by design.
4. `bootstrapContractor` + `addMissingCoverRaised4sRole` (the one real,
   pre-existing gap this branch's own fresh-launch rehearsal found and
   fixed — see `docs/design/electrical-fresh-launch-reset-manifest.md` §11).
5. The 49 files in `SEED_STEPS`, in the exact order that constant lists,
   each with `--apply` where `NEEDS_APPLY` says so.
6. Post-seed steps, in order: the Batch 2F surge-protection fix, Batch 2E's
   `add-consumables-recipes.ts --apply`, `repair-trees.ts`, full-catalog
   extraction (`extract-template-catalog.ts --from elite-electric --apply`),
   the panel-replacement recipe correction, and the two Routing V2 template
   patches.
7. A real `preflight`/`installCatalog` install for one throwaway
   contractor — proof the catalog a real onboarding contractor would see
   actually installs.
8. **Local target only:** drop the scratch database. A real Preview target
   is left in place — this script does not own its lifecycle and never
   drops it.

Every one of these steps already exists and is already proven, individually,
elsewhere in this repository; this script's own contribution is the
identity guard around them and the single command that runs them in order
against a chosen target.

## 3. Preserving owner access and every other trade

Every write above is scoped to the `"electrical"` trade's own
`TemplateVersion` (`extract-template-catalog.ts`'s own
`--from elite-electric` flag) and one throwaway `Contractor` row created in
step 7. Nothing in this chain touches `User`, `ContractorMembership`,
platform-owner rows, or any other trade's `TemplateService`/
`TemplateVersion` data — there is structurally nothing in the chain that
could reach them. A Preview branch created fresh from a production snapshot
(Neon's own branching semantics) would carry forward whatever owner
accounts and other-trade template rows production already has, untouched.

## 4. Integration isolation

This script never touches `p2b_integration_seeded` or any other shared
rehearsal database — a local run creates and destroys its own uniquely
named scratch database, and a remote run only ever proceeds against a
target `classifyRehearsalTarget` has independently confirmed is a genuine
branch of production, which a shared rehearsal cluster is not (it would
fail `classifyRehearsalTarget`'s check the same way anything else foreign
does). Running this script concurrently with another session's own
DB-driving work is therefore safe by construction: there is no shared
target for the two to collide on, matching the standing rule (project
memory: "never run two DB-driving chains at once" applies to the shared
cluster specifically, not to independently-targeted owned databases).

## 5. Rehearsal evidence (local target only)

Run against a brand-new local scratch database this script created and
dropped itself (`127.0.0.1:5544`, name generated at run time,
`p2b_previewinit_<run-id>`):

- **Plan mode** (`--target-url postgresql://rehearsal_admin@127.0.0.1:5544/whatever`,
  no `--apply`): printed the identity verdict and the 8-step plan above;
  confirmed via a direct database listing immediately after that no
  database was created.
- **Local apply** (same target-url, `--apply`): real run, real output —
  **82 of 82 services extracted**, the panel-replacement recipe applied,
  both Routing V2 template patches applied, and
  `NORMAL CONTRACTOR SETUP PROVEN: installed 82 services through the real
  preflight/installCatalog path`. The scratch database was dropped at the
  end of the run; confirmed via a direct database listing afterward that
  nothing was left running.
- **Remote-path refusal**: pointed at a syntactically well-formed, but
  unverifiable, non-loopback URL (`ep-fake-example-....neon.tech`) with no
  genuine production `DATABASE_URL` reference available in this
  environment. `classifyRehearsalTarget` correctly refused
  (`STALE_LINEAGE_CONSTANT` — it could not verify a real production
  reference to measure the target against) and the script exited non-zero
  without creating, pushing schema to, or writing anything. This is the
  intended fail-closed behavior when no genuine production reference is
  available to validate against, which is the correct state for this local
  development environment to be in.
- **Found and fixed along the way**: `rehearse-fresh-electrical-launch.ts`
  had no entrypoint guard, so importing its newly-exported constants for
  reuse also ran its own `main()` as a side effect — discovered when the
  first plan-mode rehearsal above unexpectedly created a full scratch
  database. Fixed with the same guard pattern already used elsewhere in
  this repo for scripts that are both standalone-runnable and imported as
  sub-steps; re-verified `rehearse-fresh-electrical-launch.ts` still runs
  standalone correctly (82/82 services) after the fix.

## 6. Current `main` reconciliation needed

Measured directly (`git rev-list --left-right --count origin/main...HEAD`
from this branch): **24 commits ahead, 147 commits behind `main`**, with
243 files differing (~50,000 lines). This is a large, real divergence, not
a simple fast-forward gap, and it matters for Preview specifically: a
Preview build sources from THIS branch's own tree, not from `main`, so a
Preview deployment today would ship without whatever the 147-commit gap
contains.

What the 147-commit gap actually contains, from the diff shape (not a full
audit — a shape-level read, since the two branches' schemas need to be
read together properly before any real reconciliation, and that reading is
this section's job to flag, not to perform):

- The large majority of changed files are new `scripts/verify-*.ts` and
  `scripts/audit-*.ts` files — additive, read-only verification tooling
  with essentially no merge-conflict risk.
- A substantial, genuinely new `lib/electrical/*` surface exists on `main`
  that this branch does not have at all (derived pricing approval/basis,
  pilot eligibility/diagnostic/reset, Route Assist adapter and routing-v2
  facts, surface takeoff/raceway/configuration, a first-service wizard) —
  matching project memory's own note that Route Assist and the pilot
  program moved to a separate, parallel workstream. This is additive from
  this branch's point of view, but it means `main`'s Electrical experience
  is meaningfully different from — and ahead of, in some directions — what
  this branch's own catalog/disclaimer work has been built and proven
  against.
- **`prisma/schema.prisma` itself has diverged substantially**: 698
  insertions, 30 deletions relative to `main`. This is the highest-risk
  reconciliation surface — both branches have added real model/field
  changes independently (this branch's own three rounds of disclaimer/
  access-classification/component-condition schema work included), and a
  real merge needs a person or a dedicated session to read both sides
  together, not a mechanical rebase.
- A smaller set of files both branches touch with real, independent
  changes and therefore carry the most direct conflict risk if merged
  mechanically: `app/dashboard/policies/page.tsx`, `app/api/services/[slug]/
  route.ts`, `app/api/visit/route.ts`, `app/dashboard/setup/page.tsx`,
  `lib/auth.ts`. Each of these is also a file this round's own disclaimer-
  authoring work touched or reads from.
- `vercel.json` does not exist on `main` at all — it is a file unique to
  this branch and its sibling audit/feature branches, created specifically
  to hold the `deploymentEnabled: false` map. Reconciling onto `main` means
  deciding whether that map (or an equivalent) needs to exist on `main`
  too, not assuming it carries over automatically.

**Conclusion, not a recommendation to act on it now:** a real Preview
deployment that is meant to reflect "the accepted work reviewed in PR #63"
needs this branch reconciled with `main` first — either a rebase or a
merge, decided by someone who can read both schemas together — or the
Preview build will not reflect the same Electrical experience `main`
already serves. That reconciliation is a separate, larger piece of work
than this task's own scope, and is not attempted here.

## 7. What is still deferred, deliberately

- Creating an actual Neon Preview branch. No Neon API integration exists
  anywhere in this repository (confirmed by search) — provisioning the
  branch itself stays a manual/external step outside this script.
- Flipping `vercel.json`'s `deploymentEnabled` entry for this branch to
  `true`. Unchanged by this task, per the standing rule.
- Running `scripts/init-preview-database.ts --target-url <a-real-Neon-URL>
  --apply --i-am-targeting-a-real-preview-branch`. Everything above proves
  the script's own logic; it has never been pointed at anything but a local
  disposable target.
- The `main` reconciliation itself (§6).
- Any production reset. Unrelated to and unblocked by this document.

Each of the above needs its own explicit, in-conversation authorization
before it happens, per this engagement's standing rule.
