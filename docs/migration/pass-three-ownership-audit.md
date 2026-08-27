# Pass three — ownership audit

**Date:** 2026-08-27
**Scope:** `Visit`, `LineItem`, `Booking`, `Quote`, `Customer`, `Photo`
**Status:** audit only. No schema change has been made. Nothing here is implemented yet.

The instruction for this pass was to audit the graph before touching the schema, and
not to assume the six names correspond to six identical migrations. They do not.
Two are ownership roots, three derive, one derives through no single path and needs a
column for a different reason than the roots do.

---

## 1. Verdict

| Model | Ownership | Mechanism | Why |
|---|---|---|---|
| `Visit` | **direct** | new `contractorId` column | ownership root — no required parent, and the lookup key must carry the contractor |
| `Customer` | **direct** | new `contractorId` column | ownership root — no parents at all; created before anything points at it |
| `LineItem` | derived | `["visit"]` | `visitId` required |
| `Booking` | derived | `["visit"]` | `visitId` required and `@unique` |
| `Quote` | derived | `["service"]` | only required owner-bearing parent; `visitId`/`lineItemId` are both optional **and null in live data** |
| `Photo` | **direct** | new `contractorId` column | three *alternative* optional parents — no single derivable path |

Four of the six do **not** get a `contractorId`. That was the point of auditing first.

---

## 2. Evidence, model by model

### Visit — direct

Parents: `customerId String?` (optional), and nothing else.

- `customerId` is **null on 33 of 33 rows** and is never written anywhere in the codebase.
  The customer attaches to the `Booking`, not the `Visit`. The relation is vestigial.
- **3 OPEN visits currently have zero line items.** So `lineItems` cannot serve as the
  ownership path even informally — the rows exist with nothing to derive from.
- Deriving from `lineItems` would be ambiguous by construction. It presumes every line
  item on a visit shares one contractor, which is precisely the invariant this pass has
  to *enforce* rather than assume.

**The decisive reason is a live cross-contractor defect.** Every open-visit lookup keys on
the session cookie alone:

```
app/api/visit/route.ts:59              findFirst({ where: { sessionId, status: "OPEN" } })
app/api/visit/route.ts:480             same
app/api/visit/while-we-there/route.ts:28   same
app/api/quotes/route.ts:101            same
app/api/checkout/route.ts:38           same
app/[site]/checkout/schedule/page.tsx:53   same
lib/visitContext.ts:22                 lineItem.count({ where: { visit: { sessionId, status: "OPEN" } } })
```

`lib/session.ts` issues one cookie, `elite_session_id`, with no contractor dimension.
A visitor who adds a service on Elite's storefront and then opens Contractor B's
storefront in the same browser reopens **Elite's visit**. `app/api/visit/route.ts:201`
rejects a *service* from the wrong contractor, but the visit row itself is shared, so the
cart bleeds across storefronts and the "while we're there" discount is decided by the
wrong contractor's first line item.

Fixing that means the lookup key becomes `(sessionId, contractorId, status)`. A key needs
a column. Visit is the ownership root of the booking flow.

*(Today this is latent, not exploited: there is one contractor. It becomes real traffic
the moment Contractor #2 has a storefront — which is why this pass gates that.)*

### Customer — direct

No parents. `visits`, `quotes`, `bookings` are all back-relations.

- Created **before** anything that could own it exists:
  `app/api/checkout/route.ts:182` creates the Customer, then the Booking at :206;
  `app/api/quotes/route.ts:99` creates the Customer, then the Quote at :129.
  At creation time there is nothing to derive from.
- **1 existing Customer has no visit, no booking, and no quote** — underivable even
  retroactively.
- `name` / `email` / `phone` are PII. A Customer row shared across contractors would be a
  cross-tenant privacy leak, and "the same homeowner books two contractors" is a
  legitimate scenario, not a conflict. One row per contractor is correct — the same
  reasoning that produced `ContractorCategory` under ADR-006.

### LineItem — derived via `["visit"]`

`visitId` is required. Once `Visit` carries `contractorId`, that is a single unambiguous
owner.

`serviceId` is *also* required and `Service` also carries `contractorId`. That is **not** a
second ownership source — it is a secondary tenant reference that must agree with the
first. Deriving from `visit` and separately asserting
`service.contractorId == visit.contractorId` keeps the check meaningful; deriving from
`service` would make it tautological and would let a foreign service silently redefine
whose visit it is.

### Booking — derived via `["visit"]`

`visitId` is required and `@unique` — one booking per visit, a clean single owner.

Two further required tenant references that must agree, not compete:
`customerId` → `Customer.contractorId`, and `arrivalWindowId` → ArrivalWindow (below).

### Quote — derived via `["service"]`

Both visit paths are optional in the schema, and **the live data proves they are actually
absent**, not merely nullable:

| | rows |
|---|---|
| `visitId` null | 1 of 2 |
| `lineItemId` null | 2 of 2 |
| **both** null — no visit path at all | **1** |

So neither can carry ownership. `serviceId` is required and `Service` carries
`contractorId`: it is the only stable enforceable owner.

`customerId` is required — a secondary reference that must match. Where `visitId` *is*
set, `visit.contractorId` must equal `service.contractorId`.

### Photo — direct, for a different reason than the roots

Three **alternative** parents, all optional:

| path | rows |
|---|---|
| `quoteId` | 4 |
| `lineItemId` | 2 |
| `bookingId` | **0** — never written or read anywhere in the codebase; a dead column, and it has no relation field either |
| all three null | 0 |
| `quoteId` and `lineItemId` both set | 0 |

The schema comment says exactly one of `quoteId` / `lineItemId` is populated, and the data
agrees. But "one of two, we don't know which" is not a derivation path:
`DERIVED_TENANT_MODELS` maps a model to exactly one relation path, and alternatives cannot
be expressed as one.

There is a second, independent reason. **Both live Photo write sites are nested writes
inside transactions**, and Prisma query extensions never intercept nested writes:

```
app/api/quotes/route.ts:134    photos: { create: [...] }   (nested inside quote.create)
app/api/visit/route.ts:291     tx.photo.createMany(...)
```

So the guard cannot police Photo writes under *any* classification. The owner has to be
written explicitly at both sites and proven by sweep rather than by extension.

---

## 3. Things this audit found that are not in the six

These block the pass and have to be resolved inside it.

1. **`ArrivalWindow.serviceAreaId` is a bare scalar with no relation field.**
   Prisma cannot traverse it, so derived ownership is impossible until the relation is
   declared. `ServiceArea` is tenant-owned (`contractorId`, 1 row, non-null). `Booking`
   *requires* `arrivalWindowId`, so a Booking's owner is only enforceable once
   ArrivalWindow's is. Declaring the relation and deriving via `["serviceArea"]` is the
   likely shape.

2. **`app/api/checkout/route.ts:90` — `db.serviceArea.findFirst({ where: { active: true } })`.**
   Correctly guarded, but takes the *first* active service area. A legacy singleton
   assumption that survives only because Elite has exactly one.

3. **`app/api/checkout/route.ts:140` — `prisma.jobberCrewMember.findMany`** on the raw
   client. `JobberCrewMember` is still in `PENDING_TENANT_SCOPE`; this would return every
   contractor's crew.

4. **Checkout's four writes are not in a transaction.**
   Customer (:182) → ArrivalWindow (:187/:191) → Booking (:206) → `visit.update` (:223).
   A failure part-way leaves an orphaned Customer and ArrivalWindow. The one existing
   ownerless Customer is consistent with this having already happened once.

5. **`ArrivalWindow` has no unique constraint** on `(date, startTime, endTime, serviceAreaId)`,
   yet :187 does find-or-create on exactly that tuple. Two concurrent checkouts can create
   duplicate windows and split the capacity counter.

6. **`Visit.customerId` and `Photo.bookingId` are both dead.** Never written, and
   null/zero in all live data. They belong in the contract phase, not carried forward.

---

## 4. Client adoption gap

All 60 top-level access sites use the **raw** `prisma` client — 54 directly, 6 via a raw
`$transaction` `tx`. Five of those files already establish tenant context and receive a
guarded client they then don't use:

| file | raw sites | has `withSite`/`withContractor` |
|---|---|---|
| `app/api/visit/route.ts` | 9 | yes (`db` unused for these) |
| `app/api/checkout/route.ts` | 7 | yes |
| `app/api/quotes/route.ts` | 4 | yes |
| `app/[site]/checkout/schedule/page.tsx` | 1 | yes |
| `app/api/visit/while-we-there/route.ts` | 1 | yes |

This is why `audit-unguarded-tenant-access.ts` currently reports **0 unexplained**: the six
models sit in `PENDING_TENANT_SCOPE`, so the sweep does not yet consider them tenant-owned.
Moving them into `TENANT_SCOPED_MODELS` / `DERIVED_TENANT_MODELS` is what makes all 60
sites visible to the sweep. The sweep is the work list; it is not evidence of safety today.

---

## 5. Migration ordering

Per the standing rule — *do not leave a destructive schema contract sitting ahead of
compatible deployed code* — the contract step and its code release ship as one deployment
event, not as two. This is the rule that came out of ADR-008, where a destructive change
landed ahead of the code and production cache writes failed silently for about forty
minutes.

Sequence:

1. **Expand** — add nullable `contractorId` to `Visit`, `Customer`, `Photo`; add the
   `ArrivalWindow.serviceArea` relation. Nothing reads it yet.
2. **Backfill** — Visit from its line items' service (and drop or re-key the 3 empty OPEN
   visits); Customer from its booking/quote (the 1 orphan needs an explicit decision, not
   a default); Photo from its quote or line item.
3. **Verify** — zero nulls, and no Visit whose line items span more than one contractor.
   Today both are clean: 0 mixed visits, 0 mismatched quotes.
4. **Switch reads and writes** — re-key the six session lookups to
   `(sessionId, contractorId, status)`, convert the 60 sites to the guarded client, write
   the owner explicitly at both nested Photo sites, add the same-tenant pair checks
   (`LineItem.service` ↔ `visit`, `Booking.customer`/`arrivalWindow` ↔ `visit`,
   `Quote.customer`/`visit` ↔ `service`).
5. **Contract** — `contractorId` non-null, drop `Visit.customerId` and `Photo.bookingId`,
   add the ArrivalWindow unique. Ships together with the code that depends on it.

Acceptance stays as set: schema-derived permanent sweep, zero unexplained tenant paths,
positive controls for both contractors, cross-tenant IDs failing in both directions,
nested and transaction behaviour proven rather than assumed, a Preview browser pass over
the customer-visible Visit/Quote/Booking flow, and a reconcile if any pricing-bearing path
is touched.

Contractor #2 does not take real traffic until this pass completes.
