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
