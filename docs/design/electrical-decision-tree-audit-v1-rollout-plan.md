# Electrical Decision Tree Audit V1 — catalog rollout plan (not applied)

Nothing in this document has been run. It's the exact path — using mechanisms that
already exist in this codebase, not new tooling — by which the seed-file fixes in
commits `cb8821a`, `9a5dfc1`, `79329f7` (B.2, B.16, B.17, B.18, B.19) would reach
Elite's own catalog, the canonical template, a fresh rehearsal contractor, and
already-provisioned contractors. `seed-all` and a bulk `extract-template-catalog --apply`
of Elite's whole catalog are both explicitly out of scope — the plan below is
per-service and targeted throughout, for the same reason the original audit's own
findings warn against wholesale re-seeding: several *other*, untouched services in
these same files have known live-vs-seed drift (documented in the audit appendices),
and a wholesale run risks correcting five services while silently regressing others
nobody asked to touch.

## Step 1 — Elite's own catalog (the only place these fixes currently apply to nothing)

Every fix in this branch is a **seed-file definition change**. None has been run
against any database. The targeted path, service by service:

| Fix | File | What to run |
|---|---|---|
| B.2 (switch-leg) | `prisma/seed-questions.ts` | `seedNewCeilingLight()`, `seedNewCeilingFan()` |
| B.16 (garage) | `prisma/seed-questions.ts` | `seedEvGarage()` (its 240v-garage-outlet section only) |
| B.17 (outlet) | `prisma/seed-device-and-finish-modules.ts` | the whole file — single-purpose, already idempotent by design, safe to run wholesale |
| B.18 (dedicated-circuit) | `prisma/seed-dedicated-circuit.ts` | the whole file — single-service, already idempotent |
| B.18 (soundbar) | `prisma/seed-appliance-services.ts` | `seedSoundbar()` |
| B.19 (dishwasher) | `prisma/seed-appliance-services.ts` | `seedApplianceElectrical()` |

**The gap this plan surfaces rather than papers over:** `prisma/seed-questions.ts`
runs 12 functions from one `main()`, and none of them — including the two this
branch touches — are exported or independently invocable today. Running
`npx tsx prisma/seed-questions.ts` re-runs all 12, including 9 this branch never
touched. Given the audit's own findings about several of those 9 having live-vs-seed
drift already (e.g. `new-120v-outlet` depends on `seed-outlet-power-source.ts`
running *after* this file, `replace-standard-outlet` interacts with the device
module) — a wholesale run of this one file carries real risk of correcting the two
targeted services while disturbing others.

**Recommended, not yet done:** export `seedNewCeilingLight`, `seedNewCeilingFan`, and
`seedEvGarage` from `prisma/seed-questions.ts` (a small, behavior-free, purely
organizational change — no seed logic moves), and add a thin runner
(`scripts/apply-electrical-audit-fixes.ts`, or similar, importing exactly these three
plus `seed-device-and-finish-modules.ts`, `seed-dedicated-circuit.ts`, `seedSoundbar`,
and `seedApplianceElectrical`) so the targeted set can run as one command without
touching the other 9 functions in `seed-questions.ts`. This is additive and
low-risk — it changes nothing about what gets written, only what's callable
independently — but it IS a code change, so it's named here as the next step rather
than done as part of this plan.

**Every run needs, immediately after, per the existing convention:**
`npx tsx prisma/repair-trees.ts` (dangling/unreachable check — the same backstop
`seed-all.ts` runs) and `npx tsx scripts/capture-trade-electrical.ts --check`
(confirms the committed marketing snapshot still matches, or regenerate it if the
fixes changed a question count the snapshot reports).

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

(the `--service` flag limiting extraction to one service at a time, per the script's
own documented options — this is the targeted alternative to the bulk re-extract the
directive rules out.) Each is a **report-only dry run by default**; `--apply` is a
separate, explicit flag per the script's own design, and should only be passed once
the dry-run diff for that specific service has been reviewed. Extraction can refuse a
service outright (an "unauthored refusal" — branded wording, an economic figure, a
policy threshold it can't classify) — a refusal here is itself information worth
reading before forcing anything.

## Step 3 — a fresh rehearsal contractor

Needs nothing beyond Step 2. Template-based provisioning
(`lib/templateProvisioning.ts`, `npm run template:provision` /
`scripts/provision-from-template.ts`) always reads the *current* template at
provisioning time — a contractor provisioned after Step 2 completes inherits the
fixed trees automatically, the same way every other template-derived service already
does. No per-fix work is needed here; this is the one leg of the rollout that Step 2
alone already finishes.

## Step 4 — already-provisioned contractors with customized trees (BrightPath, etc.)

This is the case the directive is most specific about — preserve customizations,
approvals, and booked history. The mechanism for exactly this **already exists** in
the repository and doesn't need to be built:

```
npx tsx scripts/template-update.ts --status <contractor-slug> <service-key>
```

Read-only, per the script's own header — "nothing is written, ever, by this mode." It
diffs the contractor's currently-provisioned version of a service against the newest
template version and reports each change as `question-added`, `option-added`, or
`wording-changed` — the last of those explicitly flagged as a **CONFLICT** (not
applied) when the contractor has already changed the same thing themselves.

```
npx tsx scripts/template-update.ts --adopt <templateKey> <contractor-slug> <service-key>
```

Applies **one** named change. Per the script's own stated contract: adoption writes
STRUCTURE only — a newly adopted question or option arrives with no price modifier
and marks the service's pricing unresolved (fails closed to review, never invents a
number) rather than silently inheriting Elite's approved price as if the contractor
had approved it too. **This is the answer to the directive's "owner approval of
Elite's economics does not establish approval for another contractor" — the
mechanism already enforces it structurally**, not by relying on whoever runs the
command to remember.

**Concretely, for this branch's fixes:** run `--status` for each of the six affected
services against every already-provisioned contractor, one at a time. B.2's fix
(deleting `switched_source`) and B.17's fix (deleting `outlet_condition`) are
*removals* — worth checking whether `template-update.ts`'s change vocabulary
(`question-added`/`option-added`/`wording-changed`) even represents a removal, or
whether it's structured for template growth only; if the latter, a removal may need
its own review/decision per contractor rather than a mechanical `--adopt`, since
silently deleting a question a customized contractor might still be actively using
is a different risk than adding one.

## What this plan does not do

It does not run any of the commands above. It does not decide whether BrightPath (or
any other contractor) should adopt any specific change — that's a per-contractor,
per-service call for whoever operates this, informed by what `--status` reports, not
a blanket "adopt everything this audit changed." It does not address the two items
already carved out as separate structural proposals (re-extracting for B.7's
panel/200A drift, and the retired/add-on-only template rows) — those need the
schema/process decisions in the structural-proposals doc resolved first, independent
of this rollout.
