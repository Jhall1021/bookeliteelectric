# Production has no migration history

**Found:** 1 September 2026, auditing the production database before deploying
`ec6f680` to the Price2Book Vercel project. **Status:** open. **Deliberately
not fixed** — this is a release-process change and does not belong in the same
change as a release. Recorded here as the post-release item it is.

## Current state, proven rather than assumed

| Question | Answer |
|---|---|
| Does `prisma/migrations/` exist in the repository? | **No.** Not empty — absent |
| Does `_prisma_migrations` exist in the production database? | **No** — checked via `information_schema` |
| Do production tables match `prisma/schema.prisma`? | **Yes** — 71 public tables, 71 models |
| How have schema changes reached production? | `npm run db:push` (`prisma db push`), by hand |
| Is there hand-applied SQL outside the schema? | **Yes** — `prisma/append-only-financial-tables.sql` |

The database is **not broken and not drifted**. That is precisely what makes
this easy to leave alone: nothing is failing, so nothing forces the fix.

What is missing is not correctness today. It is **the record of how production
got here**, and therefore any mechanical guarantee that a deployment's code and
its database agree. Compatibility is currently established by a human checking,
which has worked because one person has held the whole picture.

## Why `db:push` stops being safe now, specifically

`db push` reconciles the database to the schema and decides for itself how.
With an empty database that is a convenience. With **29 real bookings, two live
contractors, 154 services and Stripe payment records** it is a different
instrument, for four reasons:

1. **It can choose data loss to reach the target shape.** Narrowing a column,
   changing a type, or dropping a field is a destructive operation `db push`
   will perform. In interactive use it warns; in any non-interactive context
   the warning is the only thing standing between a schema edit and deleted
   customer data.
2. **There is no down.** Nothing describes the previous shape, so recovery from
   a bad change is restore-from-backup, not revert — and a restore loses every
   booking taken since the snapshot.
3. **Code and database are versioned independently.** A deployment carries a
   commit; the database carries no version at all. `ec6f680` deployed cleanly
   against a schema nobody re-verified as part of the deploy, and that was true
   of every deployment before it.
4. **It does not survive a second contractor's onboarding.** BrightPath already
   exists ([[brightpath-is-the-second-tenant]] is the point of it). Once a real
   second business depends on uptime, "apply the schema and see" is a decision
   made on someone else's behalf.

The financial tables sharpen this. `append-only-financial-tables.sql` was
applied by hand because append-only constraints are not expressible in the
Prisma schema. Nothing in the repository asserts that it is still applied to
production. A rebuild of the database from `schema.prisma` alone would silently
come back **without** those constraints.

## Safe baselining options, from the live schema

All three start from the same premise: **the production database is the source
of truth and must not be recreated.** No option below drops, recreates, or
rewrites production data.

### Option A — baseline from the live schema, mark as applied (recommended)

`prisma migrate diff` from an empty datasource to the current schema produces
one `0_init` migration describing what already exists. `prisma migrate resolve
--applied 0_init` then writes the `_prisma_migrations` row **without executing
the SQL**. Production is untouched; it simply gains a history that starts today.

- **Cost:** one migration folder, one resolve command per environment.
- **Risk:** low, and testable in full — run it against a Neon *branch* of
  production first, which is the same rehearsal shape ADR-013 used.
- **Catch:** the generated SQL will not contain the hand-applied append-only
  constraints. They must be added as an explicit second migration, or the
  history will claim a shape the database does not have — reintroducing the
  exact problem in a new place.

### Option B — baseline, then reconcile drift explicitly

As A, but first run `prisma migrate diff` **from the live database to the
schema** and read the result. An empty diff proves the two agree; a non-empty
one is a list of everything that reached production outside the schema, which
is worth seeing once regardless of which option is chosen.

- **Cost:** one extra read-only command.
- **Value:** it answers "is anything in production that the schema does not
  know about?" — currently unanswered, and only answerable while nothing is
  broken.

### Option C — keep `db push`, add a deployment-time schema assertion

Reject the migration model and instead fail the build when the live schema does
not match the code's expectation, in the same spirit as
`verify-database-identity`.

- **Cost:** lowest immediate.
- **Why it is not recommended:** it detects disagreement but still cannot
  produce or reverse a change. It buys a gate, not a history — and the gate
  fires at deploy time, when the options are worst.

**Recommendation: B then A.** Read the drift first, because it is free and the
answer might change the plan; then baseline; then add the append-only
constraints as migration two, so the history is honest about the whole database
rather than only the part Prisma can express.

## Discipline going forward, once baselined

- **`prisma migrate dev` for schema changes.** `db push` is for a local
  scratch database and nowhere else.
- **Migrations are committed with the code that needs them**, so one commit
  carries both halves of a compatible change.
- **`prisma migrate deploy` runs in deployment**, not by hand from a laptop.
  The current release path is a manual CLI deploy
  ([[price2book-deploys-are-manual]]), so this needs a deliberate home rather
  than an assumed one.
- **Expand, migrate, contract** for anything destructive: add the new shape,
  backfill, switch reads, and only then remove the old — three deployments, not
  one, so every step is individually reversible.
- **`EXPECTED_DATABASE_IDENTITY` stays set.** Migration history says *what*
  shape; the identity stamp says *which database*. Neither substitutes for the
  other, and this estate has already been bitten by name-based confidence three
  times (ADR-013).
- **Rehearse on a Neon branch.** Every option above is testable against a copy
  before production sees it.

## Not done here, on purpose

No migration was created, no baseline resolved, no schema touched, and no
production write of any kind was made while establishing the facts above. The
next step is a decision about approach, not an edit.
