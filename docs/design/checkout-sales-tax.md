# Sales tax at checkout

**Status:** proposed, not implemented. Written after inspecting the current
Stripe Connect direct-charge + PaymentIntent flow.

## The rule

Every Price2Book service price is **pre-tax**. Tax is calculated at checkout
against the job address, shown as its own line, and added to the project total
before the homeowner confirms.

```
Service subtotal      $2,155.00
Sales tax               $142.77
Project total         $2,297.77
Deposit due today       $249.00
Remaining balance     $2,048.77
```

The contractor's approved price stays $2,155.00 and does not move when a rate
changes. `basePrice` and the publication/approval semantics are untouched —
tax is never a property of a service.

## What the current architecture forces

Four facts from the code, each of which rules something out.

**1. Charges are DIRECT, on the contractor's connected account.**
`lib/paymentGateway.ts` passes `connectedAccountContext(args.stripeAccountId)`
to every PaymentIntent call, so the contractor is the merchant of record. Tax
registrations, tax settings and the resulting filings therefore belong to the
**connected account**, not the platform, and every Stripe Tax call has to carry
the same `stripeAccount` header as the charge it belongs to. A calculation made
on the platform account would be the wrong entity's tax.

**2. `automatic_tax` is not available on PaymentIntents.** It exists on Checkout
Sessions, Invoices and Subscriptions — none of which this flow uses. Automatic
mode therefore has to call the **Tax Calculation API** explicitly
(`stripe.tax.calculations.create`) and later record a transaction from that
calculation. This is the single biggest constraint and it is why tax cannot be
switched on as an option flag.

**3. The deposit is authorized BEFORE the local transaction**, with
`capture_method: "manual"` and `payment_method_types: ["card"]`. Tax must
therefore be resolved *before* the authorization, because it changes what the
homeowner is agreeing to — but it must not change the authorized amount. The
$249 deposit stays $249; tax is collected in the balance.

**4. The ledger is append-only and arithmetic-only.** `lib/paymentLedger.ts` is
a pure function: `adjusted due = booked total + additions − credits`, and
`remaining = adjusted due − net paid`. It has no concept of tax and should not
grow one. It needs to be handed a figure that already includes tax.

## Data model

### Booking — the commercial snapshot

`Booking.totalCents` keeps its current meaning, **the pre-tax subtotal**. That
is what the 25 existing rows hold, so nothing has to be migrated or
reinterpreted. Four fields are added beside it:

| field | meaning |
| --- | --- |
| `taxCents Int?` | tax on the subtotal at booking. `null` = never evaluated, `0` = evaluated and none due — the same distinction `depositDueCents` already draws |
| `totalWithTaxCents Int?` | what the homeowner agreed to pay in total |
| `taxCalculationId String?` | the Stripe Tax Calculation this came from, for auditability and for creating the transaction later |
| `taxTransactionId String?` | set once tax is actually recorded as collected; needed to reverse on refund |

`taxCents` and `totalWithTaxCents` are both stored rather than one derived from
the other. Recomputing a total from a rate at read time is how an agreed figure
drifts, and the whole point of a snapshot is that it does not.

`Booking.depositDueCents` is unchanged. Remaining balance stays derived —
`totalWithTaxCents − net paid` — so there is no fifth field to fall out of step.

### Contractor — tax settings

```prisma
enum TaxMode {
  OFF        // not registered, or not collecting. No tax line is shown.
  AUTOMATIC  // Stripe Tax calculates from the job address.
  MANUAL     // contractor-maintained rates. See the caveat below.
}
```

`Contractor.taxMode TaxMode?` — null means undeclared, which is a readiness
blocker rather than a default, for the same reason `schedulingAuthority` is:
guessing produces either an unlawful undercharge or a charge nobody owes.

**MANUAL is modeled but should not ship in V1.** A single statewide rate is
wrong in most of the US — New Jersey happens to be close to flat, which is
exactly the kind of local accident that makes a bad rule look fine on the first
tenant. A defensible manual mode needs rates resolved per jurisdiction from the
job address, which is a rate table someone has to maintain and keep current;
that is a liability, not a feature. Recommendation: ship `OFF` and `AUTOMATIC`,
keep `MANUAL` in the enum so the shape is right, and refuse it at the settings
surface until there is a real rate source behind it.

## Checkout sequence

Tax slots into `app/api/checkout/route.ts` between the service-area check and
the deposit authorization:

1. Service area, arrival window and `reserveWindow` — unchanged. Nothing costs
   money yet.
2. Compute the pre-tax subtotal from the visit's line items — unchanged.
3. **Tax.** `OFF` → `taxCents = 0`. `AUTOMATIC` → one
   `stripe.tax.calculations.create` on the connected account, with the job
   address as `customer_details.address`, `address_source: "shipping"` (the work
   happens at the home, not at the payer's billing address), and one line item
   per visit line carrying its own `reference` and tax code.
4. **Show it, then take the deposit.** The homeowner sees subtotal, tax, total
   and deposit before confirming. The PaymentIntent amount is still
   `depositDueCents` — unchanged by tax.
5. Write the booking in the same transaction as today, snapshotting `taxCents`,
   `totalWithTaxCents` and `taxCalculationId`.

A tax failure is a **fail-closed, retriable condition**, like
`SCHEDULING_UNAVAILABLE`: nothing is charged and the homeowner is asked to try
again. It must never fall back to zero tax. Charging no tax because a call
timed out is a filing problem the contractor discovers months later, which is
the worst version of a failure with no symptom.

Because tax is resolved before the authorization, it sits on the side of the
ordering where a failure costs a retry rather than a charge — the same place
the availability revalidation was deliberately put.

## Interaction with the ledger

The ledger keeps its shape. Two changes, both narrow:

- `remainingBalanceCents` is handed `totalWithTaxCents` instead of
  `totalCents`. Its arithmetic is unchanged.
- **No new `PaymentEventKind`.** Tax is not a movement of money; it is part of
  the agreed figure. Inventing a `TAX` event would put a number in the ledger
  that no capture or refund corresponds to, and every reconciliation would then
  have to know to skip it.

Two open points that need deciding before implementation, not after:

**When is the tax transaction created?** `tax.transactions.createFromCalculation`
is what tells Stripe the tax was actually collected, and it is what feeds
filing. With a deposit now and a balance later, the honest moment is when the
full amount has been captured — not at booking, which would assert collection
that has not happened. That means the tax transaction is created in the capture
path, not the checkout path. **Stripe Tax calculations expire**, and the
expiry window needs to be confirmed against current Stripe documentation before
committing to this: if a calculation can go stale between booking and job
completion, the transaction has to be created earlier and reversed on
cancellation instead. This is the one design decision here that turns on an
external fact I have not verified.

**How are adjustments taxed?** `BookingAdjustment` ADDITION and CREDIT change
the subtotal after the fact, and a $200 addition in a taxed jurisdiction adds
more than $200 to what is owed. Every line on one booking ships to one address,
so an effective rate (`taxCents / subtotalCents`) snapshotted at booking is
exact for that address and can tax adjustments consistently without another
Stripe call — **unless** line items carry different tax codes that are treated
differently in that jurisdiction (labor versus materials is the common case),
in which case the blended rate is wrong for an adjustment that is all one or
all the other. The safe version is a fresh calculation per adjustment. The
cheap version is the snapshotted effective rate. This should be decided against
how tax codes actually get assigned in step 3 above.

## Prerequisites to verify before building

- Stripe Tax is enabled and the connected account has registrations for the
  jurisdictions it works in. A calculation against an account with no
  registration returns zero tax, which is indistinguishable from `OFF` at the
  call site and must not be treated as success.
- The tax codes to send per line item. Electrical labor and supplied materials
  are not always taxed the same way, and sending one generic code is a
  correctness decision disguised as a default.
- Whether the contractor's own address or the job address governs in the
  jurisdictions in scope. The proposal above assumes destination-based
  (`address_source: "shipping"`), which is right for work performed at a
  home in most US states — but it is an assumption, and it is the assumption
  the whole calculation rests on.
