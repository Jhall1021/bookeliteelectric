# Pass three — contract release plan

**Status:** plan only. Nothing here has been executed.
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

Once `contractorId` is non-null, Prisma will finally expose the compound unique as a
`whereUnique` selector — it refuses to today precisely because a null cannot identify a
row. The crew sync then converts from its transitional guarded `findFirst` → scoped
`update` / stamped `create` back to a single `upsert` keyed on the compound.

**This code change ships in the contract release**, because it depends on the contracted
schema. The transitional form is correct and can also simply stay; converting it is a
simplification, not a requirement.

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

1. **Re-measure** every precondition in §1. Any non-zero aborts the release.
2. **Merge the code** that depends on the contracted schema (crew-sync upsert,
   ArrivalWindow conflict retry) — held, not deployed.
3. **`prisma db push`** the contracted schema.
4. **Create the partial index** (§3c) and **assert both it and the ArrivalWindow
   constraint exist.**
5. **Deploy** the held code.
6. **Verify:** `npm run verify`, live harness, booking-tenancy verifier, reconcile,
   production smoke.

Steps 3–5 are the window where deployed code and schema disagree. It is unavoidable and
should be short; nothing in this release makes previously-valid code invalid, because the
runtime already writes every column contract is about to require.

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
