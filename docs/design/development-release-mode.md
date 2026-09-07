# Development Release Mode

**7 September 2026.** Repository-side changes only. Nothing in Vercel changes
yet — that is a separate, explicit step, taken after this lands and is proven.

## The trade

Price2Book has no external contractors yet. Until it does, the priority is
development velocity over production-grade release assurance. The controlled
release architecture (`release-production.ts`, receipts, the promote-only
release command, the provenance guard, `/api/release`) is preserved exactly as
it is — nothing is deleted or rewritten — and simply goes unused for ordinary
merges while this mode is in effect.

**Target workflow:**
`feature branch → Preview build → review → merge to main → automatic production deployment`

## What changes

`npm run build` ran the entire 63-step `verify` chain on every build, Preview
included. 37 of those steps open a live Prisma client (measured, not assumed —
each was run standalone with `DATABASE_URL` absent; a step counts as fast only
if it exits 0 under that condition). A Preview build cannot supply a
production `DATABASE_URL`, so every Preview failed before `next build` ever
ran.

**Updated 7 September 2026 for G4** (`verify-contractor-credentials.ts`, PR #24): confirmed empirically with `DATABASE_URL` absent — exit 0, 37 checks, no `PrismaClient` in source, stable across three runs — and added to `verify:fast` immediately after `verify-appointment-kinds.ts`, its position in the full chain. `verify:full` was re-synced to `main`'s exact 63-step chain at the same time.

| Script | Before | Now |
|---|---|---|
| `verify` | the 63-step chain | alias for `verify:full` — unchanged meaning |
| `verify:full` | — | the 63-step chain, byte-for-byte the same command |
| `verify:fast` | — | the 26 steps that pass with no database (see below) |
| `build` | `prisma generate && npm run verify && next build` | `prisma generate && npm run verify:fast && next build` |
| `build:full` | — | `prisma generate && npm run verify:full && next build` |

`verify:fast` is a subset of `verify:full` in name and order — no step was
rewritten to make it pass without a database; a step is in `fast` only because
it already required none. `verify-us-spelling` stays in `verify:full`
deliberately: it checks published template wording, not source text, so it
needs a live read.

`next build` itself was confirmed to need no database — no
`generateStaticParams`, no DB access in `sitemap.ts`/`robots.ts`, and every
DB-touching route is `force-dynamic`. Separately, `lib/email.ts` was
constructing its Resend client at module scope, which crashed the build with
no `RESEND_API_KEY` regardless of the verify split (see `fix/lazy-resend-client`,
merged ahead of this).

## What stays exactly as it is

- `release-production.ts`, durable receipts, the release lock, promote-only
  semantics, `/api/release` — present, working, unused for now.
- The provenance guard on production Vercel builds — untouched. It already
  passes `preview`/`development` through and enforces only on `production`,
  so it was never the source of Preview friction.
- Every tenant/auth boundary audit runs in `verify:fast`: `audit-unguarded-
  tenant-access`, `audit-platform-tenant-relations`, `verify-tenant-context-
  retention`, `audit-tenant-migration-order`. These are static/source checks,
  not runtime enforcement — the actual tenant guard in `lib/tenantGuard.ts`
  runs on every request regardless of build mode and is not part of this at all.
- No schema/database write is or was part of a normal build. `prisma
  generate` only. `db push`, migrations, seeds, and template publication stay
  explicit, human-run operations.
- No credentials committed. No new deployment system, script, or Vercel
  project.

## What is deliberately relaxed

A green Preview and a green merge no longer imply the 37 database-backed
checks ran — including tenant-boundary checks that need live data, checkout
atomicity, policy resolution, and the payment/deposit chain. Once the pending
Vercel setting is switched, a merge to `main` that builds successfully becomes
live without a durable receipt, a manual promotion, or a postflight
comparison. That is a real reduction in release assurance, accepted on
purpose, because there is no one yet for a bad release to hurt.

`verify:full` / `build:full` remain one command away for anyone who wants the
comprehensive chain before trusting a change — same steps, same order, same
behavior as before this document.

## Restoration trigger

**BEFORE THE FIRST EXTERNAL CONTRACTOR USES PRICE2BOOK WITH REAL,
NON-TEST DATA:**

1. Re-enable production-domain promotion gating in Vercel (undo the one
   setting change this mode makes there).
2. Make `verify:full` the build gate again, or resume the receipt-bound
   `release-production.ts` flow for actual releases.
3. Confirm the provenance guard's Build Command and credential are still
   correct — nothing here should have touched them, but check before relying
   on it again.

No architecture rebuild is required. Restoration is reversing the one Vercel
setting and pointing `build` back at `verify:full`.
