# Sales tax at checkout

**Status:** proposed. Nothing implemented, and **no Stripe Tax Transaction is
created in V1** — see "What we deliberately do not do".

## The rule

Every Price2Book service price is **pre-tax**. Tax is calculated at checkout
against the service address, shown as its own line, and added to the project
total before the homeowner confirms.

```
Service subtotal      $2,155.00
Sales tax               $142.77
Project total         $2,297.77
Deposit due today       $249.00
Remaining balance     $2,048.77
```

The contractor's approved price stays $2,155.00 and does not move when a rate
changes. `basePrice` and the publication/approval semantics are untouched — tax
is never a property of a service.

## What the architecture forces

**Charges are DIRECT, on the contractor's connected account.**
`lib/paymentGateway.ts` passes `connectedAccountContext(args.stripeAccountId)`
to every PaymentIntent call, so the contractor is the merchant of record. Tax
registrations, tax settings and the resulting filings belong to the
**connected account**, and every Stripe Tax call must carry the same
`stripeAccount` header as the charge it belongs to. A calculation made on the
platform account would be the wrong entity's tax.

**The deposit is authorized before the local transaction**, with
`capture_method: "manual"` and `payment_method_types: ["card"]`. Tax must
resolve *before* that authorization, because it changes what the homeowner is
agreeing to — and it must not change the authorized amount.

**The ledger is append-only and arithmetic-only.** `lib/paymentLedger.ts` is a
pure function: `adjusted due = booked total + additions − credits`, and
`remaining = adjusted due − net paid`. It has no concept of tax and should not
grow one; it needs to be handed a figure that already includes tax.

## What we deliberately do not do

Stripe's current PaymentIntent integration **can** link a Tax Calculation
directly to a PaymentIntent and create the Tax Transaction automatically when
that PaymentIntent succeeds. We are not using that, on purpose.

Our calculation covers the **full project** — subtotal, tax, total — while the
PaymentIntent captures **only the deposit**. Stripe does not scale the tax
transaction down to the captured amount, so linking the full-project
calculation to a $249 deposit would recognize the entire project's tax against
a partial payment. That is a filing error created by an integration
convenience, and it is exactly the shape of defect that produces no symptom
until someone reconciles months later.

So in V1: **the calculation is made and snapshotted; no transaction is
created.** When tax is legally recognized and collected, relative to the
deposit and the final balance, is a tax-policy question that has to be answered
before any transaction is written — not discovered from whichever Stripe helper
was easiest to call.

## Data model

### Booking — the commercial snapshot

`Booking.totalCents` keeps its meaning, **the pre-tax subtotal**. That is what
the existing rows hold, so nothing is migrated or reinterpreted.

| field | meaning |
| --- | --- |
| `taxCents Int?` | tax on the subtotal at booking. `null` = never evaluated, `0` = evaluated and none due — the distinction `depositDueCents` already draws |
| `totalWithTaxCents Int?` | what the homeowner agreed to pay in total |
| `taxCalculationId String?` | the Stripe Tax Calculation this came from — the audit trail, and what a future transaction would be created from |
| `taxCalculatedAt DateTime?` | when it was calculated. Needed because **calculations expire after 90 days**, and a job whose balance is collected later needs that fact visible rather than inferred from `createdAt` |

`taxCents` and `totalWithTaxCents` are both stored rather than one derived from
the other. Recomputing a total from a rate at read time is how an agreed figure
drifts, and the point of a snapshot is that it does not.

No `taxTransactionId` yet. Adding a column for a thing we have decided not to
create would invite someone to fill it in.

`depositDueCents` is unchanged. Remaining balance stays derived —
`totalWithTaxCents − net paid` — so there is no fifth field to fall out of step.

### Contractor — tax settings

```prisma
enum TaxMode {
  OFF        // not registered, or not collecting. No tax line is shown.
  AUTOMATIC  // Stripe Tax calculates from the service address.
}
```

`Contractor.taxMode TaxMode?` — null means undeclared, a readiness blocker
rather than a default, for the same reason `schedulingAuthority` is: guessing
produces either an unlawful undercharge or a charge nobody owes.

**No MANUAL mode.** A single statewide rate is wrong in most of the US — New
Jersey being nearly flat is the kind of local accident that makes a bad rule
look correct on the first tenant — and a per-jurisdiction rate table is a
liability someone has to keep current. Automatic Stripe Tax only.

## Checkout sequence

Into `app/api/checkout/route.ts`, between the service-area check and the deposit
authorization:

1. Service area, arrival window, `reserveWindow` — unchanged. Nothing costs
   money yet.
2. Pre-tax project subtotal from the visit's line items — unchanged.
3. **Tax.** `OFF` → `taxCents = 0`. `AUTOMATIC` → one
   `stripe.tax.calculations.create` on the connected account, with the service
   address as `customer_details.address` and `address_source: "shipping"` (the
   work happens at the home, not at the payer's billing address), one line item
   per visit line with its own reference and tax code.
4. **Show the whole picture, then take the deposit.** Subtotal, tax, project
   total, and deposit due today as a separate line — all before the homeowner
   confirms.
5. Authorize **only the configured deposit**. The calculation is *not* attached
   to that PaymentIntent.
6. Write the booking in the same transaction as today, snapshotting `taxCents`,
   `totalWithTaxCents`, `taxCalculationId` and `taxCalculatedAt`.

A tax failure is **fail-closed and retriable**, like `SCHEDULING_UNAVAILABLE`:
nothing is charged and the homeowner retries. It must never fall back to zero
tax — charging no tax because a call timed out is a filing problem discovered
months later, the worst version of a failure with no symptom.

Because tax resolves before the authorization, it sits on the side of the
ordering where failure costs a retry rather than a charge — the same place the
availability revalidation was deliberately put.

## Open questions that need a business answer, not a technical one

**1. When is tax legally recognized and collected?** Deposit time, completion,
or split across both. This decides when a Tax Transaction is created and is the
reason none is created yet.

**2. Calculations expire after 90 days.** A job booked in March whose balance is
collected in July has a snapshot that can no longer produce a transaction. The
options are to recalculate at collection and honor the *original* total anyway
(the contractor absorbs a rate change), to recalculate and charge the
difference (the homeowner's total moves after they agreed to it), or to
recognize tax earlier so the window never matters. This is a policy choice with
a real cost either way and it should not be settled by whichever is easiest to
code.

**3. Rate changes inside the window.** Same question in a shorter timeframe, and
the same principle applies as with prices: the figure the homeowner agreed to
should not drift underneath them.

**4. How adjustments are taxed.** `BookingAdjustment` ADDITION and CREDIT change
the subtotal after the fact, and a $200 addition in a taxed jurisdiction adds
more than $200 to what is owed. Every line on one booking ships to one address,
so an effective rate snapshotted at booking is exact for that address — **unless**
line items carry different tax codes taxed differently there (labor versus
materials is the common case), where a blended rate is wrong for an adjustment
that is all one or all the other. Safe: a fresh calculation per adjustment.
Cheap: the snapshotted effective rate. Decide against how tax codes actually get
assigned in step 3 above.

## Prerequisites to verify before building

- Stripe Tax is enabled and the connected account has registrations for the
  jurisdictions it works in. A calculation against an account with no
  registration returns zero tax, which is indistinguishable from `OFF` at the
  call site and must not be treated as success.
- The tax codes to send per line item. Electrical labor and supplied materials
  are not always taxed alike, and sending one generic code is a correctness
  decision disguised as a default.
- That destination-based sourcing (`address_source: "shipping"`) is right for
  the jurisdictions in scope. It is the assumption the whole calculation rests
  on.
