# Electrical Decision Tree Audit V1 — catalog rollout plan (not applied)

Nothing in this document has been run. **No seed, retirement, extraction, or catalog
update is authorized by this document.** It describes the path — using mechanisms
that already exist in this codebase, narrowed further where the direct code-review on
PR #56 found them not narrow enough — by which the seed-file fixes for B.2, B.16,
B.17, B.18, and B.19 would reach Elite's own catalog, the canonical template, a fresh
rehearsal contractor, and already-provisioned contractors.

## Second revision note — the runner in the previous version was withdrawn

The previous version of this document shipped a working runner,
`scripts/rollout-electrical-tree-fixes.ts`, with a `--apply`/`--force` path capable of
actually writing to a database. Direct review on PR #56 found it unsafe on five
separate grounds and it has been **removed from this branch entirely**, not patched:

1. **Not tenant-scoped.** `snapshotService()` fetched `prisma.service.findFirst({
   where: { slug } })` — by slug alone, no `contractorId` filter. On any database with
   more than one contractor sharing a slug (which this codebase's own multi-tenant
   model allows), it could snapshot or reason about the wrong contractor's service
   entirely.
2. **Checked too little to catch what the seeds can overwrite.** The snapshot captured
   only the question/answer tree. Several of the target seed functions also write
   service-level scalar fields — `seedDedicatedCircuit()` alone updates `name`,
   `bookingType`, `estimatedMinutes`, `requiresTechCount`, `permitAdminCents`, and
   `categoryId`. A live change to any of those between baseline capture and `--apply`
   would go undetected by a tree-only diff, defeating the customized-tree check for
   exactly the fields it didn't look at.
3. **No atomicity between the check and the write.** The drift check and the actual
   seed call were two separate operations against two separately-constructed
   `PrismaClient` instances (the runner's own, and each seed file's module-level
   client), with no transaction or optimistic-concurrency precondition tying them
   together. A change landing in that window — small, but real under any concurrent
   admin access — would be applied over silently, the exact failure mode the check was
   supposed to prevent.
4. **Ignorant of module composition.** `seedNewCeilingLight()`/`seedNewCeilingFan()`
   each call `clearServiceTree()` and rebuild only the base tree. On any database
   seeded the normal way, both services also carry the height/access module
   (`seed-height-access.ts`), the switch-leg/distance-band module
   (`seed-lighting-control.ts`), and the finish acknowledgement
   (`seed-fixture-finish-ack.ts`) — all attached in a specific order *after* the base
   tree, per `seed-all.ts`'s own header comment: **"Re-running one earlier seed on its
   own afterward can orphan what was inserted after it — which has happened four
   times."** Calling the narrow fix function alone, exactly what the runner did, would
   strip all three modules from a fully-provisioned service.
5. **Described a preview it didn't perform.** The dry-run path's own comments described
   a "transactional before/after preview" that the code never actually ran — it threw
   and rolled back before calling the target function at all, so what was printed was
   never more than the current live tree plus a baseline diff, not a preview of the
   seed's actual effect.

None of these are fixable by tightening flags — they're structural, and a correct
version would need a shared transaction-scoped Prisma client threaded through every
seed function (a real refactor of four files), a full per-field snapshot per function
rather than a generic tree walk, and either an explicit accompanying re-run of every
module each target service composes with, or a hard refusal to touch any service that
has modules attached at all. That is real design work, out of scope for this pass —
listed here as **requirements for a future runner**, not as something to build under
this task's authorization. **No such runner exists on this branch. No rollout
mechanism in this repository can currently apply any of these fixes** — Step 1 below is
back to being a table of narrow entry points for a human with database access to call
one at a time, by hand, with the module-composition risk in point 4 read and understood
before touching any service that isn't a bare, freshly-seeded tree.

## First revision note

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

**No runner exists for this table.** Per the revision note above, applying any row
means a person with database access reading that function's full body first —
including whether the target service, on the database they're pointed at, has a
tree-modifying module already attached — and, if it does, either re-running the exact
sequence of module-attachment seeds that `seed-all.ts` documents (in that order, after
the fix) or not touching that service this way at all. Checked directly against every
module-seed file in this repository, not assumed, for these seven services:

| Service | Tree-modifying module(s) attached, per current seed files | Risk from a bare `clearServiceTree()`-based rebuild |
|---|---|---|
| `new-ceiling-light`, `new-ceiling-fan` | `seed-height-access.ts`, `seed-lighting-control.ts`, `seed-fixture-finish-ack.ts`, `seed-conditional-disclaimers.ts` | **Real.** All four insert into or attach onto the tree these two functions rebuild from scratch. |
| `dedicated-120v-circuit-outlet` | `seed-conditional-disclaimers.ts` — inserts a `device_on_exterior_wall` contingency question directly after `dedicated_route_access` | **Real.** Confirmed by reading `EXTERIOR_WALL_SERVICES` in that file; not the "not known to carry one" the first draft of this note assumed before checking. |
| `240v-garage-outlet` | None found (only `seed-labor-hours.ts`, a non-tree scalar field) | None as far as this reading found — consistent with B.16 leaving it a genuine 0-question service. |
| `replace-standard-outlet` | None in the tree sense; `seedDeviceModule()` itself uses `upsertQuestion` in place, never `clearServiceTree()` | None — this entry point was never destructive to begin with. |
| `soundbar-installation`, `dishwasher-electrical` | None found (only `seed-labor-hours.ts`/`seed-pricing-inputs.ts`, non-tree scalar fields) | None as far as this reading found. |

So three of the seven rows (`new-ceiling-light`, `new-ceiling-fan`,
`dedicated-120v-circuit-outlet`) are unsafe to apply via their narrow function alone on
any database where the normal module seeds have already run — which describes Elite's
own live catalog, per the audit's own account of it. Applying those three correctly
needs the module re-attachment step spelled out above, not just the narrow fix
function; the other four rows are genuinely safe to call standalone as documented.

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

**It contains no runnable rollout tooling.** The runner from the prior revision was
withdrawn (see the revision note above) rather than repaired, and nothing has replaced
it. It does not run any of the commands above. It does not decide whether BrightPath (or any
other contractor) should adopt any specific change — that's a per-contractor,
per-service call for whoever operates this, informed by what `--status` reports, not a
blanket "adopt everything this audit changed." It does not retire the four
amperage-specific dedicated-circuit services, even though the mechanism to do so
tenant-scoped now exists — that stays a separate decision. It does not address the two
items already carved out as separate structural proposals (re-extracting for B.7's
panel/200A drift, and the retired/add-on-only template rows) — those need the
schema/process decisions in the structural-proposals doc resolved first, independent of
this rollout.
