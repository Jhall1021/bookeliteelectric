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
