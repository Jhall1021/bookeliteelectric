# Pre-work site visit workflow — architecture inspection

**29 August 2026.** Inspection and recommendation only, per instruction.
Nothing built.

The question asked: **what is the smallest reusable change that represents this
cleanly, without a 200A-only path and without destabilizing normal bookings?**

---

## The blocker, before anything else

**There is no payment processing. At all.**

`app/api/checkout/route.ts` writes:

```ts
// Card-on-file, captured after completion — decided in the approved
// architecture. Real Stripe SetupIntent wiring is Phase 6; for now
// paymentStatus reflects that no charge has happened yet.
paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
paymentStatus: "pending_card_capture_setup",
```

24 bookings exist. **None has ever been charged**, and no code path can charge
one. `PaymentModel` is three enum values describing intent; `paymentStatus` is
a free-text string.

This matters more than it first appears, because a deposit is not a smaller
version of what is deferred — it is the opposite of it. Card-on-file *defers*
money until after the work. A deposit *takes* money before it. Step 4 of the
workflow is the one thing the current payment design was explicitly built not
to do yet.

**Consequence for sequencing.** The customer-facing copy promises *"A $249
deposit is required when booking."* Shipping that sentence without the ability
to take $249 would be a false statement on a booking page, so **the copy and
the payment capability must ship together.** Everything else in the workflow —
the visit, the scheduling, the prerequisite gating, Jobber — can be built and
proven before payment exists.

That is a real decision to make, not a detail: ship the pre-work visit workflow
first without a deposit, or hold the whole thing until payment lands.

---

## What exists

### The shape today

```
Visit (a cart)  --1:1-->  Booking  --N:1-->  ArrivalWindow
  |                          |
  +-- LineItem[]             +-- jobberJobId
                             +-- estimatedDurationMinutes
                             +-- status: SCHEDULED | COMPLETED | CANCELED
```

**`Booking` IS the appointment.** It carries `arrivalWindowId` (non-null),
duration, status and the Jobber job id directly. `visitId` is `@unique`, so one
cart produces exactly one booking, which is exactly one appointment.

The workflow needs **one booked job with two appointments**. That is the
structural change, and it is the only one that touches an existing model.

### The precedent worth copying

`TroubleshootingSession` already does most of what is being asked:

```prisma
model TroubleshootingSession {
  bookingId          String   @unique
  booking            Booking  @relation(...)
  minutesUsed        Int      @default(60)
  approvedIncrements Json[]
  resolvedIssue      String?
  followupServiceId  String?
}
```

A workflow record attached 1:1 to a booking, holding its own state, pointing at
what comes next — and **invisible to every booking that does not have one.**
That is precisely the "reusable workflow attached to an already-booked
fixed-price service" shape, and it is already in production.

### Service-level configuration does not exist

`Quote.depositRequired` and `Quote.depositCents` exist, but on **Quote**, with
the comment *"Decided at approval time, not at submission — larger jobs may
require one."* That is an office decision on one quote, not a property of a
service. Nothing on `Service` can say "this one always works this way".

### Jobber

`pushBookingToJobber` creates Client → Property → **Job**, one per booking, and
stores `jobberJobId`. 20 of 24 bookings are pushed.

Jobber's own model has **Jobs containing Visits**, which maps to this workflow
almost exactly — one Job, two Visits. The client does not create Visits today.
So this is additive work in `lib/jobber.ts`, not a re-model.

---

## Recommendation — three additive pieces

Nothing below changes the behavior of a service that does not opt in. That is
by construction, not by care: the defaults make every existing service take the
identical code path it takes now.

### 1. Service-level configuration

Five fields on `Service`, all defaulting to the current behavior:

```prisma
requiresPreWorkVisit                 Boolean @default(false)
depositCents                         Int?
depositCreditsToJob                  Boolean @default(true)
preWorkVisitMinutes                  Int?
installationRequiresPreWorkCompletion Boolean @default(true)
```

`requiresPreWorkVisit = false` on every existing row means the whole workflow is
unreachable until a service opts in. **A migration that cannot change behavior
is a migration that cannot break anything.**

`depositCents` on the service, not on the booking, is what makes it reusable —
"$249" becomes Elite's decision about two services rather than a constant.

### 2. An `Appointment` model, introduced additively

```prisma
model Appointment {
  id              String            @id @default(cuid())
  bookingId       String
  booking         Booking           @relation(...)
  kind            AppointmentKind   // PRE_WORK | INSTALLATION
  arrivalWindowId String
  arrivalWindow   ArrivalWindow     @relation(...)
  status          AppointmentStatus // SCHEDULED | COMPLETED | CANCELED
  completedAt     DateTime?
  jobberVisitId   String?
  @@index([bookingId, kind])
}
```

**Expand phase: `Booking.arrivalWindowId` stays exactly as it is.** Existing
bookings are untouched and unread-from differently. A pre-work booking writes
its first window to BOTH the legacy field and an `Appointment(kind: PRE_WORK)`,
then adds `Appointment(kind: INSTALLATION)` when the installation is scheduled.

Later, if it earns it, reads switch to `Appointment` and `Booking.arrivalWindowId`
contracts away. That is this codebase's own expand → backfill → verify → switch
→ contract discipline, and it means the risky part can be deferred until the
workflow has actually run a few times.

**The cheaper alternative, and why I do not recommend it:** add
`installationArrivalWindowId String?` to `Booking` and be done. It is two
fields instead of a model. But it makes `Booking.arrivalWindowId` mean
"installation" for most services and "pre-work visit" for two, which is a field
whose meaning depends on a flag on a different table. The third appointment
some job eventually needs then has nowhere to go.

### 3. A `PreWorkVisit` workflow record

Modelled on `TroubleshootingSession` — 1:1 on booking, holding what the visit
is *for* rather than when it is:

```prisma
model PreWorkVisit {
  bookingId       String   @unique
  booking         Booking  @relation(...)
  appointmentId   String?  // the PRE_WORK appointment, once scheduled
  completedAt     DateTime?
  findings        String?
  photos          Photo[]
  permitStartedAt DateTime?
  outOfScopeFound Boolean  @default(false)
}
```

`outOfScopeFound` is the field that enforces the pricing rule. **The visit does
not reopen the price**; only a genuinely out-of-scope condition does, and that
becomes a recorded event with a name rather than an adjustment somebody made.

---

## What this leaves unresolved, deliberately

**Deposit accounting.** "Credited toward the job" needs the deposit and the
final amount to be reconcilable — `$249 taken`, `$3,085 total`, `$2,836 due`.
`Booking.totalCents` is a single number today. This is straightforward but it
is real, and it belongs with the payment work rather than with the visit
workflow.

**Scheduling the second appointment.** The customer schedules the pre-work
visit at checkout. Who schedules the installation, and when? The flow says
*"after the required approvals are complete"*, which implies Elite does it,
which implies a portal surface that does not exist. Worth deciding before
building, because it changes whether `Appointment` needs a customer-facing
scheduling route or only an admin one.

**Checkout atomicity.** `verify-checkout-atomicity.ts` proves a failed checkout
leaves no orphaned Customer or ArrivalWindow. Adding an Appointment and a
PreWorkVisit to that transaction extends what has to roll back together — the
existing verifier should be extended in the same change, not after it.

---

## Answering the question asked

> the smallest reusable change needed to represent this cleanly

Two new models, one new enum pair, five defaulted fields on `Service`, and no
change to how an existing booking behaves. The generic workflow falls out of
`TroubleshootingSession`'s shape, which is already carrying a
service-specific workflow in production without special-casing anything.

**The 200A-only path is avoidable, and cheaply.** What is not avoidable is
payment: the deposit is the one part of this workflow with nothing underneath
it.
