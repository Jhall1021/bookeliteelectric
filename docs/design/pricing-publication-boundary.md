# The draft / approved / published boundary

**Status:** inspection and recommendation. Nothing implemented. 30 Aug 2026.

Raised because `publishedPriceApprovedAt` turned out to be dashboard
reporting while the storefront reads `basePrice` directly — so the stamp
looked decorative and calculating a price looked like publishing it.

## What is actually true today

The inspection changes the shape of the problem. **The boundary already
exists, and it is already correct — in one place.**

`PATCH /api/admin/services/[id]/pricing` has had it from the start:

```
action "save"     store the inputs. Published price untouched.
action "publish"  derive via suggestPrimaryPrice, write basePrice,
                  stamp publishedPriceApprovedAt.
```

That is exactly the intended lifecycle. The gap is not that the boundary is
missing. It is that **nothing enforces it**, so three other paths walk around
it.

### Leak 1 — a free-typed price, straight to the customer

`PATCH /api/admin/services/[id]` and `POST /api/admin/services` both accept
`basePrice` from the request body and write it to the customer-visible field:

```ts
basePrice: typeof basePrice === "number" ? basePrice : null,
```

`ServiceEditForm` and `NewServiceForm` post it as a typed dollar value. No
derivation, no inputs, no approval stamp. This is the real architectural
gap — a number somebody typed becomes the price a homeowner pays, and the
pricing engine never sees it.

### Leak 2 — the activation guard does not ask

§1.4 (`verify-public-pricing`) asks whether `basePrice` is non-null. It does
not ask whether anyone approved it. A price written by leak 1 satisfies the
guard completely.

### Leak 3 — approval never expires

The stamp records that someone approved a number once. Nothing notices when
the inputs behind it move. A material cost changed 64% during Phase F; a
service published before that would still show its old price with a valid
approval stamp and nothing anywhere saying the two had parted company.

## Recommendation

### The draft price should not be stored

The inputs are already on `Service` — `fieldLaborHours`, `materialCostCents`,
`requiresTechCount`, `permitAdminCents`. The draft price is a pure function of
them: `suggestPrimaryPrice(inputs, settings)`.

Storing it would create the second pricing system to avoid, and it would go
stale the moment a material cost moved — the exact defect above, with a
column to make it durable. **Derive the draft, store only the approval.**

So no new price column, and no storefront change:

| | |
|---|---|
| **draft** | derived on demand, never stored, never stale |
| **published** | `basePrice` — a snapshot of what was approved |
| **the boundary** | `publishedPriceApprovedAt` — when a human accepted that snapshot |

### Three changes make the stamp load-bearing

**1. Close leak 1.** Remove `basePrice` and `whileWeThereBasePrice` from the
general service PATCH and from service creation. The service editor shows the
published price read-only and links to the pricing tab. A price then has
exactly one way in, and it runs through the engine.

**2. Make the pair an invariant, in the database.** A service may not carry a
`basePrice` without a `publishedPriceApprovedAt`, or the reverse. A Postgres
CHECK constraint, not a convention — the same standard the append-only ledger
holds itself to. This is also what makes the chandelier defect
(`publishedPriceApprovedAt` with a null `basePrice`) structurally impossible
rather than something a script has to remember.

**3. Put it in the activation guard.** §1.4 becomes: *a public service shows a
real, approved starting price, or it is not public.* One clause, and leak 2
closes.

### And make approval mean something over time

`lib/pricingSettingsImpact.ts` already computes published-vs-derived for the
crew-rate impact confirmation. Reuse it, do not rebuild it:

- dashboard state: **Approved** vs **Approved — inputs changed since**
- a verifier that reports every service whose published price no longer
  matches what its inputs derive

Drift is not an error. A contractor may keep a price through a small cost
move. But it must be visible and re-approvable, or "approved" only ever
describes a moment nobody can locate.

### What this costs

One CHECK constraint. Two fields removed from one route and two forms. One
clause in §1.4. One drift verifier reusing existing comparison code. No new
pricing model, no schema duplication, no storefront churn.

### The state it makes illegal

`active: true, basePrice: null` — visible in the catalog with nothing in the
price slot. That is the rescue state, and making it illegal is the point;
`level-2-ev-charger` needs an explicit decision (price it, or take it out of
the catalog) rather than an allowlist entry that has outlived the sweep it
came from.

## Where this leaves the two pre-work services

They are still price-less and still on the rescue list. Once the boundary
exists they activate through the normal path: `save` inputs, `publish` to
derive and approve, guards pass, rescue entries removed. The $2,155.00 and
$3,085.00 stay derived by `suggestPrimaryPrice` and are never typed in.

`scripts/activate-prework-services.ts` is the interim path and the price-writer
audit already flags it — *"stamps its own approval"*. That flag is correct and
should stay until activation runs through the admin lifecycle instead.
