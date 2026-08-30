# Payment — architecture inspection

**29 August 2026.** Inspection only. Nothing built, no dependency added.

The framing that decides most of this, stated first because it changes the
answer to half the questions below:

> **This is the contractor's payment system.** Money moves from a homeowner to
> Elite. Price2Book facilitates it and never owns it. It is not, and must never
> share machinery with, the future system by which Price2Book bills contractors
> for the software.

---

## What exists today

**Nothing.** That is not shorthand — there is no payment dependency in
`package.json`, no field on `Contractor` naming a payment account, and no code
path that moves money. 24 bookings exist and none has been charged.

What exists is *intent*, recorded twice:

```prisma
enum PaymentModel {
  CARD_ON_FILE_CAPTURE_AFTER_COMPLETION   // standard flat-rate bookings
  TROUBLESHOOTING_CARD_ON_FILE
  REMOTE_QUOTE_NO_UPFRONT
}
```

```ts
paymentModel:  "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
paymentStatus: "pending_card_capture_setup",   // free-text String
```

`PaymentModel` is a decent enum describing *how a service is meant to be paid
for*. `paymentStatus` is a free-text column holding a sentence about a
mechanism that does not exist. **They are different kinds of thing wearing the
same clothes**, and separating them is most of the modeling work.

---

## 1. What creates a booking, and when

`POST /api/checkout`, in one transaction, after four gates that all run
**before** anything is written:

```
resolve site  ->  find visit (tenant-scoped)
  ->  refuse if any line item is unpriced
  ->  refuse if ZIP is malformed or outside a configured service area
  ->  TRANSACTION: Customer + ArrivalWindow (find-or-create) + Booking
  ->  retry ONCE on a unique violation (arrival-window race)
  ->  AFTER COMMIT, concurrent and non-blocking: Jobber push, confirmation email
```

Two properties matter for payment:

- **Nothing external happens inside the transaction.** The comment says why:
  *"a transaction held open across a network call holds database locks for as
  long as a third party takes to answer."* A Stripe call cannot go inside it.
- **The post-commit work is non-blocking by design.** A failed Jobber push
  leaves `jobberJobId` null and the admin retries. Payment cannot borrow that
  pattern — a booking that is committed but unpaid is not a recoverable
  annoyance, it is a job somebody may go and do for free.

## 2. Where the total lives

`Booking.totalCents`, computed as `sum(LineItem.computedPriceCents)` **before**
the transaction and never recomputed. `LineItem` carries the per-service price
plus the resolved crew-hours, crew count, access class and component keys, all
documented as immutable once written.

So the booked total is already a settled, auditable number. **Payment must
reconcile against it and must never write to it** — which is the schema
expression of "payment must not silently change published pricing".

## 3. Where a deposit transaction attaches

`Booking` is the natural parent: one booking, many payment events over time
(deposit authorized, deposit captured, final captured, partial refund). It
already anchors `TroubleshootingSession` and now `PreWorkVisit` on the same
one-to-many-workflows logic.

It should **not** attach to `LineItem`. A deposit is a commitment to the
project, not to a line, and splitting it across lines invents an allocation
nobody asked for.

## 4. `Service.depositCents` → booking-time intent

Straightforward for a single-service visit; the interesting case is a mixed
one. A pre-work service is now **primary-only** (`wwtLaborHours` is null, so
`visitPrimary` cannot demote it), but other services can still ride along:

```
200A service upgrade   $3,085   depositCents 24900
replace-standard-outlet  $260   depositCents null
                       -------
booked total           $3,345   deposit due  $249
```

**The deposit is the sum of `depositCents` across the visit's services**, which
degenerates correctly: no deposit-bearing service, no deposit. Computed at
checkout from the services actually on the visit, and **snapshotted onto the
booking** — the same discipline `LineItem` already follows, so a later change
to `Service.depositCents` cannot retroactively alter what somebody agreed to.

## 5. Reconciliation

```
booked total  −  captured  +  refunded  =  remaining balance
```

Three of those four are not fields — they are **sums over an event log**. The
recommendation is an append-only `PaymentEvent` table with `Booking.totalCents`
as the only stored figure, because:

- a mutable `amountPaid` column has to be correct after every partial refund,
  retry and dispute, and there is no way to check it against anything;
- an event log can be replayed, and disagreement between the log and a cached
  total is a detectable bug rather than an invisible one.

This codebase already prefers that shape: `SupportAccessEvent` and
`PricingSettingsChange` are both append-only records whose value is that they
cannot be edited into agreement.

## 6. Payment state without free-text

Two columns doing two jobs, plus the log:

```prisma
paymentModel   PaymentModel     // WHAT the arrangement is — keep, it is fine
paymentState   PaymentState     // WHERE it has got to — new enum, replaces the string
```

```prisma
enum PaymentState {
  NOT_REQUIRED          // REMOTE_QUOTE_NO_UPFRONT, and every booking today
  AWAITING_METHOD       // booking exists, no card yet
  DEPOSIT_AUTHORIZED    // held, not taken
  DEPOSIT_CAPTURED      // money moved; pre-work may proceed
  BALANCE_DUE           // work done, final capture outstanding
  SETTLED               // nothing owed either way
  FAILED                // a capture or authorization failed; retryable
  REFUNDED              // fully returned
}
```

`FAILED` and `REFUNDED` are states rather than absences, which is the whole
argument against the free-text column: `"pending_card_capture_setup"` cannot be
queried, cannot be exhaustively switched on, and cannot fail closed. An enum
can — the same way `PreWorkScopeState` makes an unrecognized value block.

## 7. Checkout atomicity

Today's transaction covers Customer + ArrivalWindow + Booking. It must grow to
cover **Appointment + PreWorkVisit + the payment record**, and
`verify-checkout-atomicity.ts` must be extended in the same change — it
currently proves that a failed checkout leaves no orphaned Customer or
ArrivalWindow, and that proof should name every row the transaction now writes.

**The Stripe call still cannot be inside it.** Which forces the ordering
question below.

## 8. Ordering, and the two failure directions

The safe sequence, and the reason for each step:

```
1. AUTHORIZE      Stripe PaymentIntent, manual capture, amount = deposit
                  No money has moved. Nothing is committed locally.
2. TRANSACTION    Customer + ArrivalWindow + Booking + Appointment(PRE_WORK)
                  + PreWorkVisit + PaymentEvent(DEPOSIT_AUTHORIZED)
                  Stores the PaymentIntent id.
3. CAPTURE        Take the deposit.
4. WEBHOOK        Stripe confirms; PaymentEvent(DEPOSIT_CAPTURED).
```

**Authorization succeeds, booking creation fails.** No booking, an
authorization holding money that was never earned. The route cancels the
intent; an uncanceled authorization expires on its own within days. **Nothing
is captured, so nothing has to be refunded** — which is the entire reason for
authorizing before writing rather than charging after.

**Booking created, capture fails.** The booking exists in `FAILED`, visible and
retryable. It must NOT be deleted: the customer believes they have booked, and
a silently vanished booking is worse than an unpaid one. The pre-work
appointment stays unscheduled until the state reaches `DEPOSIT_CAPTURED`.

**Webhook arrives before the transaction commits.** Real, and the reason the
PaymentIntent id must be generated first and carried into the transaction: the
webhook handler can then find nothing, log, and rely on Stripe's redelivery
rather than inventing a booking.

## 9. Must payment precede the pre-work appointment?

**Authorization, yes. Capture, not necessarily — but it should.**

The whole product argument for the deposit is that it converts an enquiry into
a commitment before Elite spends money on a permit and a truck roll. An
appointment created before the money is committed is the thing the deposit
exists to prevent.

Recommended: the appointment row is created in the transaction (so it is
atomic with the booking), but it is **not schedulable or pushed to Jobber**
until `DEPOSIT_CAPTURED`. That keeps the data model simple and puts the gate
where it belongs — on what the workflow does, not on what rows exist.

## 10. Stripe objects

Assuming Stripe. The shape is not Stripe-specific but the names are.

| need | object |
|---|---|
| deposit at booking | `PaymentIntent`, `capture_method: manual`, on the connected account |
| card on file for later | `SetupIntent` → `PaymentMethod` attached to a `Customer` |
| final capture | second `PaymentIntent` against the saved `PaymentMethod` |
| refund / cancellation | `Refund` on the captured intent; `cancel` on an uncaptured one |
| failed payment | intent `status`, plus webhooks for retry |
| the contractor's account | **Connect account** — see below |

**Connect, and specifically direct charges.** The homeowner is paying Elite,
not Price2Book. With direct charges the connected account is the merchant of
record: Elite's name on the statement, Elite's dispute, Elite's payout,
Elite's liability. Destination charges would make Price2Book the merchant of
record for every homeowner transaction in the country, which is a different
company than the one being built.

That means `Contractor` gains a `stripeAccountId` and an onboarding state, and
**Price2Book never holds the money.**

## 11. Contractor-owned vs platform-owned

| contractor owns | platform owns |
|---|---|
| the Stripe connected account | the Connect integration and onboarding flow |
| the customer relationship, disputes, refunds, payouts | the webhook endpoint and event log schema |
| `depositCents` — their economics, per service | the state machine and its gates |
| whether a service takes a deposit at all | that a deposit is credited, never a separate fee |

`PaymentEvent` and any payment record are **tenant-owned**, derived through
`Booking → Visit` — the same chain `Appointment` and `PreWorkVisit` now use.

## 12. Coexistence with Price2Book's own billing

**Two Stripe surfaces that share an SDK and nothing else.**

| | contractor payments | Price2Book billing |
|---|---|---|
| who pays | homeowner | contractor |
| who receives | contractor | Price2Book |
| Stripe account | contractor's **connected** account | Price2Book's **platform** account |
| Stripe Customer | the homeowner | the contractor |
| objects | PaymentIntent, SetupIntent, Refund | Subscription, Invoice, Price |
| webhook endpoint | separate | separate |

**They must not share a Customer object, a webhook handler, a status enum or a
table.** The failure mode if they do is not subtle — a contractor's overdue
software invoice becoming visible in, or worse entangled with, a homeowner's
deposit. Naming them `ContractorPayment` and `PlatformSubscription` from the
first commit costs nothing and prevents the conflation permanently.

## 13. What Jobber receives, and when

Today: Client + Property + Job, pushed after commit, non-blocking,
`jobberJobId IS NULL` meaning "committed here, not pushed yet".

For V1, recommended: **change nothing about what is pushed, and gate when.**
Push after `DEPOSIT_CAPTURED` rather than after commit for deposit-bearing
bookings. Jobber has its own invoicing, and pushing deposit amounts into it
before Price2Book's own accounting is proven would put two systems in
disagreement about money on day one.

The deposit becomes a Jobber concern when the contractor's books need it —
which is a real requirement, and a later one.

---

## The smallest reusable model

Four additions. None of them special-cases a service.

1. **`Contractor.stripeAccountId`** + onboarding state. Connect, direct
   charges.
2. **`Booking.paymentState`** (enum, replacing the free-text string) and
   **`Booking.depositDueCents`** (snapshotted at checkout from the services on
   the visit).
3. **`PaymentEvent`** — append-only, tenant-owned via `Booking → Visit`. Kind,
   amount, Stripe object id, occurred-at. Balance is a sum over this, not a
   column.
4. **Ordering**: authorize → transaction → capture → webhook, with the pre-work
   appointment gated on `DEPOSIT_CAPTURED`.

`PaymentModel` stays as it is. The `CARD_ON_FILE_CAPTURE_AFTER_COMPLETION` path
becomes `AWAITING_METHOD → BALANCE_DUE → SETTLED` with no deposit event, and
the deposit path adds two events to the same log. **Neither is a special case
of the other** — they are two sequences through one state machine, which is
what makes this reusable rather than a 200A feature.

## Suggested release boundaries

Not one change:

1. **Connect onboarding** — a contractor can connect a Stripe account. No
   charges. Provable on its own.
2. **The model** — `PaymentEvent`, `paymentState`, `depositDueCents`, dormant,
   with every existing booking mapped to `NOT_REQUIRED`.
3. **Deposit capture** — the authorize/transaction/capture path, on a test
   account, with the atomicity verifier extended.
4. **Activation** — the two panel services opt in and publish.

Step 2 can be built and proven the way the pre-work workflow was: dormant,
defaults making it unreachable, and a verifier that checks the dormancy rather
than asserting it.
