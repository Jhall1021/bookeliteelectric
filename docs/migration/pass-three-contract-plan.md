# Pass three — contract release plan

**Status:** plan approved; rehearsed. Nothing destructive has been executed.

**Rehearsed 27 August:** `npm run contract:rehearse` runs the exact DDL below against
real production data inside a transaction that rolls back, and proves every new constraint
actually rejects what it must. 31 checks passed. Postgres DDL is transactional, so nothing
survived; the rollback is asserted, not assumed.
**Prerequisite met:** the read/write switch is merged and live in production (`b92300f`),
smoke-tested, with verify 15, live harness 144, booking-tenancy 17 and reconcile 0-differing
all green against the production database afterwards.

Contract is the named checkpoint where the legacy single-tenant schema assumptions are
actually *gone* rather than merely unused. Until it lands, pass three is "tenant-aware";
after it lands, the escape hatches no longer exist.

---

## 1. Every precondition is already satisfied

Measured against production, not assumed:

| Precondition | Required | Actual |
|---|---|---|
| `Service.contractorId` nulls | 0 | **0** of 75 |
| `Customer.contractorId` nulls | 0 | **0** of 27 |
| `Visit.contractorId` nulls | 0 | **0** of 33 |
| `Photo.contractorId` nulls | 0 | **0** of 6 |
| `ServiceArea.contractorId` nulls | 0 | **0** of 1 |
| `PricingSettings.contractorId` nulls | 0 | **0** of 1 |
| `JobberConnection.contractorId` nulls | 0 | **0** of 1 |
| `JobberCrewMember.contractorId` nulls | 0 | **0** of 21 |
| `BusinessHours` / `ContractorMaterialSettings` nulls | 0 | **0** of 0 |
| duplicate `ArrivalWindow` (date, start, end, area) | 0 | **0** |
| >1 OPEN visit per (contractor, session) | 0 | **0** |
| duplicate (contractorId, jobberUserId) | 0 | **0** |
| `Photo.bookingId` rows in use | 0 | **0** |
| `Visit.customerId` rows in use | 0 | **0** |

These must be **re-measured immediately before the release**, not trusted from this table.
A precondition proven on 27 August is not a precondition proven on the release day.

## 2. Scope is wider than pass three's four columns

The survey found **ten** tenant-scoped models still carrying a nullable `contractorId`,
not four. Six of them predate pass three:

`Service`, `ServiceArea`, `PricingSettings`, `JobberConnection`, `BusinessHours`,
`ContractorMaterialSettings`.

`Service` is the notable one. It is the root of the entire service tree and of every
derived model in ADR-010 — `Question`, `AnswerOption`, `Quote` and the joins all resolve
ownership *through* it. A `Service` with a null owner is invisible to every guarded query,
which fails in the safe direction but is still a row that cannot be read, edited or
deleted through any tenant-scoped path. There are none today; nothing prevents one.

Contract should make all ten required in one release. Splitting them buys nothing — the
data is already clean for every one, and leaving six half-migrated is precisely the
"inventory that overstates as easily as it understates" problem from ADR-007a.

## 3. What contract does

### 3a. Required ownership columns

`String?` → `String` on all ten models listed above, with their relations narrowed from
`Contractor?` to `Contractor`.

### 3b. `JobberCrewMember` identity

Drop the global `jobberUserId @unique`; keep `@@unique([contractorId, jobberUserId])`.

> **Corrected 27 August.** An earlier version of this plan said the compound unique
> "already exists in the database". It did not. The expand step's schema edit silently
> no-oped on every `@@index` and `@@unique` line, so none of them entered
> `schema.prisma`, and `db push` reported "already in sync" — truthfully, because the
> schema it was syncing did not contain them. Twelve indexes were missing across the
> tenant models, including this constraint and any index at all on `Service`,
> `ServiceArea`, `Visit`, `Customer`, `Photo`, `JobberCrewMember`, `Question`,
> `AnswerOption`, `LineItem` and `Quote`.
>
> All twelve now exist and are verified against `pg_indexes`. `scripts/verify-tenant-indexes.ts`
> is in the deploy gate and reads the DATABASE, not the schema file, so this cannot recur
> silently.
>
> Correctness was never affected — the guard filters by owner whether or not an index
> exists, and the isolation harness passed throughout. What was affected was performance,
> and the truth of this plan's premise.

Once `contractorId` is non-null, Prisma will finally expose the compound unique as a
`whereUnique` selector — it refuses to today precisely because a null cannot identify a
row. The crew sync then converts from its transitional guarded `findFirst` → scoped
`update` / stamped `create` back to a single `upsert` keyed on the compound.

**This code change CANNOT ship in step 2**, and that is a real consequence of code-first
ordering. Step 2's code must run against the expanded shape too, and the compound
`whereUnique` selector does not exist in the generated client while `contractorId` is
nullable. So the sync keeps its transitional guarded `findFirst` → scoped `update` /
stamped `create` through the contract release, and converts in a small follow-up
deployment afterwards.

The transitional form is correct and safe permanently; converting is a simplification, not
a requirement. Nothing is left unprotected in the meantime — the compound unique is
enforced by the database from now on regardless of what the client can express.

### 3c. One OPEN visit per contractor + session

Prisma cannot express a partial unique index, so this is raw SQL:

```sql
CREATE UNIQUE INDEX "visits_open_per_contractor_session"
  ON visits ("contractorId", "sessionId")
  WHERE status = 'OPEN';
```

**Verified:** a hand-created partial index on `visits` survives `prisma db push` when the
schema is otherwise in sync. **Not verified:** whether it survives a push that alters the
`visits` table itself, which is exactly what 3a does to it.

So the plan does not depend on the answer: **create the index after the push, and assert
it exists.** Relying on it surviving is the class of assumption this project has been
burned by repeatedly, and asserting costs one query.

The narrower invariant is the right one. The full triple `(contractorId, sessionId, status)`
is genuinely *not* unique — repeat customers accumulate `CHECKED_OUT` visits under one
cookie, and live data held sessions with 7, 15 and 2.

### 3d. `ArrivalWindow` race

```sql
ALTER TABLE arrival_windows
  ADD CONSTRAINT arrival_windows_slot_unique
  UNIQUE (date, "startTime", "endTime", "serviceAreaId");
```

Expressible in Prisma as `@@unique`, so it goes in the schema rather than raw SQL.

Checkout find-or-creates on exactly this tuple with no constraint behind it, so two
concurrent checkouts can create duplicate windows and split the capacity counter. The
constraint alone does not fix the race — it converts it from silent duplication into a
loud failure. **The accompanying code change is to catch the unique violation and re-read**,
which is the standard find-or-create-or-refind shape, and it ships in the same release.

### 3e. Dead structure

- `Photo.bookingId` — 0 rows, 0 code references, no relation ever declared. Drop.
- `Visit.customerId` and its `Customer?` relation — 0 rows, never written; the customer
  attaches to the Booking. Drop.

Both were deliberately left intact during expand so contract had a single owner for them.

### 3f. Deprecated models — **not in this release**

`Material` (39 rows), `JobComponent` (31), `ServiceCategory` (13), `PricingRule` (0).

`PricingRule` is genuinely empty and could go. The other three still hold rows, and
dropping them destroys data whose supersession has not been *proven* — only assumed from
the fact that newer models exist and are used.

Each needs its own evidence first: that every row has a counterpart in the replacement
model, and that nothing reads the old one. That is a separate, smaller piece of work with
its own verification, and bundling it into the ownership contract would mean one
deployment whose failure modes are impossible to reason about separately.

> A model is safe to drop when its replacement is proven to hold everything it held, not
> when the replacement exists.

## 4. Ordering — one coordinated deployment

Per ADR-004 and the rule that came out of ADR-008, the destructive schema change and the
code that depends on it ship as **one event**, in this order:

0. **Rehearse** on a clone (or transactionally) — `npm run contract:rehearse`.
1. **Re-measure** every precondition — `npm run contract:preflight`. Any non-zero aborts.
   The preflight also reads the SOURCE, because two of the conditions are properties of
   the deployed code rather than the database: nothing may still touch the columns being
   dropped, and nothing may key a unique lookup on `jobberUserId` alone. A data-only
   preflight would pass while the running application still needed what was about to
   disappear — the exact ADR-008 failure.
2. **Deploy the contract-compatible code.** It must run against BOTH shapes. Already
   written and merged: the ArrivalWindow conflict retry (dead code until the constraint
   exists), and `verify-booking-tenancy.ts` no longer naming `Photo.bookingId`.
3. **Confirm the new code is healthy** against the still-expanded schema — smoke plus the
   full suite.
4. **Apply the database contract** — `prisma db push`.
5. **Create the OPEN-visit partial index and ASSERT it**, along with the ArrivalWindow
   constraint. Prisma cannot express a partial unique, so this is explicit raw SQL after
   the push, never a hope that something survived it.
6. **Verify:** `npm run verify`, live harness, booking-tenancy verifier, reconcile,
   production smoke.

Code-first means the old production code is never sitting on top of a newly contracted
database. The only window is step 4–5, where the new code briefly runs against a schema
that has contracted but has not yet grown its partial index — and the new code does not
depend on that index for correctness, only the database does for enforcement.

### Rollback

`NOT NULL` is reversible (`DROP NOT NULL`) and so are both new constraints. Dropped
columns are **not** — `Photo.bookingId` and `Visit.customerId` are the only irreversible
steps, and both are provably empty. If §3e is the only thing that worries anyone on the
day, it can be deferred to a follow-up at no cost to the rest.

## 5. Acceptance

- every precondition in §1 re-measured at 0 on the day
- all ten `contractorId` columns `NOT NULL` in the live schema
- the partial index and the ArrivalWindow constraint both **asserted present**, not assumed
- an adversarial insert proving each new constraint actually rejects: a second OPEN visit
  for the same (contractor, session), and a duplicate ArrivalWindow tuple
- crew sync still round-trips, on whichever implementation ships
- verify, live harness, booking-tenancy verifier, reconcile all green
- production smoke: storefront, visit GET/POST, availability, quote read, admin quote access
- reconcile 0-differing — no pricing path is touched by this release, so any movement
  means something unintended happened

After this lands, pass three is complete in the strong sense: the legacy single-tenant
schema assumptions are gone, not merely unused.


---

## Addendum — the rehearsal must build the application, 27 August

The pass-three contract caused a **25-minute production incident** that this plan's
rehearsal was supposed to prevent and did not.

**What happened.** The contract applied cleanly and every database check passed. But the
running production build's Prisma client had been generated from the *expanded* schema, so
it still selected `visits.customerId` — a column the contract had just dropped. `GET
/api/visit` returned 500 and the customer cart was down. The recovery deploy then failed
on **26 type errors**: contract made ten columns required, and a required column must
appear in every Prisma `create`, while the tenant guard's runtime stamping is invisible to
the compiler.

**Why the rehearsal missed it.** It proved *"can PostgreSQL accept this schema?"* and never
asked *"can the application we are about to deploy compile and build against it?"* Those
are different questions, and only the first was being answered.

**The permanent rule.**

> After the rehearsal database has been contracted, regenerate the Prisma client and run
> the full production build against the contracted schema — **after** the destructive
> changes, not only before. Building against the pre-contract schema is what every commit
> already does and proves nothing about the contracted one.

Implemented as step 8.5 in `scripts/contract-branch-rehearsal.sh`.

### The shape every future destructive migration follows

```
production clone
  -> parity gate (the clone must really mirror production)
  -> exact schema contract, via the real deployment mechanism
  -> regenerate the Prisma client
  -> verify the actual database catalog
  -> full gate and harness
  -> next build against the contracted state
  -> only then authorise production
```

Generalised, the lesson is the one this migration keeps re-learning in new costumes:
**a verification step proves exactly the question it asks, and it is easy to mistake a
narrow question that passes for a broad one.** The empty rehearsal branch passed "is this
not production?"; the DDL rehearsal passed "will Postgres accept this?"; neither was the
question that mattered.
