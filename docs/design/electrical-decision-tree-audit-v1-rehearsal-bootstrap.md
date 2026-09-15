# Reproducing this PR's local database/browser rehearsal

Everything below stands up a **task-owned, disposable local Postgres cluster** —
never a shared or Production database, never Neon. It contains no credential and no
secret; nothing here is sensitive. It exists so the claims in
`electrical-decision-tree-audit-v1-followthrough-report.md` §9 can be re-run by
anyone, not just re-read.

## 1. Install and start a disposable Postgres cluster

```bash
brew install postgresql@16   # only if not already installed — never `brew services start`
```

Initialize a cluster in your OWN scratch location (never the Homebrew default one at
`/opt/homebrew/var/postgresql@16` — that stays untouched and unstarted):

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL="en_US.UTF-8"   # postgres refuses to start without this on macOS
PGDATA=/tmp/p2b-rehearsal-data
initdb -D "$PGDATA" -U rehearsal_admin -A trust --locale=en_US.UTF-8 -E UTF-8
mkdir -p /tmp/p2b-rehearsal-sock   # kept short: a long PGDATA path overflows the
                                   # unix-socket path limit
pg_ctl -D "$PGDATA" -l /tmp/p2b-rehearsal.log \
  -o "-h 127.0.0.1 -p 5544 -k /tmp/p2b-rehearsal-sock" start
psql -h 127.0.0.1 -p 5544 -U rehearsal_admin -d postgres -c "CREATE DATABASE p2b_rehearsal;"
```

Stop it the same way when done — **never** delete/reuse a shared cluster, and never
point this at a real `DATABASE_URL`:

```bash
pg_ctl -D "$PGDATA" stop
```

## 2. Point the worktree at it

In the repo root (or a worktree), create `.env` (NOT `.env.local` — `prisma`'s CLI
only auto-loads `.env`) — this file is gitignored, never commit it:

```
DATABASE_URL="postgresql://rehearsal_admin@127.0.0.1:5544/p2b_rehearsal?schema=public"
```

## 3. Push the schema and seed the catalog

```bash
npx prisma generate
npx prisma db push

# Bootstrap the "elite-electric" Contractor row itself — seed-all.ts's own chain
# assumes it already exists, since on a real database Elite's history created it
# once. This migration is a historical, non-repeatable one-off for the OLD
# Material model; it refuses on an empty database ("No materials found").
# Elite has to exist before it can refuse usefully, so create it directly first:
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.contractor.upsert({
  where: { slug: 'elite-electric' },
  update: {},
  create: { slug: 'elite-electric', name: 'Elite Electric & Lighting', trade: 'residential electrician', phone: '732-204-7003' },
}).then(c => console.log('elite-electric:', c.id)).finally(() => p.\$disconnect());
"

npm run db:seed:all          # 22 documented steps; will fail at
                              # seed-conditional-disclaimers.ts (see below) —
                              # that is expected, not a setup mistake
npx tsx prisma/seed-content-fixes.ts
npx tsx prisma/seed-labor-hours.ts
npx tsx prisma/seed-dedicated-circuit-labor.ts
npx tsx prisma/repair-trees.ts     # confirms 0 dangling, 0 unreachable

# seed-all.ts does not include seed-appliance-services.ts at all (a real,
# separately-reported gap — see the followthrough report §9.6) — run it
# directly for soundbar/dishwasher/garbage-disposal/range-hood coverage:
npx tsx prisma/seed-appliance-services.ts
```

**Known, expected failure**: `seed-conditional-disclaimers.ts` fails with
`No CanonicalDisclaimer found`. `prisma/backfill-disclaimer-split-2026-08-27.ts`,
which would normally create it, has been **neutralised since 28 August 2026** — its
own source shows `legacy` hardcoded to `[]`, because a later schema change removed
the back-relations it needs and the query can no longer be expressed. There is no
other path in this codebase to create `CanonicalDisclaimer`/`ContractorDisclaimer`
rows from nothing. This is a genuine gap in the codebase's own tooling for a
from-scratch database — not something this doc works around. The five conditional
disclaimers and the `device_on_exterior_wall` question on `new-120v-outlet`/
`dedicated-120v-circuit-outlet` simply will not exist in this rehearsal.

## 4. Bootstrap Elite's contractor-level configuration

`seed-all.ts` deliberately never touches contractor configuration (scheduling,
service area, business hours) — that is Elite's own history on a real database, not
catalog data a seed should write. `prisma/bootstrap-rehearsal-contractor.ts` (in this
PR) does it once, idempotently:

```bash
npx tsx prisma/bootstrap-rehearsal-contractor.ts
```

## 5. Stamp the database identity (required before any `verify:full` gate runs)

```bash
npx tsx scripts/verify-database-identity.ts \
  --stamp --expect local-rehearsal-electrical-followthrough \
  --project local-disposable-not-neon \
  --note "disposable local Postgres, never Neon/production"
```

## 6. Start the dev server

Point a dev server at this `.env` (e.g. `npx next dev -p 3610` from the worktree
root, or a `.claude/launch.json` entry doing the same) and open
`http://localhost:<port>/elite-electric`.

## 7. Run the durable back-navigation regression

```bash
BROWSER_FLOW_BASE_URL=http://localhost:3610 \
  npx tsx scripts/verify-back-navigation-config-browser-flow.ts
```

Builds and tears down its own throwaway contractor (`gf-backnav-flow-<run>`) —
touches nothing above. See the script's own header for exactly what it proves and
for the confirmed root cause of the note below.

**Run this against a production build, not `next dev`.** Against `next dev`, step D
(reload) can resume to the first question instead of the priced terminal — root
cause confirmed, not a guess: React Strict Mode double-invokes the session-bootstrap
effect on every mount in development, firing two concurrent
`POST /api/guided-flow-sessions`, which can both miss the existing ACTIVE row in
`findOrCreateActiveSession` (`lib/guidedFlowSession.ts`) and both create one — a
pre-existing, unrelated gap in that function's cross-request atomicity, not a defect
in Back navigation. It does not happen against a production build, where Strict
Mode's double invocation is stripped:

```bash
npx next build
npx next start -p 3610
BROWSER_FLOW_BASE_URL=http://localhost:3610 npx tsx scripts/verify-back-navigation-config-browser-flow.ts
```

4 consecutive runs against `next build && next start` passed 17/17 checks each,
immediately after 4 consecutive `next dev` runs failed on step D under the exact
same fixture logic — confirming the Strict Mode race, not a flaky assertion, was the
cause.

## 8. What is still missing, on purpose

No canonical `TemplateVersion` (never run `extract-template-catalog.ts` — this
rehearsal must never touch the canonical template or any other contractor);
disclaimer/trade backfills beyond what §3 above narrowly applies; any
`JobberCrewMember`; any Stripe connection on Elite's own rehearsal row; any real
email/SMS/OAuth provider. All of this is intentional — see the followthrough
report's §9.6 for exactly which gates that affects and how each was actually proven
(or found to still need one of these).

## Teardown

```bash
pg_ctl -D /tmp/p2b-rehearsal-data stop
```

Nothing above touches a shared resource, a real credential, or any database this
repository's own tooling would recognize as Production.
