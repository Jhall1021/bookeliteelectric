# Configuration follow-ups

**29 August 2026.** Recorded during Payment Release #3 setup, deliberately not
acted on — neither blocks the release, and one of them is riskier than it
looks.

---

## 1. Regenerate `.env.example` from actual runtime requirements

**Safe, worthwhile, not urgent.**

The code reads **34** environment variables. `.env.example` documents **8**.
Twenty-three are missing, including several without which the application does
not start:

```
BETTER_AUTH_SECRET      BETTER_AUTH_URL
JOBBER_CLIENT_ID        JOBBER_CLIENT_SECRET
PLATFORM_RESEND_API_KEY PLATFORM_FROM_EMAIL     RESEND_API_KEY
APP_ORIGIN              STOREFRONT_ORIGIN       PLATFORM_WEB_ORIGIN
EXPECTED_DATABASE_IDENTITY                      WRITE_FREEZE
STRIPE_WEBHOOK_SECRET
```

The template holds names, never values, so regenerating it touches no secret.

**Why it matters more than tidiness.** Contractor #2's deployment gets
configured from that file, and Platform Admin's launch gate will eventually
want to answer "is this environment configured" — which is unanswerable while
"what does this application need" is documented only across 34 call sites.

The last two on that list make the point: `EXPECTED_DATABASE_IDENTITY` and
`WRITE_FREEZE` are **safety controls**, and an operator who does not know they
exist cannot set them.

Worth doing before Contractor #2, and derivable from the codebase rather than
from anyone's memory.

## 2. Do NOT rename `BOOKELITE_ROLLBACK_DATABASE_URL` yet

**Deliberately deferred.** It is the last BookElite name in live configuration
and it is ugly, and neither is a reason to touch it during payment work.

It points at a **rollback control** — the frozen archive a migration would fall
back to. Renaming a safety mechanism is exactly the kind of change that looks
free and is not: every reference has to be found first, including ones in
deployment configuration and runbooks that no code search will reach.

When it is done, it is its own change, after an audit of every reference, and
not while money is moving.

---

Neither of these blocks Release #3.

## Stripe Connect onboarding return URL — 404

**Raised:** 30 Aug 2026, during Release #4 scoping. **Owner decision:** do not
block Release #4 for it.

The return URL Stripe sends a contractor back to after Connect onboarding lands
on a 404. It does not affect homeowner booking — the contractor is already
onboarded and `connectReadiness()` is refreshed from Stripe rather than from
anything the return URL sets — so it changes nothing about Release #4.

It does matter before contractor onboarding becomes a real product workflow.
**Fix it during Guided Setup / Platform Admin, before a contractor who is not
Elite is asked to onboard themselves.** Today the only contractor who has been
through it was walked through it by hand.

## Checkout returns a blank 500 when Jobber is unreachable — PRE-PILOT BLOCKER

**Raised:** 31 Aug 2026, during the Deposit V1 browser proof. **Owner
decision:** carry forward explicitly; must be resolved before real customer or
pilot traffic. Deliberately NOT folded into Deposit V1.

`pickCrewForWindow` throws when Jobber's OAuth refresh fails, and
`POST /api/checkout` returns **500 with an empty body**. The schedule page
calls the same function and fails open; checkout does not. So a Jobber outage
means nobody can book at all, and what the customer sees is a blank failure
rather than an explanation.

No money is at risk — this happens before the deposit branch, so nothing is
authorized and nothing is captured. That is why it was not treated as a
payment defect.

**What needs deciding, not just fixing:** failing open risks double-booking a
crew; failing closed stops all bookings. The schedule page and checkout
currently answer that question differently, which is the actual defect —
whichever answer is right, both should give it.

`JOBBER_LOCAL_STUB=1` exists only so local Stripe proofs can run. It is gated
on the flag AND on not being a production build, because "pretend the calendar
is empty" is exactly the assumption that double-books a crew.
