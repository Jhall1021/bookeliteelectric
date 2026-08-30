# Material supplier catalogs

How material costs are sourced, converted and propagated, and which rules must
not be broken when a supplier integration is added.

---

## The rule that matters most

**`Material.key` is a canonical role. It must never depend on supplier or
product identity.**

A service recipe says a dedicated circuit needs `WIRE_12_2`. It must never say
a dedicated circuit needs Lowe's item #12345.

```
WIRE_12_2  ("12/2 NM-B copper cable, per ft")
    Elite          -> Southwire 250 ft roll, from Lowe's
    Contractor B   -> Cerrowire, from a different supplier
    Contractor C   -> whatever their supply house stocks
```

Same recipe, same key, different product, different cost. The key names the
job the material does; the supplier link names the thing that fills it.

Not permitted in a key: a Lowe's item number, a manufacturer model, a UPC, a
brand, a package size. `WIRE_12_2` is right. `SOUTHWIRE_250FT_12_2` is not —
it bakes a product and a package into a role.

Everything else in this document follows from that separation.

---

## Two levels, not three

The direction doc describes three:

```
Canonical Material -> Contractor Material -> Supplier Product
```

The reasoning is right, and the eventual shape is probably that. It is not
built that way today. There are two physical levels:

```
Material -> MaterialSupplierLink
```

**Why.** With one contractor, Canonical and Contractor are the same row. The
third level would be a table in a 1:1 relationship with the one above it,
joined on every material read, seeded twice, and rendered in admin twice — to
express a distinction that has no second value in it. That is the premature
multi-tenancy the build order rules out.

**What we get anyway.** The separation that actually has to exist now is
*canonical role ≠ supplier SKU*, and two levels give that completely. Supplier
identity lives in `MaterialSupplierLink` and nowhere else.

**What it costs later.** Introducing `CanonicalMaterial` is a mechanical
migration: create rows from the distinct `Material.key` values, add one
foreign key, repoint `ServiceMaterial`. No pricing change, no data loss, no
rewrite. The only thing that would make it expensive is supplier identity
leaking into `Material.key` — which is why that rule is stated first and
repeated in the schema.

Revisit when there is a second contractor, not before.

---

## Package to unit

Materials are bought as packages and consumed as units. A 1000 ft box of Cat6
at $189.00 is used 25 ft at a time.

```
unitCostMilliCents = round(packagePriceCents * 1000 / packageQuantity)
unitCostCents      = round(unitCostMilliCents / 1000)
```

`Material.unitCostCents` stays an integer and stays the field the pricing
engine consumes. The engine is unchanged.

**Why the package figures are stored too.** $189.00 / 1000 ft is 18.9 cents,
which the integer column rounds to 19 — and 19 × 1000 back-computes the box to
$190.00. The price effect is pennies, far inside the $5 rounding tolerance and
not worth engineering around. The *disagreement* matters: without the package
figures, a rounding artifact and a real price rise look identical a year
later, and the admin displays a cost that contradicts the invoice in Josh's
hand.

So the package is the record and the unit cost is derived from it.

**Milli-cents, not micro-cents.** An `Int` column caps near 2.1 billion.
Micro-cents overflow above $21.47 a unit, which a panel or a fixture clears
easily. Milli-cents give three decimals on a cent and a ceiling past $21,000.

**Fail closed.** A zero or negative package quantity throws. A material with
no quantity has no unit cost, and defaulting it would push a wrong number into
every service using the part. Same principle as a broken tree going to review
rather than to a guessed price.

---

## Propagation

`Service.materialCostCents` is a **cache** of the service's itemized
materials. The pricing engine reads that cached number and never sums
`ServiceMaterial` rows itself.

So a cost only reaches a price if something recomputes the cache:

```
Material.unitCostCents
    -> recomputeServicesUsingMaterial()
    -> Service.materialCostCents
    -> pricing engine
    -> model / suggested price
    -> (a person publishes)
    -> published customer price
```

That recompute previously existed twice — inside `prisma/seed-materials.ts`,
and as a private `syncTotal()` in `app/api/admin/materials/route.ts`. Both
correct; neither reachable from anywhere else.

The consequence, had a supplier sync been written against that: the sync
updates `Material.unitCostCents`, no cache is recomputed, **no price moves**,
and `reconcile-prices.ts` reports every service still matching. Green, and
wrong. A silent no-op is worse than a failure, because a failure gets noticed.

`lib/materialCost.ts` is now the single implementation. The seed, the
Materials API and any future supplier sync call the same functions.

### What may write what

`lib/materialCost.ts` writes `Material` cost fields and
`Service.materialCostCents`. Both are pricing **inputs**.

It must never write `basePrice`, `whileWeThereBasePrice`, or any other
published customer price. Only the admin and named dated migrations may do
that — enforced at write time by `prisma/_priceGuard.ts`, and enforced at build
time by `scripts/audit-price-writers.ts`, which **exits non-zero** on a
violation and runs inside `npm run verify`. It must continue to report **0
files that can move a customer's price outside the admin**; since 27 August a
non-zero count fails the build rather than printing a warning. See ADR-003.

A cost change moving the model price while the published price stays put is
not a bug. That gap *is* the governance.

### What it deliberately does not touch

`materialMultiplier`. Clearing that legacy override is an itemization
decision — the moment a service's material figures become real — not
something that should happen every time a cost moves. The seed still clears it
at the point of itemizing.

Services with **no** itemized materials are left alone. Their flat
`materialCostCents` is a hand-entered allowance; zeroing it would quietly drop
material out of the price.

---

## Failure behavior

A failed refresh never changes a cost.

| Situation | Cost | Status |
|---|---|---|
| Refresh succeeds | updated | `OK` |
| API unreachable / auth failure | **unchanged** | `ERROR` |
| Product returns no price for the store | **unchanged** | `ERROR` |
| Product delisted | **unchanged** | `ERROR`, link `NOT_FOUND` |
| No successful sync inside the staleness horizon | **unchanged** | `STALE` |

Nothing customer-facing moves because a request timed out. `lastGoodPriceCents`
and `lastGoodAt` on the link retain the last figure that actually arrived.

---

## Supplier catalog vs contractor catalog

Two different things, kept apart.

**Supplier catalog** — the supplier's whole product universe. Browsed and
searched live, filtered by category so a search for "connector" returns
electrical fittings rather than garden hose. Never stored wholesale.

**Contractor catalog** — the ~40 parts actually used. One `Material` row per
canonical role.

**Never bulk-import.** A material is created or linked only when someone
selects a product they actually use. Mirroring a national retailer's
electrical department into the materials table turns a working catalog into
somebody else's inventory, and every seed and admin screen slows down to carry
parts nobody buys.

### Where the product boundary sits

Reading a supplier's catalog for cost and product selection is the price book
— core product. Showing "in stock at your store" while picking a product is
selection context and fine.

Stock tracking, purchase orders, reorder points, order history, per-job
material consumption: **not ours.** That is inventory management, and the
strategy rule applies — stop and ask whether we are recreating the FSM.

---

## Adding a supplier later

`COOPER`, `GRAYBAR`, `HOME_DEPOT`:

1. Add the value to the `MaterialSupplier` enum.
2. Write an adapter implementing the same interface.
3. Nothing else.

No change to `Material`, `ServiceMaterial`, or the pricing engine. That is the
whole reason supplier identity is routed through `MaterialSupplierLink` rather
than onto `Material`. If adding a supplier ever seems to require touching the
pricing engine, something has leaked and should be fixed rather than worked
around.

**No aggressive auto-matching**, especially for compatibility-sensitive parts
like breakers — a panel-incompatible breaker matched by name is a real hazard,
not a pricing error. Commodity items (wire, conduit, fittings, boxes, plates,
low-voltage rings) are the safer candidates when assisted matching is
eventually built.

---

## Cost events and the health check

Every cost movement writes a `MaterialCostEvent`: old and new cost, source,
reason, actor, sync run, and which services actually moved.

This exists because live costs change what `reconcile-prices.ts` means.

Today "0 prices differ from the model with no recorded reason" is a real
signal: costs are static, so any divergence is someone's mistake. Once costs
move on a cadence, divergence becomes the normal state — every supplier price
change shifts model prices while published prices correctly stay put. Within a
month the report would show twenty legitimate mismatches, and the number that
caught three real bugs would become noise people scroll past.

The events let the reconciler eventually separate:

- **explained** — diverged because 12/2 went up on 14 March, and
- **unexplained** — diverged and nobody knows why.

Only the second number has to be zero.

**That reconciler change is a separate drop.** It has not landed. Until it
does, the health check means exactly what it means today, and the events are
simply accumulating history for it to read.
