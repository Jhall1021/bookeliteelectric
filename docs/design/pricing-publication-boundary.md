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

---

# Implemented — 30 Aug 2026

All three bypasses are closed, and the guard is outcome-aware.

## The guard now asks the right question

§1.4 was *"a public service shows a real starting price, or it is not
public"* — which treats **active** and **priced** as synonyms. It now asks
whether the service's own tree can deliver a homeowner to a fixed price
(`lib/activationOutcome.ts`), by walking every route the customer can take.
`bookingType` is a declaration; the tree is the behavior.

A route that would price on a service with no published price resolves
INVALID with *"has no published base price"*. That is not a broken tree — it
is a tree promising a price the service cannot deliver, and it counts as a
promise.

Result across the catalog:

| | |
|---|---|
| 58 | promise a price and show an approved one |
| 1 | resolves by quote or review, and owes no price |
| 2 | under an explicit, dated rescue |
| 4 | priced before the boundary existed, awaiting re-approval |

## `level-2-ev-charger` needs no exception, today

0 pricing routes, 36 review, 0 dead. It promises a quote and delivers a
quote, so under the outcome-aware rule it passes on its own merits and its
rescue entry has been removed. **The tree normalisation is still wanted, but
it is a quality goal, not a broken promise to a customer** — it was only ever
on that list because the old rule could not tell those apart.

The rescue mechanism now holds two entries, both for the pre-work services,
and both clear when those publish through the normal lifecycle. Nothing else
needs it.

## What the constraint found

`services_price_requires_approval` is installed `NOT VALID` — enforcing every
new write while leaving six pre-existing rows alone. Validate it with
`--validate` once the backlog clears.

It immediately exposed a latent bug. `template-update.ts` cleared
`publishedPriceApprovedAt` on adoption, under a comment saying *"the service
goes back to unresolved rather than publishing something nobody priced"* — but
left `basePrice` on the storefront. The service kept publishing exactly what
the comment said it must not, because nothing read the stamp. Adoption now
takes the price down with the approval.

## Drift: reported, never corrected

15 active services have published prices their inputs no longer derive —
mostly $250 → $255, and `new-coax-line` at $420 → $405. None was touched.
`verify-pricing-boundary` re-reads every published price after reporting and
fails if any moved.

## The bypass script is gone

`activate-prework-services.ts` was deleted rather than allowlisted. Once the
boundary exists, that script *is* the bypass it forbids, and the price-writer
audit said so. The two services will publish through the same action a
contractor uses.

**What that still needs:** `depositCents`, `requiresPreWorkVisit`,
`preWorkVisitMinutes`, `ctaLabel` and `preWorkCustomerNote` have no admin
surface yet. The pricing screen publishes a price; nothing yet configures a
deposit. That is the remaining gap between here and a legitimate activation.

## The hole inactive services were hiding — 30 Aug 2026

**Not enforced when tested, so it was closed.**

An answer option may reference another service, and is then priced from that
service's `basePrice` with `priceModifierCents` forced to zero. The two Elite
TV mounts work exactly this way: both `active: false`, both undiscoverable on
their own, and both offered inside two LIVE TV installations.

So their $200.00 and $125.00 were reaching homeowners with no approval behind
either — and §1.4 was green the whole time, because it walked active services
and checked each one's own price slot. **Inactive is not the same as
unreachable.**

The rule is now about price *sources* rather than services: everything a
customer route can put in front of someone must have been approved, including
what it reaches by reference. `unapprovedPriceSources()` is the whole change —
§1.4 collects each active service's referenced options and refuses any that
reaches an unapproved price.

Proven four ways, one of them end to end on real data: `--no-rescue` drops
both the rescue list and the approval backlog, and §1.4 then rejects
`tv-installation` and `tv-install-existing-location` by name, citing the
mounts rather than any price of their own.

The two live TV routes are covered by the same dated backlog the mounts are
on, so re-approving those two prices clears the routes with them.
