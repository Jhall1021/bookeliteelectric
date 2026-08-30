# Payment — architecture inspection

**29 August 2026.** Inspection only. Nothing built, no dependency added.

The framing that decides most of this, stated first because it changes the
answer to half the questions below:

> **This is the contractor's payment system.** Money moves from a homeowner to
> the contractor. Price2Book facilitates it and never owns it. It is not, and
> must never share machinery with, the future system by which Price2Book bills
> contractors for the software.

Written throughout in terms of *the contractor*, deliberately. Payments are
where this codebase most has to prove it is a platform rather than one
company's software with a template bolted on, and a document that reasons about
a named tenant would be evidence against that.

---

## Revised 29 August 2026, after review

Nine changes, six of them corrections rather than additions:

| | change |
|---|---|
| 1 | Connect **direct charges** confirmed as the architecture |
| 2 | tenant-specific language removed — this document reasons about *the contractor* |
| 3 | historical bookings become **`LEGACY_UNTRACKED`**, not `NOT_REQUIRED` |
| 4 | **`METHOD_READY`** added between card collection and completion |
| 5 | **at most one pre-work project per booking** in V1 |
| 6 | the balance formula was **wrong** — obligation and cash are two ledgers |
| 7 | `PaymentEvent` idempotent by unique constraint; webhook `account` is the tenancy authority |
| 8 | Connect readiness means **charges enabled**, not an id being present |
| 9 | release boundaries unchanged |

Items 3 and 6 were both cases of a model asserting something false. Mapping 24
historical bookings to "no payment required" would have said something untrue
about every one of them, permanently. And the first balance formula claimed a
refunded, canceled job still owed its full price.

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

### V1 rule: at most one pre-work project per booking

The sum is arithmetically fine and structurally ambiguous. `PreWorkVisit` is
1:1 on `Booking`, so two deposit-bearing services on one visit would mean two
projects, a $498 deposit, two permits, two verification visits — **and one
workflow record.** There is no correct behavior available; the model simply
has nowhere to put the second one.

So checkout refuses the combination, as a gate before the transaction alongside
the existing unpriced-line and service-area gates. Normal services still ride
along freely; only a second pre-work service is refused, and the customer is
told to book it separately.

**This costs nothing today.** The two trees are already mutually exclusive —
panel replacement's "I need more capacity" reroutes to the service upgrade, and
the upgrade's "same size, just old" reroutes back — so no customer can reach
both through the guided flow. The gate exists for the catalog path, and for the
day a third pre-work service is added by someone who does not remember this
paragraph.

## 5. Reconciliation — two ledgers, not one

The formula in the first draft was wrong, and it is worth showing how:

```
booked total − captured + refunded = remaining        ← WRONG
```

A $3,085 job, $249 deposit paid, then the job is canceled and the deposit
refunded:

```
$3,085 − $249 + $249 = $3,085 still owed
```

The homeowner owes nothing. The formula treats a refund as if it restored an
obligation, when a refund is a **cash movement** and cancellation is a change
to **what is owed**. Those are different facts and one ledger cannot hold both.

### What the customer owes, and what money moved

```
adjusted amount due  =  booked total  +  approved additions  −  approved credits
net paid             =  captures  −  refunds
remaining balance    =  adjusted amount due  −  net paid
```

The same cancellation, correctly: the cancellation records a **credit** of
$3,085, so `adjusted = 3085 + 0 − 3085 = 0`; the refund makes `net paid =
249 − 249 = 0`; `remaining = 0`. Both the obligation and the cash are accounted
for, separately, because they moved for different reasons.

### Two append-only tables

**`PaymentEvent`** — money moved. Authorization created, authorization
canceled, capture, refund. Every row corresponds to something Stripe did, and
carries the Stripe object that did it.

**`BookingAdjustment`** — what is owed changed. Addition or credit, an amount,
a reason, and who approved it. Every row corresponds to a **decision a person
made**, which is why it cannot be derived from the payment log: no amount of
looking at captures tells you whether a cancellation was agreed.

`Booking.totalCents` stays immutable and stays the original booked price. It is
never adjusted, because "what we sold them" and "what they currently owe" are
both worth being able to answer a year later.

### This is where the pre-work exception lands

`OUT_OF_SCOPE_REVIEW` → the customer approves additional scope → a
`BookingAdjustment` of kind `ADDITION`, with the approval recorded. The booked
price is not rewritten, the original promise stays legible, and the change has
a name and an approver.

**No change-order UI is being built now.** What is being built is a ledger that
can represent one honestly, so the eventual UI writes rows rather than needing
the accounting model rethought around it.

### Why append-only, again

A mutable `amountPaid` column has to be correct after every partial refund,
retry, dispute and cancellation, and there is nothing to check it against. Two
event logs can be replayed, and disagreement between a log and a cached total
becomes a detectable bug rather than an invisible one.

`SupportAccessEvent` and `PricingSettingsChange` are both already append-only
for the same reason.

## 6. Payment state without free-text

Two columns doing two jobs, plus the log:

```prisma
paymentModel   PaymentModel     // WHAT the arrangement is — keep, it is fine
paymentState   PaymentState     // WHERE it has got to — new enum, replaces the string
```

```prisma
enum PaymentState {
  /// Historical. A booking made before this system existed, whose payment
  /// happened — if it happened — outside it.
  ///
  /// NOT the same as NOT_REQUIRED, and the distinction is the point. All 24
  /// existing bookings carry a PaymentModel saying card-on-file was intended.
  /// Mapping them to "no payment required" would assert something false about
  /// every one of them, and the assertion would be permanent: nothing later
  /// could tell a genuinely free job from a job whose money was never tracked.
  LEGACY_UNTRACKED

  /// Genuinely nothing to collect. REMOTE_QUOTE_NO_UPFRONT, and any future
  /// arrangement where Price2Book is not in the money path at all.
  NOT_REQUIRED

  /// Booking exists, no payment method captured yet.
  AWAITING_METHOD

  /// A card is saved and usable, and the work has not been done. Days or weeks
  /// can pass here, which is why it is a state rather than an instant between
  /// two others.
  METHOD_READY

  /// Deposit held, not taken.
  DEPOSIT_AUTHORIZED
  /// Deposit taken. The pre-work visit may be scheduled and pushed.
  DEPOSIT_CAPTURED

  /// Work complete, final amount outstanding.
  BALANCE_DUE
  /// Nothing owed in either direction.
  SETTLED

  /// An authorization or capture failed. Retryable, and visible.
  FAILED
  /// Fully returned.
  REFUNDED
}
```

**Two sequences through one machine**, which is what makes this reusable rather
than a feature for two services:

```
normal      AWAITING_METHOD -> METHOD_READY -> BALANCE_DUE -> SETTLED
deposit     AWAITING_METHOD -> DEPOSIT_AUTHORIZED -> DEPOSIT_CAPTURED
                            -> BALANCE_DUE -> SETTLED
```

`METHOD_READY` exists because "the card is saved" and "the work is finished and
billable" are separated by however long the job takes to schedule. Collapsing
them would make `BALANCE_DUE` mean two things and leave no state that answers
"is this booking ready to be worked?"

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
a commitment before the contractor spends money on a permit and a truck
roll. An
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

**Connect, and specifically direct charges.** The homeowner is paying the
contractor, not Price2Book. With direct charges the connected account is the
merchant of record: the contractor's name on the statement, their dispute,
their payout, their liability. Stripe documents direct charges as the fit for a
SaaS platform enabling its customers to take payments, which is exactly this.

Destination charges would make Price2Book the merchant of record for every
homeowner transaction in the country, which is a different company than the one
being built.

That means `Contractor` gains a `stripeAccountId` and an onboarding state, and
**Price2Book never holds the money.**

## 10a. Connect implementation rules, locked

Direct charges put the money on the connected account, and that has consequences
the platform code has to respect rather than work around.

### Objects live on the connected account

`PaymentIntent`, `Charge`, `Customer`, `PaymentMethod` and `Refund` for
homeowner money exist **in the connected account's context**, not the
platform's. Platform-level visibility into them is limited by design.

**Every Stripe API call for homeowner money is made explicitly in the
connected-account context.** Not by convention, not by a default set somewhere
— explicitly, at the call site, so a call that forgets is a call that fails
rather than one that quietly reads the platform account.

### Webhooks: the account is the tenancy authority

Connect delivers connected-account activity with the connected account
identified on the event. So:

1. **Map `event.account` → contractor first.** Before any tenant data is read
   or written. An event whose account matches no contractor is logged and
   dropped, never guessed at.
2. **Never treat a contractor id in Stripe `metadata` as tenancy authority.**
   Metadata is useful for correlation and is attacker-influenceable in a way
   the account id is not. It may confirm what the account already established;
   it may never establish it.

This is the same rule the storefront already follows and states in
`app/api/services/[slug]/route.ts`: *"The site identifier the caller carries
decides the tenant. Resolving it from the requested resource would authorise
access to that resource using itself."* A metadata contractor id is exactly
that shape.

### Idempotency is a schema constraint, not a code path

```prisma
model PaymentEvent {
  stripeEventId String @unique   // webhook delivery identity
  ...
}
```

Stripe retries webhooks. A retry that creates a second capture row would
overstate `net paid` by the amount of a real payment, and nothing downstream
could tell it from a genuine second capture.

**A unique constraint makes the second insert fail rather than succeed.** The
handler catches the violation and returns 200 — the event was already
processed, which is exactly what Stripe should be told. Doing this with an
existence check instead would leave a race between the check and the insert,
and financial races are the kind that get discovered from a customer's
statement.

Outbound calls carry an **idempotency key** for the same reason in the other
direction: a retried capture must not take the money twice.

## 10b. Connect readiness is a capability, not an id

`stripeAccountId IS NOT NULL` means an account was created. It does not mean
the contractor can accept a card.

Stripe requires the connected account to have completed onboarding and to hold
an active payments capability before direct charges succeed. A contractor can
sit for days with an account that exists, onboarding incomplete, and charges
disabled.

So readiness is a **checked state, refreshed from Stripe**, and the launch gate
means:

```
connected  AND  onboarding requirements satisfied  AND  charges enabled
```

not "the column is populated". A booking flow that offers a deposit to a
homeowner whose contractor cannot accept it fails at the worst possible moment
— after the customer has committed and before anything is recoverable.

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

1. **`Contractor.stripeAccountId`** plus a refreshed readiness state —
   connected, onboarded, and charges actually enabled. Connect, direct charges.
2. **`Booking.paymentState`** (enum, replacing the free-text string) and
   **`Booking.depositDueCents`** (snapshotted at checkout). Existing bookings
   migrate to `LEGACY_UNTRACKED`, never `NOT_REQUIRED`.
3. **`PaymentEvent`** and **`BookingAdjustment`** — both append-only, both
   tenant-owned via `Booking → Visit`. One records money moving, the other
   records what is owed changing. `PaymentEvent.stripeEventId` is unique, so a
   webhook replay cannot duplicate a financial row.
4. **Ordering**: authorize → transaction → capture → webhook, with the pre-work
   appointment gated on `DEPOSIT_CAPTURED`.

`PaymentModel` stays as it is. The `CARD_ON_FILE_CAPTURE_AFTER_COMPLETION` path
becomes `AWAITING_METHOD → METHOD_READY → BALANCE_DUE → SETTLED` with no
deposit event, and
the deposit path adds two events to the same log. **Neither is a special case
of the other** — they are two sequences through one state machine, which is
what makes this reusable rather than a 200A feature.

## Suggested release boundaries

Not one change:

1. **Connect onboarding** — a contractor can connect a Stripe account. No
   charges. Provable on its own.
2. **The model** — `PaymentEvent`, `paymentState`, `depositDueCents`, dormant,
   with every existing booking mapped to `LEGACY_UNTRACKED` — never
   `NOT_REQUIRED`, which would assert something false about all 24 of them.
3. **Deposit capture** — the authorize/transaction/capture path, on a test
   account, with the atomicity verifier extended.
4. **Activation** — the two panel services opt in and publish.

Step 2 can be built and proven the way the pre-work workflow was: dormant,
defaults making it unreachable, and a verifier that checks the dormancy rather
than asserting it.
