# A two-technician job consumes one job's worth of capacity

**Found:** 1 September 2026, while verifying scheduling for the Online Booking
marketing page. **Status:** open. **Deliberately not fixed** — the marketing
pass does not redesign the scheduler, and the page claims nothing that depends
on this being fixed.

## What was being checked, and what came back clean

The question was whether availability is computed from the *complete* visit
after all same-visit work is chosen. It is:

| Input | In the calculation? |
|---|---|
| The primary service | ✅ a line item on the visit |
| All accepted same-visit work | ✅ every line item is summed — `app/[site]/checkout/schedule/page.tsx` |
| Answer-driven duration changes | ✅ `branch.addScheduleMinutes`, `overrideEstimatedMinutes` — `lib/pricing.ts` |
| Component quantities | ✅ `c.addScheduleMinutes * quantity` |
| An incomplete estimate | ✅ fails closed — any line item without `estimatedMinutes` yields no duration at all |
| **The crew the combined visit needs** | ❌ **not an input** |

So there is **no duration gap**, and the ordering is sound: placement decides
what may share a visit, then scheduling decides which windows fit the resulting
work. The homeowner picks a window last, which is why While We're There™ needs
no remaining-window logic.

## The gap

`techCount` and `requiresTechCount` appear nowhere in
`lib/schedulingAvailability.ts`, `lib/nativeScheduling.ts` or `lib/jobber.ts`.
`windowAvailabilityForDay` receives `estimatedDurationMinutes` and nothing about
how many people the work needs.

The schema says this matters, in as many words — on `AnswerOption`:

> Technician count doubles both the labor hours and **the dispatch capacity
> consumed**, so it can't be a service-level constant.

The model's own example is TV Installation: 56–85 inches sets `techCount` 2
while calendar duration stays 90 minutes. Availability treats that visit exactly
like a one-technician 90-minute job.

**Effect.** Under NATIVE scheduling, capacity is a count of concurrent *jobs*, so
a contractor who can run three jobs at once is offered three, whether those jobs
need three technicians or six. Under EXTERNAL, every eligible crew member's
calendar is checked individually, but nothing requires two of them to be free
simultaneously for a two-technician job.

Nobody is over-booked in the calendar sense — the day still fits. The risk is
staffing: accepting more two-technician work in a window than there are people
to send.

## Why it was not fixed here

It is a scheduling-engine change with a capacity model behind it, found by a
marketing pass that must not redesign the scheduler. It also is not urgent for
the marketing site: `/product/online-booking` claims what the code does — that
windows are computed from the whole visit's duration and must finish inside the
working day — and claims nothing about crew size.

## What to decide when it is picked up

1. **Is NATIVE capacity a count of jobs or of crews?** The field is documented
   as concurrent jobs. If a contractor means "I have two vans", a two-technician
   job may cost more than one unit of it.
2. **Does EXTERNAL need pairing?** Requiring N simultaneously-free eligible crew
   members for a `techCount` of N is a different query from the one Jobber
   availability runs today.
3. **How common is it?** `overrideTechCount` is set on a small number of
   branches. Worth counting before sizing the work — the fix may matter for two
   services or for twenty.
