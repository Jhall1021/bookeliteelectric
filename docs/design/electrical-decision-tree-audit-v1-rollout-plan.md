# Electrical Decision Tree Audit V1 — catalog rollout plan (not applied)

Nothing in this document has been run. **No seed, retirement, extraction, or catalog
update is authorized by this document.** It describes the path — using mechanisms
that already exist in this codebase, narrowed further where the direct code-review on
PR #56 found them not narrow enough — by which the seed-file fixes for B.2, B.16,
B.17, B.18, and B.19 would reach Elite's own catalog, the canonical template, a fresh
rehearsal contractor, and already-provisioned contractors.

## Revision note

The previous version of this document recommended running two of these files "wholesale,"
calling them "single-purpose" and "single-service." Direct review on PR #56 found both
claims wrong:

- `prisma/seed-device-and-finish-modules.ts`'s `main()` runs `seedDeviceModule()` against
  **13** services (`DEVICE_SERVICES`), not the one (`replace-standard-outlet`) B.17
  actually touches.
- `prisma/seed-dedicated-circuit.ts`'s `main()` bundled the B.18 tree fix together with a
  **tenant-unscoped** `service.updateMany({ where: { slug: { in: RETIRED } } } })` —
  no `contractorId` filter — retiring four unrelated services. Retirement is explicitly
  excluded from this task; running the whole file would have performed it anyway, on
  every tenant, as a side effect of applying a tree fix.

Both are corrected below and in the code itself, not just in this document:

- `seedDeviceModule(slug)` was already exported and narrow (see its own doc comment);
  the fix is to call it with `"replace-standard-outlet"` only, never the whole file.
- `prisma/seed-dedicated-circuit.ts` is now split into two exported functions:
  `seedDedicatedCircuit()` (the tree fix only) and
  `retireDedicatedCircuitAmperageServices(contractorId)` (the retirement, now requiring
  an explicit tenant id instead of matching by slug alone). Nothing in this rollout plan
  calls the retirement function — it is out of scope for this task and would need its
  own separate review if it's ever run.
- `seedApplianceElectrical()` rebuilt both `dishwasher-electrical` and
  `garbage-disposal-install` for a fix (B.19) that only changed the former's wording. It
  now takes an optional `onlySlug` parameter; the rollout below calls it with
  `"dishwasher-electrical"`.
- `seedEvGarage()` rebuilt three services (`level-2-ev-charger`,
  `garage-door-opener-outlet-ev`, `240v-garage-outlet`) for a fix (B.16) that only
  concerns the third. It is now a thin wrapper over three separately exported
  functions; the rollout below calls `seedGarage240vOutlet()` alone.
- All four seed files (`seed-questions.ts`, `seed-device-and-finish-modules.ts`,
  `seed-appliance-services.ts`, `seed-dedicated-circuit.ts`) previously ran their whole
  `main()` on bare `import` — a `--service`-scoped runner importing one of their
  functions would have executed the entire file's side effects first. Each now guards
  its `main()` call behind `import.meta.url === pathToFileURL(process.argv[1]).href`, so
  importing a named function no longer runs anything but that function.

`seed-all` and a bulk `extract-template-catalog --apply` of Elite's whole catalog remain
explicitly out of scope, for the reason the original audit itself gives: several *other*,
untouched services in these same files have known live-vs-seed drift (documented in the
audit appendices), and a wholesale run risks correcting five services while silently
regressing others nobody asked to touch.

## Step 1 — Elite's own catalog (the only place these fixes currently apply to nothing)

Every fix in this branch is a **seed-file definition change**. None has been run against
any database. The narrow, exported entry point for each, one service at a time:

| Fix | File | Narrow entry point | Service(s) touched |
|---|---|---|---|
| B.2 (switch-leg) | `prisma/seed-questions.ts` | `seedNewCeilingLight()` | `new-ceiling-light` |
| B.2 (switch-leg) | `prisma/seed-questions.ts` | `seedNewCeilingFan()` | `new-ceiling-fan` |
| B.16 (garage) | `prisma/seed-questions.ts` | `seedGarage240vOutlet()` | `240v-garage-outlet` only — `level-2-ev-charger` and `garage-door-opener-outlet-ev` are no longer touched |
| B.17 (outlet) | `prisma/seed-device-and-finish-modules.ts` | `seedDeviceModule("replace-standard-outlet")` | `replace-standard-outlet` only |
| B.18 (dedicated-circuit) | `prisma/seed-dedicated-circuit.ts` | `seedDedicatedCircuit()` | `dedicated-120v-circuit-outlet` only — retirement is a separate function, not called here |
| B.18 (soundbar) | `prisma/seed-appliance-services.ts` | `seedSoundbar()` | `soundbar-installation` |
| B.19 (dishwasher) | `prisma/seed-appliance-services.ts` | `seedApplianceElectrical("dishwasher-electrical")` | `dishwasher-electrical` only — `garbage-disposal-install` is no longer touched |

**A new runner exists for exactly this table:**
`scripts/rollout-electrical-tree-fixes.ts`. It imports only the seven narrow functions
above — it contains no tree-building or pricing logic of its own — and defaults to a dry
run:

```
npx tsx scripts/rollout-electrical-tree-fixes.ts --list
npx tsx scripts/rollout-electrical-tree-fixes.ts --target b19-dishwasher
```

Dry run prints the **current live** question/answer tree for every service the named
target touches (normalized: routing captured by question *key*, not the id it resolves
to today, so it's comparable across environments). It performs no writes and calls no
seed function.

**Customized-tree check, before any `--apply` is possible:**

```
npx tsx scripts/rollout-electrical-tree-fixes.ts --target b19-dishwasher --dump-baseline
```

captures the current live tree for that target's service(s) to
`prisma/_baselines/<slug>.json` — a snapshot of what it looked like right before the fix
is applied. `--apply` refuses unless the live tree still matches that baseline exactly;
if an admin changed wording, pricing, or routing on the same service after the baseline
was captured, `--apply` prints the diff and stops rather than silently overwriting it
via `clearServiceTree()`. `--force` bypasses this for an operator who has reviewed the
diff and wants to proceed anyway.

**No baseline exists yet for any service** — this repository has no database
connection, so none has been captured, and `--apply` cannot currently succeed for any
target. Capturing one, reviewing a dry run, and applying are three separate,
human-reviewed steps; this plan does not compress them into one command.

**Every real run needs, immediately after, per the existing convention:**
`npx tsx prisma/repair-trees.ts` (dangling/unreachable check — the same backstop
`seed-all.ts` runs) and `npx tsx scripts/capture-trade-electrical.ts --check` (confirms
the committed marketing snapshot still matches, or regenerate it if the fixes changed a
question count the snapshot reports).

## Step 2 — the canonical template

Only after Step 1 is confirmed correct on Elite's own catalog:

```
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service new-ceiling-light
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service new-ceiling-fan
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service 240v-garage-outlet
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service replace-standard-outlet
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service dedicated-120v-circuit-outlet
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service soundbar-installation
npx tsx scripts/extract-template-catalog.ts --from elite-electric --service dishwasher-electrical
```

(the `--service` flag limiting extraction to one service at a time, per the script's own
documented options — this is the targeted alternative to the bulk re-extract the
directive rules out.) Each is a **report-only dry run by default**; `--apply` is a
separate, explicit flag per the script's own design, and should only be passed once the
dry-run diff for that specific service has been reviewed. Extraction can refuse a
service outright (an "unauthored refusal" — branded wording, an economic figure, a
policy threshold it can't classify) — a refusal here is itself information worth reading
before forcing anything.

**Extracting `dedicated-120v-circuit-outlet`'s tree structure is not the same as
retiring the four amperage-specific services.** The retirement (`sump-pump-dedicated-circuit`,
`freezer-fridge-dedicated-circuit`, `electric-fireplace-circuit`,
`new-240v-appliance-circuit` → `active: false`) is real data mutation, tenant-scoped now
by `retireDedicatedCircuitAmperageServices(contractorId)`, but still **not part of this
rollout** — it is not called by Step 1's runner, and this document does not recommend
running it. If it's ever wanted, it needs its own explicit authorization and its own
review, separate from the tree fix.

## Step 3 — a fresh rehearsal contractor

Needs nothing beyond Step 2. Template-based provisioning
(`lib/templateProvisioning.ts`, `npm run template:provision` /
`scripts/provision-from-template.ts`) always reads the *current* template at
provisioning time — a contractor provisioned after Step 2 completes inherits the fixed
trees automatically, the same way every other template-derived service already does. No
per-fix work is needed here; this is the one leg of the rollout that Step 2 alone
already finishes.

## Step 4 — already-provisioned contractors with customized trees (BrightPath, etc.)

This is the case the directive is most specific about — preserve customizations,
approvals, and booked history. The mechanism for exactly this **already exists** in the
repository and doesn't need to be built:

```
npx tsx scripts/template-update.ts --status <contractor-slug> <service-key>
```

Read-only, per the script's own header — "nothing is written, ever, by this mode." It
diffs the contractor's currently-provisioned version of a service against the newest
template version and reports each change as `question-added`, `option-added`, or
`wording-changed` — the last of those explicitly flagged as a **CONFLICT** (not applied)
when the contractor has already changed the same thing themselves.

```
npx tsx scripts/template-update.ts --adopt <templateKey> <contractor-slug> <service-key>
```

Applies **one** named change. Per the script's own stated contract: adoption writes
STRUCTURE only — a newly adopted question or option arrives with no price modifier and
marks the service's pricing unresolved (fails closed to review, never invents a number)
rather than silently inheriting Elite's approved price as if the contractor had approved
it too. **This is the answer to the directive's "owner approval of Elite's economics
does not establish approval for another contractor" — the mechanism already enforces it
structurally**, not by relying on whoever runs the command to remember.

**Concretely, for this branch's fixes:** run `--status` for each of the six affected
services against every already-provisioned contractor, one at a time. B.2's fix
(deleting `switched_source`) and B.17's fix (deleting `outlet_condition`) are *removals*
— worth checking whether `template-update.ts`'s change vocabulary
(`question-added`/`option-added`/`wording-changed`) even represents a removal, or
whether it's structured for template growth only; if the latter, a removal may need its
own review/decision per contractor rather than a mechanical `--adopt`, since silently
deleting a question a customized contractor might still be actively using is a different
risk than adding one.

## What this plan does not do

It does not run any of the commands above. It does not decide whether BrightPath (or any
other contractor) should adopt any specific change — that's a per-contractor,
per-service call for whoever operates this, informed by what `--status` reports, not a
blanket "adopt everything this audit changed." It does not retire the four
amperage-specific dedicated-circuit services, even though the mechanism to do so
tenant-scoped now exists — that stays a separate decision. It does not address the two
items already carved out as separate structural proposals (re-extracting for B.7's
panel/200A drift, and the retired/add-on-only template rows) — those need the
schema/process decisions in the structural-proposals doc resolved first, independent of
this rollout.
