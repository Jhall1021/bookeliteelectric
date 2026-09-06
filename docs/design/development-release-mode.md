# Development release mode

**Active from 6 September 2026.** Price2Book has no external customers relying on
production, and the hardened release path was costing more than it was buying at
this stage. The operating priority is development velocity until the restoration
trigger below fires.

The workflow this buys:

    branch -> green usable Preview -> review -> merge main -> automatic production deploy

Nothing was deleted to get it. The hardened system is intact and dormant.

## The switch

Two settings on the canonical Vercel project (`prj_zB0QVq80340s2dVt7X3c1ewKgHtT`,
team `price2-book`). They are the whole mode, and they live in Vercel rather than
here, which is why this file exists.

| Setting | Hardened | Development |
|---|---|---|
| Build Command | the provenance one-liner (`PROVENANCE_BUILD_COMMAND`) | *empty* — Vercel default `npm run build` |
| Auto-assign production domains | off | **on** |

Emptying the Build Command drops the provenance guard. Auto-assign is what turns
a green `main` build into the release instead of a candidate.

There is no second deployment system. `release-production.ts` still works and
still refuses correctly: with the Build Command uninstalled its preflight drifts
on `buildCommand`, which `verify-release-control.ts` already models as the
"command not installed" state. Dev mode is a state the release code understood
before dev mode existed.

## The verification split

    verify        60 steps. UNCHANGED, byte for byte. The comprehensive chain.
    verify:full   alias for `npm run verify`. The name to reach for deliberately.
    verify:fast   24 steps: the 23 database-free members of `verify`, plus the
                  registration guard. What every build runs, Preview included.
    build         prisma generate && npm run verify:fast && next build

`verify:fast` membership is DERIVED, not listed. `verify-fast-chain.ts` computes
it — a step belongs if it is in `verify` and does not touch a live database —
and fails if the two chains disagree in either direction, on content or order.
There is no allowlist to forget.

All 23 were run with DATABASE_URL unset before this was written: 23 pass, 0 fail.

## What is relaxed

Dormant. Preserved in the repository, not enforced:

- The provenance guard: no fresh-`main` SHA check, no GitHub-origin enforcement.
- Receipt-bound promotion: `--create`, `--promote`, durable receipts, the release
  lock and journal.
- "A green build is a candidate, not a release." Auto-assign inverts this.
- Operator-held tokens as a precondition to shipping.
- 37 database-backed verifiers stop gating deployments.
- The three capture drift-gates (`capture-hero-flow`, `capture-trade-electrical`,
  `capture-guided-estimates`). Marketing can outrun product truth again.

**The consequence worth saying plainly: anyone who can push to `main` can deploy
to production.** Previously that took operator-held tokens and an explicit
promote. That is the relaxation the restoration trigger is about.

## What stays

- `/api/release` — unchanged, and more useful now that deploys are automatic. It
  reads environment variables only, so it never depended on the release command.
- All 24 fast steps gate **every** build including Preview. This is a net
  increase: Previews previously could not build at all, because the chain died on
  `verify-database-identity` with no DATABASE_URL.
- The source-level tenant and auth guards, all of which are database-free and all
  of which stay on: `audit-unguarded-tenant-access`, `verify-tenant-context-retention`,
  `audit-platform-tenant-relations`, `verify-publication-guard`,
  `verify-unresolved-guards`, `audit-price-writers`.
- No credentials in the repository. `release-production.ts` still refuses tokens
  read from `.env` files.
- No automatic destructive database changes. The build runs `prisma generate`
  only; `prisma db push` and migrations stay manual.
- Only `main` reaches production — now enforced by Vercel's git integration
  rather than by the guard. Weaker, but real.

## Working in this mode

Run `npm run verify:full` deliberately when a change warrants it: anything
touching `prisma/`, `lib/`, pricing, tenancy, or marketing claims that the
capture gates would have checked. It is not wired to a path trigger on purpose —
conditional CI is the complexity this mode exists to avoid.

## Restoration trigger

**Before the first external contractor is provisioned to use Price2Book with real,
non-test data.** Concretely: before any tenant that is not Elite and not a
throwaway fixture is set up for live customer work.

Restoring is the switch in reverse:

1. `npm run verify:full` green against production.
2. Reinstall the provenance Build Command; its digest must match the current
   `scripts/provenance-guard.sh`.
3. Auto-assign production domains -> off.
4. `build` back to `prisma generate && npm run verify && next build`.
5. Prove it: preflight exits 0, and one `--create` / `--promote` cycle round-trips.

## Known defect in the dormant system

Recorded here so it is not rediscovered at restoration. On 6 September the
promotion of `dpl_2hQujVefcmU9354kRtQsgJYKsicj` (`66ceea5`) reported INCOMPLETE:
its alias read-back ran in the same millisecond as `promotion-accepted` and still
saw the outgoing deployment. The promotion had in fact succeeded — all three
canonical hosts served the new deployment moments later.

**The immediate alias read-back can race Vercel propagation.** Before the
hardened path is reactivated, that read needs a bounded retry rather than a
single immediate attempt, or it will keep producing false INCOMPLETE results and
leaving locks held after successful releases.
