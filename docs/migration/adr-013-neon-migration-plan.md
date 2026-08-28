# ADR-013 — moving production to the Price2Book Neon account

**Status:** Phase 2 tooling built and proven. **Phase 1 is blocked on a copy mechanism.**
Nothing has been cut over. The legacy database is untouched.

| | |
|---|---|
| **Source of truth** | `bookeliteelectric` / `purple-hat-40018035`, endpoint `ep-icy-hill-axkgrsjb` |
| **Destination** | dedicated Price2Book Neon project |

---

## Phase 1 — build the destination: BLOCKED

Neon branching is **within a project only** — branches are copy-on-write clones of a
parent branch, so they cannot reach across projects or accounts. The Neon skill confirms
the supported cross-project mechanisms are **`pg_dump` / `pg_restore`** and **logical
replication**, both over a direct (non-pooled) connection.

Neither is available on this machine:

```
pg_dump / pg_restore / psql   not installed
brew / port / docker          not available
npm packages                  @embedded-postgres ships only server binaries
                              (initdb, pg_ctl, postgres) — no client tools
                              pg-dump-restore is a wrapper that requires pg_dump
```

**This needs a decision.** Options, in the order I would pick them:

1. **Neon's own import** (console → Import Data). Runs server-side, is the vendor's
   supported path, and needs no local tooling. It takes a source connection string.
2. **Install PostgreSQL client tools locally** — Postgres.app or the EDB installer — then
   `pg_dump -Fc` from source and `pg_restore` into destination. Most control, and version
   should match or exceed the source server.
3. **Logical replication** — the only option that gives a *delta sync* and therefore the
   shortest write freeze. Meaningfully more moving parts; worth it only if the freeze in
   Phase 4 turns out to be unacceptable, which at current scale it should not.

I did not improvise a Prisma-driven rebuild. It would recreate the schema from
`schema.prisma`, which **does not contain the OPEN-Visit partial unique** — Prisma cannot
express it — so the destination would silently lack a constraint production depends on.
The parity tool would catch it, but building a copy by a method known to omit things and
relying on the checker to notice is the wrong order.

## Phase 2 — parity: BUILT AND PROVEN

`npm run db:parity -- --source DATABASE_URL --dest P2B_DATABASE_URL`

Both arguments name **environment variables**, never connection strings, so no credential
reaches a shell history or a CI log. It refuses to run if the two resolve to the same
database — a database always matches itself, which would prove nothing.

Compares, and fails on any difference:

| dimension | why it is not redundant |
|---|---|
| tables | names and count |
| columns | type, nullability, **DEFAULT**, ordinal position |
| constraints | primary, foreign, unique, check — by definition text |
| indexes | **full definition**, which is what catches the OPEN-Visit partial unique |
| enums | name **and ordered labels** — order is part of the type |
| row counts | every table |

**Proven by finding real differences.** Run against the contracted rehearsal branch it
reported exactly four, all genuine: `business_hours`, `contractor_material_settings`,
`jobber_connections` and `pricing_settings` still carry `default='default'::text` on `id`
where production no longer does. That is a **column default** — invisible to table names,
row counts, constraints and indexes. A parity check that only counted rows would have
called that branch a perfect copy.

Phases 2 also reruns the existing suites against the destination: `verify-tenant-indexes`,
`verify-booking-tenancy`, `verify-checkout-atomicity`, `npm run verify:tenancy`, and
`npm run db:reconcile`.

## Phase 2a — database identity: BUILT AND PROVEN

> **Production database identity is a verified property, not an environment-variable
> label.**

`scripts/verify-database-identity.ts`, now in the deploy gate.

**Postgres cannot answer this on Neon.** Measured against production and a branch of it:

```
pg_control_system().system_identifier   IDENTICAL   7674717396095314125
current_database()                      IDENTICAL   neondb
inet_server_addr()                      IDENTICAL   169.254.254.254
```

A branch shares its parent's lineage, so every intrinsic identifier matches. "Ask the
server who it is" would answer *production* while connected to a copy — the exact failure
that produced two unusable rehearsal branches, one empty and named `production`.

So identity is a **stamped marker that records the endpoint it was stamped for**. A copy
inherits the row verbatim, so the marker alone proves nothing; the endpoint inside it no
longer matches the endpoint actually connected to, and that mismatch is the signal. A
clone fails until a human deliberately re-stamps it.

Proven in all three states: correct marker passes; a marker naming another endpoint fails
with *"this looks like an un-restamped COPY"*; a wrong role fails. The source is stamped
`bookelite-legacy-production` / `purple-hat-40018035`.

At cutover the destination is stamped `price2book-production` and
`EXPECTED_DATABASE_IDENTITY` is set in Vercel, so a deploy pointed at the wrong database
fails the gate instead of serving from it.

## Phase 3 — Preview against the destination

Preview `DATABASE_URL` → destination only. Then build/verify, `verify:tenancy`, storefront,
visit/cart, availability, quote, admin, and the Jobber read path. Any test data belongs on
the destination and is removed explicitly.

## Phase 4 — cutover

The source is live and writable, so:

1. stop new customer and admin writes
2. take the final source state
3. **rerun parity** — not "probably nobody wrote anything"
4. switch Production `DATABASE_URL`
5. redeploy
6. production smoke **plus the identity check**
7. reopen writes

If Phase 1 lands on logical replication, the delta-sync shortens step 1 — but it gets
documented and proven before it is used, not assumed.

## Phase 5 — rollback

Switch `DATABASE_URL` back, redeploy. That is the whole procedure, and it only works if
the source is still exactly what it was.

> **Do not delete, reset, repurpose, contract further, or experiment on the BookElite
> database.** A rollback path that has been modified is not a rollback path.

## Phase 6 — stability period

Full verification against the destination, critical row counts compared after real usage,
and Jobber / visits / quotes / bookings / admin watched. BookElite retained as rollback
infrastructure for an explicit period; archiving is a later, separate decision.

---

## What this release does not touch

Deprecated-model cleanup stays after ADR-013. Moving the database and deleting models in
one release would violate the rule recorded in ADR-013 itself:

> One irreversible change per release. If two must ship together, they have to be one
> change that cannot be separated — not two that happen to be ready at the same time.


---

## Phase 2 result — 28 August

Import Data reproduced the database faithfully. Parity across **51 tables, 491 columns,
436 constraints, 131 indexes, 18 enums, 51 row counts** — identical.

Two divergences surfaced, both real, both explained, neither requiring a hand-patch.

### 1. Ordinal positions on `photos` and `visits`

Nine columns sit one slot lower in the destination. Cause: the contract dropped
`photos.bookingId` and `visits.customerId`, and Postgres **never renumbers `attnum`** — a
dropped column leaves a permanent hole. A dump/restore rebuilds contiguously, so a
*faithful* copy of a table that has ever had a column dropped legitimately reports lower
positions. `customers`, which never had a column dropped, matched exactly — the control.

Handled by **computing** the exemption, not waiving it: the difference is tolerated only
when the source position minus the holes before that column equals the destination
position, and everything else about the column is byte-identical. A genuine reorder still
fails, because no number of holes explains a swap.

### 2. `updatedAt` on `jobber_connections` and `pricing_settings`

Found by **content checksums**, which were added after stamping exposed a gap in this
plan's own Phase 2 list: it asked for *row counts*, and row counts prove the right number
of rows arrived while saying nothing about whether the values survived. A copy that
truncated a text column or shifted a timestamp would have passed every dimension, because
the structure would be perfect.

The checksum found two tables differing. Field-by-field, the only difference on either was
`updatedAt`: tokens, rates and owners byte-identical. Cause is the mutating tenancy suites,
which restore every value but cannot restore `@updatedAt` — writing the restore is itself a
write.

Two things follow:

- Those suites' "restored exactly" claim was overstated and now reads "every value
  byte-identical". The trace is real and is not hidden.
- **Content parity is authoritative only before the mutating suites run against a copy.**
  At cutover the copy is taken fresh and its parity measured before anything touches it,
  so this trace will not exist there.

`database_identity` is the one table excluded from content comparison, by design: it is
the table the two databases are *supposed* to disagree about.

### Verification against the destination

```
tenant indexes            green        booking tenancy        17/17
checkout atomicity        9/9          isolation harness      144/144
jobber tenancy            17/17        pricing tenancy        13/13
reconciliation            0 differing, same 2 approved exceptions
```

No probe data left behind: one contractor, real Jobber token, correct rate — and parity
re-run after the suites confirmed it.

### Identity

The destination inherited the source's marker verbatim — `bookelite-legacy-production` /
`ep-icy-hill-axkgrsjb` — and the check **refused it** as "an un-restamped COPY of another
database". That is the mechanism proving itself against a real copy rather than a
simulation.

Stamped `price2book-production` / `bitter-bird-20565072` **only after parity passed**. The
source still verifies as itself.

One fix this forced: the endpoint comparison now strips a trailing `-pooler`. Neon serves
one endpoint at two hostnames, and recording the pooled form would have made the marker
fail the moment production connected directly — a false alarm about the one thing this
check exists to be trusted on.


---

## Phase 3 result — 28 August

Preview pointed at the Price2Book database; Production left on BookElite throughout.

### The decisive proof

A visit created through the **Preview app** was found in the **Price2Book** database and
**not** in BookElite. Two line items, correct owner, correct while-we-there pricing. That
is the claim Phase 3 exists to make — not "Preview built successfully" but "the deployed
application is reading and writing the new database."

### Preview flow

```
storefront 200 · category page 200
GET /api/visit 200 · POST primary 37500 (isPrimary) · POST add-on 9500 (while-we-there)
cart 2 lines / 47000 · no site header 404
availability 200 — 3 windows, live Jobber read
quote read 200 · quote page 200 · /admin 307 · admin API 401
```

Reaching it needed Vercel's Protection Bypass for Automation, held in `.env.local` and
passed as a header. Deployment protection stays ON: a Preview carrying Elite's real
customer data should not be publicly reachable, so disabling protection was the wrong
trade even though it would have been quicker.

### Build-time evidence

A Vercel build runs `npm run verify`, so a **Ready** Preview means all 17 gate checks
passed *against Price2Book* — including `verify-database-identity`. The build could not
have gone green pointed at the wrong database.

### Destination after Phase 3

Test data removed explicitly. One contractor, 33 visits, correct identity marker.

```
tenant indexes  green   booking tenancy 17/17   checkout atomicity 9/9
isolation harness 144/144            reconciliation 0 differing
parity: tables, columns, constraints, indexes, enums, row counts identical
content: the two known updatedAt traces, unchanged — Phase 3 added none
```

### An operational hazard worth recording

`DATABASE_URL` was one Vercel entry covering **Production and Preview together**. Adding a
Preview-scoped entry left Production with none, and the next production deploy failed;
production kept serving only because the previous build was still live.

The instruction that caused it listed the risky step first. The safe ordering is:

> **Add the Production-scoped variable FIRST, then the Preview-scoped one.** No
> intermediate state may leave an environment without a database.

Same shape as the Neon confusion: the Price2Book *Vercel project* is as unused as the
Price2Book *Neon project's* `production` branch was. The app deploys from
`elite-9658/bookeliteelectric`, and that is where both `DATABASE_URL` entries live.

### Not yet done

`adr-013-preview` is an empty commit on main whose only job is to produce a Preview
deployment. Delete it after cutover; there is nothing in it to merge.


---

## Phase 4 — CUTOVER COMPLETE, 28 August

Production now runs on the Price2Book Neon project. BookElite is a frozen snapshot.

| | |
|---|---|
| **System of record** | `bitter-bird-20565072`, branch `import-2026-08-28T12:58:02.408Z`, endpoint `ep-shy-butterfly-ay5t03di`, stamped `price2book-production` |
| **Rollback source** | `purple-hat-40018035`, endpoint `ep-icy-hill-axkgrsjb`, stamped `bookelite-legacy-production`, untouched |

### What was done

```
1  source healthy, identity confirmed
2  WRITE_FREEZE on, redeployed
3  freeze proven LIVE — every read 200, every write 503 WRITE_FROZEN
4  fresh import taken under the freeze
5  parity IDENTICAL — and CONTENT identical too, with no updatedAt traces,
   because nothing had touched the copy
7  17/17 · 9/9 · 144/144 · 17/17 · 13/13 · reconcile 0 differing
8  stamped price2book-production, only after parity earned it
9  Production DATABASE_URL switched to the direct, non-pooled string
10 redeployed
11 identity confirmed FROM THE DEPLOY'S OWN BUILD LOG, then read smoke
12 tagged write proven present in Price2Book, ABSENT from BookElite
13 writes reopened
14 markers removed, final verification green, BookElite verified untouched
```

### The proof that mattered

A write carrying a unique marker in `answersSnapshot`, made through the real production
application as the first intentional write after the thaw, was found in Price2Book and
**not** in BookElite. Not "a row appeared" — *that* row, identifiable, in one database only.

The live Jobber availability call is the second piece: it shows this is not merely
"Postgres connected". The copied OAuth credentials work, and the production application
performs a real external integration call against them.

### The cutover baseline

Captured while frozen, when the two databases were provably identical. It is what makes the
rollback rule executable rather than aspirational: `cutover-baseline.ts --since` reports
which tables have moved on Price2Book, tracking row counts **and** highest id, so a new row
still shows even if a delete happened to restore the count.

At the end of Phase 4 it reported **nothing has changed** — synthetic markers removed,
counts back to 33 visits and 39 line items.

### Rollback, from here

Not simply "switch back". Per the rule agreed before the thaw:

1. re-enable `WRITE_FREEZE`, redeploy so production is read-only
2. run `cutover-baseline.ts --since` to establish whether legitimate writes landed
3. **only if nothing landed** may `DATABASE_URL` point back at BookElite unreconciled
4. if writes did land, they exist **only** on Price2Book and must be preserved first

> **The migration commits itself the moment real writes begin accumulating on Price2Book.**
> Everything up to the thaw was reversible. The first genuine customer booking is not.

### Two failures worth keeping

**Production briefly had no `DATABASE_URL`.** It was one Vercel entry covering Production
and Preview together; adding a Preview-scoped entry left Production with none, and the next
deploy failed. Production kept serving only because the previous build was still live. The
instruction that caused it led with the risky step. Add the Production-scoped variable
first.

**An empty database was pasted into Production once.** The build failed with
`public.services does not exist` — from an unrelated check, four steps into the gate. The
check that exists to answer "am I talking to the right database" ran fourth, and it also
mishandled an empty database by throwing a missing-table error instead of saying the
database was empty. Both fixed: identity runs first now, and an empty database says so.

The Price2Book project's `production` branch has now been mistaken for the real database
**three times**. It is named `production`, it is the obvious thing to copy from the console,
and it has never held data.

### Not done, deliberately

The unused Price2Book Vercel project, the old Neon branches, the BookElite infrastructure
and the deprecated models are all untouched, per the release scope.

`.env` now points `DATABASE_URL` at Price2Book so local tooling matches production, with the
old value kept as `BOOKELITE_ROLLBACK_DATABASE_URL` — named for what it now is.


---

## After the cutover — the agreed schedule

**Status: ADR-013 COMPLETE.** Price2Book is the unquestioned source of truth.

### Next 7 days — watch, do not compare

Watch for: database errors, Jobber connection failures, visit/cart problems, quote or
booking issues, admin errors, tenant verification failures, unusual Vercel failures. The
normal gates keep running.

**Do not keep comparing rows against BookElite.** The two databases are *supposed* to
diverge now. `cutover-baseline.ts` exists for an emergency investigation, not as a
synchronisation mechanism — treating it as the latter would turn an expected divergence
into a false alarm every day.

### After 7 clean days — a dedicated housekeeping release

Its own release. Not mixed with product work.

1. **`adr-013-preview`** — delete once confirmed empty and unused. It is an empty commit
   whose only job was to produce a Preview deployment.
2. **The misleading empty Neon branch named `production`** — deal with it properly.
   **Verify mechanically which branch and endpoint actually serve production first**, do not
   trust the names. Ideally the real live branch ends up holding the obvious
   production/default identity and the impostor disappears.

### BookElite — at least 30 days

Frozen and untouched. After the seven-day window it is an **archive and forensic snapshot**,
not an immediate rollback target, because real production changes accumulate only on
Price2Book from the first legitimate post-cutover write.

At roughly 30 clean days, decide separately whether to keep the project archived, take a
durable export and delete the hosted copy, or simply keep it because the cost is trivial.
There is no reason to rush it.

### What is being retired, and what is not

**BookElite as a standalone product and its infrastructure** — yes, eventually.

**Elite Electric, and the electrical work built for them** — no. That is the opposite of
the plan. The destination is:

> Price2Book → a reusable electrical template → Elite Electric as **Contractor #1** →
> future contractors running the same underlying electrical intelligence with their own
> pricing and policies.

Retiring the old infrastructure must never be confused with retiring the tenant or the trade
knowledge. They are the asset.
