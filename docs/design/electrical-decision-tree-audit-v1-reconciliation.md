# Electrical Decision Tree Audit V1 — revision reconciliation

Before any fix, per the follow-through directive. This is a documentation-only record
of what was checked and why the implementation work below proceeds from `origin/main`
rather than the branch the original audit ran against.

## 1. Where the audit ran, and where this work runs

The audit (`docs/design/electrical-decision-tree-audit-v1.md`) examined
`feat/g2-trade-scoped-troubleshooting-isolated` at **`c6e7016`**.

That branch is **6 commits ahead, 524 commits behind `origin/main`**
(`git rev-list --left-right --count HEAD...origin/main` from that branch → `6  524`).
`origin/main` was at **`64dcf36`** as of this reconciliation (fetched fresh). The 524
commits add, among other things, HVAC (H1–H11), G1 scoped-access/`accessSlot` support
across the pricing engine, G5 emergency screening, a large platform-admin/onboarding
surface, and a full route-assist/device-handoff/guided-flow-session subsystem — none of
which the audited branch had.

**Implementation for this follow-through runs on a fresh branch,
`audit/electrical-followthrough-v1`, forked from `origin/main` at `64dcf36`, in its own
git worktree (`/private/tmp/p2b-audit-followthrough-wt`) with its own `npm ci` and
generated Prisma client** — isolated from the shared checkout per project convention
(parallel sessions share one checkout and node_modules; a worktree with its own install
avoids colliding with other in-flight work, and avoids the iCloud-symlinked
`node_modules` hang this repo has hit before).

**The audited branch's own "6 ahead" commits turned out to be redundant, not
outstanding.** Its G2 trade-scoped-troubleshooting work (`7cb3d01`, `3e619ec`, `2b15550`)
shares commit messages verbatim with commits already on `origin/main`
(`eec4c8a`/`2913858`/`2d63626`, merged via **PR #2: G2 trade-scoped troubleshooting**,
`d3bf23d`) — the same logical change, landed on trunk through a different path while this
branch sat on its own fork. `lib/troubleshooting.ts` is byte-identical between the two
refs. There is nothing from the audited branch that still needs to reach `origin/main`.

## 2. Full-tree diff, and what it means for the audit's findings

`git diff origin/main c6e7016 --stat` touches 342 files (6,027 insertions, 55,580
deletions — the deletions are almost entirely subsystems `origin/main` has that the
stale branch never grew: HVAC, platform admin, route-assist, device-handoff,
guided-flow-session, release control, and the labor wizard).

**None of the Electrical seed files this audit's findings are rooted in appear in that
342-file list** — meaning they are byte-identical between the two refs:
`prisma/seed-questions.ts`, `prisma/seed-lighting-control.ts`, `prisma/seed-recessed-lighting.ts`,
`prisma/seed-height-access.ts`, `prisma/seed-fixture-finish-ack.ts`,
`prisma/seed-access-normalization.ts`, `prisma/seed-conditional-disclaimers.ts`,
`prisma/seed-breakers.ts`, `prisma/seed-panel-replacement.ts`,
`prisma/seed-200a-service-upgrade.ts`, `prisma/seed-dedicated-circuit.ts`,
`prisma/seed-customer-supplied.ts`, `prisma/seed-device-and-finish-modules.ts`,
`prisma/seed-video-doorbell-wiring.ts`, `prisma/seed-hot-tub-spa.ts`,
`prisma/seed-under-cabinet-lighting.ts`, `prisma/seed-chandelier.ts`,
`prisma/seed-low-voltage-and-sconces.ts`, `prisma/seed-exterior-gfci*.ts`,
`prisma/seed-appliance-services.ts`, `prisma/seed-flood-camera.ts`,
`prisma/_moduleHelpers.ts` (`upsertQuestion`/`rewireTerminalsInto` unchanged),
`app/[site]/troubleshooting/page.tsx`, `app/api/troubleshooting/route.ts`,
`lib/troubleshooting.ts`, `components/home/Hero.tsx`, `app/[site]/services/page.tsx`.

Also unchanged, and load-bearing for this audit: `components/marketing/trades/electricalTemplate.ts`
— the committed snapshot the audit treated as "live" ground truth. **This is worth being
precise about, per the evidence-label correction below: the snapshot is evidence of what
`scripts/capture-trade-electrical.ts` read from `TemplateService` at the moment someone
last ran `--apply` (1 Sep 2026, `755ec26`/`dda6b04`) — it is not independent proof of the
current production or database state.** Nothing in this reconciliation re-ran that
capture (no database access — see §4), so every finding that leans on the snapshot's
exact numbers is still exactly as confident as it was in the original audit: real, but
a still-image, not a live read.

**What did change** between the two refs, and mattered to this implementation:
`lib/pricing.ts` (134 lines — G1 scoped-access, `accessBySlot`/`accessSlot` support),
`lib/routeResolver.ts` (45 lines — the same G1 work, plus `RESOLUTION_TREE_INCLUDE` was
extracted out to a new shared file), `lib/serviceTreeQuery.ts` (new on `origin/main`;
didn't exist on the audited branch — the include was inline in `routeResolver.ts`
there), and `app/api/services/[slug]/route.ts` (33 lines — see §3, this is where the
referenced-service display fix already lives).

**Practical conclusion:** every finding in the original report that cites one of the
unchanged files above is confirmed to still apply, verbatim, against `origin/main` — no
finding was an artifact of auditing a stale branch. The two files that did change
(`pricing.ts`, `routeResolver.ts`) are exactly the files B.1 and B.2 touch, so those two
were re-verified line-by-line against the current code before any edit (§3 and §5 below)
rather than assumed to transfer.

## 3. B.1, re-verified against current code — sharper than originally reported

The original audit found `referencedServiceId` "documented but not implemented in the
live pricing path," full stop. Reading `origin/main`'s current
`app/api/services/[slug]/route.ts:215` shows that's no longer quite accurate:

```ts
priceModifierCents: o.referencedService?.basePrice ?? o.priceModifierCents,
```

— the storefront **display** DTO already does this, with a comment naming this exact
scenario ("Live lookup wins over the frozen seed-time number whenever this option
references another service — this is what makes admin edits to e.g. Elite Tilt Mount's
price actually show up here"). So a homeowner today **sees** the correct, current mount
price on screen.

`lib/routeResolver.ts` — the authoritative path `/api/visit` actually charges from — has
no equivalent. `RESOLUTION_TREE_INCLUDE`/`lib/serviceTreeQuery.ts` doesn't even select
`referencedService`, so the field isn't available to read there. **The refined finding:
this is not a uniform "$0 mount," it's a display/charge mismatch** — the customer is
shown $200 for a mount and is charged $0 for it, which is worse than a consistently wrong
number, since nothing about the checkout experience would suggest anything is off.

This changes nothing about the priority (still the #1 finding) but sharpens what "fix
the missing adjustment" means: the DTO side is already correct and untouched; the fix is
scoped entirely to the resolver side reaching parity with it. See §5.

## 4. Overlap with Routing V2 and the storefront pricing-seam fix

`feat/electrical-routing-v2` (fetched fresh, tip `fb4e4c0`) forked from `origin/main` at
`737a742` — itself 43 commits ahead / 284 behind current `origin/main`, i.e. V2 is
*also* running behind trunk, on a separate axis from the audited branch's staleness.

**Direct file-level overlap check**, `git diff 737a742 origin/feat/electrical-routing-v2`:

- **`lib/routeResolver.ts`**: V2 rewrites this file substantially (+362/−21 lines) —
  new imports (`pricingSettingsState`, `capabilities`, `numericRouteRanges`), a
  `capabilities` fact block loaded alongside the tree, and machinery for a `NUMBER`
  question type bound to component quantity. **Zero occurrences of `referencedService`
  anywhere in that diff** — V2 does not touch, fix, or depend on this mechanism in any
  way visible in the diff.
- **`lib/serviceTreeQuery.ts`**: **deleted entirely on `feat/electrical-routing-v2`** —
  `RESOLUTION_TREE_INCLUDE` doesn't exist anywhere on that branch (confirmed:
  `git grep -l RESOLUTION_TREE_INCLUDE origin/feat/electrical-routing-v2` returns
  nothing). The tree-loading query was evidently inlined back into `routeResolver.ts` (or
  restructured elsewhere) as part of V2's own rework.
- **`prisma/seed-questions.ts`, `prisma/seed-lighting-control.ts`**: **no diff at all**
  between `origin/main` and V2 — the switch-leg double-charge fix (§5, B.2) has zero
  overlap with V2's work.
- **`prisma/_moduleHelpers.ts`**: V2 adds an `inputType`/`numberMin`/`numberMax` parameter
  to `upsertQuestion` for its own `NUMBER`-question feature; `rewireTerminalsInto` — the
  function B.2's fix depends on — is untouched.

**Consequence, stated plainly for whoever merges V2 later:** the B.2 fix (seed-questions.ts)
carries forward into V2 with no changes needed. **The B.1 fix (serviceTreeQuery.ts +
routeResolver.ts) will need to be manually re-applied at merge time** — not because it's
wrong, but because V2 restructures exactly the file it lives in. The fix itself (fold a
referenced service's live price into `approvedComponentPriceCents` rather than
`priceModifierCents`, so a missing reference fails to review instead of silently pricing
at zero — see §5) is a small, self-contained rule that should transplant cleanly into
wherever V2 ends up loading and walking the tree; it is not contingent on anything G1 or
V2-specific added to `routeResolver.ts`.

**No other finding in the audit touches a file Routing V2 modifies.** The storefront
pricing-seam fix itself (`50c3838`, "the server prices a derived service's terminal
answer") is V2-only work on `DERIVED_RESOLVED_SCOPE` services, a service classification
that doesn't exist on `origin/main` today — there is no overlap to reconcile beyond what
inevitable merge-time file conflicts always produce.

## 5. Evidence-label corrections applied throughout this follow-through

Per the directive, four specific corrections are being held to for the rest of this
work, not just noted once:

1. **The committed marketing snapshot (`electricalTemplate.ts`) is evidence of itself, not of
   current production.** It proves what `scripts/capture-trade-electrical.ts --apply`
   read from `TemplateService` on 1 Sep 2026. Anywhere a finding below cites a live
   question count or resolution type from that file, it is labeled **snapshot-confirmed**,
   distinct from **code-confirmed** (read directly from a seed/route file, true regardless
   of database state) and **not yet verified** (needs a live query or browser session).
2. **Elite's seed replay, canonical-template provisioning, and existing contractor data
   are three different things**, kept distinct in every finding below: a seed file
   change (e.g. B.2's fix to `prisma/seed-questions.ts`) changes what Elite's catalog
   *would become* the next time someone runs it against a real database — it does not,
   by itself, change what Elite is running today, what the canonical template hands new
   contractors, or what any already-provisioned contractor (BrightPath, etc.) has. This
   follow-through had no database access (§6) and applied no seed against any database —
   every seed-file fix below is **committed and ready to run**, not **run**.
3. **Proposed question counts in the original audit (e.g. "5-6 questions" for the
   rebuilt lighting trees) are estimates**, not measurements — they were arrived at by
   reading the tree, not by walking it. Nothing in this follow-through's simplification
   batch (§7) claims a measured count; each is stated as the number of questions the
   *code* now defines, which is verifiable by reading, with a note where the previously
   estimated "5-6" language should be retired in favor of the actual number.
4. **"4 'I'm not sure' answers continue" is not evidence they end well.** Traced
   specifically for this follow-through: `seed-outlet-power-source.ts`'s
   `outlet_load_type` "Something else, or I'm not sure" answer terminates in
   `PHOTO_REVIEW` (not `CONTINUE`) — the audit's own routing-totals table
   (`electricalTemplate.ts`'s `unsure.routes.CONTINUE: 4`) refers to four *specific*
   other answers elsewhere in the catalog, not this one, and this follow-through did not
   re-trace all four to their actual terminals (out of scope for the batches authorized
   below — flagged here as a specific, still-open uncertainty rather than repeating the
   original report's framing unexamined).

## 6. Access status for this session

No database access was available or sought for this follow-through, and none of the
work below required writing to a database. Concretely:

- The fresh worktree has no `.env`/`.env.local` at all (both are gitignored, so a new
  worktree starts clean) — any script requiring `DATABASE_URL` fails immediately and
  loudly, rather than silently reaching a real database. This is a safe, fail-closed
  starting position, not a workaround.
- No attempt was made to copy `REHEARSAL_DATABASE_URL` or any other credential into this
  worktree. The rejected action from the audit phase (reading the shared `.env` to seed
  an isolated rehearsal dev server) was not retried in any form.
- `npx prisma generate` was run once, schema-only — it reads `prisma/schema.prisma` and
  writes generated TypeScript types to `node_modules`; it opens no database connection
  and was necessary for `tsc` and the seed files to typecheck at all.
- Gate results reported below are therefore limited to **`tsc --noEmit`** (full
  repository, zero errors) and **hand-written, DB-free unit scripts** that exercise the
  pure functions directly (`resolveRoute`, `applyBranch`) against synthetic data. No
  `npm run verify` step, no seed execution, no dev server, and no browser session ran
  during this follow-through — see the final report for the complete list of what
  remains unverified and why.
